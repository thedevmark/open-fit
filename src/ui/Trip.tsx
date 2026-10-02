import { useState } from "react";
import { TRIP_MODES, TRIP_WORDS } from "../lib/logic";
import type { TripMode } from "../lib/types";
import { lb, Stepper } from "./kit";

type TripDefault = { mode: TripMode; miles: number };

const ICON: Record<TripMode, string> = {
  ride: "M5.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 16.5 9 9h6l3.5 7.5M9 9 12 16.5h-1M15 9l-1.5-3H11",
  run: "M14 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM8 21l3-6 3 2v5M6 11l3-3 4 1 2 4 3 1M11 15l1-5",
  walk: "M13 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9.5 21.5l2-6.5 2.5 2.5V22M8 12.5 9.5 8 13 7l2 4 3 1.5M11.5 15 12.5 9",
};

/**
 * Asked once (and on "Change"): how you got here and how far. Saved as the
 * default, after which it's a plain yes/no. "Drove / transit" stops asking.
 */
export function TripPicker({ current, onSave, onNone, onCancel }: {
  current?: TripDefault;
  onSave: (trip: TripDefault) => void;
  onNone: () => void;
  onCancel?: () => void;
}) {
  const [mode, setMode] = useState<TripMode | null>(current?.mode ?? null);
  const [miles, setMiles] = useState(current?.miles ?? 0);
  const pick = (m: TripMode) => {
    setMode(m);
    if (m !== current?.mode) setMiles(TRIP_WORDS[m].miles);
  };

  return (
    <section className="fit-trip" aria-labelledby="fit-trip-q">
      <p className="fit-trip__q" id="fit-trip-q">How did you get here?</p>
      <div className="fit-chips" role="group" aria-label="How you got here">
        {TRIP_MODES.map((m) => (
          <button key={m} type="button" className={`fit-chip${mode === m ? " is-on" : ""}`} aria-pressed={mode === m} onClick={() => pick(m)}>
            {TRIP_WORDS[m].option}
          </button>
        ))}
        <button type="button" className="fit-chip" onClick={onNone}>Drove / transit</button>
      </div>
      {mode ? (
        <>
          <Stepper size="sm" label="How far, one way (mi)" value={miles} step={0.5} min={0.5} max={50} onChange={setMiles} />
          <div className="fit-row">
            <button type="button" className="fit-btn fit-btn--primary fit-btn--sm" onClick={() => onSave({ mode, miles })}>Save</button>
            {onCancel ? <button type="button" className="fit-btn fit-btn--ghost fit-btn--sm" onClick={onCancel}>Cancel</button> : null}
          </div>
          <p className="fit-muted">Next time it&apos;s a single yes/no. Running counts as more leg work per mile than riding; walking, less.</p>
        </>
      ) : (
        <p className="fit-muted">Getting here on foot or by bike counts toward leg fatigue. Driving or transit doesn&apos;t, and it won&apos;t ask again.</p>
      )}
    </section>
  );
}

/** The everyday switch: "Ran here? Yes · 2 mi", with a way to change the default. */
export function TripToggle({ on, trip, onChange, onEdit }: {
  on: boolean;
  trip: TripDefault;
  onChange: (on: boolean) => void;
  onEdit?: () => void;
}) {
  const words = TRIP_WORDS[trip.mode];
  return (
    <div className="fit-trip-row">
      <button type="button" role="switch" aria-checked={on} className={`fit-bike${on ? " is-on" : ""}`} onClick={() => onChange(!on)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON[trip.mode]} /></svg>
        <span className="fit-bike__text">
          <strong>{words.question}</strong>
          <small>{on ? `Yes · ${lb(trip.miles)} mi` : "No · not this time"}</small>
        </span>
        <span className="fit-bike__switch" aria-hidden="true"><i /></span>
      </button>
      {onEdit ? <button type="button" className="fit-link" onClick={onEdit}>Change</button> : null}
    </div>
  );
}
