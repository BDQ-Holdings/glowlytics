import crypto from "crypto";
import fs from "fs";

/**
 * Google Search Console — Search Analytics API client.
 *
 * Auth: service-account JWT bearer flow (RFC 7523). The Node `crypto` module
 * signs the JWT with the service account's RSA private key and exchanges it
 * for a short-lived access token. No third-party dependencies.
 *
 * Configuration via env:
 *   GSC_SITE_URL                 — e.g. "https://glowlytics.ai/" or "sc-domain:glowlytics.ai"
 *   GSC_SERVICE_ACCOUNT_FILE     — path to the downloaded service-account JSON, OR
 *   GSC_SERVICE_ACCOUNT_JSON     — raw JSON string (handy for cron secrets)
 *
 * Setup checklist (one-time, takes ~5 minutes):
 *   1. Cloud Console → APIs & Services → enable "Google Search Console API".
 *   2. IAM & Admin → Service Accounts → create one (no roles required).
 *   3. On the new SA, Keys → Add key → JSON → save to disk.
 *   4. In Search Console → property → Users & permissions → add the
 *      service-account email (..iam.gserviceaccount.com) with "Restricted" or
 *      "Full" permission. Read-only is enough.
 *   5. Export GSC_SITE_URL + GSC_SERVICE_ACCOUNT_FILE (or _JSON).
 */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface GscRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API_BASE = "https://searchconsole.googleapis.com/webmasters/v3";

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Load the service-account credentials from either an inline JSON env var or
 * a file path. Returns null when neither is set — callers treat that as
 * "GSC not configured, skip silently".
 */
export function loadServiceAccount(): ServiceAccount | null {
  const inline = process.env.GSC_SERVICE_ACCOUNT_JSON;
  const filePath = process.env.GSC_SERVICE_ACCOUNT_FILE;

  let raw: string | null = null;
  if (inline && inline.trim()) {
    raw = inline.trim();
  } else if (filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`GSC_SERVICE_ACCOUNT_FILE points to missing file: ${filePath}`);
    }
    raw = fs.readFileSync(filePath, "utf-8");
  }
  if (!raw) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`GSC service-account JSON is not valid JSON: ${(err as Error).message}`);
  }
  const clientEmail = parsed.client_email;
  const privateKey = parsed.private_key;
  if (typeof clientEmail !== "string" || typeof privateKey !== "string") {
    throw new Error("GSC service-account JSON missing client_email or private_key.");
  }
  return {
    client_email: clientEmail,
    private_key: privateKey,
    token_uri: typeof parsed.token_uri === "string" ? parsed.token_uri : TOKEN_URI,
  };
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: sa.token_uri || TOKEN_URI,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signing = `${header}.${claim}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signing)
    .sign(sa.private_key);
  const jwt = `${signing}.${base64url(signature)}`;

  const res = await fetch(sa.token_uri || TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GSC token exchange failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(`GSC token response missing access_token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

/**
 * Pulls per-page Search Analytics rows over the given date range. Paginates
 * automatically when the property has more than 25,000 unique pages.
 */
export async function fetchSearchAnalytics(
  siteUrl: string,
  sa: ServiceAccount,
  startDate: string,
  endDate: string,
): Promise<GscRow[]> {
  const token = await getAccessToken(sa);
  const url = `${API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

  const pageSize = 25000;
  let startRow = 0;
  const rows: GscRow[] = [];

  // GSC caps a single request at 25,000 rows. We loop until we get a short
  // page, at which point we're caught up.
  for (let page = 0; page < 20; page++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["page"],
        rowLimit: pageSize,
        startRow,
        dataState: "all",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GSC searchAnalytics failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as {
      rows?: Array<{
        keys?: string[];
        clicks?: number;
        impressions?: number;
        ctr?: number;
        position?: number;
      }>;
    };
    const chunk = data.rows ?? [];
    for (const row of chunk) {
      const pageUrl = row.keys?.[0];
      if (!pageUrl) continue;
      rows.push({
        page: pageUrl,
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      });
    }
    if (chunk.length < pageSize) break;
    startRow += pageSize;
  }

  return rows;
}

/**
 * Maps `/blog/<slug>` (and faq/guides/glossary equivalents) to the slug.
 * Tolerates trailing slashes, query strings, and the `sc-domain:` property
 * format (returns hostname-less paths intact).
 */
export function pageUrlToSlug(pageUrl: string): { slug: string; type: string } | null {
  let pathname: string;
  try {
    const u = new URL(pageUrl);
    pathname = u.pathname;
  } catch {
    pathname = pageUrl.startsWith("/") ? pageUrl : `/${pageUrl}`;
  }
  pathname = pathname.replace(/\/+$/, "");
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [typeSeg, ...rest] = parts;
  const slug = rest.join("/");
  switch (typeSeg) {
    case "blog":
      return { slug, type: "blog" };
    case "faq":
      return { slug, type: "faq" };
    case "guides":
      return { slug, type: "guide" };
    case "glossary":
      return { slug, type: "glossary" };
    default:
      return null;
  }
}

/** Build a slug → 28d-aggregated metrics map suitable for joining in seo:report. */
export function rowsToSlugMap(rows: GscRow[]): Map<string, GscMetrics> {
  const map = new Map<string, GscMetrics>();
  for (const row of rows) {
    const parsed = pageUrlToSlug(row.page);
    if (!parsed) continue;
    const existing = map.get(parsed.slug);
    if (!existing) {
      map.set(parsed.slug, {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      });
    } else {
      // Same slug seen on a second URL (e.g. trailing slash variant). Sum the
      // counts and recompute CTR + impression-weighted position.
      const clicks = existing.clicks + row.clicks;
      const impressions = existing.impressions + row.impressions;
      const positionNumer =
        existing.position * existing.impressions + row.position * row.impressions;
      const position = impressions > 0 ? positionNumer / impressions : existing.position;
      map.set(parsed.slug, {
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        position,
      });
    }
  }
  return map;
}

/** ISO YYYY-MM-DD `daysAgo` UTC days before today (inclusive of today as offset 0). */
export function daysAgoUtc(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
