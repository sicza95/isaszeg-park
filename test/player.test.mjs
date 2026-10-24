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
