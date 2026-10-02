import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { activeSession, db, deleteSet, logSet, machineHistory, updateSession, updateSet } from "../lib/db";
import { FIT_CONFIG } from "../lib/config";
import { HOWTO } from "../lib/howto";
import { prefill, resolveEquipment, stepFor, suggestNext, suggestPerSet, type PastSession } from "../lib/logic";
import type { Effort, Equipment, PlanItem, Session, SetLog } from "../lib/types";
import RestBar from "./RestBar";
import { clock, ConfirmButton, go, lb, shortDate, Stepper, useFit, useNow, useRest } from "./kit";

const EFFORTS: Effort[] = ["easy", "solid", "failure"];

export default function Workout() {
  const session = useLiveQuery(() => activeSession().then((s) => s ?? null), []);
  const sets = useLiveQuery(
    () => (session ? db.sets.where("session_id").equals(session.id).toArray() : Promise.resolve([] as SetLog[])),
    [session?.id],
  );

  useEffect(() => {
    if (session === null) go("today");
  }, [session]);

  if (!session || !sets) return <div className="fit-empty" aria-busy="true">Loading…</div>;
  if (session.plan.length === 0) return <div className="fit-empty">This session has no exercises.</div>;
  return <WorkoutBody session={session} sets={sets} />;
}

function WorkoutBody({ session, sets }: { session: Session; sets: SetLog[] }) {
  const { tById, exById } = useFit();
  const now = useNow(1000);
  const [overview, setOverview] = useState(false);
  const cursor = Math.min(Math.max(0, session.cursor), session.plan.length - 1);
  const item = session.plan[cursor];
  const done = (p: PlanItem) => sets.filter((s) => s.exercise_id === p.exercise_id).length;
  const allDone = session.plan.every((p) => done(p) >= p.sets);

  const setCursor = (i: number) => updateSession(session.id, { cursor: Math.min(Math.max(0, i), session.plan.length - 1) });
  const patchItem = (patch: Partial<PlanItem>) =>
    updateSession(session.id, { plan: session.plan.map((p, i) => (i === cursor ? { ...p, ...patch } : p)) });

  return (
    <div className="fit-workout">
      <header className="fit-wtop">
        <button type="button" className="fit-top__back" aria-label="Back to Today" onClick={() => go("today")}>‹</button>
        <button type="button" className="fit-wtop__title" onClick={() => setOverview((o) => !o)} aria-expanded={overview}>
          <strong>{tById.get(session.day_template_id)?.name ?? "Workout"}</strong>
          <span>{cursor + 1} of {session.plan.length} · {clock((now - session.started_at) / 1000)}</span>
        </button>
        <button type="button" className={`fit-btn fit-btn--sm ${allDone ? "fit-btn--primary" : "fit-btn--ghost"}`} onClick={() => go("summary")}>
          Finish
        </button>
      </header>

      {overview ? (
        <ol className="fit-overview">
          {session.plan.map((p, i) => {
            const n = done(p);
            return (
              <li key={`${p.exercise_id}-${i}`}>
                <button type="button" className={i === cursor ? "is-on" : undefined} onClick={() => { setCursor(i); setOverview(false); }}>
                  <span>{exById.get(p.exercise_id)?.name ?? "Exercise"}</span>
                  <span className={n >= p.sets ? "is-done" : undefined}>{n}/{p.sets}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}

      <ExerciseCard
        key={`${cursor}-${item.exercise_id}`}
        session={session}
        item={item}
        cursor={cursor}
        sets={sets}
        onPatch={patchItem}
        onNext={() => setCursor(cursor + 1)}
        onPrev={() => setCursor(cursor - 1)}
        isLast={cursor === session.plan.length - 1}
        allDone={allDone}
      />
    </div>
  );
}

function ExerciseCard({
  session, item, cursor, sets, onPatch, onNext, onPrev, isLast, allDone,
}: {
  session: Session;
  item: PlanItem;
  cursor: number;
  sets: SetLog[];
  onPatch: (p: Partial<PlanItem>) => Promise<unknown>;
  onNext: () => void;
  onPrev: () => void;
  isLast: boolean;
  allDone: boolean;
}) {
  const { exById, eqById } = useFit();
  const rest = useRest();
  const ex = exById.get(item.exercise_id);
  const eq = item.equipment_id ? eqById.get(item.equipment_id) : undefined;
  const [swapOpen, setSwapOpen] = useState(false);
  const [editing, setEditing] = useState<SetLog | null>(null);

  const exSets = sets.filter((s) => s.exercise_id === item.exercise_id).sort((a, b) => a.set_number - b.set_number);
  const onMachine = exSets.filter((s) => s.equipment_id === item.equipment_id);
  const history = useLiveQuery(
    () => (item.equipment_id ? machineHistory(item.exercise_id, item.equipment_id, session.id) : Promise.resolve([] as PastSession[])),
    [item.exercise_id, item.equipment_id, session.id],
  );

  const step = stepFor(eq);
  const suggestion = history ? (item.reps ? suggestPerSet(history, item.reps, step) : suggestNext(history, item, step)) : null;
  const nextNumber = exSets.length + 1;
  // Target for the set about to be logged; extra sets repeat the last one.
  const at = <T,>(list: readonly T[]) => list[Math.min(exSets.length, list.length - 1)];
  const setTarget = suggestion ? { weight_lb: at(suggestion.weights), reps: at(suggestion.reps) } : null;
  const fromHistory = history ? prefill(nextNumber, history[0], onMachine, item.reps ? at(item.reps) : item.rep_min) : null;
  // Per-set targets change weight every set, so start from the target, not the set before.
  const initial = item.reps
    ? setTarget ?? (fromHistory && { ...fromHistory, reps: at(item.reps) })
    : fromHistory;
  const targetDone = exSets.length >= item.sets;

  const swapTo = async (equipmentId: string) => {
    const taken = item.equipment_id && !item.taken.includes(item.equipment_id) ? [...item.taken, item.equipment_id] : item.taken;
    await onPatch({ equipment_id: equipmentId, taken: taken.filter((t) => t !== equipmentId) });
    setSwapOpen(false);
  };
  const nextFree = ex ? resolveEquipment(ex, eqById, [...item.taken, ...(item.equipment_id ? [item.equipment_id] : [])]) : null;

  const onLogged = () => {
    rest.start(item.rest_sec);
    // Last target set on this card → move on (rest timer keeps running).
    if (exSets.length + 1 === item.sets && !isLast) onNext();
  };

  if (!ex) {
    return (
      <section className="fit-card">
        <p className="fit-empty">This exercise was deleted from the library.</p>
        <button type="button" className="fit-btn fit-btn--ghost" onClick={onNext}>Next</button>
      </section>
    );
  }

  return (
    <>
      <section className="fit-card" aria-label={ex.name}>
        <div className="fit-card__nav">
          <button type="button" className="fit-iconbtn" onClick={onPrev} disabled={cursor === 0} aria-label="Previous exercise">‹</button>
          <h1 className="fit-card__title">{ex.name}</h1>
          <button type="button" className="fit-iconbtn" onClick={onNext} disabled={isLast} aria-label="Next exercise">›</button>
        </div>

        <div className="fit-machine">
          {eq ? (
            <>
              <p className="fit-machine__name">
                {eq.name} <span className="fit-machine__type">{eq.type}</span>
              </p>
              {eq.location_note ? <p className="fit-machine__loc">{eq.location_note}</p> : null}
              <SetupNote eq={eq} />
            </>
          ) : (
            <p className="fit-machine__name is-warn">No machine mapped — pick one below.</p>
          )}
          <div className="fit-machine__actions">
            <button
              type="button"
              className="fit-btn fit-btn--ghost fit-btn--sm"
              onClick={() => (nextFree ? swapTo(nextFree) : setSwapOpen(true))}
            >
              {nextFree ? `Machine taken → ${eqById.get(nextFree)?.name}` : "Machine taken"}
            </button>
            <button type="button" className="fit-btn fit-btn--ghost fit-btn--sm" onClick={() => setSwapOpen((o) => !o)} aria-expanded={swapOpen}>
              All options
            </button>
          </div>
          {swapOpen ? (
            <ul className="fit-swap">
              {ex.equipment_options.map((id) => {
                const o = eqById.get(id);
                if (!o) return null;
                const taken = item.taken.includes(id);
                return (
                  <li key={id}>
                    <button type="button" disabled={id === item.equipment_id} onClick={() => swapTo(id)}>
                      <span>{o.name}</span>
                      <span className="fit-swap__meta">
                        {id === item.equipment_id ? "using" : !o.available ? "out of order" : taken ? "was taken" : o.location_note || o.type}
                      </span>
                    </button>
                  </li>
                );
              })}
              {ex.equipment_options.length === 0 ? <li className="fit-empty">No machines linked to this exercise.</li> : null}
              <li>
                <button type="button" onClick={() => go("library", "ex", ex.id)}>
                  <span>Edit options for {ex.name}…</span>
                </button>
              </li>
            </ul>
          ) : null}
        </div>

        <HowTo key={item.exercise_id} exerciseId={item.exercise_id} />

        <div className="fit-target">
          <span className="fit-target__main">
            {item.reps ? `${item.reps.join(" / ")} reps` : `${item.sets} × ${item.rep_min}–${item.rep_max}`}
            {item.sets < item.template_sets ? <em> (trimmed from {item.template_sets})</em> : null}
          </span>
          <span className="fit-target__rest">rest {clock(item.rest_sec)}</span>
        </div>

        {history === undefined ? null : suggestion ? (
          <p className={`fit-suggest is-${suggestion.rule}`}>
            <strong>
              Set {nextNumber}: aim {lb(setTarget!.weight_lb)} lb × {setTarget!.reps}
            </strong>{" "}
            <span>{suggestion.reason}</span>
          </p>
        ) : item.equipment_id ? (
          <p className="fit-suggest">
            <strong>First time on this machine.</strong> <span>Today sets the baseline.</span>
          </p>
        ) : null}

        {history && history[0] ? (
          <p className="fit-last">
            Last {shortDate(history[0].at)}: {history[0].sets.map((s) => `${lb(s.weight_lb)}×${s.reps}`).join(" · ")}
          </p>
        ) : null}

        {exSets.length ? (
          <ol className="fit-sets" aria-label="Logged sets">
            {exSets.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setEditing(s)} aria-label={`Edit set ${s.set_number}`}>
                  <span className="fit-sets__n">{s.set_number}</span>
                  <span className="fit-sets__v">{lb(s.weight_lb)} × {s.reps}</span>
                  {s.equipment_id !== item.equipment_id ? <span className="fit-sets__eq">{eqById.get(s.equipment_id)?.name ?? "other machine"}</span> : null}
                  {s.effort ? <span className={`fit-tag is-${s.effort}`}>{s.effort}</span> : null}
                  {s.note ? <span className="fit-sets__note">“{s.note}”</span> : null}
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <div className="fit-logdock">
        <RestBar />
        {editing ? (
          <EditSet log={editing} step={stepFor(eqById.get(editing.equipment_id))} onClose={() => setEditing(null)} />
        ) : item.equipment_id && initial ? (
          <Logger
            key={`${item.equipment_id}-${nextNumber}`}
            initial={initial}
            suggestion={setTarget}
            step={step}
            label={targetDone ? `Log extra set ${nextNumber}` : `Log set ${nextNumber} of ${item.sets}`}
            extra={targetDone}
            onLog={async (v) => {
              await logSet({
                session_id: session.id,
                exercise_id: item.exercise_id,
                equipment_id: item.equipment_id!,
                set_number: nextNumber,
                ...v,
              });
              onLogged();
            }}
          />
        ) : null}
        {targetDone && !editing ? (
          isLast || allDone ? (
            <button type="button" className="fit-btn fit-btn--primary fit-btn--block" onClick={() => go("summary")}>
              {allDone ? "All done — finish" : "Finish workout"}
            </button>
          ) : (
            <button type="button" className="fit-btn fit-btn--ghost fit-btn--block" onClick={onNext}>Next exercise ›</button>
          )
        ) : null}
      </div>
    </>
  );
}

/** Start / finish photos and steps, folded away until asked for. */
function HowTo({ exerciseId }: { exerciseId: string }) {
  const h = HOWTO[exerciseId];
  if (!h) return null;
  return (
    <details className="fit-howto">
      <summary>How to do it</summary>
      <div className="fit-howto__pics">
        {h.images.map((src, i) => (
          <figure key={src}>
            {/* Static export: plain img, the files are pre-sized webp. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${FIT_CONFIG.base}${src}`} alt={`${h.name}, ${i === 0 ? "start" : "finish"} position`} loading="lazy" width={480} height={320} />
            <figcaption>{i === 0 ? "Start" : "Finish"}</figcaption>
          </figure>
        ))}
      </div>
      <ol className="fit-howto__steps">
        {h.steps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>
    </details>
  );
}

function Logger({
  initial, suggestion, step, label, extra, onLog,
}: {
  initial: { weight_lb: number; reps: number };
  suggestion: { weight_lb: number; reps: number } | null;
  step: number;
  label: string;
  extra: boolean;
  onLog: (v: { weight_lb: number; reps: number; effort: Effort | null; note: string }) => Promise<void>;
}) {
  const [weight, setWeight] = useState(initial.weight_lb);
  const [reps, setReps] = useState(initial.reps);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const matches = suggestion && suggestion.weight_lb === weight && suggestion.reps === reps;

  return (
    <div className={`fit-logger${extra ? " is-extra" : ""}`}>
      <div className="fit-logger__steppers">
        <Stepper label="Weight" unit="lb" value={weight} step={step || 5} onChange={setWeight} />
        <Stepper label="Reps" value={reps} step={1} max={100} onChange={setReps} />
      </div>
      <div className="fit-logger__row">
        {EFFORTS.map((e) => (
          <button key={e} type="button" className={`fit-chip fit-chip--sm${effort === e ? ` is-on is-${e}` : ""}`} aria-pressed={effort === e} onClick={() => setEffort(effort === e ? null : e)}>
            {e}
          </button>
        ))}
        <button type="button" className={`fit-chip fit-chip--sm${noteOpen || note ? " is-on" : ""}`} aria-expanded={noteOpen} onClick={() => setNoteOpen((o) => !o)}>
          note
        </button>
        {suggestion && !matches ? (
          <button type="button" className="fit-chip fit-chip--sm fit-chip--accent" onClick={() => { setWeight(suggestion.weight_lb); setReps(suggestion.reps); }}>
            use {lb(suggestion.weight_lb)}×{suggestion.reps}
          </button>
        ) : null}
      </div>
      {noteOpen ? (
        <input className="fit-input" placeholder="Note for this set" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />
      ) : null}
      <button
        type="button"
        className={`fit-btn fit-btn--done fit-btn--block${extra ? " is-extra" : ""}`}
        disabled={busy || reps <= 0}
        onClick={async () => {
          setBusy(true);
          try {
            await onLog({ weight_lb: weight, reps, effort, note: note.trim() });
          } finally {
            setBusy(false);
          }
        }}
      >
        <span>Done</span>
        <small>{label}</small>
      </button>
    </div>
  );
}

function EditSet({ log, step, onClose }: { log: SetLog; step: number; onClose: () => void }) {
  const [weight, setWeight] = useState(log.weight_lb);
  const [reps, setReps] = useState(log.reps);
  const [effort, setEffort] = useState<Effort | null>(log.effort);
  const [note, setNote] = useState(log.note);
  return (
    <div className="fit-logger fit-logger--edit">
      <p className="fit-logger__title">Edit set {log.set_number}</p>
      <div className="fit-logger__steppers">
        <Stepper label="Weight" unit="lb" value={weight} step={step || 5} onChange={setWeight} />
        <Stepper label="Reps" value={reps} step={1} max={100} onChange={setReps} />
      </div>
      <div className="fit-logger__row">
        {EFFORTS.map((e) => (
          <button key={e} type="button" className={`fit-chip fit-chip--sm${effort === e ? ` is-on is-${e}` : ""}`} aria-pressed={effort === e} onClick={() => setEffort(effort === e ? null : e)}>
            {e}
          </button>
        ))}
      </div>
      <input className="fit-input" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />
      <div className="fit-logger__row fit-logger__row--end">
        <ConfirmButton confirm="Tap again to delete" onConfirm={async () => { await deleteSet(log.id); onClose(); }} className="fit-btn fit-btn--danger fit-btn--sm">
          Delete
        </ConfirmButton>
        <button type="button" className="fit-btn fit-btn--ghost fit-btn--sm" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="fit-btn fit-btn--primary fit-btn--sm"
          onClick={async () => { await updateSet(log.id, { weight_lb: weight, reps, effort, note: note.trim() }); onClose(); }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

/** Setup notes are written once, right here at the machine, and shown every visit after. */
function SetupNote({ eq }: { eq: Equipment }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(eq.setup_note);
  if (editing) {
    return (
      <div className="fit-setup fit-setup--edit">
        <input className="fit-input" autoFocus placeholder="Seat 4, pad 2…" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={160} />
        <button type="button" className="fit-btn fit-btn--primary fit-btn--sm" onClick={async () => { await db.equipment.update(eq.id, { setup_note: draft.trim() }); setEditing(false); }}>
          Save
        </button>
      </div>
    );
  }
  return (
    <button type="button" className={`fit-setup${eq.setup_note ? "" : " is-empty"}`} onClick={() => { setDraft(eq.setup_note); setEditing(true); }}>
      {eq.setup_note ? eq.setup_note : "+ Add setup note (seat, pads)"}
    </button>
  );
}
