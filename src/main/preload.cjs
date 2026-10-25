const { contextBridge, ipcRenderer } = require('electron');
const allowedEvents = new Set(['state', 'command', 'playback', 'drives', 'drive-error', 'output-status', 'import-progress']);
contextBridge.exposeInMainWorld('replay', {
  init: () => ipcRenderer.invoke('init'),
  openMeeting: date => ipcRenderer.invoke('meeting:open', date),
  saveRegistration: data => ipcRenderer.invoke('registration:save', data),
  saveRegistry: data => ipcRenderer.invoke('registry:save', data),
  dates: () => ipcRenderer.invoke('meeting:dates'),
  patchItem: (id, patch) => ipcRenderer.invoke('item:patch', id, patch),
  removeItem: id => ipcRenderer.invoke('item:remove', id),
  reorder: ids => ipcRenderer.invoke('items:reorder', ids),
  patchSettings: patch => ipcRenderer.invoke('settings:patch', patch),
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  listFolder: directory => ipcRenderer.invoke('folder:list', directory),
  chooseFiles: kind => ipcRenderer.invoke('files:choose', kind),
  importFiles: (files, kind, number) => ipcRenderer.invoke('files:import', files, kind, number),
  chooseRoot: () => ipcRenderer.invoke('root:choose'),
  revealFolder: () => ipcRenderer.invoke('folder:reveal'),
  showOutput: id => ipcRenderer.invoke('output:show', id),
  hideOutput: () => ipcRenderer.invoke('output:hide'),
  command: command => ipcRenderer.invoke('transport', command),
  report: state => ipcRenderer.send('playback', state),
  on: (name, fn) => {
    if (!allowedEvents.has(name)) return () => {};
    const listener = (_event, value) => fn(value);
    ipcRenderer.on(name, listener);
    return () => ipcRenderer.removeListener(name, listener);
  }
});
