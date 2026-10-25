const { app, BrowserWindow, ipcMain, dialog, screen, protocol, net, Menu, powerSaveBlocker, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { MeetingStore, localDate, validDate, atomicJSON } = require('./store.cjs');
const { detectDrives, listMediaDirectory } = require('./drives.cjs');
const { mediaResponse } = require('./media-response.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'replay', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
const PROJECT = path.resolve(__dirname, '../..');
const UI = 'replay://app/src/renderer/';
let control, output, store, date = localDate(), drives = [], busy = false, selectedDisplay, outputVisible = false;
let poller, blocker, configFile, polling = false;
const roots = new Set(); const mediaFiles = new Map();
function send(window, channel, value) { if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(channel, value); }
function broadcast(channel, value) { send(control, channel, value); send(output, channel, value); }
function displayInfo() { return screen.getAllDisplays().map((d, i) => ({ id: d.id, label: d.label || `Display ${i + 1}`, primary: d.id === screen.getPrimaryDisplay().id, width: d.size.width, height: d.size.height })); }
async function snapshot() {
  const meeting = await store.load(date);
  mediaFiles.clear();
  for (const item of meeting.items) {
    if (item.file) { const token = `${date}/${item.id}`; mediaFiles.set(token, path.join(store.folder(date), item.file)); item.url = `replay://media/${token}`; }
    else item.url = `replay://app/assets/${item.builtin}.jpg`;
    item.mediaType ||= 'image';
  }
  return { meeting, root: store.root, displays: displayInfo(), drives, selectedDisplay, outputVisible, busy, desktop: true };
}
async function refresh() { const data = await snapshot(); broadcast('state', data); return data; }
function authorize(event, role = 'control') {
  const allowed = role === 'either' ? [control?.webContents.id, output?.webContents.id] : role === 'display' ? [output?.webContents.id] : [control?.webContents.id];
  if (!allowed.includes(event.sender.id) || event.senderFrame !== event.sender.mainFrame || !event.senderFrame.url.startsWith(UI)) throw new Error('This action is not available from this window.');
}
function handle(name, fn, role = 'control') { ipcMain.handle(name, async (event, ...args) => { authorize(event, role); return fn(...args); }); }
async function allowedPath(target) {
  if (typeof target !== 'string') throw new Error('Choose a media folder first.');
  const real = await fs.realpath(target);
  for (const root of roots) {
    const relative = path.relative(root, real);
    if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) return real;
  }
  throw new Error('Choose this folder with Browse first.');
}
function newWindow(options) {
  const window = new BrowserWindow({
    backgroundColor: '#000000', autoHideMenuBar: true,
    ...options,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', spellcheck: false }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', e => e.preventDefault());
  window.webContents.on('will-attach-webview', e => e.preventDefault());
  window.webContents.on('render-process-gone', (_, details) => {
    if (window === output && details.reason !== 'clean-exit') {
      outputVisible = false;
      send(control, 'output-status', { visible: false, error: 'The display stopped. Open it again to recover playback.' });
      window.destroy(); output = null;
    }
  });
  return window;
}
async function ensureOutput() {
  if (output && !output.isDestroyed()) return output;
  output = newWindow({ width: 1280, height: 720, show: false, title: 'Isaszeg Park · Audience display' });
  output.on('close', e => { if (control && !control.isDestroyed()) { e.preventDefault(); output.hide(); outputVisible = false; send(control, 'output-status', { visible: false }); } });
  await output.loadURL(UI + 'display.html');
  return output;
}
async function showOutput(displayId) {
  const window = await ensureOutput();
  const displays = screen.getAllDisplays();
  const target = displays.find(x => x.id === displayId) || displays.find(x => x.id !== screen.getPrimaryDisplay().id) || displays[0];
  selectedDisplay = target.id;
  window.setFullScreen(false);
  window.setBounds(target.bounds);
  window.show(); window.setFullScreen(true);
  outputVisible = true;
  // Keep the keyboard on the operator desk when the monitors are extended.
  if (target.id !== screen.getDisplayMatching(control.getBounds()).id) control.focus();
  await refresh();
}
async function pollDrives() {
  if (polling) return; polling = true;
  try {
    const found = await detectDrives();
    for (const d of found) { try { roots.add(await fs.realpath(d.path)); } catch {} }
    if (JSON.stringify(found) !== JSON.stringify(drives)) {
      const additions = found.filter(d => !drives.some(old => old.path === d.path));
      drives = found;
      send(control, 'drives', { drives, added: additions });
    }
  } catch (e) { send(control, 'drive-error', 'Automatic card detection is unavailable. Use Browse to select the card or folder.'); }
  finally { polling = false; }
}
async function boot() {
  configFile = path.join(app.getPath('userData'), 'settings.json');
  let config = {};
  try { config = JSON.parse(await fs.readFile(configFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') console.error('Settings could not be loaded:', e.message); }
  store = new MeetingStore(config.root || path.join(app.getPath('documents'), 'Isaszeg Replay'), { onProgress: value => send(control, 'import-progress', value) });
  // Validate before creating windows. A corrupt manifest is never silently replaced.
  await store.load(date);
  protocol.handle('replay', async request => {
    try {
      const url = new URL(request.url); let file;
      if (url.host === 'media') file = mediaFiles.get(decodeURIComponent(url.pathname.slice(1)));
      if (url.host === 'app') {
        const relative = decodeURIComponent(url.pathname.slice(1));
        if (!/^(src\/(renderer|shared)\/|assets\/)/.test(relative)) return new Response('Not found', { status: 404 });
        const candidate = path.resolve(PROJECT, relative);
        if (!['src/renderer', 'src/shared', 'assets'].some(dir => candidate.startsWith(path.join(PROJECT, dir) + path.sep))) return new Response('Not found', { status: 404 });
        file = candidate;
      }
      if (!file) return new Response('Not found', { status: 404 });
      if (url.host === 'media') return await mediaResponse(file,request);
      const headers = {};
      if (request.headers.has('range')) headers.Range = request.headers.get('range');
      return await net.fetch(pathToFileURL(file).href, { method: request.method, headers });
    } catch { return new Response('Media unavailable', { status: 404 }); }
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^(https?|wss?):/.test(details.url) }));
  Menu.setApplicationMenu(null);
  control = newWindow({ width: 1480, height: 980, minWidth: 1040, minHeight: 740, title: 'Isaszeg Replay · Race desk' });
  control.on('closed', () => { control = null; app.quit(); });

  handle('init', async () => snapshot(), 'either');
  handle('meeting:open', async nextDate => { if (busy) throw new Error('Wait for the import to finish.'); validDate(nextDate); await store.load(nextDate); date = nextDate; return refresh(); });
  handle('meeting:dates', async () => (await fs.readdir(store.root, { withFileTypes: true })).filter(x => x.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(x.name)).map(x => x.name).sort().reverse());
  handle('registration:save', async data => { await store.saveRegistration(date, data); return refresh(); });
  handle('registry:save', async data => { await store.saveRegistry(data); return refresh(); });
  handle('item:patch', async (id, patch) => { await store.patchItem(date, id, patch || {}); return refresh(); });
  handle('replay:rate', async edit => {
    validDate(edit?.date);
    await store.patchItem(edit.date,edit.id,{replayRate:{id:edit.sectionId,rate:edit.rate}});
    if(edit.date===date)await refresh();
  }, 'display');
  handle('item:remove', async id => { if (busy) throw new Error('Wait for the import to finish.'); await store.removeItem(date, id); return refresh(); });
  handle('items:reorder', async ids => { await store.reorder(date, ids); return refresh(); });
  handle('settings:patch', async patch => { await store.patchSettings(date, patch || {}); return refresh(); });
  handle('folder:choose', async () => {
    const result = await dialog.showOpenDialog(control, { title: 'Choose an SD card or media folder', properties: ['openDirectory'] });
    if (result.canceled) return null;
    const directory = await fs.realpath(result.filePaths[0]); roots.add(directory); return directory;
  });
  handle('folder:list', async directory => { const real = await allowedPath(directory); return { directory: real, parent: roots.has(real) ? null : path.dirname(real), entries: await listMediaDirectory(real) }; });
  handle('files:choose', async kind => {
    const result = await dialog.showOpenDialog(control, { title: kind === 'race' ? 'Choose race recordings' : kind === 'ad' ? 'Choose sponsor content' : 'Choose banners and holding slides', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Media', extensions: kind === 'race' ? ['mp4', 'mov', 'm4v', 'webm'] : ['mp4', 'mov', 'm4v', 'webm', 'jpg', 'jpeg', 'png', 'webp'] }] });
    if (result.canceled) return [];
    for (const file of result.filePaths) roots.add(await fs.realpath(path.dirname(file)));
    return result.filePaths;
  });
  handle('files:import', async (files, kind, number) => {
    if (busy) throw new Error('An import is already running.');
    if (!Array.isArray(files) || files.length > 64) throw new Error('Select up to 64 files.');
    busy = true; await refresh();
    try { const safe = []; for (const file of files) safe.push(await allowedPath(file)); return await store.importFiles(date, safe, kind, number); }
    finally { busy = false; await refresh(); }
  });
  handle('root:choose', async () => {
    if (busy) throw new Error('Wait for the import to finish.');
    const result = await dialog.showOpenDialog(control, { title: 'Choose where to store race days', defaultPath: store.root, properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled) return null;
    const replacement = new MeetingStore(result.filePaths[0], { onProgress: value => send(control, 'import-progress', value) });
    await replacement.load(date);
    await atomicJSON(configFile, { root: replacement.root });
    store = replacement; mediaFiles.clear(); return refresh();
  });
  handle('folder:reveal', () => shell.openPath(store.folder(date)));
  handle('output:show', showOutput);
  handle('output:hide', async () => { output?.hide(); outputVisible = false; return refresh(); });
  handle('transport', async command => {
    if (!command || !['toggle', 'seek', 'scrub', 'next', 'previous', 'latest', 'holding', 'rate', 'cycle-rate', 'play', 'fullscreen', 'blackout', 'skip-racecard', 'jump-racecard', 'jump-replay', 'jump-results', 'jump-instant-replay'].includes(command.type)) throw new Error('Unknown playback command.');
    if (command.type === 'fullscreen') { if (outputVisible) output.setFullScreen(!output.isFullScreen()); else await showOutput(selectedDisplay); return; }
    await ensureOutput(); send(output, 'command', command);
  }, 'either');
  ipcMain.on('playback', (event, data) => {
    try { authorize(event, 'display'); send(control, 'playback', data); } catch {}
  });
  await control.loadURL(UI + 'index.html');
  await ensureOutput();
  blocker = powerSaveBlocker.start('prevent-display-sleep');
  screen.on('display-added', () => { refresh().catch(console.error); });
  screen.on('display-removed', (_, d) => {
    if (d.id === selectedDisplay) { output?.hide(); outputVisible = false; selectedDisplay = undefined; send(control, 'output-status', { visible: false, error: 'Audience monitor disconnected. Reconnect it, then open the display again.' }); }
    refresh().catch(console.error);
  });
  await pollDrives();
  poller = setInterval(pollDrives, 2500);
}
app.on('second-instance', () => { control?.restore(); control?.show(); control?.focus(); });
app.on('before-quit', () => { clearInterval(poller); if (blocker !== undefined && powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker); if (output && !output.isDestroyed()) output.destroy(); });
app.on('window-all-closed', () => app.quit());
if (locked) app.whenReady().then(boot).catch(error => { dialog.showErrorBox('Isaszeg Replay could not start', error.message); app.quit(); });
