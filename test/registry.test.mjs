import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {MeetingStore,defaults} from '../src/main/store.cjs';
import {emptyRegistry,mergeRegistry} from '../src/shared/registry.mjs';

const dog = (id,name,extra={}) => ({id,name,breed:'Greyhound',...extra});
const race = dogId => ({id:'race',number:1,title:'Final',distance:275,breed:'Greyhound',type:'Oval',entries:[{trap:1,dogId}]});
async function setup(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'global-registry-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;
}

test('legacy owner, trainer and pedigree names become shared entities and retain IDs',()=>{
  const registry=mergeRegistry(emptyRegistry(),{dogs:[dog('runner','Runner',{owner:'Anna',trainer:'Anna',sire:'Father',dam:'Mother'})]});
  assert.equal(registry.people.length,1);assert.equal(registry.dogs.length,3);
  const runner=registry.dogs[0];assert.equal(runner.ownerId,runner.trainerId);
  assert.equal(registry.dogs.find(d=>d.id===runner.sireId).name,'Father');
  assert.deepEqual(mergeRegistry(emptyRegistry(),registry),registry);
  assert.equal(mergeRegistry(registry,{dogs:[{...runner,ownerId:''}]}).dogs[0].owner,'');
  assert.throws(()=>mergeRegistry(registry,{dogs:[{...runner,sireId:'missing'}]}),/parent/);
  assert.throws(()=>mergeRegistry(registry,{dogs:[{...runner,ownerId:'missing'}]}),/person/);
});

test('all legacy dates migrate once without changing originals or resurrecting stale names',async t=>{
  const root=await setup(t),originals=[];
  for(const [date,dogs] of [['2026-10-01',[dog('one','One',{owner:'Anna',sire:'Father'})]],['2026-10-02',[dog('two','Two',{trainer:'Anna',sire:'Father'})]]]) {
    const folder=path.join(root,date);await fs.mkdir(folder);
    const file=path.join(folder,'meeting.json'),contents=JSON.stringify({...defaults(date),registration:{races:[race(dogs[0].id)],dogs}});
    await fs.writeFile(file,contents);originals.push([file,contents]);
  }
  const store=new MeetingStore(root),state=await store.load('2026-10-03');
  assert.equal(state.registration.dogs.length,3);assert.equal(state.registration.people.length,1);assert.deepEqual(state.registration.races,[]);
  const person={...state.registration.people[0],name:'Anna Updated'};
  await store.saveRegistry({people:[person]});
  const previous=await new MeetingStore(root).load('2026-10-01');
  assert.equal(previous.registration.races[0].entries[0].dogId,'one');assert.equal(previous.registration.dogs.find(d=>d.id==='one').owner,'Anna Updated');
  for(const [file,contents] of originals)assert.equal(await fs.readFile(file,'utf8'),contents);
});

test('registry saves independently of race drafts, optional owners, and date-local races',async t=>{
  const root=await setup(t),store=new MeetingStore(root);
  await store.saveRegistry({dogs:[dog('one','One')],people:[]});
  let state=await store.load('2026-10-01');assert.equal(state.registration.dogs[0].owner,'');assert.equal(state.registration.races.length,0);
  await store.saveRegistration('2026-10-01',{...state.registration,races:[race('one')]});
  await store.saveRegistry({people:[{id:'person',name:'Trainer'}],dogs:[{...state.registration.dogs[0],trainerId:'person'}]});
  state=await new MeetingStore(root).load('2026-10-02');assert.deepEqual(state.registration.races,[]);assert.equal(state.registration.dogs[0].trainer,'Trainer');
  const raw=JSON.parse(await fs.readFile(path.join(root,'2026-10-01','meeting.json'),'utf8'));
  assert.equal(raw.registration.dogs,undefined);assert.equal(raw.registration.people,undefined);assert.equal(raw.registration.races.length,1);
  await assert.rejects(store.saveRegistry({dogs:[{...state.registration.dogs[0],breed:'Whippet'}]}),/entered in race/);
  assert.equal((await store.registry()).dogs[0].breed,'Greyhound');
  await assert.rejects(store.saveRegistration('2026-10-01',{...state.registration,races:[race('missing')]}));
  assert.equal((await store.load('2026-10-01')).registration.races.length,1);
});
