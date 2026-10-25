import { makePlaylist, nextItem, holdingItem, enabledBanner, RATES } from '../shared/playlist.mjs';
import { mediaSeconds, footerSponsor, sponsorColors } from '../shared/media-settings.mjs';
import { linkedRace, replayTitle, racecardSeconds, racecardDuration, reverseRacecardTime, RACECARD_TRANSITION_SECONDS } from '../shared/race-links.mjs';
import { racePresentation } from './race-presentation.mjs';
import { ReversePlayback } from './reverse-playback.mjs';
import { raceResults, RESULTS_EXIT_SECONDS } from '../shared/race-results.mjs';
import { replaySections, REPLAY_TRANSITION_SECONDS, replayTransitionSeconds } from '../shared/instant-replays.mjs';

export class StageView {
  constructor(stage) {
    this.stage = stage; this.video = stage.querySelector('video'); this.image = stage.querySelector('img'); this.label = stage.querySelector('.stage-race-label'); this.rail = stage.querySelector('.stage-rail'); this.black = stage.querySelector('.stage-blackout'); this.signature = null;
    this.racePanel = document.createElement('section'); this.racePanel.className = 'race-broadcast'; this.racePanel.hidden = true; this.racePanel.setAttribute('aria-label','Race card, replay details and results'); stage.append(this.racePanel);
    this.replayBadge = document.createElement('div'); this.replayBadge.className = 'instant-replay-badge'; this.replayBadge.hidden = true; stage.append(this.replayBadge);
    this.wipe = document.createElement('div'); this.wipe.className = 'replay-wipe'; this.wipe.hidden = true; this.wipe.setAttribute('aria-hidden','true');
    this.wipe.innerHTML = '<div class="replay-wipe-panel"><div class="replay-wipe-brand"><span>ISASZEG PARK</span><strong>REPLAY</strong><i></i></div></div>'; stage.append(this.wipe);
    this.cardFrame = null; this.resultsFrame = null;
    this.reverse = new ReversePlayback(this.video);
    this.video.addEventListener('loadedmetadata', () => this.drawRacecard(performance.now()));
  }
  show(item, meeting, status = {}) {
    const video = item.mediaType === 'video';
    const race = linkedRace(meeting, item), card = status.phase === 'racecard' && Boolean(race), results = status.phase === 'results' && Boolean(race);
    const signature = `${item.id}:${item.url}`;
    const changed = this.signature !== signature;
    if (changed) {
      this.reverse.reset();
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
    this.stage.classList.toggle('replay-mode', video && Boolean(race) && !card && !results);
    this.stage.classList.toggle('results-mode', results);
    this.stage.classList.toggle('instant-replay-mode', status.phase === 'instant-replay');
    this.replayBadge.hidden = status.phase !== 'instant-replay';
    this.replayBadge.textContent = `INSTANT REPLAY · ${status.replayIndex + 1} / ${status.replayCount} · ${status.rate}×`;
    this.wipeClock = status.wipe ? {...status.wipe, paused: status.paused || status.wipe.waiting, at: performance.now()} : null;
    this.wipe.hidden = !this.wipeClock;
    this.drawWipe(performance.now());
    if (this.wipeClock && !this.wipeFrame) this.wipeFrame = requestAnimationFrame(now=>this.animateWipe(now));
    this.racePanel.hidden = !video || !race;
    if (video && race) {
      const content = JSON.stringify([meeting.date, meeting.registration.title, meeting.registration.track, race, meeting.registration.dogs]);
      if (content !== this.raceContent) {
        this.raceContent = content; this.racePanel.innerHTML = racePresentation(meeting, race);
        // Assign through CSSOM: the app's CSP deliberately rejects inline styles.
        for (const row of this.racePanel.querySelectorAll('[data-result-delay]')) row.style.setProperty('--result-delay', `${row.dataset.resultDelay}s`);
        for (const row of this.racePanel.querySelectorAll('[data-card-delay]')) row.style.setProperty('--card-delay', `${row.dataset.cardDelay}s`);
      }
      this.cardClock = card ? { meeting, position: status.position || 0, paused: status.paused || Boolean(status.wipe), at: performance.now() } : null;
      if (card) {
        this.video.muted = true;
        this.video.pause();
        this.drawRacecard(performance.now());
        if (this.cardFrame === null) this.cardFrame = requestAnimationFrame(now => this.animateRacecard(now));
      }
      if (results) {
        this.resultsClock = { timeline: raceResults(race, meeting.settings), position: status.position || 0, paused: status.paused || Boolean(status.wipe), at: performance.now() };
        this.video.pause();
        this.drawResults(performance.now());
        if (this.resultsFrame === null) this.resultsFrame = requestAnimationFrame(now => this.animateResults(now));
      }
    }
    if (!card) this.stopRacecard();
    if (!results) this.stopResults();
    this.black.hidden = !status.blackout;
    this.label.hidden = item.kind !== 'race' || Boolean(race);
    this.label.querySelector('strong').textContent = replayTitle(meeting,item);
    const ads = meeting.items.filter(x => x.kind === 'ad' && x.enabled);
    const rail = meeting.settings.sponsorRail && ads.length > 0;
    this.stage.classList.toggle('with-rail', Boolean(rail)); this.rail.hidden = !rail;
    if (rail) {
      const sponsor = footerSponsor(meeting), colors = sponsorColors(meeting, sponsor);
      this.rail.style.backgroundColor = colors.sponsorBackground;
      this.rail.style.color = colors.sponsorForeground;
      const signature = JSON.stringify([sponsor.id, sponsor.title, sponsor.mock]);
      if (signature !== this.railContent) {
        this.railContent = signature;
        this.rail.replaceChildren();
        for (const [className, text] of [['rail-brand', 'ISASZEG PARK'], ['rail-tag', sponsor.mock ? 'MOCK SPONSOR CONCEPT' : 'RACE DAY PARTNER'], ['rail-sponsor', sponsor.title]]) {
          const span = document.createElement('span'); span.className = className; span.textContent = text; this.rail.append(span);
        }
      }
    }
  }
  drawWipe(now) {
    if (!this.wipeClock) return;
    const clock = this.wipeClock, progress = Math.min(1,(clock.position + (clock.paused ? 0 : (now-clock.at)/1000))/(clock.duration || REPLAY_TRANSITION_SECONDS));
    const eased = progress*progress*(3-2*progress);
    const offset = clock.direction === 'out' ? -110*(1-eased) : 110*eased;
    this.wipe.style.setProperty('--replay-wipe-x',`${offset}%`);
  }
  animateWipe(now) {
    this.wipeFrame = null;
    if (!this.wipeClock) return;
    this.drawWipe(now); this.wipeFrame = requestAnimationFrame(time=>this.animateWipe(time));
  }
  drawRacecard(now) {
    if (!this.cardClock) return;
    const { meeting, position, paused, at } = this.cardClock;
    const elapsed = Math.min(racecardDuration(meeting), position + (paused ? 0 : Math.max(0,now-at)/1000));
    const progress = Math.max(0, Math.min(1, (elapsed-racecardSeconds(meeting))/RACECARD_TRANSITION_SECONDS));
    const eased = progress * progress * (3-2*progress);
    this.stage.style.setProperty('--racecard-exit', String(eased));
    this.stage.style.setProperty('--racecard-clock', `${elapsed}s`);
    this.stage.style.setProperty('--racecard-progress', String(Math.max(0,Math.min(1,elapsed/racecardSeconds(meeting)))));
    this.stage.classList.toggle('racecard-exit', elapsed >= racecardSeconds(meeting));
    this.racePanel.querySelector('.racecard-countdown strong').textContent = `${Math.max(0,Math.ceil(racecardSeconds(meeting)-elapsed))} s`;
    this.racePanel.querySelector('.racecard-countdown-label').textContent = progress > 0 ? 'STARTING REPLAY' : 'REPLAY STARTS IN';
    if (Number.isFinite(this.video.duration)) this.reverse.seek(reverseRacecardTime(meeting, elapsed, this.video.duration), now);
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
    this.cardFrame = null; this.reverse.reset();
    this.stage.classList.remove('racecard-exit');
    this.stage.style.removeProperty('--racecard-exit');
    this.stage.style.removeProperty('--racecard-progress');
    this.stage.style.removeProperty('--racecard-clock');
  }
  drawResults(now) {
    if (!this.resultsClock) return;
    const { timeline, position, paused, at } = this.resultsClock;
    const elapsed = Math.min(timeline.duration, position + (paused ? 0 : Math.max(0,now-at)/1000));
    const exit = Math.max(0,Math.min(1,(elapsed-timeline.exitAt)/RESULTS_EXIT_SECONDS));
    this.stage.style.setProperty('--results-clock', `${elapsed}s`);
    this.stage.style.setProperty('--results-enter', String(Math.min(1,elapsed/.8)));
    this.stage.style.setProperty('--results-exit', String(exit*exit*(3-2*exit)));
    this.stage.style.setProperty('--results-hold', String(Math.max(0,Math.min(1,(elapsed-timeline.completeAt)/timeline.holdSeconds))));
    this.stage.classList.toggle('results-complete', elapsed >= timeline.completeAt);
  }
  animateResults(now) {
    this.resultsFrame = null;
    if (!this.resultsClock) return;
    this.drawResults(now);
    this.resultsFrame = requestAnimationFrame(time => this.animateResults(time));
  }
  stopResults() {
    this.resultsClock = null;
    if (this.resultsFrame !== null) cancelAnimationFrame(this.resultsFrame);
    this.resultsFrame = null;
    this.stage.classList.remove('results-complete');
    for (const property of ['--results-clock','--results-enter','--results-exit','--results-hold']) this.stage.style.removeProperty(property);
  }
  mirror(item, meeting, status) {
    this.show(item, meeting, status);
    if (item.mediaType === 'video') {
      this.video.muted = true; this.video.playbackRate = status.mediaRate ?? status.rate;
      const position = status.phase === 'results' ? status.mediaPosition : status.position;
      const boundary = status.wipe?.direction!=='out' && (status.phase!==this.mirrorPhase || status.replayId!==this.mirrorReplayId || (status.wipe?.direction==='in' && this.mirrorWipe!=='in'));
      if (status.phase !== 'racecard' && Number.isFinite(position) && Number.isFinite(this.video.duration) && (boundary || Math.abs(this.video.currentTime - position) > (status.paused ? .04 : .8))) this.video.currentTime = Math.min(position,Math.max(0,this.video.duration-.04));
      if (status.paused || !['media','instant-replay'].includes(status.phase)) this.video.pause(); else this.video.play().catch(() => {});
      this.mirrorPhase=status.phase;this.mirrorReplayId=status.replayId;this.mirrorWipe=status.wipe?.direction;
    }
  }
  destroy() { this.stopRacecard(); this.stopResults(); this.reverse.destroy(); this.wipeClock = null; if(this.wipeFrame)cancelAnimationFrame(this.wipeFrame); this.video.pause(); }
}
export class Player {
  constructor(stage, report = () => {}, view = null, saveReplayRate = () => {}) {
    this.view = view || new StageView(stage); this.report = report;
    this.saveReplayRate = saveReplayRate;
    this.item = null; this.meeting = null; this.queue = []; this.failed = new Set();
    this.paused = false; this.blackout = false; this.mode = 'loop'; this.rate = 1; this.position = 0; this.last = performance.now();
    this.error = null; this.pendingError = null; this.phase = 'media';
    this.view.video.addEventListener('ended', () => { if(this.phase === 'media') this.finishMedia(); else if(this.phase === 'instant-replay' && !this.replayTransition)this.nextReplay(); });
    this.view.video.addEventListener('loadedmetadata', () => { this.view.video.playbackRate = this.effectiveRate(); if(this.phase==='results')this.seekResultsFrame(); this.resumeVideo(); });
    this.view.video.addEventListener('error', () => { if (this.item?.mediaType === 'video' && this.view.video.getAttribute('src')) this.mediaError('Cannot play this recording. Check its codec (H.264 MP4 is recommended).'); });
    this.view.image.addEventListener('error', () => { if (this.item?.mediaType !== 'video' && this.view.image.getAttribute('src')) this.mediaError('This banner image is missing or unreadable.'); });
    this.timer = setInterval(() => this.tick(), 50);
  }
  setMeeting(meeting) {
    const changedDay = this.meeting?.date !== meeting.date;
    const changedDefault = this.meeting?.settings.defaultRate !== meeting.settings.defaultRate;
    this.meeting = meeting; this.queue = makePlaylist(meeting);
    if (changedDefault) this.rate = RATES.includes(meeting.settings.defaultRate) ? meeting.settings.defaultRate : 1;
    this.view.video.muted = this.phase !== 'media' || meeting.settings.muted;
    this.view.video.playbackRate = this.effectiveRate();
    if (changedDay) { this.failed.clear(); const first = this.available()[0]; this.mode = first ? 'loop' : 'holding'; this.paused = false; this.blackout = false; this.load(first || this.holding()); }
    else {
      const current = this.queue.find(x => x.playlistSlot === this.item?.playlistSlot) || meeting.items.find(x => x.id === this.item?.id);
      if (current && current.enabled) {
        if (current.url !== this.item.url) this.load(current); else this.item = current;
      } else if (this.mode === 'holding') this.load(this.holding());
      else {
        const next = this.available()[0];
        if (!next) this.mode = 'holding';
        this.load(next || this.holding());
      }
      if (this.item) this.view.show(this.item, meeting, this.status());
      if (this.phase === 'racecard' && !linkedRace(meeting,this.item)) this.startMedia();
      if (this.phase === 'results' && !raceResults(linkedRace(meeting,this.item)).hasTimes) this.advance();
    }
    this.emit();
  }
  holding() { return holdingItem(this.meeting); }
  available() { return this.queue.filter(x => !this.failed.has(`${x.id}:${x.url}`)); }
  load(item) {
    clearTimeout(this.pendingError); this.pendingError = null;
    this.item = item; this.position = 0; this.last = performance.now(); this.error = null;
    this.activeReplays = []; this.replayTransition = null; this.replayIndex = -1;
    this.mediaReplayId = null;
    this.phase = item.mediaType === 'video' && linkedRace(this.meeting,item) ? 'racecard' : 'media';
    this.view.video.pause();
    if (item.mediaType === 'video' && this.view.signature === `${item.id}:${item.url}` && Number.isFinite(this.view.video.duration)) this.view.video.currentTime = 0;
    this.view.show(item, this.meeting, this.status());
    this.view.video.muted = this.phase !== 'media' || this.meeting.settings.muted;
    this.view.video.playbackRate = this.rate;
    if (item.mediaType === 'video' && !this.paused && this.phase === 'media') this.view.video.play().catch(e => this.onPlayError(e));
    this.emit();
  }
  startMedia(jump = false) {
    if (this.phase !== 'racecard' && !jump) return;
    this.phase = 'media'; this.position = 0; this.last = performance.now(); this.replayTransition = null;
    this.mediaReplayId = null;
    this.view.video.currentTime = 0;
    this.view.video.playbackRate = this.rate;
    this.view.show(this.item,this.meeting,this.status());
    this.view.video.muted = this.meeting.settings.muted;
    if (!this.paused) this.view.video.play().catch(e=>this.onPlayError(e));
    this.emit();
  }
  finishMedia() {
    if (this.mode === 'holding') { this.load(this.holding()); return; }
    if (!this.pendingError && this.startInstantReplay()) return;
    this.finishResults();
  }
  effectiveRate() {
    if(this.phase!=='instant-replay')return this.rate;
    return this.replayTransition?.direction==='out' ? this.replayTransition.outgoingRate : this.activeReplays?.[this.replayIndex]?.rate || .5;
  }
  resumeVideo() {
    if(!this.paused && this.item?.mediaType==='video' && ['media','instant-replay'].includes(this.phase))this.view.video.play().catch(e=>this.onPlayError(e));
  }
  setRate(rate) {
    if(!RATES.includes(rate))return;
    const section=this.phase==='instant-replay' && this.activeReplays?.[this.replayIndex];
    if(section){
      section.rate=rate;
      const saved=this.meeting.items.find(item=>item.id===this.item.id)?.replaySections?.find(value=>value.id===section.id);
      if(saved)saved.rate=rate;
      if(this.replayTransition?.direction==='out' && this.mediaReplayId===section.id)this.replayTransition.outgoingRate=rate;
      if(this.replayTransition && this.mediaReplayId===section.id)this.replayTransition.duration=Math.min(this.replayTransition.duration,replayTransitionSeconds(section,rate));
      const edit={date:this.meeting.date,id:this.item.id,sectionId:section.id,rate};
      Promise.resolve().then(()=>this.saveReplayRate(edit)).catch(error=>{this.error=`Could not save replay speed: ${error.message||error}`;this.emit();});
    }else this.rate=rate;
    this.view.video.playbackRate=this.effectiveRate();
  }
  replayTransitionWaiting() {
    return this.replayTransition?.direction==='in' && this.item?.mediaType==='video' && (this.view.video.seeking || this.view.video.readyState<2 || (['media','instant-replay'].includes(this.phase) && this.view.video.paused));
  }
  beginReplayWipe(target, duration = REPLAY_TRANSITION_SECONDS) {
    this.replayTransition={direction:'out',position:0,target,duration,outgoingRate:this.view.video.playbackRate};
    this.resumeVideo();
  }
  approachingReplayEnd(end, duration = REPLAY_TRANSITION_SECONDS) {
    return Number.isFinite(end) && this.view.video.currentTime>=end-(duration+.1)*this.view.video.playbackRate;
  }
  startInstantReplay(id) {
    const sections = replaySections(this.item,Number.isFinite(this.view.video.duration) ? this.view.video.duration : Infinity);
    const index = id ? sections.findIndex(section=>section.id===id) : 0;
    if (!sections.length || index < 0) return false;
    this.view.stopRacecard?.(); this.view.stopResults?.();
    clearTimeout(this.pendingError); this.pendingError = null; this.error = null;
    this.activeReplays = sections; this.replayIndex = index; this.phase = 'instant-replay';
    this.position = 0; this.last = performance.now();
    this.beginReplayWipe(index);
    this.view.video.muted = true;
    this.emit(); return true;
  }
  nextReplay() {
    this.beginReplayWipe(this.replayIndex+1,replayTransitionSeconds(this.activeReplays[this.replayIndex],this.view.video.playbackRate));
    this.emit();
  }
  tickReplayTransition(delta) {
    const transition = this.replayTransition;
    // Keep the diagonal panel fully covering the stage until the frame decodes.
    if (this.replayTransitionWaiting()) return;
    transition.position += delta;
    if (transition.position < transition.duration) return;
    if (transition.direction === 'out') {
      if (transition.target < this.activeReplays.length) {
        this.replayIndex = transition.target;
        this.mediaReplayId = this.activeReplays[this.replayIndex].id;
        this.replayTransition = null;
        this.view.video.currentTime = this.activeReplays[this.replayIndex].start;
        this.view.video.playbackRate = this.effectiveRate();
      } else { this.finishResults(); if(this.phase==='results')this.seekResultsFrame(); }
      this.replayTransition = {direction:'in',position:0,duration:this.phase==='instant-replay' ? replayTransitionSeconds(this.activeReplays[this.replayIndex]) : REPLAY_TRANSITION_SECONDS};
      this.resumeVideo();
    } else {
      this.replayTransition = null;
      this.resumeVideo();
    }
    this.emit();
  }
  finishResults() {
    this.replayTransition = null;
    if (!raceResults(linkedRace(this.meeting,this.item)).hasTimes || this.pendingError) { this.advance(); return; }
    this.phase = 'results'; this.position = 0; this.last = performance.now();
    this.view.video.pause(); this.view.video.muted = true;
    this.view.video.playbackRate = this.rate;
    this.view.show(this.item,this.meeting,this.status());
    this.emit();
  }
  seekResultsFrame() {
    if(Number.isFinite(this.view.video.duration))this.view.video.currentTime=Math.max(0,this.view.video.duration-.04);
  }
  jumpTo(phase) {
    if(this.item?.mediaType!=='video'||!linkedRace(this.meeting,this.item))return;
    if(phase==='results'&&!raceResults(linkedRace(this.meeting,this.item)).hasTimes)return;
    this.view.stopRacecard?.();this.view.stopResults?.();this.replayTransition=null;
    clearTimeout(this.pendingError);this.pendingError=null;this.error=null;
    this.view.video.pause();
    if(phase==='media'){this.startMedia(true);return;}
    this.phase=phase;this.position=0;this.last=performance.now();
    this.view.video.muted=true;
    this.view.video.playbackRate=this.rate;
    if(phase==='results')this.seekResultsFrame();
    this.view.show(this.item,this.meeting,this.status());this.emit();
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
    const video = this.item?.mediaType === 'video' && ['media','instant-replay'].includes(this.phase);
    let duration = mediaSeconds(this.meeting,this.item);
    if (this.phase === 'racecard') duration = racecardDuration(this.meeting);
    else if (this.phase === 'results') duration = raceResults(linkedRace(this.meeting,this.item),this.meeting.settings).duration;
    else if (video) {
      duration = Number.isFinite(this.view.video.duration) ? this.view.video.duration : 0;
      if (this.item.kind !== 'race' && this.mode !== 'holding') duration = Math.min(duration,mediaSeconds(this.meeting,this.item));
    }
    return {
      id: this.item?.id, title: replayTitle(this.meeting,this.item), position: video ? this.view.video.currentTime : this.position,
      duration,
      mediaPosition: this.item?.mediaType === 'video' ? this.view.video.currentTime : 0,
      mediaRate: this.view.video.playbackRate,
      phase: this.phase, raceId: linkedRace(this.meeting,this.item)?.id || null,
      replayIndex: this.replayIndex, replayId: this.phase==='instant-replay' ? this.activeReplays?.[this.replayIndex]?.id : null, replayCount: this.activeReplays?.length || 0,
      wipe: this.replayTransition ? {direction:this.replayTransition.direction,position:this.replayTransition.position,duration:this.replayTransition.duration,waiting:Boolean(this.replayTransitionWaiting())} : null,
      transitioning: (this.phase === 'racecard' && this.position >= racecardSeconds(this.meeting)) || Boolean(this.replayTransition),
      paused: this.paused, rate: this.phase==='instant-replay' ? this.activeReplays[this.replayIndex].rate : this.rate, mode: this.mode, blackout: this.blackout, error: this.error,
      kind: this.item?.kind, next: replayTitle(this.meeting,nextItem(this.available(), this.item))
    };
  }
  emit() { this.lastReport = performance.now(); this.report(this.status()); }
  tick() {
    const now = performance.now(); const delta = Math.min(2, (now - this.last) / 1000); this.last = now;
    if (!this.meeting || !this.item) return;
    const wasTransitioning = this.status().transitioning;
    if (!this.paused && this.replayTransition && !this.pendingError) {
      this.tickReplayTransition(delta);
    } else if (!this.paused && this.phase === 'instant-replay' && !this.pendingError) {
      const section = this.activeReplays[this.replayIndex];
      if (this.approachingReplayEnd(section.end,replayTransitionSeconds(section,this.view.video.playbackRate))) this.nextReplay();
    } else if (!this.paused && this.phase === 'media' && this.item.mediaType==='video' && !this.pendingError && replaySections(this.item,this.view.video.duration).length && this.approachingReplayEnd(this.view.video.duration)) {
      this.startInstantReplay();
    } else if (!this.paused && this.phase === 'racecard' && !this.pendingError) {
      this.position += delta;
      if (this.position >= racecardDuration(this.meeting)) this.startMedia();
    } else if (!this.paused && this.phase === 'results' && !this.pendingError) {
      this.position += delta;
      if (this.position >= raceResults(linkedRace(this.meeting,this.item), this.meeting.settings).duration) this.advance();
    } else if (!this.paused && this.phase === 'media' && this.item.mediaType === 'video' && this.item.kind !== 'race' && this.mode !== 'holding' && !this.pendingError) {
      if (this.view.video.currentTime >= mediaSeconds(this.meeting,this.item)) this.advance();
    } else if (!this.paused && this.item.mediaType !== 'video' && !this.pendingError) {
      this.position += delta;
      if (this.mode !== 'holding' && this.position >= mediaSeconds(this.meeting,this.item)) this.advance();
    }
    this.view.show(this.item, this.meeting, this.status());
    if (wasTransitioning !== this.status().transitioning || now-(this.lastReport || 0) >= 250) this.emit();
  }
  command(command) {
    if (!this.meeting || !command) return;
    const video = this.view.video;
    switch (command.type) {
      case 'toggle': this.paused = !this.paused; if (this.paused)video.pause();else this.resumeVideo(); break;
      case 'skip-racecard': this.skipRacecard(); break;
      case 'jump-racecard': this.jumpTo('racecard'); break;
      case 'jump-replay': this.jumpTo('media'); break;
      case 'jump-results': this.jumpTo('results'); break;
      case 'jump-instant-replay': this.startInstantReplay(command.id); break;
      case 'rate': this.setRate(command.rate); break;
      case 'cycle-rate': this.setRate(RATES[(RATES.indexOf(this.status().rate) + 1) % RATES.length]); break;
      case 'seek': if (this.phase === 'media' && this.item?.mediaType === 'video' && Number.isFinite(command.delta) && Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration - .02, video.currentTime + Math.max(-30, Math.min(30, command.delta)))); break;
      case 'scrub': if (this.phase === 'media' && this.item?.mediaType === 'video' && Number.isFinite(video.duration) && Number.isFinite(command.fraction)) video.currentTime = Math.max(0, Math.min(video.duration - .02, command.fraction * video.duration)); break;
      case 'next': this.blackout = false; this.advance(); break;
      case 'previous': this.blackout = false; this.advance(-1); break;
      case 'holding': if (enabledBanner(this.meeting)) { this.mode = 'holding'; this.blackout = false; this.paused = false; this.load(this.holding()); } break;
      case 'latest': {
        const races = this.meeting.items.filter(x => x.kind === 'race' && x.enabled).sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || '') || b.raceNumber - a.raceNumber);
        if (races[0]) { this.mode = 'loop'; this.blackout = false; this.paused = false; this.load(races[0]); }
        break;
      }
      case 'play': { const item = this.queue.find(x => x.id === command.id); if (item) { this.failed.delete(`${item.id}:${item.url}`); this.mode = 'loop'; this.blackout = false; this.paused = false; this.load(item); } break; }
      case 'blackout': this.blackout = !this.blackout; if (this.blackout) { this.beforeBlackout = this.paused; this.paused = true; video.pause(); } else { this.paused = this.beforeBlackout ?? false; this.resumeVideo(); } break;
    }
    this.last = performance.now(); this.view.show(this.item, this.meeting, this.status()); this.emit();
  }
  destroy() { clearInterval(this.timer); clearTimeout(this.pendingError); this.view.video.pause(); this.view.destroy?.(); }
}
