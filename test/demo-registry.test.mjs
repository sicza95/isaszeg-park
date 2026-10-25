import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDemoAPI} from '../src/renderer/demo-api.mjs';

test('browser demo migrates every saved date and persists global entities separately from race cards',async t=>{
  class Storage {
    getItem(key){return this[key]??null;}
    setItem(key,value){this[key]=String(value);}
  }
  const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),previousChannel=globalThis.BroadcastChannel;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:new Storage()});
  globalThis.BroadcastChannel=class {postMessage(){}};
  t.after(()=>{if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;globalThis.BroadcastChannel=previousChannel;});
  localStorage.setItem('isaszeg-registration-2026-01-01',JSON.stringify({races:[],dogs:[{id:'one',name:'One',breed:'Greyhound',owner:'Anna'}]}));
  localStorage.setItem('isaszeg-registration-2026-01-02',JSON.stringify({races:[],dogs:[{id:'two',name:'Two',breed:'Greyhound',trainer:'Anna'}]}));
  const api=createDemoAPI();let state=await api.openMeeting('2026-01-03');
  assert.equal(state.meeting.registration.dogs.length,2);assert.equal(state.meeting.registration.people.length,1);
  const owner=state.meeting.registration.people[0];
  await api.saveRegistry({people:[{...owner,name:'Updated Anna'}]});
  state=await api.openMeeting('2026-01-01');assert.equal(state.meeting.registration.dogs[0].owner,'Updated Anna');
  await api.saveRegistration({...state.meeting.registration,races:[{id:'race',title:'Final',number:1,distance:275,type:'Oval',breed:'Greyhound',entries:[{trap:1,dogId:'one'}]}]});
  assert.equal(JSON.parse(localStorage.getItem('isaszeg-registration-2026-01-01')).dogs,undefined);
  await assert.rejects(api.saveRegistry({dogs:[{...state.meeting.registration.dogs[0],breed:'Whippet'}]}),/entered in race/);
  const restarted=createDemoAPI();state=await restarted.openMeeting('2026-01-01');
  assert.equal(state.meeting.registration.races.length,1);assert.equal(state.meeting.registration.dogs[0].owner,'Updated Anna');
  state=await restarted.openMeeting('2026-01-03');assert.equal(state.meeting.registration.races.length,0);assert.equal(state.meeting.registration.dogs.length,2);
});
