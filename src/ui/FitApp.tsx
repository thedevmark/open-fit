import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { syncNow } from "../lib/autosync";
import { FIT_CONFIG } from "../lib/config";
import { db } from "../lib/db";
import History from "./History";
import { AddFromLink } from "./MachineAdd";
import Library from "./Library";
import Program from "./Program";
import SettingsView from "./SettingsView";
import Setup from "./Setup";
import Summary from "./Summary";
import Today from "./Today";
import Workout from "./Workout";
import { FitDataContext, RestContext, go, useHashRoute, type FitData, type Rest, type RestControl } from "./kit";
import RestBar from "./RestBar";

const TABS = [
  { route: "today", label: "Today", icon: "M4 12h3l2-6 4 12 2-6h5" },
  { route: "history", label: "History", icon: "M4 19V9M10 19V5M16 19v-7M22 19H2" },
  { route: "library", label: "Machines", icon: "M3 7h3v10H3zM18 7h3v10h-3zM6 12h12M8 9v6M16 9v6" },
  { route: "program", label: "Program", icon: "M5 5h14M5 10h14M5 15h9M5 20h6" },
  { route: "settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" },
];

export default function FitApp() {
  const route = useHashRoute();
  const [mounted, setMounted] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    db.open().catch((e: unknown) => setDbError(e instanceof Error ? e.message : String(e)));
    registerServiceWorker();
  }, []);

  const settings = useLiveQuery(() => db.settings.get("settings").then((s) => s ?? null), []);
  const ready = !!settings?.setup_done;
  const syncing = !!settings?.sync;

  // Once set up: ask the browser to keep the data (granted readily to Home
  // Screen apps), and sync on open and whenever the app goes to the background.
  useEffect(() => {
    if (!ready) return;
    navigator.storage?.persist?.().catch(() => undefined);
  }, [ready]);
  useEffect(() => {
    if (!ready || !syncing) return;
    void syncNow({ auto: true });
    const onHide = () => { if (document.visibilityState === "hidden") void syncNow({ auto: true }); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [ready, syncing]);
  const equipment = useLiveQuery(() => db.equipment.orderBy("name").toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.orderBy("name").toArray(), []);
  const templates = useLiveQuery(() => db.templates.orderBy("order_in_split").toArray(), []);

  const data = useMemo<FitData | null>(() => {
    if (!settings || !equipment || !exercises || !templates) return null;
    return {
      settings,
      equipment,
      exercises,
      templates,
      eqById: new Map(equipment.map((e) => [e.id, e])),
      exById: new Map(exercises.map((e) => [e.id, e])),
      tById: new Map(templates.map((t) => [t.id, t])),
    };
  }, [settings, equipment, exercises, templates]);

  const [rest, setRest] = useState<Rest | null>(null);
  const start = useCallback((seconds: number) => {
    if (seconds > 0) setRest({ endsAt: Date.now() + seconds * 1000, total: seconds });
  }, []);
  const add = useCallback((seconds: number) => {
    setRest((r) => (r ? { endsAt: Math.max(Date.now(), r.endsAt + seconds * 1000), total: Math.max(1, r.total + seconds) } : r));
  }, []);
  const stop = useCallback(() => setRest(null), []);
  const restControl = useMemo<RestControl>(() => ({ rest, start, add, stop }), [rest, start, add, stop]);

  if (!mounted || settings === undefined) {
    return <div className="fit-app fit-app--loading" aria-busy="true"><p className="fit-empty">{dbError ?? "Loading…"}</p></div>;
  }

  if (dbError) {
    return (
      <div className="fit-app">
        <p className="fit-empty">This browser won&apos;t open local storage ({dbError}). Private browsing blocks it on some phones.</p>
      </div>
    );
  }

  if (settings === null || !settings.setup_done || route[0] === "setup") {
    return (
      <div className="fit-app">
        <FitDataContext.Provider value={data}>
          <Setup />
        </FitDataContext.Provider>
      </div>
    );
  }

  if (!data) return <div className="fit-app fit-app--loading" aria-busy="true" />;

  const view = route[0] ?? "today";
  const fullScreen = view === "workout" || view === "summary";
  const body = (() => {
    switch (view) {
      case "workout": return <Workout />;
      case "summary": return <Summary />;
      case "history": return <History route={route.slice(1)} />;
      case "library": return <Library route={route.slice(1)} />;
      case "program": return <Program route={route.slice(1)} />;
      case "settings": return <SettingsView />;
      case "add-machines": return <AddFromLink payload={route[1]} />;
      default: return <Today />;
    }
  })();

  return (
    <FitDataContext.Provider value={data}>
      <RestContext.Provider value={restControl}>
        <div className={`fit-app${fullScreen ? " fit-app--full" : ""}`}>
          <main className="fit-main">{body}</main>
          {rest && view !== "workout" ? <RestBar floating /> : null}
          {fullScreen ? null : (
            <nav className="fit-tabs" aria-label="Sections">
              {TABS.map((t) => {
                const on = view === t.route || (t.route === "today" && !TABS.some((x) => x.route === view));
                return (
                  <button key={t.route} type="button" className={on ? "is-on" : undefined} aria-current={on ? "page" : undefined} onClick={() => go(t.route)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg>
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </RestContext.Provider>
    </FitDataContext.Provider>
  );
}

/**
 * Offline support, scoped to the app's base path. The worker caches what
 * this page loads, so the second open works in a dead-signal corner of the gym.
 */
function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const base = FIT_CONFIG.base;
  navigator.serviceWorker
    .register(`${base}sw.js`, { scope: base })
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      // Same-origin scripts, styles, fonts and images this page already loaded.
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.startsWith(location.origin) && !u.includes("/sw.js"));
      reg.active?.postMessage({ type: "cache", urls: [...urls, `${location.origin}${base}`] });
    })
    .catch(() => {
      // No offline cache this visit; the app still works online.
    });
}
