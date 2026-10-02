import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { syncNow } from "../lib/autosync";
import { activeSession, db, deleteSession, finishSession, updateSession } from "../lib/db";
import { DEFAULT_RIDE_MILES, groupBySession, isPR, ridesOn, topSet } from "../lib/logic";
import type { Session, SetLog } from "../lib/types";
import { BikeToggle, ConfirmButton, duration, go, lb, TopBar, useFit, useNow, useRest } from "./kit";

export interface ExerciseLine {
  exercise_id: string;
  equipment_id: string;
  sets: SetLog[];
  pr: boolean;
}

/** One line per exercise + machine actually used, with a PR flag against everything before this session. */
export async function sessionLines(session: Session): Promise<ExerciseLine[]> {
  const sets = (await db.sets.where("session_id").equals(session.id).toArray()).sort((a, b) => a.logged_at - b.logged_at);
  const groups = new Map<string, SetLog[]>();
  for (const s of sets) {
    const k = `${s.exercise_id}|${s.equipment_id}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return Promise.all(
    [...groups.values()].map(async (g) => {
      const { exercise_id, equipment_id } = g[0];
      const prior = (await db.sets.where("[exercise_id+equipment_id]").equals([exercise_id, equipment_id]).toArray())
        .filter((s) => s.session_id !== session.id && s.logged_at < session.started_at);
      return { exercise_id, equipment_id, sets: g, pr: isPR(g, groupBySession(prior)) };
    }),
  );
}

export default function Summary() {
  const { tById, settings } = useFit();
  const rest = useRest();
  const now = useNow(30_000);
  const session = useLiveQuery(() => activeSession().then((s) => s ?? null), []);
  const lines = useLiveQuery(() => (session ? sessionLines(session) : Promise.resolve([])), [session?.id]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (session === null) go("today");
  }, [session]);
  const sessionNotes = session?.notes;
  const sessionId = session?.id;
  useEffect(() => {
    if (sessionNotes !== undefined) setNotes(sessionNotes);
    // Only when a different session loads — never clobber typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (!session || !lines) return <div className="fit-empty" aria-busy="true">Loading…</div>;

  const totalSets = lines.reduce((n, l) => n + l.sets.length, 0);
  const prs = lines.filter((l) => l.pr).length;
  const name = tById.get(session.day_template_id)?.name ?? "Workout";

  const save = async () => {
    await finishSession(session.id, notes.trim());
    rest.stop();
    go("today");
    void syncNow(); // no-op unless sync is on
  };

  return (
    <div className="fit-summary">
      <TopBar title={`${name} done`} sub={new Date(session.started_at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} onBack={() => go("workout")} />
      <dl className="fit-stats">
        <div><dt>Duration</dt><dd>{duration(now - session.started_at)}</dd></div>
        <div><dt>Sets</dt><dd>{totalSets}</dd></div>
        <div><dt>PRs</dt><dd>{prs}</dd></div>
      </dl>
      <SessionLines lines={lines} />
      {ridesOn(settings) ? <SessionRide session={session} defaultMiles={settings.ride_miles ?? DEFAULT_RIDE_MILES} /> : null}
      <label className="fit-field">
        <span className="fit-field__label">Session notes</span>
        <textarea className="fit-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Felt strong, gym was packed…" />
      </label>
      <div className="fit-dock">
        <button type="button" className="fit-btn fit-btn--primary fit-btn--block" onClick={save}>
          Save {name}
        </button>
        <button type="button" className="fit-btn fit-btn--ghost" onClick={() => go("workout")}>Keep training</button>
      </div>
      <div className="fit-summary__discard">
        <ConfirmButton confirm={totalSets ? `Delete ${totalSets} logged sets?` : "Tap again to discard"} onConfirm={async () => { await deleteSession(session.id); rest.stop(); go("today"); }}>
          Discard workout
        </ConfirmButton>
        <p>Discarding doesn&apos;t advance the rotation.</p>
      </div>
    </div>
  );
}

/** Fix "Rode here" after the fact, if you forgot to flip it. */
export function SessionRide({ session, defaultMiles }: { session: Session; defaultMiles: number }) {
  const miles = session.biked_miles ?? 0;
  return (
    <BikeToggle
      on={miles > 0}
      miles={miles > 0 ? miles : defaultMiles}
      onChange={(on) => updateSession(session.id, { biked_miles: on ? defaultMiles : 0 })}
    />
  );
}

export function SessionLines({ lines }: { lines: ExerciseLine[] }) {
  const { exById, eqById } = useFit();
  if (lines.length === 0) return <p className="fit-empty">No sets logged.</p>;
  return (
    <ul className="fit-lines">
      {lines.map((l) => {
        const top = topSet(l.sets);
        return (
          <li key={`${l.exercise_id}|${l.equipment_id}`}>
            <div className="fit-lines__head">
              <span className="fit-lines__name">{exById.get(l.exercise_id)?.name ?? "Deleted exercise"}</span>
              {l.pr ? <span className="fit-pr">PR</span> : null}
            </div>
            <p className="fit-lines__eq">{eqById.get(l.equipment_id)?.name ?? "Deleted machine"}{top ? ` · top ${lb(top.weight_lb)}×${top.reps}` : ""}</p>
            <p className="fit-lines__sets">{l.sets.map((s) => `${lb(s.weight_lb)}×${s.reps}${s.effort === "failure" ? "F" : ""}`).join("  ")}</p>
          </li>
        );
      })}
    </ul>
  );
}
