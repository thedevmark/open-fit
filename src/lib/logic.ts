// Pure training logic for /fit: rotation, machine resolution, double
// progression, PRs, recovery scores, and weekly volume. No IndexedDB, no
// React — tests/fitLogic.test.mjs imports this file directly, so keep
// imports type-only.

import type {
  DayTemplate,
  Effort,
  Equipment,
  EquipmentType,
  Exercise,
  Muscle,
  PlanItem,
  SetLog,
  Settings,
  TemplateItem,
  TripMode,
} from "./types";

// ── Muscles ──────────────────────────────────────────────────────────

export const MUSCLES: Muscle[] = [
  "chest", "front_delts", "side_delts", "rear_delts", "lats", "upper_back", "traps", "lower_back",
  "biceps", "triceps", "forearms", "abs", "glutes", "quads", "hamstrings", "adductors", "calves",
];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: "Chest",
  front_delts: "Front delts",
  side_delts: "Side delts",
  rear_delts: "Rear delts",
  lats: "Lats",
  upper_back: "Upper back",
  traps: "Traps",
  lower_back: "Lower back",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  adductors: "Adductors",
  calves: "Calves",
};

/** Large muscles recover on `recovery_hours_large`, the rest on `recovery_hours_small`. */
export const LARGE_MUSCLES: ReadonlySet<Muscle> = new Set<Muscle>([
  "chest", "lats", "upper_back", "lower_back", "glutes", "quads", "hamstrings",
]);

export const EQUIPMENT_TYPES: EquipmentType[] = ["plate-loaded", "selectorized", "cable", "free weight", "bodyweight", "cardio"];

/** One progression step per equipment type: plate-loaded 5 lb/side (logged as total), 1 pin, 1 cable plate, 5 lb dumbbells. */
export const DEFAULT_STEP_LB: Record<EquipmentType, number> = {
  "plate-loaded": 10,
  selectorized: 10,
  cable: 5,
  "free weight": 5,
  bodyweight: 0,
  cardio: 0,
};

export function stepFor(eq: Pick<Equipment, "type" | "step_lb"> | undefined): number {
  if (!eq) return 5;
  return typeof eq.step_lb === "number" && eq.step_lb >= 0 ? eq.step_lb : DEFAULT_STEP_LB[eq.type];
}

// ── Rotation ─────────────────────────────────────────────────────────

type Rotation = Pick<Settings, "split_order" | "current_position" | "cycle_done">;

/**
 * Template id that is up next: the first day from the current slot onward
 * not yet done this round. Skipped days never advance this.
 */
export function currentTemplateId(settings: Rotation): string | null {
  const order = settings.split_order;
  if (order.length === 0) return null;
  const pos = ((settings.current_position % order.length) + order.length) % order.length;
  const done = settings.cycle_done ?? [];
  for (let i = 0; i < order.length; i++) {
    const id = order[(pos + i) % order.length];
    if (!done.includes(id)) return id;
  }
  return order[pos];
}

/**
 * Rotation after finishing a day. Days go in any order: each one is checked
 * off for the round, and one you jumped past stays next until you do it.
 * Doing the day that was up moves the slot one step; once every day in the
 * split is done the round resets. A day outside the split leaves it alone.
 */
export function afterTraining(settings: Rotation, templateId: string): Pick<Settings, "current_position" | "cycle_done"> {
  const order = settings.split_order;
  const done = (settings.cycle_done ?? []).filter((id) => order.includes(id));
  const idx = order.indexOf(templateId);
  if (idx < 0) return { current_position: settings.current_position, cycle_done: done };
  const cycle_done = done.includes(templateId) ? done : [...done, templateId];
  if (order.every((id) => cycle_done.includes(id))) return { current_position: (idx + 1) % order.length, cycle_done: [] };
  const wasNext = currentTemplateId(settings) === templateId;
  return { current_position: wasNext ? (idx + 1) % order.length : settings.current_position, cycle_done };
}

// ── Machine resolution ───────────────────────────────────────────────

/** First available equipment option for an exercise, skipping `exclude`. */
export function resolveEquipment(
  exercise: Pick<Exercise, "equipment_options">,
  equipmentById: ReadonlyMap<string, Pick<Equipment, "available">>,
  exclude: readonly string[] = [],
): string | null {
  for (const id of exercise.equipment_options) {
    const eq = equipmentById.get(id);
    if (eq && eq.available && !exclude.includes(id)) return id;
  }
  return null;
}

/** Template exercises that resolve to no machine at this club. */
export function unmappedExercises(
  templates: readonly DayTemplate[],
  exercisesById: ReadonlyMap<string, Exercise>,
  equipmentById: ReadonlyMap<string, Pick<Equipment, "available">>,
): { exercise_id: string; templates: string[] }[] {
  const out = new Map<string, string[]>();
  for (const t of templates) {
    for (const item of t.items) {
      const ex = exercisesById.get(item.exercise_id);
      if (ex && resolveEquipment(ex, equipmentById)) continue;
      const list = out.get(item.exercise_id) ?? [];
      if (!list.includes(t.name)) list.push(t.name);
      out.set(item.exercise_id, list);
    }
  }
  return [...out].map(([exercise_id, names]) => ({ exercise_id, templates: names }));
}

// ── Recovery ─────────────────────────────────────────────────────────

export type MuscleStatus = "fresh" | "recovering" | "fatigued";

const EFFORT_MULT: Record<Effort, number> = { easy: 0.5, solid: 1, failure: 1.5 };

// ── The trip to the gym ──────────────────────────────────────────────

export const TRIP_MODES: TripMode[] = ["ride", "run", "walk"];

export const TRIP_WORDS: Record<TripMode, { option: string; question: string; past: string; miles: number }> = {
  ride: { option: "Rode", question: "Rode here?", past: "rode", miles: 5 },
  run: { option: "Ran", question: "Ran here?", past: "ran", miles: 2 },
  walk: { option: "Walked", question: "Walked here?", past: "walked", miles: 1 },
};

/**
 * Leg fatigue from 5 miles of getting to the gym, scaled by distance. An
 * easy ride is about one set's worth for the quads: enough that a daily
 * commute shows up as "recovering", never enough on its own to trim a day.
 * Running loads the legs far harder per mile; walking far less.
 */
export const TRIP_FATIGUE_PER_5_MI: Record<TripMode, Partial<Record<Muscle, number>>> = {
  ride: { quads: 1, glutes: 0.5, calves: 0.5, hamstrings: 0.25 },
  run: { quads: 1.5, calves: 2, hamstrings: 1, glutes: 1 },
  walk: { calves: 0.5, quads: 0.25, glutes: 0.25, hamstrings: 0.25 },
};

/** Muscles the trip trains, so the weekly view doesn't call them "under". */
export const TRIP_MUSCLES: ReadonlySet<Muscle> = new Set<Muscle>(["quads", "glutes", "calves"]);

export interface Trip {
  at: number;
  miles: number;
  /** Missing on sessions from before running and walking existed: those were rides. */
  mode?: TripMode;
}

/** Counting the trip is on unless turned off; data from before the switch existed had it on. */
export function tripsOn(settings: Pick<Settings, "ride_tracking">): boolean {
  return settings.ride_tracking ?? true;
}

/** Trips recorded on sessions ("Rode here?", "Ran here?", …). */
export function tripsFrom(sessions: readonly { started_at: number; biked_miles?: number; trip_mode?: TripMode }[]): Trip[] {
  return sessions
    .filter((s) => (s.biked_miles ?? 0) > 0)
    .map((s) => ({ at: s.started_at, miles: s.biked_miles!, mode: s.trip_mode ?? "ride" }));
}

/**
 * Fatigue per muscle: each set adds 1.0 to its primary muscle and 0.5 to
 * each secondary, x1.5 if tagged failure (x0.5 if tagged easy), decaying
 * linearly to 0 over the muscle's recovery window. Trips to the gym add leg
 * fatigue per TRIP_FATIGUE_PER_5_MI.
 */
export function fatigueScores(
  sets: readonly Pick<SetLog, "exercise_id" | "effort" | "logged_at">[],
  exercisesById: ReadonlyMap<string, Pick<Exercise, "primary_muscle" | "secondary_muscles">>,
  now: number,
  settings: Pick<Settings, "recovery_hours_large" | "recovery_hours_small">,
  trips: readonly Trip[] = [],
): Record<Muscle, number> {
  const scores = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  const add = (m: Muscle, amount: number, hours: number) => {
    const window = LARGE_MUSCLES.has(m) ? settings.recovery_hours_large : settings.recovery_hours_small;
    if (window <= 0) return;
    const left = 1 - Math.max(0, hours) / window;
    if (left > 0) scores[m] += amount * left;
  };
  for (const s of sets) {
    const ex = exercisesById.get(s.exercise_id);
    if (!ex) continue;
    const mult = s.effort ? EFFORT_MULT[s.effort] : 1;
    const hours = (now - s.logged_at) / 3_600_000;
    add(ex.primary_muscle, mult, hours);
    for (const m of ex.secondary_muscles) if (m !== ex.primary_muscle) add(m, 0.5 * mult, hours);
  }
  for (const r of trips) {
    const hours = (now - r.at) / 3_600_000;
    for (const [m, per5] of Object.entries(TRIP_FATIGUE_PER_5_MI[r.mode ?? "ride"]) as [Muscle, number][]) add(m, (per5 * r.miles) / 5, hours);
  }
  return scores;
}

/** At or above the threshold is fatigued; a third of it or more is recovering. */
export function muscleStatus(score: number, threshold: number): MuscleStatus {
  if (score >= threshold) return "fatigued";
  if (score >= threshold / 3) return "recovering";
  return "fresh";
}

/** Fatigued muscle: drop a third of the sets, never below one. */
export function trimmedSets(sets: number): number {
  return Math.max(1, Math.round((sets * 2) / 3));
}

export interface PlanNote {
  exercise_id: string;
  muscle: Muscle;
  from: number;
  to: number;
  /** Next day in the rotation that trains this muscle again, if any. */
  later_template_id: string | null;
}

/**
 * Today's plan from the template: every exercise resolved to a machine and
 * fatigued primary muscles trimmed by a third. Order and day stay as the
 * template says — the split is in charge.
 */
export function buildPlan(
  template: DayTemplate,
  exercisesById: ReadonlyMap<string, Exercise>,
  equipmentById: ReadonlyMap<string, Pick<Equipment, "available">>,
  scores: Record<Muscle, number>,
  settings: Pick<Settings, "fatigue_threshold" | "split_order">,
  templatesById: ReadonlyMap<string, DayTemplate>,
): { plan: PlanItem[]; notes: PlanNote[] } {
  const notes: PlanNote[] = [];
  const plan = template.items.map((item): PlanItem => {
    const ex = exercisesById.get(item.exercise_id);
    let sets = item.sets;
    if (ex && muscleStatus(scores[ex.primary_muscle] ?? 0, settings.fatigue_threshold) === "fatigued") {
      sets = trimmedSets(item.sets);
      if (sets !== item.sets) {
        notes.push({
          exercise_id: item.exercise_id,
          muscle: ex.primary_muscle,
          from: item.sets,
          to: sets,
          later_template_id: nextTemplateTraining(ex.primary_muscle, template.id, settings.split_order, templatesById, exercisesById),
        });
      }
    }
    return {
      exercise_id: item.exercise_id,
      equipment_id: ex ? resolveEquipment(ex, equipmentById) : null,
      sets,
      template_sets: item.sets,
      rep_min: item.rep_min,
      rep_max: item.rep_max,
      rest_sec: item.rest_sec,
      ...(item.reps ? { reps: item.reps.slice(0, sets) } : {}),
      taken: [],
    };
  });
  return { plan, notes };
}

function nextTemplateTraining(
  muscle: Muscle,
  fromTemplateId: string,
  order: readonly string[],
  templatesById: ReadonlyMap<string, DayTemplate>,
  exercisesById: ReadonlyMap<string, Exercise>,
): string | null {
  const start = order.indexOf(fromTemplateId);
  if (start < 0) return null;
  for (let i = 1; i < order.length; i++) {
    const t = templatesById.get(order[(start + i) % order.length]);
    if (t?.items.some((it) => exercisesById.get(it.exercise_id)?.primary_muscle === muscle)) return t.id;
  }
  return null;
}

// ── History grouping ─────────────────────────────────────────────────

export interface SetLite {
  weight_lb: number;
  reps: number;
  set_number: number;
}

export interface PastSession {
  session_id: string;
  at: number;
  sets: SetLite[];
}

/** Group set logs by session, most recent session first, sets in order. */
export function groupBySession(
  sets: readonly Pick<SetLog, "session_id" | "logged_at" | "weight_lb" | "reps" | "set_number">[],
): PastSession[] {
  const by = new Map<string, PastSession>();
  for (const s of sets) {
    const g = by.get(s.session_id) ?? { session_id: s.session_id, at: 0, sets: [] };
    g.at = Math.max(g.at, s.logged_at);
    g.sets.push({ weight_lb: s.weight_lb, reps: s.reps, set_number: s.set_number });
    by.set(s.session_id, g);
  }
  const out = [...by.values()];
  for (const g of out) g.sets.sort((a, b) => a.set_number - b.set_number);
  return out.sort((a, b) => b.at - a.at);
}

// ── Progression (double progression) ────────────────────────────────

export type ProgressionRule = "weight_up" | "add_rep" | "weight_down";

export interface Suggestion {
  weight_lb: number;
  /** Target weight per planned set, set 1 first. All equal except on per-set targets. */
  weights: number[];
  /** Target reps per planned set, set 1 first. */
  reps: number[];
  rule: ProgressionRule;
  reason: string;
}

function topWeight(sets: readonly SetLite[]): number {
  return sets.reduce((m, s) => Math.max(m, s.weight_lb), 0);
}

function workingSets(sets: readonly SetLite[]): SetLite[] {
  const w = topWeight(sets);
  return sets.filter((s) => s.weight_lb === w);
}

function belowRange(session: PastSession, repMin: number): boolean {
  const work = workingSets(session.sets);
  return work.length > 0 && Math.max(...work.map((s) => s.reps)) < repMin;
}

/**
 * Next target from history on this exercise + machine (most recent first).
 * 1. no history → null (first session is the baseline)
 * 2. below rep_min two sessions running → one step down, rep_min
 * 3. every working set at rep_max → one step up, rep_min
 * 4. otherwise → same weight, +1 rep on the weakest set
 */
export function suggestNext(
  history: readonly PastSession[],
  target: { sets: number; rep_min: number; rep_max: number },
  step: number,
): Suggestion | null {
  const last = history[0];
  if (!last || last.sets.length === 0) return null;
  const weight = topWeight(last.sets);
  const work = workingSets(last.sets);
  const n = Math.max(1, target.sets);
  const fill = (r: number) => Array.from({ length: n }, () => r);
  const at = (w: number) => ({ weight_lb: w, weights: fill(w) });

  const prev = history[1];
  if (prev && belowRange(last, target.rep_min) && belowRange(prev, target.rep_min) && step > 0 && weight > 0) {
    return {
      ...at(Math.max(0, weight - step)),
      reps: fill(target.rep_min),
      rule: "weight_down",
      reason: `Under ${target.rep_min} reps two sessions running — drop ${step} lb`,
    };
  }

  if (step > 0 && work.every((s) => s.reps >= target.rep_max)) {
    return {
      ...at(weight + step),
      reps: fill(target.rep_min),
      rule: "weight_up",
      reason: `All sets hit ${target.rep_max} — add ${step} lb`,
    };
  }

  const lastReps = work.map((s) => s.reps);
  const floor = lastReps.length ? Math.min(...lastReps) : target.rep_min;
  const reps = Array.from({ length: n }, (_, i) => lastReps[i] ?? floor);
  let weakest = 0;
  for (let i = 1; i < reps.length; i++) if (reps[i] < reps[weakest]) weakest = i;
  // Bodyweight with no step: there's nowhere to go but reps, so no rep_max cap.
  const cap = step > 0 ? target.rep_max : Infinity;
  reps[weakest] = Math.min(cap, reps[weakest] + 1);
  return {
    ...at(weight),
    reps,
    rule: "add_rep",
    reason: `Same weight — +1 rep on set ${weakest + 1}`,
  };
}

/** The default per-set scheme: three sets, heavier each set. */
export const DEFAULT_SET_REPS = [12, 10, 8];

/** An item with per-set rep targets, keeping sets / rep_min / rep_max in step. */
export function withSetReps<T extends Pick<TemplateItem, "sets" | "rep_min" | "rep_max" | "reps">>(item: T, reps: readonly number[]): T {
  const r = reps.length ? [...reps] : [item.rep_min];
  return { ...item, reps: r, sets: r.length, rep_min: Math.min(...r), rep_max: Math.max(...r) };
}

/**
 * Per-set targets (12 / 10 / 8, heavier each set): every set progresses on
 * its own against the same set number last session.
 * 1. no history → null (first session is the baseline)
 * 2. hit the set's target → that set goes up one step
 * 3. 3+ reps short at the same weight two sessions running → one step down
 * 4. otherwise → same weight, chase the target
 * A set with no history follows the set before it.
 */
export function suggestPerSet(history: readonly PastSession[], targets: readonly number[], step: number): Suggestion | null {
  const last = history[0];
  if (!last || last.sets.length === 0 || targets.length === 0) return null;
  const bySet = (s: PastSession | undefined, n: number) => s?.sets.find((x) => x.set_number === n);
  const weights: number[] = [];
  const up: number[] = [];
  const down: number[] = [];
  targets.forEach((t, i) => {
    const l = bySet(last, i + 1);
    if (!l) {
      weights.push(weights[i - 1] ?? topWeight(last.sets));
      return;
    }
    const p = bySet(history[1], i + 1);
    if (step > 0 && l.weight_lb > 0 && l.reps <= t - 3 && p && p.weight_lb === l.weight_lb && p.reps <= t - 3) {
      weights.push(Math.max(0, l.weight_lb - step));
      down.push(i + 1);
    } else if (step > 0 && l.reps >= t) {
      weights.push(l.weight_lb + step);
      up.push(i + 1);
    } else {
      weights.push(l.weight_lb);
    }
  });
  const sets = (n: number[]) => (n.length === 1 ? `set ${n[0]}` : `sets ${n.join(", ")}`);
  const parts = [
    up.length ? `${sets(up)} hit target — add ${step} lb` : "",
    down.length ? `${sets(down)} short twice — drop ${step} lb` : "",
  ].filter(Boolean);
  const reason = parts.length ? parts.join(" · ") : "same weights — chase the target reps";
  return {
    weight_lb: weights[0],
    weights,
    reps: [...targets],
    rule: down.length ? "weight_down" : up.length ? "weight_up" : "add_rep",
    reason: reason[0].toUpperCase() + reason.slice(1),
  };
}

/**
 * Stepper values for set `setNumber` (1-based). Set 1 comes from last
 * session; later sets keep the weight you're using today and take reps
 * from last session's matching set when the weight matches.
 */
export function prefill(
  setNumber: number,
  lastSession: PastSession | undefined,
  todaySets: readonly SetLite[],
  repMin: number,
): { weight_lb: number; reps: number } {
  const lastSame = lastSession?.sets.find((s) => s.set_number === setNumber)
    ?? lastSession?.sets[setNumber - 1];
  const prevToday = todaySets[todaySets.length - 1];
  if (prevToday) {
    const reps = lastSame && lastSame.weight_lb === prevToday.weight_lb ? lastSame.reps : prevToday.reps;
    return { weight_lb: prevToday.weight_lb, reps };
  }
  if (lastSame) return { weight_lb: lastSame.weight_lb, reps: lastSame.reps };
  const tail = lastSession?.sets[lastSession.sets.length - 1];
  if (tail) return { weight_lb: tail.weight_lb, reps: tail.reps };
  return { weight_lb: 0, reps: repMin };
}

// ── PRs and top sets ─────────────────────────────────────────────────

/** Epley estimate; reps alone for unloaded sets. Used to rank sets. */
export function setScore(s: Pick<SetLite, "weight_lb" | "reps">): number {
  if (s.weight_lb <= 0) return s.reps;
  return s.weight_lb * (1 + s.reps / 30);
}

export function topSet<T extends Pick<SetLite, "weight_lb" | "reps">>(sets: readonly T[]): T | null {
  let best: T | null = null;
  for (const s of sets) if (!best || setScore(s) > setScore(best)) best = s;
  return best;
}

/** PR when today's top set beats every prior session on this machine. No prior = baseline, not a PR. */
export function isPR(today: readonly SetLite[], prior: readonly PastSession[]): boolean {
  const top = topSet(today);
  if (!top || prior.length === 0) return false;
  const priorBest = Math.max(...prior.map((p) => {
    const t = topSet(p.sets);
    return t ? setScore(t) : 0;
  }));
  return setScore(top) > priorBest;
}

// ── Weekly volume ────────────────────────────────────────────────────

/** Hard sets per muscle: primary counts 1, each secondary ½. */
export function setsPerMuscle(
  sets: readonly Pick<SetLog, "exercise_id">[],
  exercisesById: ReadonlyMap<string, Pick<Exercise, "primary_muscle" | "secondary_muscles">>,
): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const s of sets) {
    const ex = exercisesById.get(s.exercise_id);
    if (!ex) continue;
    out[ex.primary_muscle] += 1;
    for (const m of ex.secondary_muscles) if (m !== ex.primary_muscle) out[m] += 0.5;
  }
  return out;
}

/** Monday 00:00 local of the week containing `t`. */
export function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export function localDate(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
