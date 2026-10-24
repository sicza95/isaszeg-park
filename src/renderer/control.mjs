import { icon, fillIcons, escapeHTML as e } from './icons.mjs';
import { makePlaylist, commandForKey, formatTime } from '../shared/playlist.mjs';
import { StageView, Player } from './player.mjs';
import { createDemoAPI } from './demo-api.mjs';
const $ = selector => document.querySelector(selector);
const api = window.replay || createDemoAPI(); const desktop = Boolean(window.replay);
let state, playback, activePage = 'desk', currentDirectory = null, parentDirectory = null, selection = new Map(), editingId, importing = false, lastError;
const view = desktop ? new StageView($('#preview')) : null;
const player = desktop ? null : new Player($('#preview'), data => api.report(data));
if (player) api.setTransport(command => player.command(command));
let toastTimer;
function toast(message, error = false) { const box = $('#toast'); box.textContent = message; box.classList.toggle('error', error); box.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { box.hidden = true; }, error ? 9000 : 4500); }
async function safely(fn) { try { return await fn(); } catch (error) { toast(error.message || String(error), true); } }
function bytes(size) { if (!size) return '—'; return size > 1024 ** 3 ? `${(size / 1024 ** 3).toFixed(1)} GB` : `${(size / 1024 ** 2).toFixed(1)} MB`; }
function thumb(item) { return item.mediaType === 'video' ? icon('film') : `<img src="${e(item.url)}" alt="">`; }
function navigate(page) {
  activePage = page;
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  for (const name of ['desk', 'creative', 'settings']) $(`#${name}-page`).hidden = name !== page;
  const labels = { desk: ['Race desk', 'Everything ready for the next replay.'], creative: ['Banners & ads', 'Give the moments between races their own spotlight.'], settings: ['Settings', 'Set up once. Keep race day simple.'] };
  $('#heading').innerHTML = `${labels[page][0]}<span class="accent">.</span>`; $('#page-label').textContent = labels[page][0]; $('#subheading').textContent = labels[page][1];
}
function renderPlaylist() {
  const all = state.meeting.items; const queue = makePlaylist(state.meeting); const races = all.filter(x => x.kind === 'race');
  $('#queue-count').textContent = queue.length;
  $('#race-count').textContent = races.length ? `${races.length} race${races.length === 1 ? '' : 's'} saved for this meeting` : 'No races imported yet';
  const items = all.filter(x => x.kind !== 'ad' || x.enabled);
  $('#playlist').innerHTML = items.map(item => `<div class="queue-item${!item.enabled ? ' disabled' : ''}" data-item="${e(item.id)}"><input type="checkbox" data-enable="${e(item.id)}" ${item.enabled ? 'checked' : ''} aria-label="Include ${e(item.title)} in loop"><button class="queue-thumb" data-play="${e(item.id)}" aria-label="Play ${e(item.title)}" ${!item.enabled ? 'disabled' : ''}>${thumb(item)}</button><div class="queue-title"><button data-play="${e(item.id)}" ${!item.enabled ? 'disabled' : ''}>${e(item.title)}</button><small>${item.kind === 'race' ? `REPLAY · ${bytes(item.bytes)}` : item.kind === 'ad' ? `SPONSOR${item.mock ? ' · MOCK AD' : ''}` : `BANNER · ${item.seconds || 12}s`}</small></div><div class="queue-actions"><button class="icon-button" data-move="${e(item.id)}" data-direction="-1" aria-label="Move ${e(item.title)} up">${icon('up')}</button><button class="icon-button" data-move="${e(item.id)}" data-direction="1" aria-label="Move ${e(item.title)} down">${icon('down')}</button></div><button class="icon-button" data-edit="${e(item.id)}" aria-label="Edit ${e(item.title)}">${icon('edit')}</button></div>`).join('') + (!races.length ? `<div class="queue-empty">Your race recordings will appear here.<br>Import the first clip to start the loop.</div>` : '');
  updateCurrentRow();
}
function updateCurrentRow() { document.querySelectorAll('.queue-item').forEach(row => row.classList.toggle('current', row.dataset.item === playback?.id)); }
function renderCreative() {
  const items = state.meeting.items.filter(x => x.kind !== 'race');
  $('#creative-count').textContent = items.length;
  $('#creative-grid').innerHTML = items.map(item => `<article class="panel creative-card">${item.mediaType === 'video' ? `<video src="${e(item.url)}" preload="metadata" muted></video>` : `<img src="${e(item.url)}" alt="${e(item.title)}">`}<div class="card-body"><h2>${e(item.title)}</h2><div class="concept-tag">${item.mock ? 'MOCK AD · CONCEPT ONLY' : item.kind === 'ad' ? 'SPONSOR CREATIVE' : 'TRACK BANNER'}</div><div class="creative-meta"><span>${item.mediaType === 'video' ? 'Video' : `${item.seconds || 12} seconds`}</span><button class="text-button" data-edit="${e(item.id)}">${icon('edit')}Edit</button><label><input class="switch" type="checkbox" data-enable="${e(item.id)}" ${item.enabled ? 'checked' : ''} aria-label="Include ${e(item.title)} in loop"></label></div><button class="text-button" data-play="${e(item.id)}" ${!item.enabled ? 'disabled' : ''}>${icon('play')}Play on display</button></div></article>`).join('');
}
function renderDisplays() {
  const select = $('#display-select'); const current = Number(select.value);
  select.innerHTML = state.displays.map(display => `<option value="${display.id}">${e(display.label)} · ${display.width}×${display.height}${display.primary ? ' (primary)' : ''}</option>`).join('');
  select.value = String(state.selectedDisplay || (state.displays.some(x => x.id === current) ? current : (state.displays.find(x => !x.primary) || state.displays[0])?.id));
  $('#display-hint').textContent = !desktop ? 'Move the audience window to your second monitor.' : state.displays.length < 2 ? 'Connect a second monitor in Extend mode. F exits fullscreen.' : `${state.displays.length} monitors connected · Use Extend mode.`;
  $('#output-button').innerHTML = `${icon(state.outputVisible ? 'close' : 'external')}${state.outputVisible ? 'Hide display' : 'Open display'}`;
  $('#output-badge').innerHTML = `<span></span>${state.outputVisible ? 'DISPLAY OPEN' : 'PREVIEW ONLY'}`;
  $('#output-badge').classList.toggle('live', state.outputVisible);
}
function setState(next) {
  state = next; $('#meeting-date').value = state.meeting.date; $('#meeting-date').disabled = state.busy;
  $('#import-button').disabled = state.busy; $('#change-root').disabled = state.busy;
  $('#storage-root').value = state.root;
  $('#demo-notice').hidden = desktop;
  for (const [key, value] of Object.entries(state.meeting.settings)) { const input = $(`#setting-${key}`); if (input && document.activeElement !== input) { if (input.type === 'checkbox') input.checked = value; else input.value = value; } }
  renderPlaylist(); renderCreative(); renderDisplays(); renderDrives();
  player?.setMeeting(state.meeting);
  if (desktop && playback) updatePlayback(playback);
}
function updatePlayback(value) {
  if (!state) return; const changed = playback?.id !== value.id; playback = value;
  const item = state.meeting.items.find(x => x.id === value.id);
  if (desktop && item) view.mirror(item, state.meeting, value);
  $('#now-title').textContent = value.title || 'Isaszeg Park';
  $('#playing-mode').textContent = value.blackout ? 'BLACKOUT · PLAYBACK PAUSED' : value.mode === 'holding' ? 'HOLDING · PRESS N TO RESUME THE LOOP' : value.paused ? 'PAUSED' : 'NOW PLAYING';
  $('#media-kind').textContent = value.kind === 'race' ? 'RACE REPLAY' : value.kind === 'ad' ? 'SPONSOR AD' : 'HOLDING BANNER';
  $('#rate-badge').textContent = `${value.rate}×`;
  $('#elapsed').textContent = value.mode === 'holding' ? 'HOLD' : formatTime(value.position);
  $('#duration').textContent = formatTime(value.duration);
  $('#seek').disabled = item?.mediaType !== 'video';
  if (document.activeElement !== $('#seek')) $('#seek').value = value.duration ? Math.min(1000, value.position / value.duration * 1000) : 0;
  $('#play-pause').innerHTML = icon(value.paused ? 'play' : 'pause'); $('#play-pause').setAttribute('aria-label', value.paused ? 'Play' : 'Pause');
  document.querySelectorAll('[data-rate]').forEach(button => button.classList.toggle('selected', Number(button.dataset.rate) === value.rate));
  if (changed) updateCurrentRow();
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
async function openImport(kind = 'race', directory) {
  if (state.busy || importing) return;
  selection.clear(); currentDirectory = parentDirectory = null; directoryEntries = [];
  $('#import-kind').value = kind;
  $('#race-number').value = Math.max(0, ...state.meeting.items.filter(x => x.kind === 'race').map(x => x.raceNumber || 0)) + 1;
  $('#race-number-label').hidden = kind !== 'race';
  $('#import-results').textContent = ''; $('#import-progress').hidden = true;
  $('#browser-path').textContent = desktop ? 'Choose a card or folder to see its media files.' : 'Browser demo: use Select files directly. Files stay in this tab only.';
  $('#file-list').innerHTML = `<div class="empty-browser">${icon('card')}<h3>Your next replay starts here.</h3><p>Choose a recording to add it to today’s loop.</p></div>`;
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
  $('#import-results').textContent = ''; $('#import-progress').hidden = false;
  document.querySelectorAll('#import-dialog button,#import-dialog input,#import-dialog select').forEach(input => { input.disabled = true; });
  try {
    const result = await api.importFiles([...selection.keys()], kind, number);
    setState(await api.init());
    const added = result.results.filter(x => x.status === 'imported').length;
    $('#import-results').textContent = result.results.map(x => `${x.status === 'imported' ? '✓' : x.status === 'duplicate' ? '↪' : '×'} ${x.source}: ${x.status === 'imported' ? 'added to the loop' : x.status === 'duplicate' ? 'already imported; skipped' : x.message}`).join('\n');
    if (added) toast(`${added} file${added === 1 ? '' : 's'} added. The current replay keeps playing.`);
    selection.clear(); selectionSummary();
  } finally {
    importing = false; $('#import-progress').hidden = true;
    document.querySelectorAll('#import-dialog button,#import-dialog input,#import-dialog select').forEach(input => { input.disabled = false; });
    $('#parent-folder').disabled = !parentDirectory; $('#confirm-import').disabled = true;
    $('#file-list').querySelectorAll('input').forEach(input => { input.checked = false; });
  }
}
function openEdit(id) {
  const item = state.meeting.items.find(x => x.id === id); if (!item) return;
  editingId = id; $('#edit-title').value = item.title; $('#edit-duration').value = item.seconds || 12; $('#edit-duration-label').hidden = item.mediaType === 'video'; $('#edit-dialog').showModal();
}
async function moveItem(id, direction) {
  const ids = state.meeting.items.map(x => x.id); const from = ids.indexOf(id); const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]]; setState(await api.reorder(ids));
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
    if (button.dataset.move) await moveItem(button.dataset.move, Number(button.dataset.direction));
    if (button.dataset.edit) openEdit(button.dataset.edit);
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
    if (input.id.startsWith('setting-')) { const key = input.id.slice(8); const value = input.type === 'checkbox' ? input.checked : Number(input.value); setState(await api.patchSettings({ [key]: value })); }
  });
});
$('#meeting-date').addEventListener('change', () => safely(async () => { const oldDate = state.meeting.date; try { setState(await api.openMeeting($('#meeting-date').value)); } catch (error) { $('#meeting-date').value = oldDate; throw error; } }));
$('#seek').addEventListener('input', () => safely(() => api.command({ type: 'scrub', fraction: Number($('#seek').value) / 1000 })));
$('#import-button').addEventListener('click', () => safely(() => openImport()));
$('#browse-card').addEventListener('click', () => safely(() => openImport('race', state.drives[0]?.path)));
$('#manage-creatives').addEventListener('click', () => navigate('creative'));
$('#add-creative').addEventListener('click', () => safely(() => openImport('banner')));
$('#import-kind').addEventListener('change', () => { $('#race-number-label').hidden = $('#import-kind').value !== 'race'; });
$('#choose-folder').addEventListener('click', () => safely(async () => { if (!desktop) { await selectDirectly(); return; } const folder = await api.chooseFolder(); if (folder) await browse(folder); }));
$('#choose-files').addEventListener('click', () => safely(selectDirectly));
$('#parent-folder').addEventListener('click', () => safely(() => browse(parentDirectory)));
$('#confirm-import').addEventListener('click', () => safely(importSelected));
$('#import-dialog').addEventListener('cancel', event => { if (importing) event.preventDefault(); });
$('#output-button').addEventListener('click', () => safely(async () => { const next = state.outputVisible ? await api.hideOutput() : await api.showOutput(Number($('#display-select').value)); if (next) setState(next); }));
$('#display-select').addEventListener('change', () => safely(async () => { if (state.outputVisible) { await api.showOutput(Number($('#display-select').value)); } }));
for (const id of ['reveal-button', 'open-folder']) $(`#${id}`).addEventListener('click', () => safely(() => api.revealFolder()));
$('#change-root').addEventListener('click', () => safely(async () => { const next = await api.chooseRoot(); if (next) setState(next); }));
$('#shortcuts-button').addEventListener('click', () => $('#shortcuts-dialog').showModal());
$('#edit-form').addEventListener('submit', event => { event.preventDefault(); safely(async () => { setState(await api.patchItem(editingId, { title: $('#edit-title').value, seconds: Number($('#edit-duration').value) })); $('#edit-dialog').close(); }); });
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
