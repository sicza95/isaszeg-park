import { escapeHTML as e } from './icons.mjs';
import { flag } from './flags.mjs';
import { trapBadge } from './trap-badge.mjs';
import { raceResults, finishTime, formatResultTime, entryStatus } from '../shared/race-results.mjs';
import { statusChip } from './runner-status.mjs';
import { dogAge } from '../shared/dog-age.mjs';

function cardHeading(label, header, phase) {
  return `<div class="broadcast-card-heading ${phase}-heading"><div class="broadcast-card-eyebrow ${phase}-eyebrow"><span></span> ${e(label)}</div>${header}</div>`;
}

function cardFooter(label, next, phase) {
  return `<footer class="broadcast-card-footer ${phase}-footer${phase==='racecard'?' racecard-countdown':''}"><span>ISASZEG PARK <b>·</b> <span class="${phase}-footer-label">${e(label)}</span></span>${next}<div class="broadcast-card-progress ${phase}-progress" aria-hidden="true"><span></span></div></footer>`;
}

function resultsPresentation(registration, race, header) {
  const results = raceResults(race);
  if (!results.hasTimes) return '';
  const hasSplit = results.finishers.some(entry => entry.split);
  const row = (entry, delay, other = false) => {
    const dog = registration.dogs.find(value => value.id === entry.dogId);
    if (!dog) return '';
    const place = String(results.places.get(entry.trap) || '-');
    const time = formatResultTime(finishTime(entry)), estimated = !entry.time && Boolean(time);
    const people = dog.owner === dog.trainer ? dog.owner : [dog.owner,dog.trainer].filter(Boolean).join(' / ');
    return `<article class="result-entry${other?' result-other':''}${place==='1'?' result-winner':''}" data-trap="${entry.trap}" data-result-delay="${delay}"><span class="result-place" aria-label="${other?'No placing':`Place ${place}`}">${other?'-':place.padStart(2,'0')}</span>${trapBadge(entry.trap,true)}<div class="result-runner"><div class="result-runner-name">${flag(dog.country)}<strong>${e(dog.name)}</strong>${place==='1'?'<span class="result-winner-label">WINNER</span>':''}</div>${people?`<div class="result-people">${e(people)}</div>`:''}</div>${other?`<span class="result-status">${statusChip(entry)}${entryStatus(entry)==='FIN'?'<small>Not timed</small>':''}</span>`:`${hasSplit?`<div class="result-split">${e(entry.split || '—')}</div>`:''}<div class="result-time">${time?`<strong>${e(time)}</strong>${estimated?'<small>EST.</small>':''}`:'<span class="result-missing-time">Not timed</span>'}</div>`}</article>`;
  };
  return `<div class="results-card${hasSplit?' has-splits':''}" aria-label="Race results">${cardHeading('RACE RESULTS',header,'results')}<div class="results-board"><div class="results-columns"><span>PLACE</span><span>TRAP / RUNNER</span>${hasSplit?'<span>SPLIT</span>':''}<span>TIME</span></div><div class="results-finishers">${results.finishers.map((entry,index)=>row(entry,results.revealAt(index))).join('')}</div>${results.others.length?`<div class="results-others" data-result-delay="${results.othersAt}"><div class="results-others-label">OTHER RUNNERS <span>STATUS</span></div>${results.others.map((entry,index)=>row(entry,results.othersAt+index*.14,true)).join('')}</div>`:''}</div>${cardFooter('FINISHING ORDER','<span class="results-next">NEXT IN THE LOOP</span>','results')}</div>`;
}

export function racePresentation(meeting, race) {
  const registration = meeting.registration;
  const meta = [race.grade || 'Ungraded', `${race.distance} m`, race.breed, race.type];
  const header = `<header class="race-broadcast-header"><div class="race-broadcast-number">${String(race.number).padStart(2,'0')}</div><div class="race-broadcast-heading"><div class="race-broadcast-meeting">${e(registration.title)} · ${e(registration.track)} · ${e(meeting.date)}</div><h2>${e(race.title)}</h2><div class="race-broadcast-meta">${meta.map(value=>`<span>${e(value)}</span>`).join('')}</div></div></header>`;
  const entries = Array.from({length:6},(_,index)=>{
    const trap = index+1, entry = race.entries.find(value=>value.trap===trap);
    const dog = registration.dogs.find(value=>value.id===entry?.dogId);
    const badge = trapBadge(trap,true);
    const delay = .15+index*.36;
    const vitals = `<div class="broadcast-vitals"><span class="broadcast-age" aria-label="Age">${dogAge(dog?.birth,meeting.date)}</span><span class="broadcast-weight" aria-label="Weight">${entry?.weight ? `${e(entry.weight)} kg` : '-'}</span></div>`;
    if (!dog) return `<article class="broadcast-entry broadcast-inactive empty-trap" data-trap="${trap}" data-card-delay="${delay}">${badge}<div class="broadcast-dog"><strong>Empty trap</strong>${vitals}</div></article>`;
    const status=entryStatus(entry),inactive=['NR','DQ'].includes(status);
    const people = dog.owner === dog.trainer ? dog.owner : [dog.owner,dog.trainer].filter(Boolean).join(' / ');
    return `<article class="broadcast-entry${inactive?' broadcast-inactive':''}" data-trap="${trap}" data-card-delay="${delay}">${badge}<div class="broadcast-dog"><div class="broadcast-dog-name">${flag(dog.country)}<strong>${e(dog.name)}</strong></div>${people?`<div class="broadcast-people">${e(people)}</div>`:''}${vitals}</div></article>`;
  }).join('');
  const overlay = race.entries.filter(entry=>entryStatus(entry)!=='NR').sort((a,b)=>a.trap-b.trap).map((entry,index)=>{
    const dog = registration.dogs.find(value=>value.id===entry.dogId);
    if (!dog) return '';
    const people = dog.owner === dog.trainer ? dog.owner : [dog.owner,dog.trainer].filter(Boolean).join(' / ');
    return `<article class="replay-entry replay-entry-${index}">${trapBadge(entry.trap,true)}<div class="replay-runner"><div class="replay-runner-name">${flag(dog.country)}<strong>${e(dog.name)}</strong></div>${people?`<div class="replay-people">${e(people)}</div>`:''}</div></article>`;
  }).join('');
  const replayHeader = `<header class="replay-race-details" aria-label="Race details"><span class="replay-race-number">${String(race.number).padStart(2,'0')}</span><div class="replay-race-copy"><div class="replay-race-meeting">${e(registration.title)} · ${e(registration.track)} · ${e(meeting.date)}</div><h3>${e(race.title)}</h3><div class="replay-race-meta">${meta.map(value=>`<span>${e(value)}</span>`).join('')}</div></div></header>`;
  return `<div class="racecard-details">${cardHeading('RACE CARD',header,'racecard')}<div class="race-broadcast-entries"><div class="broadcast-entries-label">TRAP / RUNNER <span class="broadcast-vital-labels"><span>AGE</span><span>WEIGHT</span></span></div>${entries}</div>${cardFooter('STARTING LINE-UP','<span class="racecard-next"><span class="racecard-countdown-label">REPLAY STARTS IN</span><strong></strong></span>','racecard')}</div>${replayHeader}<div class="replay-details" aria-label="Runners">${overlay}</div>${resultsPresentation(registration,race,header)}`;
}
