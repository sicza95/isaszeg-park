const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { MeetingStore, validDate, localDate } = require('../src/main/store.cjs');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'isaszeg-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'card'); await fs.mkdir(source);
  const store = new MeetingStore(path.join(dir, 'race-days'));
  const clip = async (name, content) => { const file = path.join(source, name); await fs.writeFile(file, content); return file; };
  return { dir, source, store, clip };
}
test('verified import preserves card originals, numbers clips and survives restart', async t => {
  const { store, clip } = await fixture(t);
  const original = await clip('camera.mp4', Buffer.alloc(4096, 19));
  const result = await store.importFiles('2026-10-24', [original]);
  assert.equal(result.results[0].status, 'imported');
  const race = result.meeting.items.find(x => x.kind === 'race');
  assert.equal(race.title, 'Race 01'); assert.equal(race.sha256.length, 64);
  assert.deepEqual(await fs.readFile(original), await fs.readFile(path.join(store.folder('2026-10-24'), race.file)));
  const fresh = new MeetingStore(store.root); assert.equal((await fresh.load('2026-10-24')).items.at(-1).id, race.id);
  assert.equal((await fs.readdir(store.folder('2026-10-24'))).some(x => x.endsWith('.part')), false);
});
test('content duplicates are skipped even with renamed source; sequence does not advance', async t => {
  const { store, clip } = await fixture(t);
  const one = await clip('one.mp4', 'same clip'); const two = await clip('renamed.mp4', 'same clip'); const three = await clip('new.mp4', 'new clip');
  const result = await store.importFiles('2026-10-24', [one, two, three]);
  assert.deepEqual(result.results.map(x => x.status), ['imported', 'duplicate', 'imported']);
  assert.deepEqual(result.meeting.items.filter(x => x.kind === 'race').map(x => x.raceNumber), [1, 2]);
});
test('failed files do not enter playlist or prevent later clips importing', async t => {
  const { store, clip } = await fixture(t);
  const invalid = await clip('bad.exe', 'not media'); const empty = await clip('empty.mp4', ''); const good = await clip('good.mp4', 'recording');
  const result = await store.importFiles('2026-10-24', [invalid, empty, path.join(store.root, 'missing.mp4'), good]);
  assert.deepEqual(result.results.map(x => x.status), ['error', 'error', 'error', 'imported']);
  assert.equal(result.meeting.items.filter(x => x.kind === 'race').length, 1);
});
test('concurrent imports serialize, manual numbering skips used numbers, dates are isolated', async t => {
  const { store, clip } = await fixture(t); const a = await clip('a.mp4', 'a'); const b = await clip('b.mp4', 'b');
  await Promise.all([store.importFiles('2026-10-24', [a], 'race', 5), store.importFiles('2026-10-24', [b], 'race', 5)]);
  assert.deepEqual((await store.load('2026-10-24')).items.filter(x => x.kind === 'race').map(x => x.raceNumber), [5, 6]);
  assert.equal((await store.load('2026-10-25')).items.filter(x => x.kind === 'race').length, 0);
});
test('disabled races stay archived and maintain numbering; sponsor mocks start off', async t => {
  const { store, clip } = await fixture(t); const a = await clip('a.mp4', 'a'); const b = await clip('b.mp4', 'b');
  const one = await store.importFiles('2026-10-24', [a]); const race = one.meeting.items.at(-1);
  await store.patchItem('2026-10-24', race.id, { enabled: false });
  const two = await store.importFiles('2026-10-24', [b]);
  assert.equal(two.meeting.items.at(-1).raceNumber, 2);
  assert.equal(two.meeting.items.filter(x => x.mock && x.enabled).length, 0);
});
test('corrupt manifests fail without being replaced and traversal is rejected', async t => {
  const { store } = await fixture(t); await store.load('2026-10-24');
  const file = path.join(store.folder('2026-10-24'), 'meeting.json'); await fs.writeFile(file, '{broken');
  await assert.rejects(store.load('2026-10-24')); assert.equal(await fs.readFile(file, 'utf8'), '{broken');
  assert.throws(() => store.folder('../escape'));
  assert.throws(() => validDate('2026-02-30'));
});
test('Budapest meeting day changes at local midnight', () => {
  assert.equal(localDate(new Date('2026-10-24T22:30:00Z')), '2026-10-25');
});
