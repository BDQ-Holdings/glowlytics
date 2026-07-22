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
  GLOWLYTICS_CUTOVER_AT?: string;
  NEXT_PUBLIC_POSTHOG_API_KEY?: string;
  NEXT_PUBLIC_POSTHOG_HOST?: string;
  // Optional so the site builds/runs before the namespace is provisioned;
  // rateLimited() fails open when this binding is absent.
  RATE_LIMIT_KV?: KVNamespace;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type AcquisitionSource =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "google"
  | "other_search"
  | "ai_search"
  | "direct"
  | "referral"
  | "unknown";
type AttributionQuality = "utm" | "referrer" | "unknown" | "backfilled";
type FormPlacement = "hero" | "footer" | "modal" | "pricing" | "mobile_onboarding" | "unknown";

const ACQUISITION_SOURCES: Record<AcquisitionSource, true> = {
  instagram: true,
  tiktok: true,
  facebook: true,
  google: true,
  other_search: true,
  ai_search: true,
  direct: true,
  referral: true,
  unknown: true,
};
const ATTRIBUTION_QUALITIES: Record<AttributionQuality, true> = {
  utm: true,
  referrer: true,
  unknown: true,
  backfilled: true,
};
const FORM_PLACEMENT_ALIASES: Record<string, FormPlacement> = {
  hero: "hero",
  footer: "footer",
  "final-cta": "footer",
  "blog-newsletter": "footer",
  modal: "modal",
  pricing: "pricing",
  mobile_onboarding: "mobile_onboarding",
  "uv-scan-web": "unknown",
  unknown: "unknown",
};
const MAX_ATTR = 256;

interface StoredWaitlistRow {
  id: number;
  created_at: string;
  acquisition_source: string | null;
  acquisition_medium: string | null;
  attribution_model: string | null;
  attribution_quality: string | null;
  historical_backfill: number | null;
  form_placement: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  google_click_id_present: number | null;
  referrer_host: string | null;
  landing_path: string | null;
}

const WAITLIST_ROW_SQL = `
  SELECT id,
         created_at,
         acquisition_source,
         acquisition_medium,
         attribution_model,
         attribution_quality,
         historical_backfill,
         form_placement,
         utm_source,
         utm_medium,
         utm_campaign,
         utm_term,
         utm_content,
         google_click_id_present,
         referrer_host,
         landing_path
    FROM waitlist
   WHERE email = ?
   LIMIT 1`;

function field(input: unknown, max = MAX_ATTR): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

const SENSITIVE_VALUE_RE =
  /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|((api[_-]?key|api|secret|password|credential|bearer|access|refresh|id)?[_-]?token=?)|\b(api[_-]?key|secret|password|credential|bearer)\b|((gclid|gbraid|wbraid)=?)/i;

function marketingField(input: unknown, max = MAX_ATTR): string | null {
  const value = field(input, max);
  return value && !SENSITIVE_VALUE_RE.test(value) ? value : null;
}

export function normalizeFormPlacement(input: unknown): FormPlacement {
  const value = field(input, 64);
  return (value && FORM_PLACEMENT_ALIASES[value]) || "unknown";
}

function hostnameOnly(input: unknown): string | null {
  const raw = field(input, 1024);
  if (!raw) return null;
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase().slice(0, MAX_ATTR) || null;
  } catch {
    return /^[a-z0-9.-]+$/i.test(raw) && !raw.includes("@")
      ? raw.toLowerCase().slice(0, MAX_ATTR)
      : null;
  }
}

function pathOnly(input: unknown): string | null {
  const raw = field(input, 1024);
  if (!raw) return null;
  try {
    const parsed = raw.startsWith("/") ? new URL(raw, "https://glowlytics.ai") : new URL(raw);
    return (parsed.pathname || "/").slice(0, MAX_ATTR);
  } catch {
    const path = raw.split(/[?#]/, 1)[0];
    return path.startsWith("/") ? path.slice(0, MAX_ATTR) : null;
  }
}

function parseAttribution(payload: Record<string, unknown>) {
  const acquisitionSource = field(payload.acquisition_source, 32) as AcquisitionSource | null;
  const attributionQuality = field(payload.attribution_quality, 32) as AttributionQuality | null;
  return {
    acquisition_source:
      acquisitionSource && ACQUISITION_SOURCES[acquisitionSource] ? acquisitionSource : "unknown",
    acquisition_medium: field(payload.acquisition_medium, 64) || "unknown",
    attribution_model: "first_touch" as const,
    attribution_quality:
      attributionQuality && ATTRIBUTION_QUALITIES[attributionQuality] ? attributionQuality : "unknown",
    historical_backfill: false,
    form_placement: normalizeFormPlacement(payload.form_placement),
    utm_source: marketingField(payload.utm_source, 128)?.toLowerCase() || null,
    utm_medium: marketingField(payload.utm_medium, 128)?.toLowerCase() || null,
    utm_campaign: marketingField(payload.utm_campaign, 256),
    utm_term: marketingField(payload.utm_term, 256),
    utm_content: marketingField(payload.utm_content, 256),
    google_click_id_present: payload.google_click_id_present === true,
    referrer_host: hostnameOnly(payload.referrer_host),
    landing_path: pathOnly(payload.landing_path),
  };
}

async function waitlistSubmittedUuid(rowId: number): Promise<string> {
  const namespaceHex = "8f3138f3b4e55af1bd6f25fb94a89a9f";
  const namespaceBytes = new Uint8Array(16);
  for (let index = 0; index < namespaceBytes.length; index += 1) {
    namespaceBytes[index] = Number.parseInt(namespaceHex.slice(index * 2, index * 2 + 2), 16);
  }
  const nameBytes = new TextEncoder().encode(`glowlytics|forward|waitlist_submitted|d1|${rowId}`);
  const input = new Uint8Array(namespaceBytes.length + nameBytes.length);
  input.set(namespaceBytes);
  input.set(nameBytes, namespaceBytes.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", input));
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function captureWaitlistSubmitted(env: Env, row: StoredWaitlistRow): Promise<void> {
  const apiKey = env.NEXT_PUBLIC_POSTHOG_API_KEY;
  if (!apiKey) throw new Error("PostHog project key is unavailable");
  const distinctId = `glowlytics:lead:d1:${row.id}`;
  const acquisitionSource = field(row.acquisition_source, 32) as AcquisitionSource | null;
  const attributionQuality = field(row.attribution_quality, 32) as AttributionQuality | null;
  const host = (env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
  const response = await fetch(`${host}/batch/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      batch: [
        {
          uuid: await waitlistSubmittedUuid(row.id),
          event: "waitlist_submitted",
          timestamp: row.created_at,
          properties: {
            distinct_id: distinctId,
            product: "glowlytics",
            acquisition_source:
              acquisitionSource && ACQUISITION_SOURCES[acquisitionSource]
                ? acquisitionSource
                : "unknown",
            acquisition_medium: marketingField(row.acquisition_medium, 64) || "unknown",
            attribution_model: "first_touch",
            attribution_quality:
              attributionQuality && ATTRIBUTION_QUALITIES[attributionQuality]
                ? attributionQuality
                : "unknown",
            historical_backfill: false,
            form_placement: normalizeFormPlacement(row.form_placement),
            utm_source: marketingField(row.utm_source, 128)?.toLowerCase() || null,
            utm_medium: marketingField(row.utm_medium, 128)?.toLowerCase() || null,
            utm_campaign: marketingField(row.utm_campaign, 256),
            utm_term: marketingField(row.utm_term, 256),
            utm_content: marketingField(row.utm_content, 256),
            google_click_id_present: Boolean(row.google_click_id_present),
            referrer_host: hostnameOnly(row.referrer_host),
            landing_path: pathOnly(row.landing_path),
          },
        },
      ],
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`PostHog batch capture failed with status ${response.status}`);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json", ...corsHeaders },
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

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid json" });
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return json(400, { error: "invalid email" });
  }

  const cutoverMs = Date.parse(env.GLOWLYTICS_CUTOVER_AT || "");
  if (!Number.isFinite(cutoverMs)) {
    return json(500, { error: "cutover_not_configured" });
  }
  const source =
    typeof payload.source === "string" && payload.source.length <= 64
      ? payload.source
      : "landing";
  const attributionSlug =
    typeof payload.attribution_slug === "string" && payload.attribution_slug.length <= 128
      ? payload.attribution_slug
      : null;
  const attribution = parseAttribution(payload);
  const createdAt = new Date().toISOString();

  try {
    await env.WAITLIST_DB.prepare(
      `INSERT OR IGNORE INTO waitlist
         (email, source, attribution_slug, attribution_referrer,
          acquisition_source, acquisition_medium, attribution_model, attribution_quality,
          historical_backfill, form_placement, utm_source, utm_medium, utm_campaign,
          utm_term, utm_content, google_click_id_present, referrer_host, landing_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        email,
        source,
        attributionSlug,
        attribution.referrer_host,
        attribution.acquisition_source,
        attribution.acquisition_medium,
        attribution.attribution_model,
        attribution.attribution_quality,
        attribution.historical_backfill ? 1 : 0,
        attribution.form_placement,
        attribution.utm_source,
        attribution.utm_medium,
        attribution.utm_campaign,
        attribution.utm_term,
        attribution.utm_content,
        attribution.google_click_id_present ? 1 : 0,
        attribution.referrer_host,
        attribution.landing_path,
        createdAt,
      )
      .run();

    const row = await env.WAITLIST_DB.prepare(WAITLIST_ROW_SQL)
      .bind(email)
      .first<StoredWaitlistRow>();
    if (!row) throw new Error("waitlist row unavailable after insert");
    const rowCreatedAtMs = Date.parse(row.created_at);
    if (!Number.isFinite(rowCreatedAtMs)) throw new Error("waitlist row has invalid created_at");
    if (rowCreatedAtMs >= cutoverMs) {
      try {
        await captureWaitlistSubmitted(env, row);
      } catch (error) {
        console.error("waitlist tracking failed", error);
        return json(500, { error: "tracking_unavailable" });
      }
    }
    return json(200, { ok: true });
  } catch (error) {
    console.error("waitlist insert failed", error);
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
