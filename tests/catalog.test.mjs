// Machine catalog: integrity, search, adding, and share links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, decodeMachines, encodeMachines, guessType, planMachineAdds, searchCatalog } from '../src/lib/catalog.ts';
import { STARTER_EQUIPMENT, STARTER_EXERCISES } from '../src/lib/seed.ts';

const exIds = new Set(STARTER_EXERCISES.map(e => e.id));
const eqIds = new Set(STARTER_EQUIPMENT.map(e => e.id));
const names = new Map(STARTER_EXERCISES.map(e => [e.id, e.name]));
let n = 0;
const newId = () => `new-${n++}`;

test('catalog: unique ids, every exercise and starter twin exists', () => {
  assert.equal(new Set(CATALOG.map(c => c.id)).size, CATALOG.length);
  for (const c of CATALOG) {
    const adds = new Set((c.adds ?? []).map(a => a.id));
    for (const id of c.exercises) assert.ok(exIds.has(id) || adds.has(id), `${c.id} -> ${id}`);
    if (c.same_as) assert.ok(eqIds.has(c.same_as), `${c.id} same_as ${c.same_as}`);
    if (c.type !== 'cardio') assert.ok(c.exercises.length > 0, `${c.id} does nothing`);
  }
  // Squats stay off the menu except the hack squat; deadlifts never route to a barbell.
  for (const c of CATALOG) assert.doesNotMatch(c.name, /^(?!hack).*squat|lunge|pendulum|belt squat/i, c.name);
});

test('search finds machines the way stickers and people say them', () => {
  const first = (q) => searchCatalog(q, names)[0]?.id;
  assert.equal(first('pulldown'), 'cat-pulldown-pin');
  assert.equal(first('lat pull down'), 'cat-pulldown-pin');
  // Hammer Strength makes both kinds; both lead, the user picks.
  assert.deepEqual(searchCatalog('hammer incline', names).slice(0, 2).map(c => c.id).sort(), ['cat-incline-press-pin', 'cat-incline-press-plate']);
  assert.equal(first('hammer plate incline'), 'cat-incline-press-plate');
  assert.equal(first('insignia shoulder'), 'cat-shoulder-press-pin');
  assert.equal(first('leg ext'), 'cat-leg-ext');
  assert.equal(first('pec'), 'cat-pec-deck');
  assert.equal(first('outer thigh'), 'cat-abductor');
  assert.ok(searchCatalog('treadmill').some(c => c.id === 'cat-treadmill'));
  assert.deepEqual(searchCatalog(''), []);
  assert.deepEqual(searchCatalog('zzzz'), []);
});

test('adding a catalog machine links it to its exercises; its starter twin is renamed, not duplicated', () => {
  const twin = STARTER_EQUIPMENT.find(e => e.id === 'pl-incline');
  const plan = planMachineAdds([{ catalog: 'cat-incline-press-plate', location: 'by the windows' }], [twin], STARTER_EXERCISES, newId);
  assert.equal(plan.added, 0, 'renamed, not added');
  assert.deepEqual(plan.equipment.map(e => [e.id, e.name, e.location_note]), [['pl-incline', 'Incline press (plate-loaded)', 'by the windows']]);

  const fresh = planMachineAdds([{ catalog: 'cat-incline-press-pin' }], [], STARTER_EXERCISES, newId);
  assert.equal(fresh.added, 1);
  const incline = fresh.exercises.find(x => x.id === 'incline-press');
  assert.equal(incline.equipment_options.at(-1), 'cat-incline-press-pin', 'appended as a fallback, routing order kept');
});

test('a machine that brings a new exercise creates it once', () => {
  const plan = planMachineAdds([{ catalog: 'cat-abductor' }, { catalog: 'cat-ab-ad-combo' }], [], STARTER_EXERCISES, newId);
  const abd = plan.exercises.filter(x => x.id === 'abduction');
  assert.equal(abd.length, 1);
  assert.deepEqual(abd[0].equipment_options, ['cat-abductor', 'cat-ab-ad-combo']);
  assert.equal(plan.added, 2);
});

test('a hand-added machine gets muscles from what it does and a guessed type', () => {
  const plan = planMachineAdds([{ name: 'Plate-loaded chest fly', exercises: ['pec-fly', 'nope'] }], [], STARTER_EXERCISES, () => 'mine');
  const [eq] = plan.equipment;
  assert.equal(eq.type, 'plate-loaded');
  assert.deepEqual(eq.muscles, ['chest', 'front_delts']);
  assert.deepEqual(plan.exercises.map(x => x.id), ['pec-fly']);
  assert.equal(guessType('Cable column'), 'cable');
  assert.equal(guessType('Leg curl'), 'selectorized');
});

test('share links round-trip and reject junk', () => {
  const reqs = [{ catalog: 'cat-leg-ext', location: 'back right' }, { name: 'Odd machine', exercises: ['shrug'] }];
  const back = decodeMachines(encodeMachines(reqs));
  assert.deepEqual(back, [{ catalog: 'cat-leg-ext', location: 'back right' }, { name: 'Odd machine', exercises: ['shrug'], location: undefined }]);
  assert.match(encodeMachines(reqs), /^[A-Za-z0-9_-]+$/, 'URL-safe');
  assert.equal(decodeMachines('not base64 at all!!'), null);
  assert.equal(decodeMachines(encodeMachines([])), null);
  assert.deepEqual(decodeMachines(btoa(JSON.stringify([{ c: 5 }, { n: '<b>x</b>', x: [1, 'shrug'] }]))), [{ name: '<b>x</b>', exercises: ['shrug'], location: undefined }]);
});
