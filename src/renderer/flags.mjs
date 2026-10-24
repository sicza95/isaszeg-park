import { COUNTRY_CODES } from '../shared/countries.mjs';
import { escapeHTML as e } from './icons.mjs';

const countries = new Set(COUNTRY_CODES);
const names = new Intl.DisplayNames(['en'], {type:'region'});
export const countryName = code => countries.has(code) ? names.of(code) : code || 'Not entered';
export const countryOptions = [['','Not entered'], ...COUNTRY_CODES.map(code=>[code,countryName(code)]).sort((a,b)=>a[1].localeCompare(b[1]))];

export function flag(code) {
  if (!countries.has(code)) return `<span class="country-unknown" title="${e(code || 'Country not entered')}">—</span>`;
  const name = e(countryName(code));
  return `<img class="country-flag" src="../../assets/flags/${code.toLowerCase()}.svg" alt="${name}" title="${name}" width="24" height="18">`;
}

export function countryField(label, name, code) {
  return `<label class="reg-field">${label}<span class="country-picker">${flag(code)}<select name="${name}" aria-label="${label}">${countryOptions.map(([id,title])=>`<option value="${id}" ${id===code?'selected':''}>${e(title)}</option>`).join('')}</select></span></label>`;
}
