// When to send, fetch, or ask. One device at a time is the normal case, so
// the rule is simple: whichever side changed since they last matched wins;
// if both changed, nothing is overwritten and the app asks.

import { FIT_CONFIG } from "./config";
import { db, exportBackup, importBackup, isBackup, updateSettings } from "./db";
import { contentHash, deriveKeys, download, isLongCode, newSyncCode, remove, SyncConflict, upload } from "./sync";
import type { SyncState } from "./types";

export type SyncResult = "off" | "sent" | "fetched" | "same" | "conflict" | "error";

let running: Promise<SyncResult> | null = null;
let lastAuto = 0;

/**
 * Bring this device and the synced copy together. `prefer` settles a
 * conflict; `auto` calls (app open, leaving the app) are skipped if one ran
 * in the last 20 seconds.
 */
export function syncNow(opts: { prefer?: "this" | "synced"; auto?: boolean } = {}): Promise<SyncResult> {
  if (opts.auto && Date.now() - lastAuto < 20_000) return Promise.resolve("same");
  if (opts.auto) lastAuto = Date.now();
  running ??= run(opts.prefer)
    .then((r) => (r === "sent" || r === "fetched" || r === "same" ? shortenCode(r) : r))
    .finally(() => { running = null; });
  return running;
}

async function setSync(patch: Partial<SyncState>): Promise<void> {
  const s = await db.settings.get("settings");
  if (s?.sync) await updateSettings({ sync: { ...s.sync, ...patch } });
}

async function run(prefer?: "this" | "synced"): Promise<SyncResult> {
  const url = FIT_CONFIG.syncUrl;
  const sync = (await db.settings.get("settings"))?.sync;
  if (!url || !sync) return "off";
  try {
    const keys = await deriveKeys(sync.code);
    const local = await exportBackup();
    const hash = await contentHash(local);
    const remote = await download(url, keys);

    const send = async () => {
      const version = await upload(url, keys, local, remote?.version ?? null);
      await setSync({ remote_version: version, local_hash: hash, last_synced_at: Date.now(), conflict: false });
      return "sent" as const;
    };
    const fetchIt = async () => {
      if (!remote || !isBackup(remote.data)) throw new Error("The synced copy isn't a backup");
      await importBackup(remote.data);
      const now = await contentHash(await exportBackup());
      await setSync({ remote_version: remote.version, local_hash: now, last_synced_at: Date.now(), conflict: false });
      return "fetched" as const;
    };

    if (!remote) return await send();
    if (prefer === "this") return await send();
    if (prefer === "synced") return await fetchIt();

    const localChanged = hash !== sync.local_hash;
    const remoteChanged = remote.version !== sync.remote_version;
    if (remoteChanged && localChanged) {
      // First sync on a device that already had data: never silently pick one.
      await setSync({ conflict: true });
      return "conflict";
    }
    if (remoteChanged) return await fetchIt();
    if (localChanged) return await send();
    await setSync({ last_synced_at: Date.now() });
    return "same";
  } catch (e) {
    if (e instanceof SyncConflict) {
      await setSync({ conflict: true });
      return "conflict";
    }
    return "error";
  }
}

/**
 * A device still on one of the first 26-character codes gets a short one,
 * right after a clean sync (so this device holds the latest): write the
 * copy under the new code, switch, then delete the old copy.
 */
async function shortenCode(result: SyncResult): Promise<SyncResult> {
  const url = FIT_CONFIG.syncUrl;
  const old = (await db.settings.get("settings"))?.sync;
  if (!url || !old || !isLongCode(old.code)) return result;
  try {
    const code = newSyncCode();
    const local = await exportBackup();
    const version = await upload(url, await deriveKeys(code), local, null);
    await updateSettings({ sync: { code, remote_version: version, local_hash: await contentHash(local), last_synced_at: Date.now() } });
    await remove(url, await deriveKeys(old.code)).catch(() => undefined); // it also expires on its own
    return result;
  } catch {
    return result; // try again next sync; the old code keeps working until then
  }
}

/** Start syncing this device under `code` (a new code, or one from another device). */
export async function startSync(code: string): Promise<SyncResult> {
  await updateSettings({ sync: { code, remote_version: null, local_hash: null, last_synced_at: null } });
  return syncNow();
}

/**
 * Replace everything on this device with the copy synced under `code`, then
 * keep syncing with it. Works before setup, so a new phone needs only the code.
 */
export async function restoreFromCode(code: string): Promise<"restored" | "missing"> {
  if (!FIT_CONFIG.syncUrl) throw new Error("Sync isn't set up on this site");
  const remote = await download(FIT_CONFIG.syncUrl, await deriveKeys(code));
  if (!remote) return "missing";
  if (!isBackup(remote.data)) throw new Error("The synced copy isn't a backup");
  await importBackup(remote.data);
  const hash = await contentHash(await exportBackup());
  await updateSettings({ sync: { code, remote_version: remote.version, local_hash: hash, last_synced_at: Date.now() } });
  return "restored";
}

/** Stop syncing here. With `deleteCopy`, the synced copy is deleted from the server too. */
export async function stopSync(deleteCopy: boolean): Promise<void> {
  const s = await db.settings.get("settings");
  if (deleteCopy && s?.sync && FIT_CONFIG.syncUrl) await remove(FIT_CONFIG.syncUrl, await deriveKeys(s.sync.code));
  await updateSettings({ sync: undefined });
}
