import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { activeSession, db, lastTrip, markDone, sessionsBetween, startSession, updateSettings } from "../lib/db";
import { buildPlan, currentTemplateId, fatigueScores, MUSCLE_LABEL, tripsFrom, tripsOn } from "../lib/logic";
import type { PlanItem } from "../lib/types";
import BodyMap from "./BodyMap";
import { duration, go, shortDate, useFit, useNow } from "./kit";
import { TripPicker, TripToggle } from "./Trip";

export default function Today() {
  const { settings, templates, tById, exById, eqById } = useFit();
  const now = useNow(60_000);
  const [override, setOverride] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [keepFull, setKeepFull] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const open = useLiveQuery(activeSession, []);
  const windowMs = Math.max(settings.recovery_hours_large, settings.recovery_hours_small) * 3_600_000;
  // Re-query each minute so decay keeps moving while the screen is open.
  const minute = Math.floor(now / 60_000);
  const recent = useLiveQuery(() => db.sets.where("logged_at").above(Date.now() - windowMs).toArray(), [windowMs, minute]);
  const recentSessions = useLiveQuery(() => sessionsBetween(Date.now() - windowMs, Date.now() + 1), [windowMs, minute]);
  // The trip here: asked once (mode + distance), then a yes/no that
  // defaults to whatever last time was.
  const tracking = tripsOn(settings);
  const trip = settings.trip;
  const [tripYes, setTripYes] = useState<boolean | null>(null);
  const [editingTrip, setEditingTrip] = useState(false);
  const lastCounted = useLiveQuery(lastTrip, []);
  const tripNow = tracking && trip ? (tripYes ?? lastCounted ?? true) : false;
  const tripToday = tripNow && trip ? trip : null;
  const lastDone = useLiveQuery(
    async () => {
      const all = await db.sessions.orderBy("started_at").reverse().toArray();
      return new Map(all.filter((s) => s.ended_at !== null).reverse().map((s) => [s.day_template_id, s.started_at]));
    },
    [],
  );

  const upNext = currentTemplateId(settings);
  const dayId = override && tById.has(override) ? override : upNext;
  const template = dayId ? tById.get(dayId) : undefined;
  const scores = useMemo(
    () => fatigueScores(recent ?? [], exById, now, settings, tracking ? tripsFrom(recentSessions ?? []) : []),
    [recent, recentSessions, exById, now, settings, tracking],
  );
  const built = useMemo(
    () => (template ? buildPlan(template, exById, eqById, scores, settings, tById) : null),
    [template, exById, eqById, scores, settings, tById],
  );

  const plan: PlanItem[] = (built?.plan ?? [])
    .filter((p) => !skipped.has(p.exercise_id))
    .map((p) => (keepFull.has(p.exercise_id) ? { ...p, sets: p.template_sets } : p));

  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    fn(next);
  };

  const start = async () => {
    if (!template || busy) return;
    setBusy(true);
    try {
      await startSession(template.id, plan, tripToday);
      go("workout");
    } finally {
      setBusy(false);
    }
  };

  const splitIndex = dayId ? settings.split_order.indexOf(dayId) : -1;
  const doneThisRound = settings.split_order.filter((id) => settings.cycle_done?.includes(id)).length;
  const isLight = template ? /light/i.test(template.name) : false;
  const last = dayId ? lastDone?.get(dayId) : undefined;
  const totalSets = plan.reduce((n, p) => n + p.sets, 0);

  return (
    <div className="fit-today">
      <header className="fit-today__head">
        <p className="fit-eyebrow">{settings.club_name} · {new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</p>
        <div className="fit-today__day">
          <h1>{template?.name ?? "No day set"}</h1>
          <button type="button" className="fit-btn fit-btn--ghost fit-btn--sm" onClick={() => setSwitching((s) => !s)} aria-expanded={switching}>
            Switch day
          </button>
        </div>
        <p className="fit-today__meta">
          {splitIndex >= 0 ? `${doneThisRound} of ${settings.split_order.length} done this round` : "Outside the split"}
          {override && override !== upNext && upNext ? ` · rotation says ${tById.get(upNext)?.name}` : ""}
          {last ? ` · last ${shortDate(last)}` : ""}
        </p>
        {switching ? (
          <div className="fit-chips" role="group" aria-label="Day type">
            {settings.split_order.map((id) => tById.get(id)).filter(Boolean).map((t) => (
              <button
                key={t!.id}
                type="button"
                className={`fit-chip${t!.id === dayId ? " is-on" : ""}`}
                aria-pressed={t!.id === dayId}
                onClick={() => { setOverride(t!.id === upNext ? null : t!.id); setSwitching(false); setKeepFull(new Set()); setSkipped(new Set()); }}
              >
                {t!.name}{t!.id === upNext ? " · next" : settings.cycle_done?.includes(t!.id) ? " · done" : ""}
              </button>
            ))}
            {templates.filter((t) => !settings.split_order.includes(t.id)).map((t) => (
              <button key={t.id} type="button" className={`fit-chip${t.id === dayId ? " is-on" : ""}`} onClick={() => { setOverride(t.id); setSwitching(false); }}>
                {t.name}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {settings.sync?.conflict ? (
        <button type="button" className="fit-callout fit-callout--btn" onClick={() => go("settings")}>
          <strong>Sync needs a choice</strong>
          <span className="fit-muted">This phone and the synced copy both changed. Pick one in Settings.</span>
        </button>
      ) : null}

      {open ? (
        <section className="fit-banner">
          <div>
            <strong>{tById.get(open.day_template_id)?.name ?? "Workout"} in progress</strong>
            <span>Started {duration(now - open.started_at)} ago</span>
          </div>
          <button type="button" className="fit-btn fit-btn--primary" onClick={() => go("workout")}>Resume</button>
        </section>
      ) : null}

      <BodyMap scores={scores} threshold={settings.fatigue_threshold} />

      {built?.notes.length ? (
        <section className="fit-notes" aria-label="Recovery adjustments">
          {built.notes.filter((n) => !skipped.has(n.exercise_id)).map((n) => {
            const name = exById.get(n.exercise_id)?.name ?? "Exercise";
            const later = n.later_template_id ? tById.get(n.later_template_id)?.name : null;
            const full = keepFull.has(n.exercise_id);
            return (
              <div key={n.exercise_id} className="fit-note">
                <p>
                  <strong>{MUSCLE_LABEL[n.muscle]} is fatigued.</strong>{" "}
                  {full ? `${name} kept at ${n.from} sets.` : `${name} trimmed ${n.from} → ${n.to} sets.`}
                  {later ? ` Or move it to ${later}.` : ""}
                </p>
                <div className="fit-note__actions">
                  <button type="button" className="fit-btn fit-btn--ghost fit-btn--sm" onClick={() => toggle(keepFull, n.exercise_id, setKeepFull)}>
                    {full ? `Trim to ${n.to}` : `Keep ${n.from}`}
                  </button>
                  {later ? (
                    <button type="button" className="fit-btn fit-btn--ghost fit-btn--sm" onClick={() => toggle(skipped, n.exercise_id, setSkipped)}>
                      Save for {later}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      <section className="fit-plan" aria-label="Today's exercises">
        <h2 className="fit-h2">
          {plan.length} exercises · {totalSets} sets
          {skipped.size ? (
            <button type="button" className="fit-link" onClick={() => setSkipped(new Set())}>Restore {skipped.size} saved</button>
          ) : null}
        </h2>
        {template && plan.length === 0 ? <p className="fit-empty">Nothing in this day yet. Add exercises in Program.</p> : null}
        <ol className="fit-plan__list">
          {plan.map((p) => {
            const ex = exById.get(p.exercise_id);
            const eq = p.equipment_id ? eqById.get(p.equipment_id) : undefined;
            return (
              <li key={p.exercise_id} className="fit-plan__item">
                <div className="fit-plan__main">
                  <span className="fit-plan__name">{ex?.name ?? "Missing exercise"}</span>
                  {eq ? (
                    <span className="fit-plan__eq">{eq.name}{eq.location_note ? ` · ${eq.location_note}` : ""}</span>
                  ) : (
                    <button type="button" className="fit-plan__eq is-warn" onClick={() => go("library", "ex", p.exercise_id)}>
                      No machine at this club — map one
                    </button>
                  )}
                </div>
                <span className="fit-plan__target">
                  {p.sets < p.template_sets ? <s>{p.template_sets}</s> : null}
                  {p.reps ? p.reps.join("/") : `${p.sets}×${p.rep_min}–${p.rep_max}`}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {open || !tracking ? null : !trip || editingTrip ? (
        <TripPicker
          current={trip}
          onSave={(t) => { void updateSettings({ trip: t }); setTripYes(true); setEditingTrip(false); }}
          onNone={() => { void updateSettings({ ride_tracking: false }); setEditingTrip(false); }}
          onCancel={trip ? () => setEditingTrip(false) : undefined}
        />
      ) : (
        <TripToggle on={tripNow} trip={trip} onChange={setTripYes} onEdit={() => setEditingTrip(true)} />
      )}

      <div className="fit-dock">
        {open ? (
          <button type="button" className="fit-btn fit-btn--primary fit-btn--block" onClick={() => go("workout")}>Resume workout</button>
        ) : (
          <>
            <button type="button" className="fit-btn fit-btn--primary fit-btn--block" disabled={!template || plan.length === 0 || busy} onClick={start}>
              Start {template?.name ?? ""}
            </button>
            {isLight && template ? (
              <button type="button" className="fit-btn fit-btn--ghost" onClick={() => markDone(template.id, tripToday)}>Mark done</button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
