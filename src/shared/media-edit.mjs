import { linkedRace, setRaceLink } from './race-links.mjs';
import { validateRegistration } from './registration.mjs';
import { validateReplaySections, REPLAY_RATES } from './instant-replays.mjs';
import { isColor } from './media-settings.mjs';
import { unresolvedUntimedRunners } from './race-results.mjs';

// Validate the entire edit before committing either media or runner changes.
export function applyMediaEdit(meeting, id, patch) {
  const draft = structuredClone(meeting), item = draft.items.find(item => item.id === id);
  if (!item) throw new Error('This item no longer exists.');
  if (Object.hasOwn(patch,'raceId')) setRaceLink(draft,item,patch.raceId);
  if (typeof patch.enabled === 'boolean') item.enabled = patch.enabled;
  if (typeof patch.title === 'string' && patch.title.trim()) item.title = patch.title.trim().slice(0,100);
  if (patch.seconds === null || patch.seconds === '') delete item.seconds;
  else if (Number.isFinite(patch.seconds)) item.seconds = Math.min(120,Math.max(3,patch.seconds));
  for (const key of ['sponsorBackground', 'sponsorForeground']) {
    if (!Object.hasOwn(patch,key)) continue;
    if (item.kind !== 'ad') throw new Error('Footer colors can only be set for sponsors.');
    if (patch[key] === null || patch[key] === '') delete item[key];
    else {
      if (!isColor(patch[key])) throw new Error('Choose a valid footer color.');
      item[key] = patch[key];
    }
  }
  if (Object.hasOwn(patch,'replaySections')) {
    if (item.kind !== 'race' || item.mediaType !== 'video') throw new Error('Instant replays need a race video.');
    item.replaySections = validateReplaySections(patch.replaySections);
  }
  if (patch.replayRate) {
    const section=item.replaySections?.find(section=>section.id===patch.replayRate.id);
    if(item.kind!=='race' || item.mediaType!=='video' || !section)throw new Error('This replay moment no longer exists.');
    if(!REPLAY_RATES.includes(patch.replayRate.rate))throw new Error('Choose a replay speed.');
    section.rate=patch.replayRate.rate;
  }
  if (patch.runnerResults) {
    const race = linkedRace(draft,item), results = patch.runnerResults;
    if (!race || results.raceId !== race.id || !Array.isArray(results.entries) || results.entries.length !== race.entries.length || new Set(results.entries.map(entry=>entry.trap)).size !== results.entries.length) throw new Error('The linked race changed. Reopen the editor and try again.');
    race.entries = race.entries.map(entry => {
      const edit = results.entries.find(edit => edit.trap === entry.trap);
      if (!edit) throw new Error('The runners changed. Reopen the editor and try again.');
      return {...entry, status: edit.status, time: edit.time, split: edit.split};
    });
    if (item.resultsPending) {
      const unresolved = unresolvedUntimedRunners(race);
      if (unresolved.length) {
        const confirmed = patch.confirmNonRunnerTraps;
        if (!Array.isArray(confirmed) || confirmed.length !== unresolved.length || new Set(confirmed).size !== confirmed.length || unresolved.some(entry=>!confirmed.includes(entry.trap))) throw new Error('Confirm the dogs without finish times before saving this new video.');
        for (const entry of unresolved) entry.status = 'NR';
      }
      delete item.resultsPending;
    }
    draft.registration = validateRegistration(draft.registration,{previous:meeting.registration,editedRaceId:race.id});
  }
  meeting.items = draft.items;
  meeting.registration = draft.registration;
}
