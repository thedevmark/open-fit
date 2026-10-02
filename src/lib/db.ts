// IndexedDB (Dexie) store for /fit. One device, one user, fully offline.
// Pure training rules live in ./logic; this file only reads and writes.

import Dexie, { type Table, type Transaction } from "dexie";
import { FIT_CONFIG } from "./config";
import { afterTraining, groupBySession, localDate, type PastSession } from "./logic";
import { DEFAULT_SETTINGS, STARTER_EQUIPMENT, STARTER_EXERCISES, STARTER_TEMPLATES, upgradeLibrary, upgradeStarter } from "./seed";
import type { Backup, DayTemplate, Equipment, Exercise, PlanItem, Session, SetLog, Settings, TripMode } from "./types";

class FitDB extends Dexie {
  equipment!: Table<Equipment, string>;
  exercises!: Table<Exercise, string>;
  templates!: Table<DayTemplate, string>;
  sessions!: Table<Session, string>;
  sets!: Table<SetLog, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super(FIT_CONFIG.dbName);
    const stores = {
      equipment: "id, name",
      exercises: "id, name",
      templates: "id, order_in_split",
      sessions: "id, date, started_at, day_template_id",
      sets: "id, session_id, exercise_id, [exercise_id+equipment_id], logged_at",
      settings: "id",
    };
    // Each bump brings untouched starter days up to the current starter.
    const upgrade = async (tx: Transaction) => {
      const settings = await tx.table<Settings, string>("settings").get("settings");
      if (!settings) return;
      const up = upgradeStarter(await tx.table<DayTemplate, string>("templates").toArray(), settings);
      if (up?.templates.length) await tx.table("templates").bulkPut(up.templates);
      await tx.table("settings").update("settings", { ...up?.settings, ...(FIT_CONFIG.club ? { club_name: FIT_CONFIG.club } : {}) });
    };
    this.version(1).stores(stores);
    // v2: seven-day starter → five days a week, renamed days, locked gym name (config).
    this.version(2).stores(stores).upgrade(upgrade);
    // v3: every starter exercise → three sets of 12 / 10 / 8.
    this.version(3).stores(stores).upgrade(upgrade);
    // v4: machines from the floor photos (renames, dual pulley, plyo boxes, cardio).
    this.version(4).stores(stores).upgrade(async (tx) => {
      const up = upgradeLibrary(
        await tx.table<Equipment, string>("equipment").toArray(),
        await tx.table<Exercise, string>("exercises").toArray(),
      );
      if (up?.equipment.length) await tx.table("equipment").bulkPut(up.equipment);
      if (up?.exercises.length) await tx.table("exercises").bulkPut(up.exercises);
    });
    // v5: rides become trips (ride / run / walk). A device that has logged
    // rides keeps riding as its default, at the distance it had set.
    this.version(5).stores(stores).upgrade(async (tx) => {
      const settings = await tx.table<Settings, string>("settings").get("settings");
      if (!settings || settings.trip) return;
      const rode = await tx.table<Session, string>("sessions").filter((s) => (s.biked_miles ?? 0) > 0).first();
      if (rode) await tx.table("settings").update("settings", { trip: { mode: "ride", miles: settings.ride_miles ?? 5 } });
    });
  }
}

export const db = new FitDB();

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Setup ────────────────────────────────────────────────────────────

/**
 * First run. "starter" seeds a generic floor plus the exercises mapped to
 * it; "empty" keeps the exercises and split but no machines, so every
 * exercise gets mapped by hand while walking the club.
 */
export async function seed(library: "starter" | "empty", clubName = ""): Promise<void> {
  await db.transaction("rw", [db.equipment, db.exercises, db.templates, db.settings], async () => {
    const existing = await db.settings.get("settings");
    if (existing) return;
    if (library === "starter") await db.equipment.bulkPut(STARTER_EQUIPMENT);
    await db.exercises.bulkPut(
      library === "starter" ? STARTER_EXERCISES : STARTER_EXERCISES.map((e) => ({ ...e, equipment_options: [] })),
    );
    await db.templates.bulkPut(STARTER_TEMPLATES);
    await db.settings.put({
      ...DEFAULT_SETTINGS,
      club_name: FIT_CONFIG.club ?? (clubName.trim() || DEFAULT_SETTINGS.club_name),
      ride_tracking: FIT_CONFIG.trips,
    });
  });
}

export async function updateSettings(patch: Partial<Omit<Settings, "id">>): Promise<void> {
  await db.settings.update("settings", patch);
}

// ── Sessions ─────────────────────────────────────────────────────────

export async function activeSession(): Promise<Session | undefined> {
  const recent = await db.sessions.orderBy("started_at").reverse().limit(20).toArray();
  return recent.find((s) => s.ended_at === null);
}

/** The trip that counted for a session, as stored on it. */
export type SessionTrip = { mode: TripMode; miles: number } | null;
const tripFields = (trip: SessionTrip) => ({ biked_miles: trip?.miles ?? 0, ...(trip ? { trip_mode: trip.mode } : {}) });

export async function startSession(templateId: string, plan: PlanItem[], trip: SessionTrip = null): Promise<Session> {
  return db.transaction("rw", db.sessions, async () => {
    const open = await activeSession();
    if (open) return open;
    const now = Date.now();
    const session: Session = {
      id: newId(),
      date: localDate(now),
      day_template_id: templateId,
      started_at: now,
      ended_at: null,
      notes: "",
      plan,
      cursor: 0,
      ...tripFields(trip),
    };
    await db.sessions.add(session);
    return session;
  });
}

export async function updateSession(id: string, patch: Partial<Omit<Session, "id">>): Promise<void> {
  await db.sessions.update(id, patch);
}

/** Save a finished session and move the rotation past the day trained. */
export async function finishSession(id: string, notes: string): Promise<void> {
  await db.transaction("rw", [db.sessions, db.settings], async () => {
    const session = await db.sessions.get(id);
    const settings = await db.settings.get("settings");
    if (!session || !settings) return;
    await db.sessions.update(id, { ended_at: Date.now(), notes });
    await db.settings.update("settings", afterTraining(settings, session.day_template_id));
  });
}

export async function deleteSession(id: string): Promise<void> {
  await db.transaction("rw", [db.sessions, db.sets], async () => {
    await db.sets.where("session_id").equals(id).delete();
    await db.sessions.delete(id);
  });
}

/** Light day: count it as done without logging anything. */
export async function markDone(templateId: string, trip: SessionTrip = null): Promise<void> {
  await db.transaction("rw", [db.sessions, db.settings], async () => {
    const settings = await db.settings.get("settings");
    if (!settings) return;
    const now = Date.now();
    await db.sessions.add({
      id: newId(),
      date: localDate(now),
      day_template_id: templateId,
      started_at: now,
      ended_at: now,
      notes: "",
      plan: [],
      cursor: 0,
      marked_only: true,
      ...tripFields(trip),
    });
    await db.settings.update("settings", afterTraining(settings, templateId));
  });
}

/** Change a session's trip after the fact (forgot to flip the switch). */
export async function setSessionTrip(id: string, trip: SessionTrip): Promise<void> {
  await db.sessions.update(id, { biked_miles: trip?.miles ?? 0, trip_mode: trip?.mode });
}

/** Whether last time's trip counted: the default for the yes/no switch. null = no sessions yet. */
export async function lastTrip(): Promise<boolean | null> {
  const last = await db.sessions.orderBy("started_at").reverse().first();
  return last ? (last.biked_miles ?? 0) > 0 : null;
}

/** Sessions that started inside [from, to), for rides in a window. */
export function sessionsBetween(from: number, to: number): Promise<Session[]> {
  return db.sessions.where("started_at").between(from, to, true, false).toArray();
}

// ── Set logs ─────────────────────────────────────────────────────────

export async function logSet(log: Omit<SetLog, "id" | "logged_at">): Promise<SetLog> {
  const full: SetLog = { ...log, id: newId(), logged_at: Date.now() };
  await db.sets.add(full);
  return full;
}

export async function updateSet(id: string, patch: Partial<Pick<SetLog, "weight_lb" | "reps" | "effort" | "note">>): Promise<void> {
  await db.sets.update(id, patch);
}

/** Delete a set and renumber the rest of that exercise's sets in the session. */
export async function deleteSet(id: string): Promise<void> {
  await db.transaction("rw", db.sets, async () => {
    const s = await db.sets.get(id);
    if (!s) return;
    await db.sets.delete(id);
    const rest = (await db.sets.where("session_id").equals(s.session_id).toArray())
      .filter((x) => x.exercise_id === s.exercise_id)
      .sort((a, b) => a.set_number - b.set_number);
    await Promise.all(rest.map((x, i) => (x.set_number === i + 1 ? null : db.sets.update(x.id, { set_number: i + 1 }))));
  });
}

/** Past sessions on this exercise + machine, most recent first, excluding one session (today's). */
export async function machineHistory(exerciseId: string, equipmentId: string, excludeSessionId?: string): Promise<PastSession[]> {
  const sets = await db.sets.where("[exercise_id+equipment_id]").equals([exerciseId, equipmentId]).toArray();
  return groupBySession(excludeSessionId ? sets.filter((s) => s.session_id !== excludeSessionId) : sets);
}

// ── Library ──────────────────────────────────────────────────────────

/** Remove a machine and unlink it from every exercise's options. Logged sets keep their history. */
export async function deleteEquipment(id: string): Promise<void> {
  await db.transaction("rw", [db.equipment, db.exercises], async () => {
    await db.equipment.delete(id);
    const linked = await db.exercises.filter((e) => e.equipment_options.includes(id)).toArray();
    await Promise.all(linked.map((e) => db.exercises.update(e.id, { equipment_options: e.equipment_options.filter((x) => x !== id) })));
  });
}

/** Remove an exercise and drop it from every template. Logged sets keep their history. */
export async function deleteExercise(id: string): Promise<void> {
  await db.transaction("rw", [db.exercises, db.templates], async () => {
    await db.exercises.delete(id);
    const used = await db.templates.filter((t) => t.items.some((i) => i.exercise_id === id)).toArray();
    await Promise.all(used.map((t) => db.templates.update(t.id, { items: t.items.filter((i) => i.exercise_id !== id) })));
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.transaction("rw", [db.templates, db.settings], async () => {
    const settings = await db.settings.get("settings");
    await db.templates.delete(id);
    if (!settings) return;
    const current = settings.split_order[settings.current_position % Math.max(1, settings.split_order.length)];
    const split_order = settings.split_order.filter((x) => x !== id);
    const keep = split_order.indexOf(current);
    await db.settings.update("settings", { split_order, current_position: keep >= 0 ? keep : 0 });
  });
}

// ── Backup ───────────────────────────────────────────────────────────

/** Backup files from before the open-source release say "deutschmark-fit"; both import. */
const BACKUP_APPS: readonly string[] = ["open-fit", "deutschmark-fit"];

export async function exportBackup(): Promise<Backup> {
  const [equipment, exercises, templates, sessions, sets, settings] = await Promise.all([
    db.equipment.toArray(),
    db.exercises.toArray(),
    db.templates.toArray(),
    db.sessions.toArray(),
    db.sets.toArray(),
    db.settings.get("settings"),
  ]);
  if (!settings) throw new Error("Nothing to export yet");
  // The sync code is a secret: never in a file you might share.
  const { sync: _sync, ...shared } = settings;
  return { app: "open-fit", version: 1, exported_at: new Date().toISOString(), equipment, exercises, templates, sessions, sets, settings: shared };
}

export function isBackup(raw: unknown): raw is Backup {
  const b = raw as Partial<Backup> | null;
  const arrays = ["equipment", "exercises", "templates", "sessions", "sets"] as const;
  return !!b && typeof b.app === "string" && BACKUP_APPS.includes(b.app) && b.version === 1 && !!b.settings && typeof b.settings === "object"
    && arrays.every((k) => Array.isArray(b[k]));
}

/** Replace items by id, adding any that are new. */
function mergeById<T extends { id: string }>(all: readonly T[], changed: readonly T[]): T[] {
  const byId = new Map(changed.map((x) => [x.id, x]));
  return [...all.map((x) => byId.get(x.id) ?? x), ...changed.filter((c) => !all.some((a) => a.id === c.id))];
}

/**
 * Replace everything on this device with a backup, brought up to the
 * current starter on the way in. This device's sync state is kept.
 * Throws on anything that isn't a backup.
 */
export async function importBackup(raw: unknown): Promise<void> {
  if (!isBackup(raw)) throw new Error("That file isn't a Gym Floor Planner backup");
  const backup = raw;
  const { sync: _ignored, ...incoming } = backup.settings;
  const base: Settings = { ...DEFAULT_SETTINGS, ...incoming, id: "settings", ...(FIT_CONFIG.club ? { club_name: FIT_CONFIG.club } : {}) };
  // Backups from before trips: anyone who logged rides keeps riding as the default.
  if (!base.trip && backup.sessions.some((x) => (x.biked_miles ?? 0) > 0)) base.trip = { mode: "ride", miles: base.ride_miles ?? 5 };
  const program = upgradeStarter(backup.templates, base);
  const library = upgradeLibrary(backup.equipment, backup.exercises);
  await db.transaction("rw", [db.equipment, db.exercises, db.templates, db.sessions, db.sets, db.settings], async () => {
    const sync = (await db.settings.get("settings"))?.sync;
    await Promise.all([db.equipment.clear(), db.exercises.clear(), db.templates.clear(), db.sessions.clear(), db.sets.clear(), db.settings.clear()]);
    await db.equipment.bulkPut(mergeById(backup.equipment, library?.equipment ?? []));
    await db.exercises.bulkPut(mergeById(backup.exercises, library?.exercises ?? []));
    await db.templates.bulkPut(mergeById(backup.templates, program?.templates ?? []));
    await db.sessions.bulkPut(backup.sessions);
    await db.sets.bulkPut(backup.sets);
    await db.settings.put({ ...base, ...program?.settings, ...(sync ? { sync } : {}) });
  });
}

export async function wipeAll(): Promise<void> {
  await db.transaction("rw", [db.equipment, db.exercises, db.templates, db.sessions, db.sets, db.settings], async () => {
    await Promise.all([db.equipment.clear(), db.exercises.clear(), db.templates.clear(), db.sessions.clear(), db.sets.clear(), db.settings.clear()]);
  });
}
