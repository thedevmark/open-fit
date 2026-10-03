import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  afterTraining, buildPlan, currentTemplateId, DEFAULT_SET_REPS, suggestPerSet, withSetReps, fatigueScores, groupBySession, isPR, muscleStatus,
  prefill, resolveEquipment, setsPerMuscle, tripsFrom, stepFor, suggestNext, trimmedSets, unmappedExercises,
} from '../src/lib/logic.ts';
import { DEFAULT_SETTINGS, STARTER_EQUIPMENT, STARTER_EXERCISES, STARTER_TEMPLATES, upgradeLibrary, upgradeStarter } from '../src/lib/seed.ts';

const H = 3_600_000;
const exById = new Map(STARTER_EXERCISES.map(e => [e.id, e]));
const eqById = new Map(STARTER_EQUIPMENT.map(e => [e.id, e]));
const tById = new Map(STARTER_TEMPLATES.map(t => [t.id, t]));
const session = (id, at, sets) => ({ session_id: id, at, sets: sets.map(([w, r], i) => ({ weight_lb: w, reps: r, set_number: i + 1 })) });
const range = { sets: 3, rep_min: 8, rep_max: 10 };

test('starter data is internally consistent', () => {
  for (const e of STARTER_EXERCISES) for (const id of e.equipment_options) assert.ok(eqById.has(id), `${e.id} -> ${id}`);
  for (const t of STARTER_TEMPLATES) for (const i of t.items) {
    assert.ok(exById.has(i.exercise_id), `${t.id} -> ${i.exercise_id}`);
    assert.ok(i.rep_min <= i.rep_max && i.sets > 0);
  }
  assert.deepEqual(DEFAULT_SETTINGS.split_order, ['push-a', 'pull-a', 'legs-delts', 'push-b', 'pull-b']);
  assert.equal(DEFAULT_SETTINGS.club_name, 'My gym', 'neutral default; a deployment can lock its own in config');
  assert.deepEqual(unmappedExercises(STARTER_TEMPLATES, exById, eqById), []);
});

test('a phone on an earlier starter moves to the current one; edited days are left alone', () => {
  const it = (id, sets) => ({ exercise_id: id, sets, rep_min: 8, rep_max: 12, rest_sec: 60 });
  const legacy = [
    { id: 'push-a', name: 'Push A', order_in_split: 0, items: [it('incline-press', 4), it('flat-press', 3), it('cable-fly', 3), it('lateral-raise', 3), it('pushdown', 3)] },
    { id: 'pull-a', name: 'My pull', order_in_split: 1, items: [it('lat-pulldown', 4)] },
    { id: 'legs-delts', name: 'Legs + Delts', order_in_split: 2, items: [it('rdl', 3), it('seated-curl', 3), it('lateral-raise', 3), it('rear-delt-fly', 3), it('cable-crunch', 3)] },
    { id: 'arms-delts', name: 'Arms + Delts', order_in_split: 5, items: [it('preacher-curl', 3)] },
  ];
  const old = ['push-a', 'pull-a', 'legs-delts', 'push-b', 'pull-b', 'arms-delts', 'light'];
  const up = upgradeStarter(legacy, { split_order: old, current_position: 3 });
  const byId = new Map(up.templates.map(t => [t.id, t]));

  assert.equal(byId.get('push-a').name, 'Chest + Triceps');
  assert.deepEqual(byId.get('push-a').items, tById.get('push-a').items, 'untouched starter day gets 12 / 10 / 8');
  assert.equal(byId.has('pull-a'), false, 'a renamed, edited day is not touched');
  assert.equal(byId.get('legs-delts').name, 'Hamstrings + Delts');
  assert.deepEqual(byId.get('legs-delts').items, tById.get('legs-delts').items, 'untouched starter day gets the new exercises');
  assert.equal(byId.has('arms-delts'), false, 'dropped days stay as templates for their history');
  assert.deepEqual(up.settings, { split_order: DEFAULT_SETTINGS.split_order, current_position: 3 }, 'the next day stays next');

  assert.equal(upgradeStarter(legacy, { split_order: old, current_position: 6 }).settings.current_position, 0, 'next was a dropped day: start over');
  assert.equal(upgradeStarter([], { split_order: ['x'], current_position: 0 }), null, 'a custom rotation is left alone');

  // A phone on the first five-day starter (rep ranges): days move to 12 / 10 / 8, the rotation is untouched.
  const fiveDay = [{ id: 'push-b', name: 'Shoulders + Chest', order_in_split: 3, items: [it('shoulder-press', 4), it('incline-press', 3), it('pec-fly', 3), it('dips', 3), it('oh-triceps', 3), it('lateral-raise', 4)] }];
  const up5 = upgradeStarter(fiveDay, { split_order: DEFAULT_SETTINGS.split_order, current_position: 2 });
  assert.deepEqual(up5.templates[0].items, tById.get('push-b').items);
  assert.equal(up5.settings, null);
  assert.equal(upgradeStarter(STARTER_TEMPLATES, DEFAULT_SETTINGS), null, 'already current: nothing to do');
});

test('a phone on the old starter machine list gets the floor-photo machines; edits and empty libraries are left alone', () => {
  const old = [
    { id: 'pl-incline', name: 'Plate-loaded incline press', type: 'plate-loaded', muscles: ['chest'], location_note: '', setup_note: '', available: true },
    { id: 'lat-pd', name: 'Lat pulldown by the window', type: 'selectorized', muscles: ['lats'], location_note: 'back corner', setup_note: '', available: true },
    { id: 'cable-col', name: 'Single cable column', type: 'cable', muscles: ['triceps'], location_note: '', setup_note: '', available: true },
  ];
  const exercises = [
    { id: 'pushdown', name: 'Triceps pushdown', primary_muscle: 'triceps', secondary_muscles: [], equipment_options: ['cable-col', 'crossover'] },
    { id: 'my-move', name: 'Mine', primary_muscle: 'abs', secondary_muscles: [], equipment_options: [] },
  ];
  const up = upgradeLibrary(old, exercises);
  const byId = new Map(up.equipment.map(e => [e.id, e]));
  assert.equal(byId.get('pl-incline').name, 'Incline press · Hammer Strength', 'untouched starter name is renamed');
  assert.equal(byId.get('pl-incline').location_note, '', 'no location labels pushed onto phones');
  assert.equal(byId.has('lat-pd'), false, 'a machine you renamed is left alone');
  assert.ok(byId.has('dual-pulley') && byId.has('treadmill') && byId.has('plyo-box'), 'new machines are added');
  assert.equal(byId.get('treadmill').type, 'cardio');
  assert.deepEqual(up.exercises, [{ ...exercises[0], equipment_options: ['cable-col', 'crossover', 'dual-pulley'] }], 'only new machines get linked, appended');
  assert.equal(upgradeLibrary([{ ...old[0], id: 'mine' }], exercises), null, 'a library started empty is left alone');
  assert.equal(upgradeLibrary(STARTER_EQUIPMENT, STARTER_EXERCISES), null, 'already current: nothing to do');
});

test('rotation: today is the current slot; finishing it moves one step', () => {
  const s = { split_order: ['a', 'b', 'c'], current_position: 1 };
  assert.equal(currentTemplateId(s), 'b');
  assert.deepEqual(afterTraining(s, 'b'), { current_position: 2, cycle_done: ['b'] });
  assert.deepEqual(afterTraining(s, 'zzz'), { current_position: 1, cycle_done: [] }, 'a day outside the split leaves it alone');
  assert.equal(currentTemplateId({ split_order: [], current_position: 0 }), null);
});

test('days go in any order: a day you jump past stays next, every day once per round', () => {
  let s = { split_order: ['a', 'b', 'c', 'd', 'e'], current_position: 0, cycle_done: [] };
  const train = (id) => { s = { ...s, ...afterTraining(s, id) }; return currentTemplateId(s); };

  assert.equal(train('c'), 'a', 'did c instead of a: a is still next');
  assert.equal(train('a'), 'b');
  assert.equal(train('b'), 'd', 'c is already done this round');
  assert.equal(train('d'), 'e');
  assert.equal(train('e'), 'a', 'round complete: start over at the top');
  assert.deepEqual(s.cycle_done, []);

  s = { split_order: ['a', 'b', 'c'], current_position: 2, cycle_done: ['a', 'b'] };
  assert.equal(train('c'), 'a', 'finishing the last open day wraps');
  assert.equal(currentTemplateId({ split_order: ['a', 'b'], current_position: 0 }), 'a', 'old data with no cycle_done');
});

test('machine resolution falls down the ordered list past unavailable and taken machines', () => {
  const ex = { equipment_options: ['m1', 'm2', 'm3'] };
  const eq = new Map([['m1', { available: false }], ['m2', { available: true }], ['m3', { available: true }]]);
  assert.equal(resolveEquipment(ex, eq), 'm2');
  assert.equal(resolveEquipment(ex, eq, ['m2']), 'm3');
  assert.equal(resolveEquipment(ex, eq, ['m2', 'm3']), null);
  assert.equal(resolveEquipment({ equipment_options: ['gone'] }, eq), null);
});

test('progression: no history means no suggestion (baseline session)', () => {
  assert.equal(suggestNext([], range, 10), null);
});

test('progression: every set at rep_max -> one step up, back to rep_min', () => {
  const s = suggestNext([session('s1', 1, [[70, 10], [70, 10], [70, 11]])], range, 10);
  assert.equal(s.rule, 'weight_up');
  assert.equal(s.weight_lb, 80);
  assert.deepEqual(s.reps, [8, 8, 8]);
});

test('progression: inside the range -> same weight, +1 rep on the weakest set', () => {
  const s = suggestNext([session('s1', 1, [[70, 10], [70, 8], [70, 9]])], range, 10);
  assert.equal(s.rule, 'add_rep');
  assert.equal(s.weight_lb, 70);
  assert.deepEqual(s.reps, [10, 9, 9]);
});

test('progression: under rep_min two sessions running -> one step down', () => {
  const hist = [session('s2', 2, [[90, 7], [90, 6], [90, 5]]), session('s1', 1, [[90, 7], [90, 6]])];
  const s = suggestNext(hist, range, 10);
  assert.equal(s.rule, 'weight_down');
  assert.equal(s.weight_lb, 80);
  // only once under -> keep grinding at the same weight
  assert.equal(suggestNext(hist.slice(0, 1), range, 10).rule, 'add_rep');
});

test('progression judges the working (top-weight) sets, not back-off sets', () => {
  const s = suggestNext([session('s1', 1, [[100, 10], [100, 10], [80, 6]])], range, 10);
  assert.equal(s.rule, 'weight_up');
  assert.equal(s.weight_lb, 110);
});

test('bodyweight (step 0) progresses by reps without a rep_max cap', () => {
  const s = suggestNext([session('s1', 1, [[0, 12], [0, 12], [0, 12]])], range, 0);
  assert.equal(s.rule, 'add_rep');
  assert.deepEqual(s.reps, [13, 12, 12]);
});

test('per-set targets: each set moves on its own against the same set last time', () => {
  const last = session('s1', 2, [[50, 12], [60, 9], [70, 8]]);
  const s = suggestPerSet([last], [12, 10, 8], 10);
  assert.deepEqual(s.weights, [60, 60, 80], 'sets 1 and 3 hit target and go up; set 2 stays');
  assert.deepEqual(s.reps, [12, 10, 8]);
  assert.equal(s.rule, 'weight_up');
  assert.equal(s.reason, 'Sets 1, 3 hit target — add 10 lb');

  const short = [session('s2', 2, [[50, 11], [60, 6]]), session('s1', 1, [[50, 11], [60, 7]])];
  const d = suggestPerSet(short, [12, 10, 8], 10);
  assert.deepEqual(d.weights, [50, 50, 50], 'set 2 short twice drops; set 3 has no history and follows set 2');
  assert.equal(d.rule, 'weight_down');
  assert.equal(suggestPerSet([], [12, 10, 8], 10), null, 'first time is the baseline');
});

test('per-set reps keep sets and the rep range in step', () => {
  const item = { exercise_id: 'x', sets: 3, rep_min: 8, rep_max: 12, rest_sec: 60 };
  assert.deepEqual(withSetReps(item, DEFAULT_SET_REPS), { ...item, sets: 3, reps: [12, 10, 8], rep_min: 8, rep_max: 12 });
  assert.deepEqual(withSetReps(item, [12, 10, 8, 8]).sets, 4, 'adding a set');
  assert.deepEqual(withSetReps(item, [15]), { ...item, sets: 1, reps: [15], rep_min: 15, rep_max: 15 });
  for (const t of STARTER_TEMPLATES) for (const i of t.items) assert.deepEqual(i.reps, DEFAULT_SET_REPS, `${t.id}: ${i.exercise_id}`);
});

test('step sizes follow the spec defaults, overridable per machine', () => {
  assert.equal(stepFor({ type: 'plate-loaded' }), 10);
  assert.equal(stepFor({ type: 'free weight' }), 5);
  assert.equal(stepFor({ type: 'selectorized', step_lb: 15 }), 15);
});

test('prefill: set 1 from last time; later sets keep today\'s weight', () => {
  const last = session('s1', 1, [[70, 8], [70, 8], [70, 7]]);
  assert.deepEqual(prefill(1, last, [], 6), { weight_lb: 70, reps: 8 });
  assert.deepEqual(prefill(3, last, [{ weight_lb: 70, reps: 9, set_number: 1 }, { weight_lb: 70, reps: 9, set_number: 2 }], 6), { weight_lb: 70, reps: 7 });
  assert.deepEqual(prefill(2, last, [{ weight_lb: 80, reps: 6, set_number: 1 }], 6), { weight_lb: 80, reps: 6 });
  assert.deepEqual(prefill(1, undefined, [], 6), { weight_lb: 0, reps: 6 });
  assert.deepEqual(prefill(5, last, [], 6), { weight_lb: 70, reps: 7 }, 'beyond last time -> its last set');
});

test('PRs need a prior session on the machine and must beat its best top set', () => {
  const prior = [session('s1', 1, [[70, 8], [70, 8]])];
  assert.equal(isPR([{ weight_lb: 70, reps: 9, set_number: 1 }], prior), true);
  assert.equal(isPR([{ weight_lb: 70, reps: 8, set_number: 1 }], prior), false);
  assert.equal(isPR([{ weight_lb: 200, reps: 1, set_number: 1 }], []), false, 'first session is a baseline');
});

test('groupBySession orders sessions newest first and sets by number', () => {
  const g = groupBySession([
    { session_id: 'a', logged_at: 10, weight_lb: 1, reps: 1, set_number: 2 },
    { session_id: 'b', logged_at: 50, weight_lb: 1, reps: 1, set_number: 1 },
    { session_id: 'a', logged_at: 5, weight_lb: 1, reps: 1, set_number: 1 },
  ]);
  assert.deepEqual(g.map(x => x.session_id), ['b', 'a']);
  assert.deepEqual(g[1].sets.map(s => s.set_number), [1, 2]);
});

test('recovery: primary 1.0, secondary 0.5, failure x1.5, linear decay over the window', () => {
  const now = 1_000 * H;
  const set = (exercise_id, hoursAgo, effort = null) => ({ exercise_id, effort, logged_at: now - hoursAgo * H });
  const settings = { recovery_hours_large: 72, recovery_hours_small: 48 };
  const s = fatigueScores([set('flat-press', 0), set('flat-press', 0, 'failure')], exById, now, settings);
  assert.equal(s.chest, 2.5);
  assert.equal(s.triceps, 1.25);
  const later = fatigueScores([set('flat-press', 36)], exById, now, settings);
  assert.equal(later.chest, 0.5, 'large muscle: half way through 72h');
  assert.equal(later.triceps, 0.125, 'small muscle: 36 of 48h');
  assert.equal(fatigueScores([set('flat-press', 80)], exById, now, settings).chest, 0);
});

test('recovery status thresholds and the one-third trim', () => {
  assert.equal(muscleStatus(6, 6), 'fatigued');
  assert.equal(muscleStatus(2, 6), 'recovering');
  assert.equal(muscleStatus(1.9, 6), 'fresh');
  assert.deepEqual([4, 3, 2, 1].map(trimmedSets), [3, 2, 1, 1]);
});

test('buildPlan trims only fatigued primaries, keeps order, and points at the next day for that muscle', () => {
  const scores = Object.fromEntries([...exById.values()].map(e => [e.primary_muscle, 0]));
  scores.chest = 9;
  const { plan, notes } = buildPlan(tById.get('push-a'), exById, eqById, scores, DEFAULT_SETTINGS, tById);
  assert.deepEqual(plan.map(p => p.exercise_id), STARTER_TEMPLATES[0].items.map(i => i.exercise_id));
  assert.deepEqual(plan.map(p => p.sets), [2, 2, 2, 3, 3]);
  assert.equal(plan[0].template_sets, 3);
  assert.deepEqual(plan[0].reps, [12, 10], 'a trimmed set count cuts the per-set targets with it');
  assert.deepEqual(plan[3].reps, [12, 10, 8]);
  assert.equal(plan[0].equipment_id, 'pl-incline');
  assert.equal(notes.length, 3);
  assert.equal(notes[0].later_template_id, 'push-b');
});

test('weekly sets per muscle count secondaries as half', () => {
  const v = setsPerMuscle([{ exercise_id: 'flat-press' }, { exercise_id: 'cable-fly' }, { exercise_id: 'nope' }], exById);
  assert.equal(v.chest, 2);
  assert.equal(v.front_delts, 1);
  assert.equal(v.triceps, 0.5);
});

test('no barbell squats or lunges anywhere; the hack squat is the one squat allowed', () => {
  const squatty = /^(?!hack).*squat|lunge|squat rack/i;
  for (const t of STARTER_TEMPLATES) for (const i of t.items) assert.doesNotMatch(exById.get(i.exercise_id).name, squatty, `${t.name}: ${i.exercise_id}`);
  for (const e of STARTER_EXERCISES) for (const id of e.equipment_options) assert.doesNotMatch(eqById.get(id).name, squatty, `${e.id} falls back to ${id}`);
});

test('upper body comes first: delts get real volume, legs only a hamstring block', () => {
  const week = STARTER_TEMPLATES.flatMap(t => t.items.flatMap(i => Array.from({ length: i.sets }, () => ({ exercise_id: i.exercise_id }))));
  const v = setsPerMuscle(week, exById);
  for (const m of ['side_delts', 'rear_delts']) assert.ok(v[m] >= 12, `${m}: ${v[m]}`);
  for (const m of ['chest', 'lats', 'upper_back', 'biceps', 'triceps']) assert.ok(v[m] >= 10, `${m}: ${v[m]}`);
  for (const m of ['quads', 'calves', 'adductors']) assert.equal(v[m], 0, `${m}: no quad/calf work in the starter days`);
  assert.ok(v.hamstrings > 0 && v.hamstrings <= 8, `hamstrings: ${v.hamstrings}`);
});

test('deadlifts never route to a barbell', () => {
  const bars = new Set(['power-rack', 'smith', 'bb-bench']);
  for (const e of STARTER_EXERCISES.filter(e => /deadlift|rdl/i.test(e.name + e.id))) {
    assert.ok(e.equipment_options.length > 0, e.id);
    for (const id of e.equipment_options) assert.ok(!bars.has(id), `${e.id} falls back to ${id}`);
  }
});

test('a ride to the gym adds leg fatigue, scaled by miles, decaying like sets', () => {
  const now = 1_000 * H;
  const settings = { recovery_hours_large: 72, recovery_hours_small: 48 };
  const five = fatigueScores([], exById, now, settings, [{ at: now, miles: 5 }]);
  assert.equal(five.quads, 1);
  assert.equal(five.glutes, 0.5);
  assert.equal(five.calves, 0.5);
  assert.equal(five.hamstrings, 0.25);
  assert.equal(five.chest, 0);
  assert.equal(fatigueScores([], exById, now, settings, [{ at: now, miles: 10 }]).quads, 2);
  assert.equal(fatigueScores([], exById, now, settings, [{ at: now - 36 * H, miles: 5 }]).quads, 0.5);
  // a ride every day for three days: recovering, never fatigued on its own
  const daily = [0, 24, 48].map(h => ({ at: now - h * H, miles: 5 }));
  assert.equal(muscleStatus(fatigueScores([], exById, now, settings, daily).quads, 6), 'recovering');
});

test('only sessions whose trip counted are trips; older ones without a mode were rides', () => {
  assert.deepEqual(
    tripsFrom([{ started_at: 1, biked_miles: 5 }, { started_at: 2, biked_miles: 0 }, { started_at: 3 }, { started_at: 4, biked_miles: 2, trip_mode: 'run' }]),
    [{ at: 1, miles: 5, mode: 'ride' }, { at: 4, miles: 2, mode: 'run' }],
  );
});

test('running loads the legs harder per mile than riding, walking much less', () => {
  const now = 1_000 * H;
  const settings = { recovery_hours_large: 72, recovery_hours_small: 48 };
  const legs = (mode) => fatigueScores([], exById, now, settings, [{ at: now, miles: 5, mode }]);
  const [ride, run, walk] = ['ride', 'run', 'walk'].map(legs);
  for (const m of ['quads', 'calves', 'hamstrings']) assert.ok(run[m] > ride[m] && ride[m] >= walk[m], m);
  assert.equal(run.chest + walk.chest, 0);
});
