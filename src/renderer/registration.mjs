import { icon, escapeHTML as e } from './icons.mjs';
import { trapBadge } from './trap-badge.mjs';
import { referenceMeeting } from '../shared/reference-219.mjs';
import { validateRegistration } from '../shared/registration.mjs';
import { linkedRace } from '../shared/race-links.mjs';
import { flag, countryName, countryField } from './flags.mjs';
import { entityField, attachEntityPickers, requireEntitySelections, closeEntityPickers } from './entity-picker.mjs';
import { nameKey, withRegistry } from '../shared/registry.mjs';
import { entryStatus, finishingOrder } from '../shared/race-results.mjs';
import { statusField, setStatusField, attachStatusFields, finishOnTimeInput, showResultWarnings } from './runner-status.mjs';

const empty = () => ({title:'Race day',track:'Isaszeg Park',races:[],dogs:[],people:[]});
const options = (values, selected) => values.map(value => { const [id,label] = Array.isArray(value) ? value : [value,value]; return `<option value="${e(String(id))}" ${String(id) === String(selected) ? 'selected' : ''}>${e(String(label))}</option>`; }).join('');
const field = (label, name, value = '', extra = '', compact = false) => `<label class="reg-field">${compact?`<span class="sr-only">${label}</span>`:label}<input name="${name}" value="${e(String(value ?? ''))}" ${extra}></label>`;
const select = (label, name, values, value) => `<label class="reg-field">${label}<select name="${name}">${options(values,value)}</select></label>`;

export function createRegistrationView({api,toast,setState,openImport}) {
  const root = document.querySelector('#registration-page');
  const drafts = new Map();
  let state, data = empty(), selectedId, activeTab = 'races', visible = false, dirty = false, saving = false, dogQuery = '';
  let dogDialog, personDialog, registryBusy = false, personQuery = '', swapSource = null, trapAnimating = false, renderPending = false;
  const savedData = () => structuredClone(withRegistry(state.meeting.registration || empty(), state.meeting.registration || empty()));
  async function persistRegistry(candidate) {
    capture(); registryBusy=true;
    try {
      const next=await api.saveRegistry({dogs:candidate.dogs,people:candidate.people});
      data.dogs=structuredClone(next.meeting.registration.dogs);data.people=structuredClone(next.meeting.registration.people);
      setState(next); remember();
    } finally {registryBusy=false;}
  }
  async function createEntity(kind,name,fieldName) {
    const list=kind==='person'?data.people:data.dogs;
    const breed=current()?.breed || 'Greyhound';
    const existing=list.find(item=>nameKey(item.name)===nameKey(name) && (kind==='person'||item.breed=== (dogDialog?.open ? dogDialog.querySelector('[name=breed]').value : breed)));
    if(existing)return existing;
    const entity={id:crypto.randomUUID(),name,...(kind==='dog'?{breed:dogDialog?.open?dogDialog.querySelector('[name=breed]').value:breed,...(fieldName==='sireId'?{sex:'dog'}:fieldName==='damId'?{sex:'bitch'}:{})}:{})};
    const candidate=structuredClone(data);candidate[kind==='person'?'people':'dogs'].push(entity);
    await persistRegistry(candidate);return entity;
  }
  function wirePickers(container,editingDog) {
    attachEntityPickers(container,{
      entities:(kind)=>kind==='person'?data.people:data.dogs.filter(d=>d.id!==editingDog && d.breed===(editingDog?container.querySelector('[name=breed]').value:current()?.breed)),
      create:createEntity,onError:message,
      onSelect:(name,entity,created)=>{
        if(editingDog)return;
        if(name.startsWith('dog-')){
          const trap=name.split('-')[1];
          const row=root.querySelector(`[name="dog-${trap}"]`).closest('.trap-entry');
          if(current()?.entries.find(entry=>entry.trap===Number(trap))?.dogId!==entity?.id){
            for(const key of ['weight','status','split','finalSplit','time','estimatedTime','going','remarks'])root.querySelector(`[name="${key}-${trap}"]`).value='';
            delete row.dataset.statusBeforeEmpty;
            setStatusField(row.querySelector('.runner-status-field'),entity?'ENTERED':'EMPTY');
          }
          syncEntryAvailability();
          markDirty();capture();
          if(entity){render();if(created)editDog(entity.id);}
          else {row.querySelector('.entry-people').textContent='No dog assigned';refreshOrders();}
        }
      }
    });
  }
  const current = () => data.races.find(race=>race.id===selectedId);
  const message = error => toast(error.message || String(error),true);
  const attempt = fn => Promise.resolve().then(fn).catch(message);
  function capture() {
    const form = root.querySelector('#race-registration-form');
    if (!form || !current()) return;
    const values = new FormData(form), race = current();
    for (const name of ['title','grade','type','breed']) race[name] = String(values.get(name)||'');
    race.number = Number(values.get('number')); race.distance = Number(values.get('distance'));
    race.entries = Array.from({length:6},(_,i)=>i+1).flatMap(trap=> {
      const dogId = values.get(`dog-${trap}`); if (!dogId) return [];
      const entry = {trap,dogId};
      for (const key of ['weight','status','split','finalSplit','time','estimatedTime','going','remarks']) entry[key] = String(values.get(`${key}-${trap}`)||'');
      entry.status=entryStatus(entry);
      return [entry];
    });
    data.title = String(values.get('meetingTitle')||'Race day'); data.track = String(values.get('track')||'Isaszeg Park');
  }
  function refreshOrders() {
    const {places}=finishingOrder(current());
    for(const output of root.querySelectorAll('[data-entry-order]')){
      const place=places.get(Number(output.dataset.entryOrder));
      output.textContent=place || '-';output.classList.toggle('entry-winner',place===1);
    }
    const hasVideo = state.meeting.items.some(item=>item.mediaType==='video' && linkedRace(state.meeting,item)?.id===current()?.id);
    showResultWarnings(root,current(),root.querySelector('#race-results-warning'),{hasVideo});
  }
  function remember() { if(state) drafts.set(`${state.root}/${state.meeting.date}`,{data:structuredClone(data),selectedId,dirty}); }
  function markDirty() { dirty = true; const status=root.querySelector('#registration-status'); if(status) status.textContent='Unsaved changes'; if(!root.querySelector('[data-reg-action="discard"]')){const button=document.createElement('button');button.className='text-button';button.dataset.regAction='discard';button.textContent='Discard changes';root.querySelector('.reg-toolbar-actions')?.insertBefore(button,root.querySelector('.reg-toolbar-actions .button'));} root.querySelectorAll('[data-reg-save]').forEach(b=>b.disabled=false); }
  async function save() {
    if(saving || registryBusy) return; requireEntitySelections(root); capture(); const clean = validateRegistration(data,{previous:state.meeting.registration,editedRaceId:current()?.id});
    saving=true; renderSave();
    try { const next=await api.saveRegistration(clean); data=structuredClone(next.meeting.registration);dirty=false;remember();setState(next);render();toast('Meeting saved. Dogs and people are available across all race days.'); }
    finally { saving=false;renderSave(); }
  }
  function renderSave() {
    root.querySelectorAll('[data-reg-save]').forEach(button=>{button.disabled=saving||!dirty||state?.busy;button.innerHTML=`${icon('check')}${saving?'Saving…':'Save meeting'}`;});
    root.querySelectorAll('#race-registration-form input,#race-registration-form select,#race-registration-form textarea,#race-registration-form .runner-status-trigger,#race-registration-form [data-status-value]').forEach(input=>input.disabled=saving);
    syncEntryAvailability();
  }
  function syncEntryAvailability() {
    for(const row of root.querySelectorAll('.trap-entry')){
      const hasDog=Boolean(row.querySelector('.entity-picker input[type=hidden]').value);
      const field=row.querySelector('.runner-status-field'),value=field.querySelector('input').value;
      if(!hasDog&&value!=='EMPTY'){
        row.dataset.statusBeforeEmpty=value;
        setStatusField(field,'EMPTY');
        field.querySelector('[role=listbox]').hidden=true;
        field.querySelector('[role=combobox]').setAttribute('aria-expanded','false');
      }else if(hasDog&&value==='EMPTY')setStatusField(field,row.dataset.statusBeforeEmpty || 'ENTERED');
      for(const control of row.querySelectorAll('input,select,textarea,button'))control.disabled=saving || (!hasDog&&!control.closest('.entity-picker')&&!control.hasAttribute('data-swap-trap'));
    }
  }
  function clearTrapSwap(focus=false) {
    const source=swapSource;swapSource=null;
    for(const row of root.querySelectorAll('.trap-entry')){
      row.classList.remove('swap-source','swap-target');
      row.removeAttribute('role');row.removeAttribute('tabindex');row.removeAttribute('aria-label');row.removeAttribute('aria-disabled');
      for(const child of row.children)child.inert=false;
    }
    const prompt=root.querySelector('.trap-swap-prompt');if(prompt)prompt.hidden=true;
    if(focus)root.querySelector(`[data-swap-trap="${source}"]`)?.focus({preventScroll:true});
  }
  function startTrapSwap(trap) {
    if(saving||trapAnimating)return;
    closeEntityPickers();
    swapSource=trap;
    const prompt=root.querySelector('.trap-swap-prompt');prompt.hidden=false;
    prompt.querySelector('[role=status]').textContent=`Choose a row to swap with trap ${trap}.`;
    prompt.querySelector('[data-cancel-swap]').textContent='Cancel swap';
    for(const row of root.querySelectorAll('.trap-entry')){
      const source=Number(row.dataset.trap)===trap;
      row.classList.toggle('swap-source',source);row.classList.toggle('swap-target',!source);
      for(const child of row.children)child.inert=true;
      if(source)row.setAttribute('aria-disabled','true');
      else {row.setAttribute('role','button');row.tabIndex=0;row.setAttribute('aria-label',`Swap trap ${trap} with trap ${row.dataset.trap}`);}
    }
    root.querySelector('.swap-target')?.focus({preventScroll:true});
  }
  async function swapTraps(target) {
    if(swapSource===null||swapSource===target||trapAnimating)return;
    const source=swapSource,from=root.querySelector(`.trap-entry[data-trap="${source}"]`),to=root.querySelector(`.trap-entry[data-trap="${target}"]`);
    const rows=[from,to],allRows=[...root.querySelectorAll('.trap-entry')],before=new Map(allRows.map(row=>[row,row.getBoundingClientRect()])),oldBadges=rows.map(row=>row.querySelector('.trap-badge').cloneNode(true));
    capture();
    for(const entry of current().entries){if(entry.trap===source)entry.trap=target;else if(entry.trap===target)entry.trap=source;}
    clearTrapSwap();trapAnimating=true;
    const prompt=root.querySelector('.trap-swap-prompt');prompt.hidden=false;
    prompt.querySelector('[role=status]').textContent=`Swapping traps ${source} and ${target}…`;
    prompt.querySelector('[data-cancel-swap]').disabled=true;
    for(const row of allRows)for(const child of row.children)child.inert=true;
    // Keep each dog's row identity while animating from its previous screen position.
    const placeholder=document.createComment('trap swap');
    from.replaceWith(placeholder);to.replaceWith(from);placeholder.replaceWith(to);
    const animations=[],duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:680;
    rows.forEach((row,index)=>{
      const trap=index===0?target:source,expanded=row.querySelector('.entry-results-toggle').getAttribute('aria-expanded')==='true';
      const template=document.createElement('template');template.innerHTML=entryEditor(current(),trap);
      row.dataset.trap=String(trap);row.innerHTML=template.content.firstElementChild.innerHTML;
      if(expanded){row.querySelector('.entry-results-toggle').setAttribute('aria-expanded','true');row.querySelector('.entry-results').hidden=false;}
      wirePickers(row);
      row.classList.add(index===0?'swap-initiator':'swap-receiver');
      for(const child of row.children)child.inert=true;
      const delta=before.get(row).top-row.getBoundingClientRect().top;
      animations.push(row.animate([
        {transform:`translateY(${delta}px) scale(1)`},
        {transform:`translateY(${delta*.5}px) scale(${index===0?1.035:.985})`,boxShadow:index===0?'0 18px 36px #0009':'0 2px 5px #0003',offset:.5},
        {transform:'translateY(0) scale(1)',boxShadow:'0 0 0 #0000'}
      ],{duration,easing:'cubic-bezier(.4,0,.2,1)'}));
      const trigger=row.querySelector('[data-swap-trap]'),badge=trigger.querySelector('.trap-badge'),old=oldBadges[index];
      old.setAttribute('aria-hidden','true');trigger.append(old);
      animations.push(old.animate([{opacity:1},{opacity:0,offset:.55},{opacity:0}],{duration,fill:'forwards'}));
      animations.push(badge.animate([{opacity:0},{opacity:0,offset:.2},{opacity:1}],{duration}));
    });
    for(const row of allRows.filter(row=>!rows.includes(row))){
      const delta=before.get(row).top-row.getBoundingClientRect().top;
      if(delta)animations.push(row.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration,easing:'cubic-bezier(.4,0,.2,1)'}));
    }
    markDirty();syncEntryAvailability();refreshOrders();remember();
    try {await Promise.all(animations.map(animation=>animation.finished));}
    finally {
      animations.forEach(animation=>animation.cancel());
      rows.forEach((row,index)=>{oldBadges[index].remove();row.classList.remove('swap-initiator','swap-receiver');});
      for(const row of allRows)for(const child of row.children)child.inert=false;
      trapAnimating=false;
    }
    prompt.querySelector('[role=status]').textContent=`Traps ${source} and ${target} swapped.`;
    prompt.querySelector('[data-cancel-swap]').disabled=false;
    prompt.querySelector('[data-cancel-swap]').textContent='Dismiss';
    if(renderPending){renderPending=false;render();}
    root.querySelector(`[data-swap-trap="${target}"]`)?.focus({preventScroll:true});
    toast(`Traps ${source} and ${target} swapped. Save the meeting to keep the changes.`);
  }
  function render() {
    if(!state)return;
    if(trapAnimating){renderPending=true;return;}
    clearTrapSwap();closeEntityPickers(root);
    root.innerHTML = `
      <div class="reg-source"><span class="reg-source-icon">${icon('download')}</span><div><strong>CGRC European Derby · 4 October 2026</strong><p>14 races · 75 entries · Isaszeg Park · first 3 video references available</p></div><button class="button quiet small" data-reg-action="reference">Open reference meeting ${icon('arrow')}</button></div>
      <div class="reg-toolbar"><div class="reg-tabs" role="tablist" aria-label="Registration view"><button role="tab" aria-selected="${activeTab==='races'}" data-reg-tab="races">Races <span>${data.races.length}</span></button><button role="tab" aria-selected="${activeTab==='dogs'}" data-reg-tab="dogs">Dog registry <span>${data.dogs.length}</span></button><button role="tab" aria-selected="${activeTab==='people'}" data-reg-tab="people">Owners & trainers <span>${data.people.length}</span></button></div><div class="reg-toolbar-actions"><span id="registration-status" role="status">${dirty?'Unsaved changes':data.races.length||data.dogs.length?'All changes saved':'Ready for your first entry'}</span>${dirty?'<button class="text-button" data-reg-action="discard">Discard changes</button>':''}<button class="button primary small" data-reg-action="${activeTab==='races'?'new-race':activeTab==='dogs'?'new-dog':'new-person'}">${icon('plus')}${activeTab==='races'?'Add race':activeTab==='dogs'?'Register dog':'Add person'}</button></div></div>
      ${activeTab==='races'?racePage():activeTab==='dogs'?dogPage():peoplePage()}
      <p class="reg-footnote">${icon('check')} ${window.replay?'Races save by meeting. Dogs and people share a global registry.':'Registration saves in this browser on this device.'} <span>Source: grwhracing.eu/result/219 · captured 24 October 2026</span></p>`;
    renderSave(); wirePickers(root); attachStatusFields(root); refreshOrders();
  }
  function racePage() {
    const race = current();
    return `<div class="registration-layout"><aside class="panel race-cards"><div class="reg-list-heading"><span>RACE CARD</span><span>${e(state.meeting.date)}</span></div>${data.races.length?data.races.slice().sort((a,b)=>a.number-b.number).map(r=>`<button class="race-card ${r.id===selectedId?'selected':''}" data-reg-race="${e(r.id)}"><span class="race-number">${String(r.number).padStart(2,'0')}</span><span><strong>${e(r.title)}</strong><small>${e(r.grade||'Ungraded')} <b>·</b> ${r.distance}m <b>·</b> ${r.entries.length}/6 dogs</small></span>${icon('arrow')}</button>`).join(''):'<div class="reg-list-empty">Your race card is clear.<br>Add a race to get started.</div>'}<div class="reg-card-note">${icon('list')} Race numbers follow the meeting programme. Trap colours identify each dog.</div></aside>
      ${race?raceEditor(race):`<div class="panel reg-empty"><span class="reg-empty-icon">${icon('list')}</span><div class="eyebrow">READY WHEN YOU ARE</div><h3>Build your race day.</h3><p>Start with a race, then choose dogs for each trap.<br>Or explore the real Derby meeting as a reference.</p><button class="button primary" data-reg-action="new-race">${icon('plus')}Add your first race</button></div>`}</div>`;
  }
  function raceEditor(race) {
    const clip = state.meeting.items.find(i=>linkedRace(state.meeting,i)?.id===race.id);
    const reference = race.videoReference;
    const source = !window.replay && reference ? `../../local-assets/${encodeURIComponent(reference)}` : clip?.url;
    return `<form class="panel race-editor" id="race-registration-form"><div class="reg-editor-heading"><div><div class="eyebrow">RACE ${String(race.number).padStart(2,'0')}</div><h3>Race registration</h3></div><span class="reg-grade">${e(race.breed)}</span></div>
      <div class="reg-form-section"><div class="reg-section-label"><span>01</span> MEETING DETAILS</div><div class="reg-fields reg-fields-two">${field('Meeting name','meetingTitle',data.title,'required maxlength="160"')}${field('Venue / track','track',data.track,'required maxlength="160"')}</div></div>
      <div class="reg-form-section"><div class="reg-section-label"><span>02</span> RACE DETAILS</div><div class="reg-fields reg-race-details">${field('Race number','number',race.number,'type="number" min="1" max="9999" required')}${field('Race title','title',race.title,'required maxlength="160"')}${field('Grade','grade',race.grade,'placeholder="e.g. S3, A2, OR" maxlength="20"')}${field('Distance (m)','distance',race.distance,'type="number" min="50" max="2000" required')}${select('Track type','type',['Oval','Straight'],race.type)}${select('Breed','breed',['Greyhound','Whippet'],race.breed)}</div></div>
      <div class="reg-form-section"><div class="reg-section-row"><div><div class="reg-section-label"><span>03</span> DOGS & TRAP ASSIGNMENTS</div><p class="reg-help">Choose up to six dogs. Leave unused traps empty.</p></div><button type="button" class="text-button" data-reg-action="new-dog">${icon('plus')}Register dog</button></div>
      <p id="race-results-warning" class="result-warning" role="status" hidden></p><div class="trap-swap-prompt" hidden><span role="status" aria-live="polite"></span><button type="button" class="text-button" data-cancel-swap>Cancel swap</button></div><div class="trap-entries"><div class="entry-columns" aria-hidden="true"><span title="Finish order">#</span><span>TRAP</span><span>DOG</span><span>STATUS</span><span>SPLIT</span><span>TIME</span></div>${Array.from({length:6},(_,i)=>entryEditor(race,i+1)).join('')}</div></div>
      <div class="reg-form-section"><div class="reg-section-label"><span>04</span> RACE RECORDING</div><div class="reg-video-row">${icon('film')}<div><strong>${clip?e(clip.title):reference?'Local reference recording':'No recording imported'}</strong><p>${e(reference||'Import the clip using this race number to connect it to the card.')}</p></div><button type="button" class="button quiet small" data-reg-action="import">${icon('plus')}Import clip</button></div>${source?`<details class="reg-video-details"><summary>Preview ${clip?'race recording':'local reference video'}</summary><video controls preload="none" src="${e(source)}" aria-label="Race ${race.number} recording"></video><p class="reg-help">${clip?'Imported recording is in the replay loop.':'Reference preview from local-assets. Import it to add it to the replay loop.'}</p></details>`:''}</div>
      <div class="reg-save-bar"><span>${icon('check')} ${dirty?'Ready to save your changes.':'This card is saved with the meeting.'}</span><button type="submit" class="button primary" data-reg-save>${icon('check')}Save meeting</button></div></form>`;
  }
  function entryEditor(race,trap) {
    const entry=race.entries.find(en=>en.trap===trap)||{},dog=data.dogs.find(d=>d.id===entry.dogId);
    const place=finishingOrder(race).places.get(trap);
    const people=dog?.owner===dog?.trainer?dog?.owner:[dog?.owner,dog?.trainer].filter(Boolean).join(' / ');
    return `<div class="trap-entry" data-trap="${trap}"><div class="trap-entry-main"><output class="entry-order${place===1?' entry-winner':''}" data-entry-order="${trap}" aria-label="Finish order for trap ${trap}">${place || '-'}</output><button type="button" class="trap-switch" data-swap-trap="${trap}" aria-label="Switch trap ${trap}" title="Switch this trap with another row">${trapBadge(trap)}</button><div class="trap-dog-select"><div class="trap-dog-line">${entityField(`Dog in trap ${trap}`,`dog-${trap}`,'dog',entry.dogId,data.dogs,{placeholder:'Search or add dog…',hideLabel:true})}<button type="button" class="icon-button" data-reg-dog="${e(entry.dogId||'')}" ${!dog?'disabled':''} aria-label="Edit dog in trap ${trap}">${icon('edit')}</button></div></div>${statusField(trap,entry)}${field(`Split for trap ${trap} (s)`,`split-${trap}`,entry.split,'type="number" min="0.01" step="0.01"',true)}${field(`Time for trap ${trap} (s)`,`time-${trap}`,entry.time,'type="number" min="0.001" step="0.001"',true)}</div>
      <div class="entry-secondary"><div class="entry-people">${dog?`${flag(dog.country)} <span>${e(people||'Owner / trainer not entered')}${dog.preference?` · Run ${e(dog.preference)}`:''}</span>`:'No dog assigned'}</div><button type="button" class="entry-results-toggle" aria-expanded="false" aria-controls="entry-results-${trap}" aria-label="Weigh-in & additional results for trap ${trap}"><span class="entry-results-caret" aria-hidden="true"></span>Weigh-in & additional results</button></div><div id="entry-results-${trap}" class="entry-results" hidden><div class="reg-fields entry-result-fields">${field('Weight (kg)',`weight-${trap}`,entry.weight,'type="number" min="0.01" step="0.01"')}${field('Est. time (s)',`estimatedTime-${trap}`,entry.estimatedTime,'type="number" min="0.001" step="0.001"')}${field('Final split (s)',`finalSplit-${trap}`,entry.finalSplit,'type="number" min="0.01" step="0.01"')}${field('Going',`going-${trap}`,entry.going,'placeholder="e.g. N" maxlength="30"')}<label class="reg-field entry-remarks">Remarks<textarea name="remarks-${trap}" maxlength="500" rows="2">${e(entry.remarks||'')}</textarea></label></div></div></div>`;
  }
  function dogPage() {
    const list=data.dogs.filter(d=>`${d.name} ${d.owner} ${d.trainer}`.toLowerCase().includes(dogQuery.toLowerCase()));
    return `<section class="panel reg-dog-registry"><div class="reg-registry-toolbar"><div><h3>Every dog, ready to run.</h3><p>${data.dogs.length} dogs in the global registry</p></div><label class="reg-field"><span class="sr-only">Search dogs</span><input id="reg-dog-search" type="search" value="${e(dogQuery)}" placeholder="Search dog, owner or trainer…"></label></div><div class="reg-table-scroll"><table class="reg-dog-table"><thead><tr><th>DOG</th><th>OWNER / TRAINER</th><th>COUNTRY</th><th>DETAILS</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${list.map(d=>`<tr><td><strong>${e(d.name)}</strong><small>${e(d.breed)} · ${e(d.preference||'Preference not set')}</small></td><td>${e(d.owner||'—')}<small>${e(d.trainer||'—')}</small></td><td><span class="reg-country">${flag(d.country)} ${e(countryName(d.country))}</span>${d.origin?`<small class="reg-origin">Origin: ${flag(d.origin)} ${e(countryName(d.origin))}</small>`:''}</td><td>${e(d.sex||'—')} · ${e(d.coat||'—')}<small>${e(d.birth||'Birth month not entered')}</small></td><td><button class="text-button" data-reg-dog="${e(d.id)}">${icon('edit')}Edit</button></td></tr>`).join('')||`<tr><td colspan="5" class="reg-list-empty">${data.dogs.length?'No dogs match your search.':'Register your first dog, then assign it to a race.'}</td></tr>`}</tbody></table></div></section>`;
  }
  function peoplePage() {
    const list=data.people.filter(person=>nameKey(person.name).includes(nameKey(personQuery)));
    return `<section class="panel reg-dog-registry"><div class="reg-registry-toolbar"><div><h3>Owners & trainers</h3><p>${data.people.length} people shared across all race days</p></div><label class="reg-field"><span class="sr-only">Search people</span><input id="reg-person-search" type="search" value="${e(personQuery)}" placeholder="Search owners and trainers…"></label></div><div class="reg-table-scroll"><table class="reg-dog-table"><thead><tr><th>NAME</th><th>DOGS OWNED</th><th>DOGS TRAINED</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${list.map(person=>`<tr><td><strong>${e(person.name)}</strong></td><td>${data.dogs.filter(d=>d.ownerId===person.id).length}</td><td>${data.dogs.filter(d=>d.trainerId===person.id).length}</td><td><button class="text-button" data-reg-person="${e(person.id)}">${icon('edit')}Edit</button></td></tr>`).join('')||'<tr><td colspan="4" class="reg-list-empty">No people found. Add a person here or from a dog’s owner or trainer field.</td></tr>'}</tbody></table></div></section>`;
  }
  function editPerson(id) {
    capture();const person=data.people.find(item=>item.id===id)||{id:crypto.randomUUID(),name:''};
    personDialog?.remove();personDialog=document.createElement('dialog');personDialog.className='reg-person-dialog';personDialog.setAttribute('aria-labelledby','person-title');
    personDialog.innerHTML=`<form><div class="dialog-heading"><h2 id="person-title">${id?'Edit person':'Add person'}</h2></div><p class="reg-dialog-help">Available as an owner or trainer across all race days.</p>${field('Name *','name',person.name,'required maxlength="160"')}<div class="reg-form-error" role="alert" hidden></div><div class="dialog-footer"><button type="button" class="button quiet" data-person-cancel>Cancel</button><button type="submit" class="button primary">Save person</button></div></form>`;
    document.body.append(personDialog);personDialog.querySelector('[data-person-cancel]').onclick=()=>personDialog.close();
    personDialog.querySelector('form').onsubmit=event=>{event.preventDefault();attempt(async()=>{
      const errorBox=personDialog.querySelector('[role=alert]');
      try {
        const name=String(new FormData(event.target).get('name')).trim();if(!name)throw new Error('Enter a name.');
        if(data.people.some(p=>p.id!==person.id && nameKey(p.name)===nameKey(name)))throw new Error('A person with this name already exists.');
        const candidate=structuredClone(data),index=candidate.people.findIndex(p=>p.id===person.id),next={...person,name};
        if(index<0)candidate.people.push(next);else candidate.people[index]=next;
        await persistRegistry(candidate);personDialog.close();render();toast(`${name} saved to the global registry.`);
      } catch(error){errorBox.hidden=false;errorBox.textContent=error.message;}
    });};personDialog.showModal();
  }
  function editDog(id) {
    capture();
    const dog = data.dogs.find(d=>d.id===id)||{id:crypto.randomUUID(),breed:current()?.breed||'Greyhound',country:'HU'};
    dogDialog?.remove(); dogDialog=document.createElement('dialog');dogDialog.className='reg-dog-dialog';dogDialog.setAttribute('aria-labelledby','reg-dog-title');
    dogDialog.innerHTML=`<form id="dog-registration-form"><div class="dialog-heading"><div><div class="eyebrow">DOG REGISTRY</div><h2 id="reg-dog-title">${id?'Edit dog':'Register a dog'}</h2></div><button type="button" class="icon-button" data-dog-cancel aria-label="Close dog registration">${icon('close')}</button></div><p class="reg-dialog-help">Dog details are shared across all race days. Type a name and press Enter to create an owner, trainer or parent. Fields marked * are required.</p><div class="reg-fields reg-fields-two">${field('Registered name *','name',dog.name,'required maxlength="160"')}${select('Breed *','breed',['Greyhound','Whippet'],dog.breed)}${entityField('Owner','ownerId','person',dog.ownerId,data.people)}${entityField('Trainer','trainerId','person',dog.trainerId,data.people)}${countryField('Country','country',dog.country)}${countryField('Country of origin','origin',dog.origin)}${field('Birth month','birth',dog.birth,'type="month"')}${select('Sex','sex',[['','Not entered'],['dog','Dog'],['bitch','Bitch']],dog.sex||'')}${field('Coat colour / code','coat',dog.coat,'placeholder="e.g. bk, bd, wbk" maxlength="40"')}${select('Running preference','preference',[['','Not set'],['I','I · Inside'],['M','M · Middle'],['W','W · Wide']],dog.preference||'')}${entityField('Sire','sireId','dog',dog.sireId,data.dogs)}${entityField('Dam','damId','dog',dog.damId,data.dogs)}</div><p class="reg-help">Weight is recorded per race under “Weigh-in & additional results”.</p><div id="dog-form-error" class="reg-form-error" role="alert" hidden></div><div class="dialog-footer"><button type="button" class="button quiet" data-dog-cancel>Cancel</button><button type="submit" class="button primary">${icon('check')}Save dog</button></div></form>`;
    document.body.append(dogDialog); wirePickers(dogDialog,dog.id);
    dogDialog.addEventListener('change',event=>{if(['country','origin'].includes(event.target.name)){const picker=event.target.closest('.country-picker');picker.firstElementChild.outerHTML=flag(event.target.value);}});
    dogDialog.querySelectorAll('[data-dog-cancel]').forEach(b=>b.addEventListener('click',()=>dogDialog.close()));
    dogDialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();attempt(async()=>{
      const errorBox=dogDialog.querySelector('#dog-form-error');
      try {
        requireEntitySelections(event.target);
        const value=Object.fromEntries(new FormData(event.target));value.country=value.country.toUpperCase();value.origin=value.origin.toUpperCase();
        const next={...dog,...value},index=data.dogs.findIndex(d=>d.id===dog.id),candidate=structuredClone(data);
        if(index<0)candidate.dogs.push(next);else candidate.dogs[index]=next;
        await persistRegistry(candidate);dogDialog.close();render();toast(`${next.name} saved to the global registry.`);
      } catch(error){errorBox.hidden=false;errorBox.textContent=error.message;}
    });});
    dogDialog.showModal();
  }
  root.addEventListener('input',event=>{if(['reg-dog-search','reg-person-search'].includes(event.target.id)){if(event.target.id==='reg-dog-search')dogQuery=event.target.value;else personQuery=event.target.value;const pos=event.target.selectionStart;render();const input=root.querySelector('#'+event.target.id);input.focus();input.setSelectionRange(pos,pos);return;}if(event.target.closest('form')){markDirty();if(event.target.matches('[data-entity-input]'))syncEntryAvailability();if(/^(time|estimatedTime)-/.test(event.target.name)){finishOnTimeInput(event.target);capture();refreshOrders();}}});
  root.addEventListener('change',event=>{
    if(!event.target.closest('form'))return;
    markDirty();
    if(event.target.name?.startsWith('status-')){
      capture();refreshOrders();
    }
    if(event.target.name?.startsWith('dog-')){const trap=event.target.name.split('-')[1];for(const key of ['weight','status','split','finalSplit','time','estimatedTime','going','remarks'])root.querySelector(`[name="${key}-${trap}"]`).value='';}
    if(event.target.name?.startsWith('dog-')||event.target.name==='breed'){capture();render();}
  });
  root.addEventListener('submit',event=>{event.preventDefault();attempt(save);});
  root.addEventListener('click',event=>{
    if(trapAnimating){event.preventDefault();event.stopImmediatePropagation();return;}
    const row=event.target.closest('.trap-entry');
    if(!row||swapSource===null)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(Number(row.dataset.trap)!==swapSource)attempt(()=>swapTraps(Number(row.dataset.trap)));
  },true);
  root.addEventListener('keydown',event=>{
    if(swapSource===null&&!trapAnimating)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!trapAnimating)clearTrapSwap(true);}
    else if(['Enter',' '].includes(event.key)&&event.target.matches('.swap-target')){event.preventDefault();event.stopPropagation();attempt(()=>swapTraps(Number(event.target.dataset.trap)));}
  },true);
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.hasAttribute('data-cancel-swap')){clearTrapSwap(true);return;}
    if(button.hasAttribute('data-swap-trap')){startTrapSwap(Number(button.dataset.swapTrap));return;}
    if(button.classList.contains('entry-results-toggle')){const expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));button.closest('.trap-entry').querySelector('.entry-results').hidden=!expanded;return;}
    attempt(async()=>{
      if(button.dataset.regTab){capture();activeTab=button.dataset.regTab;render();}
      if(button.dataset.regRace){capture();selectedId=button.dataset.regRace;render();}
      if(button.hasAttribute('data-reg-dog')) editDog(button.dataset.regDog);
      if(button.hasAttribute('data-reg-person')) editPerson(button.dataset.regPerson);
      switch(button.dataset.regAction){
        case 'new-race':capture();{const race={id:crypto.randomUUID(),number:Math.max(0,...data.races.map(r=>r.number))+1,title:'',grade:'',distance:275,type:'Oval',breed:'Greyhound',entries:[]};data.races.push(race);selectedId=race.id;dirty=true;activeTab='races';render();root.querySelector('[name="title"]').focus();}break;
        case 'new-dog':editDog();break;
        case 'new-person':editPerson();break;
        case 'save':await save();break;
        case 'discard':data=savedData();selectedId=data.races.find(r=>r.id===selectedId)?.id||data.races[0]?.id;dirty=false;remember();render();toast('Unsaved changes discarded.');break;
        case 'reference':capture();remember();{const next=await api.openMeeting(referenceMeeting.date);setState(next);if(!next.meeting.registration?.races.length){const {date,...reference}=structuredClone(referenceMeeting);setState(await api.saveRegistration(reference));}selectedId=data.races[0]?.id;activeTab='races';render();toast('Reference meeting opened: 14 races and 75 entries.');}break;
        case 'import':capture();await openImport('race',undefined,current().number);break;
      }
    });
  });
  window.addEventListener('beforeunload',event=>{if(dirty||[...drafts.values()].some(d=>d.dirty)){event.preventDefault();event.returnValue='';}});
  return {
    openRace(id){capture();if(!data.races.some(race=>race.id===id))return;selectedId=id;activeTab='races';render();root.querySelector('[name="title"]')?.focus();},
    setVisible(value){if(visible){capture();remember();}visible=value;if(visible)render();},
    update(next){
      const changed=state?.meeting.date!==next.meeting.date||state?.root!==next.root;
      if(changed){capture();remember();const draft=drafts.get(`${next.root}/${next.meeting.date}`);data=structuredClone(withRegistry(draft?.data||next.meeting.registration||empty(),next.meeting.registration||empty()));selectedId=draft?.selectedId||data.races[0]?.id;dirty=draft?.dirty||false;}
      else if(!dirty&&!saving)data=structuredClone(next.meeting.registration||empty());
      data.dogs=structuredClone(next.meeting.registration?.dogs||[]);data.people=structuredClone(next.meeting.registration?.people||[]);
      state=next;if(visible&&!registryBusy&&!root.querySelector('form:focus-within'))render();
    }
  };
}
