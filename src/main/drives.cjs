const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
async function directories(parent) {
  try { return (await fs.readdir(parent, { withFileTypes: true })).filter(x => x.isDirectory() && !x.name.startsWith('.')).map(x => ({ path: path.join(parent, x.name), label: x.name })); }
  catch { return []; }
}
async function detectDrives(platform = process.platform) {
  if (platform === 'win32') {
    // Some USB card readers identify as fixed drives: include those when DCIM is present.
    const script = 'Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 -or ($_.DriveType -eq 3 -and (Test-Path ($_.DeviceID + "\\DCIM"))) } | Select-Object DeviceID,VolumeName | ConvertTo-Json -Compress';
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 6000, windowsHide: true });
    const parsed = JSON.parse(stdout.trim() || '[]');
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean).map(x => ({ path: `${x.DeviceID}\\`, label: x.VolumeName || `Card ${x.DeviceID}` }));
  }
  if (platform === 'darwin') return (await directories('/Volumes')).filter(x => x.label !== 'Macintosh HD');
  const username = os.userInfo().username;
  const roots = await Promise.all([directories(`/media/${username}`), directories(`/run/media/${username}`), directories('/media')]);
  return [...new Map(roots.flat().filter(x => x.label !== username).map(x => [x.path, x])).values()];
}
async function listMediaDirectory(directory) {
  const { VIDEOS, IMAGES } = require('./store.cjs');
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const visible = entries.filter(x => !x.name.startsWith('.') && (x.isDirectory() || (x.isFile() && (VIDEOS.has(path.extname(x.name).toLowerCase()) || IMAGES.has(path.extname(x.name).toLowerCase()))))).slice(0, 2000);
  const rows = await Promise.all(visible.map(async x => {
    const p = path.join(directory, x.name);
    const stat = await fs.stat(p).catch(() => null);
    return stat ? { name: x.name, path: p, directory: x.isDirectory(), bytes: stat.size, modified: stat.mtimeMs } : null;
  }));
  return rows.filter(Boolean).sort((a, b) => Number(b.directory) - Number(a.directory) || b.modified - a.modified || a.name.localeCompare(b.name, undefined, { numeric: true }));
}
module.exports = { detectDrives, listMediaDirectory };
