import { useEffect, useRef, useState } from "react";
import { FIT_CONFIG } from "../lib/config";
import { exportBackup, importBackup, isBackup, updateSettings, wipeAll } from "../lib/db";
import { localDate, TRIP_WORDS, tripsOn } from "../lib/logic";
import type { Settings } from "../lib/types";
import { clock, ConfirmButton, Field, go, Seg, Stepper, TopBar, useFit } from "./kit";
import SyncPanel from "./SyncPanel";
import { TripPicker } from "./Trip";

// Recovery as one choice. Each pace is how long big and small muscles take
// to clear a workout; "needs rest" is always 6 sets' worth.
type Pace = "fast" | "normal" | "slow";
const PACE: Record<Pace, Pick<Settings, "recovery_hours_large" | "recovery_hours_small" | "fatigue_threshold">> = {
  fast: { recovery_hours_large: 48, recovery_hours_small: 36, fatigue_threshold: 6 },
  normal: { recovery_hours_large: 72, recovery_hours_small: 48, fatigue_threshold: 6 },
  slow: { recovery_hours_large: 96, recovery_hours_small: 72, fatigue_threshold: 6 },
};
function paceOf(s: Settings): Pace {
  if (s.recovery_hours_large <= 54) return "fast";
  if (s.recovery_hours_large >= 90) return "slow";
  return "normal";
}

/** Whether the browser promised to keep this site's data, and whether it runs from the Home Screen. */
function useStorageStatus(): { persisted: boolean | null; installed: boolean } {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);
  const installed = typeof window !== "undefined"
    && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  return { persisted, installed };
}

export default function SettingsView() {
  const { settings } = useFit();
  const storage = useStorageStatus();
  const [club, setClub] = useState(settings.club_name);
  const trips = tripsOn(settings);
  const [editingTrip, setEditingTrip] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<unknown>(null);
  const file = useRef<HTMLInputElement>(null);

  const download = async () => {
    try {
      const backup = await exportBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `fit-backup-${localDate(Date.now())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg(`Exported ${backup.sets.length} sets from ${backup.sessions.length} sessions.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Export failed");
    }
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      const parsed: unknown = JSON.parse(await f.text());
      if (!isBackup(parsed)) throw new Error("That file isn't a Gym Floor Planner backup");
      setPending(parsed);
      setMsg(`Backup has ${parsed.sets?.length ?? 0} sets from ${parsed.sessions?.length ?? 0} sessions. Importing replaces everything on this phone.`);
    } catch (e) {
      setPending(null);
      setMsg(e instanceof Error && e.message.includes("backup") ? e.message : "Couldn't read that file as JSON.");
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  return (
    <div className="fit-page">
      <TopBar title="Settings" />

      {FIT_CONFIG.club ? null : (
        <Field label="Gym">
          <input className="fit-input" value={club} onChange={(e) => setClub(e.target.value)} onBlur={() => club.trim() && updateSettings({ club_name: club.trim() })} />
        </Field>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={trips}
        className={`fit-toggle-row${trips ? " is-on" : ""}`}
        onClick={() => updateSettings({ ride_tracking: !trips })}
      >
        <span>
          <strong>Count the trip to the gym</strong>
          <small>Riding, running or walking there adds leg fatigue. 5 miles of riding is about one set for the quads; running counts more, walking less.</small>
        </span>
        <span className="fit-bike__switch" aria-hidden="true"><i /></span>
      </button>
      {trips && settings.trip && !editingTrip ? (
        <div className="fit-row fit-row--between">
          <span className="fit-muted">Usually: {TRIP_WORDS[settings.trip.mode].past} {settings.trip.miles} mi</span>
          <button type="button" className="fit-btn fit-btn--ghost fit-btn--sm" onClick={() => setEditingTrip(true)}>Change</button>
        </div>
      ) : null}
      {trips && editingTrip ? (
        <TripPicker
          current={settings.trip}
          onSave={(t) => { void updateSettings({ trip: t }); setEditingTrip(false); }}
          onNone={() => { void updateSettings({ ride_tracking: false }); setEditingTrip(false); }}
          onCancel={() => setEditingTrip(false)}
        />
      ) : null}

      <h2 className="fit-h2">Recovery</h2>
      <p className="fit-muted">Muscles you&apos;ve worked show amber while they recover and red when they need rest. Red muscles get fewer sets today.</p>
      <Seg<Pace>
        label="How fast do you recover?"
        value={paceOf(settings)}
        onChange={(p) => updateSettings(PACE[p])}
        options={[{ value: "fast", label: "Fast" }, { value: "normal", label: "Normal" }, { value: "slow", label: "Slow" }]}
      />
      <p className="fit-muted">Pick Slow if you&apos;re new to lifting or still sore when the app says you&apos;re fresh.</p>

      <h2 className="fit-h2">Workout</h2>
      <Stepper size="sm" label={`Default rest ${clock(settings.default_rest_sec)}`} unit="s" value={settings.default_rest_sec} step={15} min={0} max={600} onChange={(v) => updateSettings({ default_rest_sec: v })} />

      <SyncPanel sync={settings.sync} />

      <h2 className="fit-h2">Backup file</h2>
      <p className="fit-muted">
        {storage.installed
          ? "Running from your Home Screen, so the browser keeps your log."
          : "Add this page to your Home Screen (Safari: Share → Add to Home Screen). In a browser tab, Safari can clear a site's data after a week without a visit."}
        {storage.persisted ? " This browser has promised not to clear it." : ""} A file export is a copy you control; your sync code is never in it.
      </p>
      <div className="fit-row">
        <button type="button" className="fit-btn fit-btn--ghost" onClick={download}>Export JSON</button>
        <button type="button" className="fit-btn fit-btn--ghost" onClick={() => file.current?.click()}>Import JSON</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      {msg ? <p className="fit-msg" role="status">{msg}</p> : null}
      {pending ? (
        <div className="fit-row">
          <ConfirmButton
            confirm="Tap again — replaces all data"
            onConfirm={async () => {
              try {
                await importBackup(pending);
                setMsg("Imported.");
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Import failed");
              }
              setPending(null);
            }}
          >
            Replace with backup
          </ConfirmButton>
          <button type="button" className="fit-btn fit-btn--ghost" onClick={() => { setPending(null); setMsg(null); }}>Cancel</button>
        </div>
      ) : null}

      <h2 className="fit-h2">Setup</h2>
      <div className="fit-row">
        <button type="button" className="fit-btn fit-btn--ghost" onClick={() => go("setup")}>Check machine mapping</button>
      </div>
      <p className="fit-muted">Works offline after the first load.</p>

      <h2 className="fit-h2">Danger</h2>
      <ConfirmButton confirm="Tap again — deletes everything here" onConfirm={async () => { await wipeAll(); go("today"); }}>
        Erase all data
      </ConfirmButton>
      <p className="fit-foot">Open source (MIT) · <a href="https://github.com/thedevmark/open-fit">github.com/thedevmark/open-fit</a> · Not affiliated with any gym or equipment maker.</p>
    </div>
  );
}
