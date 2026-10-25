import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MeetingStore } from '../src/main/store.cjs';
import { referenceMeeting } from '../src/shared/reference-219.mjs';
import { validateRegistration } from '../src/shared/registration.mjs';
import { resultWarnings } from '../src/shared/race-results.mjs';
const copy = () => structuredClone(referenceMeeting);
test('scraped programme preserves trap assignments, missing race 13, unknown pedigree and non-runners', () => {
  const data=validateRegistration(copy());
  assert.equal(data.races.length,14);assert.equal(data.dogs.length,75);
  assert.deepEqual(data.races.map(r=>r.number),[1,2,3,4,5,6,7,8,9,10,11,12,14,15]);
  assert.equal(data.races[0].entries.find(e=>e.trap===5).dogId,'6413');
  assert.equal(data.races[2].entries.find(e=>e.trap===6).status,'NR');
  assert.equal(data.races[2].entries.find(e=>e.trap===6).finish,'');
  assert.equal(data.races[2].entries.find(e=>e.trap===6).time,'');
  const bolt=data.dogs.find(d=>d.id==='5784');assert.equal(bolt.sire,'Rallying Best');assert.equal(bolt.birth,'2024-06');
  const bugatti=data.dogs.find(d=>d.id==='6856');assert.equal(bugatti.sire,'');assert.equal(bugatti.birth,'2023-10');
  assert.equal(data.races.filter(r=>r.videoReference).length,3);
});
test('duplicate races, traps, dogs and invalid results cannot be saved', () => {
  for (const mutate of [d=>d.races[1].number=1,d=>d.races[0].entries[1].trap=1,d=>d.races[0].entries[1].dogId=d.races[0].entries[0].dogId,d=>d.races[0].entries[0].dogId='missing',d=>d.races[0].entries[0].time='-1',d=>d.races[0].entries[0].finish='UNKNOWN',d=>d.dogs[0].breed='Whippet']) {
    const data=copy();mutate(data);assert.throws(()=>validateRegistration(data));
  }
});

test('disqualified times survive saving and reopening without a finishing place',async t=>{
  const data=copy(),entry=data.races[0].entries[0];
  entry.status='DQ';entry.time='16.78';entry.estimatedTime='16.90';entry.split='7.22';entry.finalSplit='9.56';
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'disqualified-times-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await new MeetingStore(root).saveRegistration('2026-10-04',data);
  const saved=(await new MeetingStore(root).load('2026-10-04')).registration.races[0].entries.find(value=>value.dogId===entry.dogId);
  for(const key of ['time','estimatedTime','split','finalSplit','status'])assert.equal(saved[key],entry[key]);
  assert.equal(saved.finish,'');
});
test('races can be registered before recordings and with empty traps',()=>{
  const data=copy();data.races[0].entries=[];assert.equal(validateRegistration(data).races[0].entries.length,0);
});

test('saving recalculates finish order from times and keeps status separate',()=>{
  const data=copy(),entries=data.races[0].entries;
  entries[0].time='40.00';entries[0].finish='1';
  const clean=validateRegistration(data).races[0].entries;
  assert.equal(clean.find(entry=>entry.trap===entries[0].trap).finish,'6');
  assert.ok(clean.every(entry=>entry.status==='FIN'));
  const invalid=copy();invalid.races[0].entries[0].status='UNKNOWN';assert.throws(()=>validateRegistration(invalid),/status/);
});

test('finish times allow thousandths, reject excess precision and normalize duplicates numerically',()=>{
  const data=copy();data.races=data.races.slice(0,1);data.races[0].entries=data.races[0].entries.slice(0,2);
  const entries=data.races[0].entries;
  entries[0].status=entries[1].status='FIN';entries[0].time='20.121';entries[1].time='20.129';
  assert.deepEqual(validateRegistration(data).races[0].entries.map(entry=>entry.finish),['1','2']);
  entries[1].time='20.1210';assert.throws(()=>validateRegistration(data),/identical finish times/);
  entries[1].time='20.1234';assert.throws(()=>validateRegistration(data),/three decimal places/);
  entries[1].time='20.129';entries[0].estimatedTime='20.1234';assert.throws(()=>validateRegistration(data),/three decimal places/);
  entries[0].estimatedTime='20.122';assert.equal(validateRegistration(data).races[0].entries[0].time,'20.121');
});

test('historical rounded ties warn and remain editable without blocking another race',()=>{
  const saved=validateRegistration(copy());
  const tied=saved.races.find(race=>race.number===9);
  assert.match(resultWarnings(tied).message,/Identical finish times/);
  const draft=structuredClone(saved);draft.races[0].title='Edited title';
  assert.doesNotThrow(()=>validateRegistration(draft,{previous:saved,editedRaceId:draft.races[0].id}));
  assert.throws(()=>validateRegistration(draft,{previous:saved,editedRaceId:tied.id}),/identical finish times/);
  const changed=draft.races.find(race=>race.id===tied.id);changed.entries[0].time='19.123';
  assert.throws(()=>validateRegistration(draft,{previous:saved}),/identical finish times/);
});

test('registration and media saves persist thousandths and atomically reject identical times',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'precise-times-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new MeetingStore(root),date='2026-10-04',data=copy();data.races=data.races.slice(0,1);
  const race=data.races[0];race.entries=race.entries.slice(0,2);
  race.entries.forEach((entry,index)=>{entry.status='FIN';entry.time=index?'20.129':'20.121';});
  await store.saveRegistration(date,data);
  const before=await fs.readFile(path.join(store.folder(date),'meeting.json'),'utf8');
  const invalid=structuredClone(data);invalid.races[0].entries[1].time='20.121';
  await assert.rejects(store.saveRegistration(date,invalid),/identical finish times/);
  assert.equal(await fs.readFile(path.join(store.folder(date),'meeting.json'),'utf8'),before);
  const video=path.join(root,'race.mp4');await fs.writeFile(video,'precise times');
  const imported=await store.importFiles(date,[video],'race',1),id=imported.results[0].item.id;
  const patch={title:'Do not save',runnerResults:{raceId:race.id,entries:invalid.races[0].entries}};
  await assert.rejects(store.patchItem(date,id,patch),/identical finish times/);
  let reopened=await new MeetingStore(root).load(date);
  assert.equal(reopened.items.find(item=>item.id===id).title,'Race 01');
  assert.deepEqual(reopened.registration.races[0].entries.map(entry=>entry.time),['20.121','20.129']);
  patch.runnerResults.entries[1].time='20.122';delete patch.title;
  await store.patchItem(date,id,patch);reopened=await new MeetingStore(root).load(date);
  assert.deepEqual(reopened.registration.races[0].entries.map(entry=>entry.time),['20.121','20.122']);
});
test('race cards remain separate by date while the global registry survives reopening and imports',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'registration-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new MeetingStore(root),date='2026-10-04';
  await store.saveRegistration(date,copy());
  const reopened=await new MeetingStore(root).load(date);assert.ok(reopened.registration.dogs.length>=75);
  const other=await store.load('2026-10-24');assert.deepEqual(other.registration.races,[]);assert.deepEqual(other.registration.dogs,reopened.registration.dogs);
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
