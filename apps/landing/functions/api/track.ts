/**
 * Cloudflare Pages Function — article pageview beacon.
 *
 * POST /api/track
 *   body: { slug: string, type: "blog"|"faq"|"guide"|"glossary",
 *           path: string, ref?: string, utm?: Record<string,string> }
 *   204 No Content (always; failures are silent so a beacon never blocks UI)
 *
 * Storage: D1 binding `WAITLIST_DB`, table `pageviews` (see _schema_002_seo.sql).
 *
 * Privacy: we never persist IP or user agent. Each row stores a
 *   visitor_hash = sha256(salt + day + ip + ua-fingerprint).slice(0,16)
 * which rotates daily and is one-way. Country comes from Cloudflare's
 * geo header at edge resolution (no precise location).
 *
 * Salt: when TRACK_SALT is unset we use a random per-request salt (fail closed)
 * rather than a public default — counts are preserved but cross-day visitor
 * correlation is intentionally lost. Abuse: per-IP/day cap via Cloudflare KV
 * (binding `RATE_LIMIT_KV`); rejects requests if KV is unavailable.
 */

export interface Env {
  WAITLIST_DB: D1Database;
  TRACK_SALT?: string;
  // Optional for isolated tests, but production requests fail closed when absent.
  RATE_LIMIT_KV?: KVNamespace;
}

const ALLOWED_TYPES = new Set(["blog", "faq", "guide", "glossary"]);
const MAX_FIELD = 256;

// Common SEO/AI crawlers and synthetic monitors. We bot-filter aggressively;
// GSC is the source of truth for what Google sees, our pageviews table is for
// "real humans landed and read this".
const BOT_RE =
  /bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|headlesschrome|lighthouse|pingdom|monitor|gptbot|claudebot|chatgpt-user|perplexitybot|anthropic-ai|google-extended|applebot|duckduckbot|baiduspider|yandex|semrush|ahrefs|mj12bot|dotbot|petalbot|seznambot|ia_archiver/i;

function trim(input: unknown, max: number = MAX_FIELD): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  if (!v) return null;
  return v.length > max ? v.slice(0, max) : v;
}

function refHost(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    return u.hostname || null;
  } catch {
    return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Resolve the visitor-hash salt. When TRACK_SALT is provisioned we use it so a
 * visitor gets a stable daily hash (cross-day de-dup works). When it is unset we
 * fail CLOSED with a random per-request salt: the pageview row (and so the
 * count) is still recorded, but the resulting visitor_hash is non-correlatable —
 * it can no longer be brute-forced back to an IP+UA. Trade-off: counts
 * preserved, repeat-visitor de-duplication lost while the salt is missing.
 */
export function resolveTrackSalt(env: Env): string {
  if (env.TRACK_SALT) return env.TRACK_SALT;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

let rateLimitWarned = false;

/**
 * Per-IP/day abuse cap backed by Cloudflare KV, keyed on cf-connecting-ip + UTC
 * day. Increments a counter and returns true once the day's count reaches
 * `maxPerDay`. Missing or unavailable KV fails closed.
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
      console.error("RATE_LIMIT_KV unbound — rejecting public writes.");
    }
    return true;
  }
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const day = utcDay();
  const key = `rl:${bucket}:${day}:${ip}`;
  try {
    const current = parseInt((await kv.get(key)) || "0", 10) || 0;
    if (current >= maxPerDay) return true;
    // ~25h TTL so the counter outlives the UTC day boundary, then self-expires.
    await kv.put(key, String(current + 1), { expirationTtl: 90000 });
    return false;
  } catch (error) {
    console.error("RATE_LIMIT_KV unavailable — rejecting public write.", error);
    return true;
  }
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // We always reply 204 so the beacon is a true fire-and-forget; logging is
  // best-effort and never surfaces to the user.
  const noContent = new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Origin": "*" },
  });

  try {
    const ua = request.headers.get("user-agent") || "";
    if (ua && BOT_RE.test(ua)) return noContent;

    if (await rateLimited(env, request, "track", 600)) return noContent;

    const payload = (await request.json().catch(() => null)) as
      | {
          slug?: unknown;
          type?: unknown;
          path?: unknown;
          ref?: unknown;
          utm?: Record<string, unknown>;
        }
      | null;
    if (!payload) return noContent;

    const slug = trim(payload.slug);
    const type = trim(payload.type, 16);
    const path = trim(payload.path, 512);
    if (!slug || !type || !path) return noContent;
    if (!ALLOWED_TYPES.has(type)) return noContent;

    const utm = payload.utm && typeof payload.utm === "object" ? payload.utm : {};
    const utmSource = trim(utm.utm_source);
    const utmMedium = trim(utm.utm_medium);
    const utmCampaign = trim(utm.utm_campaign);
    const referrerHost = refHost(trim(payload.ref, 1024));

    const day = utcDay();
    const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
    const country = request.headers.get("cf-ipcountry") || null;
    // Fail closed: an unset TRACK_SALT uses a fresh random salt (not a public
    // default), so visitor_hash stays non-correlatable. See resolveTrackSalt().
    const salt = resolveTrackSalt(env);
    // Coarse UA fingerprint (browser family) keeps unique-visitor math sane
    // without persisting the full UA string.
    const uaFp = ua.replace(/\d+/g, "").slice(0, 64);
    const visitorHash = (await sha256Hex(`${salt}|${day}|${ip}|${uaFp}`)).slice(0, 16);

    await env.WAITLIST_DB.prepare(
      `INSERT INTO pageviews
         (slug, content_type, path, referrer_host, utm_source, utm_medium,
          utm_campaign, country, visitor_hash, day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        slug,
        type,
        path,
        referrerHost,
        utmSource,
        utmMedium,
        utmCampaign,
        country,
        visitorHash,
        day,
      )
      .run();
  } catch (err) {
    console.error("track insert failed", err);
  }

  return noContent;
};
