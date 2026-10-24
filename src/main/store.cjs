const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const VIDEOS = new Set(['.mp4', '.m4v', '.mov', '.webm']);
const IMAGES = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const RATES = [0.25, 0.5, 0.75, 1];
function localDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a date in YYYY-MM-DD format.');
  const d = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date) throw new Error('That date is not valid.');
  return date;
}
function defaults(date) {
  return {
    version: 1, date, title: 'Race day',
    settings: { bannerSeconds: 12, adEvery: 2, sponsorRail: false, muted: true, defaultRate: 1, autoBrowse: true },
    items: [
      { id: 'park', title: 'Welcome to Isaszeg Park', kind: 'banner', builtin: 'park', enabled: true, seconds: 12 },
      { id: 'redmills', title: 'Connolly’s RED MILLS', kind: 'ad', builtin: 'redmills', enabled: false, seconds: 10, mock: true },
      { id: 'pedro', title: 'PEDRO', kind: 'ad', builtin: 'pedro', enabled: false, seconds: 10, mock: true }
    ]
  };
}
async function atomicJSON(file, data) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
}
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function validateMeeting(data, date) {
  if (!data || data.version !== 1 || data.date !== date || !Array.isArray(data.items)) throw new Error('The race-day manifest is invalid. Restore it from a backup before continuing.');
  const ids = new Set();
  for (const item of data.items) {
    if (!item || typeof item.id !== 'string' || ids.has(item.id) || !['race', 'banner', 'ad'].includes(item.kind) || typeof item.title !== 'string' || typeof item.enabled !== 'boolean') throw new Error('Invalid item in race-day manifest.');
    ids.add(item.id);
    if (item.file && (path.basename(item.file) !== item.file || item.file === '.' || item.file === '..')) throw new Error('Unsafe file path in manifest.');
    if (item.builtin && !['park', 'redmills', 'pedro'].includes(item.builtin)) throw new Error('Unknown built-in artwork.');
    if (!item.file && !item.builtin) throw new Error('Missing media file in manifest.');
  }
  const base = defaults(date);
  data.settings = { ...base.settings, ...data.settings };
  return data;
}
class MeetingStore {
  constructor(root, options = {}) { this.root = root; this.onProgress = options.onProgress || (() => {}); this.tail = Promise.resolve(); }
  exclusive(fn) {
    const pending = this.tail.then(fn);
    this.tail = pending.catch(() => {});
    return pending;
  }
  folder(date) { return path.join(this.root, validDate(date)); }
  async load(date) {
    const folder = this.folder(date);
    await fs.mkdir(folder, { recursive: true });
    try { return validateMeeting(JSON.parse(await fs.readFile(path.join(folder, 'meeting.json'), 'utf8')), date); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const data = defaults(date);
      await atomicJSON(path.join(folder, 'meeting.json'), data);
      return data;
    }
  }
  async save(data) { validateMeeting(data, data.date); await atomicJSON(path.join(this.folder(data.date), 'meeting.json'), data); return data; }
  update(date, change) { return this.exclusive(async () => { const data = await this.load(date); change(data); return this.save(data); }); }
  async saveRegistration(date, input) {
    const { validateRegistration } = await import('../shared/registration.mjs');
    const registration = validateRegistration(input);
    return this.update(date, data => { data.registration = registration; });
  }
  patchItem(date, id, patch) {
    return this.update(date, data => {
      const item = data.items.find(x => x.id === id);
      if (!item) throw new Error('This item no longer exists.');
      if (typeof patch.enabled === 'boolean') item.enabled = patch.enabled;
      if (typeof patch.title === 'string' && patch.title.trim()) item.title = patch.title.trim().slice(0, 100);
      if (Number.isFinite(patch.seconds)) item.seconds = Math.min(120, Math.max(3, patch.seconds));
    });
  }
  removeItem(date, id) {
    return this.update(date, data => {
      const index = data.items.findIndex(item => item.id === id);
      if (index < 0) throw new Error('This item no longer exists.');
      data.items.splice(index, 1);
    });
  }
  patchSettings(date, patch) {
    return this.update(date, data => {
      for (const key of ['sponsorRail', 'muted', 'autoBrowse']) if (typeof patch[key] === 'boolean') data.settings[key] = patch[key];
      if (Number.isFinite(patch.bannerSeconds)) data.settings.bannerSeconds = Math.min(120, Math.max(3, patch.bannerSeconds));
      if (Number.isInteger(patch.adEvery)) data.settings.adEvery = Math.min(20, Math.max(1, patch.adEvery));
      if (RATES.includes(patch.defaultRate)) data.settings.defaultRate = patch.defaultRate;
    });
  }
  reorder(date, ids) {
    return this.update(date, data => {
      if (!Array.isArray(ids) || ids.length !== data.items.length || new Set(ids).size !== ids.length || ids.some(id => !data.items.some(x => x.id === id))) throw new Error('Playlist changed; refresh and try again.');
      data.items = ids.map(id => data.items.find(x => x.id === id));
    });
  }
  importFiles(date, files, kind = 'race', startNumber) {
    return this.exclusive(async () => {
      if (!Array.isArray(files) || !files.length || files.length > 64 || !['race', 'banner', 'ad'].includes(kind)) throw new Error('Select between 1 and 64 media files.');
      const data = await this.load(date);
      const used = new Set(data.items.filter(x => x.kind === 'race').map(x => x.raceNumber));
      let number = startNumber === undefined ? Math.max(0, ...used) + 1 : Number(startNumber);
      if (kind === 'race' && (!Number.isInteger(number) || number < 1 || number > 9999)) throw new Error('Race number must be 1–9999.');
      const results = [];
      for (const source of files) {
        let temp; let destination;
        try {
          if (typeof source !== 'string') throw new Error('Invalid file selection.');
          const ext = path.extname(source).toLowerCase();
          if (!(kind === 'race' ? VIDEOS : new Set([...VIDEOS, ...IMAGES])).has(ext)) throw new Error('Unsupported format. Use MP4, MOV, M4V, WebM, JPG, PNG or WebP.');
          const before = await fs.stat(source);
          if (!before.isFile() || !before.size) throw new Error('This file is empty or unavailable.');
          temp = path.join(this.folder(date), `.import-${randomUUID()}.part`);
          const hash = createHash('sha256'); let bytes = 0; let last = 0;
          const progress = stage => this.onProgress({ name: path.basename(source), bytes, total: before.size, stage });
          await pipeline(createReadStream(source), new Transform({ transform(chunk, encoding, cb) {
            hash.update(chunk); bytes += chunk.length;
            if (Date.now() - last > 200) { progress('copying'); last = Date.now(); }
            cb(null, chunk);
          } }), createWriteStream(temp, { flags: 'wx' }));
          const after = await fs.stat(source);
          if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes !== before.size) throw new Error('Source changed during copying. Wait for recording to finish, then try again.');
          const digest = hash.digest('hex');
          if (data.items.some(x => x.sha256 === digest)) { results.push({ source: path.basename(source), status: 'duplicate' }); continue; }
          progress('verifying');
          if (await sha256(temp) !== digest) throw new Error('Copy verification failed. Please try again.');
          while (used.has(number)) number++;
          if (kind === 'race' && number > 9999) throw new Error('No race numbers left for this meeting.');
          const id = randomUUID();
          const filename = kind === 'race' ? `race-${String(number).padStart(2, '0')}-${id.slice(0, 8)}${ext}` : `${kind}-${id}${ext}`;
          destination = path.join(this.folder(date), filename);
          await fs.rename(temp, destination); temp = null;
          const item = {
            id, kind, title: kind === 'race' ? `Race ${String(number).padStart(2, '0')}` : path.parse(source).name,
            file: filename, originalName: path.basename(source), bytes: before.size, sha256: digest,
            enabled: true, importedAt: new Date().toISOString(), seconds: data.settings.bannerSeconds,
            mediaType: VIDEOS.has(ext) ? 'video' : 'image', ...(kind === 'race' ? { raceNumber: number } : {})
          };
          data.items.push(item);
          try { await this.save(data); } catch (e) { data.items.pop(); throw e; }
          destination = null;
          if (kind === 'race') { used.add(number); number++; }
          results.push({ source: path.basename(source), status: 'imported', item });
        } catch (error) { results.push({ source: typeof source === 'string' ? path.basename(source) : 'Unknown file', status: 'error', message: error.message }); }
        finally { if (temp) await fs.rm(temp, { force: true }).catch(() => {}); if (destination) await fs.rm(destination, { force: true }).catch(() => {}); }
      }
      this.onProgress(null);
      return { meeting: data, results };
    });
  }
}
module.exports = { MeetingStore, localDate, validDate, defaults, atomicJSON, validateMeeting, VIDEOS, IMAGES };
