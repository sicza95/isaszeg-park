import { escapeHTML as e } from './icons.mjs';
import { flag } from './flags.mjs';
import { TRAPS } from '../shared/traps.mjs';

export function racePresentation(meeting, race) {
  const registration = meeting.registration;
  const meta = [race.grade || 'Ungraded', `${race.distance} m`, race.breed, race.type];
  const header = `<header class="race-broadcast-header"><div class="race-broadcast-number">${String(race.number).padStart(2,'0')}</div><div class="race-broadcast-heading"><div class="race-broadcast-meeting">${e(registration.title)} · ${e(registration.track)} · ${e(meeting.date)}</div><h2>${e(race.title)}</h2><div class="race-broadcast-meta">${meta.map(value=>`<span>${e(value)}</span>`).join('')}</div></div></header>`;
  const entries = Array.from({length:6},(_,index)=>{
    const trap = index+1, entry = race.entries.find(value=>value.trap===trap);
    const dog = registration.dogs.find(value=>value.id===entry?.dogId);
    const badge = `<span class="broadcast-trap broadcast-trap-${trap}" title="${e(TRAPS[index].description)}">${trap}</span>`;
    if (!dog) return `<article class="broadcast-entry empty-trap">${badge}<div class="broadcast-dog"><strong>Empty trap</strong></div></article>`;
    const details = [dog.preference && `Run ${dog.preference}`, entry.weight && `${entry.weight} kg`, entry.finish && `Finish ${entry.finish}`, entry.time && `${entry.time} s`, entry.estimatedTime && entry.estimatedTime !== entry.time && `Est. ${entry.estimatedTime} s`, entry.split && `Split ${entry.split} s`, entry.finalSplit && `Final split ${entry.finalSplit} s`, entry.going && `Going ${entry.going}`].filter(Boolean);
    const people = dog.owner && dog.owner === dog.trainer ? `Owner / trainer: ${e(dog.owner)}` : `Owner: ${e(dog.owner || '—')}${dog.trainer?` · Trainer: ${e(dog.trainer)}`:''}`;
    return `<article class="broadcast-entry">${badge}<div class="broadcast-dog"><div class="broadcast-dog-name">${flag(dog.country)}<strong>${e(dog.name)}</strong></div><div class="broadcast-people">${people}</div>${details.length?`<div class="broadcast-results">${details.map(value=>`<span>${e(value)}</span>`).join('')}</div>`:''}${entry.remarks?`<div class="broadcast-remarks">${e(entry.remarks)}</div>`:''}</div></article>`;
  }).join('');
  const overlay = [...race.entries].sort((a,b)=>a.trap-b.trap).map((entry,index)=>{
    const dog = registration.dogs.find(value=>value.id===entry.dogId);
    if (!dog) return '';
    const people = dog.owner === dog.trainer ? dog.owner : [dog.owner,dog.trainer].filter(Boolean).join(' / ');
    return `<article class="replay-entry replay-entry-${index}"><span class="broadcast-trap broadcast-trap-${entry.trap}">${entry.trap}</span><div class="replay-runner"><div class="replay-runner-name">${flag(dog.country)}<strong>${e(dog.name)}</strong></div>${people?`<div class="replay-people">${e(people)}</div>`:''}</div></article>`;
  }).join('');
  const replayHeader = `<header class="replay-race-details" aria-label="Race details"><span class="replay-race-number">${String(race.number).padStart(2,'0')}</span><div class="replay-race-copy"><div class="replay-race-meeting">${e(registration.title)} · ${e(registration.track)} · ${e(meeting.date)}</div><h3>${e(race.title)}</h3><div class="replay-race-meta">${meta.map(value=>`<span>${e(value)}</span>`).join('')}</div></div></header>`;
  return `<div class="racecard-details">${header}<div class="race-broadcast-entries"><div class="broadcast-entries-label">TRAP / RUNNER <span>RACE CARD</span></div>${entries}</div><div class="racecard-countdown"><span class="racecard-countdown-label">REPLAY STARTS IN</span><strong></strong></div></div>${replayHeader}<div class="replay-details" aria-label="Runners">${overlay}</div>`;
}
