// fit-sync: encrypted backup storage for the Gym Floor Planner's sync code.
//
// It stores opaque bytes under an id and nothing else: no accounts, no
// email, no plaintext. The id and write token are derived from the code on
// the device (lib/fit/sync.ts); the server keeps only a hash of the token,
// so a leaked database can neither read nor replace anyone's copy.
//
//   GET    /v1/:id   → 200 sealed bytes + ETag, or 404
//   PUT    /v1/:id   → Authorization: Bearer <token>; If-Match "<etag>" to
//                      replace, If-None-Match * to create. 412 if stale.
//   DELETE /v1/:id   → Authorization: Bearer <token>
//
// Copies untouched for 400 days expire.

export interface Env {
  BLOBS: KVNamespace;
  /** Comma-separated origins allowed to call this, or "*". */
  ALLOWED_ORIGINS: string;
  RL_WRITE?: RateLimit;
  RL_READ?: RateLimit;
}

interface Meta {
  /** SHA-256 of the write token. */
  h: string;
  /** Version, returned as the ETag. */
  v: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const TTL_SECONDS = 400 * 24 * 60 * 60;
const ID = /^[0-9a-f]{64}$/;
const TOKEN = /^Bearer ([0-9a-f]{64})$/;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare for two hex strings of equal length. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cors(env: Env, origin: string | null): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  const ok = allowed.includes("*") || (origin !== null && allowed.includes(origin));
  if (!ok) return {};
  return {
    "Access-Control-Allow-Origin": allowed.includes("*") ? "*" : origin!,
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, If-Match, If-None-Match",
    "Access-Control-Expose-Headers": "ETag",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

async function limited(limiter: RateLimit | undefined, request: Request): Promise<boolean> {
  if (!limiter) return false;
  const key = request.headers.get("CF-Connecting-IP") ?? "unknown";
  return !(await limiter.limit({ key })).success;
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const headers = cors(env, origin);
  const reply = (status: number, body: BodyInit | null = null, extra: Record<string, string> = {}) =>
    new Response(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers, ...extra } });

  if (request.method === "OPTIONS") return reply(origin && headers["Access-Control-Allow-Origin"] ? 204 : 403);

  const match = new URL(request.url).pathname.match(/^\/v1\/([^/]+)$/);
  if (!match) return reply(404, "Not found");
  const id = match[1];
  if (!ID.test(id)) return reply(400, "Bad id");

  if (request.method === "GET") {
    if (await limited(env.RL_READ, request)) return reply(429, "Slow down");
    const { value, metadata } = await env.BLOBS.getWithMetadata<Meta>(id, "arrayBuffer");
    if (!value || !metadata) return reply(404, "No synced copy");
    return reply(200, value, { "Content-Type": "application/octet-stream", ETag: `"${metadata.v}"` });
  }

  if (request.method !== "PUT" && request.method !== "DELETE") return reply(405, "Method not allowed", { Allow: "GET, PUT, DELETE, OPTIONS" });
  if (await limited(env.RL_WRITE, request)) return reply(429, "Slow down");

  const token = request.headers.get("Authorization")?.match(TOKEN)?.[1];
  if (!token) return reply(401, "Missing write token");
  const tokenHash = await sha256(token);
  const current = await env.BLOBS.getWithMetadata<Meta>(id, "stream");
  await current.value?.cancel(); // only the metadata is needed here
  const existing = current.metadata;
  if (existing && !same(existing.h, tokenHash)) return reply(403, "Wrong write token");

  if (request.method === "DELETE") {
    if (existing) await env.BLOBS.delete(id);
    return reply(204);
  }

  // Optimistic concurrency: replace only the version the device last saw,
  // create only when the device believes there is nothing yet.
  if (existing) {
    if (request.headers.get("If-Match")?.replace(/"/g, "") !== existing.v) {
      return reply(412, "The synced copy changed since you last saw it", { ETag: `"${existing.v}"` });
    }
  } else if (request.headers.get("If-None-Match") !== "*") {
    return reply(412, "There is no synced copy to replace");
  }

  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BYTES) return reply(413, "Too large");
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return reply(400, "Empty body");
  if (body.byteLength > MAX_BYTES) return reply(413, "Too large");

  const version = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  await env.BLOBS.put(id, body, { metadata: { h: tokenHash, v: version } satisfies Meta, expirationTtl: TTL_SECONDS });
  return reply(existing ? 200 : 201, null, { ETag: `"${version}"` });
}

export default { fetch: handle } satisfies ExportedHandler<Env>;
