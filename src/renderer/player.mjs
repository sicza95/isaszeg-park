import { makePlaylist, nextItem, holdingItem, RATES } from '../shared/playlist.mjs';
import { linkedRace, replayTitle, racecardSeconds, racecardDuration, reverseRacecardTime, RACECARD_TRANSITION_SECONDS } from '../shared/race-links.mjs';
import { racePresentation } from './race-presentation.mjs';

export class StageView {
  constructor(stage) {
    this.stage = stage; this.video = stage.querySelector('video'); this.image = stage.querySelector('img'); this.label = stage.querySelector('.stage-race-label'); this.rail = stage.querySelector('.stage-rail'); this.black = stage.querySelector('.stage-blackout'); this.signature = null;
    this.racePanel = document.createElement('section'); this.racePanel.className = 'race-broadcast'; this.racePanel.hidden = true; this.racePanel.setAttribute('aria-label','Race card and replay details'); stage.append(this.racePanel);
    this.cardFrame = null;
    this.video.addEventListener('loadedmetadata', () => this.drawRacecard(performance.now()));
  }
  show(item, meeting, status = {}) {
    const video = item.mediaType === 'video';
    const race = linkedRace(meeting, item), card = status.phase === 'racecard' && Boolean(race);
    const signature = `${item.id}:${item.url}`;
    const changed = this.signature !== signature;
    if (changed) {
      this.signature = signature;
      this.video.pause(); this.video.removeAttribute('src'); this.video.load();
      this.image.removeAttribute('src');
      if (video) { this.video.src = item.url; this.video.load(); }
      else { this.image.src = item.url; this.image.alt = item.title; }
    }
    this.video.hidden = !video; this.image.hidden = video;
    this.stage.classList.toggle('video-mode', video);
    this.stage.classList.toggle('linked-race', video && Boolean(race));
    this.stage.classList.toggle('racecard-mode', card);
    this.stage.classList.toggle('replay-mode', video && Boolean(race) && !card);
    this.racePanel.hidden = !video || !race;
    if (video && race) {
      const content = JSON.stringify([meeting.date, meeting.registration.title, meeting.registration.track, race, meeting.registration.dogs]);
      if (content !== this.raceContent) { this.raceContent = content; this.racePanel.innerHTML = racePresentation(meeting, race); }
      this.cardClock = card ? { meeting, position: status.position || 0, paused: status.paused, at: performance.now() } : null;
      if (card) {
        this.video.muted = true;
        this.video.pause();
        this.drawRacecard(performance.now());
        if (this.cardFrame === null) this.cardFrame = requestAnimationFrame(now => this.animateRacecard(now));
      }
    }
    if (!card) this.stopRacecard();
    this.black.hidden = !status.blackout;
    this.label.hidden = item.kind !== 'race' || Boolean(race);
    this.label.querySelector('strong').textContent = replayTitle(meeting,item);
    const ads = meeting.items.filter(x => x.kind === 'ad' && x.enabled);
    const rail = meeting.settings.sponsorRail && ads.length > 0;
    this.stage.classList.toggle('with-rail', Boolean(rail)); this.rail.hidden = !rail;
    if (rail) {
      const sponsor = ads[Math.floor(Date.now() / 12000) % ads.length];
      this.rail.replaceChildren();
      for (const [className, text] of [['rail-brand', 'ISASZEG PARK'], ['rail-tag', sponsor.mock ? 'MOCK SPONSOR CONCEPT' : 'RACE DAY PARTNER'], ['rail-sponsor', sponsor.title]]) {
        const span = document.createElement('span'); span.className = className; span.textContent = text; this.rail.append(span);
      }
    }
  }
  drawRacecard(now) {
    if (!this.cardClock) return;
    const { meeting, position, paused, at } = this.cardClock;
    const elapsed = Math.min(racecardDuration(meeting), position + (paused ? 0 : Math.max(0,now-at)/1000));
    const progress = Math.max(0, Math.min(1, (elapsed-racecardSeconds(meeting))/RACECARD_TRANSITION_SECONDS));
    const eased = progress * progress * (3-2*progress);
    this.stage.style.setProperty('--racecard-exit', String(eased));
    this.stage.classList.toggle('racecard-exit', elapsed >= racecardSeconds(meeting));
    this.racePanel.querySelector('.racecard-countdown strong').textContent = `${Math.max(0,Math.ceil(racecardSeconds(meeting)-elapsed))} s`;
    this.racePanel.querySelector('.racecard-countdown-label').textContent = progress > 0 ? 'STARTING REPLAY' : 'REPLAY STARTS IN';
    // Chromium media is decoded in reverse by seeking a paused, muted video.
    // Keep only one seek in flight so slow camera codecs cannot build a queue.
    if (Number.isFinite(this.video.duration) && this.video.readyState >= 1 && !this.video.seeking && (!this.lastReverseSeek || now-this.lastReverseSeek >= 1000/30)) {
      const target = reverseRacecardTime(meeting, elapsed, this.video.duration);
      if (Math.abs(this.video.currentTime-target) >= .025) { this.video.currentTime = target; this.lastReverseSeek = now; }
    }
  }
  animateRacecard(now) {
    this.cardFrame = null;
    if (!this.cardClock) return;
    this.drawRacecard(now);
    this.cardFrame = requestAnimationFrame(time => this.animateRacecard(time));
  }
  stopRacecard() {
    this.cardClock = null;
    if (this.cardFrame !== null) cancelAnimationFrame(this.cardFrame);
    this.cardFrame = null; this.lastReverseSeek = null;
    this.stage.classList.remove('racecard-exit');
    this.stage.style.removeProperty('--racecard-exit');
  }
  mirror(item, meeting, status) {
    this.show(item, meeting, status);
    if (item.mediaType === 'video') {
      this.video.muted = true; this.video.playbackRate = status.rate;
      if (status.phase !== 'racecard' && Number.isFinite(status.position) && Number.isFinite(this.video.duration) && Math.abs(this.video.currentTime - status.position) > 0.8) this.video.currentTime = status.position;
      if (status.paused || status.phase === 'racecard') this.video.pause(); else this.video.play().catch(() => {});
    }
  }
  destroy() { this.stopRacecard(); this.video.pause(); }
}
export class Player {
  constructor(stage, report = () => {}, view = null) {
    this.view = view || new StageView(stage); this.report = report;
    this.item = null; this.meeting = null; this.queue = []; this.failed = new Set();
    this.paused = false; this.blackout = false; this.mode = 'loop'; this.rate = 1; this.position = 0; this.last = performance.now();
    this.error = null; this.pendingError = null; this.phase = 'media';
    this.view.video.addEventListener('ended', () => { if(this.phase === 'media') this.advance(); });
    this.view.video.addEventListener('loadedmetadata', () => { this.view.video.playbackRate = this.rate; if (!this.paused && this.phase === 'media') this.view.video.play().catch(e => this.onPlayError(e)); });
    this.view.video.addEventListener('error', () => { if (this.item?.mediaType === 'video' && this.view.video.getAttribute('src')) this.mediaError('Cannot play this recording. Check its codec (H.264 MP4 is recommended).'); });
    this.view.image.addEventListener('error', () => { if (this.item?.mediaType !== 'video' && this.view.image.getAttribute('src')) this.mediaError('This banner image is missing or unreadable.'); });
    this.timer = setInterval(() => this.tick(), 50);
  }
  setMeeting(meeting) {
    const changedDay = this.meeting?.date !== meeting.date;
    const changedDefault = this.meeting?.settings.defaultRate !== meeting.settings.defaultRate;
    this.meeting = meeting; this.queue = makePlaylist(meeting);
    if (changedDefault) this.rate = RATES.includes(meeting.settings.defaultRate) ? meeting.settings.defaultRate : 1;
    this.view.video.muted = this.phase === 'racecard' || meeting.settings.muted;
    this.view.video.playbackRate = this.rate;
    if (changedDay) { this.failed.clear(); const first = this.available()[0]; this.mode = first ? 'loop' : 'holding'; this.paused = false; this.blackout = false; this.load(first || this.holding()); }
    else {
      const current = this.queue.find(x => x.playlistSlot === this.item?.playlistSlot) || meeting.items.find(x => x.id === this.item?.id);
      if (current && (current.enabled || this.mode === 'holding')) {
        if (current.url !== this.item.url) this.load(current); else this.item = current;
      } else if (this.mode === 'holding') this.load(this.holding());
      else {
        const next = this.available()[0];
        if (!next) this.mode = 'holding';
        this.load(next || this.holding());
      }
      if (this.item) this.view.show(this.item, meeting, this.status());
      if (this.phase === 'racecard' && !linkedRace(meeting,this.item)) this.startMedia();
    }
    this.emit();
  }
  holding() { return holdingItem(this.meeting); }
  available() { return this.queue.filter(x => !this.failed.has(`${x.id}:${x.url}`)); }
  load(item) {
    clearTimeout(this.pendingError); this.pendingError = null;
    this.item = item; this.position = 0; this.last = performance.now(); this.error = null;
    this.phase = item.mediaType === 'video' && linkedRace(this.meeting,item) ? 'racecard' : 'media';
    this.view.video.pause();
    if (item.mediaType === 'video' && this.view.signature === `${item.id}:${item.url}` && Number.isFinite(this.view.video.duration)) this.view.video.currentTime = 0;
    this.view.show(item, this.meeting, this.status());
    this.view.video.muted = this.phase === 'racecard' || this.meeting.settings.muted;
    this.view.video.playbackRate = this.rate;
    if (item.mediaType === 'video' && !this.paused && this.phase === 'media') this.view.video.play().catch(e => this.onPlayError(e));
    this.emit();
  }
  startMedia() {
    if (this.phase !== 'racecard') return;
    this.phase = 'media'; this.position = 0; this.last = performance.now();
    this.view.video.currentTime = 0;
    this.view.show(this.item,this.meeting,this.status());
    this.view.video.muted = this.meeting.settings.muted;
    if (!this.paused) this.view.video.play().catch(e=>this.onPlayError(e));
    this.emit();
  }
  skipRacecard() {
    if (this.phase !== 'racecard' || this.position >= racecardSeconds(this.meeting)) return;
    this.position = racecardSeconds(this.meeting); this.last = performance.now();
  }
  onPlayError(error) { if (error.name !== 'AbortError' && error.name !== 'NotSupportedError') { this.paused = true; this.error = 'Playback needs a click. Press Play to continue.'; this.emit(); } }
  mediaError(message) {
    if (this.pendingError || !this.item) return;
    this.error = `${this.item.title}: ${message}`; this.failed.add(`${this.item.id}:${this.item.url}`); this.emit();
    this.pendingError = setTimeout(() => {
      this.pendingError = null;
      if (this.available().length && this.mode !== 'holding') this.advance();
      else { this.paused = true; this.emit(); }
    }, 1800);
  }
  advance(direction = 1) { this.mode = 'loop'; const queue = this.available(); const next = nextItem(queue, this.item, direction); if (next) this.load(next); else { this.mode = 'holding'; this.load(this.holding()); } }
  status() {
    const video = this.item?.mediaType === 'video' && this.phase !== 'racecard';
    return {
      id: this.item?.id, title: replayTitle(this.meeting,this.item), position: video ? this.view.video.currentTime : this.position,
      duration: this.phase === 'racecard' ? racecardDuration(this.meeting) : video ? (Number.isFinite(this.view.video.duration) ? this.view.video.duration : 0) : (this.item?.seconds || 12),
      phase: this.phase, raceId: linkedRace(this.meeting,this.item)?.id || null,
      transitioning: this.phase === 'racecard' && this.position >= racecardSeconds(this.meeting),
      paused: this.paused, rate: this.rate, mode: this.mode, blackout: this.blackout, error: this.error,
      kind: this.item?.kind, next: replayTitle(this.meeting,nextItem(this.available(), this.item))
    };
  }
  emit() { this.lastReport = performance.now(); this.report(this.status()); }
  tick() {
    const now = performance.now(); const delta = Math.min(2, (now - this.last) / 1000); this.last = now;
    if (!this.meeting || !this.item) return;
    const wasTransitioning = this.status().transitioning;
    if (!this.paused && this.phase === 'racecard' && !this.pendingError) {
      this.position += delta;
      if (this.position >= racecardDuration(this.meeting)) this.startMedia();
    } else if (!this.paused && this.item.mediaType !== 'video' && !this.pendingError) {
      this.position += delta;
      if (this.mode !== 'holding' && this.position >= (this.item.seconds || 12)) this.advance();
    }
    this.view.show(this.item, this.meeting, this.status());
    if (wasTransitioning !== this.status().transitioning || now-(this.lastReport || 0) >= 250) this.emit();
  }
  command(command) {
    if (!this.meeting || !command) return;
    const video = this.view.video;
    switch (command.type) {
      case 'toggle': this.paused = !this.paused; if (this.item?.mediaType === 'video' && this.phase === 'media') { if (this.paused) video.pause(); else video.play().catch(e => this.onPlayError(e)); } break;
      case 'skip-racecard': this.skipRacecard(); break;
      case 'rate': if (RATES.includes(command.rate)) { this.rate = command.rate; video.playbackRate = this.rate; } break;
      case 'cycle-rate': this.rate = RATES[(RATES.indexOf(this.rate) + 1) % RATES.length]; video.playbackRate = this.rate; break;
      case 'seek': if (this.phase === 'media' && this.item?.mediaType === 'video' && Number.isFinite(command.delta) && Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration - .02, video.currentTime + Math.max(-30, Math.min(30, command.delta)))); break;
      case 'scrub': if (this.phase === 'media' && this.item?.mediaType === 'video' && Number.isFinite(video.duration) && Number.isFinite(command.fraction)) video.currentTime = Math.max(0, Math.min(video.duration - .02, command.fraction * video.duration)); break;
      case 'next': this.blackout = false; this.advance(); break;
      case 'previous': this.blackout = false; this.advance(-1); break;
      case 'holding': this.mode = 'holding'; this.blackout = false; this.paused = false; this.load(this.holding()); break;
      case 'latest': {
        const races = this.meeting.items.filter(x => x.kind === 'race' && x.enabled).sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || '') || b.raceNumber - a.raceNumber);
        if (races[0]) { this.mode = 'loop'; this.blackout = false; this.paused = false; this.load(races[0]); }
        break;
      }
      case 'play': { const item = this.queue.find(x => x.id === command.id); if (item) { this.failed.delete(`${item.id}:${item.url}`); this.mode = 'loop'; this.blackout = false; this.paused = false; this.load(item); } break; }
      case 'blackout': this.blackout = !this.blackout; if (this.blackout) { this.beforeBlackout = this.paused; this.paused = true; video.pause(); } else { this.paused = this.beforeBlackout ?? false; if (!this.paused && this.phase === 'media' && this.item?.mediaType === 'video') video.play().catch(e => this.onPlayError(e)); } break;
    }
    this.last = performance.now(); this.view.show(this.item, this.meeting, this.status()); this.emit();
  }
  destroy() { clearInterval(this.timer); clearTimeout(this.pendingError); this.view.video.pause(); this.view.destroy?.(); }
}
