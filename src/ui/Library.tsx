import { useEffect, useMemo, useState } from "react";
import { db, deleteEquipment, deleteExercise, newId } from "../lib/db";
import { DEFAULT_STEP_LB, EQUIPMENT_TYPES, MUSCLE_LABEL, MUSCLES, stepFor } from "../lib/logic";
import type { Equipment, Exercise, Muscle } from "../lib/types";
import { Chip, ConfirmButton, Empty, Field, go, Seg, Stepper, TopBar, useFit } from "./kit";

type Tab = "machines" | "exercises";

export default function Library({ route }: { route: string[] }) {
  if (route[0] === "eq" && route[1]) return <EquipmentEditor id={route[1]} />;
  if (route[0] === "ex" && route[1]) return <ExerciseEditor id={route[1]} />;
  const tab: Tab = route[0] === "exercises" ? "exercises" : "machines";
  return (
    <div className="fit-page">
      <TopBar
        title="Library"
        right={
          <button type="button" className="fit-btn fit-btn--primary fit-btn--sm" onClick={() => go("library", tab === "machines" ? "eq" : "ex", "new")}>
            + {tab === "machines" ? "Machine" : "Exercise"}
          </button>
        }
      />
      <Seg<Tab> label="Library view" value={tab} onChange={(t) => go("library", t)} options={[{ value: "machines", label: "Machines" }, { value: "exercises", label: "Exercises" }]} />
      {tab === "machines" ? <MachineList /> : <ExerciseList />}
    </div>
  );
}

function MachineList() {
  const { equipment } = useFit();
  const [q, setQ] = useState("");
  const shown = equipment.filter((e) => `${e.name} ${e.location_note} ${e.type}`.toLowerCase().includes(q.trim().toLowerCase()));
  const noLocation = equipment.filter((e) => !e.location_note).length;
  return (
    <>
      <input className="fit-input fit-search" type="search" placeholder="Search machines" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search machines" />
      {noLocation > 0 && equipment.length > 0 ? (
        <p className="fit-muted">{noLocation} of {equipment.length} still need a location note — add them as you walk the floor.</p>
      ) : null}
      {equipment.length === 0 ? <Empty>No machines yet. Walk the club and add each one with “+ Machine”.</Empty> : null}
      <ul className="fit-list">
        {shown.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => go("library", "eq", e.id)}>
              <span className="fit-list__main">
                <span className="fit-list__title">{e.name}</span>
                <span className="fit-list__sub">{e.type}{e.location_note ? ` · ${e.location_note}` : " · no location yet"}</span>
              </span>
              {!e.available ? <span className="fit-tag is-fatigued">out</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function ExerciseList() {
  const { exercises, eqById } = useFit();
  const [q, setQ] = useState("");
  const shown = exercises.filter((e) => `${e.name} ${MUSCLE_LABEL[e.primary_muscle]}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <input className="fit-input fit-search" type="search" placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" />
      <ul className="fit-list">
        {shown.map((e) => {
          const first = e.equipment_options.map((id) => eqById.get(id)).find((x) => x?.available);
          return (
            <li key={e.id}>
              <button type="button" onClick={() => go("library", "ex", e.id)}>
                <span className="fit-list__main">
                  <span className="fit-list__title">{e.name}</span>
                  <span className={`fit-list__sub${first ? "" : " is-warn"}`}>
                    {MUSCLE_LABEL[e.primary_muscle]} · {first ? `${first.name}${e.equipment_options.length > 1 ? ` +${e.equipment_options.length - 1}` : ""}` : "no machine mapped"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function blankEquipment(): Equipment {
  return { id: newId(), name: "", type: "selectorized", muscles: [], location_note: "", setup_note: "", available: true };
}

function EquipmentEditor({ id }: { id: string }) {
  const { eqById, exercises } = useFit();
  const isNew = id === "new";
  const existing = eqById.get(id);
  const [draft, setDraft] = useState<Equipment | null>(() => (isNew ? blankEquipment() : existing ? { ...existing } : null));
  const [linkTo, setLinkTo] = useState("");
  useEffect(() => {
    if (!draft && existing) setDraft({ ...existing });
  }, [draft, existing]);

  if (!draft) return <div className="fit-page"><TopBar title="Machine" onBack={() => go("library")} /><Empty>That machine is gone.</Empty></div>;
  const set = (patch: Partial<Equipment>) => setDraft({ ...draft, ...patch });
  const usedBy = exercises.filter((e) => e.equipment_options.includes(draft.id));
  const save = async () => {
    if (!draft.name.trim()) return;
    await db.transaction("rw", [db.equipment, db.exercises], async () => {
      await db.equipment.put({ ...draft, name: draft.name.trim(), location_note: draft.location_note.trim(), setup_note: draft.setup_note.trim() });
      const ex = linkTo ? await db.exercises.get(linkTo) : undefined;
      if (ex && !ex.equipment_options.includes(draft.id)) await db.exercises.update(ex.id, { equipment_options: [...ex.equipment_options, draft.id] });
    });
    go("library");
  };

  return (
    <div className="fit-page">
      <TopBar title={isNew ? "New machine" : draft.name || "Machine"} onBack={() => go("library")} />
      <Field label="Name"><input className="fit-input" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Plate-loaded incline press" /></Field>
      <Field label="Type">
        <div className="fit-chips">
          {EQUIPMENT_TYPES.map((t) => <Chip key={t} on={draft.type === t} onClick={() => set({ type: t })}>{t}</Chip>)}
        </div>
      </Field>
      <Field label="Where it is" hint="What you'd tell yourself walking in: “back left by windows”.">
        <input className="fit-input" value={draft.location_note} onChange={(e) => set({ location_note: e.target.value })} placeholder="Back left by windows" />
      </Field>
      <Field label="Setup" hint="Seat, pads, handles — shown on the exercise card every time.">
        <input className="fit-input" value={draft.setup_note} onChange={(e) => set({ setup_note: e.target.value })} placeholder="Seat 4, pad 2" />
      </Field>
      <div className="fit-field">
        <span className="fit-field__label">Weight step</span>
        <Stepper size="sm" label="Step" unit="lb" value={stepFor(draft)} step={2.5} min={0} max={100} onChange={(v) => set({ step_lb: v })} />
        <span className="fit-field__hint">
          Default for {draft.type}: {DEFAULT_STEP_LB[draft.type]} lb{draft.type === "plate-loaded" ? " (5/side, log total plates)" : draft.type === "free weight" ? " (per dumbbell)" : ""}.
          {typeof draft.step_lb === "number" ? <> <button type="button" className="fit-link" onClick={() => set({ step_lb: undefined })}>Use default</button></> : null}
        </span>
      </div>
      <Field label="Muscles">
        <div className="fit-chips">
          {MUSCLES.map((m) => (
            <Chip key={m} on={draft.muscles.includes(m)} onClick={() => set({ muscles: draft.muscles.includes(m) ? draft.muscles.filter((x) => x !== m) : [...draft.muscles, m] })}>
              {MUSCLE_LABEL[m]}
            </Chip>
          ))}
        </div>
      </Field>
      <label className="fit-toggle">
        <input type="checkbox" checked={draft.available} onChange={(e) => set({ available: e.target.checked })} />
        <span>Available at the club (untick when it's out of order — swaps skip it)</span>
      </label>
      <div className="fit-field">
        <span className="fit-field__label">Used by</span>
        {usedBy.length ? (
          <ul className="fit-mini">
            {usedBy.map((e) => (
              <li key={e.id}><button type="button" className="fit-link" onClick={() => go("library", "ex", e.id)}>{e.name}</button> <span className="fit-muted">option {e.equipment_options.indexOf(draft.id) + 1}</span></li>
            ))}
          </ul>
        ) : <p className="fit-muted">No exercise uses this machine yet.</p>}
        <select className="fit-input" value={linkTo} onChange={(e) => setLinkTo(e.target.value)} aria-label="Link to an exercise">
          <option value="">Link to an exercise on save…</option>
          {exercises.filter((e) => !e.equipment_options.includes(draft.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div className="fit-dock">
        <button type="button" className="fit-btn fit-btn--primary fit-btn--block" disabled={!draft.name.trim()} onClick={save}>Save machine</button>
      </div>
      {!isNew ? (
        <ConfirmButton confirm="Tap again — history stays" onConfirm={async () => { await deleteEquipment(draft.id); go("library"); }}>Delete machine</ConfirmButton>
      ) : null}
    </div>
  );
}

function blankExercise(): Exercise {
  return { id: newId(), name: "", primary_muscle: "chest", secondary_muscles: [], equipment_options: [] };
}

function ExerciseEditor({ id }: { id: string }) {
  const { exById, eqById, equipment, templates } = useFit();
  const isNew = id === "new";
  const existing = exById.get(id);
  const [draft, setDraft] = useState<Exercise | null>(() => (isNew ? blankExercise() : existing ? { ...existing } : null));
  useEffect(() => {
    if (!draft && existing) setDraft({ ...existing });
  }, [draft, existing]);
  const usedIn = useMemo(() => templates.filter((t) => t.items.some((i) => i.exercise_id === id)), [templates, id]);

  if (!draft) return <div className="fit-page"><TopBar title="Exercise" onBack={() => go("library", "exercises")} /><Empty>That exercise is gone.</Empty></div>;
  const set = (patch: Partial<Exercise>) => setDraft({ ...draft, ...patch });
  const opts = draft.equipment_options;
  const move = (i: number, d: -1 | 1) => {
    const next = [...opts];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set({ equipment_options: next });
  };
  const suggested = equipment.filter((e) => !opts.includes(e.id) && e.muscles.includes(draft.primary_muscle));
  const rest = equipment.filter((e) => !opts.includes(e.id) && !e.muscles.includes(draft.primary_muscle));

  return (
    <div className="fit-page">
      <TopBar title={isNew ? "New exercise" : draft.name || "Exercise"} sub={usedIn.length ? `In ${usedIn.map((t) => t.name).join(", ")}` : undefined} onBack={() => go("library", "exercises")} />
      <Field label="Name"><input className="fit-input" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Incline press" /></Field>
      <Field label="Primary muscle">
        <select className="fit-input" value={draft.primary_muscle} onChange={(e) => set({ primary_muscle: e.target.value as Muscle, secondary_muscles: draft.secondary_muscles.filter((m) => m !== e.target.value) })}>
          {MUSCLES.map((m) => <option key={m} value={m}>{MUSCLE_LABEL[m]}</option>)}
        </select>
      </Field>
      <Field label="Secondary muscles" hint="Count half toward recovery and weekly sets.">
        <div className="fit-chips">
          {MUSCLES.filter((m) => m !== draft.primary_muscle).map((m) => (
            <Chip key={m} on={draft.secondary_muscles.includes(m)} onClick={() => set({ secondary_muscles: draft.secondary_muscles.includes(m) ? draft.secondary_muscles.filter((x) => x !== m) : [...draft.secondary_muscles, m] })}>
              {MUSCLE_LABEL[m]}
            </Chip>
          ))}
        </div>
      </Field>
      <div className="fit-field">
        <span className="fit-field__label">Machines, in order of preference</span>
        <span className="fit-field__hint">The app routes you to the first one that's available; “Machine taken” falls down this list.</span>
        {opts.length === 0 ? <p className="fit-warn">No machine yet — this exercise gets flagged on Today.</p> : null}
        <ol className="fit-order">
          {opts.map((eid, i) => {
            const e = eqById.get(eid);
            return (
              <li key={eid}>
                <span className="fit-order__n">{i + 1}</span>
                <span className="fit-order__name">
                  {e?.name ?? "Deleted machine"}
                  {e && !e.available ? <span className="fit-tag is-fatigued">out</span> : null}
                  {e?.location_note ? <small>{e.location_note}</small> : null}
                </span>
                <button type="button" className="fit-iconbtn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button type="button" className="fit-iconbtn" disabled={i === opts.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button type="button" className="fit-iconbtn" onClick={() => set({ equipment_options: opts.filter((x) => x !== eid) })} aria-label="Remove">×</button>
              </li>
            );
          })}
        </ol>
        <select className="fit-input" value="" onChange={(e) => e.target.value && set({ equipment_options: [...opts, e.target.value] })} aria-label="Add a machine">
          <option value="">+ Add a machine…</option>
          {suggested.length ? (
            <optgroup label={`Tagged ${MUSCLE_LABEL[draft.primary_muscle]}`}>
              {suggested.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </optgroup>
          ) : null}
          <optgroup label="Everything else">
            {rest.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </optgroup>
        </select>
      </div>
      <div className="fit-dock">
        <button
          type="button"
          className="fit-btn fit-btn--primary fit-btn--block"
          disabled={!draft.name.trim()}
          onClick={async () => { await db.exercises.put({ ...draft, name: draft.name.trim() }); go("library", "exercises"); }}
        >
          Save exercise
        </button>
      </div>
      {!isNew ? (
        <ConfirmButton confirm={usedIn.length ? `Tap again — removes it from ${usedIn.length} day${usedIn.length > 1 ? "s" : ""}` : "Tap again — history stays"} onConfirm={async () => { await deleteExercise(draft.id); go("library", "exercises"); }}>
          Delete exercise
        </ConfirmButton>
      ) : null}
    </div>
  );
}
