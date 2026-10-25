export const RESULT_STATUSES = { NR: 'Non-runner', DNF: 'Did not finish', DQ: 'Disqualified' };
export const RUNNER_STATUSES = { EMPTY: 'Empty trap', ENTERED: 'Entered', FIN: 'Finished', ...RESULT_STATUSES };
export const RESULTS_ROW_SECONDS = .72;
export const RESULTS_EXIT_SECONDS = .8;

const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
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
  for (let index=0;index<finishers.length;index++) {
    const tied = index>0 && Number(finishTime(finishers[index]))===Number(finishTime(finishers[index-1]));
    places.set(finishers[index].trap,tied?places.get(finishers[index-1].trap):index+1);
  }
  return {finishers,places};
}

// Places are derived from finish times; legacy manually entered places are ignored.
export function raceResults(race) {
  const entries = (race?.entries || []).filter(entry => entry.dogId);
  const {finishers,places} = finishingOrder(race);
  const others = entries.filter(entry => !finishers.includes(entry)).sort((a,b) => a.trap-b.trap);
  const hasTimes = finishers.some(entry => finishTime(entry));
  const revealAt = index => .6 + index * .56;
  const finishersComplete = revealAt(Math.max(0,finishers.length-1)) + RESULTS_ROW_SECONDS;
  const othersAt = finishersComplete + 1.25;
  const completeAt = others.length ? othersAt + (others.length-1)*.14 + RESULTS_ROW_SECONDS : finishersComplete;
  return { finishers, places, others, hasTimes, revealAt, othersAt, completeAt, exitAt: completeAt+5, duration: hasTimes ? completeAt+5+RESULTS_EXIT_SECONDS : 0 };
}
