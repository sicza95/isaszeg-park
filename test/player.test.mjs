import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/renderer/player.mjs';

// A controllable media surface lets us verify transport decisions without a codec
// or physical display. The desktop smoke test separately covers real media / IPC.
class Media extends EventTarget {
  constructor() { super(); this.currentTime = 0; this.duration = 20; this.paused = true; this.src = ''; this.playbackRate = 1; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  getAttribute(name) { return this[name]; }
}
function setup(t) {
  const video = new Media(), image = new Media();
  const view = { video, image, signature: null, show(item) {
    const signature = `${item.id}:${item.url}`;
    if (this.signature !== signature) { this.signature = signature; video.currentTime = 0; video.src = item.mediaType === 'video' ? item.url : ''; }
  } };
  const player = new Player(null, () => {}, view); t.after(() => player.destroy());
  const park = { id: 'park', builtin: 'park', title: 'Welcome', kind: 'banner', mediaType: 'image', url: 'park.jpg', enabled: true, seconds: 12 };
  const race = n => ({ id: `race${n}`, title: `Race ${n}`, raceNumber: n, kind: 'race', mediaType: 'video', url: `${n}.mp4`, enabled: true, importedAt: `2026-10-24T10:0${n}:00Z` });
  const meeting = { date: '2026-10-24', settings: { adEvery: 2, defaultRate: 1, muted: true }, items: [park, race(1)] };
  player.setMeeting(structuredClone(meeting));
  return { player, video, view, meeting, race };
}
function sponsorLoop(t, sponsorCount) {
  const state = setup(t);
  const { meeting, race, player } = state;
  meeting.date = '2026-10-04';
  meeting.settings.adEvery = 1;
  const sponsors = Array.from({ length: sponsorCount }, (_, i) => ({ id: `ad${i + 1}`, title: `Sponsor ${i + 1}`, kind: 'ad', mediaType: 'image', url: `ad${i + 1}.jpg`, seconds: 3, enabled: true }));
  meeting.items.push(...[2, 3, 4, 5].map(race), ...sponsors);
  player.setMeeting(structuredClone(meeting));
  const expected = ['park', ...[1, 2, 3, 4, 5].flatMap(n => [`race${n}`, sponsors[(n - 1) % sponsorCount].id])];
  return { ...state, expected };
}

for (const sponsorCount of [1, 2, 3]) {
  test(`five races and the banner complete two automatic loops with ${sponsorCount} sponsor(s)`, t => {
    const { player, video, expected } = sponsorLoop(t, sponsorCount);
    const played = [];
    for (let i = 0; i < expected.length * 2; i++) {
      played.push(player.status().id);
      if (player.item.mediaType === 'video') video.dispatchEvent(new Event('ended'));
      else { player.position = player.item.seconds; player.tick(); }
    }
    assert.deepEqual(played, [...expected, ...expected]);
    assert.equal(player.status().id, 'park');
  });
}

test('Next, Previous and the next-item label follow repeated sponsor slots in both directions', t => {
  const { player, expected, meeting } = sponsorLoop(t, 2);
  for (const direction of [1, -1]) {
    player.command({ type: 'play', id: 'park' });
    for (let step = 0; step < expected.length * 2; step++) {
      const index = ((step * direction) % expected.length + expected.length) % expected.length;
      assert.equal(player.status().id, expected[index]);
      // A state refresh must preserve the occurrence of a repeated sponsor.
      player.setMeeting(structuredClone(meeting));
      const nextId = expected[(index + 1) % expected.length];
      assert.equal(player.status().next, meeting.items.find(item => item.id === nextId).title);
      player.command({ type: direction === 1 ? 'next' : 'previous' });
    }
    assert.equal(player.status().id, 'park');
  }
});

test('the default two-race cadence completes the loop with a repeated video sponsor', t => {
  const { player, meeting, video } = sponsorLoop(t, 1);
  meeting.settings.adEvery = 2;
  const ad = meeting.items.find(item => item.kind === 'ad');
  ad.mediaType = 'video'; ad.url = 'ad1.mp4';
  player.setMeeting(structuredClone(meeting));
  const expected = ['park', 'race1', 'race2', 'ad1', 'race3', 'race4', 'ad1', 'race5'];
  for (const id of [...expected, ...expected]) {
    assert.equal(player.status().id, id);
    if (player.item.mediaType === 'video') video.dispatchEvent(new Event('ended'));
    else { player.position = player.item.seconds; player.tick(); }
  }
  assert.equal(player.status().id, 'park');
});

test('removing a sponsor during a replay keeps its position and includes every race in subsequent loops', t => {
  const { player, meeting, video } = sponsorLoop(t, 3);
  player.command({ type: 'play', id: 'race4' });
  video.currentTime = 7;
  meeting.items = meeting.items.filter(item => item.id !== 'ad3');
  player.setMeeting(structuredClone(meeting));
  assert.equal(video.currentTime, 7);
  const expected = ['race4', 'ad2', 'race5', 'ad1', 'park', 'race1', 'ad1', 'race2', 'ad2', 'race3', 'ad1'];
  for (const id of [...expected, ...expected]) {
    assert.equal(player.status().id, id);
    player.command({ type: 'next' });
  }
});

test('appending a race retains active playback position, URL and selected slow rate', t => {
  const { player, video, meeting, race } = setup(t);
  player.command({ type: 'latest' }); player.command({ type: 'rate', rate: .5 }); video.currentTime = 7.25;
  meeting.items.push(race(2)); player.setMeeting(structuredClone(meeting));
  assert.equal(player.status().id, 'race1'); assert.equal(video.src, '1.mp4'); assert.equal(video.currentTime, 7.25); assert.equal(video.playbackRate, .5); assert.equal(player.status().paused, false);
});
test('changing audio and sponsor settings does not restart a paused replay', t => {
  const { player, video, meeting } = setup(t); player.command({ type: 'latest' }); video.currentTime = 11;
  player.command({ type: 'toggle' }); meeting.settings.muted = false; meeting.settings.sponsorRail = true; player.setMeeting(structuredClone(meeting));
  assert.equal(video.currentTime, 11); assert.equal(video.muted, false); assert.equal(video.paused, true); assert.equal(player.status().paused, true);
});
test('manually held banner does not time out and Next resumes the playlist', t => {
  const { player } = setup(t); player.command({ type: 'holding' }); player.position = 1000; player.tick();
  assert.equal(player.status().mode, 'holding'); assert.equal(player.status().id, 'park');
  player.command({ type: 'next' }); assert.equal(player.status().id, 'race1'); assert.equal(player.status().mode, 'loop');
});
test('blackout pauses video and restores its prior pause state', t => {
  const { player, video } = setup(t); player.command({ type: 'latest' });
  player.command({ type: 'blackout' }); assert.equal(video.paused, true); assert.equal(player.status().blackout, true);
  player.command({ type: 'blackout' }); assert.equal(video.paused, false);
  player.command({ type: 'toggle' }); player.command({ type: 'blackout' }); player.command({ type: 'blackout' }); assert.equal(video.paused, true);
});
test('latest ignores disabled races and replaying the same item rewinds it', t => {
  const { player, video, meeting, race } = setup(t); const second = race(2); second.enabled = false; meeting.items.push(second); player.setMeeting(meeting);
  player.command({ type: 'latest' }); assert.equal(player.status().id, 'race1'); video.currentTime = 15;
  player.command({ type: 'play', id: 'race1' }); assert.equal(video.currentTime, 0);
});
test('scrubbing and seeking clamp to the clip, invalid rates are ignored', t => {
  const { player, video } = setup(t); player.command({ type: 'latest' });
  player.command({ type: 'scrub', fraction: 3 }); assert.ok(video.currentTime < 20);
  player.command({ type: 'seek', delta: -30 }); assert.equal(video.currentTime, 0);
  player.command({ type: 'rate', rate: 9 }); assert.equal(video.playbackRate, 1);
});
test('opening another meeting resets to its holding slide and configured default rate', t => {
  const { player, meeting } = setup(t); player.command({ type: 'latest' }); player.command({ type: 'rate', rate: .25 });
  meeting.date = '2026-10-25'; meeting.items = meeting.items.slice(0, 1); meeting.settings.defaultRate = .75; player.setMeeting(meeting);
  assert.equal(player.status().id, 'park'); assert.equal(player.status().rate, .75);
});

test('removing another item keeps the active replay position, pause state and slow rate', t => {
  const { player, video, meeting, race } = setup(t);
  meeting.items.push(race(2)); player.setMeeting(structuredClone(meeting));
  player.command({ type: 'play', id: 'race1' }); player.command({ type: 'rate', rate: .5 }); player.command({ type: 'toggle' });
  video.currentTime = 8.5;
  meeting.items = meeting.items.filter(item => item.id !== 'race2'); player.setMeeting(structuredClone(meeting));
  assert.equal(player.status().id, 'race1'); assert.equal(video.src, '1.mp4');
  assert.equal(video.currentTime, 8.5); assert.equal(video.playbackRate, .5); assert.equal(video.paused, true);
});

test('removing the playing video switches to remaining content', t => {
  const { player, video, meeting } = setup(t); player.command({ type: 'latest' });
  meeting.items = meeting.items.filter(item => item.id !== 'race1'); player.setMeeting(structuredClone(meeting));
  assert.equal(player.status().id, 'park'); assert.equal(video.src, '');
  assert.equal(player.available().some(item => item.id === 'race1'), false);
});

test('removing all media leaves a holding screen and Next safely stays there', t => {
  const { player, video, meeting } = setup(t); player.command({ type: 'latest' });
  meeting.items = []; player.setMeeting(structuredClone(meeting));
  assert.equal(player.status().id, 'holding'); assert.equal(player.status().mode, 'holding'); assert.equal(video.src, '');
  player.position = 1000; player.tick(); assert.equal(player.status().id, 'holding');
  player.command({ type: 'next' }); assert.equal(player.status().id, 'holding');
  meeting.date = '2026-10-25'; player.setMeeting(structuredClone(meeting));
  assert.equal(player.status().id, 'holding'); assert.equal(player.status().mode, 'holding');
});

test('removing the manually held banner replaces it with the fallback', t => {
  const { player, meeting } = setup(t); player.command({ type: 'holding' });
  meeting.items = meeting.items.filter(item => item.id !== 'park'); player.setMeeting(structuredClone(meeting));
  assert.equal(player.status().id, 'holding'); assert.equal(player.status().mode, 'holding');
  player.command({ type: 'next' }); assert.equal(player.status().id, 'race1');
});

function registerFirst(meeting) {
  meeting.registration = {title:'Derby finals',track:'Isaszeg Park',dogs:[],races:[{id:'card1',number:1,title:'CGRC Trophy',grade:'S3',distance:275,type:'Oval',breed:'Greyhound',entries:[]}]};
  meeting.settings.racecardSeconds = 10;
}

test('linked replays show a timed card before starting video, including metadata readiness', t => {
  const {player,video,meeting} = setup(t); registerFirst(meeting); player.setMeeting(meeting);
  player.command({type:'play',id:'race1'});
  assert.equal(player.status().phase,'racecard'); assert.equal(player.status().title,'Race 01 · CGRC Trophy');
  assert.equal(player.status().duration,11); assert.equal(video.paused,true);
  video.dispatchEvent(new Event('loadedmetadata')); assert.equal(video.paused,true);
  player.command({type:'scrub',fraction:.8}); player.command({type:'seek',delta:5}); assert.equal(video.currentTime,0);
  player.position = 10; player.tick();
  assert.equal(player.status().phase,'racecard'); assert.equal(player.status().transitioning,true); assert.equal(video.paused,true);
  player.position = 11; player.tick();
  assert.equal(player.status().phase,'media'); assert.equal(video.paused,false); assert.equal(video.currentTime,0);
});

test('pause and blackout freeze the racecard, resume never starts hidden video', t => {
  const {player,video,meeting} = setup(t); registerFirst(meeting); player.setMeeting(meeting); player.command({type:'latest'});
  player.position=3; player.command({type:'toggle'}); player.last-=1000; player.tick(); assert.equal(player.position,3);
  player.command({type:'toggle'}); assert.equal(video.paused,true);
  player.command({type:'blackout'}); player.last-=1000; player.tick(); assert.equal(player.position,3);
  player.command({type:'blackout'}); assert.equal(video.paused,true); assert.equal(player.status().paused,false);
  player.command({type:'skip-racecard'}); assert.equal(player.position,10); assert.equal(player.status().transitioning,true);
  player.position=11; player.tick(); assert.equal(video.paused,false); assert.equal(player.status().phase,'media');
});

test('every route into a linked replay shows its card and replay starts at zero', t => {
  const {player,video,meeting} = setup(t); registerFirst(meeting); player.setMeeting(meeting);
  for (const command of [{type:'next'},{type:'latest'},{type:'play',id:'race1'}]) {
    player.command(command); assert.equal(player.status().phase,'racecard'); assert.equal(video.paused,true);
    player.command({type:'skip-racecard'}); player.position=11; player.tick(); video.currentTime=12;
    player.command({type:'holding'});
  }
  player.command({type:'previous'}); assert.equal(player.status().phase,'racecard'); assert.equal(video.currentTime,0);
});

test('editing the linked card updates the title without interrupting video', t => {
  const {player,video,meeting} = setup(t); registerFirst(meeting); player.setMeeting(meeting); player.command({type:'latest'}); player.position=11; player.tick();
  video.currentTime=7; meeting.registration.races[0].title='Derby final'; player.setMeeting(structuredClone(meeting));
  assert.equal(player.status().title,'Race 01 · Derby final'); assert.equal(video.currentTime,7); assert.equal(player.status().phase,'media');
  player.command({type:'play',id:'race1'}); meeting.items[1].raceId=null; player.setMeeting(structuredClone(meeting));
  assert.equal(player.status().phase,'media'); assert.equal(video.paused,false);
});

test('reverse prelude is silent and restores audio and speed only for forward replay', t => {
  const {player,video,meeting}=setup(t); registerFirst(meeting); meeting.settings.muted=false;
  player.setMeeting(meeting); player.command({type:'latest'}); player.command({type:'rate',rate:.5});
  assert.equal(video.muted,true); assert.equal(video.paused,true);
  player.setMeeting(structuredClone(meeting)); assert.equal(video.muted,true);
  player.position=11; player.tick();
  assert.equal(video.muted,false); assert.equal(video.playbackRate,.5); assert.equal(video.currentTime,0);
});

test('skip retains pause and repeated skip commands do not restart the transition or replay', t => {
  const {player,video,meeting}=setup(t); registerFirst(meeting); player.setMeeting(meeting); player.command({type:'latest'});
  player.command({type:'toggle'}); player.command({type:'skip-racecard'});
  player.last-=1000; player.tick(); assert.equal(player.position,10); assert.equal(video.paused,true);
  player.command({type:'toggle'}); player.position=10.5; player.command({type:'skip-racecard'});
  assert.equal(player.position,10.5);
  player.position=11; player.tick(); video.currentTime=4; player.command({type:'skip-racecard'});
  assert.equal(video.currentTime,4); assert.equal(player.status().phase,'media');
});

function timedReplay(t) {
  const state = setup(t), { player, meeting } = state;
  registerFirst(meeting);
  meeting.registration.races[0].entries = [{trap:4,dogId:'winner',finish:'1',time:'29.11'},{trap:2,dogId:'absent',finish:'NR'}];
  player.setMeeting(meeting); player.command({type:'latest'}); player.position=11; player.tick();
  return state;
}

test('recorded times add a results outro on the final frame before advancing the loop', t => {
  const { player, video } = timedReplay(t);
  video.currentTime=20; video.dispatchEvent(new Event('ended'));
  assert.equal(player.status().phase,'results'); assert.equal(player.status().id,'race1');
  assert.equal(player.status().position,0); assert.equal(player.status().mediaPosition,20);
  assert.equal(video.paused,true); assert.equal(video.muted,true);
  video.dispatchEvent(new Event('ended')); assert.equal(player.status().phase,'results');
  player.position=player.status().duration; player.tick();
  assert.equal(player.status().id,'park'); assert.equal(player.status().phase,'media');
});

test('pause, blackout and metadata keep results frozen; media transport cannot seek or restart footage', t => {
  const { player, video, meeting } = timedReplay(t);
  video.currentTime=20; video.dispatchEvent(new Event('ended'));
  player.position=1.2; player.command({type:'toggle'}); player.last-=1000; player.tick();
  assert.equal(player.status().position,1.2);
  for (const command of [{type:'seek',delta:-5},{type:'scrub',fraction:.1},{type:'skip-racecard'}]) player.command(command);
  assert.equal(video.currentTime,20);
  player.setMeeting(structuredClone(meeting)); assert.equal(player.status().position,1.2);
  video.dispatchEvent(new Event('loadedmetadata')); assert.equal(video.paused,true);
  player.command({type:'toggle'}); assert.equal(video.paused,true);
  player.command({type:'blackout'}); player.last-=1000; player.tick(); assert.equal(player.status().position,1.2);
  player.command({type:'blackout'}); assert.equal(video.paused,true);
  player.command({type:'next'}); assert.equal(player.status().id,'park');
  player.command({type:'previous'}); assert.equal(player.status().phase,'racecard');
});

test('untimed replays advance directly and removing the active results safely advances', t => {
  const { player, video, meeting } = timedReplay(t);
  video.dispatchEvent(new Event('ended'));
  meeting.registration.races[0].entries=[];
  player.setMeeting(structuredClone(meeting)); assert.equal(player.status().id,'park');
  player.command({type:'latest'}); player.position=11; player.tick();
  video.dispatchEvent(new Event('ended')); assert.equal(player.status().id,'park');
});

test('dedicated jump commands restart each section while preserving pause, rate and race',t=>{
  const {player,video}=timedReplay(t);
  player.command({type:'rate',rate:.5});player.command({type:'toggle'});video.currentTime=8;
  player.command({type:'jump-results'});assert.equal(player.phase,'results');assert.ok(video.currentTime>19.9);assert.equal(player.position,0);assert.equal(video.paused,true);
  player.position=2;player.command({type:'jump-results'});assert.equal(player.position,0);
  player.command({type:'jump-racecard'});assert.equal(player.phase,'racecard');assert.equal(player.position,0);
  player.command({type:'jump-replay'});assert.equal(player.phase,'media');assert.equal(video.currentTime,0);assert.equal(player.paused,true);assert.equal(player.rate,.5);
  assert.equal(player.item.id,'race1');player.command({type:'toggle'});assert.equal(video.paused,false);
});

test('jumping to unavailable results or a banner safely does nothing',t=>{
  const {player,video,meeting}=setup(t);registerFirst(meeting);player.setMeeting(meeting);player.command({type:'latest'});
  player.command({type:'jump-results'});assert.equal(player.phase,'racecard');
  player.command({type:'jump-replay'});assert.equal(player.phase,'media');assert.equal(video.paused,false);
  player.command({type:'holding'});player.command({type:'jump-racecard'});player.command({type:'jump-replay'});assert.equal(player.item.id,'park');
});
