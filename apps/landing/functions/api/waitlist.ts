/**
 * Cloudflare Pages Function — waitlist signup.
 *
 * POST /api/waitlist
 *   body: { email: string, source?: string }
 *   200  { ok: true }              (identical for new + existing — no membership oracle)
 *   429  { error: "rate limited" }
 *   400  { error: "invalid email" }
 *   500  { error: "internal" }
 *
 * GET /api/waitlist
 *   200  { count: number }         (bucketed: rounded down to nearest 50)
 *
 * Storage: Cloudflare D1 (binding `WAITLIST_DB`). Table created via the
 * companion migration in functions/api/_schema.sql.
 *
 * Abuse: per-IP/day write cap via Cloudflare KV (binding `RATE_LIMIT_KV`); fails
 * open until the namespace is provisioned (see wrangler.toml).
 */

export interface Env {
  WAITLIST_DB: D1Database;
  // Optional so the site builds/runs before the namespace is provisioned;
  // rateLimited() fails open when this binding is absent.
  RATE_LIMIT_KV?: KVNamespace;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * Round a precise total down to the nearest 50 (e.g. 137 -> 100) so the public
 * social-proof number preserves order-of-magnitude without leaking the exact
 * waitlist size or growth rate (LND-05).
 */
export function bucketCount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n / 50) * 50;
}

let rateLimitWarned = false;

/**
 * Per-IP/day abuse cap backed by Cloudflare KV, keyed on cf-connecting-ip + UTC
 * day. Increments a counter and returns true once the day's count exceeds
 * `maxPerDay`. Fails OPEN (returns false) when RATE_LIMIT_KV is unbound so the
 * endpoint keeps working before the namespace is provisioned.
 */
export async function rateLimited(
  env: Env,
  request: Request,
  bucket: string,
  maxPerDay: number,
): Promise<boolean> {
  const kv = env.RATE_LIMIT_KV;
  if (!kv) {
    if (!rateLimitWarned) {
      rateLimitWarned = true;
      console.warn(
        "RATE_LIMIT_KV unbound — rate limiting disabled (failing open). Provision with " +
          "`wrangler kv:namespace create RATE_LIMIT_KV` and set the id in wrangler.toml.",
      );
    }
    return false;
  }
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${bucket}:${day}:${ip}`;
  const current = parseInt((await kv.get(key)) || "0", 10) || 0;
  if (current >= maxPerDay) return true;
  // ~25h TTL so the counter outlives the UTC day boundary, then self-expires.
  await kv.put(key, String(current + 1), { expirationTtl: 90000 });
  return false;
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204, headers: corsHeaders });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (await rateLimited(env, request, "waitlist", 60)) {
    return json(429, { error: "rate limited" });
  }

  let payload: {
    email?: unknown;
    source?: unknown;
    attribution_slug?: unknown;
    attribution_referrer?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json(400, { error: "invalid json" });
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return json(400, { error: "invalid email" });
  }

  const source =
    typeof payload.source === "string" && payload.source.length <= 64
      ? payload.source
      : "landing";

  const attributionSlug =
    typeof payload.attribution_slug === "string" && payload.attribution_slug.length <= 128
      ? payload.attribution_slug
      : null;
  const attributionReferrer =
    typeof payload.attribution_referrer === "string" &&
    payload.attribution_referrer.length <= 512
      ? payload.attribution_referrer
      : null;

  try {
    const existing = await env.WAITLIST_DB.prepare(
      "SELECT 1 FROM waitlist WHERE email = ? LIMIT 1",
    )
      .bind(email)
      .first();

    if (existing) {
      return json(200, { ok: true });
    }

    await env.WAITLIST_DB.prepare(
      `INSERT INTO waitlist
         (email, source, attribution_slug, attribution_referrer, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(email, source, attributionSlug, attributionReferrer, new Date().toISOString())
      .run();

    return json(200, { ok: true });
  } catch (err) {
    console.error("waitlist insert failed", err);
    return json(500, { error: "internal" });
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const result = await env.WAITLIST_DB.prepare(
      "SELECT COUNT(*) AS count FROM waitlist",
    ).first<{ count: number }>();
    return json(200, { count: bucketCount(result?.count ?? 0) });
  } catch (err) {
    console.error("waitlist count failed", err);
    return json(200, { count: 0 });
  }
};
