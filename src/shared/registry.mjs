import { validateRegistration } from './registration.mjs';

export const emptyRegistry = () => ({version:1,dogs:[],people:[]});
export const nameKey = name => String(name || '').trim().toLocaleLowerCase();

// IDs are authoritative; the text fields are refreshed for old readers and broadcasts.
export function resolveRegistry(registry) {
  const result = structuredClone(registry);
  const people = new Map(result.people.map(person=>[person.id,person.name])), dogs = new Map(result.dogs.map(dog=>[dog.id,dog.name]));
  for (const dog of result.dogs) {
    for (const role of ['owner','trainer']) dog[role] = people.get(dog[`${role}Id`]) || '';
    for (const role of ['sire','dam']) dog[role] = dogs.get(dog[`${role}Id`]) || '';
  }
  return result;
}

export function mergeRegistry(base = emptyRegistry(), input = {}) {
  const result = structuredClone(base);
  if (!Array.isArray(input.dogs || []) || !Array.isArray(input.people || [])) throw new Error('Invalid registry data.');
  for (const collection of ['people','dogs']) for (const entity of input[collection] || []) {
    const index = result[collection].findIndex(item=>item.id===entity.id);
    if (index < 0) result[collection].push(structuredClone(entity));
    else {
      result[collection][index] = {...result[collection][index],...entity};
      if (collection==='dogs') for (const role of ['owner','trainer','sire','dam']) {
        if (Object.hasOwn(entity,role) && !Object.hasOwn(entity,`${role}Id`)) delete result.dogs[index][`${role}Id`];
      }
    }
  }
  for (const dog of [...result.dogs]) {
    for (const role of ['owner','trainer','sire','dam']) {
      const idKey = `${role}Id`;
      if (Object.hasOwn(dog,idKey)) continue;
      dog[idKey] = '';
      const name = String(dog[role] || '').trim();
      if (!name) continue;
      const collection = ['owner','trainer'].includes(role) ? result.people : result.dogs;
      let entity = collection.find(item=>nameKey(item.name)===nameKey(name) && (collection===result.people || item.breed===dog.breed));
      if (!entity) {
        entity = {id:crypto.randomUUID(),name,...(collection===result.dogs ? {breed:dog.breed,sex:role==='sire'?'dog':'bitch'} : {})};
        collection.push(entity);
      }
      dog[idKey] = entity.id;
    }
  }
  // Validate before resolving so dangling IDs never silently lose their names.
  const clean = validateRegistration({races:[],dogs:result.dogs,people:result.people});
  return resolveRegistry({version:1,dogs:clean.dogs,people:clean.people});
}

export function withRegistry(registration, registry) {
  return {...(registration || {title:'Race day',track:'Isaszeg Park',races:[]}),dogs:structuredClone(registry.dogs),people:structuredClone(registry.people)};
}

export function meetingRegistration(registration) {
  const {dogs,people,...meeting} = registration;
  return meeting;
}

export function assertRaceBreeds(registry,registration) {
  const dogs = new Map(registry.dogs.map(dog=>[dog.id,dog]));
  for (const race of registration?.races || []) for (const entry of race.entries) {
    const dog = dogs.get(entry.dogId);
    if (dog && dog.breed !== race.breed) throw new Error(`${dog.name} is entered in race ${race.number} as a ${race.breed}. Update the race before changing the dog’s breed.`);
  }
}
