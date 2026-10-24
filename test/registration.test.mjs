import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MeetingStore } from '../src/main/store.cjs';
import { referenceMeeting } from '../src/shared/reference-219.mjs';
import { validateRegistration } from '../src/shared/registration.mjs';
const copy = () => structuredClone(referenceMeeting);
test('scraped programme preserves trap assignments, missing race 13, unknown pedigree and non-runners', () => {
  const data=validateRegistration(copy());
  assert.equal(data.races.length,14);assert.equal(data.dogs.length,75);
  assert.deepEqual(data.races.map(r=>r.number),[1,2,3,4,5,6,7,8,9,10,11,12,14,15]);
  assert.equal(data.races[0].entries.find(e=>e.trap===5).dogId,'6413');
  assert.equal(data.races[2].entries.find(e=>e.trap===6).finish,'NR');
  assert.equal(data.races[2].entries.find(e=>e.trap===6).time,'');
  const bolt=data.dogs.find(d=>d.id==='5784');assert.equal(bolt.sire,'Rallying Best');assert.equal(bolt.birth,'2024-06');
  const bugatti=data.dogs.find(d=>d.id==='6856');assert.equal(bugatti.sire,'');assert.equal(bugatti.birth,'2023-10');
  assert.equal(data.races.filter(r=>r.videoReference).length,3);
});
test('duplicate races, traps, dogs and invalid results cannot be saved', () => {
  for (const mutate of [d=>d.races[1].number=1,d=>d.races[0].entries[1].trap=1,d=>d.races[0].entries[1].dogId=d.races[0].entries[0].dogId,d=>d.races[0].entries[0].dogId='missing',d=>d.races[0].entries[0].time='-1',d=>d.races[0].entries[0].finish='NR',d=>d.dogs[0].breed='Whippet']) {
    const data=copy();mutate(data);assert.throws(()=>validateRegistration(data));
  }
});
test('races can be registered before recordings and with empty traps',()=>{
  const data=copy();data.races[0].entries=[];assert.equal(validateRegistration(data).races[0].entries.length,0);
});
test('registration survives reopening, remains separate by date, and imports do not erase it',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'registration-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new MeetingStore(root),date='2026-10-04';
  await store.saveRegistration(date,copy());
  const reopened=await new MeetingStore(root).load(date);assert.equal(reopened.registration.dogs.length,75);
  const other=await store.load('2026-10-24');assert.equal(other.registration,undefined);
  const clip=path.join(root,'recording.mp4');await fs.writeFile(clip,'test-recording');
  await store.importFiles(date,[clip],'race',1);assert.equal((await store.load(date)).registration.races.length,14);
  const invalid=copy();invalid.races[0].entries[1].trap=1;await assert.rejects(store.saveRegistration(date,invalid));
  assert.equal((await store.load(date)).registration.races[0].entries[1].trap,5);
});

test('importing before or after registration persists race links across renumbering and restart',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'race-links-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new MeetingStore(root),date='2026-10-04',clip=path.join(root,'recording.mp4');await fs.writeFile(clip,'race-video');
  const imported=await store.importFiles(date,[clip],'race',1),id=imported.results[0].item.id;
  await store.saveRegistration(date,copy());
  let saved=await store.load(date);assert.equal(saved.items.find(item=>item.id===id).raceId,'source-1');
  const registration=copy();registration.races[0].number=99;registration.races[0].title='Renamed final';
  await store.saveRegistration(date,registration);saved=await new MeetingStore(root).load(date);
  assert.equal(saved.items.find(item=>item.id===id).raceId,'source-1');
  await store.patchItem(date,id,{raceId:'source-2'});assert.equal((await store.load(date)).items.find(item=>item.id===id).raceId,'source-2');
  await assert.rejects(store.patchItem(date,id,{raceId:'missing'}),/no longer exists/);
  await store.patchItem(date,id,{raceId:null});await store.saveRegistration(date,copy());
  assert.equal((await store.load(date)).items.find(item=>item.id===id).raceId,null);
  const next='2026-10-05';await store.saveRegistration(next,copy());
  const after=await store.importFiles(next,[clip],'race',2);assert.equal(after.results[0].item.raceId,'source-2');
  await store.patchSettings(date,{racecardSeconds:999});assert.equal((await store.load(date)).settings.racecardSeconds,60);
});
