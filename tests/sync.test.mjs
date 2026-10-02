// Sync code, end to end: the real client (lib/fit/sync.ts) against the real
// worker handler (sync/) over an in-memory KV.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentHash, deriveKeys, download, isLongCode, newSyncCode, normalizeCode, remove, SyncConflict, upload } from '../src/lib/sync.ts';
import { handle } from '../sync/src/index.ts';

const URL_BASE = 'https://sync.test';
// The id the original (pre-short-code) implementation derived for the all-zeros long code.
const LONG_ZERO_ID = 'ac96883ef3fbaf6311a847416c42661789a20d6b6545b99cc886124a8af587c5';

function fakeKV() {
  const store = new Map();
  return {
    store,
    async getWithMetadata(key, type) {
      const hit = store.get(key);
      if (!hit) return { value: null, metadata: null };
      const value = type === 'stream' ? new Blob([hit.value]).stream() : hit.value.slice(0);
      return { value, metadata: hit.metadata };
    },
    async put(key, value, opts) { store.set(key, { value, metadata: opts.metadata }); },
    async delete(key) { store.delete(key); },
  };
}

function serve(env) {
  globalThis.fetch = async (input, init = {}) => {
    const req = new Request(input, { ...init, headers: { Origin: 'https://app.example', ...(init.headers ?? {}) } });
    return handle(req, env);
  };
}

const backup = (sets) => ({
  app: 'open-fit', version: 1, exported_at: new Date().toISOString(),
  equipment: [], exercises: [], templates: [], sessions: [{ id: 's1' }], sets, settings: { id: 'settings' },
});

test('codes are 10 characters, grouped, and survive sloppy retyping; long codes are not accepted', () => {
  const code = newSyncCode();
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
  assert.notEqual(newSyncCode(), code);
  assert.equal(normalizeCode(code.toLowerCase().replace('-', ' ')), code);
  assert.equal(normalizeCode('OOOOO-IIIII'), '00000-11111');
  assert.equal(normalizeCode('too short'), null);
  assert.equal(normalizeCode('0000-0000-0000-0000-0000-0000-00'), null, 'only migrated, never typed');
  assert.ok(isLongCode('0000-0000-0000-0000-0000-0000-00') && !isLongCode(code));
});

test('a long code still derives the keys it always had, so its copy can be migrated', async () => {
  // Pinned: a device on a first-generation code reads its old copy with these keys before switching to a short code.
  const keys = await deriveKeys('0000-0000-0000-0000-0000-0000-00');
  assert.equal(keys.id, LONG_ZERO_ID);
});

test('keys: the server-facing id and token are stable per code and reveal nothing shared', async () => {
  const code = newSyncCode();
  const a = await deriveKeys(code);
  const b = await deriveKeys(code);
  assert.equal(a.id, b.id);
  assert.equal(a.token, b.token);
  assert.notEqual(a.id, a.token);
  assert.notEqual((await deriveKeys(newSyncCode())).id, a.id);
});

test('round trip: upload, download, replace with the right version only, delete', async () => {
  const kv = fakeKV();
  serve({ BLOBS: kv, ALLOWED_ORIGINS: 'https://app.example' });
  const keys = await deriveKeys(newSyncCode());

  assert.equal(await download(URL_BASE, keys), null, 'nothing synced yet');
  const v1 = await upload(URL_BASE, keys, backup([{ id: 'x', reps: 12 }]), null);
  const got = await download(URL_BASE, keys);
  assert.equal(got.version, v1);
  assert.deepEqual(got.data.sets, [{ id: 'x', reps: 12 }]);

  // The server only ever holds ciphertext.
  const stored = new TextDecoder().decode([...kv.store.values()][0].value);
  assert.doesNotMatch(stored, /reps|open-fit|settings/);

  const v2 = await upload(URL_BASE, keys, backup([{ id: 'x', reps: 10 }]), v1);
  assert.notEqual(v2, v1);
  await assert.rejects(upload(URL_BASE, keys, backup([]), v1), SyncConflict, 'a stale version is refused');
  await assert.rejects(upload(URL_BASE, keys, backup([]), null), SyncConflict, 'creating over an existing copy is refused');

  await remove(URL_BASE, keys);
  assert.equal(await download(URL_BASE, keys), null);
});

test('another code can neither read nor overwrite a copy', async () => {
  const kv = fakeKV();
  serve({ BLOBS: kv, ALLOWED_ORIGINS: '*' });
  const mine = await deriveKeys(newSyncCode());
  const v = await upload(URL_BASE, mine, backup([{ id: 'x' }]), null);

  const theirs = await deriveKeys(newSyncCode());
  await assert.rejects(upload(URL_BASE, { ...theirs, id: mine.id }, backup([]), v), /403/, 'wrong token for the id');
  await assert.rejects(download(URL_BASE, { ...mine, key: theirs.key }), 'wrong key cannot decrypt');
});

test('worker: bad ids, oversized bodies, foreign origins', async () => {
  const env = { BLOBS: fakeKV(), ALLOWED_ORIGINS: 'https://app.example' };
  const at = (path, init = {}) => handle(new Request(`${URL_BASE}${path}`, init), env);
  assert.equal((await at('/v1/not-hex')).status, 400);
  assert.equal((await at('/elsewhere')).status, 404);
  const id = 'a'.repeat(64);
  const auth = { Authorization: `Bearer ${'b'.repeat(64)}`, 'If-None-Match': '*' };
  assert.equal((await at(`/v1/${id}`, { method: 'PUT', headers: auth, body: new Uint8Array(6 * 1024 * 1024) })).status, 413);
  assert.equal((await at(`/v1/${id}`, { method: 'PUT', headers: { 'If-None-Match': '*' }, body: 'x' })).status, 401);
  const foreign = await at(`/v1/${id}`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null);
});

test('content hash ignores the export time only', async () => {
  const a = backup([{ id: 'x' }]);
  const b = { ...a, exported_at: '2000-01-01T00:00:00.000Z' };
  assert.equal(await contentHash(a), await contentHash(b));
  assert.notEqual(await contentHash(a), await contentHash(backup([{ id: 'y' }])));
});
