const text = (value, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function validateRegistration(input) {
  if (!input || !Array.isArray(input.races) || !Array.isArray(input.dogs) || input.races.length > 500 || input.dogs.length > 3000) throw new Error('Invalid registration data.');
  const dogIds = new Set(), raceIds = new Set(), numbers = new Set();
  const dogs = input.dogs.map(dog => {
    const id = text(dog.id), name = text(dog.name);
    if (!id || !name || dogIds.has(id)) throw new Error('Each dog needs a unique ID and a name.');
    dogIds.add(id);
    if (!['Greyhound', 'Whippet'].includes(dog.breed)) throw new Error('Choose a dog breed.');
    if (dog.birth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(dog.birth)) throw new Error('Use a valid birth month.');
    if (dog.preference && !['I', 'M', 'W'].includes(dog.preference)) throw new Error('Choose a running preference.');
    if (dog.sex && !['dog','bitch'].includes(dog.sex)) throw new Error('Choose a dog sex.');
    for (const key of ['country','origin']) if (dog[key] && !/^[A-Z]{2}$/.test(dog[key])) throw new Error('Use two-letter uppercase country codes.');
    const result = {id, name, breed:dog.breed};
    for (const key of ['owner','trainer','country','origin','sire','dam','birth','sex','coat','preference','sourceUrl']) result[key] = text(dog[key]);
    return result;
  });
  const races = input.races.map(race => {
    const number = Number(race.number), id = text(race.id), title = text(race.title);
    if (!id || raceIds.has(id) || !title || !Number.isInteger(number) || number < 1 || number > 9999 || numbers.has(number)) throw new Error('Use a unique race number (1–9999) and a race title.');
    raceIds.add(id); numbers.add(number);
    const distance = Number(race.distance);
    if (!Number.isFinite(distance) || distance < 50 || distance > 2000) throw new Error('Distance must be 50–2000 metres.');
    if (!['Greyhound','Whippet'].includes(race.breed) || !['Oval','Straight'].includes(race.type)) throw new Error('Choose a breed and track type.');
    if (!Array.isArray(race.entries) || race.entries.length > 6) throw new Error('A race can have up to six entries.');
    const traps = new Set(), entered = new Set();
    const entries = race.entries.map(entry => {
      const trap = Number(entry.trap), dogId = text(entry.dogId);
      if (!Number.isInteger(trap) || trap < 1 || trap > 6 || traps.has(trap) || entered.has(dogId) || !dogIds.has(dogId)) throw new Error('Assign each dog once and use a different trap (1–6).');
      if (dogs.find(dog=>dog.id===dogId).breed !== race.breed) throw new Error('The dog breed must match the race.');
      traps.add(trap); entered.add(dogId);
      const result = {trap,dogId};
      const finish = text(entry.finish);
      if (finish && !['1','2','3','4','5','6','NR','DNF','DQ'].includes(finish)) throw new Error('Choose a finish position or result status.');
      result.finish = finish;
      for (const key of ['weight','split','finalSplit','time','estimatedTime']) {
        const value = text(entry[key]);
        if (value && (!Number.isFinite(Number(value)) || Number(value) <= 0)) throw new Error('Weights and times must be positive numbers.');
        result[key] = value;
      }
      if (['NR','DNF','DQ'].includes(finish) && (result.time || result.estimatedTime)) throw new Error('Clear finish times for a non-runner, DNF or disqualification.');
      result.remarks = text(entry.remarks, 500); result.going = text(entry.going, 30);
      return result;
    });
    return {id,number,title,distance,breed:race.breed,type:race.type,grade:text(race.grade,20),sourceUrl:text(race.sourceUrl),videoReference:text(race.videoReference),entries};
  });
  return {title:text(input.title)||'Race day',track:text(input.track)||'Isaszeg Park',source:text(input.source),races,dogs};
}
export { validateRegistration };
