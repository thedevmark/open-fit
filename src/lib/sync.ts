// Sync with a code, no account. The code never leaves the device: it
// derives (HKDF-SHA256) a lookup id, a write token and an AES-GCM key. The
// server stores only ciphertext under the id, and only the write token can
// replace it. Lose the code and the synced copy is unreadable, by design.
//
// No IndexedDB here (tests import this file directly); lib/fit/autosync.ts
// wires it to the local data.

import type { Backup } from "./types";

// Crockford base32: no I, L, O, U, so a code read aloud or retyped survives.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// Codes are 10 characters (50 bits), the shortest that holds up: online,
// guessing one of a thousand users' codes at 10,000 tries a second takes
// years; offline (a leaked copy of the server), PBKDF2 at OWASP's 600,000
// rounds makes each guess cost real compute. The first codes were 26
// characters (128 bits, HKDF only); those still work.
const SHORT_CHARS = 10;
const LONG_CHARS = 26;
const PBKDF2_ROUNDS = 600_000;

const group = (clean: string) => (clean.length === SHORT_CHARS ? clean.match(/.{5}/g)! : clean.match(/.{1,4}/g)!).join("-");

/** A fresh random code: "7KQ2M-X9PDA". */
export function newSyncCode(): string {
  // 256 is a multiple of 32, so masking a random byte to 5 bits is unbiased.
  const bytes = crypto.getRandomValues(new Uint8Array(SHORT_CHARS));
  return group([...bytes].map((b) => ALPHABET[b & 31]).join(""));
}

/** A 26-character code from before codes got short. */
export function isLongCode(code: string): boolean {
  return code.replace(/-/g, "").length === LONG_CHARS;
}

/** Accepts what people actually type: lowercase, spaces, O for 0, I/L for 1. Null if it can't be a code. */
export function normalizeCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if ((clean.length !== SHORT_CHARS && clean.length !== LONG_CHARS) || [...clean].some((c) => !ALPHABET.includes(c))) return null;
  return group(clean);
}

/** A long code's 128 bits. */
function longCodeBytes(clean: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(16);
  let bits = 0;
  let value = 0;
  let i = 0;
  for (const c of clean) {
    value = (value << 5) | ALPHABET.indexOf(c);
    bits += 5;
    if (bits >= 8 && i < out.length) {
      out[i++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return out;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const enc = (text: string) => new TextEncoder().encode(text);

export interface SyncKeys {
  /** Where the copy lives on the server. Reveals nothing about the code. */
  id: string;
  /** Proves the right to replace the copy; the server keeps only its hash. */
  token: string;
  key: CryptoKey;
}

const derived = new Map<string, Promise<SyncKeys>>();

/** Keys for a code. The slow stretch runs once per code per app session. */
export function deriveKeys(code: string): Promise<SyncKeys> {
  let keys = derived.get(code);
  if (!keys) {
    keys = derive(code.replace(/-/g, ""));
    derived.set(code, keys);
    keys.catch(() => derived.delete(code));
  }
  return keys;
}

async function derive(clean: string): Promise<SyncKeys> {
  let ikm: CryptoKey;
  let salt: Uint8Array<ArrayBuffer>;
  if (clean.length === LONG_CHARS) {
    ikm = await crypto.subtle.importKey("raw", longCodeBytes(clean), "HKDF", false, ["deriveBits", "deriveKey"]);
    salt = enc("open-fit-sync-v1");
  } else {
    const password = await crypto.subtle.importKey("raw", enc(clean), "PBKDF2", false, ["deriveBits"]);
    const stretched = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc("open-fit-sync-v2-stretch"), iterations: PBKDF2_ROUNDS }, password, 256);
    ikm = await crypto.subtle.importKey("raw", stretched, "HKDF", false, ["deriveBits", "deriveKey"]);
    salt = enc("open-fit-sync-v2");
  }
  const params = (info: string): HkdfParams => ({ name: "HKDF", hash: "SHA-256", salt, info: enc(info) });
  const [id, token, key] = await Promise.all([
    crypto.subtle.deriveBits(params("id"), ikm, 256),
    crypto.subtle.deriveBits(params("write"), ikm, 256),
    crypto.subtle.deriveKey(params("key"), ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
  ]);
  return { id: hex(id), token: hex(token), key };
}

async function gzip(data: Uint8Array<ArrayBuffer>, mode: "compress" | "decompress"): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(mode === "compress" ? new CompressionStream("gzip") : new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Sealed layout: [format byte][12-byte IV][AES-GCM ciphertext]. Format 1 = gzipped JSON, 0 = plain JSON.
export async function seal(key: CryptoKey, backup: Backup): Promise<Uint8Array<ArrayBuffer>> {
  let plain: Uint8Array<ArrayBuffer> = new TextEncoder().encode(JSON.stringify(backup));
  const zipped = typeof CompressionStream === "function";
  if (zipped) plain = await gzip(plain, "compress");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const out = new Uint8Array(1 + iv.length + ct.length);
  out[0] = zipped ? 1 : 0;
  out.set(iv, 1);
  out.set(ct, 1 + iv.length);
  return out;
}

export async function unseal(key: CryptoKey, sealed: Uint8Array<ArrayBuffer>): Promise<unknown> {
  if (sealed.length < 14) throw new Error("Synced copy is damaged");
  const iv = sealed.slice(1, 13);
  let plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealed.slice(13)));
  if (sealed[0] === 1) plain = await gzip(plain, "decompress");
  return JSON.parse(new TextDecoder().decode(plain));
}

/** Fingerprint of a backup's content, ignoring when it was exported. */
export async function contentHash(backup: Backup): Promise<string> {
  const text = JSON.stringify({ ...backup, exported_at: "" });
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export class SyncConflict extends Error {}

/** The synced copy and its server version, or null if there isn't one yet. */
export async function download(url: string, keys: SyncKeys): Promise<{ version: string; data: unknown } | null> {
  const res = await fetch(`${url}/v1/${keys.id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sync server said ${res.status}`);
  const version = res.headers.get("ETag")?.replace(/"/g, "") ?? "";
  return { version, data: await unseal(keys.key, new Uint8Array(await res.arrayBuffer())) };
}

/**
 * Replace the synced copy. `base` is the version this device last saw (null
 * = there shouldn't be one yet); if someone else replaced it since, the
 * server refuses and this throws SyncConflict. Returns the new version.
 */
export async function upload(url: string, keys: SyncKeys, backup: Backup, base: string | null): Promise<string> {
  const res = await fetch(`${url}/v1/${keys.id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${keys.token}`,
      "Content-Type": "application/octet-stream",
      ...(base ? { "If-Match": `"${base}"` } : { "If-None-Match": "*" }),
    },
    body: await seal(keys.key, backup),
  });
  if (res.status === 409 || res.status === 412) throw new SyncConflict("The synced copy changed on another device");
  if (!res.ok) throw new Error(`Sync server said ${res.status}`);
  return res.headers.get("ETag")?.replace(/"/g, "") ?? "";
}

/** Delete the synced copy (turning sync off for good). */
export async function remove(url: string, keys: SyncKeys): Promise<void> {
  const res = await fetch(`${url}/v1/${keys.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${keys.token}` } });
  if (!res.ok && res.status !== 404) throw new Error(`Sync server said ${res.status}`);
}
