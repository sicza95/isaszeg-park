// Older meetings connect by programme number. Once saved, retain the race ID so
// editing its number cannot silently attach a recording to a different card.
export function linkedRace(meeting, item) {
  if (item?.kind !== 'race') return null;
  const races = meeting.registration?.races || [];
  return (Object.hasOwn(item, 'raceId')
    ? races.find(race => race.id === item.raceId)
    : races.find(race => race.number === item.raceNumber)) || null;
}

export function bindRaceLinks(meeting) {
  for (const item of meeting.items) {
    if (Object.hasOwn(item, 'raceId')) continue;
    const race = linkedRace(meeting, item);
    if (race) item.raceId = race.id;
  }
  return meeting;
}

export function setRaceLink(meeting, item, raceId) {
  if (item.kind !== 'race') throw new Error('Only race recordings can link to a race.');
  if (raceId !== null && !meeting.registration?.races.some(race => race.id === raceId)) throw new Error('This registered race no longer exists.');
  item.raceId = raceId;
}

export function replayTitle(meeting, item) {
  const race = linkedRace(meeting, item);
  return race ? `Race ${String(race.number).padStart(2, '0')} · ${race.title}` : item?.title || 'Isaszeg Park';
}

export function racecardSeconds(meeting) {
  const value = meeting.settings.racecardSeconds;
  return Number.isFinite(value) ? Math.min(60, Math.max(5, value)) : 10;
}

export const RACECARD_TRANSITION_SECONDS = 1;

export function racecardDuration(meeting) {
  return racecardSeconds(meeting) + RACECARD_TRANSITION_SECONDS;
}

// Short recordings run backwards more slowly so the background lasts for the
// whole card. Never seek past the last decodable frame or below zero.
export function reverseRacecardTime(meeting, position, mediaDuration) {
  const duration = racecardDuration(meeting);
  const start = Math.min(duration, Math.max(0, mediaDuration - .04));
  return start * Math.max(0, Math.min(1, 1 - position / duration));
}
