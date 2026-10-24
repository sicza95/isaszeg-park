import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindRaceLinks, linkedRace, replayTitle, setRaceLink, racecardDuration, reverseRacecardTime } from '../src/shared/race-links.mjs';
import { flag } from '../src/renderer/flags.mjs';
import { COUNTRY_CODES } from '../src/shared/countries.mjs';
import { racePresentation } from '../src/renderer/race-presentation.mjs';
import fs from 'node:fs/promises';

test('legacy race numbers link only inside the meeting and bind stable IDs', () => {
  const item = {kind:'race',raceNumber:1,title:'Race 01'}, race = {id:'one',number:1,title:'Trophy'};
  const meeting = {items:[item],registration:{races:[race]}};
  assert.equal(replayTitle(meeting,item),'Race 01 · Trophy'); bindRaceLinks(meeting); assert.equal(item.raceId,'one');
  race.number=8; meeting.registration.races.push({id:'two',number:1,title:'Another race'});
  assert.equal(linkedRace(meeting,item),race); assert.equal(replayTitle(meeting,item),'Race 08 · Trophy');
  assert.equal(linkedRace({registration:{races:[]}},item),null);
  meeting.registration.races.shift(); assert.equal(linkedRace(meeting,item),null);
});

test('manual links, unlinking and unknown races are handled explicitly', () => {
  const item={kind:'race',raceNumber:1}, meeting={items:[item],registration:{races:[{id:'two',number:2}]}};
  setRaceLink(meeting,item,'two'); assert.equal(linkedRace(meeting,item).number,2);
  setRaceLink(meeting,item,null); bindRaceLinks(meeting); assert.equal(linkedRace(meeting,item),null);
  assert.throws(()=>setRaceLink(meeting,item,'missing'),/no longer exists/);
  assert.throws(()=>setRaceLink(meeting,{kind:'ad'},'two'),/Only race/);
});

test('all selectable countries ship an offline SVG and unknown codes render safely', async () => {
  assert.ok(COUNTRY_CODES.includes('HU')); assert.ok(COUNTRY_CODES.includes('RO'));
  for(const code of COUNTRY_CODES) {
    const svg=await fs.readFile(new URL(`../assets/flags/${code.toLowerCase()}.svg`,import.meta.url),'utf8');
    assert.match(svg,/<svg/); assert.doesNotMatch(svg,/https?:\/\/(?!www\.w3\.org)/);
  }
  assert.match(flag('HU'),/assets\/flags\/hu.svg/); assert.match(flag('RO'),/alt="Romania"/);
  assert.doesNotMatch(flag('../../evil'),/<img/);
});

test('racecard escapes saved text and includes entries, conditions and results', () => {
  const race={number:1,title:'Trophy <script>',grade:'S3',distance:275,type:'Oval',breed:'Greyhound',entries:[{trap:1,dogId:'dog',weight:'31.5',finish:'1',time:'16.20',split:'3.4',remarks:'Clear run'}]};
  const meeting={date:'2026-10-24',registration:{title:'Derby',track:'Isaszeg Park',dogs:[{id:'dog',name:'Fast & free',country:'HU',owner:'Owner',trainer:'Trainer',preference:'W'}]}};
  const html=racePresentation(meeting,race);
  for(const text of ['Trophy &lt;script&gt;','275 m','Greyhound','Oval','Fast &amp; free','hu.svg','31.5 kg','Finish 1','16.20 s','Split 3.4 s','Clear run','Owner','Trainer']) assert.ok(html.includes(text),text);
  assert.equal((html.match(/class="broadcast-entry/g)||[]).length,6);
  const overlay=html.slice(html.indexOf('<div class="replay-details"'));
  for(const text of ['Fast &amp; free','hu.svg','Owner / Trainer','broadcast-trap-1']) assert.ok(overlay.includes(text),text);
  for(const text of ['REPLAY','31.5 kg','Finish 1','16.20 s','Split 3.4 s','Clear run','Empty trap','broadcast-origin']) assert.ok(!overlay.includes(text),text);
});

test('reverse prelude covers reading time plus the final second, including short clips', () => {
  const meeting={settings:{racecardSeconds:10}};
  assert.equal(racecardDuration(meeting),11);
  assert.equal(reverseRacecardTime(meeting,0,60),11);
  assert.ok(Math.abs(reverseRacecardTime(meeting,10,60)-1)<.001);
  assert.equal(reverseRacecardTime(meeting,11,60),0);
  assert.equal(reverseRacecardTime(meeting,20,60),0);
  assert.equal(reverseRacecardTime(meeting,0,4),3.96);
  assert.ok(Math.abs(reverseRacecardTime(meeting,5.5,4)-1.98)<.001);
});
