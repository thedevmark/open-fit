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
const CODE_BYTES = 16; // 128 bits
const CODE_CHARS = Math.ceil((CODE_BYTES * 8) / 5); // 26

/** A fresh random code, shown in groups of four: "7KQ2-…". */
export function newSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_BYTES));
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join("-");
}

/** Accepts what people actually type: lowercase, spaces, O for 0, I/L for 1. Null if it can't be a code. */
export function normalizeCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (clean.length !== CODE_CHARS || [...clean].some((c) => !ALPHABET.includes(c))) return null;
  return clean.match(/.{1,4}/g)!.join("-");
}

function codeBytes(code: string): Uint8Array<ArrayBuffer> {
  const clean = code.replace(/-/g, "");
  const out = new Uint8Array(CODE_BYTES);
  let bits = 0;
  let value = 0;
  let i = 0;
  for (const c of clean) {
    value = (value << 5) | ALPHABET.indexOf(c);
    bits += 5;
    if (bits >= 8 && i < CODE_BYTES) {
      out[i++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return out;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const SALT = new TextEncoder().encode("open-fit-sync-v1");

export interface SyncKeys {
  /** Where the copy lives on the server. Reveals nothing about the code. */
  id: string;
  /** Proves the right to replace the copy; the server keeps only its hash. */
  token: string;
  key: CryptoKey;
}

export async function deriveKeys(code: string): Promise<SyncKeys> {
  const ikm = await crypto.subtle.importKey("raw", codeBytes(code), "HKDF", false, ["deriveBits", "deriveKey"]);
  const params = (info: string): HkdfParams => ({ name: "HKDF", hash: "SHA-256", salt: SALT, info: new TextEncoder().encode(info) });
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
