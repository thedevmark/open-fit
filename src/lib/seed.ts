// Starter content: a typical big-gym floor (edit it to match yours while
// walking it), the exercises that use it, and the default split, five days
// a week. The split is upper-body focused: legs get one hamstring block,
// padded out with delts, and the quad and calf work (leg press, hack squat,
// leg extension, calf raises) waits in the library to be added in Program.
// Machine-first: no barbell squats, lunges or barbell deadlifts anywhere.

import type { DayTemplate, Equipment, EquipmentType, Exercise, Muscle, Settings, TemplateItem } from "./types";

function eq(id: string, name: string, type: EquipmentType, muscles: Muscle[]): Equipment {
  return { id, name, type, muscles, location_note: "", setup_note: "", available: true };
}

// A common commercial-gym lineup: Life Fitness cardio, Hammer Strength
// Select stacks and a Hammer Strength plate-loaded line, a Life Fitness dual
// adjustable pulley, a cable crossover with a pulldown bar, adjustable
// benches, dumbbell racks, plyo boxes. Names lead with the movement; rename
// anything that doesn't match your floor.
const HS = "Hammer Strength";

export const STARTER_EQUIPMENT: Equipment[] = [
  eq("pl-incline", `Incline press · ${HS}`, "plate-loaded", ["chest", "front_delts", "triceps"]),
  eq("pl-flat", `Chest press · ${HS}`, "plate-loaded", ["chest", "front_delts", "triceps"]),
  eq("sel-chest", `Chest press · ${HS} Select`, "selectorized", ["chest", "front_delts", "triceps"]),
  eq("bb-bench", "Flat bench press station", "free weight", ["chest", "front_delts", "triceps"]),
  eq("db", "Dumbbells + adjustable bench", "free weight", ["chest", "front_delts", "side_delts", "biceps", "triceps", "hamstrings", "traps"]),
  eq("smith", "Smith machine", "plate-loaded", ["chest", "front_delts", "glutes", "traps"]),
  eq("pec-deck", `Pec deck / rear delt fly · ${HS} Select`, "selectorized", ["chest", "rear_delts"]),
  eq("crossover", "Cable crossover + pulldown bar", "cable", ["chest", "triceps", "rear_delts", "abs", "lats"]),
  eq("dual-pulley", "Dual adjustable pulley · Life Fitness", "cable", ["chest", "triceps", "biceps", "side_delts", "rear_delts", "abs"]),
  eq("cable-col", "Single cable column", "cable", ["triceps", "biceps", "side_delts", "rear_delts", "abs"]),
  eq("dip", "Dip station", "bodyweight", ["chest", "triceps"]),
  eq("sel-shoulder", `Shoulder press · ${HS} Select`, "selectorized", ["front_delts", "side_delts", "triceps"]),
  eq("pl-shoulder", `Shoulder press · ${HS}`, "plate-loaded", ["front_delts", "side_delts", "triceps"]),
  eq("sel-lateral", `Lateral raise · ${HS} Select`, "selectorized", ["side_delts"]),
  eq("lat-pd", `Lat pulldown · ${HS} Select`, "selectorized", ["lats", "biceps", "upper_back"]),
  eq("assist-pull", "Assisted pull-up / dip", "selectorized", ["lats", "biceps", "chest", "triceps"]),
  eq("pullup-bar", "Pull-up bar", "bodyweight", ["lats", "biceps"]),
  eq("pl-row", `Iso-lateral row · ${HS}`, "plate-loaded", ["upper_back", "lats", "biceps", "rear_delts"]),
  eq("pl-high-row", `High row · ${HS}`, "plate-loaded", ["lats", "upper_back", "biceps"]),
  eq("cable-row", "Seated cable row", "cable", ["upper_back", "lats", "biceps"]),
  eq("tbar", "T-bar row", "plate-loaded", ["upper_back", "lats", "lower_back"]),
  eq("sel-preacher", `Preacher curl · ${HS} Select`, "selectorized", ["biceps"]),
  eq("power-rack", "Power rack + barbell", "free weight", ["hamstrings", "glutes", "lower_back", "traps"]),
  eq("hack", `Hack squat · ${HS}`, "plate-loaded", ["quads", "glutes"]),
  eq("leg-press", `Leg press · ${HS}`, "plate-loaded", ["quads", "glutes", "calves"]),
  eq("sel-leg-press", `Seated leg press · ${HS} Select`, "selectorized", ["quads", "glutes", "calves"]),
  eq("rdl-machine", "RDL machine", "plate-loaded", ["hamstrings", "glutes", "lower_back"]),
  eq("leg-ext", `Leg extension · ${HS} Select`, "selectorized", ["quads"]),
  eq("seated-curl", `Seated leg curl · ${HS} Select`, "selectorized", ["hamstrings"]),
  eq("lying-curl", `Lying leg curl · ${HS} Select`, "selectorized", ["hamstrings"]),
  eq("hip-thrust", "Glute drive / hip thrust", "plate-loaded", ["glutes", "hamstrings"]),
  eq("adductor", `Hip adductor · ${HS} Select`, "selectorized", ["adductors"]),
  eq("standing-calf", "Standing calf raise", "selectorized", ["calves"]),
  eq("seated-calf", "Seated calf raise", "plate-loaded", ["calves"]),
  eq("roman-chair", "Back extension bench", "bodyweight", ["lower_back", "glutes", "hamstrings"]),
  eq("ab-crunch", `Ab crunch · ${HS} Select`, "selectorized", ["abs"]),
  eq("plyo-box", "Plyo boxes (12 / 24 in)", "bodyweight", ["quads", "glutes", "calves"]),
  eq("treadmill", "Treadmill · Life Fitness", "cardio", []),
  eq("curve-tread", "Self-powered curved treadmill", "cardio", []),
  eq("upright-bike", "Upright bike · Life Fitness", "cardio", []),
  eq("recumbent-bike", "Recumbent bike · Life Fitness", "cardio", []),
  eq("stair-climber", "Stair climber", "cardio", []),
  eq("elliptical", "Elliptical cross-trainer", "cardio", []),
];

/** Starter machine names before the floor photos, for renaming untouched ones. */
const PAST_EQUIPMENT_NAMES: Record<string, string> = {
  "pl-incline": "Plate-loaded incline press",
  "pl-flat": "Plate-loaded chest press",
  "sel-chest": "Chest press machine",
  "pec-deck": "Pec deck / rear delt fly",
  crossover: "Cable crossover",
  "sel-shoulder": "Shoulder press machine",
  "pl-shoulder": "Plate-loaded shoulder press",
  "sel-lateral": "Lateral raise machine",
  "lat-pd": "Lat pulldown",
  "pl-row": "Chest-supported row (plate-loaded)",
  "pl-high-row": "High row (plate-loaded)",
  "sel-preacher": "Preacher curl machine",
  hack: "Hack squat",
  "leg-press": "Leg press",
  "sel-leg-press": "Seated leg press",
  "leg-ext": "Leg extension",
  "seated-curl": "Seated leg curl",
  "lying-curl": "Lying leg curl",
  adductor: "Hip adductor",
  "ab-crunch": "Ab crunch machine",
};

function ex(id: string, name: string, primary: Muscle, secondary: Muscle[], options: string[]): Exercise {
  return { id, name, primary_muscle: primary, secondary_muscles: secondary, equipment_options: options };
}

export const STARTER_EXERCISES: Exercise[] = [
  ex("incline-press", "Incline press", "chest", ["front_delts", "triceps"], ["pl-incline", "db", "smith"]),
  ex("flat-press", "Flat press", "chest", ["front_delts", "triceps"], ["pl-flat", "sel-chest", "bb-bench", "db"]),
  ex("cable-fly", "Cable fly", "chest", ["front_delts"], ["crossover", "dual-pulley", "pec-deck"]),
  ex("pec-fly", "Pec deck fly", "chest", ["front_delts"], ["pec-deck", "crossover"]),
  ex("dips", "Dips", "chest", ["triceps", "front_delts"], ["dip", "assist-pull"]),
  ex("shoulder-press", "Shoulder press", "front_delts", ["side_delts", "triceps"], ["sel-shoulder", "pl-shoulder", "db", "smith"]),
  ex("lateral-raise", "Lateral raise", "side_delts", [], ["sel-lateral", "cable-col", "dual-pulley", "db"]),
  ex("pushdown", "Triceps pushdown", "triceps", [], ["cable-col", "dual-pulley", "crossover"]),
  ex("oh-triceps", "Overhead triceps extension", "triceps", [], ["cable-col", "dual-pulley", "crossover", "db"]),
  ex("lat-pulldown", "Lat pulldown", "lats", ["biceps", "upper_back"], ["lat-pd", "crossover"]),
  ex("pullup", "Pull-up", "lats", ["biceps", "upper_back"], ["assist-pull", "pullup-bar", "lat-pd"]),
  ex("high-row", "High row", "lats", ["upper_back", "biceps"], ["pl-high-row", "lat-pd", "cable-col"]),
  ex("cs-row", "Chest-supported row", "upper_back", ["lats", "biceps", "rear_delts"], ["pl-row", "tbar", "cable-row", "db"]),
  ex("cable-row", "Seated cable row", "upper_back", ["lats", "biceps"], ["cable-row", "cable-col"]),
  ex("tbar-row", "T-bar row", "upper_back", ["lats", "lower_back", "biceps"], ["tbar", "pl-row", "cable-row"]),
  ex("rear-delt-fly", "Rear delt fly", "rear_delts", ["upper_back"], ["pec-deck", "crossover", "dual-pulley", "db"]),
  ex("face-pull", "Face pull", "rear_delts", ["upper_back", "traps"], ["cable-col", "dual-pulley", "crossover"]),
  ex("shrug", "Shrug", "traps", [], ["db", "smith", "power-rack"]),
  ex("preacher-curl", "Preacher curl", "biceps", ["forearms"], ["sel-preacher", "cable-col", "dual-pulley", "db"]),
  ex("hammer-curl", "Hammer curl", "biceps", ["forearms"], ["db", "cable-col", "dual-pulley"]),
  ex("hack-squat", "Hack squat", "quads", ["glutes", "adductors"], ["hack", "leg-press", "sel-leg-press"]),
  ex("leg-press", "Leg press", "quads", ["glutes", "adductors"], ["leg-press", "hack", "sel-leg-press"]),
  ex("sl-leg-press", "Single-leg leg press", "quads", ["glutes"], ["leg-press", "sel-leg-press"]),
  ex("leg-ext", "Leg extension", "quads", [], ["leg-ext"]),
  // Never a barbell: machine first, dumbbells if it's taken.
  ex("rdl", "Romanian deadlift", "hamstrings", ["glutes", "lower_back"], ["rdl-machine", "db"]),
  ex("seated-curl", "Seated leg curl", "hamstrings", [], ["seated-curl", "lying-curl"]),
  ex("lying-curl", "Lying leg curl", "hamstrings", [], ["lying-curl", "seated-curl"]),
  ex("hip-thrust", "Hip thrust", "glutes", ["hamstrings"], ["hip-thrust", "smith", "power-rack"]),
  ex("adduction", "Hip adduction", "adductors", [], ["adductor", "cable-col", "dual-pulley"]),
  ex("standing-calf", "Standing calf raise", "calves", [], ["standing-calf", "leg-press", "sel-leg-press", "smith"]),
  ex("seated-calf", "Seated calf raise", "calves", [], ["seated-calf", "standing-calf"]),
  ex("cable-crunch", "Cable crunch", "abs", [], ["cable-col", "ab-crunch", "dual-pulley", "crossover"]),
  ex("back-ext", "Back extension", "lower_back", ["glutes", "hamstrings"], ["roman-chair"]),
];

// Every exercise defaults to three sets of 12 / 10 / 8, heavier each set
// (logic's DEFAULT_SET_REPS; a literal here so tests can load this file bare).
function it(exercise_id: string, rest_sec = 120): TemplateItem {
  return { exercise_id, sets: 3, rep_min: 8, rep_max: 12, rest_sec, reps: [12, 10, 8] };
}

export const STARTER_TEMPLATES: DayTemplate[] = [
  {
    id: "push-a", name: "Chest + Triceps", order_in_split: 0, items: [
      it("incline-press", 150),
      it("flat-press", 120),
      it("cable-fly", 90),
      it("lateral-raise", 60),
      it("pushdown", 75),
    ],
  },
  {
    id: "pull-a", name: "Back + Biceps", order_in_split: 1, items: [
      it("lat-pulldown", 120),
      it("cs-row", 120),
      it("cable-row", 90),
      it("rear-delt-fly", 60),
      it("preacher-curl", 75),
    ],
  },
  {
    // The old arms + delts day folded in here: its face pulls keep rear delts at volume.
    id: "legs-delts", name: "Hamstrings + Delts", order_in_split: 2, items: [
      it("rdl", 150),
      it("seated-curl", 90),
      it("lateral-raise", 60),
      it("rear-delt-fly", 60),
      it("face-pull", 60),
      it("cable-crunch", 60),
    ],
  },
  {
    id: "push-b", name: "Shoulders + Chest", order_in_split: 3, items: [
      it("shoulder-press", 150),
      it("incline-press", 120),
      it("pec-fly", 90),
      it("dips", 90),
      it("oh-triceps", 75),
      it("lateral-raise", 60),
    ],
  },
  {
    // Lateral raises on four days: at three sets each that keeps side delts at 12+ a week.
    id: "pull-b", name: "Back + Traps", order_in_split: 4, items: [
      it("pullup", 150),
      it("high-row", 120),
      it("tbar-row", 120),
      it("face-pull", 60),
      it("hammer-curl", 75),
      it("shrug", 60),
      it("lateral-raise", 60),
    ],
  },
];

// Earlier starters, as `exercise xSets` per day: the first seven-day split
// and the first five-day one (rep ranges, 4-set lead lifts).
const LEGACY_SPLIT = ["push-a", "pull-a", "legs-delts", "push-b", "pull-b", "arms-delts", "light"];
const PAST_DAYS: Record<string, { names: string[]; items: string[] }> = {
  "push-a": { names: ["Push A"], items: ["incline-press x4,flat-press x3,cable-fly x3,lateral-raise x3,pushdown x3"] },
  "pull-a": { names: ["Pull A"], items: ["lat-pulldown x4,cs-row x3,cable-row x3,rear-delt-fly x3,preacher-curl x3"] },
  "legs-delts": {
    names: ["Legs + Delts"],
    items: [
      "rdl x3,seated-curl x3,lateral-raise x3,rear-delt-fly x3,cable-crunch x3",
      "rdl x3,seated-curl x3,lateral-raise x3,rear-delt-fly x3,face-pull x3,cable-crunch x3",
    ],
  },
  "push-b": {
    names: ["Push B"],
    items: [
      "shoulder-press x4,incline-press x3,pec-fly x3,dips x3,oh-triceps x3,lateral-raise x3",
      "shoulder-press x4,incline-press x3,pec-fly x3,dips x3,oh-triceps x3,lateral-raise x4",
    ],
  },
  "pull-b": { names: ["Pull B"], items: ["pullup x4,high-row x3,tbar-row x3,face-pull x3,hammer-curl x3,shrug x3"] },
};

const signature = (t: Pick<DayTemplate, "items">) =>
  t.items.map((i) => `${i.exercise_id} x${i.sets}${i.reps ? `@${i.reps.join("/")}` : ""}`).join(",");

/**
 * Bring a device on an earlier starter up to the current one. A day keeps
 * any name or exercises you changed; a day still exactly as an earlier
 * starter shipped it gets the current name and exercises. The seven-day
 * split's two dropped days stay as templates (their history points at
 * them), just out of the rotation. Returns null when there is nothing to do.
 */
export function upgradeStarter(
  templates: readonly DayTemplate[],
  settings: Pick<Settings, "split_order" | "current_position">,
): { templates: DayTemplate[]; settings: Pick<Settings, "split_order" | "current_position"> | null } | null {
  const fresh = new Map(STARTER_TEMPLATES.map((t) => [t.id, t]));
  const changed: DayTemplate[] = [];
  for (const t of templates) {
    const past = PAST_DAYS[t.id];
    const next = fresh.get(t.id);
    if (!past || !next) continue;
    const name = past.names.includes(t.name) ? next.name : t.name;
    const items = past.items.includes(signature(t)) ? next.items : t.items;
    if (name !== t.name || items !== t.items) changed.push({ ...t, name, items });
  }

  let split: Pick<Settings, "split_order" | "current_position"> | null = null;
  if (settings.split_order.join() === LEGACY_SPLIT.join()) {
    const split_order = STARTER_TEMPLATES.map((t) => t.id);
    const current = settings.split_order[settings.current_position % LEGACY_SPLIT.length];
    const keep = split_order.indexOf(current);
    split = { split_order, current_position: keep >= 0 ? keep : 0 };
  }

  return changed.length || split ? { templates: changed, settings: split } : null;
}

/**
 * Bring a starter machine library up to the current one: add machines the
 * starter gained, rename ones still carrying an earlier starter name, and
 * link exercises to machines that are new since they were seeded. A library
 * started empty (no starter machines) is left alone, as is anything edited.
 */
export function upgradeLibrary(
  equipment: readonly Equipment[],
  exercises: readonly Exercise[],
): { equipment: Equipment[]; exercises: Exercise[] } | null {
  const have = new Map(equipment.map((e) => [e.id, e]));
  if (!STARTER_EQUIPMENT.some((e) => have.has(e.id))) return null;

  const added = STARTER_EQUIPMENT.filter((e) => !have.has(e.id));
  const addedIds = new Set(added.map((e) => e.id));
  const outEq: Equipment[] = [...added];
  for (const fresh of STARTER_EQUIPMENT) {
    const e = have.get(fresh.id);
    if (!e || PAST_EQUIPMENT_NAMES[e.id] !== e.name) continue;
    outEq.push({ ...e, name: fresh.name, location_note: e.location_note || fresh.location_note });
  }

  const starterEx = new Map(STARTER_EXERCISES.map((x) => [x.id, x]));
  const outEx: Exercise[] = [];
  for (const x of exercises) {
    const fresh = starterEx.get(x.id);
    const missing = fresh?.equipment_options.filter((id) => addedIds.has(id) && !x.equipment_options.includes(id)) ?? [];
    if (missing.length) outEx.push({ ...x, equipment_options: [...x.equipment_options, ...missing] });
  }

  return outEq.length || outEx.length ? { equipment: outEq, exercises: outEx } : null;
}

export const DEFAULT_SETTINGS: Settings = {
  id: "settings",
  split_order: STARTER_TEMPLATES.map((t) => t.id),
  current_position: 0,
  cycle_done: [],
  default_rest_sec: 120,
  recovery_hours_large: 72,
  recovery_hours_small: 48,
  fatigue_threshold: 6,
  club_name: "My gym",
  setup_done: false,
};
