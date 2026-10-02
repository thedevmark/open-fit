import { useState } from "react";
import { restoreFromCode, startSync, stopSync, syncNow, type SyncResult } from "../lib/autosync";
import { FIT_CONFIG } from "../lib/config";
import { newSyncCode, normalizeCode } from "../lib/sync";
import type { SyncState } from "../lib/types";
import { ConfirmButton, shortDate } from "./kit";

const RESULT: Record<SyncResult, string> = {
  off: "Sync is off.",
  sent: "Synced: this phone's log is saved.",
  fetched: "Synced: pulled in changes from your other device.",
  same: "Already up to date.",
  conflict: "This phone and the synced copy both changed. Pick which one to keep below.",
  error: "Couldn't reach the sync server. Your log is safe on this phone; it'll try again later.",
};

function since(t: number | null): string {
  if (!t) return "never";
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return shortDate(t);
}

/** "I have a code" box. Used in Settings and on the first setup screen. */
export function RestoreForm({ onRestored, replaceWarning }: { onRestored?: () => void; replaceWarning: boolean }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = normalizeCode(code);

  const restore = async () => {
    if (!clean) return;
    setBusy(true);
    try {
      const r = await restoreFromCode(clean);
      if (r === "missing") setMsg("Nothing is synced under that code. Check it, or turn on sync on the phone that has your log.");
      else onRestored?.();
    } catch {
      setMsg("Couldn't restore. Check the code and your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fit-sync__restore">
      <input
        className="fit-input fit-sync__code"
        value={code}
        onChange={(e) => { setCode(e.target.value); setMsg(null); }}
        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Sync code"
      />
      {replaceWarning && clean ? (
        <ConfirmButton className="fit-btn fit-btn--ghost fit-btn--block" confirm="Tap again — replaces this phone's log" onConfirm={restore}>
          {busy ? "Restoring…" : "Restore from this code"}
        </ConfirmButton>
      ) : (
        <button type="button" className="fit-btn fit-btn--ghost fit-btn--block" disabled={!clean || busy} onClick={restore}>
          {busy ? "Restoring…" : "Restore from this code"}
        </button>
      )}
      {code && !clean ? <p className="fit-muted">A code is 26 letters and numbers.</p> : null}
      {msg ? <p className="fit-msg" role="status">{msg}</p> : null}
    </div>
  );
}

/** Settings → Sync. Hidden entirely when this deployment has no sync server. */
export default function SyncPanel({ sync }: { sync: SyncState | undefined }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [restoring, setRestoring] = useState(false);
  if (!FIT_CONFIG.syncUrl) return null;

  const act = async (fn: () => Promise<SyncResult>) => {
    setBusy(true);
    try {
      setMsg(RESULT[await fn()]);
    } finally {
      setBusy(false);
    }
  };

  if (!sync) {
    return (
      <section className="fit-sync" aria-labelledby="fit-sync-h">
        <h2 className="fit-h2" id="fit-sync-h">Sync</h2>
        <p className="fit-muted">
          Keep a copy off this phone with a sync code: no account, no email. Your log is encrypted here before it leaves,
          so the server can&apos;t read it. Type the code on a new phone to get everything back.
        </p>
        <button type="button" className="fit-btn fit-btn--primary fit-btn--block" disabled={busy} onClick={() => act(() => startSync(newSyncCode()))}>
          Turn on sync
        </button>
        {restoring ? (
          <RestoreForm replaceWarning onRestored={() => setMsg(RESULT.fetched)} />
        ) : (
          <button type="button" className="fit-link" onClick={() => setRestoring(true)}>I already have a code</button>
        )}
        {msg ? <p className="fit-msg" role="status">{msg}</p> : null}
      </section>
    );
  }

  return (
    <section className="fit-sync" aria-labelledby="fit-sync-h">
      <h2 className="fit-h2" id="fit-sync-h">Sync</h2>
      <div className="fit-sync__card">
        <span className="fit-field__label">Your sync code</span>
        <p className="fit-sync__shown" aria-live="polite">{shown ? sync.code : "••••-••••-••••-••••-••••-••••-••"}</p>
        <div className="fit-row">
          <button type="button" className="fit-btn fit-btn--ghost fit-btn--sm" onClick={() => setShown((s) => !s)}>{shown ? "Hide" : "Show"}</button>
          <button
            type="button"
            className="fit-btn fit-btn--ghost fit-btn--sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(sync.code);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              } catch {
                setShown(true);
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="fit-muted">
          Save it somewhere safe (a password manager is ideal). It&apos;s the only way back into your log, and anyone who has it can read it.
        </p>
      </div>

      {sync.conflict ? (
        <div className="fit-callout">
          <strong>Both copies changed</strong>
          <p className="fit-muted">This phone and the synced copy were both edited since they last matched. Keep one; the other is replaced.</p>
          <div className="fit-row">
            <ConfirmButton className="fit-btn fit-btn--ghost fit-btn--sm" confirm="Tap again — overwrite synced copy" onConfirm={() => act(() => syncNow({ prefer: "this" }))}>
              Keep this phone&apos;s
            </ConfirmButton>
            <ConfirmButton className="fit-btn fit-btn--ghost fit-btn--sm" confirm="Tap again — replace this phone's log" onConfirm={() => act(() => syncNow({ prefer: "synced" }))}>
              Use the synced copy
            </ConfirmButton>
          </div>
        </div>
      ) : null}

      <div className="fit-row fit-row--between">
        <span className="fit-muted">Last synced {since(sync.last_synced_at)}</span>
        <button type="button" className="fit-btn fit-btn--ghost fit-btn--sm" disabled={busy} onClick={() => act(() => syncNow())}>
          {busy ? "Syncing…" : "Sync now"}
        </button>
      </div>
      {msg ? <p className="fit-msg" role="status">{msg}</p> : null}

      <div className="fit-row">
        <ConfirmButton className="fit-btn fit-btn--ghost fit-btn--sm" confirm="Tap again — stop syncing here" onConfirm={() => stopSync(false).then(() => setMsg(null))}>
          Turn off here
        </ConfirmButton>
        <ConfirmButton
          className="fit-btn fit-btn--danger fit-btn--sm"
          confirm="Tap again — deletes the synced copy"
          onConfirm={() => stopSync(true).then(() => setMsg(null), () => setMsg("Couldn't delete the synced copy. Try again with a connection."))}
        >
          Turn off and delete synced copy
        </ConfirmButton>
      </div>
    </section>
  );
}
