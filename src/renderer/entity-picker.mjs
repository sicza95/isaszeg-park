import {escapeHTML as e} from './icons.mjs';
import {nameKey} from '../shared/registry.mjs';

let closeActivePicker,activePicker;
export function closeEntityPickers(container) {if(!container||container.contains(activePicker))closeActivePicker?.();}

export function entityField(label,name,kind,id,entities,{placeholder='Type a name to search or create…',extra='',hideLabel=false}={}) {
  const entity=entities.find(item=>item.id===id), listId=`choices-${crypto.randomUUID()}`;
  return `<div class="reg-field entity-field"><label${hideLabel?' class="sr-only"':''} for="${listId}-input">${label}</label><div class="entity-picker" data-kind="${kind}"><input id="${listId}-input" type="text" data-entity-input autocomplete="off" maxlength="160" value="${e(entity?.name||'')}" placeholder="${e(placeholder)}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}"><input type="hidden" name="${name}" value="${e(id||'')}"><div id="${listId}" class="entity-choices" role="listbox" popover="manual" hidden></div></div>${extra}</div>`;
}

export function requireEntitySelections(form) {
  for (const picker of form.querySelectorAll('.entity-picker')) {
    const input=picker.querySelector('[data-entity-input]');
    if (input.value.trim() && !picker.querySelector('input[type=hidden]').value) {
      input.focus(); throw new Error(`Choose a match or press Enter to create “${input.value.trim()}”.`);
    }
  }
}

export function attachEntityPickers(container,{entities,create,onSelect=()=>{},onError}) {
  for (const picker of container.querySelectorAll('.entity-picker')) {
    const input=picker.querySelector('[data-entity-input]'), hidden=picker.querySelector('input[type=hidden]'), list=picker.querySelector('[role=listbox]');
    let choices=[],active=-1,selected=input.value,busy=false;
    let positioning;
    const position=()=>{
      const viewport=window.visualViewport, margin=8, gap=5;
      const left=(viewport?.offsetLeft||0)+margin, top=(viewport?.offsetTop||0)+margin;
      const right=left+(viewport?.width||innerWidth)-margin*2, bottom=top+(viewport?.height||innerHeight)-margin*2;
      const bounds=input.getBoundingClientRect(), below=Math.max(0,bottom-bounds.bottom-gap), above=Math.max(0,bounds.top-top-gap);
      const desired=Math.min(210,list.scrollHeight+2), upwards=below<desired && above>below;
      list.style.width=`${Math.min(Math.max(bounds.width,220),right-left)}px`;
      list.style.maxHeight=`${Math.min(210,upwards?above:below)}px`;
      list.style.left=`${Math.max(left,Math.min(bounds.left,right-list.getBoundingClientRect().width))}px`;
      list.style.top=`${Math.max(top,Math.min(bottom-list.getBoundingClientRect().height,upwards?bounds.top-gap-list.getBoundingClientRect().height:bounds.bottom+gap))}px`;
      list.dataset.align=upwards?'above':'below';
    };
    const close=()=>{positioning?.abort();if(list.matches(':popover-open'))list.hidePopover();list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;if(closeActivePicker===close){closeActivePicker=undefined;activePicker=undefined;}};
    const show=()=>{
      const all=entities(picker.dataset.kind,hidden.name), query=nameKey(input.value);
      choices=all.filter(item=>nameKey(item.name).includes(query)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,30).map(item=>({id:item.id,name:item.name}));
      if(query && !all.some(item=>nameKey(item.name)===query)) choices.push({name:input.value.trim(),create:true});
      list.innerHTML=choices.map((item,i)=>`<button type="button" role="option" tabindex="-1" id="${list.id}-${i}" aria-selected="${i===active}" data-choice="${i}">${item.create?`Create “${e(item.name)}”`:e(item.name)}</button>`).join('')||'<div class="entity-no-matches">Type a name to create an entry.</div>';
      list.hidden=false;input.setAttribute('aria-expanded','true');
      if(!list.matches(':popover-open')){
        closeActivePicker?.();closeActivePicker=close;activePicker=picker;
        list.showPopover();positioning=new AbortController();
        const options={signal:positioning.signal};
        window.addEventListener('resize',position,options);
        document.addEventListener('scroll',position,{...options,capture:true});
        window.visualViewport?.addEventListener('resize',position,options);
        window.visualViewport?.addEventListener('scroll',position,options);
        picker.closest('dialog')?.addEventListener('close',close,{...options,once:true});
      }
      position();
      if(active>=0 && choices[active]) {
        input.setAttribute('aria-activedescendant',`${list.id}-${active}`);
        const option=list.children[active],bounds=option.getBoundingClientRect(),menu=list.getBoundingClientRect();
        if(bounds.top<menu.top)list.scrollTop+=bounds.top-menu.top;
        else if(bounds.bottom>menu.bottom)list.scrollTop+=bounds.bottom-menu.bottom;
      }
      else input.removeAttribute('aria-activedescendant');
    };
    const choose=async choice=>{
      if(busy || !choice)return;
      busy=true;input.disabled=true;close();
      try {
        const entity=choice.create?await create(picker.dataset.kind,choice.name,hidden.name):choice;
        hidden.value=entity.id;input.value=selected=entity.name;close();
        await onSelect(hidden.name,entity,Boolean(choice.create));
      } catch(error) {onError(error);}
      finally {busy=false;input.disabled=false;}
    };
    input.addEventListener('focus',()=>{active=-1;show();});
    input.addEventListener('click',()=>{if(list.hidden){active=-1;show();}});
    input.addEventListener('input',()=>{if(input.value!==selected)hidden.value='';active=-1;show();});
    input.addEventListener('blur',()=>{close();if(!input.value.trim() && selected){selected='';hidden.value='';Promise.resolve(onSelect(hidden.name,null,false)).catch(onError);}});
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape' && !list.hidden){event.preventDefault();event.stopPropagation();close();return;}
      if(['ArrowDown','ArrowUp'].includes(event.key)) {event.preventDefault();active=Math.max(0,Math.min(choices.length-1,active+(event.key==='ArrowDown'?1:-1)));show();return;}
      if(event.key==='Enter') {
        event.preventDefault();event.stopPropagation();
        const choice=active>=0?choices[active]:choices.find(item=>nameKey(item.name)===nameKey(input.value));
        if(choice)void choose(choice);
      }
    });
    list.addEventListener('pointerdown',event=>event.preventDefault());
    list.addEventListener('click',event=>{const button=event.target.closest('[data-choice]');if(button)void choose(choices[Number(button.dataset.choice)]);});
  }
}
