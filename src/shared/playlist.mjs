export const RATES = [0.25, 0.5, 0.75, 1];
export function holdingItem(meeting) {
  return meeting.items.find(item => item.builtin === 'park') || { id: 'holding', title: 'Isaszeg Park', kind: 'banner', mediaType: 'image', url: '../../assets/park.jpg', seconds: 12 };
}
export function makePlaylist(meeting) {
  const items = meeting.items.filter(item => item.enabled);
  const ads = items.filter(item => item.kind === 'ad');
  const content = items.filter(item => item.kind !== 'ad');
  if (!content.length) return ads;
  const queue = []; let races = 0; let adCount = 0;
  const interval = Math.max(1, meeting.settings.adEvery || 2);
  for (const item of content) {
    queue.push(item);
    if (item.kind === 'race' && ++races % interval === 0 && ads.length) { queue.push(ads[adCount++ % ads.length]); }
  }
  // Every enabled ad receives a slot, including on a meeting with no races yet.
  if (adCount < ads.length) queue.push(...ads.slice(adCount));
  return queue;
}
export function nextItem(queue, currentId, direction = 1) {
  if (!queue.length) return null;
  const index = queue.findIndex(x => x.id === currentId);
  if (index === -1) return queue[0];
  return queue[(index + direction + queue.length) % queue.length];
}
export function commandForKey(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return null;
  if (event.target?.matches?.('input, textarea, select, [contenteditable="true"]')) return null;
  const commands = {
    ' ': { type: 'toggle' }, ArrowLeft: { type: 'seek', delta: -5 }, ArrowRight: { type: 'seek', delta: 5 },
    n: { type: 'next' }, p: { type: 'previous' }, r: { type: 'latest' }, b: { type: 'holding' },
    s: { type: 'cycle-rate' }, f: { type: 'fullscreen' },
    '1': { type: 'rate', rate: 0.25 }, '2': { type: 'rate', rate: 0.5 }, '3': { type: 'rate', rate: 0.75 }, '4': { type: 'rate', rate: 1 }
  };
  return commands[event.key.length === 1 ? event.key.toLowerCase() : event.key] || null;
}
export function formatTime(seconds = 0) {
  if (!Number.isFinite(seconds)) seconds = 0;
  return `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
}
