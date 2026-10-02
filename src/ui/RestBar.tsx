import { useEffect, useRef } from "react";
import { clock, go, useNow, useRest } from "./kit";

let audio: AudioContext | null = null;

/** Short double beep. Silently does nothing where audio isn't allowed. */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const ctx = audio;
    [0, 0.22].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.18);
    });
  } catch {
    // no audio — the vibration and the on-screen state still signal it
  }
}

export default function RestBar({ floating = false }: { floating?: boolean }) {
  const { rest, add, stop } = useRest();
  const now = useNow(250, rest !== null);
  const fired = useRef<number | null>(null);

  const remaining = rest ? (rest.endsAt - now) / 1000 : 0;
  const done = rest !== null && remaining <= 0;

  useEffect(() => {
    if (!rest || !done || fired.current === rest.endsAt) return;
    fired.current = rest.endsAt;
    navigator.vibrate?.([180, 90, 180]);
    beep();
  }, [rest, done]);

  // Clear a finished timer after a while so it doesn't linger forever.
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(stop, 30_000);
    return () => window.clearTimeout(t);
  }, [done, stop]);

  if (!rest) return null;
  const pct = Math.min(100, Math.max(0, (1 - remaining / rest.total) * 100));

  return (
    <div className={`fit-rest${done ? " is-done" : ""}${floating ? " fit-rest--floating" : ""}`} role="timer" aria-live={done ? "assertive" : "off"}>
      <div className="fit-rest__fill" style={{ width: `${pct}%` }} aria-hidden="true" />
      {floating ? (
        <button type="button" className="fit-rest__time fit-rest__time--link" onClick={() => go("workout")}>
          {done ? "Rest over" : `Rest ${clock(remaining)}`}
        </button>
      ) : (
        <span className="fit-rest__time">{done ? "Rest over — go" : `Rest ${clock(remaining)}`}</span>
      )}
      <div className="fit-rest__actions">
        {done ? null : (
          <>
            <button type="button" onClick={() => add(-15)} aria-label="15 seconds less">−15</button>
            <button type="button" onClick={() => add(15)} aria-label="15 seconds more">+15</button>
          </>
        )}
        <button type="button" onClick={stop}>{done ? "OK" : "Skip"}</button>
      </div>
    </div>
  );
}
