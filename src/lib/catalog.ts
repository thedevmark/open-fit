// A catalog of common commercial-gym machines, so adding one is "type a few
// letters from the sticker, tap". Each entry knows its type, the muscles it
// works and the exercises it can do, so it arrives already linked.
//
// Entries are machine families, not exact models: the keywords carry the
// brand line names people see on stickers (Hammer Strength Select / MTS /
// Iso-Lateral, Life Fitness Signature / Insignia / Optima, Matrix Ultra /
// Aura / Versa, Technogym Selection / Pure Strength, Cybex Eagle / Prestige,
// Precor Discovery, Nautilus Impact / Inspiration…).
//
// No IndexedDB and no runtime imports (tests load this file directly);
// lib/fit/db.ts applies what planMachineAdds returns.

import type { Equipment, EquipmentType, Exercise, Muscle } from "./types";

/** An exercise a machine brings with it, created if the library doesn't have it. */
type NewExercise = Pick<Exercise, "id" | "name" | "primary_muscle" | "secondary_muscles">;

export interface CatalogMachine {
  id: string;
  name: string;
  type: EquipmentType;
  muscles: Muscle[];
  /** Exercise ids this machine serves, in the library or in `adds`. */
  exercises: string[];
  /** The starter machine this is, if any: adding it renames that one instead of duplicating it. */
  same_as?: string;
  /** Exercises to create if missing. */
  adds?: NewExercise[];
  keywords: string;
  group: CatalogGroup;
}

export type CatalogGroup = "Chest" | "Shoulders" | "Back" | "Arms" | "Legs" | "Core" | "Cables & free weights" | "Cardio";
export const CATALOG_GROUPS: CatalogGroup[] = ["Chest", "Shoulders", "Back", "Arms", "Legs", "Core", "Cables & free weights", "Cardio"];

const PIN = "pin-loaded selectorized stack hammer strength select mts life fitness signature insignia optima matrix ultra aura versa technogym selection precor discovery cybex eagle prestige vr1 nautilus impact inspiration star trac instinct";
const PLATE = "plate-loaded plate loaded hammer strength iso-lateral iso lateral ground base life fitness pro2 matrix magnum technogym pure strength cybex plate nautilus xpload panatta gym80 arsenal";

const NEW = {
  pullover: { id: "pullover", name: "Pullover", primary_muscle: "lats", secondary_muscles: ["chest", "triceps"] },
  tricepsMachine: { id: "triceps-machine", name: "Triceps extension machine", primary_muscle: "triceps", secondary_muscles: [] },
  kickback: { id: "glute-kickback", name: "Glute kickback", primary_muscle: "glutes", secondary_muscles: ["hamstrings"] },
  abduction: { id: "abduction", name: "Hip abduction", primary_muscle: "glutes", secondary_muscles: [] },
  rotary: { id: "rotary-torso", name: "Rotary torso", primary_muscle: "abs", secondary_muscles: [] },
  kneeRaise: { id: "knee-raise", name: "Hanging knee raise", primary_muscle: "abs", secondary_muscles: ["forearms"] },
} satisfies Record<string, NewExercise>;

const m = (
  group: CatalogGroup, id: string, name: string, type: EquipmentType, muscles: Muscle[], exercises: string[], keywords: string,
  extra: Partial<Pick<CatalogMachine, "same_as" | "adds">> = {},
): CatalogMachine => ({ group, id, name, type, muscles, exercises, keywords, ...extra });

export const CATALOG: CatalogMachine[] = [
  // Chest
  m("Chest", "cat-chest-press-pin", "Chest press (pin-loaded)", "selectorized", ["chest", "front_delts", "triceps"], ["flat-press"], `chest press seated bench ${PIN}`, { same_as: "sel-chest" }),
  m("Chest", "cat-incline-press-pin", "Incline chest press (pin-loaded)", "selectorized", ["chest", "front_delts", "triceps"], ["incline-press"], `incline chest press upper ${PIN}`),
  m("Chest", "cat-chest-press-plate", "Chest press (plate-loaded)", "plate-loaded", ["chest", "front_delts", "triceps"], ["flat-press"], `chest press bench press wide chest ${PLATE}`, { same_as: "pl-flat" }),
  m("Chest", "cat-incline-press-plate", "Incline press (plate-loaded)", "plate-loaded", ["chest", "front_delts", "triceps"], ["incline-press"], `incline press upper chest ${PLATE}`, { same_as: "pl-incline" }),
  m("Chest", "cat-decline-press-plate", "Decline press (plate-loaded)", "plate-loaded", ["chest", "triceps"], ["flat-press"], `decline press lower chest ${PLATE}`),
  m("Chest", "cat-pec-deck", "Pec deck / rear delt fly", "selectorized", ["chest", "rear_delts"], ["pec-fly", "rear-delt-fly"], `pec deck fly butterfly rear delt reverse fly dual ${PIN}`, { same_as: "pec-deck" }),
  m("Chest", "cat-bench-station", "Flat bench press station", "free weight", ["chest", "front_delts", "triceps"], ["flat-press"], "olympic flat bench press barbell station"),
  m("Chest", "cat-incline-bench-station", "Incline bench press station", "free weight", ["chest", "front_delts", "triceps"], ["incline-press"], "olympic incline bench press barbell station"),
  m("Chest", "cat-assisted", "Assisted pull-up / dip", "selectorized", ["lats", "biceps", "chest", "triceps"], ["pullup", "dips"], `assisted chin dip gravitron pull up ${PIN}`, { same_as: "assist-pull" }),
  m("Chest", "cat-dip-station", "Dip station", "bodyweight", ["chest", "triceps"], ["dips"], "dip bars parallel bars dip station"),

  // Shoulders
  m("Shoulders", "cat-shoulder-press-pin", "Shoulder press (pin-loaded)", "selectorized", ["front_delts", "side_delts", "triceps"], ["shoulder-press"], `shoulder press overhead military ${PIN}`, { same_as: "sel-shoulder" }),
  m("Shoulders", "cat-shoulder-press-plate", "Shoulder press (plate-loaded)", "plate-loaded", ["front_delts", "side_delts", "triceps"], ["shoulder-press"], `shoulder press overhead ${PLATE}`, { same_as: "pl-shoulder" }),
  m("Shoulders", "cat-lateral-raise-pin", "Lateral raise (pin-loaded)", "selectorized", ["side_delts"], ["lateral-raise"], `lateral raise deltoid side delt ${PIN}`, { same_as: "sel-lateral" }),
  m("Shoulders", "cat-lateral-raise-plate", "Lateral raise (plate-loaded)", "plate-loaded", ["side_delts"], ["lateral-raise"], `lateral raise deltoid standing ${PLATE}`),

  // Back
  m("Back", "cat-pulldown-pin", "Lat pulldown (pin-loaded)", "selectorized", ["lats", "biceps", "upper_back"], ["lat-pulldown", "high-row"], `lat pulldown pull down ${PIN}`, { same_as: "lat-pd" }),
  m("Back", "cat-pulldown-plate", "Front pulldown (plate-loaded)", "plate-loaded", ["lats", "biceps", "upper_back"], ["lat-pulldown", "high-row"], `front lat pulldown pull down ${PLATE}`),
  m("Back", "cat-high-row-plate", "High row (plate-loaded)", "plate-loaded", ["lats", "upper_back", "biceps"], ["high-row", "lat-pulldown"], `high row ${PLATE}`, { same_as: "pl-high-row" }),
  m("Back", "cat-low-row-plate", "Low row / iso-lateral row (plate-loaded)", "plate-loaded", ["upper_back", "lats", "biceps", "rear_delts"], ["cs-row", "tbar-row"], `low row seated row chest supported ${PLATE}`, { same_as: "pl-row" }),
  m("Back", "cat-seated-row-pin", "Seated row (pin-loaded)", "selectorized", ["upper_back", "lats", "biceps"], ["cs-row", "cable-row"], `seated row mid row chest supported ${PIN}`),
  m("Back", "cat-cable-row", "Seated cable row", "cable", ["upper_back", "lats", "biceps"], ["cable-row"], "seated cable row low pulley rowing station", { same_as: "cable-row" }),
  m("Back", "cat-tbar", "T-bar row", "plate-loaded", ["upper_back", "lats", "lower_back"], ["tbar-row", "cs-row"], "t-bar tbar row chest supported incline lever row landmine"),
  m("Back", "cat-pullover", "Pullover (pin-loaded)", "selectorized", ["lats", "chest"], ["pullover"], `pullover pull over nautilus ${PIN}`, { adds: [NEW.pullover] }),
  m("Back", "cat-pullup-bar", "Pull-up bar", "bodyweight", ["lats", "biceps"], ["pullup"], "pull-up pullup chin-up bar", { same_as: "pullup-bar" }),
  m("Back", "cat-back-ext-machine", "Back extension (pin-loaded)", "selectorized", ["lower_back", "glutes"], ["back-ext"], `back extension lower back ${PIN}`),
  m("Back", "cat-back-ext-bench", "Back extension bench (45°)", "bodyweight", ["lower_back", "glutes", "hamstrings"], ["back-ext"], "hyperextension roman chair 45 degree back extension bench glute ham", { same_as: "roman-chair" }),
  m("Back", "cat-shrug-plate", "Shrug (plate-loaded)", "plate-loaded", ["traps"], ["shrug"], `shrug traps ${PLATE}`),

  // Arms
  m("Arms", "cat-biceps-pin", "Biceps curl (pin-loaded)", "selectorized", ["biceps"], ["preacher-curl"], `biceps bicep arm curl preacher ${PIN}`, { same_as: "sel-preacher" }),
  m("Arms", "cat-biceps-plate", "Biceps curl (plate-loaded)", "plate-loaded", ["biceps"], ["preacher-curl"], `biceps bicep arm curl preacher ${PLATE}`),
  m("Arms", "cat-triceps-pin", "Triceps extension (pin-loaded)", "selectorized", ["triceps"], ["triceps-machine"], `triceps tricep extension ${PIN}`, { adds: [NEW.tricepsMachine] }),
  m("Arms", "cat-seated-dip", "Seated dip (pin-loaded)", "selectorized", ["triceps", "chest"], ["dips"], `seated dip triceps press ${PIN}`),

  // Legs
  m("Legs", "cat-leg-press-plate", "Leg press (plate-loaded)", "plate-loaded", ["quads", "glutes", "calves"], ["leg-press", "sl-leg-press", "standing-calf"], `leg press 45 degree linear sled ${PLATE}`, { same_as: "leg-press" }),
  m("Legs", "cat-leg-press-pin", "Seated leg press (pin-loaded)", "selectorized", ["quads", "glutes", "calves"], ["leg-press", "sl-leg-press"], `seated leg press ${PIN}`, { same_as: "sel-leg-press" }),
  m("Legs", "cat-hack-squat", "Hack squat", "plate-loaded", ["quads", "glutes"], ["hack-squat"], `hack squat sled ${PLATE}`, { same_as: "hack" }),
  m("Legs", "cat-leg-ext", "Leg extension", "selectorized", ["quads"], ["leg-ext"], `leg extension quads ${PIN}`, { same_as: "leg-ext" }),
  m("Legs", "cat-seated-curl", "Seated leg curl", "selectorized", ["hamstrings"], ["seated-curl", "lying-curl"], `seated leg curl hamstring ${PIN}`, { same_as: "seated-curl" }),
  m("Legs", "cat-lying-curl", "Lying leg curl", "selectorized", ["hamstrings"], ["lying-curl", "seated-curl"], `lying prone leg curl hamstring ${PIN}`, { same_as: "lying-curl" }),
  m("Legs", "cat-standing-curl", "Standing leg curl", "selectorized", ["hamstrings"], ["lying-curl", "seated-curl"], `standing kneeling leg curl hamstring ${PIN}`),
  m("Legs", "cat-rdl", "RDL / deadlift machine", "plate-loaded", ["hamstrings", "glutes", "lower_back"], ["rdl"], `rdl romanian deadlift hip hinge ${PLATE}`, { same_as: "rdl-machine" }),
  m("Legs", "cat-hip-thrust", "Hip thrust / glute drive", "plate-loaded", ["glutes", "hamstrings"], ["hip-thrust"], `hip thrust glute drive bridge ${PLATE}`, { same_as: "hip-thrust" }),
  m("Legs", "cat-kickback", "Glute kickback", "selectorized", ["glutes", "hamstrings"], ["glute-kickback"], `glute kickback rear kick ${PIN}`, { adds: [NEW.kickback] }),
  m("Legs", "cat-adductor", "Hip adductor", "selectorized", ["adductors"], ["adduction"], `hip adductor adduction inner thigh ${PIN}`, { same_as: "adductor" }),
  m("Legs", "cat-abductor", "Hip abductor", "selectorized", ["glutes"], ["abduction"], `hip abductor abduction outer thigh ${PIN}`, { adds: [NEW.abduction] }),
  m("Legs", "cat-ab-ad-combo", "Hip adduction / abduction (combo)", "selectorized", ["adductors", "glutes"], ["adduction", "abduction"], `inner outer thigh adductor abductor dual combo ${PIN}`, { adds: [NEW.abduction] }),
  m("Legs", "cat-standing-calf", "Standing calf raise", "selectorized", ["calves"], ["standing-calf"], `standing calf raise ${PIN} ${PLATE}`, { same_as: "standing-calf" }),
  m("Legs", "cat-seated-calf", "Seated calf raise", "plate-loaded", ["calves"], ["seated-calf"], `seated calf raise ${PLATE}`, { same_as: "seated-calf" }),

  // Core
  m("Core", "cat-ab-crunch", "Ab crunch (pin-loaded)", "selectorized", ["abs"], ["cable-crunch"], `ab abdominal crunch ${PIN}`, { same_as: "ab-crunch" }),
  m("Core", "cat-rotary-torso", "Rotary torso", "selectorized", ["abs"], ["rotary-torso"], `rotary torso oblique twist rotation ${PIN}`, { adds: [NEW.rotary] }),
  m("Core", "cat-power-tower", "Power tower / captain's chair", "bodyweight", ["abs", "lats", "chest", "triceps"], ["knee-raise", "pullup", "dips"], "power tower captain's chair captains chair vkr knee raise leg raise dip pull-up station", { adds: [NEW.kneeRaise] }),

  // Cables & free weights
  m("Cables & free weights", "cat-crossover", "Cable crossover", "cable", ["chest", "triceps", "rear_delts", "abs", "lats"], ["cable-fly", "pushdown", "oh-triceps", "face-pull", "lateral-raise", "rear-delt-fly", "lat-pulldown", "cable-crunch"], "cable crossover cross over pulley station jungle gym multi-station", { same_as: "crossover" }),
  m("Cables & free weights", "cat-functional-trainer", "Dual adjustable pulley / functional trainer", "cable", ["chest", "triceps", "biceps", "side_delts", "rear_delts", "abs"], ["cable-fly", "pushdown", "oh-triceps", "lateral-raise", "rear-delt-fly", "face-pull", "preacher-curl", "hammer-curl", "cable-crunch", "adduction"], "dual adjustable pulley dap functional trainer cable column life fitness matrix", { same_as: "dual-pulley" }),
  m("Cables & free weights", "cat-cable-column", "Single cable column", "cable", ["triceps", "biceps", "side_delts", "rear_delts", "abs"], ["pushdown", "oh-triceps", "face-pull", "lateral-raise", "preacher-curl", "hammer-curl", "cable-crunch"], "single cable column pulley tower", { same_as: "cable-col" }),
  m("Cables & free weights", "cat-dumbbells", "Dumbbells + adjustable bench", "free weight", ["chest", "front_delts", "side_delts", "biceps", "triceps", "hamstrings", "traps"], ["incline-press", "flat-press", "shoulder-press", "lateral-raise", "rear-delt-fly", "cs-row", "hammer-curl", "preacher-curl", "shrug", "rdl", "oh-triceps"], "dumbbells dumbbell rack adjustable bench free weights", { same_as: "db" }),
  m("Cables & free weights", "cat-smith", "Smith machine", "plate-loaded", ["chest", "front_delts", "glutes", "traps"], ["incline-press", "flat-press", "shoulder-press", "shrug", "hip-thrust", "standing-calf"], "smith machine", { same_as: "smith" }),
  m("Cables & free weights", "cat-power-rack", "Power rack + barbell", "free weight", ["hamstrings", "glutes", "lower_back", "traps"], ["shrug", "hip-thrust"], "power rack squat rack half rack barbell cage", { same_as: "power-rack" }),

  // Cardio (counted only as the trip in, if at all; listed so the floor map is complete)
  m("Cardio", "cat-treadmill", "Treadmill", "cardio", [], [], "treadmill run walk life fitness integrity matrix technogym precor", { same_as: "treadmill" }),
  m("Cardio", "cat-curved-treadmill", "Self-powered curved treadmill", "cardio", [], [], "curved treadmill self-powered woodway curve assault airrunner trueform"),
  m("Cardio", "cat-upright-bike", "Upright bike", "cardio", [], [], "upright bike cycle", { same_as: "upright-bike" }),
  m("Cardio", "cat-recumbent", "Recumbent bike", "cardio", [], [], "recumbent bike", { same_as: "recumbent-bike" }),
  m("Cardio", "cat-spin-bike", "Indoor cycling / spin bike", "cardio", [], [], "spin bike indoor cycling peloton keiser"),
  m("Cardio", "cat-air-bike", "Air bike", "cardio", [], [], "air bike assault echo fan bike"),
  m("Cardio", "cat-stairs", "Stair climber / stepmill", "cardio", [], [], "stair climber stepmill stairmaster steps stepper", { same_as: "stair-climber" }),
  m("Cardio", "cat-elliptical", "Elliptical / cross-trainer", "cardio", [], [], "elliptical cross-trainer cross trainer arc trainer", { same_as: "elliptical" }),
  m("Cardio", "cat-rower", "Rower", "cardio", [], [], "rower rowing machine concept2 erg"),
  m("Cardio", "cat-ski", "Ski erg", "cardio", [], [], "ski erg skierg concept2"),
];

// ── Search ────────────────────────────────────────────────────────────

const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

/**
 * Catalog entries matching what someone typed off a sticker: every word
 * must match the start of a word in the entry (name, keywords, or the
 * exercises it does). Name hits rank first. Empty query → nothing.
 */
export function searchCatalog(query: string, exerciseNames: ReadonlyMap<string, string> = new Map(), limit = 25): CatalogMachine[] {
  const q = words(query);
  if (!q.length) return [];
  const scored: { item: CatalogMachine; score: number; order: number }[] = [];
  for (const [order, item] of CATALOG.entries()) {
    const name = words(item.name);
    const rest = words(`${item.keywords} ${item.exercises.map((e) => exerciseNames.get(e) ?? e).join(" ")}`);
    const all = [...name, ...rest];
    const squashed = all.join("");
    let score = 0;
    let ok = true;
    for (const t of q) {
      if (name.some((w) => w.startsWith(t))) score += 3;
      else if (all.some((w) => w.startsWith(t))) score += 1;
      else if (t.length >= 4 && squashed.includes(t)) score += 1; // "pulldown" vs "pull down"
      else { ok = false; break; }
    }
    if (ok) scored.push({ item, score, order });
  }
  // Ties go to catalog order, which lists the commoner version first.
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit).map((s) => s.item);
}

/** Best guess at a machine type from its name, for machines added by hand. */
export function guessType(name: string): EquipmentType {
  const n = name.toLowerCase();
  if (/plate|iso-?lateral|hack|sled|t-?bar|smith|leg press/.test(n)) return "plate-loaded";
  if (/cable|pulley|crossover|rope|column/.test(n)) return "cable";
  if (/dumbbell|barbell|bench|rack|kettlebell/.test(n)) return "free weight";
  if (/bar\b|dip|tower|chair|bodyweight/.test(n)) return "bodyweight";
  if (/treadmill|bike|elliptical|rower|stair|ski|cycle/.test(n)) return "cardio";
  return "selectorized";
}

// ── Adding ────────────────────────────────────────────────────────────

/** One machine to add: from the catalog, or by hand (name + exercises). */
export interface MachineRequest {
  catalog?: string;
  name?: string;
  exercises?: string[];
  location?: string;
}

/**
 * What to write to add these machines. A catalog machine whose starter
 * twin is already here renames that one (keeping its notes) instead of
 * duplicating it; one already added just gets the new location. Every
 * machine is appended to the options of the exercises it serves, creating
 * any exercise the library lacks. Unknown catalog ids and nameless
 * requests are skipped.
 */
export function planMachineAdds(
  requests: readonly MachineRequest[],
  equipment: readonly Equipment[],
  exercises: readonly Exercise[],
  newId: () => string,
): { equipment: Equipment[]; exercises: Exercise[]; added: number } {
  const eqOut = new Map<string, Equipment>();
  const exOut = new Map<string, Exercise>(exercises.map((x) => [x.id, x]));
  const touched = new Set<string>();
  const have = new Map(equipment.map((e) => [e.id, e]));
  const byCatalog = new Map(CATALOG.map((c) => [c.id, c]));
  let added = 0;

  const link = (exerciseId: string, machineId: string) => {
    const x = exOut.get(exerciseId);
    if (!x || x.equipment_options.includes(machineId)) return;
    exOut.set(exerciseId, { ...x, equipment_options: [...x.equipment_options, machineId] });
    touched.add(exerciseId);
  };

  for (const r of requests) {
    const location = r.location?.trim() ?? "";
    const c = r.catalog ? byCatalog.get(r.catalog) : undefined;
    if (r.catalog && !c) continue;
    let machine: Equipment;
    let serves: string[];
    if (c) {
      for (const n of c.adds ?? []) {
        if (!exOut.has(n.id)) {
          exOut.set(n.id, { ...n, secondary_muscles: [...n.secondary_muscles], equipment_options: [] });
          touched.add(n.id);
        }
      }
      const prior = eqOut.get(c.id) ?? have.get(c.id) ?? (c.same_as ? eqOut.get(c.same_as) ?? have.get(c.same_as) : undefined);
      machine = prior
        ? { ...prior, name: c.name, location_note: location || prior.location_note }
        : { id: c.id, name: c.name, type: c.type, muscles: [...c.muscles], location_note: location, setup_note: "", available: true };
      serves = c.exercises;
    } else {
      const name = r.name?.trim();
      if (!name) continue;
      serves = (r.exercises ?? []).filter((id) => exOut.has(id));
      const muscles = [...new Set(serves.flatMap((id) => {
        const x = exOut.get(id)!;
        return [x.primary_muscle, ...x.secondary_muscles];
      }))];
      machine = { id: newId(), name, type: guessType(name), muscles, location_note: location, setup_note: "", available: true };
    }
    if (!have.has(machine.id) && !eqOut.has(machine.id)) added++;
    eqOut.set(machine.id, machine);
    for (const id of serves) link(id, machine.id);
  }

  return { equipment: [...eqOut.values()], exercises: [...touched].map((id) => exOut.get(id)!), added };
}

// ── Share links ("send me photos, get a link") ────────────────────────

/** Machines packed into a link: #/add-machines/<payload>. */
export function encodeMachines(requests: readonly MachineRequest[]): string {
  const compact = requests.map((r) => ({ ...(r.catalog ? { c: r.catalog } : { n: r.name, x: r.exercises }), ...(r.location ? { l: r.location } : {}) }));
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The machines in a link, or null if it isn't one. Untrusted input: only plain strings get through. */
export function decodeMachines(payload: string): MachineRequest[] | null {
  try {
    const bin = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const raw: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) return null;
    const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
    const out: MachineRequest[] = [];
    for (const e of raw) {
      if (!e || typeof e !== "object") continue;
      const o = e as Record<string, unknown>;
      const location = str(o.l, 80);
      const catalog = str(o.c, 60);
      if (catalog) out.push({ catalog, location });
      else {
        const name = str(o.n, 80);
        const exercises = Array.isArray(o.x) ? o.x.map((x) => str(x, 60)).filter((x): x is string => !!x).slice(0, 20) : [];
        if (name) out.push({ name, exercises, location });
      }
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}
