import { TRAPS } from '../shared/traps.mjs';
import { escapeHTML as e } from './icons.mjs';

export function trapBadge(number, broadcast = false) {
  const trap = TRAPS.find(trap => trap.number === number);
  if (!trap) return '';
  return `<span class="trap-badge trap-${number}${broadcast?` broadcast-trap broadcast-trap-${number}`:''}" title="${e(trap.description)}" aria-label="Trap ${number}: ${e(trap.description)}">${number}</span>`;
}
