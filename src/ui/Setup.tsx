import { useContext, useState } from "react";
import { FIT_CONFIG } from "../lib/config";
import { seed, updateSettings } from "../lib/db";
import { resolveEquipment } from "../lib/logic";
import { STARTER_EQUIPMENT, STARTER_TEMPLATES } from "../lib/seed";
import { Field, FitDataContext, go } from "./kit";
import { RestoreForm } from "./SyncPanel";

export default function Setup() {
  const data = useContext(FitDataContext);
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [club, setClub] = useState("");
  const [restoring, setRestoring] = useState(false);
  const gym = FIT_CONFIG.club ?? "your gym";

  // Seeded already (re-run from Settings, or reloaded mid-setup): go straight to the mapping check.
  if (data) return <MappingCheck />;

  const start = async (library: "starter" | "empty") => {
    setBusy(true);
    try {
      await seed(library, club);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fit-page fit-setup-flow">
      <p className="fit-eyebrow">Gym Floor Planner · setup {step} of 3</p>
      {step === 1 ? (
        <>
          <h1 className="fit-display">Your split</h1>
          <p>Five days a week at {gym}, in any order. Miss a day and it waits for you; every day comes up once a round.</p>
          <ol className="fit-splitpreview">
            {STARTER_TEMPLATES.map((t) => <li key={t.id}>{t.name}<small>{t.items.length} exercises</small></li>)}
          </ol>
          <p className="fit-muted">Every exercise starts at 3 sets of 12 / 10 / 8, heavier each set. Days, sets, reps and rest are all editable later in Program.</p>
          {FIT_CONFIG.club ? null : (
            <Field label="Your gym">
              <input className="fit-input" value={club} onChange={(e) => setClub(e.target.value)} placeholder="My gym" />
            </Field>
          )}
          {FIT_CONFIG.syncUrl ? (
            restoring ? (
              <RestoreForm replaceWarning={false} />
            ) : (
              <button type="button" className="fit-link" onClick={() => setRestoring(true)}>Already use it on another phone? Restore with your sync code</button>
            )
          ) : null}
          <div className="fit-dock">
            <button type="button" className="fit-btn fit-btn--primary fit-btn--block" onClick={() => setStep(2)}>Use this split</button>
          </div>
        </>
      ) : (
        <>
          <h1 className="fit-display">Your machines</h1>
          <p>The app routes every exercise to a machine on your floor. Start from a list of what a big gym usually has, or from nothing.</p>
          <button type="button" className="fit-option" disabled={busy} onClick={() => start("starter")}>
            <strong>Starter list · {STARTER_EQUIPMENT.length} machines</strong>
            <span>Already mapped to every exercise. Walk the floor once, add where each one is, delete what yours doesn&apos;t have.</span>
          </button>
          <button type="button" className="fit-option" disabled={busy} onClick={() => start("empty")}>
            <strong>Empty</strong>
            <span>Add each machine as you find it and link it to exercises yourself.</span>
          </button>
          <button type="button" className="fit-link" onClick={() => setStep(1)}>‹ Back</button>
        </>
      )}
    </div>
  );
}

function MappingCheck() {
  const data = useContext(FitDataContext)!;
  const { settings, tById, exById, eqById } = data;
  const days = settings.split_order.map((id) => tById.get(id)).filter((t) => t !== undefined);
  let flagged = 0;

  const rows = days.map((t) => ({
    t,
    items: t.items.map((it) => {
      const ex = exById.get(it.exercise_id);
      const eq = ex ? resolveEquipment(ex, eqById) : null;
      if (!eq) flagged++;
      return { id: it.exercise_id, name: ex?.name ?? "Deleted exercise", eq: eq ? eqById.get(eq) : undefined };
    }),
  }));

  const finish = async (to: string[]) => {
    await updateSettings({ setup_done: true });
    go(...to);
  };

  return (
    <div className="fit-page fit-setup-flow">
      <p className="fit-eyebrow">Gym Floor Planner · setup 3 of 3</p>
      <h1 className="fit-display">Mapping check</h1>
      <p>{flagged ? `${flagged} slot${flagged > 1 ? "s" : ""} have no machine at ${settings.club_name}. Tap one to map it.` : "Every exercise has a machine. Next: walk the floor and add where each one is."}</p>
      {rows.map(({ t, items }) => (
        <section key={t.id} className="fit-mapday">
          <h2 className="fit-h2">{t.name}</h2>
          <ul className="fit-mini">
            {items.map((i, n) => (
              <li key={`${i.id}-${n}`}>
                <span>{i.name}</span>
                {i.eq ? (
                  <span className="fit-muted">{i.eq.name}</span>
                ) : (
                  <button type="button" className="fit-link is-warn" onClick={() => finish(["library", "ex", i.id])}>no match — map it</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="fit-dock">
        <button type="button" className="fit-btn fit-btn--primary fit-btn--block" onClick={() => finish(["library"])}>Walk the floor: add locations</button>
        <button type="button" className="fit-btn fit-btn--ghost" onClick={() => finish(["today"])}>Later</button>
      </div>
    </div>
  );
}
