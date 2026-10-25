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

test('media edits persist replay moments and runner times atomically across restart',async t=>{
  const {store,clip}=await fixture(t),date='2026-10-24';
  const {referenceMeeting}=await import('../src/shared/reference-219.mjs');
  await store.saveRegistration(date,referenceMeeting);
  const result=await store.importFiles(date,[await clip('race.mp4','replay moments')],'race',1),item=result.results[0].item;
  const race=referenceMeeting.races[0],entries=race.entries.map(entry=>({trap:entry.trap,status:'FIN',time:'20.12',split:'5.40'}));
  await store.patchItem(date,item.id,{replaySections:[{id:'bend',start:1,end:3,rate:.25,label:'Bend'}],runnerResults:{raceId:race.id,entries}});
  const reopened=await new MeetingStore(store.root).load(date);
  assert.equal(reopened.items.find(value=>value.id===item.id).replaySections[0].rate,.25);
  assert.equal(reopened.registration.races[0].entries[0].time,'20.12');
  await store.patchItem(date,item.id,{replayRate:{id:'bend',rate:1}});
  assert.equal((await new MeetingStore(store.root).load(date)).items.find(value=>value.id===item.id).replaySections[0].rate,1);
  entries[0].time='invalid';await assert.rejects(store.patchItem(date,item.id,{title:'Invalid',replaySections:[],runnerResults:{raceId:race.id,entries}}));
  assert.equal((await store.load(date)).items.find(value=>value.id===item.id).replaySections.length,1);
});
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
  assert.equal(result.results[1].item.id, result.results[0].item.id, 'A duplicate identifies the existing recording');
  assert.equal(result.results[1].item.raceNumber, 1);
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

test('removing videos and images persists per meeting and preserves archived and source files', async t => {
  const { store, clip } = await fixture(t);
  const date = '2026-10-24';
  const video = await clip('race.mp4', 'race recording');
  const image = await clip('sponsor.png', 'sponsor image');
  const race = (await store.importFiles(date, [video])).results[0].item;
  const banner = (await store.importFiles(date, [image], 'ad')).results[0].item;
  await store.patchItem(date, banner.id, { enabled: false });
  await store.importFiles('2026-10-25', [video]);
  await store.removeItem(date, race.id);
  await store.removeItem(date, banner.id);
  const restarted = new MeetingStore(store.root);
  assert.deepEqual((await restarted.load(date)).items.map(item => item.id), ['park', 'redmills', 'pedro']);
  assert.equal((await restarted.load('2026-10-25')).items.filter(item => item.kind === 'race').length, 1);
  for (const [source, item] of [[video, race], [image, banner]]) {
    assert.deepEqual(await fs.readFile(source), await fs.readFile(path.join(store.folder(date), item.file)));
  }
  assert.equal((await store.importFiles(date, [video])).results[0].status, 'imported', 'Removed media can be added again');
});

test('removing built-in media can empty a meeting without restoring removed entries on restart', async t => {
  const { store } = await fixture(t); const date = '2026-10-24';
  for (const id of ['park', 'redmills', 'pedro']) await store.removeItem(date, id);
  assert.deepEqual((await new MeetingStore(store.root).load(date)).items, []);
  const manifest = path.join(store.folder(date), 'meeting.json'); const before = await fs.readFile(manifest, 'utf8');
  await assert.rejects(store.removeItem(date, 'missing'), /no longer exists/);
  assert.equal(await fs.readFile(manifest, 'utf8'), before);
});

test('removal serializes with imports without losing newly added items', async t => {
  const { store, clip } = await fixture(t); const date = '2026-10-24';
  const first = await clip('first.mp4', 'first'); const second = await clip('second.mp4', 'second');
  const race = (await store.importFiles(date, [first])).results[0].item;
  const [imported] = await Promise.all([store.importFiles(date, [second]), store.removeItem(date, race.id)]);
  const races = (await store.load(date)).items.filter(item => item.kind === 'race');
  assert.deepEqual(races.map(item => item.id), [imported.results[0].item.id]);
});
