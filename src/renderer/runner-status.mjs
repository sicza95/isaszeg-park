import { RUNNER_STATUSES, entryStatus, resultWarnings } from '../shared/race-results.mjs';
import { escapeHTML as e, icon } from './icons.mjs';

export function statusChip(status) {
  const value = typeof status==='object' ? entryStatus(status) : status;
  return `<span class="runner-status runner-status-${value.toLowerCase()}"><span class="runner-status-label">${e(RUNNER_STATUSES[value])}</span></span>`;
}

const triggerContent=value=>`<span class="runner-status-label">${e(RUNNER_STATUSES[value])}</span><span class="runner-status-caret" aria-hidden="true"></span>`;

export function statusField(trap, entry, prefix = 'runner-status') {
  const value=entryStatus(entry),id=`${prefix}-${trap}`;
  return `<div class="runner-status-field"><input type="hidden" name="status-${trap}" value="${value}"><button type="button" class="runner-status-trigger runner-status-${value.toLowerCase()}" role="combobox" aria-label="Status for trap ${trap}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}" ${value==='EMPTY'?'disabled':''}>${triggerContent(value)}</button><div class="runner-status-options" id="${id}" role="listbox" aria-label="Status for trap ${trap}" hidden>${Object.entries(RUNNER_STATUSES).filter(([code])=>code!=='EMPTY').map(([code,label])=>`<button type="button" role="option" tabindex="-1" aria-selected="${code===value}" data-status-value="${code}" title="${e(label)}">${statusChip(code)}${icon('check')}</button>`).join('')}</div></div>`;
}

export function setStatusField(field, value) {
  field.querySelector('input').value=value;
  const trigger=field.querySelector('.runner-status-trigger');
  trigger.className=`runner-status-trigger runner-status-${value.toLowerCase()}`;
  trigger.innerHTML=triggerContent(value);
  for(const option of field.querySelectorAll('[role=option]'))option.setAttribute('aria-selected',String(option.dataset.statusValue===value));
}

const previousTimes = new WeakMap();
export function finishOnTimeInput(input) {
  if (!input.name?.startsWith('time-')) return;
  const previous = previousTimes.get(input) ?? input.defaultValue;
  previousTimes.set(input, input.value);
  if (previous === '' && input.value !== '') setStatusField(input.closest('[data-runner], .trap-entry').querySelector('.runner-status-field'), 'FIN');
}

export function showResultWarnings(container, race, summary, options) {
  const {missingTimes, invalidEntered, duplicateTimes, message} = resultWarnings(race, options);
  if (summary) { summary.textContent = message; summary.hidden = !message; }
  for (const row of container.querySelectorAll('[data-runner], .trap-entry')) {
    const input = row.querySelector('[name^="time-"]');
    if (!input) continue;
    const trap = Number(row.dataset.runner || row.dataset.trap);
    row.classList.toggle('missing-finish-time',missingTimes.some(entry => entry.trap === trap));
    row.classList.toggle('invalid-entered-status',invalidEntered.some(entry => entry.trap === trap));
    row.classList.toggle('duplicate-finish-time',duplicateTimes.some(group=>group.some(entry=>entry.trap===trap)));
    if (summary) input.setAttribute('aria-describedby',summary.id);
  }
}

const wired=new WeakSet();
export function attachStatusFields(container) {
  if(wired.has(container))return;
  wired.add(container);
  const scrollPositions=new WeakMap();
  const scrollPosition=node=>node===document?[scrollX,scrollY]:[node.scrollLeft,node.scrollTop];
  const close=field=>{field.querySelector('[role=listbox]').hidden=true;field.querySelector('[role=combobox]').setAttribute('aria-expanded','false');scrollPositions.delete(field);};
  const closeAll=()=>container.querySelectorAll('.runner-status-field').forEach(close);
  const open=field=>{
    closeAll();const list=field.querySelector('[role=listbox]'),trigger=field.querySelector('[role=combobox]');
    list.hidden=false;trigger.setAttribute('aria-expanded','true');
    const dialog=container.closest('dialog')?.getBoundingClientRect();
    const top=dialog?Math.max(8,dialog.top+8):8,bottom=dialog?Math.min(innerHeight-8,dialog.bottom-8):innerHeight-8;
    list.style.maxHeight=`${bottom-top}px`;
    const bounds=trigger.getBoundingClientRect(),menu=list.getBoundingClientRect();
    list.style.left=`${Math.max(8,Math.min(innerWidth-menu.width-8,bounds.right-menu.width))}px`;
    list.style.top=`${bounds.bottom+menu.height+6<=bottom?bounds.bottom+6:Math.max(top,bounds.top-menu.height-6)}px`;
    const positions=new Map([[document,scrollPosition(document)]]);
    for(let node=field.parentElement;node;node=node.parentElement)positions.set(node,scrollPosition(node));
    scrollPositions.set(field,positions);
  };
  container.addEventListener('click',event=>{
    const field=event.target.closest('.runner-status-field');if(!field)return;
    const option=event.target.closest('[data-status-value]'),trigger=field.querySelector('[role=combobox]');
    if(trigger.disabled)return;
    if(option){setStatusField(field,option.dataset.statusValue);close(field);trigger.focus();field.querySelector('input').dispatchEvent(new Event('change',{bubbles:true}));}
    else if(event.target.closest('[role=combobox]')){if(trigger.getAttribute('aria-expanded')==='true')close(field);else open(field);}
  });
  container.addEventListener('keydown',event=>{
    const field=event.target.closest('.runner-status-field');if(!field)return;
    const trigger=field.querySelector('[role=combobox]'),options=[...field.querySelectorAll('[role=option]')];
    if(trigger.disabled)return;
    if(event.key==='Enter'||event.key===' ')event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(field);trigger.focus();return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();event.stopPropagation();
      if(trigger.getAttribute('aria-expanded')!=='true')open(field);
      const index=options.indexOf(document.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?options.length-1:index<0?options.findIndex(option=>option.getAttribute('aria-selected')==='true'):Math.max(0,Math.min(options.length-1,index+(event.key==='ArrowDown'?1:-1)));
      options[next]?.focus({preventScroll:true});
    }
  });
  container.addEventListener('focusout',event=>{const field=event.target.closest('.runner-status-field');if(field&&!field.contains(event.relatedTarget))close(field);});
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.runner-status-field'))closeAll();});
  document.addEventListener('scroll',event=>{
    if(event.target.closest?.('.runner-status-options'))return;
    for(const field of container.querySelectorAll('.runner-status-field')){
      const positions=scrollPositions.get(field);if(!positions)continue;
      const before=positions.get(event.target),after=scrollPosition(event.target);
      // Focusing a trigger can queue a scroll event before its menu opens.
      if(!before || before.some((value,index)=>value!==after[index]))close(field);
    }
  },true);
  window.addEventListener('resize',closeAll);
}
