import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaSeconds, sponsorColors, footerSponsor } from '../src/shared/media-settings.mjs';
import { applyMediaEdit } from '../src/shared/media-edit.mjs';
import { dogAge } from '../src/shared/dog-age.mjs';
import { raceResults, resultWarnings } from '../src/shared/race-results.mjs';

test('blank durations follow separate settings while explicit overrides survive default changes', () => {
  const meeting = {settings:{bannerSeconds:18,sponsorSeconds:7},items:[{id:'sponsor',kind:'ad',title:'Partner',seconds:20}]};
  assert.equal(mediaSeconds(meeting,{kind:'banner'}),18);
  assert.equal(mediaSeconds(meeting,meeting.items[0]),20);
  applyMediaEdit(meeting,'sponsor',{seconds:null});
  assert.equal(Object.hasOwn(meeting.items[0],'seconds'),false);
  assert.equal(mediaSeconds(meeting,meeting.items[0]),7);
  meeting.settings.sponsorSeconds=9;
  assert.equal(mediaSeconds(meeting,meeting.items[0]),9);
  assert.equal(mediaSeconds({}, {kind:'ad'}),10);
});

test('sponsor colors inherit independently, can reset, and reject invalid edits atomically', () => {
  const meeting = {settings:{sponsorBackground:'#123456',sponsorForeground:'#ffffff'},items:[{id:'sponsor',kind:'ad',title:'Partner'}]};
  applyMediaEdit(meeting,'sponsor',{sponsorBackground:'#654321'});
  assert.deepEqual(sponsorColors(meeting,meeting.items[0]),{sponsorBackground:'#654321',sponsorForeground:'#ffffff'});
  meeting.settings.sponsorForeground='#aabbcc';
  assert.equal(sponsorColors(meeting,meeting.items[0]).sponsorForeground,'#aabbcc');
  const before=structuredClone(meeting);
  assert.throws(()=>applyMediaEdit(meeting,'sponsor',{title:'Changed',sponsorForeground:'invalid'}),/valid footer color/);
  assert.deepEqual(meeting,before);
  applyMediaEdit(meeting,'sponsor',{sponsorBackground:null});
  assert.equal(sponsorColors(meeting,meeting.items[0]).sponsorBackground,'#123456');
});

test('footer rotation honors each enabled sponsor duration and wraps at the loop boundary', () => {
  const meeting={settings:{sponsorSeconds:10},items:[{id:'off',kind:'ad',enabled:false,seconds:50},{id:'a',kind:'ad',enabled:true,seconds:3},{id:'b',kind:'ad',enabled:true}]};
  for(const [time,id] of [[0,'a'],[2.99,'a'],[3,'b'],[12.99,'b'],[13,'a'],[26,'a']]) assert.equal(footerSponsor(meeting,time).id,id);
  assert.equal(footerSponsor({...meeting,items:[]},0),undefined);
});

test('results hold applies after every row is revealed and preserves the exit animation', () => {
  const race={entries:[{dogId:'a',trap:1,status:'FIN',time:'20.10'},{dogId:'b',trap:2,status:'FIN',time:''}]};
  const normal=raceResults(race), longer=raceResults(race,{resultsSeconds:25});
  assert.equal(longer.completeAt,normal.completeAt);
  assert.equal(longer.exitAt-longer.completeAt,25);
  assert.equal(longer.duration-normal.duration,20);
  assert.equal(raceResults({entries:[]},{resultsSeconds:25}).duration,0);
});

test('missing actual times warn even when an estimate remains, and Entered warns only with a video', () => {
  const entry={dogId:'a',trap:1,status:'FIN',time:''};
  assert.match(resultWarnings({entries:[entry]}).message,/Missing finish time: trap 1/);
  assert.match(resultWarnings({entries:[{...entry,estimatedTime:'20.10'}]}).message,/Missing finish time: trap 1/);
  assert.match(resultWarnings({entries:[{...entry,status:'DNF',time:'20.10'}]}).message,/No dogs marked as finished/);
  assert.equal(resultWarnings({entries:[]}).message,'');
  const race={entries:[{...entry,status:'ENTERED',time:'20.10'}]};
  assert.doesNotMatch(resultWarnings(race).message,/Entered status/);
  assert.match(resultWarnings(race,{hasVideo:true}).message,/Entered status is invalid with a race video: trap 1/);
});

test('age uses the birth month and meeting date, with dashes for unknown or future births', () => {
  assert.equal(dogAge('2024-06','2026-10-25'),'2y 4m');
  assert.equal(dogAge('2024-10','2026-10-25'),'2y');
  assert.equal(dogAge('2026-10','2026-10-25'),'0m');
  assert.equal(dogAge('2026-11','2026-10-25'),'-');
  assert.equal(dogAge('2024-13','2026-10-25'),'-');
  assert.equal(dogAge('','2026-10-25'),'-');
});
