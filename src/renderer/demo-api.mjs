const dateNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function fresh(date) {
  return { version: 1, date, title: 'Race day', settings: { bannerSeconds: 12, adEvery: 2, sponsorRail: false, muted: true, defaultRate: 1, autoBrowse: true }, items: [
    { id: 'park', title: 'Welcome to Isaszeg Park', kind: 'banner', builtin: 'park', enabled: true, seconds: 12, mediaType: 'image', url: '../../assets/park.jpg' },
    { id: 'redmills', title: 'Connolly’s RED MILLS', kind: 'ad', builtin: 'redmills', enabled: false, seconds: 10, mediaType: 'image', url: '../../assets/redmills.jpg', mock: true },
    { id: 'pedro', title: 'PEDRO', kind: 'ad', builtin: 'pedro', enabled: false, seconds: 10, mediaType: 'image', url: '../../assets/pedro.jpg', mock: true }
  ] };
}
export function createDemoAPI() {
  const meetings = new Map(); let date = dateNow(), output = null, transport;
  meetings.set(date, fresh(date));
  const events = new EventTarget(); const channel = new BroadcastChannel('isaszeg-replay-demo');
  const files = new Map(); let lastFrame;
  const emit = (name, data) => events.dispatchEvent(new CustomEvent(name, { detail: data }));
  const state = () => ({ meeting: meetings.get(date), root: 'Desktop app → Documents / Isaszeg Replay', displays: [{ id: 1, label: 'Separate browser window', width: 1920, height: 1080 }], drives: [], desktop: false, busy: false, outputVisible: output && !output.closed, selectedDisplay: 1 });
  const refresh = () => { const value = state(); emit('state', value); return value; };
  const selectFiles = () => new Promise(resolve => {
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = '.mp4,.mov,.m4v,.webm,.jpg,.jpeg,.png,.webp';
    input.addEventListener('change', () => { const ids = [...input.files].map(file => { const id = `${Date.now()}-${crypto.randomUUID()}`; files.set(id, file); return id; }); resolve(ids); }, { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true }); input.click();
  });
  channel.onmessage = ({ data }) => { if (data.type === 'command') transport?.(data.command); if (data.type === 'hello' && lastFrame) channel.postMessage(lastFrame); };
  return {
    init: async () => state(), on: (name, callback) => { const fn = e => callback(e.detail); events.addEventListener(name, fn); return () => events.removeEventListener(name, fn); },
    openMeeting: async next => { if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) throw new Error('Choose a valid date.'); date = next; if (!meetings.has(date)) meetings.set(date, fresh(date)); return refresh(); },
    dates: async () => [...meetings.keys()],
    patchItem: async (id, patch) => { Object.assign(meetings.get(date).items.find(x => x.id === id), patch); return refresh(); },
    removeItem: async id => {
      const meeting = meetings.get(date); const index = meeting.items.findIndex(item => item.id === id);
      if (index < 0) throw new Error('This item no longer exists.');
      const [item] = meeting.items.splice(index, 1);
      const next = refresh();
      if (item.url?.startsWith('blob:')) URL.revokeObjectURL(item.url);
      return next;
    },
    patchSettings: async patch => { Object.assign(meetings.get(date).settings, patch); return refresh(); },
    reorder: async ids => { const meeting = meetings.get(date); meeting.items = ids.map(id => meeting.items.find(x => x.id === id)); return refresh(); },
    chooseFiles: selectFiles, chooseFolder: async () => null, listFolder: async () => { throw new Error('Use Select files directly in the browser demo.'); },
    describeFiles: ids => ids.map(id => ({ path: id, name: files.get(id)?.name || id, bytes: files.get(id)?.size || 0, modified: files.get(id)?.lastModified || Date.now() })),
    importFiles: async (ids, kind, startNumber) => {
      const meeting = meetings.get(date); const results = [];
      let number = Number(startNumber) || Math.max(0, ...meeting.items.filter(x => x.kind === 'race').map(x => x.raceNumber)) + 1;
      for (const id of ids) {
        const file = files.get(id); if (!file) continue;
        const video = /\.(mp4|mov|m4v|webm)$/i.test(file.name);
        if (kind === 'race' && !video) { results.push({ source: file.name, status: 'error', message: 'Choose a video for a race.' }); continue; }
        while (meeting.items.some(x => x.raceNumber === number)) number++;
        const item = { id: crypto.randomUUID(), kind, title: kind === 'race' ? `Race ${String(number).padStart(2, '0')}` : file.name.replace(/\.[^.]+$/, ''), raceNumber: kind === 'race' ? number++ : undefined, bytes: file.size, url: URL.createObjectURL(file), mediaType: video ? 'video' : 'image', enabled: true, seconds: meeting.settings.bannerSeconds, importedAt: new Date().toISOString() };
        meeting.items.push(item); results.push({ source: file.name, status: 'imported', item });
      }
      refresh(); return { results };
    },
    chooseRoot: async () => { throw new Error('Saved race-day folders are available in the desktop app.'); },
    revealFolder: async () => { throw new Error('Use the desktop app to open saved race-day folders.'); },
    showOutput: async () => { output = window.open('display.html', 'isaszeg-audience', 'popup,width=1280,height=720'); if (!output) throw new Error('Allow pop-ups to open the audience window.'); return refresh(); },
    hideOutput: async () => { output?.close(); return refresh(); },
    command: async command => { if (command.type === 'fullscreen') { output?.focus(); } else transport?.(command); },
    setTransport: callback => { transport = callback; },
    report: status => { emit('playback', status); lastFrame = { type: 'frame', meeting: meetings.get(date), status }; channel.postMessage(lastFrame); }
  };
}
