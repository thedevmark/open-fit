"use client";

import { useEffect, useState } from "react";
import { db, deleteTemplate, newId, updateSettings } from "../lib/db";
import { currentTemplateId, DEFAULT_SET_REPS, MUSCLE_LABEL, unmappedExercises, withSetReps } from "../lib/logic";
import type { DayTemplate, TemplateItem } from "../lib/types";
import { clock, ConfirmButton, Empty, Field, go, Stepper, TopBar, useFit } from "./kit";

export default function Program({ route }: { route: string[] }) {
  if (route[0] === "t" && route[1]) return <TemplateEditor id={route[1]} />;
  return <Overview />;
}

function Overview() {
  const { settings, templates, tById, exById, eqById } = useFit();
  const order = settings.split_order.filter((id) => tById.has(id));
  const next = currentTemplateId(settings);
  const outside = templates.filter((t) => !order.includes(t.id));
  const unmapped = unmappedExercises(order.map((id) => tById.get(id)!), exById, eqById);

  const reorder = (ids: string[]) => {
    const keep = next ? ids.indexOf(next) : -1;
    return updateSettings({ split_order: ids, current_position: keep >= 0 ? keep : 0 });
  };
  const move = (i: number, d: -1 | 1) => {
    const ids = [...order];
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    reorder(ids);
  };

  return (
    <div className="fit-page">
      <TopBar
        title="Program"
        sub={order.map((id) => tById.get(id)?.name).join(" › ")}
        right={<button type="button" className="fit-btn fit-btn--primary fit-btn--sm" onClick={() => go("program", "t", "new")}>+ Day</button>}
      />
      {unmapped.length ? (
        <section className="fit-callout">
          <strong>{unmapped.length} exercise{unmapped.length > 1 ? "s" : ""} with no machine at {settings.club_name}</strong>
          <ul className="fit-mini">
            {unmapped.map((u) => (
              <li key={u.exercise_id}>
                <button type="button" className="fit-link" onClick={() => go("library", "ex", u.exercise_id)}>{exById.get(u.exercise_id)?.name ?? u.exercise_id}</button>{" "}
                <span className="fit-muted">{u.templates.join(", ")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <h2 className="fit-h2">Rotation</h2>
      <p className="fit-muted">Do the days in any order. Each round, every day comes up once; one you skip or jump past stays next until you do it.</p>
      <ol className="fit-order fit-order--split">
        {order.map((id, i) => {
          const t = tById.get(id)!;
          const sets = t.items.reduce((n, it) => n + it.sets, 0);
          return (
            <li key={id} className={id === next ? "is-next" : undefined}>
              <span className="fit-order__n">{i + 1}</span>
              <button type="button" className="fit-order__name fit-order__name--btn" onClick={() => go("program", "t", id)}>
                {t.name}
                <small>{t.items.length} exercises · {sets} sets{settings.cycle_done?.includes(id) ? " · done this round" : ""}</small>
              </button>
              {id === next ? (
                <span className="fit-tag is-next">next</span>
              ) : (
                <button type="button" className="fit-btn fit-btn--ghost fit-btn--xs" onClick={() => updateSettings({ current_position: i, cycle_done: (settings.cycle_done ?? []).filter((x) => x !== id) })}>Make next</button>
              )}
              <button type="button" className="fit-iconbtn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${t.name} up`}>↑</button>
              <button type="button" className="fit-iconbtn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${t.name} down`}>↓</button>
            </li>
          );
        })}
      </ol>
      {order.length === 0 ? <Empty>No days in the rotation.</Empty> : null}
      {outside.length ? (
        <>
          <h2 className="fit-h2">Not in the rotation</h2>
          <ul className="fit-order">
            {outside.map((t) => (
              <li key={t.id}>
                <button type="button" className="fit-order__name fit-order__name--btn" onClick={() => go("program", "t", t.id)}>{t.name}<small>{t.items.length} exercises</small></button>
                <button type="button" className="fit-btn fit-btn--ghost fit-btn--xs" onClick={() => reorder([...order, t.id])}>Add</button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function TemplateEditor({ id }: { id: string }) {
  const { settings, tById, exById, exercises, templates } = useFit();
  const isNew = id === "new";
  const existing = tById.get(id);
  const [draft, setDraft] = useState<DayTemplate | null>(() =>
    isNew ? { id: newId(), name: "", order_in_split: templates.length, items: [] } : existing ? structuredClone(existing) : null,
  );
  useEffect(() => {
    if (!draft && existing) setDraft(structuredClone(existing));
  }, [draft, existing]);

  if (!draft) return <div className="fit-page"><TopBar title="Day" onBack={() => go("program")} /><Empty>That day is gone.</Empty></div>;
  const inSplit = settings.split_order.includes(draft.id);
  const setItem = (i: number, patch: Partial<TemplateItem>) =>
    setDraft({ ...draft, items: draft.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const move = (i: number, d: -1 | 1) => {
    const items = [...draft.items];
    [items[i], items[i + d]] = [items[i + d], items[i]];
    setDraft({ ...draft, items });
  };
  const add = (exerciseId: string) =>
    setDraft({ ...draft, items: [...draft.items, withSetReps({ exercise_id: exerciseId, sets: 3, rep_min: 8, rep_max: 12, rest_sec: settings.default_rest_sec }, DEFAULT_SET_REPS)] });

  const save = async () => {
    if (!draft.name.trim()) return;
    await db.templates.put({ ...draft, name: draft.name.trim() });
    if (isNew) await updateSettings({ split_order: [...settings.split_order, draft.id] });
    go("program");
  };

  return (
    <div className="fit-page">
      <TopBar title={isNew ? "New day" : draft.name || "Day"} onBack={() => go("program")} />
      <Field label="Name"><input className="fit-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Chest + Triceps" /></Field>
      <h2 className="fit-h2">{draft.items.length} exercises · {draft.items.reduce((n, it) => n + it.sets, 0)} sets</h2>
      <ol className="fit-items">
        {draft.items.map((it, i) => {
          const ex = exById.get(it.exercise_id);
          return (
            <li key={`${it.exercise_id}-${i}`} className="fit-item">
              <div className="fit-item__head">
                <span className="fit-order__n">{i + 1}</span>
                <button type="button" className="fit-item__name" onClick={() => go("library", "ex", it.exercise_id)}>
                  {ex?.name ?? "Deleted exercise"}
                  {ex ? <small>{MUSCLE_LABEL[ex.primary_muscle]}</small> : null}
                </button>
                <button type="button" className="fit-iconbtn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button type="button" className="fit-iconbtn" disabled={i === draft.items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button type="button" className="fit-iconbtn" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })} aria-label="Remove">×</button>
              </div>
              {it.reps ? (
                <>
                  <div className="fit-item__grid">
                    {it.reps.map((r, k) => (
                      <Stepper
                        key={k}
                        size="sm"
                        label={`Set ${k + 1} reps`}
                        value={r}
                        step={1}
                        min={1}
                        max={50}
                        onChange={(v) => setItem(i, withSetReps(it, it.reps!.map((x, j) => (j === k ? v : x))))}
                      />
                    ))}
                    <div className="fit-item__rest">
                      <Stepper size="sm" label={`Rest ${clock(it.rest_sec)}`} value={it.rest_sec} step={15} min={0} max={600} unit="s" onChange={(v) => setItem(i, { rest_sec: v })} />
                    </div>
                  </div>
                  <div className="fit-row">
                    <button type="button" className="fit-btn fit-btn--ghost fit-btn--sm" disabled={it.sets >= 12} onClick={() => setItem(i, withSetReps(it, [...it.reps!, it.reps![it.reps!.length - 1]]))}>+ Set</button>
                    <button type="button" className="fit-btn fit-btn--ghost fit-btn--sm" disabled={it.sets <= 1} onClick={() => setItem(i, withSetReps(it, it.reps!.slice(0, -1)))}>− Set</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="fit-item__grid">
                    <Stepper size="sm" label="Sets" value={it.sets} step={1} min={1} max={12} onChange={(v) => setItem(i, { sets: v })} />
                    <Stepper size="sm" label="Min reps" value={it.rep_min} step={1} min={1} max={it.rep_max} onChange={(v) => setItem(i, { rep_min: v })} />
                    <Stepper size="sm" label="Max reps" value={it.rep_max} step={1} min={it.rep_min} max={50} onChange={(v) => setItem(i, { rep_max: v })} />
                    <div className="fit-item__rest">
                      <Stepper size="sm" label={`Rest ${clock(it.rest_sec)}`} value={it.rest_sec} step={15} min={0} max={600} unit="s" onChange={(v) => setItem(i, { rest_sec: v })} />
                    </div>
                  </div>
                  <button type="button" className="fit-link" onClick={() => setItem(i, withSetReps(it, DEFAULT_SET_REPS))}>Use reps per set ({DEFAULT_SET_REPS.join(" / ")})</button>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <select className="fit-input" value="" onChange={(e) => e.target.value && add(e.target.value)} aria-label="Add an exercise">
        <option value="">+ Add an exercise…</option>
        {exercises.map((e) => <option key={e.id} value={e.id}>{e.name} · {MUSCLE_LABEL[e.primary_muscle]}</option>)}
      </select>
      <button type="button" className="fit-link" onClick={() => go("library", "ex", "new")}>Exercise not listed? Create it in the library.</button>
      <div className="fit-dock">
        <button type="button" className="fit-btn fit-btn--primary fit-btn--block" disabled={!draft.name.trim()} onClick={save}>Save day</button>
      </div>
      {!isNew ? (
        <div className="fit-row">
          {inSplit ? (
            <button
              type="button"
              className="fit-btn fit-btn--ghost"
              onClick={async () => {
                const next = currentTemplateId(settings);
                const ids = settings.split_order.filter((x) => x !== draft.id);
                const keep = next ? ids.indexOf(next) : -1;
                await updateSettings({ split_order: ids, current_position: keep >= 0 ? keep : 0 });
              }}
            >
              Take out of rotation
            </button>
          ) : null}
          <ConfirmButton confirm="Tap again — history stays" onConfirm={async () => { await deleteTemplate(draft.id); go("program"); }}>Delete day</ConfirmButton>
        </div>
      ) : null}
    </div>
  );
}
