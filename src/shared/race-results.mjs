export const RESULT_STATUSES = { NR: 'Non-runner', DNF: 'Did not finish', DQ: 'Disqualified' };
export const RUNNER_STATUSES = { EMPTY: 'Empty trap', ENTERED: 'Entered', FIN: 'Finished', ...RESULT_STATUSES };
export const RESULTS_ROW_SECONDS = .72;
export const RESULTS_EXIT_SECONDS = .8;

const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const resultTimeFormat = new Intl.NumberFormat('en-US', {useGrouping:false,minimumFractionDigits:2,maximumFractionDigits:2,roundingMode:'floor'});
export const formatResultTime = value => positive(value) ? resultTimeFormat.format(Number(value)) : '';
export function validFinishTime(value) {
  const milliseconds = Number(value)*1000;
  return positive(value) && Number(value)>=.001 && Number.isSafeInteger(Math.round(milliseconds)) && Math.abs(milliseconds-Math.round(milliseconds))<1e-7;
}
export const finishTime = entry => positive(entry.time) ? entry.time : positive(entry.estimatedTime) ? entry.estimatedTime : '';
export function entryStatus(entry = {}) {
  if (!entry.dogId) return 'EMPTY';
  if (Object.hasOwn(RUNNER_STATUSES,entry.status) && entry.status!=='EMPTY') return entry.status;
  if (Object.hasOwn(RESULT_STATUSES,entry.finish)) return entry.finish;
  return finishTime(entry) || /^[1-6]$/.test(String(entry.finish)) ? 'FIN' : 'ENTERED';
}

export function finishingOrder(race) {
  const finishers = (race?.entries || []).filter(entry => entry.dogId && entryStatus(entry)==='FIN' && finishTime(entry))
    .sort((a,b) => Number(finishTime(a))-Number(finishTime(b)) || a.trap-b.trap);
  const places = new Map();
  const groups = new Map();
  for (const entry of finishers) {
    const time = Number(finishTime(entry));
    if (!groups.has(time)) groups.set(time,[]);
    groups.get(time).push(entry);
  }
  const duplicateTimes = [...groups.values()].filter(entries=>entries.length>1);
  if (!duplicateTimes.length) finishers.forEach((entry,index)=>places.set(entry.trap,index+1));
  return {finishers,places,duplicateTimes};
}

export function assertUniqueFinishTimes(race) {
  const {duplicateTimes} = finishingOrder(race);
  if (duplicateTimes.length) throw new Error(`Race ${race.number}: identical finish times for traps ${duplicateTimes[0].map(entry=>entry.trap).join(', ')}. Enter distinct times using up to three decimal places.`);
}

export function unresolvedUntimedRunners(race) {
  return (race?.entries || []).filter(entry => entry.dogId && !positive(entry.time) && ['ENTERED','FIN'].includes(entryStatus(entry)));
}

export function resultWarnings(race, {hasVideo = false} = {}) {
  const entries = (race?.entries || []).filter(entry => entry.dogId);
  const finished = entries.filter(entry => entryStatus(entry) === 'FIN');
  const missingTimes = finished.filter(entry => !positive(entry.time));
  const invalidEntered = hasVideo ? entries.filter(entry => entryStatus(entry) === 'ENTERED') : [];
  const {duplicateTimes} = finishingOrder(race);
  const traps = values => `trap${values.length === 1 ? '' : 's'} ${values.map(entry => entry.trap).sort((a,b)=>a-b).join(', ')}`;
  const messages = [];
  if (entries.length && !finished.length) messages.push('No dogs marked as finished.');
  if (missingTimes.length) messages.push(`Missing finish time: ${traps(missingTimes)}.`);
  if (invalidEntered.length) messages.push(`Entered status is invalid with a race video: ${traps(invalidEntered)}. Choose a result status.`);
  for (const group of duplicateTimes) messages.push(`Identical finish times for ${traps(group)}. Enter distinct times using up to three decimal places.`);
  return { missingTimes, invalidEntered, duplicateTimes, message: messages.join(' ') };
}

// Places are derived from finish times; legacy manually entered places are ignored.
export function raceResults(race, settings = {}) {
  const entries = (race?.entries || []).filter(entry => entry.dogId);
  const {finishers,places,duplicateTimes} = finishingOrder(race);
  const others = entries.filter(entry => !finishers.includes(entry)).sort((a,b) => a.trap-b.trap);
  const hasTimes = finishers.length>0 && !duplicateTimes.length;
  const revealAt = index => .6 + index * .56;
  const finishersComplete = revealAt(Math.max(0,finishers.length-1)) + RESULTS_ROW_SECONDS;
  const othersAt = finishersComplete + 1.25;
  const completeAt = others.length ? othersAt + (others.length-1)*.14 + RESULTS_ROW_SECONDS : finishersComplete;
  const holdSeconds = Number.isFinite(settings.resultsSeconds) ? Math.max(1,Math.min(120,settings.resultsSeconds)) : 5;
  return { finishers, places, others, hasTimes, revealAt, othersAt, completeAt, holdSeconds, exitAt: completeAt+holdSeconds, duration: hasTimes ? completeAt+holdSeconds+RESULTS_EXIT_SECONDS : 0 };
}
