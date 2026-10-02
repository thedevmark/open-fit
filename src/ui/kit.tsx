import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { DayTemplate, Equipment, Exercise, Settings } from "../lib/types";

// ── Shared data (live from IndexedDB, provided by FitApp) ────────────

export interface FitData {
  settings: Settings;
  equipment: Equipment[];
  exercises: Exercise[];
  templates: DayTemplate[];
  eqById: Map<string, Equipment>;
  exById: Map<string, Exercise>;
  tById: Map<string, DayTemplate>;
}

export const FitDataContext = createContext<FitData | null>(null);

export function useFit(): FitData {
  const data = useContext(FitDataContext);
  if (!data) throw new Error("useFit outside FitApp");
  return data;
}

// ── Rest timer (lives above the routes so it survives navigation) ────

export interface Rest {
  endsAt: number;
  total: number;
}

export interface RestControl {
  rest: Rest | null;
  start: (seconds: number) => void;
  add: (seconds: number) => void;
  stop: () => void;
}

export const RestContext = createContext<RestControl | null>(null);

export function useRest(): RestControl {
  const r = useContext(RestContext);
  if (!r) throw new Error("useRest outside FitApp");
  return r;
}

// ── Hash routing: #/history/ex/<id> → ["history", "ex", "<id>"] ───────

export function parseHash(hash: string): string[] {
  return hash.replace(/^#\/?/, "").split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part; // a stray "%" in a hand-typed link must not take the app down
    }
  });
}

export function useHashRoute(): string[] {
  const [route, setRoute] = useState<string[]>([]);
  useEffect(() => {
    const read = () => setRoute(parseHash(window.location.hash));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return route;
}

export function go(...parts: string[]): void {
  const next = `#/${parts.map(encodeURIComponent).join("/")}`;
  if (window.location.hash !== next) window.location.hash = next;
}

// ── Time ─────────────────────────────────────────────────────────────

export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs, enabled]);
  return now;
}

export function clock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function duration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

export function shortDate(t: number | string): string {
  const d = typeof t === "string" ? new Date(`${t}T12:00:00`) : new Date(t);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function lb(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ── Controls ─────────────────────────────────────────────────────────

/** Big one-handed stepper. Hold a button to repeat; tap the value to type. */
export function Stepper({
  label, value, step, min = 0, max = 9999, unit, onChange, size = "lg",
}: {
  label: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  unit?: string;
  onChange: (v: number) => void;
  size?: "lg" | "sm";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const valueRef = useRef(value);
  valueRef.current = value;
  const timer = useRef<number | null>(null);
  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100)), [min, max]);

  const stopRepeat = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stopRepeat, []);

  const press = (dir: 1 | -1) => {
    const delta = (step || 1) * dir;
    onChange(clamp(valueRef.current + delta));
    let delay = 450;
    const tick = () => {
      onChange(clamp(valueRef.current + delta));
      delay = Math.max(70, delay * 0.75);
      timer.current = window.setTimeout(tick, delay);
    };
    timer.current = window.setTimeout(tick, delay);
  };

  const commit = () => {
    const n = Number(draft.replace(",", "."));
    if (draft.trim() !== "" && Number.isFinite(n)) onChange(clamp(n));
    setEditing(false);
  };

  const btn = (dir: 1 | -1) => (
    <button
      type="button"
      className="fit-stepper__btn"
      aria-label={`${dir > 0 ? "Increase" : "Decrease"} ${label.toLowerCase()} by ${step || 1}`}
      onPointerDown={(e) => { e.preventDefault(); press(dir); }}
      onPointerUp={stopRepeat}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(clamp(value + (step || 1) * dir)); } }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {dir > 0 ? "+" : "−"}
    </button>
  );

  return (
    <div className={`fit-stepper fit-stepper--${size}`}>
      <span className="fit-stepper__label">{label}</span>
      <div className="fit-stepper__row">
        {btn(-1)}
        {editing ? (
          <input
            className="fit-stepper__input"
            autoFocus
            inputMode="decimal"
            aria-label={label}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          />
        ) : (
          <button
            type="button"
            className="fit-stepper__value"
            aria-label={`${label}: ${lb(value)}${unit ? ` ${unit}` : ""}. Tap to type.`}
            onClick={() => { setDraft(String(value)); setEditing(true); }}
          >
            {lb(value)}
            {unit ? <small>{unit}</small> : null}
          </button>
        )}
        {btn(1)}
      </div>
    </div>
  );
}

export function Seg<T extends string>({
  value, options, onChange, label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="fit-seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? "is-on" : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`fit-chip${on ? " is-on" : ""}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

export function TopBar({ title, sub, onBack, right }: { title: string; sub?: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="fit-top">
      {onBack ? (
        <button type="button" className="fit-top__back" onClick={onBack} aria-label="Back">
          ‹
        </button>
      ) : null}
      <div className="fit-top__titles">
        <h1>{title}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      {right ? <div className="fit-top__right">{right}</div> : null}
    </header>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="fit-field">
      <span className="fit-field__label">{label}</span>
      {children}
      {hint ? <span className="fit-field__hint">{hint}</span> : null}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="fit-empty">{children}</p>;
}

/** Two-tap confirm for destructive buttons — no blocking dialogs mid-set. */
export function ConfirmButton({ children, confirm, onConfirm, className = "fit-btn fit-btn--danger" }: {
  children: ReactNode;
  confirm: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={className} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirm : children}
    </button>
  );
}
