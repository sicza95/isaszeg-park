import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replaySections, validateReplaySections, replayTrackGradient } from '../src/shared/instant-replays.mjs';
import { applyMediaEdit } from '../src/shared/media-edit.mjs';
import { referenceMeeting } from '../src/shared/reference-219.mjs';

const moment = (id,start,end,rate=.5) => ({id,start,end,rate,label:id});
test('moments are validated, ordered and clipped to playable footage',()=>{
  const sections=[moment('finish',8,20),moment('bend',1,3),moment('tiny',5,5.2)];
  assert.deepEqual(validateReplaySections(sections).map(section=>section.id),['bend','tiny','finish']);
  const item={kind:'race',mediaType:'video',replaySections:sections};
  assert.equal(replaySections(item,10).at(-1).end,10);
  assert.equal(replaySections(item,8).length,2);
  for(const value of [[moment('bad',-1,3)],[moment('bad',1,1.1)],[moment('bad',1,3,2)],[moment('same',1,2),moment('same',3,4)],[moment('bad',1,NaN)]])assert.throws(()=>validateReplaySections(value));
  assert.equal(validateReplaySections([moment('normal',1,3,1)])[0].rate,1);
  assert.deepEqual(replaySections({...item,kind:'banner'}),[]);
});

test('the track marks the union of replay ranges in gold at the footage timestamps',()=>{
  const gradient=replayTrackGradient([moment('one',2,4),moment('overlap',3,5),moment('two',8,12)],10);
  assert.equal(gradient,'linear-gradient(to right, #55555f 0%, #55555f 20%, #d6b47b 20%, #d6b47b 50%, #55555f 50%, #55555f 80%, #d6b47b 80%, #d6b47b 100%, #55555f 100%, #55555f 100%)');
  assert.equal(replayTrackGradient([],10),'#55555f');assert.equal(replayTrackGradient([moment('one',2,4)],0),'#55555f');
});

test('changing a replay rate preserves other moments and rejects missing or invalid updates',()=>{
  const meeting={items:[{id:'clip',kind:'race',mediaType:'video',replaySections:[moment('one',1,3),moment('two',8,10)]}]};
  applyMediaEdit(meeting,'clip',{replayRate:{id:'one',rate:1}});
  assert.equal(meeting.items[0].replaySections[0].rate,1);assert.equal(meeting.items[0].replaySections[1].rate,.5);
  assert.throws(()=>applyMediaEdit(meeting,'clip',{replayRate:{id:'missing',rate:.5}}));
  assert.throws(()=>applyMediaEdit(meeting,'clip',{replayRate:{id:'one',rate:2}}));
});

test('media moments, link, statuses and times update together; invalid results commit nothing',()=>{
  const registration=structuredClone(referenceMeeting), race=registration.races[0];
  const meeting={registration,items:[{id:'clip',kind:'race',mediaType:'video',raceId:race.id,title:'Race 01'}]};
  const entries=race.entries.map(entry=>({trap:entry.trap,status:'FIN',time:'19.24',split:'5.20'}));
  applyMediaEdit(meeting,'clip',{replaySections:[moment('bend',1,3)],runnerResults:{raceId:race.id,entries}});
  assert.equal(meeting.items[0].replaySections.length,1);assert.equal(meeting.registration.races[0].entries[0].time,'19.24');
  const saved=structuredClone(meeting);
  entries[0].time='-2';assert.throws(()=>applyMediaEdit(meeting,'clip',{title:'Do not save',replaySections:[],runnerResults:{raceId:race.id,entries}}));
  assert.deepEqual(meeting,saved);
  assert.throws(()=>applyMediaEdit(meeting,'clip',{runnerResults:{raceId:'another-race',entries:[]}}));
});
