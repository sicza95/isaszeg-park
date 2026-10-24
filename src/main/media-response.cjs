const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { Readable } = require('node:stream');
const path = require('node:path');

const types = { '.mp4':'video/mp4', '.m4v':'video/mp4', '.mov':'video/quicktime', '.webm':'video/webm', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp' };

// Advertise and serve byte ranges explicitly. File-fetch responses on Windows
// can expose a zero-length seekable range to Chromium's custom-scheme player.
async function mediaResponse(file, request) {
  const { size } = await fs.stat(file);
  const headers = { 'Content-Type':types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges':'bytes', 'Content-Length':String(size) };
  const range = request.headers.get('range');
  let start = 0, end = size-1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
    if (!match[1]) start = Math.max(0,size-Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end,Number(match[2])); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start<0 || start>end || start>=size) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    headers['Content-Length'] = String(end-start+1);
  }
  const body = request.method === 'HEAD' || !size ? null : Readable.toWeb(createReadStream(file,{start,end}));
  return new Response(body,{status:range?206:200,headers});
}
module.exports = { mediaResponse };
