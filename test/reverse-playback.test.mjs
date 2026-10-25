import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StageView } from '../src/renderer/player.mjs';

class Video extends EventTarget {
  duration = 20;
  readyState = 2;
  seeking = false;
  time = 0;
  seeks = [];
  callbacks = new Map();
  callbackId = 0;
  get currentTime() { return this.time; }
  set currentTime(value) { this.time = value; this.seeking = true; this.seeks.push(value); }
  pause() {}
  requestVideoFrameCallback(callback) { const id = ++this.callbackId; this.callbacks.set(id, callback); return id; }
  cancelVideoFrameCallback(id) { this.callbacks.delete(id); }
  finishSeek() { this.seeking = false; this.dispatchEvent(new Event('seeked')); }
  presentFrame(now, mediaTime = this.time) {
    const callbacks = [...this.callbacks.values()]; this.callbacks.clear();
    for (const callback of callbacks) callback(now, { mediaTime });
  }
}

function setup(t) {
  let now = 100;
  t.mock.method(performance, 'now', () => now);
  const video = new Video();
  const panel = { setAttribute() {}, querySelector: () => ({ textContent: '' }) };
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => panel };
  t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  const stage = { querySelector: selector => selector === 'video' ? video : {}, append() {}, style: { setProperty() {}, removeProperty() {} }, classList: { toggle() {}, remove() {} } };
  const view = new StageView(stage);
  view.cardClock = { meeting: { settings: { racecardSeconds: 10 } }, position: 0, paused: true, at: now };
  t.after(() => view.destroy());
  const draw = (time, position) => { now = time; view.cardClock.position = position; view.drawRacecard(now); };
  return { video, view, draw, setNow: value => { now = value; } };
}

test('reverse waits for media metadata before issuing its first seek', t => {
  const { video, draw } = setup(t);
  video.readyState = 0;
  draw(100, 0);
  assert.equal(video.seeks.length, 0);
  video.readyState = 1;
  draw(150, .05);
  assert.equal(video.seeks.length, 1);
});

test('reverse lets a completed seek reach the screen before requesting another frame', t => {
  const { video, draw, setNow } = setup(t);
  draw(100, 0);
  draw(150, .05);
  assert.equal(video.seeks.length, 1, 'Only one seek may be in flight');
  setNow(155); video.finishSeek();
  draw(170, .07);
  assert.equal(video.seeks.length, 1, 'seeked alone does not confirm a displayed frame');
  video.presentFrame(180);
  draw(210, .11);
  assert.equal(video.seeks.length, 2);
  assert.ok(Math.abs(video.seeks[1] - 10.89) < .001);
});

test('slow reverse decoding skips to the current card time instead of queuing old seeks', t => {
  const { video, draw, setNow } = setup(t);
  draw(100, 0);
  for (let at = 150; at <= 900; at += 50) draw(at, (at - 100) / 1000);
  assert.equal(video.seeks.length, 1);
  setNow(910); video.finishSeek(); video.presentFrame(920);
  draw(950, .85);
  assert.equal(video.seeks.length, 2);
  assert.ok(Math.abs(video.seeks[1] - 10.15) < .001);
});

test('a frame queued before a seek is ignored even if seeked has already fired', t => {
  const { video, draw, setNow } = setup(t);
  draw(100, 0);
  setNow(110); video.finishSeek();
  video.presentFrame(120, 0);
  draw(150, .05);
  assert.equal(video.seeks.length, 1);
  video.presentFrame(160);
  draw(200, .1);
  assert.equal(video.seeks.length, 2);
});

test('a hidden display or an unchanged source frame cannot block reverse forever', t => {
  const { video, draw, setNow } = setup(t);
  draw(100, 0);
  setNow(110); video.finishSeek();
  draw(500, .4);
  draw(525, .425);
  assert.equal(video.seeks.length, 2);
  assert.equal(video.callbacks.size, 1, 'The expired frame callback is cancelled');
});

test('older browsers pace completed reverse seeks without frame callbacks', t => {
  const { video, draw, setNow } = setup(t);
  video.requestVideoFrameCallback = undefined;
  draw(100, 0);
  setNow(110); video.finishSeek();
  draw(120, .02);
  assert.equal(video.seeks.length, 1);
  draw(150, .05);
  assert.equal(video.seeks.length, 2);
});

test('ending the racecard cancels pending reverse work before forward playback', t => {
  const { video, view, draw } = setup(t);
  draw(100, 0);
  assert.equal(video.callbacks.size, 1);
  view.stopRacecard();
  assert.equal(video.callbacks.size, 0);
  video.currentTime = 0;
  video.finishSeek(); video.presentFrame(200);
  view.drawRacecard(250);
  assert.equal(video.currentTime, 0);
  assert.equal(video.seeks.length, 2);
});

test('an already queued callback from a previous race cannot change the new seek', t => {
  const { video, view, draw } = setup(t);
  draw(100, 0);
  const stale = [...video.callbacks.values()][0];
  view.reverse.reset(); video.finishSeek();
  draw(200, .1);
  stale(210, { mediaTime: 11 });
  view.stopRacecard();
  assert.equal(video.callbacks.size, 0);
});
