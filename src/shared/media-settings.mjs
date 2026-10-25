export const DEFAULT_MEDIA_SETTINGS = {
  bannerSeconds: 12, sponsorSeconds: 10, resultsSeconds: 5,
  sponsorBackground: '#000000', sponsorForeground: '#f4f4f5'
};

export const isColor = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

export function mediaSeconds(meeting, item) {
  const key = item?.kind === 'ad' ? 'sponsorSeconds' : 'bannerSeconds';
  const value = item?.seconds ?? meeting?.settings?.[key] ?? DEFAULT_MEDIA_SETTINGS[key];
  return Number.isFinite(value) ? Math.max(3, Math.min(120, value)) : DEFAULT_MEDIA_SETTINGS[key];
}

export function sponsorColors(meeting, item) {
  return Object.fromEntries(['sponsorBackground', 'sponsorForeground'].map(key => {
    const value = item?.[key] ?? meeting?.settings?.[key];
    return [key, isColor(value) ? value : DEFAULT_MEDIA_SETTINGS[key]];
  }));
}

export function footerSponsor(meeting, seconds = Date.now() / 1000) {
  const sponsors = meeting.items.filter(item => item.kind === 'ad' && item.enabled);
  const total = sponsors.reduce((sum, item) => sum + mediaSeconds(meeting, item), 0);
  let position = ((seconds % total) + total) % total;
  return sponsors.find(item => (position -= mediaSeconds(meeting, item)) < 0);
}

export function applySettings(settings, patch) {
  for (const key of ['sponsorBackground', 'sponsorForeground']) {
    if (Object.hasOwn(patch,key) && !isColor(patch[key])) throw new Error('Choose a valid footer color.');
  }
  for (const key of ['sponsorRail', 'muted', 'autoBrowse']) if (typeof patch[key] === 'boolean') settings[key] = patch[key];
  for (const [key, min, max] of [['bannerSeconds',3,120], ['sponsorSeconds',3,120], ['resultsSeconds',1,120], ['racecardSeconds',5,60]]) {
    if (Number.isFinite(patch[key])) settings[key] = Math.min(max, Math.max(min, patch[key]));
  }
  for (const key of ['sponsorBackground', 'sponsorForeground']) {
    if (Object.hasOwn(patch, key)) {
      settings[key] = patch[key];
    }
  }
  if (Number.isInteger(patch.adEvery)) settings.adEvery = Math.min(20, Math.max(1, patch.adEvery));
  if ([.25,.5,.75,1].includes(patch.defaultRate)) settings.defaultRate = patch.defaultRate;
}
