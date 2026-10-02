import { useMemo, useState } from "react";
import { CATALOG, CATALOG_GROUPS, decodeMachines, searchCatalog, type CatalogMachine, type MachineRequest } from "../lib/catalog";
import { addMachines } from "../lib/db";
import { Field, go, TopBar, useFit } from "./kit";

const TYPE_LABEL: Record<string, string> = {
  "plate-loaded": "Plates",
  selectorized: "Pin stack",
  cable: "Cable",
  "free weight": "Free weights",
  bodyweight: "Bodyweight",
  cardio: "Cardio",
};

/** Library → + Machine: type what's on the sticker, tap to add. */
export function QuickAdd() {
  const { equipment, exercises } = useFit();
  const [q, setQ] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [own, setOwn] = useState(false);
  const names = useMemo(() => new Map(exercises.map((x) => [x.id, x.name])), [exercises]);
  const haveIds = useMemo(() => new Set(equipment.map((e) => e.id)), [equipment]);
  const have = (c: CatalogMachine) => added.has(c.id) || haveIds.has(c.id) || (!!c.same_as && haveIds.has(c.same_as));
  const results = q.trim() ? searchCatalog(q, names) : null;

  const add = async (c: CatalogMachine) => {
    await addMachines([{ catalog: c.id }]);
    setAdded(new Set(added).add(c.id));
  };

  const row = (c: CatalogMachine) => (
    <li key={c.id} className="fit-catalog__row">
      <span className="fit-list__main">
        <span className="fit-list__title">{c.name}</span>
        <span className="fit-list__sub">
          {TYPE_LABEL[c.type]}{c.exercises.length ? ` · ${c.exercises.map((id) => names.get(id) ?? c.adds?.find((a) => a.id === id)?.name ?? id).join(", ")}` : ""}
        </span>
      </span>
      {have(c) ? (
        <span className="fit-tag is-fresh">{added.has(c.id) ? "Added" : "Have it"}</span>
      ) : (
        <button type="button" className="fit-btn fit-btn--ghost fit-btn--sm" onClick={() => add(c)}>Add</button>
      )}
    </li>
  );

  if (own) return <OwnMachine onDone={() => go("library")} onBack={() => setOwn(false)} />;

  return (
    <div className="fit-page">
      <TopBar title="Add machines" onBack={() => go("library")} />
      <input
        className="fit-input fit-search"
        type="search"
        autoFocus
        placeholder="What's on the sticker? Brand, model or what it does"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search machines"
      />
      {results ? (
        results.length ? <ul className="fit-catalog">{results.map(row)}</ul> : <p className="fit-empty">Nothing matches “{q}”.</p>
      ) : (
        CATALOG_GROUPS.map((g) => (
          <section key={g} className="fit-catalog__group">
            <h2 className="fit-h2">{g}</h2>
            <ul className="fit-catalog">{CATALOG.filter((c) => c.group === g).map(row)}</ul>
          </section>
        ))
      )}
      <button type="button" className="fit-btn fit-btn--ghost fit-btn--block" onClick={() => setOwn(true)}>Not listed? Add your own</button>
    </div>
  );
}

/** A machine the catalog doesn't have: a name and what you do on it. Everything else is worked out. */
function OwnMachine({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { exercises } = useFit();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const sorted = useMemo(() => [...exercises].sort((a, b) => a.name.localeCompare(b.name)), [exercises]);
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  return (
    <div className="fit-page">
      <TopBar title="Your own machine" onBack={onBack} />
      <Field label="Name"><input className="fit-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Plate-loaded chest fly" /></Field>
      <div className="fit-field">
        <span className="fit-field__label">What do you do on it?</span>
        <div className="fit-chips">
          {sorted.map((x) => (
            <button key={x.id} type="button" className={`fit-chip${picked.includes(x.id) ? " is-on" : ""}`} aria-pressed={picked.includes(x.id)} onClick={() => toggle(x.id)}>
              {x.name}
            </button>
          ))}
        </div>
      </div>
      <Field label="Where is it? (optional)"><input className="fit-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Back left by the windows" /></Field>
      <div className="fit-dock">
        <button
          type="button"
          className="fit-btn fit-btn--primary fit-btn--block"
          disabled={!name.trim()}
          onClick={async () => { await addMachines([{ name, exercises: picked, location }]); onDone(); }}
        >
          Add machine
        </button>
      </div>
    </div>
  );
}

/** #/add-machines/<payload>: a list of machines someone put together for you (e.g. from photos of the floor). */
export function AddFromLink({ payload }: { payload: string | undefined }) {
  const { equipment } = useFit();
  const requests = useMemo(() => (payload ? decodeMachines(payload) : null), [payload]);
  const [done, setDone] = useState<number | null>(null);
  const byId = useMemo(() => new Map(CATALOG.map((c) => [c.id, c])), []);
  const haveIds = new Set(equipment.map((e) => e.id));

  if (!requests) {
    return (
      <div className="fit-page">
        <TopBar title="Add machines" onBack={() => go("library")} />
        <p className="fit-empty">This link doesn&apos;t contain any machines.</p>
      </div>
    );
  }
  const label = (r: MachineRequest) => (r.catalog ? byId.get(r.catalog)?.name : r.name) ?? r.catalog ?? "Machine";
  const already = (r: MachineRequest) => {
    const c = r.catalog ? byId.get(r.catalog) : undefined;
    return !!c && (haveIds.has(c.id) || (!!c.same_as && haveIds.has(c.same_as)));
  };

  return (
    <div className="fit-page">
      <TopBar title="Add machines" sub={`${requests.length} from a shared list`} onBack={() => go("library")} />
      <ul className="fit-catalog">
        {requests.map((r, i) => (
          <li key={i} className="fit-catalog__row">
            <span className="fit-list__main">
              <span className="fit-list__title">{label(r)}</span>
              <span className="fit-list__sub">{r.location || "no location"}{already(r) ? " · already here, gets this name and spot" : ""}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="fit-dock">
        {done === null ? (
          <button type="button" className="fit-btn fit-btn--primary fit-btn--block" onClick={async () => setDone(await addMachines(requests))}>
            Add all
          </button>
        ) : (
          <button type="button" className="fit-btn fit-btn--primary fit-btn--block" onClick={() => go("library")}>
            Done: {done} new, the rest updated · see machines
          </button>
        )}
      </div>
    </div>
  );
}
