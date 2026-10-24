const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') { res.writeHead(302, { Location: '/src/renderer/index.html' }).end(); return; }
  const relative = decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(root, relative);
  const referenceVideo = path.dirname(file) === path.join(root, 'local-assets') && /^Race [123] CGRC Trophy - S[23] 275m - Greyhounds Isaszeg \((480|360)p\)\.mp4$/.test(path.basename(file));
  if (!referenceVideo && !['src/renderer', 'src/shared', 'assets'].some(dir => file.startsWith(path.join(root, dir) + path.sep))) { res.writeHead(404).end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    let start = 0, end = stat.size - 1;
    if (req.headers.range && !match) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
    if (match) { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); if (start > end) { res.writeHead(416).end(); return; } headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`; }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(match ? 206 : 200, headers);
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
  });
});
const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => console.log(`Browser demo: http://127.0.0.1:${port}/\nDesktop features require npm start.`));
