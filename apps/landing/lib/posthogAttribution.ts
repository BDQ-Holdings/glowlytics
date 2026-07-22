import type { CaptureResult } from "posthog-js";

export type Product = "glowlytics";
export type AcquisitionSource = "instagram" | "tiktok" | "facebook" | "google" | "other_search" | "ai_search" | "direct" | "referral" | "unknown";
export type AttributionQuality = "utm" | "referrer" | "unknown" | "backfilled";

export interface FirstTouchSnapshot {
  product: Product;
  acquisition_source: AcquisitionSource;
  acquisition_medium: string;
  attribution_model: "first_touch";
  attribution_quality: AttributionQuality;
  historical_backfill: false;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  google_click_id_present?: boolean;
  referrer_host?: string;
  landing_path?: string;
}

export const FIRST_TOUCH_STORAGE_KEY = "glowlytics:first-touch:v1";

const SEARCH_HOSTS = ["bing.com", "duckduckgo.com", "brave.com", "search.brave.com", "search.yahoo.com", "yahoo.com", "ecosia.org", "yandex.com", "baidu.com"];
const AI_HOSTS = ["chatgpt.com", "openai.com", "perplexity.ai", "claude.ai", "anthropic.com", "gemini.google.com", "copilot.microsoft.com"];
const OTHER_SEARCH_UTM_SOURCES = ["bing", "duckduckgo", "duck_duck_go", "ddg", "brave", "yahoo", "ecosia", "baidu", "yandex"];
const FACEBOOK_UTM_SOURCES = ["facebook", "fb", "meta_facebook"];
const FACEBOOK_HOSTS = ["facebook.com"];
const GOOGLE_QUICKSEARCH_HOST = "com.google.android.googlequicksearchbox";

const clean = (value: string | null | undefined, max = 256): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

const SENSITIVE_VALUE_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|((api[_-]?key|api|secret|password|credential|bearer|access|refresh|id)?[_-]?token=?)|\b(api[_-]?key|secret|password|credential|bearer)\b|((gclid|gbraid|wbraid)=?)/i;

function safeMarketingValue(value: string | null | undefined, max = 256): string | undefined {
  const v = clean(value, max);
  return v && !SENSITIVE_VALUE_RE.test(v) ? v : undefined;
}

type CaptureContainer = Record<string, unknown>;

const CLICK_ID_KEY_RE = /^\$?(initial_)?(gclid|gbraid|wbraid)$/i;
const SDK_FULL_URL_KEYS: Record<string, true> = {
  $current_url: true,
  $initial_current_url: true,
  current_url: true,
  $referrer: true,
  $initial_referrer: true,
  referrer: true,
};

function sanitizeContainer(input: CaptureContainer): CaptureContainer;
function sanitizeContainer(input: undefined): undefined;
function sanitizeContainer(input: CaptureContainer | undefined): CaptureContainer | undefined;
function sanitizeContainer(input: CaptureContainer | undefined): CaptureContainer | undefined {
  if (!input) return input;
  const out: CaptureContainer = {};
  for (const [key, value] of Object.entries(input)) {
    if (CLICK_ID_KEY_RE.test(key)) continue;
    if (SDK_FULL_URL_KEYS[key]) continue;
    if (typeof value === "string" && SENSITIVE_VALUE_RE.test(value) && key.startsWith("utm_")) continue;
    out[key] = value;
  }
  return out;
}

export function sanitizePostHogCaptureResult(result: CaptureResult | null): CaptureResult | null {
  if (result === null) return null;
  return {
    ...result,
    properties: sanitizeContainer(result.properties as CaptureContainer),
    $set: sanitizeContainer(result.$set as CaptureContainer | undefined),
    $set_once: sanitizeContainer(result.$set_once as CaptureContainer | undefined),
  };
}

const lower = (value: string | null | undefined): string | undefined => clean(value)?.toLowerCase();
const stripWww = (host: string): string => host.replace(/^www\./, "");
const hostMatches = (host: string, domains: string[]): boolean => {
  const h = stripWww(host);
  return domains.some((domain) => h === domain || h.endsWith(`.${domain}`));
};

const GOOGLE_HOST_RE = /(^|\.)google\.[a-z.]+$/;

function isGoogleSearchHost(host: string): boolean {
  if (!GOOGLE_HOST_RE.test(host)) return false;
  const suffix = host.slice(host.lastIndexOf("google.") + "google.".length);
  return suffix === "com" || /^[a-z]{2}$/.test(suffix) || /^com\.[a-z]{2}$/.test(suffix) || /^co\.[a-z]{2}$/.test(suffix);
}

export function sanitizeReferrerHost(referrer: string | null | undefined): string | undefined {
  const v = clean(referrer, 1024);
  if (!v) return undefined;
  try {
    return new URL(v).hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

export function sanitizeLandingPath(url: string): string {
  try {
    const parsed = new URL(url, "https://glowlytics.ai");
    return parsed.pathname || "/";
  } catch {
    return "/";
  }
}

export function classifyFirstTouch(input: { utmSource?: string; utmMedium?: string; utmCampaign?: string; referrerHost?: string; hasGoogleClickId?: boolean }): Pick<FirstTouchSnapshot, "acquisition_source" | "acquisition_medium" | "attribution_quality"> {
  const utmSource = lower(input.utmSource);
  const utmMedium = lower(input.utmMedium);
  const utmCampaign = lower(input.utmCampaign);
  const host = lower(input.referrerHost);

  if (input.hasGoogleClickId) return { acquisition_source: "google", acquisition_medium: "paid_search", attribution_quality: "utm" };

  if (utmSource) {
    if (FACEBOOK_UTM_SOURCES.includes(utmSource)) return { acquisition_source: "facebook", acquisition_medium: utmMedium || "organic_social", attribution_quality: "utm" };
    if (["instagram", "ig", "meta_instagram"].includes(utmSource)) return { acquisition_source: "instagram", acquisition_medium: utmMedium || "organic_social", attribution_quality: "utm" };
    if (["tiktok", "tik_tok"].includes(utmSource)) return { acquisition_source: "tiktok", acquisition_medium: utmMedium || "organic_social", attribution_quality: "utm" };
    if (utmSource.includes("google")) return { acquisition_source: "google", acquisition_medium: utmMedium || "paid_search", attribution_quality: "utm" };
    if (["chatgpt", "openai", "perplexity", "claude", "anthropic", "gemini", "copilot"].some((s) => utmSource.includes(s))) return { acquisition_source: "ai_search", acquisition_medium: "ai_search", attribution_quality: "utm" };
    if (OTHER_SEARCH_UTM_SOURCES.some((s) => utmSource.includes(s))) return { acquisition_source: "other_search", acquisition_medium: utmMedium || "organic_search", attribution_quality: "utm" };
  }

  const mediumCampaign = `${utmMedium || ""} ${utmCampaign || ""}`;
  if (/facebook/.test(mediumCampaign)) return { acquisition_source: "facebook", acquisition_medium: utmMedium || "organic_social", attribution_quality: "utm" };
  if (/instagram|\big\b/.test(mediumCampaign)) return { acquisition_source: "instagram", acquisition_medium: utmMedium || "organic_social", attribution_quality: "utm" };
  if (/tiktok|tik_tok/.test(mediumCampaign)) return { acquisition_source: "tiktok", acquisition_medium: utmMedium || "organic_social", attribution_quality: "utm" };
  if (/google/.test(mediumCampaign)) return { acquisition_source: "google", acquisition_medium: utmMedium || "paid_search", attribution_quality: "utm" };
  if (/chatgpt|openai|perplexity|claude|anthropic|gemini|copilot/.test(mediumCampaign)) return { acquisition_source: "ai_search", acquisition_medium: "ai_search", attribution_quality: "utm" };
  if (/bing|duckduckgo|duck_duck_go|ddg|brave|yahoo|ecosia|baidu|yandex/.test(mediumCampaign)) return { acquisition_source: "other_search", acquisition_medium: utmMedium || "organic_search", attribution_quality: "utm" };
  if (utmSource || utmMedium || utmCampaign) return { acquisition_source: "referral", acquisition_medium: utmMedium || "referral", attribution_quality: "utm" };

  if (host) {
    const h = stripWww(host);
    if (hostMatches(h, FACEBOOK_HOSTS)) return { acquisition_source: "facebook", acquisition_medium: "organic_social", attribution_quality: "referrer" };
    if (hostMatches(h, ["instagram.com"])) return { acquisition_source: "instagram", acquisition_medium: "organic_social", attribution_quality: "referrer" };
    if (hostMatches(h, ["tiktok.com"])) return { acquisition_source: "tiktok", acquisition_medium: "organic_social", attribution_quality: "referrer" };
    if (h === GOOGLE_QUICKSEARCH_HOST || isGoogleSearchHost(h)) return { acquisition_source: "google", acquisition_medium: "organic_search", attribution_quality: "referrer" };
    if (hostMatches(h, SEARCH_HOSTS)) return { acquisition_source: "other_search", acquisition_medium: "organic_search", attribution_quality: "referrer" };
    if (hostMatches(h, AI_HOSTS)) return { acquisition_source: "ai_search", acquisition_medium: "ai_search", attribution_quality: "referrer" };
    return { acquisition_source: "referral", acquisition_medium: "referral", attribution_quality: "referrer" };
  }

  return { acquisition_source: "direct", acquisition_medium: "direct", attribution_quality: "unknown" };
}

export function createFirstTouchSnapshot(input: { url: string; referrer?: string | null }): FirstTouchSnapshot {
  const parsed = new URL(input.url, "https://glowlytics.ai");
  const params = parsed.searchParams;
  const referrer_host = sanitizeReferrerHost(input.referrer || undefined);
  const googleClickIdPresent = ["gclid", "gbraid", "wbraid"].some((key) => params.has(key));
  const classified = classifyFirstTouch({
    utmSource: params.get("utm_source") || undefined,
    utmMedium: params.get("utm_medium") || undefined,
    utmCampaign: params.get("utm_campaign") || undefined,
    referrerHost: referrer_host,
    hasGoogleClickId: googleClickIdPresent,
  });
  const snapshot: FirstTouchSnapshot = {
    product: "glowlytics",
    ...classified,
    attribution_model: "first_touch",
    historical_backfill: false,
    landing_path: sanitizeLandingPath(input.url),
  };
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const) {
    const raw = safeMarketingValue(params.get(key));
    const value = key === "utm_source" || key === "utm_medium" ? raw?.toLowerCase() : raw;
    if (value) snapshot[key] = value;
  }
  if (googleClickIdPresent) snapshot.google_click_id_present = true;
  if (referrer_host) snapshot.referrer_host = referrer_host;
  return snapshot;
}

export function readStoredFirstTouch(): FirstTouchSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FIRST_TOUCH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FirstTouchSnapshot) : null;
  } catch {
    return null;
  }
}

export function storeFirstTouchOnce(snapshot: FirstTouchSnapshot): FirstTouchSnapshot {
  if (typeof window === "undefined") return snapshot;
  const existing = readStoredFirstTouch();
  if (existing) return existing;
  try {
    window.localStorage.setItem(FIRST_TOUCH_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {}
  return snapshot;
}
