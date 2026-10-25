import {escapeHTML as e} from './icons.mjs';
import {nameKey} from '../shared/registry.mjs';

export function entityField(label,name,kind,id,entities,{placeholder='Type a name to search or create…',extra=''}={}) {
  const entity=entities.find(item=>item.id===id), listId=`choices-${crypto.randomUUID()}`;
  return `<div class="reg-field entity-field"><label for="${listId}-input">${label}</label><div class="entity-picker" data-kind="${kind}"><input id="${listId}-input" type="text" data-entity-input autocomplete="off" maxlength="160" value="${e(entity?.name||'')}" placeholder="${e(placeholder)}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}"><input type="hidden" name="${name}" value="${e(id||'')}"><div id="${listId}" class="entity-choices" role="listbox" hidden></div></div>${extra}</div>`;
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
    const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;};
    const show=()=>{
      const all=entities(picker.dataset.kind,hidden.name), query=nameKey(input.value);
      choices=all.filter(item=>nameKey(item.name).includes(query)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,30).map(item=>({id:item.id,name:item.name}));
      if(query && !all.some(item=>nameKey(item.name)===query)) choices.push({name:input.value.trim(),create:true});
      list.innerHTML=choices.map((item,i)=>`<button type="button" role="option" id="${list.id}-${i}" aria-selected="${i===active}" data-choice="${i}">${item.create?`Create “${e(item.name)}”`:e(item.name)}</button>`).join('')||'<div class="entity-no-matches">Type a name to create an entry.</div>';
      list.hidden=false;input.setAttribute('aria-expanded','true');
      if(active>=0 && choices[active]) {input.setAttribute('aria-activedescendant',`${list.id}-${active}`);list.children[active]?.scrollIntoView({block:'nearest'});}
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
