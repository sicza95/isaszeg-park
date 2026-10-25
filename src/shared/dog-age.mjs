// Births are recorded by month; use the meeting date for historical race cards.
export function dogAge(birth, meetingDate) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(birth || '') || !/^\d{4}-\d{2}-\d{2}$/.test(meetingDate || '')) return '-';
  const [year, month] = birth.split('-').map(Number), [raceYear, raceMonth] = meetingDate.split('-').map(Number);
  const months = (raceYear-year)*12 + raceMonth-month;
  if (months < 0) return '-';
  const years = Math.floor(months/12), remainder = months%12;
  return [years ? `${years}y` : '', remainder || !years ? `${remainder}m` : ''].filter(Boolean).join(' ');
}
