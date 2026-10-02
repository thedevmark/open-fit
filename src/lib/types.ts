// Gym Floor Planner: local data model.
// Weights are pounds throughout. Everything lives in IndexedDB on the
// device; there is no server copy (JSON export is the backup).

export type Muscle =
  | "chest"
  | "front_delts"
  | "side_delts"
  | "rear_delts"
  | "lats"
  | "upper_back"
  | "traps"
  | "lower_back"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "glutes"
  | "quads"
  | "hamstrings"
  | "adductors"
  | "calves";

export type EquipmentType = "plate-loaded" | "selectorized" | "cable" | "free weight" | "bodyweight" | "cardio";

export type Effort = "easy" | "solid" | "failure";

export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  muscles: Muscle[];
  location_note: string;
  setup_note: string;
  /** false = out of order / not at this club right now; skipped when resolving. */
  available: boolean;
  /** Weight change for one progression step. Falls back to the type default. */
  step_lb?: number;
}

export interface Exercise {
  id: string;
  name: string;
  primary_muscle: Muscle;
  secondary_muscles: Muscle[];
  /** Ordered equipment ids — first available one wins. */
  equipment_options: string[];
}

export interface TemplateItem {
  exercise_id: string;
  sets: number;
  /** For per-set targets these are the lowest and highest of `reps`. */
  rep_min: number;
  rep_max: number;
  rest_sec: number;
  /**
   * Target reps per set, set 1 first (e.g. 12 / 10 / 8, heavier each set).
   * Length equals `sets`. Missing = one rep_min–rep_max range for every set.
   */
  reps?: number[];
}

export interface DayTemplate {
  id: string;
  name: string;
  order_in_split: number;
  items: TemplateItem[];
}

/** One exercise as planned for a specific session (after recovery trim + swaps). */
export interface PlanItem {
  exercise_id: string;
  equipment_id: string | null;
  sets: number;
  /** Template set count before a recovery trim; equals `sets` when untouched. */
  template_sets: number;
  rep_min: number;
  rep_max: number;
  rest_sec: number;
  /** Per-set rep targets, cut to `sets` after a recovery trim. */
  reps?: number[];
  /** Equipment ids already marked taken during this session. */
  taken: string[];
}

export interface Session {
  id: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  day_template_id: string;
  started_at: number;
  ended_at: number | null;
  notes: string;
  plan: PlanItem[];
  /** Index into `plan` of the card on screen. */
  cursor: number;
  /** true = "mark done" without logging (light day). */
  marked_only?: boolean;
  /** Miles ridden to get here; 0 or missing = came another way. */
  biked_miles?: number;
}

export interface SetLog {
  id: string;
  session_id: string;
  exercise_id: string;
  equipment_id: string;
  set_number: number;
  weight_lb: number;
  reps: number;
  effort: Effort | null;
  note: string;
  logged_at: number;
}

export interface Settings {
  id: "settings";
  split_order: string[];
  current_position: number;
  /** Split days already trained this round, in any order. Missing on older data → none. */
  cycle_done?: string[];
  default_rest_sec: number;
  recovery_hours_large: number;
  recovery_hours_small: number;
  fatigue_threshold: number;
  club_name: string;
  setup_done: boolean;
  /** Miles one "Rode here" counts for. Missing on data from before rides existed → 5. */
  ride_miles?: number;
  /** Show the "Rode here?" switch and count rides as leg fatigue. Missing (older data) → on. */
  ride_tracking?: boolean;
  /** Sync-code state. Lives only on this device: never in a backup file or the synced copy. */
  sync?: SyncState;
}

export interface SyncState {
  /** The secret sync code. Anyone holding it can read and replace the synced copy. */
  code: string;
  /** Server version of the copy this device last matched; null before the first sync. */
  remote_version: string | null;
  /** Hash of this device's data when it last matched the server. */
  local_hash: string | null;
  last_synced_at: number | null;
  /** Both this device and the synced copy changed since they last matched. */
  conflict?: boolean;
}

export interface Backup {
  app: "open-fit" | "deutschmark-fit";
  version: 1;
  exported_at: string;
  equipment: Equipment[];
  exercises: Exercise[];
  templates: DayTemplate[];
  sessions: Session[];
  sets: SetLog[];
  settings: Settings;
}
