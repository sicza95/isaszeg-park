import { linkedRace, setRaceLink } from './race-links.mjs';
import { validateRegistration } from './registration.mjs';
import { validateReplaySections, REPLAY_RATES } from './instant-replays.mjs';

// Validate the entire edit before committing either media or runner changes.
export function applyMediaEdit(meeting, id, patch) {
  const draft = structuredClone(meeting), item = draft.items.find(item => item.id === id);
  if (!item) throw new Error('This item no longer exists.');
  if (Object.hasOwn(patch,'raceId')) setRaceLink(draft,item,patch.raceId);
  if (typeof patch.enabled === 'boolean') item.enabled = patch.enabled;
  if (typeof patch.title === 'string' && patch.title.trim()) item.title = patch.title.trim().slice(0,100);
  if (Number.isFinite(patch.seconds)) item.seconds = Math.min(120,Math.max(3,patch.seconds));
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
    draft.registration = validateRegistration(draft.registration);
  }
  meeting.items = draft.items;
  meeting.registration = draft.registration;
}
