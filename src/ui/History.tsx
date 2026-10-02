import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, deleteSession, updateSession } from "../lib/db";
import { DEFAULT_RIDE_MILES, groupBySession, MUSCLE_LABEL, MUSCLES, ridesFrom, ridesOn, RIDE_MUSCLES, setScore, setsPerMuscle, topSet, weekStart, type PastSession } from "../lib/logic";
import type { SetLog } from "../lib/types";
import { SessionLines, sessionLines, SessionRide } from "./Summary";
import { ConfirmButton, duration, Empty, go, lb, Seg, shortDate, TopBar, useFit } from "./kit";

type Tab = "exercises" | "sessions" | "weekly";

export default function History({ route }: { route: string[] }) {
  if (route[0] === "ex" && route[1]) return <ExerciseHistory id={route[1]} />;
  if (route[0] === "s" && route[1]) return <SessionDetail id={route[1]} />;
  const tab: Tab = route[0] === "sessions" || route[0] === "weekly" ? route[0] : "exercises";
  return (
    <div className="fit-page">
      <TopBar title="History" />
      <Seg<Tab>
        label="History view"
        value={tab}
        onChange={(t) => go("history", t)}
        options={[{ value: "exercises", label: "Exercises" }, { value: "sessions", label: "Sessions" }, { value: "weekly", label: "Weekly" }]}
      />
      {tab === "exercises" ? <ExerciseList /> : tab === "sessions" ? <SessionList /> : <Weekly />}
    </div>
  );
}

function ExerciseList() {
  const { exById } = useFit();
  const sets = useLiveQuery(() => db.sets.toArray(), []);
  const rows = useMemo(() => {
    const by = new Map<string, { last: number; lastSession: string; sessions: Map<string, SetLog[]> }>();
    for (const s of sets ?? []) {
      const r = by.get(s.exercise_id) ?? { last: 0, lastSession: s.session_id, sessions: new Map<string, SetLog[]>() };
      r.sessions.set(s.session_id, [...(r.sessions.get(s.session_id) ?? []), s]);
      if (s.logged_at > r.last) { r.last = s.logged_at; r.lastSession = s.session_id; }
      by.set(s.exercise_id, r);
    }
    // Top set from the most recent session only.
    return [...by]
      .map(([id, r]) => [id, { last: r.last, count: r.sessions.size, top: topSet(r.sessions.get(r.lastSession) ?? []) }] as const)
      .sort((a, b) => b[1].last - a[1].last);
  }, [sets]);

  if (!sets) return null;
  if (rows.length === 0) return <Empty>Nothing logged yet. Your first workout shows up here.</Empty>;
  return (
    <ul className="fit-list">
      {rows.map(([id, r]) => (
        <li key={id}>
          <button type="button" onClick={() => go("history", "ex", id)}>
            <span className="fit-list__main">
              <span className="fit-list__title">{exById.get(id)?.name ?? "Deleted exercise"}</span>
              <span className="fit-list__sub">{r.count} session{r.count === 1 ? "" : "s"} · last {shortDate(r.last)}</span>
            </span>
            {r.top ? <span className="fit-list__value">{lb(r.top.weight_lb)}×{r.top.reps}</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ExerciseHistory({ id }: { id: string }) {
  const { exById, eqById } = useFit();
  const sets = useLiveQuery(() => db.sets.where("exercise_id").equals(id).toArray(), [id]);
  const machines = useMemo(() => {
    const last = new Map<string, number>();
    for (const s of sets ?? []) last.set(s.equipment_id, Math.max(last.get(s.equipment_id) ?? 0, s.logged_at));
    return [...last].sort((a, b) => b[1] - a[1]).map(([eid]) => eid);
  }, [sets]);
  const [picked, setPicked] = useState<string | null>(null);
  const machine = picked && machines.includes(picked) ? picked : machines[0];
  const sessions = useMemo(() => groupBySession((sets ?? []).filter((s) => s.equipment_id === machine)), [sets, machine]);
  const ex = exById.get(id);

  // PR flags walk oldest → newest: a session is a PR if its top set beats every earlier one.
  const prs = useMemo(() => {
    const flags = new Set<string>();
    let best = -Infinity;
    [...sessions].reverse().forEach((s, i) => {
      const t = topSet(s.sets);
      const score = t ? setScore(t) : 0;
      if (i > 0 && score > best) flags.add(s.session_id);
      best = Math.max(best, score);
    });
    return flags;
  }, [sessions]);

  return (
    <div className="fit-page">
      <TopBar title={ex?.name ?? "Exercise"} sub="Progress per machine — weights don't transfer" onBack={() => go("history")} />
      {!sets ? null : machines.length === 0 ? (
        <Empty>No sets logged for this exercise yet.</Empty>
      ) : (
        <>
          {machines.length > 1 ? (
            <div className="fit-chips" role="group" aria-label="Machine">
              {machines.map((m) => (
                <button key={m} type="button" className={`fit-chip${m === machine ? " is-on" : ""}`} aria-pressed={m === machine} onClick={() => setPicked(m)}>
                  {eqById.get(m)?.name ?? "Deleted machine"}
                </button>
              ))}
            </div>
          ) : (
            <p className="fit-muted">{eqById.get(machine)?.name ?? "Deleted machine"}</p>
          )}
          <TrendChart sessions={sessions} />
          <h2 className="fit-h2">Last {Math.min(5, sessions.length)} sessions</h2>
          <ul className="fit-lines">
            {sessions.slice(0, 5).map((s) => {
              const t = topSet(s.sets);
              return (
                <li key={s.session_id}>
                  <button type="button" className="fit-lines__btn" onClick={() => go("history", "s", s.session_id)}>
                    <div className="fit-lines__head">
                      <span className="fit-lines__name">{shortDate(s.at)}</span>
                      {prs.has(s.session_id) ? <span className="fit-pr">PR</span> : null}
                      {t ? <span className="fit-lines__top">top {lb(t.weight_lb)}×{t.reps}</span> : null}
                    </div>
                    <p className="fit-lines__sets">{s.sets.map((x) => `${lb(x.weight_lb)}×${x.reps}`).join("  ")}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Top-set weight per session, oldest → newest. One series, so no legend; tap a point for its value. */
function TrendChart({ sessions }: { sessions: PastSession[] }) {
  const points = useMemo(
    () => [...sessions].reverse().slice(-24).map((s) => ({ at: s.at, top: topSet(s.sets)! })).filter((p) => p.top),
    [sessions],
  );
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) {
    return <p className="fit-chart__empty">The trend line starts after your second session on this machine.</p>;
  }

  const W = 340, H = 168, L = 36, R = 12, T = 14, B = 26;
  const weights = points.map((p) => p.top.weight_lb);
  let lo = Math.min(...weights), hi = Math.max(...weights);
  if (lo === hi) { lo -= 10; hi += 10; }
  const pad = (hi - lo) * 0.12;
  lo = Math.max(0, lo - pad); hi += pad;
  const x = (i: number) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (w: number) => T + (1 - (w - lo) / (hi - lo)) * (H - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.top.weight_lb).toFixed(1)}`).join("");
  const h = hover ?? points.length - 1;
  const hp = points[h];

  const pick = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };

  return (
    <figure className="fit-chart">
      <figcaption>
        <span>Top-set weight</span>
        <strong>{lb(hp.top.weight_lb)} lb × {hp.top.reps}</strong>
        <span>{shortDate(hp.at)}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Top-set weight over ${points.length} sessions, from ${lb(weights[0])} to ${lb(weights[weights.length - 1])} lb`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="fit-chart__grid" />
            <text x={L - 6} y={y(t)} className="fit-chart__tick" textAnchor="end" dominantBaseline="middle">{Math.round(t)}</text>
          </g>
        ))}
        <text x={L} y={H - 6} className="fit-chart__tick">{shortDate(points[0].at)}</text>
        <text x={W - R} y={H - 6} className="fit-chart__tick" textAnchor="end">{shortDate(points[points.length - 1].at)}</text>
        <line x1={x(h)} x2={x(h)} y1={T} y2={H - B} className="fit-chart__cross" />
        <path d={path} className="fit-chart__line" />
        {points.map((p, i) => (
          <circle key={p.at} cx={x(i)} cy={y(p.top.weight_lb)} r={i === h ? 5 : 4} className={`fit-chart__dot${i === h ? " is-on" : ""}`} />
        ))}
      </svg>
    </figure>
  );
}

function SessionList() {
  const { tById } = useFit();
  const rows = useLiveQuery(async () => {
    const sessions = (await db.sessions.orderBy("started_at").reverse().toArray()).filter((s) => s.ended_at !== null);
    const sets = await db.sets.toArray();
    const counts = new Map<string, number>();
    for (const s of sets) counts.set(s.session_id, (counts.get(s.session_id) ?? 0) + 1);
    return sessions.map((s) => ({ s, sets: counts.get(s.id) ?? 0 }));
  }, []);
  if (!rows) return null;
  if (rows.length === 0) return <Empty>No finished sessions yet.</Empty>;
  return (
    <ul className="fit-list">
      {rows.map(({ s, sets }) => (
        <li key={s.id}>
          <button type="button" onClick={() => go("history", "s", s.id)}>
            <span className="fit-list__main">
              <span className="fit-list__title">{tById.get(s.day_template_id)?.name ?? "Deleted day"}</span>
              <span className="fit-list__sub">
                {shortDate(s.started_at)} · {s.marked_only ? "marked done" : `${sets} sets · ${duration((s.ended_at ?? s.started_at) - s.started_at)}`}
                {(s.biked_miles ?? 0) > 0 ? ` · rode ${lb(s.biked_miles!)} mi` : ""}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SessionDetail({ id }: { id: string }) {
  const { tById, settings } = useFit();
  const session = useLiveQuery(() => db.sessions.get(id).then((s) => s ?? null), [id]);
  const lines = useLiveQuery(() => (session ? sessionLines(session) : Promise.resolve([])), [session?.id]);
  if (session === null) return <div className="fit-page"><TopBar title="Session" onBack={() => go("history", "sessions")} /><Empty>That session is gone.</Empty></div>;
  if (!session || !lines) return null;
  const sets = lines.reduce((n, l) => n + l.sets.length, 0);
  return (
    <div className="fit-page">
      <TopBar title={tById.get(session.day_template_id)?.name ?? "Session"} sub={new Date(session.started_at).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} onBack={() => go("history", "sessions")} />
      <dl className="fit-stats">
        <div><dt>Duration</dt><dd>{session.ended_at ? duration(session.ended_at - session.started_at) : "open"}</dd></div>
        <div><dt>Sets</dt><dd>{sets}</dd></div>
        <div><dt>PRs</dt><dd>{lines.filter((l) => l.pr).length}</dd></div>
      </dl>
      {session.marked_only ? <Empty>Marked done without logging.</Empty> : <SessionLines lines={lines} />}
      {ridesOn(settings) ? <SessionRide session={session} defaultMiles={settings.ride_miles ?? DEFAULT_RIDE_MILES} /> : null}
      <label className="fit-field">
        <span className="fit-field__label">Notes</span>
        <textarea className="fit-input" rows={3} defaultValue={session.notes} onBlur={(e) => updateSession(session.id, { notes: e.target.value.trim() })} />
      </label>
      <ConfirmButton confirm="Tap again — deletes its sets too" onConfirm={async () => { await deleteSession(session.id); go("history", "sessions"); }}>
        Delete session
      </ConfirmButton>
    </div>
  );
}

const BAND = { min: 10, max: 16 };
const DAY = 86_400_000;

function Weekly() {
  const { exById } = useFit();
  const [offset, setOffset] = useState(0);
  const from = weekStart(Date.now()) - offset * 7 * DAY;
  // Local midnight a week later (DST-safe: build from the date, not +7×24h).
  const toDate = new Date(from);
  toDate.setDate(toDate.getDate() + 7);
  const to = toDate.getTime();
  const sets = useLiveQuery(() => db.sets.where("logged_at").between(from, to, true, false).toArray(), [from, to]);
  const rides = useLiveQuery(() => db.sessions.where("started_at").between(from, to, true, false).toArray().then(ridesFrom), [from, to]);
  const rideMiles = (rides ?? []).reduce((n, r) => n + r.miles, 0);
  const volume = useMemo(() => setsPerMuscle(sets ?? [], exById), [sets, exById]);
  const scaleMax = Math.max(BAND.max + 4, ...MUSCLES.map((m) => volume[m]));
  const pct = (v: number) => `${(v / scaleMax) * 100}%`;

  const label = offset === 0 ? "This week" : offset === 1 ? "Last week" : `Week of ${shortDate(from)}`;
  return (
    <section className="fit-weekly">
      <div className="fit-weekly__nav">
        <button type="button" className="fit-iconbtn" onClick={() => setOffset(offset + 1)} aria-label="Previous week">‹</button>
        <div>
          <strong>{label}</strong>
          <span>{shortDate(from)} – {shortDate(to - 1)} · {sets?.length ?? 0} sets</span>
          <span className="fit-weekly__ride">{rides?.length ? `Biked ${lb(rideMiles)} mi · ${rides.length} ride${rides.length > 1 ? "s" : ""}` : "No rides logged"}</span>
        </div>
        <button type="button" className="fit-iconbtn" onClick={() => setOffset(Math.max(0, offset - 1))} disabled={offset === 0} aria-label="Next week">›</button>
      </div>
      <p className="fit-muted">Hard sets per muscle (secondary muscles count ½). Shaded band: {BAND.min}–{BAND.max} a week.</p>
      <ul className="fit-bars">
        {MUSCLES.map((m) => {
          const v = volume[m];
          // Legs the riding trains aren't "under" in a week you rode.
          const rode = rideMiles > 0 && RIDE_MUSCLES.has(m) && v < BAND.min;
          const state = rode ? "ride" : v === 0 ? "none" : v < BAND.min ? "under" : v > BAND.max ? "over" : "in";
          return (
            <li key={m} className={`is-${state}`}>
              <span className="fit-bars__label">{MUSCLE_LABEL[m]}</span>
              <span className="fit-bars__track" aria-hidden="true">
                <span className="fit-bars__band" style={{ left: pct(BAND.min), width: pct(BAND.max - BAND.min) }} />
                {v > 0 ? <span className="fit-bars__bar" style={{ width: pct(v) }} /> : null}
              </span>
              <span className="fit-bars__value">
                {lb(v)}
                <small>{state === "in" ? "in range" : state === "under" ? "under" : state === "over" ? "over" : state === "ride" ? "+ riding" : ""}</small>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
