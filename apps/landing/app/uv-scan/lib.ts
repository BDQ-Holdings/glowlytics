/**
 * Shared types, constants, and the heatmap colour ramp for the lo-fi
 * UV Mirror scan tool. Kept out of page.tsx so the component stays readable.
 *
 * Field names mirror the frozen HTTP contract in `.local/uv-feature-plan.md`
 * ("HTTP contract" + "Vision method"). Do not rename — backend agrees on these.
 */
import type { FirstTouchSnapshot } from "@/lib/posthogAttribution";


/** Public Express backend (cross-origin from landing; CORS is permissive). */
export const API_BASE =
  process.env.NEXT_PUBLIC_GLOWLYTICS_API ||
  "https://glowlytics-api-production.up.railway.app";

/** Attribution tag carried on /analyze and /lead so we know which form converted. */
export const SOURCE = "uv-scan-web";

/**
 * TODO(real-link): point this at the live App Store / Play Store listing once
 * the campaign URL is finalised. For now it deep-links the existing iOS listing
 * (same one the landing hero uses).
 */
export const APP_DOWNLOAD_URL = "https://apps.apple.com/app/glowlytics/id6760600635";

/** Mirrors WaitlistForm's validator so the two forms behave identically. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ── API response shapes (frozen contract) ─────────────────────────────── */

export interface ScreenCheck {
  id: string;
  label: string;
  /** `null` => the check was skipped (e.g. face_angle without landmarks). */
  pass: boolean | null;
  value: number;
  message: string;
}

export interface ScreenResponse {
  ok: boolean;
  canProceed: boolean;
  confidence: number;
  checks: ScreenCheck[];
}

export interface Overall {
  /** Higher = MORE damage (marketing framing). */
  sunDamageScore: number;
  severity: "low" | "moderate" | "high";
  confidence: number;
}

export interface HeatmapBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Heatmap {
  cols: number;
  rows: number;
  /** Normalised [0,1] face bbox of the original image. */
  bounds: HeatmapBounds;
  /** Row-major, length = cols*rows, each 0..1 damage intensity. */
  cells: number[];
}

export interface Region {
  id: string;
  label: string;
  /** Subject's anatomical side (mirror of image x). */
  side: "left" | "right" | "center";
  score: number;
  intensity: number;
  spotCount: number;
  polygon: number[][];
}

export interface Asymmetry {
  score: number;
  dominantSide: "left" | "right" | "balanced";
  leftMean: number;
  rightMean: number;
  perRegionDelta: Array<{ pair: string; delta: number }>;
}

export interface AnalyzeResponse {
  scan_id: string;
  claim_token: string;
  created_at: string;
  overall: Overall;
  heatmap: Heatmap;
  regions: Region[];
  asymmetry: Asymmetry;
  screener: ScreenResponse;
}

export interface LeadResponse {
  ok?: boolean;
  report_token?: string;
  error?: string;
}

/* ── Heatmap colour ramp ───────────────────────────────────────────────── */

const AMBER: [number, number, number] = [242, 181, 106]; // #F2B56A
const RED: [number, number, number] = [214, 64, 47]; // #D6402F
/** ~0.55 peak alpha so the face still reads through the overlay. */
const MAX_ALPHA = Math.round(0.55 * 255);

/**
 * Maps a 0..1 damage intensity to an RGBA tuple: transparent -> amber -> red.
 * Colour shifts from amber toward red only in the upper band; alpha ramps
 * from fully transparent at 0 (face shows clean) up to MAX_ALPHA, with a mild
 * gamma so low-mid values stay visible without washing the photo out.
 */
export function rampColor(v: number): [number, number, number, number] {
  const t = Math.min(1, Math.max(0, v));
  const colorT = Math.min(1, Math.max(0, (t - 0.4) / 0.6));
  const r = Math.round(AMBER[0] + (RED[0] - AMBER[0]) * colorT);
  const g = Math.round(AMBER[1] + (RED[1] - AMBER[1]) * colorT);
  const b = Math.round(AMBER[2] + (RED[2] - AMBER[2]) * colorT);
  const a = Math.round(Math.pow(t, 0.85) * MAX_ALPHA);
  return [r, g, b, a];
}

/** Fallback fix hints, keyed by screener check id, when the API message is empty. */
export const FIX_HINTS: Record<string, string> = {
  brightness: "Find more even light — not too dark, not too bright.",
  lighting_symmetry: "Lighting is uneven — face a window so both sides are lit.",
  highlight_clipping: "Too much glare — step out of direct light or harsh spots.",
  face_coverage: "Move closer and center your face in the frame.",
  face_angle: "Look straight at the camera, chin level.",
};

/* ── API calls (UV Mirror backend) ─────────────────────────────────────── */

/** Strips the `data:image/...;base64,` prefix → raw base64 the backend expects. */
export function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** Thrown when /analyze returns 422 (image unusable — too dark / blown out). */
export class UnusableImageError extends Error {
  checks: ScreenCheck[];
  constructor(message: string, checks: ScreenCheck[]) {
    super(message);
    this.name = "UnusableImageError";
    this.checks = checks;
  }
}

/** Live pre-capture quality gate. `imageBase64` is raw base64 (no data: prefix). */
export async function postScreen(imageBase64: string): Promise<ScreenResponse> {
  const r = await fetch(`${API_BASE}/api/uv/screen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  if (!r.ok) throw new Error(`screen failed (${r.status})`);
  return r.json();
}

/**
 * Full UV analysis. Persists the scan and returns the real heatmap, regions,
 * and asymmetry. Throws `UnusableImageError` on 422 so the flow can route the
 * user back to re-capture with the failing checks.
 */
export async function postAnalyze(
  imageBase64: string,
  source: string = SOURCE,
): Promise<AnalyzeResponse> {
  const r = await fetch(`${API_BASE}/api/uv/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: imageBase64, source }),
  });
  if (r.status === 422) {
    const body = await r.json().catch(() => ({}));
    throw new UnusableImageError(body.error || "Image unusable", body.checks || []);
  }
  if (!r.ok) throw new Error(`analyze failed (${r.status})`);
  return r.json();
}

export interface LeadAttributionOptions {
  firstTouch?: FirstTouchSnapshot | null;
  formPlacement?: string | null;
  source?: string | null;
}

type LeadOptionsOrSource = string | LeadAttributionOptions;

type LeadRequestBody = {
  email: string;
  scan_id: string;
  claim_token: string;
  source: string;
  acquisition_source: string;
  acquisition_medium: string;
  attribution_model: "first_touch";
  attribution_quality: string;
  form_placement: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  google_click_id_present: boolean;
  referrer_host?: string;
  landing_path?: string;
};

const SENSITIVE_MARKETING_VALUE_RE =
  /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|((api[_-]?key|api|secret|password|credential|bearer|access|refresh|id)?[_-]?token=?)|\b(api[_-]?key|secret|password|credential|bearer)\b|((gclid|gbraid|wbraid)=?)/i;

function safeMarketingValue(value: string | null | undefined, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed && !SENSITIVE_MARKETING_VALUE_RE.test(trimmed) ? trimmed : undefined;
}

function withSafeMarketingValue<K extends keyof LeadRequestBody>(
  body: LeadRequestBody,
  key: K,
  value: string | null | undefined,
  max: number,
) {
  const safe = safeMarketingValue(value, max);
  if (safe) body[key] = safe as LeadRequestBody[K];
}

function resolveLeadOptions(input: LeadOptionsOrSource | undefined): LeadAttributionOptions {
  return typeof input === "string" ? { source: input, formPlacement: input } : input || {};
}

function leadBody(
  email: string,
  scanId: string,
  claimToken: string,
  optionsOrSource?: LeadOptionsOrSource,
): LeadRequestBody {
  const options = resolveLeadOptions(optionsOrSource);
  const firstTouch = options.firstTouch;
  const body: LeadRequestBody = {
    email,
    scan_id: scanId,
    claim_token: claimToken,
    source: safeMarketingValue(options.source, 64) || SOURCE,
    acquisition_source: firstTouch?.acquisition_source || "unknown",
    acquisition_medium: safeMarketingValue(firstTouch?.acquisition_medium, 64) || "unknown",
    attribution_model: "first_touch",
    attribution_quality: firstTouch?.attribution_quality || "unknown",
    form_placement: safeMarketingValue(options.formPlacement, 64) || SOURCE,
    google_click_id_present: firstTouch?.google_click_id_present === true,
  };

  withSafeMarketingValue(body, "utm_source", firstTouch?.utm_source, 128);
  withSafeMarketingValue(body, "utm_medium", firstTouch?.utm_medium, 128);
  withSafeMarketingValue(body, "utm_campaign", firstTouch?.utm_campaign, 256);
  withSafeMarketingValue(body, "utm_term", firstTouch?.utm_term, 256);
  withSafeMarketingValue(body, "utm_content", firstTouch?.utm_content, 256);
  withSafeMarketingValue(body, "referrer_host", firstTouch?.referrer_host, 256);
  withSafeMarketingValue(body, "landing_path", firstTouch?.landing_path, 256);

  return body;
}

/** Email-for-report capture → enters the Loops nurture sequence. Returns the report token. */
export async function postLead(
  email: string,
  scanId: string,
  claimToken: string,
  optionsOrSource?: LeadOptionsOrSource,
): Promise<string> {
  const r = await fetch(`${API_BASE}/api/uv/lead`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(leadBody(email, scanId, claimToken, optionsOrSource)),
  });
  const body: LeadResponse = await r.json().catch(() => ({}));
  if (!r.ok || !body.report_token) throw new Error(body.error || `lead failed (${r.status})`);
  return body.report_token;
}

/** Public PDF report URL for a captured lead token. */
export function reportUrl(token: string): string {
  return `${API_BASE}/api/uv/report/${encodeURIComponent(token)}`;
}
