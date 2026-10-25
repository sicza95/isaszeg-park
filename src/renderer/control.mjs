import { icon, fillIcons, escapeHTML as e } from './icons.mjs';
import { commandForKey, formatTime, holdingItem, enabledBanner } from '../shared/playlist.mjs';
import { StageView, Player } from './player.mjs';
import { createRegistrationView } from './registration.mjs';
import { createDemoAPI } from './demo-api.mjs';
import { linkedRace, replayTitle } from '../shared/race-links.mjs';
import { raceResults, resultWarnings } from '../shared/race-results.mjs';
import { mediaSeconds } from '../shared/media-settings.mjs';
import { replaySections, replayTime, replayTrackGradient } from '../shared/instant-replays.mjs';
import { createMediaEditor } from './media-editor.mjs';
const $ = selector => document.querySelector(selector);
const api = window.replay || createDemoAPI(); const desktop = Boolean(window.replay);
let state, playback, activePage = 'desk', currentDirectory = null, parentDirectory = null, selection = new Map(), importing = false, removingId, removing = false, lastError;
const registration = createRegistrationView({ api, toast, setState, openImport });
const mediaEditor = createMediaEditor({api,getState:()=>state,setState,toast});
const view = desktop ? new StageView($('#preview')) : null;
const player = desktop ? null : new Player($('#preview'), data => api.report(data), null, edit => api.patchItem(edit.id,{replayRate:{id:edit.sectionId,rate:edit.rate}}));
if (player) api.setTransport(command => player.command(command));
let toastTimer;
function toast(message, error = false) { const box = $('#toast'); box.textContent = message; box.classList.toggle('error', error); box.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { box.hidden = true; }, error ? 9000 : 4500); }
async function safely(fn) { try { return await fn(); } catch (error) { toast(error.message || String(error), true); } }
function bytes(size) { if (!size) return '—'; return size > 1024 ** 3 ? `${(size / 1024 ** 3).toFixed(1)} GB` : `${(size / 1024 ** 2).toFixed(1)} MB`; }
function thumb(item) { return item.mediaType === 'video' ? icon('film') : `<img src="${e(item.url)}" alt="">`; }
function mediaIndicators(item) {
  const count = replaySections(item).length, race = linkedRace(state.meeting,item);
  const warning = race && resultWarnings(race,{hasVideo:item.mediaType==='video'}).message;
  return `${count ? `<span class="media-indicator" role="img" title="${count} replay moment${count===1?'':'s'} marked" aria-label="${count} replay moments marked">${icon('replay')}${count}</span>` : ''}${warning ? `<span class="media-indicator result-indicator" role="img" title="${e(warning)}" aria-label="${e(warning)}">${icon('warning')}</span>` : ''}`;
}
function mediaSummary(item) {
  const duration = `${mediaSeconds(state.meeting,item)}s${item.seconds==null?' · default':''}`;
  const label = item.kind === 'race' ? `REPLAY · ${bytes(item.bytes)}` : `${item.kind==='ad'?'SPONSOR':'BANNER'}${item.mock?' · MOCK AD':''}${item.mediaType==='video'?' · VIDEO':''} · ${duration}`;
  return `${label}${mediaIndicators(item)}`;
}
function navigate(page) {
  activePage = page;
  history.replaceState(null, '', `#${page}`);
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  for (const name of ['desk', 'registration', 'creative', 'sponsors', 'settings']) $(`#${name}-page`).hidden = name !== page;
  const labels = { registration: 'Races & dogs', desk: 'Race desk', creative: 'Banners', sponsors: 'Sponsors', settings: 'Settings' };
  registration.setVisible(page === 'registration');
  $('#page-label').textContent = labels[page];
  document.title = `Isaszeg Replay · ${labels[page]}`;
  updateCurrentRow(true);
}
function playlistRow(item) {
  const race = linkedRace(state.meeting,item), title = e(replayTitle(state.meeting,item));
  const link = item.kind === 'race' ? race
    ? `<button class="race-link linked" data-edit-race="${e(race.id)}" title="Edit the linked race card">${icon('list')}Linked race ${String(race.number).padStart(2,'0')} · Edit race ${icon('arrow')}</button>`
    : `<button class="race-link unlinked" data-edit="${e(item.id)}">${icon('list')}No linked race · Link race ${icon('arrow')}</button>` : '';
  return `<div class="queue-item${!item.enabled ? ' disabled' : ''}" data-item="${e(item.id)}"><input type="checkbox" data-enable="${e(item.id)}" ${item.enabled ? 'checked' : ''} aria-label="Include ${title} in loop"><button class="queue-thumb" data-play="${e(item.id)}" aria-label="Play ${title}" ${!item.enabled ? 'disabled' : ''}>${thumb(item)}</button><div class="queue-title"><button data-play="${e(item.id)}" ${!item.enabled ? 'disabled' : ''} title="${title}">${title}</button><small>${mediaSummary(item)}</small>${link}</div><div class="queue-actions"><button class="icon-button" data-move="${e(item.id)}" data-direction="-1" aria-label="Move ${title} up">${icon('up')}</button><button class="icon-button" data-move="${e(item.id)}" data-direction="1" aria-label="Move ${title} down">${icon('down')}</button></div><button class="icon-button" data-edit="${e(item.id)}" aria-label="Edit ${title}">${icon('edit')}</button><button class="icon-button danger" data-remove="${e(item.id)}" aria-label="Remove ${title}" title="Remove ${title}" ${state.busy ? 'disabled' : ''}>${icon('trash')}</button></div>`;
}
function renderPlaylist() {
  const items = state.meeting.items.filter(item => item.kind !== 'ad'); const races = items.filter(item => item.kind === 'race');
  $('#queue-count').textContent = items.filter(item => item.enabled).length;
  $('#race-count').textContent = races.length ? `${races.length} race${races.length === 1 ? '' : 's'} saved for this meeting` : 'No races imported yet';
  $('#playlist').innerHTML = items.map(playlistRow).join('') + (!races.length ? `<div class="queue-empty">Your race recordings will appear here.<br>Import the first clip to start the loop.</div>` : '');
  const sponsors = state.meeting.items.filter(item => item.kind === 'ad');
  $('#sponsor-queue-count').textContent = sponsors.length;
  $('#sponsor-playlist').innerHTML = sponsors.map(playlistRow).join('') || '<div class="queue-empty">No sponsor content yet.<br>Manage sponsors to add images or videos.</div>';
}
function updateCurrentRow(scroll = false) {
  document.querySelectorAll('.queue-item, .creative-card').forEach(row => {
    const current = row.dataset.item === playback?.id;
    row.classList.toggle('current', current);
    if (current) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
    if (!scroll || !current || !row.getClientRects().length) return;
    const list = row.closest('.playlist');
    if (list) {
      // Scroll the list only, keeping the preview and toolbar in place.
      const bounds = list.getBoundingClientRect(), item = row.getBoundingClientRect();
      if (item.top < bounds.top || item.bottom > bounds.bottom) list.scrollTop += item.top - bounds.top - (list.clientHeight - item.height) / 2;
    } else row.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  });
}
function renderCreative() {
  for (const [kind, prefix, empty] of [['banner', 'creative', 'No banners.'], ['ad', 'sponsor', 'No sponsor content.']]) {
    const items = state.meeting.items.filter(item => item.kind === kind);
    $(`#${prefix}-count`).textContent = items.length;
    $(`#${prefix}-grid`).innerHTML = items.map(item => {
      const order = kind === 'ad' ? `<span class="creative-order"><button class="icon-button" data-move="${e(item.id)}" data-direction="-1" aria-label="Move ${e(item.title)} up">${icon('up')}</button><button class="icon-button" data-move="${e(item.id)}" data-direction="1" aria-label="Move ${e(item.title)} down">${icon('down')}</button></span>` : '';
      return `<article class="panel creative-card" data-item="${e(item.id)}">${item.mediaType === 'video' ? `<video src="${e(item.url)}" preload="metadata" muted></video>` : `<img src="${e(item.url)}" alt="${e(item.title)}">`}<div class="card-body"><h2>${e(item.title)}</h2><div class="concept-tag">${item.mock ? 'MOCK AD · CONCEPT ONLY' : kind === 'ad' ? 'SPONSOR CONTENT' : 'TRACK BANNER'}</div><div class="creative-meta"><span>${item.mediaType === 'video' ? 'Video · ' : ''}${mediaSeconds(state.meeting,item)} seconds${item.seconds==null?' · default':''}${mediaIndicators(item)}</span><button class="text-button" data-edit="${e(item.id)}">${icon('edit')}Edit</button><label><input class="switch" type="checkbox" data-enable="${e(item.id)}" ${item.enabled ? 'checked' : ''} aria-label="Include ${e(item.title)} in loop"></label></div><div class="creative-actions"><button class="text-button" data-play="${e(item.id)}" ${!item.enabled ? 'disabled' : ''}>${icon('play')}Play on display</button>${order}<button class="text-button danger" data-remove="${e(item.id)}" aria-label="Remove ${e(item.title)}" ${state.busy ? 'disabled' : ''}>${icon('trash')}Remove</button></div></div></article>`;
    }).join('') || `<p class="queue-empty">${empty} Add an image or video to get started.</p>`;
  }
  updateCurrentRow();
}
function renderDisplays() {
  const select = $('#display-select'); const current = Number(select.value);
  select.innerHTML = state.displays.map(display => `<option value="${display.id}">${e(display.label)} · ${display.width}×${display.height}${display.primary ? ' (primary)' : ''}</option>`).join('');
  select.value = String(state.selectedDisplay || (state.displays.some(x => x.id === current) ? current : (state.displays.find(x => !x.primary) || state.displays[0])?.id));
  select.title = !desktop ? 'Move the audience window to your second monitor.' : state.displays.length < 2 ? 'Connect a second monitor in Extend mode. F exits fullscreen.' : `${state.displays.length} monitors connected · Use Extend mode.`;
  $('#output-button').innerHTML = `${icon(state.outputVisible ? 'close' : 'external')}${state.outputVisible ? 'Hide display' : 'Open display'}`;
  $('#output-button').setAttribute('aria-pressed', String(Boolean(state.outputVisible)));
  $('#output-badge').innerHTML = `<span></span>${state.outputVisible ? 'DISPLAY OPEN' : 'PREVIEW ONLY'}`;
  $('#output-badge').classList.toggle('live', state.outputVisible);
}
function setState(next) {
  state = next; $('#meeting-date').value = state.meeting.date; $('#meeting-date').disabled = state.busy;
  $('#import-button').disabled = state.busy; $('#change-root').disabled = state.busy;
  $('#confirm-remove').disabled = state.busy || removing;
  $('#storage-root').value = state.root;
  $('#demo-notice').hidden = desktop;
  const hold = $('[data-command="holding"]');
  hold.disabled = !enabledBanner(state.meeting);
  hold.title = hold.disabled ? 'Enable a banner to hold it on the display.' : 'Hold the first enabled banner on the display.';
  for (const [key, value] of Object.entries(state.meeting.settings)) { const input = $(`#setting-${key}`); if (input && document.activeElement !== input) { if (input.type === 'checkbox') input.checked = value; else input.value = value; } }
  registration.update(next);
  renderPlaylist(); renderCreative(); renderDisplays(); renderDrives();
  player?.setMeeting(state.meeting);
  if (desktop && playback) updatePlayback(playback);
  updateCurrentRow(true);
}
function updatePlayback(value) {
  if (!state) return;
  const changed = playback?.id !== value.id || playback?.mode !== value.mode || playback?.phase !== value.phase || (playback?.paused && !value.paused) || (value.position < .5 && playback?.position > 1);
  playback = value;
  const item = state.meeting.items.find(x => x.id === value.id) || (value.id === 'holding' ? holdingItem(state.meeting) : null);
  if (desktop && item) view.mirror(item, state.meeting, value);
  $('#now-title').textContent = value.title || 'Isaszeg Park';
  $('#playing-mode').textContent = value.blackout ? 'BLACKOUT · PLAYBACK PAUSED' : value.mode === 'holding' ? 'HOLDING · PRESS N TO RESUME THE LOOP' : value.paused ? 'PAUSED' : value.phase === 'instant-replay' ? `INSTANT REPLAY · MOMENT ${value.replayIndex+1} OF ${value.replayCount}` : value.transitioning ? 'STARTING REPLAY' : value.phase === 'racecard' ? 'RACE CARD · REPLAY UP NEXT' : value.phase === 'results' ? 'RACE RESULTS · FINISHING ORDER' : 'NOW PLAYING';
  $('#media-kind').textContent = value.phase === 'racecard' ? 'RACE CARD' : value.phase === 'results' ? 'RACE RESULTS' : value.phase === 'instant-replay' ? 'INSTANT REPLAY' : value.kind === 'race' ? 'RACE REPLAY' : value.kind === 'ad' ? 'SPONSOR AD' : 'HOLDING BANNER';
  const race=linkedRace(state.meeting,item),linked=Boolean(race&&item?.mediaType==='video');
  const resultWarning = linked ? resultWarnings(race,{hasVideo:true}).message : '';
  const moments = replaySections(item, ['media','instant-replay'].includes(value.phase) && value.duration ? value.duration : Infinity);
  $('#seek').style.setProperty('--replay-track',replayTrackGradient(['media','instant-replay'].includes(value.phase) ? moments : [],value.duration));
  for(const button of document.querySelectorAll('[data-jump]')){
    button.disabled=button.dataset.jump==='instant-replay' ? !moments.length : !linked || (button.dataset.jump==='results'&&!raceResults(race).hasTimes);
    button.setAttribute('aria-current',String(linked&&button.dataset.jump===(value.phase==='media'?'replay':value.phase)));
    button.title=button.dataset.jump==='instant-replay' ? moments.length?'Jump to instant slow-motion replays':'Mark replay moments in Edit media to enable slow-motion replays.' : !linked?'Play a linked race recording to jump between its sections.':button.disabled?(resultWarning || 'No finish times recorded yet.'):`Jump to ${button.textContent.trim().toLowerCase()}`;
  }
  const momentRow = $('#instant-replay-toggles'), signature = JSON.stringify([item?.id,moments]);
  if (momentRow.dataset.signature !== signature) {
    momentRow.dataset.signature = signature;
    momentRow.innerHTML = `<span>INSTANT REPLAYS</span>${moments.length ? moments.map((moment,index)=>`<button type="button" data-instant-replay="${e(moment.id)}" aria-pressed="false" title="${replayTime(moment.start)} – ${replayTime(moment.end)} · ${moment.rate}×">${index+1} · ${e(moment.label || replayTime(moment.start))}</button>`).join('') : '<p>No replay moments marked</p>'}`;
  }
  for (const button of momentRow.querySelectorAll('button'))button.setAttribute('aria-pressed',String(value.phase==='instant-replay' && value.replayId===button.dataset.instantReplay));
  $('#rate-badge').textContent = `${value.rate}×`;
  $('#elapsed').textContent = value.mode === 'holding' ? 'HOLD' : formatTime(value.position);
  $('#duration').textContent = formatTime(value.duration);
  $('#seek').disabled = item?.mediaType !== 'video' || value.phase !== 'media';
  document.querySelectorAll('[data-seek]').forEach(button=>button.disabled = $('#seek').disabled);
  if (document.activeElement !== $('#seek')) $('#seek').value = value.duration ? Math.min(1000, value.position / value.duration * 1000) : 0;
  $('#play-pause').innerHTML = icon(value.paused ? 'play' : 'pause'); $('#play-pause').setAttribute('aria-label', value.paused ? 'Play' : 'Pause');
  document.querySelectorAll('[data-rate]').forEach(button => button.classList.toggle('selected', Number(button.dataset.rate) === value.rate));
  if (changed) updateCurrentRow(true);
  if (value.error && lastError !== value.error) { lastError = value.error; toast(value.error, true); }
  if (!value.error) lastError = null;
}
function renderDrives() {
  $('#drive-list').innerHTML = (state?.drives || []).map(drive => `<button class="drive-chip" data-drive="${e(drive.path)}">${icon('card')}${e(drive.label)}</button>`).join('');
  $('#card-status').textContent = state?.drives?.length ? `${state.drives.length} card / removable drive${state.drives.length === 1 ? '' : 's'} detected` : 'Your originals stay on the card.';
}
function selectionSummary() {
  $('#selection-summary').textContent = `${selection.size} file${selection.size === 1 ? '' : 's'} selected · ${bytes([...selection.values()].reduce((sum, item) => sum + (item.bytes || 0), 0))}`;
  $('#confirm-import').disabled = !selection.size || importing;
}
function fileRow(item) { return `<label class="file-row"><input type="checkbox" data-file="${e(item.path)}" ${selection.has(item.path) ? 'checked' : ''}>${icon(/\.(mp4|mov|webm|m4v)$/i.test(item.name) ? 'film' : 'image')}<span class="file-info"><strong>${e(item.name)}</strong><small>${bytes(item.bytes)} · ${new Date(item.modified).toLocaleString('en-GB')}</small></span></label>`; }
let directoryEntries = [];
async function browse(directory) {
  const listing = await api.listFolder(directory); currentDirectory = listing.directory; parentDirectory = listing.parent; directoryEntries = listing.entries;
  $('#browser-path').textContent = listing.directory; $('#parent-folder').disabled = !listing.parent;
  $('#file-list').innerHTML = listing.entries.map(item => item.directory ? `<button class="file-row folder" data-directory="${e(item.path)}">${icon('folder')}<span class="file-info"><strong>${e(item.name)}</strong><small>Open folder</small></span>${icon('arrow')}</button>` : fileRow(item)).join('') || '<div class="empty-browser">No supported media in this folder.<br>Try opening DCIM or another camera folder.</div>';
}
async function openImport(kind = 'race', directory, numberOverride) {
  if (state.busy || importing) return;
  selection.clear(); currentDirectory = parentDirectory = null; directoryEntries = [];
  $('#import-kind').innerHTML = kind === 'ad' ? '<option value="ad">Sponsor content</option>' : '<option value="race">Race recording</option><option value="banner">Banner / holding slide</option>';
  $('#import-dialog h2').textContent = kind === 'ad' ? 'Import sponsor content' : 'Import media';
  $('#import-dialog .eyebrow').textContent = kind === 'ad' ? 'RACE DAY PARTNERS' : 'FROM CARD TO REPLAY';
  $('#import-kind').value = kind;
  $('#race-number').value = numberOverride || Math.max(0, ...state.meeting.items.filter(x => x.kind === 'race').map(x => x.raceNumber || 0)) + 1;
  $('#race-number-label').hidden = kind !== 'race';
  $('#import-results').textContent = ''; $('#import-progress').hidden = true;
  $('#browser-path').textContent = desktop ? 'Choose a card or folder to see its media files.' : 'Browser demo: use Select files directly. Files stay in this tab only.';
  $('#file-list').innerHTML = kind === 'ad'
    ? `<div class="empty-browser">${icon('spark')}<h3>Give partners their spotlight.</h3><p>Choose sponsor images or videos for this meeting.</p></div>`
    : `<div class="empty-browser">${icon('card')}<h3>Your next replay starts here.</h3><p>Choose a recording to add it to today’s loop.</p></div>`;
  $('#parent-folder').disabled = true; selectionSummary(); renderDrives();
  if (!$('#import-dialog').open) $('#import-dialog').showModal();
  if (directory) await browse(directory);
}
async function selectDirectly() {
  const files = await api.chooseFiles($('#import-kind').value);
  if (!files.length) return;
  const entries = desktop ? files.map(file => ({ path: file, name: file.split(/[\\/]/).pop(), bytes: 0, modified: Date.now() })) : api.describeFiles(files);
  for (const item of entries) selection.set(item.path, item);
  directoryEntries = [...selection.values()]; $('#file-list').innerHTML = directoryEntries.map(fileRow).join(''); $('#browser-path').textContent = 'Selected media files'; selectionSummary();
}
async function importSelected() {
  if (!selection.size || importing) return;
  const number = Number($('#race-number').value); const kind = $('#import-kind').value;
  if (kind === 'race' && (!Number.isInteger(number) || number < 1 || number > 9999)) { toast('Choose a race number between 1 and 9999.', true); return; }
  importing = true;
  let importedRaces = [];
  $('#import-results').textContent = ''; $('#import-progress').hidden = false;
  document.querySelectorAll('#import-dialog button,#import-dialog input,#import-dialog select').forEach(input => { input.disabled = true; });
  try {
    const result = await api.importFiles([...selection.keys()], kind, number);
    setState(await api.init());
    const added = result.results.filter(x => x.status === 'imported').length;
    importedRaces = result.results.filter(result=>result.status==='imported' && result.item?.kind==='race').map(result=>result.item.id);
    $('#import-results').textContent = result.results.map(result => {
      if (result.status === 'imported') return `✓ ${result.source}: added to the loop`;
      if (result.status === 'duplicate') {
        const existing = result.item ? ` as ${replayTitle(state.meeting, result.item)}` : '';
        return `↪ ${result.source}: already imported${existing}; skipped`;
      }
      return `× ${result.source}: ${result.message}`;
    }).join('\n') || 'No files were imported. Select files and try again.';
    if (importedRaces.length || (added && added === result.results.length)) {
      $('#import-dialog').close();
      const issues = result.results.filter(result=>result.status!=='imported');
      toast(`${added} file${added === 1 ? '' : 's'} added.${issues.length ? ` ${issues.map(result=>`${result.source}: ${result.status==='duplicate'?'already imported; skipped':result.message}`).join(' · ')}` : importedRaces.length ? ' Set up your race recordings now.' : ' The current replay keeps playing.'}`,issues.some(result=>result.status==='error'));
    }
  } catch (error) {
    $('#import-results').textContent = error.message || String(error);
  } finally {
    importing = false; $('#import-progress').hidden = true;
    selection.clear(); selectionSummary();
    document.querySelectorAll('#import-dialog button,#import-dialog input,#import-dialog select').forEach(input => { input.disabled = false; });
    $('#parent-folder').disabled = !parentDirectory; $('#confirm-import').disabled = true;
    $('#file-list').querySelectorAll('input').forEach(input => { input.checked = false; });
  }
  if(importedRaces.length)mediaEditor.open(importedRaces);
}
function openRemove(id) {
  if (state.busy || removing) return;
  const item = state.meeting.items.find(x => x.id === id); if (!item) return;
  removingId = id; $('#remove-title').textContent = replayTitle(state.meeting,item); $('#remove-dialog').showModal();
}
async function removeSelected() {
  if (!removingId || state.busy || removing) return;
  const item = state.meeting.items.find(x => x.id === removingId); if (!item) return;
  removing = true;
  $('#remove-dialog').querySelectorAll('button').forEach(button => { button.disabled = true; });
  try {
    setState(await api.removeItem(removingId));
    $('#remove-dialog').close();
    toast(`${item.title} removed from this meeting.`);
  } finally {
    removing = false;
    $('#remove-dialog').querySelectorAll('button').forEach(button => { button.disabled = false; });
    $('#confirm-remove').disabled = state.busy;
  }
}
async function moveItem(id, direction) {
  const item = state.meeting.items.find(item => item.id === id); if (!item) return;
  const group = state.meeting.items.filter(other => (other.kind === 'ad') === (item.kind === 'ad'));
  const from = group.findIndex(item => item.id === id); const to = from + direction;
  if (to < 0 || to >= group.length) return;
  const ids = state.meeting.items.map(item => item.id); const first = ids.indexOf(id); const second = ids.indexOf(group[to].id);
  [ids[first], ids[second]] = [ids[second], ids[first]]; setState(await api.reorder(ids));
}
fillIcons();
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  safely(async () => {
    if (button.dataset.page) navigate(button.dataset.page);
    if (button.dataset.command) { if (button.dataset.command === 'latest' && !state.meeting.items.some(x => x.kind === 'race' && x.enabled)) toast('Import a race recording first.'); else await api.command({ type: button.dataset.command }); }
    if (button.dataset.seek) await api.command({ type: 'seek', delta: Number(button.dataset.seek) });
    if (button.dataset.rate) await api.command({ type: 'rate', rate: Number(button.dataset.rate) });
    if (button.dataset.play) await api.command({ type: 'play', id: button.dataset.play });
    if (button.dataset.instantReplay) await api.command({type:'jump-instant-replay',id:button.dataset.instantReplay});
    if (button.dataset.move) await moveItem(button.dataset.move, Number(button.dataset.direction));
    if (button.dataset.edit) mediaEditor.open(button.dataset.edit);
    if (button.dataset.editRace) { navigate('registration'); registration.openRace(button.dataset.editRace); }
    if (button.dataset.remove) openRemove(button.dataset.remove);
    if (button.dataset.drive) await browse(button.dataset.drive);
    if (button.dataset.directory) await browse(button.dataset.directory);
    if (button.classList.contains('close-dialog') && !importing) button.closest('dialog').close();
  });
});
document.addEventListener('change', event => {
  const input = event.target;
  safely(async () => {
    if (input.dataset.enable) setState(await api.patchItem(input.dataset.enable, { enabled: input.checked }));
    if (input.dataset.file) { const item = directoryEntries.find(x => x.path === input.dataset.file); if (input.checked && item) selection.set(item.path, item); else selection.delete(input.dataset.file); selectionSummary(); }
    if (input.id.startsWith('setting-')) { if (!input.reportValidity() || input.value === '') return; const key = input.id.slice(8); const value = input.type === 'checkbox' ? input.checked : input.type === 'color' ? input.value : Number(input.value); setState(await api.patchSettings({ [key]: value })); }
  });
});
$('#meeting-date').addEventListener('change', () => safely(async () => { const oldDate = state.meeting.date; try { setState(await api.openMeeting($('#meeting-date').value)); } catch (error) { $('#meeting-date').value = oldDate; throw error; } }));
$('#confirm-remove').addEventListener('click', () => safely(removeSelected));
$('#remove-dialog').addEventListener('cancel', event => { if (removing) event.preventDefault(); });
// A queued close event must not clear a newly opened confirmation.
$('#remove-dialog').addEventListener('close', () => { if (!$('#remove-dialog').open) removingId = null; });
$('#seek').addEventListener('input', () => safely(() => api.command({ type: 'scrub', fraction: Number($('#seek').value) / 1000 })));
$('#import-button').addEventListener('click', () => safely(() => openImport(activePage === 'sponsors' ? 'ad' : activePage === 'creative' ? 'banner' : 'race')));
$('#manage-banner-playlist').addEventListener('click', () => navigate('creative'));
$('#manage-sponsor-playlist').addEventListener('click', () => navigate('sponsors'));
$('#import-kind').addEventListener('change', () => { $('#race-number-label').hidden = $('#import-kind').value !== 'race'; });
$('#choose-folder').addEventListener('click', () => safely(async () => { if (!desktop) { await selectDirectly(); return; } const folder = await api.chooseFolder(); if (folder) await browse(folder); }));
$('#choose-files').addEventListener('click', () => safely(selectDirectly));
$('#parent-folder').addEventListener('click', () => safely(() => browse(parentDirectory)));
$('#confirm-import').addEventListener('click', () => safely(importSelected));
$('#import-dialog').addEventListener('cancel', event => { if (importing) event.preventDefault(); });
$('#output-button').addEventListener('click', () => safely(async () => { const next = state.outputVisible ? await api.hideOutput() : await api.showOutput(Number($('#display-select').value)); if (next) setState(next); }));
$('#display-select').addEventListener('change', () => safely(async () => { if (state.outputVisible) { await api.showOutput(Number($('#display-select').value)); } }));
for (const id of ['reveal-button', 'reveal-sponsor-folder', 'open-folder']) $(`#${id}`).addEventListener('click', () => safely(() => api.revealFolder()));
$('#change-root').addEventListener('click', () => safely(async () => { const next = await api.chooseRoot(); if (next) setState(next); }));
$('#shortcuts-button').addEventListener('click', () => $('#shortcuts-dialog').showModal());
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]')) return;
  if (event.key === '?' && !event.target.matches('input,textarea,select')) { event.preventDefault(); $('#shortcuts-dialog').showModal(); return; }
  const command = commandForKey(event); if (command) { event.preventDefault(); safely(() => api.command(command)); }
});
api.on('state', setState); api.on('playback', updatePlayback);
api.on('output-status', value => { state.outputVisible = value.visible; renderDisplays(); if (value.error) toast(value.error, true); });
api.on('drive-error', message => { $('#card-status').textContent = message; });
api.on('drives', value => {
  if (!state) return; state.drives = value.drives; renderDrives();
  if (value.added?.length && state.meeting.settings.autoBrowse && !importing && !document.querySelector('dialog[open]')) safely(() => openImport('race', value.added[0].path));
});
api.on('import-progress', value => {
  if (!value) return;
  $('#progress-text').textContent = `${value.stage === 'verifying' ? 'Verifying' : 'Copying'} ${value.name}`;
  const progress = Math.round(value.bytes / value.total * 100); $('#progress-percent').textContent = `${progress}%`; $('#import-progress progress').value = progress;
});
function clock() { $('#clock').textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' }).format(new Date()); }
clock(); setInterval(clock, 1000);
try { setState(await api.init()); } catch (error) { toast(`Could not open race day: ${error.message}`, true); }

if (['desk','registration','creative','sponsors','settings'].includes(location.hash.slice(1))) navigate(location.hash.slice(1));
