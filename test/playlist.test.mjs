import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePlaylist, nextItem, commandForKey } from '../src/shared/playlist.mjs';
const item = (id, kind, enabled = true) => ({ id, kind, enabled });
test('sponsor cadence includes all enabled ads and preserves race order', () => {
  const meeting = { settings: { adEvery: 2 }, items: [item('banner', 'banner'), item('a', 'ad'), item('b', 'ad'), item('off', 'ad', false), ...[1, 2, 3].map(i => item(String(i), 'race'))] };
  assert.deepEqual(makePlaylist(meeting).map(x => x.id), ['banner', '1', '2', 'a', '3', 'b']);
});
test('empty, banners-only and ads-only loops are valid', () => {
  assert.deepEqual(makePlaylist({ items: [], settings: {} }), []);
  assert.deepEqual(makePlaylist({ items: [item('ad', 'ad')], settings: {} }).map(x => x.id), ['ad']);
  assert.equal(nextItem([], 'missing'), null);
  const queue = [item('a', 'race'), item('b', 'race')]; assert.equal(nextItem(queue, 'b').id, 'a'); assert.equal(nextItem(queue, 'a', -1).id, 'b');
});
test('typing, modifiers and repeated keys never trigger playback commands', () => {
  assert.equal(commandForKey({ key: ' ', target: { matches: () => true } }), null);
  assert.equal(commandForKey({ key: 's', ctrlKey: true }), null);
  assert.equal(commandForKey({ key: 's', repeat: true }), null);
  assert.deepEqual(commandForKey({ key: '2' }), { type: 'rate', rate: .5 });
  assert.deepEqual(commandForKey({ key: 'R' }), { type: 'latest' });
  assert.deepEqual(commandForKey({ key: 'Enter' }), { type: 'skip-racecard' });
  assert.equal(commandForKey({ key:'Enter',target:{matches:selector=>selector.includes('button')} }),null);
});
