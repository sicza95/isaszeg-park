import { test } from 'node:test';
import assert from 'node:assert/strict';
import { raceResults, finishTime, formatResultTime, finishingOrder, entryStatus, resultWarnings, assertUniqueFinishTimes, RESULTS_ROW_SECONDS } from '../src/shared/race-results.mjs';
import { racePresentation } from '../src/renderer/race-presentation.mjs';

const runner = (trap, finish, time = '', extra = {}) => ({ trap, dogId: `dog${trap}`, finish, time, ...extra });
const race = entries => ({ number: 1, title: 'Final <race>', grade: 'A1', distance: 485, breed: 'Greyhound', type: 'Oval', entries });
function presentation(entries) {
  const meeting = { date: '2026-10-25', registration: { title: 'Derby', track: 'Isaszeg', dogs: entries.map(entry => ({ id: entry.dogId, name: `Dog & ${entry.trap}`, country: 'HU' })) } };
  const html = racePresentation(meeting,race(entries));
  return html.includes('<div class="results-card') ? html.slice(html.indexOf('<div class="results-card')) : '';
}

test('results calculate places by time, separate statuses, and leave input order intact', () => {
  const entries = [runner(1,'DNF'),runner(2,'3','30.02'),runner(3,'NR'),runner(4,'1','29.11'),runner(5,'DQ'),runner(6,'2','29.05')];
  const results = raceResults(race(entries));
  assert.deepEqual(results.finishers.map(entry => entry.trap),[6,4,2]);
  assert.deepEqual([...results.places],[[6,1],[4,2],[2,3]]);
  assert.deepEqual(results.others.map(entry => entry.trap),[1,3,5]);
  assert.deepEqual(entries.map(entry => entry.trap),[1,2,3,4,5,6]);
  assert.ok(results.othersAt >= results.revealAt(2)+RESULTS_ROW_SECONDS+1);
  assert.ok(results.duration > results.completeAt+5);
  const html = presentation(entries);
  assert.ok(html.indexOf('data-trap="6"') < html.indexOf('data-trap="4"'));
  assert.ok(html.indexOf('data-trap="2"') < html.indexOf('results-others'));
  for (const text of ['Non-runner','Did not finish','Disqualified','Dog &amp; 4','Final &lt;race&gt;']) assert.ok(html.includes(text));
});

test('untimed runners stay unplaced even if legacy data assigned a finish position', () => {
  const entries = [runner(1,'1','29.00'),runner(2,'2'),runner(3,'','30.02'),runner(4,''),runner(5,'2','29.20')];
  const results = raceResults(race(entries));
  assert.deepEqual(results.finishers.map(entry => entry.trap),[1,5,3]);
  assert.deepEqual(results.others.map(entry => entry.trap),[2,4]);
  assert.equal(results.places.has(2),false);
  const html = presentation(entries);
  for (const text of ['Not timed','Finished','Entered']) assert.ok(html.includes(text));
  assert.ok(!html.includes('0—'));
});

test('identical finish times warn and cannot receive places or play results',()=>{
  const entries=[runner(1,'','29.10',{status:'FIN'}),runner(2,'','29.10',{status:'FIN'}),runner(3,'','29.20',{status:'FIN'}),runner(4,'','28.00',{status:'ENTERED'}),runner(5,'','27.00',{status:'DQ'})];
  assert.deepEqual([...finishingOrder({entries}).places],[]);
  assert.match(resultWarnings({entries}).message,/Identical finish times for traps 1, 2/);
  assert.throws(()=>assertUniqueFinishTimes({number:1,entries}),/identical finish times/);
  assert.equal(raceResults({entries}).hasTimes,false);
  assert.equal(presentation(entries),'');
  assert.equal(entryStatus(runner(1,'NR')),'NR');
  assert.equal(entryStatus(runner(1,'','29.10')),'FIN');
  assert.equal(entryStatus({}),'EMPTY');
  assert.equal(entryStatus({status:'FIN'}),'EMPTY');
  assert.equal(entryStatus({dogId:'dog',status:'EMPTY'}),'ENTERED');
});

test('thousandths decide places while displayed times floor to hundredths without rounding errors',()=>{
  const entries=[runner(1,'','16.819',{status:'FIN'}),runner(2,'','16.811',{status:'FIN'})];
  assert.deepEqual([...finishingOrder({entries}).places],[[2,1],[1,2]]);
  const html=presentation(entries);
  assert.ok(html.indexOf('data-trap="2"')<html.indexOf('data-trap="1"'));
  assert.equal((html.match(/<strong>16.81<\/strong>/g)||[]).length,2);
  assert.doesNotMatch(html,/16\.819|16\.811|16\.82/);
  for(const [input,expected] of [['16.81','16.81'],['19.999','19.99'],['1.019','1.01'],['29','29.00'],['29.1','29.10'],['0.001','0.00'],['0.999','0.99']])assert.equal(formatResultTime(input),expected);
  for(const value of ['',0,-1,'NaN',Infinity])assert.equal(formatResultTime(value),'');
  assert.throws(()=>assertUniqueFinishTimes({number:1,entries:[runner(1,'','29.10'),runner(2,'','29.100')]}),/identical/);
});

test('outro requires a valid finish time and labels estimated times clearly', () => {
  for (const entries of [[],[runner(1,'1')],[runner(1,'DNF','20')],[runner(1,'','NaN')],[runner(1,'','0')],[runner(1,'','', { split:'6.22' })]]) {
    assert.equal(raceResults(race(entries)).duration,0);
    assert.equal(presentation(entries),'');
  }
  assert.equal(finishTime(runner(1,'1','29.12',{estimatedTime:'29.30'})),'29.12');
  const entries = [runner(1,'1','',{estimatedTime:'29.30'})];
  assert.equal(raceResults(race(entries)).hasTimes,true);
  assert.match(presentation(entries),/29.30.*<small>EST\.<\/small>/);
});

test('split column uses split times, leaves missing values blank, and never substitutes final split', () => {
  const entries = [runner(1,'1','29.00',{split:'6.22',finalSplit:'22.78'}),runner(2,'2','29.20')];
  const html = presentation(entries);
  assert.match(html,/has-splits/);
  assert.match(html,/>SPLIT</);
  assert.match(html,/class="result-split">6.22<\/div>/);
  assert.ok(!html.includes('22.78'));
  assert.match(html,/class="result-split">—</);
  assert.ok(!presentation([runner(1,'1','29.00',{finalSplit:'22.78'})]).includes('has-splits'));
});

test('inactive race-card rows are greyed and retained disqualified times stay out of results',()=>{
  const entries=[runner(1,'','29.00',{status:'FIN'}),runner(2,'','28.10',{status:'DQ',estimatedTime:'28.20',split:'6.10',finalSplit:'22.00'}),runner(3,'','',{status:'NR'})];
  const meeting={date:'2026-10-25',registration:{title:'Derby',track:'Isaszeg',dogs:entries.map(entry=>({id:entry.dogId,name:`Dog ${entry.trap}`}))}};
  const html=racePresentation(meeting,race(entries));
  for(const trap of [2,3,4,5,6])assert.match(html,new RegExp(`broadcast-entry broadcast-inactive[^\"]*\" data-trap=\"${trap}\"`));
  assert.match(html,/broadcast-entry\" data-trap=\"1\"/);
  for(const value of ['28.10','28.20','6.10','22.00'])assert.ok(!html.includes(value),`Inactive runner time ${value} stays private`);
  assert.match(presentation(entries),/Disqualified/);
  assert.equal(entries[1].time,'28.10');
});
