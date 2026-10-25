import { icon, escapeHTML as e } from './icons.mjs';
import { TRAPS } from '../shared/traps.mjs';
import { referenceMeeting } from '../shared/reference-219.mjs';
import { validateRegistration } from '../shared/registration.mjs';
import { linkedRace } from '../shared/race-links.mjs';
import { flag, countryName, countryField } from './flags.mjs';
import { entityField, attachEntityPickers, requireEntitySelections } from './entity-picker.mjs';
import { nameKey, withRegistry } from '../shared/registry.mjs';

const empty = () => ({title:'Race day',track:'Isaszeg Park',races:[],dogs:[],people:[]});
const options = (values, selected) => values.map(value => { const [id,label] = Array.isArray(value) ? value : [value,value]; return `<option value="${e(String(id))}" ${String(id) === String(selected) ? 'selected' : ''}>${e(String(label))}</option>`; }).join('');
const field = (label, name, value = '', extra = '') => `<label class="reg-field">${label}<input name="${name}" value="${e(String(value ?? ''))}" ${extra}></label>`;
const select = (label, name, values, value) => `<label class="reg-field">${label}<select name="${name}">${options(values,value)}</select></label>`;
const trapBadge = number => `<span class="trap-badge trap-${number}" title="${e(TRAPS[number-1].description)}">${number}</span>`;

export function createRegistrationView({api,toast,setState,openImport}) {
  const root = document.querySelector('#registration-page');
  const drafts = new Map();
  let state, data = empty(), selectedId, activeTab = 'races', visible = false, dirty = false, saving = false, dogQuery = '';
  let dogDialog, personDialog, registryBusy = false, personQuery = '';
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
          if(current()?.entries.find(entry=>entry.trap===Number(trap))?.dogId!==entity?.id)for(const key of ['weight','finish','split','finalSplit','time','estimatedTime','going','remarks'])root.querySelector(`[name="${key}-${trap}"]`).value='';
          markDirty();capture();
          if(entity){render();if(created)editDog(entity.id);}
          else {const row=root.querySelector(`[name="dog-${trap}"]`).closest('.trap-entry');row.querySelector('[data-reg-dog]').disabled=true;row.querySelector('.trap-dog-select small').textContent='Leave empty or press Enter to register a new dog';}
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
      for (const key of ['weight','finish','split','finalSplit','time','estimatedTime','going','remarks']) entry[key] = String(values.get(`${key}-${trap}`)||'');
      return [entry];
    });
    data.title = String(values.get('meetingTitle')||'Race day'); data.track = String(values.get('track')||'Isaszeg Park');
  }
  function remember() { if(state) drafts.set(`${state.root}/${state.meeting.date}`,{data:structuredClone(data),selectedId,dirty}); }
  function markDirty() { dirty = true; const status=root.querySelector('#registration-status'); if(status) status.textContent='Unsaved changes'; if(!root.querySelector('[data-reg-action="discard"]')){const button=document.createElement('button');button.className='text-button';button.dataset.regAction='discard';button.textContent='Discard changes';root.querySelector('.reg-toolbar-actions')?.insertBefore(button,root.querySelector('.reg-toolbar-actions .button'));} root.querySelectorAll('[data-reg-save]').forEach(b=>b.disabled=false); }
  async function save() {
    if(saving || registryBusy) return; requireEntitySelections(root); capture(); const clean = validateRegistration(data);
    saving=true; renderSave();
    try { const next=await api.saveRegistration(clean); data=structuredClone(next.meeting.registration);dirty=false;remember();setState(next);render();toast('Meeting saved. Dogs and people are available across all race days.'); }
    finally { saving=false;renderSave(); }
  }
  function renderSave() {
    root.querySelectorAll('[data-reg-save]').forEach(button=>{button.disabled=saving||!dirty||state?.busy;button.innerHTML=`${icon('check')}${saving?'Saving…':'Save meeting'}`;});
    root.querySelectorAll('#race-registration-form input,#race-registration-form select').forEach(input=>input.disabled=saving);
  }
  function render() {
    if(!state) return;
    root.innerHTML = `
      <div class="reg-source"><span class="reg-source-icon">${icon('download')}</span><div><strong>CGRC European Derby · 4 October 2026</strong><p>14 races · 75 entries · Isaszeg Park · first 3 video references available</p></div><button class="button quiet small" data-reg-action="reference">Open reference meeting ${icon('arrow')}</button></div>
      <div class="reg-toolbar"><div class="reg-tabs" role="tablist" aria-label="Registration view"><button role="tab" aria-selected="${activeTab==='races'}" data-reg-tab="races">Races <span>${data.races.length}</span></button><button role="tab" aria-selected="${activeTab==='dogs'}" data-reg-tab="dogs">Dog registry <span>${data.dogs.length}</span></button><button role="tab" aria-selected="${activeTab==='people'}" data-reg-tab="people">Owners & trainers <span>${data.people.length}</span></button></div><div class="reg-toolbar-actions"><span id="registration-status" role="status">${dirty?'Unsaved changes':data.races.length||data.dogs.length?'All changes saved':'Ready for your first entry'}</span>${dirty?'<button class="text-button" data-reg-action="discard">Discard changes</button>':''}<button class="button primary small" data-reg-action="${activeTab==='races'?'new-race':activeTab==='dogs'?'new-dog':'new-person'}">${icon('plus')}${activeTab==='races'?'Add race':activeTab==='dogs'?'Register dog':'Add person'}</button></div></div>
      ${activeTab==='races'?racePage():activeTab==='dogs'?dogPage():peoplePage()}
      <p class="reg-footnote">${icon('check')} ${window.replay?'Races save by meeting. Dogs and people share a global registry.':'Registration saves in this browser on this device.'} <span>Source: grwhracing.eu/result/219 · captured 24 October 2026</span></p>`;
    renderSave(); wirePickers(root);
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
      <div class="trap-entries">${Array.from({length:6},(_,i)=>entryEditor(race,i+1)).join('')}</div></div>
      <div class="reg-form-section"><div class="reg-section-label"><span>04</span> RACE RECORDING</div><div class="reg-video-row">${icon('film')}<div><strong>${clip?e(clip.title):reference?'Local reference recording':'No recording imported'}</strong><p>${e(reference||'Import the clip using this race number to connect it to the card.')}</p></div><button type="button" class="button quiet small" data-reg-action="import">${icon('plus')}Import clip</button></div>${source?`<details class="reg-video-details"><summary>Preview ${clip?'race recording':'local reference video'}</summary><video controls preload="none" src="${e(source)}" aria-label="Race ${race.number} recording"></video><p class="reg-help">${clip?'Imported recording is in the replay loop.':'Reference preview from local-assets. Import it to add it to the replay loop.'}</p></details>`:''}</div>
      <div class="reg-save-bar"><span>${icon('check')} ${dirty?'Ready to save your changes.':'This card is saved with the meeting.'}</span><button type="submit" class="button primary" data-reg-save>${icon('check')}Save meeting</button></div></form>`;
  }
  function entryEditor(race,trap) {
    const entry=race.entries.find(en=>en.trap===trap)||{},dog=data.dogs.find(d=>d.id===entry.dogId);
    return `<div class="trap-entry"><div class="trap-entry-main">${trapBadge(trap)}<div class="trap-dog-select">${entityField(`Dog in trap ${trap}`,`dog-${trap}`,'dog',entry.dogId,data.dogs,{placeholder:'Search dogs or type a new name…'})}<small>${dog?`${flag(dog.country)} ${e(`${dog.owner||'Owner not entered'} · ${dog.preference||'—'}`)}`:'Leave empty or press Enter to register a new dog'}</small></div><button type="button" class="icon-button" data-reg-dog="${e(entry.dogId||'')}" ${!dog?'disabled':''} aria-label="Edit dog in trap ${trap}">${icon('edit')}</button></div>
      <div class="reg-fields entry-primary-results">${select('Finish / status',`finish-${trap}`,[['','Not recorded'],...['1','2','3','4','5','6'],['NR','NR · Non-runner'],['DNF','Did not finish'],['DQ','Disqualified']],entry.finish||'')}${field('Final split (s)',`finalSplit-${trap}`,entry.finalSplit,'type="number" min="0.01" step="0.01"')}${field('Time (s)',`time-${trap}`,entry.time,'type="number" min="0.01" step="0.01"')}</div>
      <details class="entry-results"><summary>Weigh-in & additional results</summary><div class="reg-fields entry-result-fields">${field('Weight (kg)',`weight-${trap}`,entry.weight,'type="number" min="0.01" step="0.01"')}${field('Est. time (s)',`estimatedTime-${trap}`,entry.estimatedTime,'type="number" min="0.01" step="0.01"')}${field('Split (s)',`split-${trap}`,entry.split,'type="number" min="0.01" step="0.01"')}${field('Going',`going-${trap}`,entry.going,'placeholder="e.g. N" maxlength="30"')}${field('Remarks',`remarks-${trap}`,entry.remarks,'maxlength="500"')}</div></details></div>`;
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
  root.addEventListener('input',event=>{if(['reg-dog-search','reg-person-search'].includes(event.target.id)){if(event.target.id==='reg-dog-search')dogQuery=event.target.value;else personQuery=event.target.value;const pos=event.target.selectionStart;render();const input=root.querySelector('#'+event.target.id);input.focus();input.setSelectionRange(pos,pos);return;}if(event.target.closest('form'))markDirty();});
  root.addEventListener('change',event=>{
    if(!event.target.closest('form'))return;
    markDirty();
    if(event.target.name?.startsWith('finish-')&&['NR','DNF','DQ'].includes(event.target.value)){const trap=event.target.name.split('-')[1];for(const key of ['time','estimatedTime'])root.querySelector(`[name="${key}-${trap}"]`).value='';}
    if(event.target.name?.startsWith('dog-')){const trap=event.target.name.split('-')[1];for(const key of ['weight','finish','split','finalSplit','time','estimatedTime','going','remarks'])root.querySelector(`[name="${key}-${trap}"]`).value='';}
    if(event.target.name?.startsWith('dog-')||event.target.name==='breed'){capture();render();}
  });
  root.addEventListener('submit',event=>{event.preventDefault();attempt(save);});
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
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
