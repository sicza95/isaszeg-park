import { escapeHTML as e, icon } from './icons.mjs';
import { linkedRace, replayTitle } from '../shared/race-links.mjs';
import { replaySections, replayTime, validateReplaySections, replayTrackGradient } from '../shared/instant-replays.mjs';
import { statusField, attachStatusFields, setStatusField } from './runner-status.mjs';
import { trapBadge } from './trap-badge.mjs';

export function createMediaEditor({api, getState, setState, toast}) {
  const dialog = document.querySelector('#edit-dialog'), form = dialog.querySelector('form');
  const $ = selector => dialog.querySelector(selector), video = $('#edit-video'), timeline = $('#moment-timeline');
  let queue = [], index = 0, item, sections = [], selected, duration = 0, drag, previewing, saving = false, generation = 0, sampler;
  let resultsRace, resultsDrafts = new Map();
  const state = () => getState();
  const active = () => sections.find(section=>section.id===selected);
  const clamp = value => Math.max(0,Math.min(duration,value));
  const round = value => Math.round(value*1000)/1000;
  const timeAt = event => clamp((event.clientX-timeline.getBoundingClientRect().left)/timeline.clientWidth*duration);
  function stopPreview() { previewing = null; video.pause(); video.playbackRate = 1; $('#preview-moment').textContent = 'Preview moment'; }
  function captureResults() {
    if (!resultsRace) return;
    resultsDrafts.set(resultsRace,[...$('#media-runners').querySelectorAll('[data-runner]')].map(row=>({trap:Number(row.dataset.runner),status:row.querySelector('[name^=status-]').value,time:row.querySelector('[name^=time-]').value,split:row.querySelector('[name^=split-]').value})));
  }
  function renderResults() {
    resultsRace = $('#edit-race').value;
    const registration = state().meeting.registration, race = registration?.races.find(race=>race.id===resultsRace);
    $('#media-results-help').hidden = Boolean(race?.entries.length);
    $('#media-results-help').textContent = race ? 'No dogs assigned to this race yet. Add them in Races & dogs.' : 'Link this video to a registered race to edit dog statuses and times here.';
    const drafts = resultsDrafts.get(resultsRace);
    $('#media-runners').innerHTML = race?.entries.slice().sort((a,b)=>a.trap-b.trap).map(entry=>{
      const value = {...entry,...drafts?.find(draft=>draft.trap===entry.trap)}, dog = registration.dogs.find(dog=>dog.id===entry.dogId);
      return `<div class="media-runner" data-runner="${entry.trap}">${trapBadge(entry.trap)}<strong>${e(dog?.name||'Unknown dog')}</strong>${statusField(entry.trap,value,'media-runner-status')}<label>Split (s)<input type="number" name="split-${entry.trap}" value="${e(value.split||'')}" min="0.01" step="0.01" aria-label="Split for trap ${entry.trap}"></label><label>Time (s)<input type="number" name="time-${entry.trap}" value="${e(value.time||'')}" min="0.01" step="0.01" aria-label="Time for trap ${entry.trap}"></label></div>`;
    }).join('') || '';
  }
  function renderRanges() {
    $('#edit-video-seek').style.setProperty('--replay-track',replayTrackGradient(sections,duration));
    const ranges=$('#moment-ranges'), signature=JSON.stringify(sections.map(section=>section.id));
    // Retain handle elements while editing so focus and pointer interactions survive.
    if(ranges.dataset.signature!==signature){
      ranges.dataset.signature=signature;
      ranges.innerHTML = sections.map((section,i)=>`<div class="moment-range" data-moment="${e(section.id)}"><button type="button" class="moment-handle" data-edge="start" role="slider" aria-label="Moment ${i+1} start"></button><button type="button" class="moment-body" aria-label="Select or move moment ${i+1}">${i+1}</button><button type="button" class="moment-handle" data-edge="end" role="slider" aria-label="Moment ${i+1} end"></button></div>`).join('');
    }
    for (const range of ranges.children) {
      const section = sections.find(section=>section.id===range.dataset.moment);
      range.classList.toggle('selected',section.id===selected);
      range.style.left = `${section.start/duration*100}%`; range.style.width = `${(section.end-section.start)/duration*100}%`;
      for(const edge of ['start','end']){
        const handle=range.querySelector(`[data-edge="${edge}"]`);
        handle.setAttribute('aria-valuemin',String(edge==='start'?0:section.start+.2));handle.setAttribute('aria-valuemax',String(edge==='start'?section.end-.2:duration));handle.setAttribute('aria-valuenow',String(section[edge]));handle.setAttribute('aria-valuetext',replayTime(section[edge]));
      }
    }
    $('#moment-list').innerHTML = sections.length ? sections.map((section,i)=>`<button type="button" class="moment-chip${section.id===selected?' selected':''}" data-select-moment="${e(section.id)}" aria-pressed="${section.id===selected}"><b>${i+1}</b><span>${e(section.label||`Moment ${i+1}`)}<small>${replayTime(section.start)} – ${replayTime(section.end)} · ${section.rate}×</small></span></button>`).join('') : '<p class="moment-empty">No moments yet. Drag across the timeline to mark the action.</p>';
    $('#moment-count').textContent = `${sections.length} moment${sections.length===1?'':'s'}`;
  }
  function renderSelection() {
    const section = active(); $('#moment-details').hidden = !section;
    if (!section) return;
    $('#moment-name').value = section.label; $('#moment-start').value = section.start.toFixed(3); $('#moment-end').value = section.end.toFixed(3); $('#moment-rate').value = section.rate;
    $('#moment-start').max = Math.max(0,section.end-.2); $('#moment-end').max = duration.toFixed(3); $('#moment-end').min = section.start+.2;
  }
  function select(id, seek = true) { stopPreview(); selected = id; renderRanges(); renderSelection(); if(seek && active())video.currentTime = active().start; }
  function addMoment(start, end) {
    if (sections.length>=64) { toast('You can mark up to 64 moments.',true); return; }
    const section = {id:crypto.randomUUID(), start:round(start), end:round(end), rate:.5, label:''};
    sections.push(section); sections.sort((a,b)=>a.start-b.start); select(section.id,false);
  }
  function updateClock() {
    const time = video.currentTime || 0;
    $('#edit-video-clock').textContent = `${replayTime(time)} / ${replayTime(duration)}`;
    $('#edit-video-seek').value = duration ? time/duration*1000 : 0;
    $('#moment-playhead').style.left = `${duration ? time/duration*100 : 0}%`;
    $('#edit-video-play').innerHTML = icon(video.paused?'play':'pause');
    $('#edit-video-play').setAttribute('aria-label',video.paused?'Play editor preview':'Pause editor preview');
  }
  function clearMedia() {
    generation++; stopPreview(); duration = 0;
    sampler?.pause(); sampler?.removeAttribute('src'); sampler?.load(); sampler = null;
    video.removeAttribute('src'); video.load();
  }
  async function thumbnails(token) {
    const source = document.createElement('video'); sampler = source; source.muted = true; source.preload = 'auto'; source.src = item.url;
    const wait = event => new Promise((resolve,reject)=>{
      const done=()=>{cleanup();resolve();}, fail=()=>{cleanup();reject(new Error('Preview unavailable'));};
      const timeout=setTimeout(fail,5000), cleanup=()=>{clearTimeout(timeout);source.removeEventListener(event,done);source.removeEventListener('error',fail);};
      source.addEventListener(event,done,{once:true});source.addEventListener('error',fail,{once:true});
    });
    try {
      await wait('loadedmetadata');
      const canvas = $('#moment-filmstrip'), context = canvas.getContext('2d');
      canvas.width=1200; canvas.height=90; context.fillStyle='#17171b'; context.fillRect(0,0,1200,90);
      for(let i=0;i<12;i++){
        if(token!==generation)return;
        const seeked=wait('seeked'); source.currentTime=Math.min(duration-.01,(i+.5)/12*duration); await seeked;
        if(token!==generation)return;
        const ratio=Math.max(100/source.videoWidth,90/source.videoHeight), width=source.videoWidth*ratio,height=source.videoHeight*ratio;
        context.save();context.beginPath();context.rect(i*100,0,100,90);context.clip();context.drawImage(source,i*100+(100-width)/2,(90-height)/2,width,height);context.restore();
      }
    } catch { /* The range editor remains usable when thumbnail decoding fails. */ }
    finally { source.pause();source.removeAttribute('src');source.load();if(sampler===source)sampler=null; }
  }
  function showCurrent() {
    clearMedia(); resultsDrafts = new Map(); resultsRace = null; selected = null;
    item = state().meeting.items.find(item=>item.id===queue[index]);
    if (!item) { next(); return; }
    sections = replaySections(item);
    $('#edit-progress').hidden = queue.length<2; $('#edit-progress').textContent = `${index+1} of ${queue.length}`;
    $('#edit-source').textContent = item.originalName || replayTitle(state().meeting,item);
    $('#edit-title').value = item.title; $('#edit-duration').value = item.seconds || 12; $('#edit-duration-label').hidden = item.mediaType==='video';
    $('#edit-race-label').hidden = item.kind!=='race';
    const race = linkedRace(state().meeting,item);
    $('#edit-race').innerHTML = `<option value="">No linked race</option>${(state().meeting.registration?.races||[]).slice().sort((a,b)=>a.number-b.number).map(race=>`<option value="${e(race.id)}">Race ${String(race.number).padStart(2,'0')} · ${e(race.title)}</option>`).join('')}`;
    $('#edit-race').value = race?.id || '';
    $('#edit-race-help').textContent = 'The linked race supplies the race card, runners and results.';
    const raceVideo = item.kind==='race' && item.mediaType==='video';
    dialog.classList.toggle('race-media-editor',raceVideo); $('#race-media-workspace').hidden = !raceVideo;
    $('#edit-save').textContent = index<queue.length-1?'Save & next':'Save changes';
    $('#edit-skip').hidden = queue.length<2; $('#edit-skip').textContent = index<queue.length-1?'Skip for now':'Finish later';
    $('#edit-error').textContent = ''; $('#moment-load-status').textContent = 'Loading video…';
    timeline.setAttribute('aria-disabled','true'); $('#add-moment').disabled = true;
    $('#moment-ruler').replaceChildren(); $('#moment-filmstrip').getContext('2d').clearRect(0,0,1200,90);
    renderRanges(); renderSelection(); renderResults();
    if(raceVideo){video.src=item.url;video.load();}
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }
  function next() { if(index<queue.length-1){index++;showCurrent();}else dialog.close(); }
  $('#edit-race').addEventListener('change',()=>{captureResults();renderResults();});
  attachStatusFields($('#media-runners'));
  $('#media-runners').addEventListener('input',event=>{
    if(!event.target.name?.startsWith('time-'))return;
    const row=event.target.closest('[data-runner]'), field=row.querySelector('.runner-status-field'), status=field.querySelector('input').value;
    if(['ENTERED','FIN'].includes(status)){
      const entry=state().meeting.registration.races.find(race=>race.id===resultsRace)?.entries.find(entry=>entry.trap===Number(row.dataset.runner));
      setStatusField(field,event.target.value || entry?.estimatedTime ? 'FIN' : 'ENTERED');
    }
  });
  video.addEventListener('loadedmetadata',()=>{
    duration=Number.isFinite(video.duration)?video.duration:0;
    sections=replaySections({...item,replaySections:sections},duration);
    timeline.setAttribute('aria-disabled',String(duration<.2)); $('#add-moment').disabled=duration<.2;
    $('#moment-load-status').textContent = 'Drag to mark a moment · drag its edges to trim · drag its centre to move';
    $('#moment-ruler').innerHTML=Array.from({length:7},(_,i)=>`<span>${replayTime(i*duration/6)}</span>`).join('');
    selected=sections[0]?.id;renderRanges();renderSelection();updateClock();thumbnails(generation);
  });
  video.addEventListener('error',()=>{$('#moment-load-status').textContent='Video preview unavailable. Check the recording’s format or reopen the editor.';});
  for(const event of ['timeupdate','play','pause','seeked'])video.addEventListener(event,updateClock);
  const previewTimer=setInterval(()=>{if(previewing && video.currentTime>=previewing.end){video.currentTime=previewing.end;stopPreview();}},30);
  // The editor exists for the lifetime of the desk; the timer does no work when closed.
  window.addEventListener('pagehide',()=>clearInterval(previewTimer),{once:true});
  $('#edit-video-play').addEventListener('click',()=>{previewing=null;$('#preview-moment').textContent='Preview moment';video.playbackRate=1;if(video.paused)video.play().catch(error=>{$('#edit-error').textContent=error.message;});else video.pause();});
  $('#edit-video-seek').addEventListener('input',()=>{stopPreview();if(duration)video.currentTime=Number($('#edit-video-seek').value)/1000*duration;});
  $('#add-moment').addEventListener('click',()=>{stopPreview();const start=clamp(Math.min(video.currentTime,duration-.2));addMoment(start,Math.min(duration,start+3));});
  timeline.addEventListener('pointerdown',event=>{
    if(event.button!==0 || duration<.2 || saving)return;
    event.preventDefault();stopPreview();
    const range=event.target.closest('[data-moment]'), section=sections.find(section=>section.id===range?.dataset.moment);
    drag={pointer:event.pointerId,at:timeAt(event),section,original:section?{...section}:null,edge:event.target.dataset.edge,moved:false};
    if(section)selected=section.id;
    timeline.setPointerCapture(event.pointerId);
    if(!section)video.currentTime=drag.at;
  });
  timeline.addEventListener('pointermove',event=>{
    if(!drag || event.pointerId!==drag.pointer)return;
    const time=timeAt(event), delta=time-drag.at;
    if(Math.abs(delta)/duration*timeline.clientWidth<4 && !drag.moved)return;
    drag.moved=true;
    if(!drag.section){
      if(Math.abs(delta)<.2)return;
      addMoment(Math.min(drag.at,time),Math.max(drag.at,time));drag.section=active();drag.edge='create';
      if(!drag.section)return;
    }
    const section=drag.section, original=drag.original;
    if(drag.edge==='create'){section.start=round(Math.min(drag.at,Math.max(0,time)));section.end=round(Math.max(drag.at,time));if(section.end-section.start<.2)section.end=Math.min(duration,section.start+.2);}
    else if(drag.edge==='start')section.start=round(Math.max(0,Math.min(original.end-.2,original.start+delta)));
    else if(drag.edge==='end')section.end=round(Math.min(duration,Math.max(original.start+.2,original.end+delta)));
    else {section.start=round(Math.max(0,Math.min(duration-(original.end-original.start),original.start+delta)));section.end=round(section.start+original.end-original.start);}
    video.currentTime=drag.edge==='end'?section.end:section.start;
    renderRanges();renderSelection();
  });
  const finishDrag=()=>{if(!drag)return;const id=drag.section?.id;drag=null;sections.sort((a,b)=>a.start-b.start);if(id)select(id,false);};
  timeline.addEventListener('pointerup',finishDrag);timeline.addEventListener('pointercancel',finishDrag);timeline.addEventListener('lostpointercapture',finishDrag);
  timeline.addEventListener('click',event=>{if(event.detail===0){const range=event.target.closest('[data-moment]');if(range)select(range.dataset.moment);}});
  timeline.addEventListener('keydown',event=>{
    const edge=event.target.dataset.edge, section=sections.find(section=>section.id===event.target.closest('[data-moment]')?.dataset.moment);
    if(!section || !edge || !['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();const delta=(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?1:.1);
    if(edge==='start')section.start=round(Math.max(0,Math.min(section.end-.2,section.start+delta)));else section.end=round(Math.min(duration,Math.max(section.start+.2,section.end+delta)));
    select(section.id,false);$(`[data-moment="${CSS.escape(section.id)}"] [data-edge="${edge}"]`).focus();
  });
  $('#moment-list').addEventListener('click',event=>{const button=event.target.closest('[data-select-moment]');if(button)select(button.dataset.selectMoment);});
  for(const name of ['name','start','end','rate'])$(`#moment-${name}`).addEventListener('change',()=>{
    const section=active();if(!section)return;
    stopPreview();
    section.label=$('#moment-name').value;
    if(name==='start')section.start=round(Math.max(0,Math.min(section.end-.2,Number($('#moment-start').value))));
    if(name==='end')section.end=round(Math.min(duration,Math.max(section.start+.2,Number($('#moment-end').value))));
    section.rate=Number($('#moment-rate').value);sections.sort((a,b)=>a.start-b.start);renderRanges();renderSelection();
  });
  $('#delete-moment').addEventListener('click',()=>{stopPreview();sections=sections.filter(section=>section.id!==selected);select(sections[0]?.id,false);});
  $('#preview-moment').addEventListener('click',()=>{
    const section=active();if(!section)return;
    if(previewing){stopPreview();return;}
    previewing={...section};video.currentTime=section.start;video.playbackRate=section.rate;$('#preview-moment').textContent='Stop preview';video.play().catch(error=>{$('#edit-error').textContent=error.message;stopPreview();});
  });
  $('#edit-skip').addEventListener('click',()=>{if(!saving)next();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(saving)return;
    const patch={title:$('#edit-title').value,seconds:Number($('#edit-duration').value)};
    try {
      if(item.kind==='race'){
        if($('#edit-race').value!==(linkedRace(state().meeting,item)?.id||''))patch.raceId=$('#edit-race').value||null;
        if(item.mediaType==='video')patch.replaySections=validateReplaySections(sections);
        captureResults();if(resultsRace)patch.runnerResults={raceId:resultsRace,entries:resultsDrafts.get(resultsRace)};
      }
      saving=true;stopPreview();$('#edit-error').textContent='';
      const controls=[...dialog.querySelectorAll('button,input,select')], disabled=controls.map(input=>input.disabled);controls.forEach(input=>{input.disabled=true;});
      try {setState(await api.patchItem(item.id,patch));toast('Media and race details saved.');}
      finally {controls.forEach((input,i)=>{input.disabled=disabled[i];});saving=false;}
      next();
    }catch(error){$('#edit-error').textContent=error.message||String(error);saving=false;}
  });
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  dialog.addEventListener('close',()=>{if(!dialog.open){clearMedia();queue=[];}});
  return {open(ids){queue=Array.isArray(ids)?ids:[ids];index=0;showCurrent();}};
}
