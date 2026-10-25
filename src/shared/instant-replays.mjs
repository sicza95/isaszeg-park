export const REPLAY_RATES = [.25, .5, .75, 1];
export const REPLAY_TRANSITION_SECONDS = .45;
export const replayTransitionSeconds = (section, rate = section.rate) => Math.min(REPLAY_TRANSITION_SECONDS,(section.end-section.start)/rate/3);

export function validateReplaySections(input) {
  if (!Array.isArray(input) || input.length > 64) throw new Error('Use up to 64 instant replay moments.');
  const ids = new Set();
  return input.map(section => {
    if (!section || typeof section.id !== 'string' || !section.id || section.id.length>160 || ids.has(section.id)) throw new Error('Each replay moment needs a unique ID.');
    ids.add(section.id);
    if (!Number.isFinite(section.start) || !Number.isFinite(section.end) || section.start < 0 || section.end - section.start + 1e-6 < .2) throw new Error('Replay moments must last at least 0.2 seconds and start within the video.');
    if (!REPLAY_RATES.includes(section.rate)) throw new Error('Choose a replay speed.');
    return {id: section.id.slice(0,160), start: section.start, end: section.end, rate: section.rate, label: typeof section.label === 'string' ? section.label.trim().slice(0,40) : ''};
  }).sort((a,b) => a.start-b.start);
}

// Clamp saved ranges to the actual recording, including replaced/shortened files.
export function replaySections(item, duration = Infinity) {
  if (item?.kind !== 'race' || item.mediaType !== 'video') return [];
  try {
    return validateReplaySections(item.replaySections || []).map(section => ({...section, end: Math.min(section.end,duration)})).filter(section => section.end-section.start + 1e-6 >= .2);
  } catch { return []; }
}

export const replayTime = seconds => `${Math.floor(Math.max(0,seconds)/60)}:${(Math.max(0,seconds)%60).toFixed(1).padStart(4,'0')}`;

export function replayTrackGradient(sections, duration) {
  if (!Number.isFinite(duration) || duration<=0) return '#55555f';
  const ranges=[];
  for(const section of sections.slice().sort((a,b)=>a.start-b.start)){
    const start=Math.max(0,Math.min(100,section.start/duration*100)),end=Math.max(0,Math.min(100,section.end/duration*100));
    if(end<=start)continue;
    if(ranges.length && start<=ranges.at(-1).end)ranges.at(-1).end=Math.max(ranges.at(-1).end,end);
    else ranges.push({start,end});
  }
  if(!ranges.length)return '#55555f';
  const stops=['#55555f 0%'];
  for(const {start,end} of ranges)stops.push(`#55555f ${start}%`,`#d6b47b ${start}%`,`#d6b47b ${end}%`,`#55555f ${end}%`);
  return `linear-gradient(to right, ${stops.join(', ')}, #55555f 100%)`;
}
