### Task 1: Landing PostHog Bootstrap and First-Touch Contract

**Files:**
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/landing/package.json`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/landing/app/layout.tsx`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/landing/components/PostHogAttribution.tsx`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/landing/lib/posthogAttribution.ts`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/landing/lib/__tests__/posthogAttribution.test.ts`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/landing/components/__tests__/PostHogAttribution.config.test.ts`

**Interfaces:**
- Consumes: browser `window.location`, `document.referrer`, `posthog-js`.
- Produces:
  - `type AcquisitionSource = "instagram" | "tiktok" | "google" | "other_search" | "ai_search" | "direct" | "referral" | "unknown"`
  - `type AttributionQuality = "utm" | "referrer" | "unknown" | "backfilled"`
  - `type FirstTouchSnapshot = { product: "glowlytics"; acquisition_source: AcquisitionSource; acquisition_medium: string; attribution_model: "first_touch"; attribution_quality: AttributionQuality; historical_backfill: false; utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_term?: string; utm_content?: string; google_click_id_present?: boolean; referrer_host?: string; landing_path?: string }`
  - `captureLandingPageview(pathname: string, search: string, referrer: string): FirstTouchSnapshot`
  - `readStoredFirstTouch(): FirstTouchSnapshot | null`
  - `getPostHogDistinctId(): string | null`
  - `sanitizePostHogCaptureResult(result: CaptureResult | null): CaptureResult | null` for `posthog-js` `before_send`, returning `null` unchanged and deleting SDK-added full URL/referrer fields from `properties`, `$set`, and `$set_once`; only canonical `landing_path` and `referrer_host` may remain.
  - `POSTHOG_INIT_OPTIONS` with `save_campaign_params: false`, `mask_personal_data_properties: true`, and `before_send: sanitizePostHogCaptureResult`, so SDK persistence does not store raw click IDs or duplicate unsanitized campaign values before the sanitizer runs.

- [ ] **Step 1: Add focused failing first-touch tests**

Create `/Users/mustafaboorenie/cornell-hackathon/apps/landing/lib/__tests__/posthogAttribution.test.ts`:

```ts
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { CaptureResult } from "posthog-js";
import {
  classifyFirstTouch,
  createFirstTouchSnapshot,
  sanitizeLandingPath,
  sanitizePostHogCaptureResult,
  sanitizeReferrerHost,
} from "../posthogAttribution";
const captureResult = (overrides: Partial<CaptureResult>): CaptureResult => ({
  uuid: "00000000-0000-4000-8000-000000000001",
  event: "$pageview",
  properties: {},
  ...overrides,
});

beforeEach(() => {
  delete process.env.TZ;
});

describe("classifyFirstTouch", () => {
  it("uses explicit UTM source before referrer and keeps form placement out of acquisition_source", () => {
    const snapshot = createFirstTouchSnapshot({
      url: "https://glowlytics.ai/?utm_source=ig&utm_medium=paid_social&utm_campaign=launch&form_placement=hero",
      referrer: "https://www.google.com/search?q=glowlytics",
    });

    assert.equal(snapshot.product, "glowlytics");
    assert.equal(snapshot.acquisition_source, "instagram");
    assert.equal(snapshot.acquisition_medium, "paid_social");
    assert.equal(snapshot.attribution_model, "first_touch");
    assert.equal(snapshot.attribution_quality, "utm");
    assert.equal(snapshot.historical_backfill, false);
    assert.equal(snapshot.utm_source, "ig");
    assert.equal(snapshot.referrer_host, "www.google.com");
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot, "form_placement"), false);
  });

  it("classifies observed production referrer hosts before falling back to generic referral", () => {
    assert.equal(classifyFirstTouch({ referrerHost: "l.instagram.com" }).acquisition_source, "instagram");
    assert.equal(classifyFirstTouch({ referrerHost: "www.instagram.com" }).acquisition_source, "instagram");
    assert.equal(classifyFirstTouch({ referrerHost: "www.tiktok.com" }).acquisition_source, "tiktok");
    assert.equal(classifyFirstTouch({ referrerHost: "m.tiktok.com" }).acquisition_source, "tiktok");
    assert.equal(classifyFirstTouch({ referrerHost: "www.google.co.uk" }).acquisition_source, "google");
    assert.equal(classifyFirstTouch({ referrerHost: "google.com.br" }).acquisition_source, "google");
    assert.equal(classifyFirstTouch({ referrerHost: "google.evil.com" }).acquisition_source, "referral");
    assert.equal(classifyFirstTouch({ referrerHost: "com.google.android.googlequicksearchbox" }).acquisition_source, "google");
    assert.equal(classifyFirstTouch({ referrerHost: "www.bing.com" }).acquisition_source, "other_search");
    assert.equal(classifyFirstTouch({ referrerHost: "www.duckduckgo.com" }).acquisition_source, "other_search");
    assert.equal(classifyFirstTouch({ referrerHost: "search.brave.com" }).acquisition_source, "other_search");
    assert.equal(classifyFirstTouch({ referrerHost: "www.search.yahoo.com" }).acquisition_source, "other_search");
    assert.equal(classifyFirstTouch({ referrerHost: "www.ecosia.org" }).acquisition_source, "other_search");
    assert.equal(classifyFirstTouch({ referrerHost: "perplexity.ai" }).acquisition_source, "ai_search");
    assert.equal(classifyFirstTouch({ referrerHost: "example.org" }).acquisition_source, "referral");
    assert.equal(classifyFirstTouch({}).acquisition_source, "direct");
  });

  it("maps other-search UTM sources before generic UTM fallback", () => {
    const bing = classifyFirstTouch({ utmSource: "bing", utmMedium: "CPC" });
    assert.equal(bing.acquisition_source, "other_search");
    assert.equal(bing.acquisition_medium, "cpc");
    assert.equal(bing.attribution_quality, "utm");
  });

  it("maps remaining usable UTM signals to referral instead of direct", () => {
    const facebook = classifyFirstTouch({ utmSource: "facebook", utmMedium: "Paid_Social" });
    assert.equal(facebook.acquisition_source, "referral");
    assert.equal(facebook.acquisition_medium, "paid_social");
    assert.equal(facebook.attribution_quality, "utm");
    assert.equal(classifyFirstTouch({ utmCampaign: "newsletter" }).acquisition_source, "referral");
  });

  it("uses Google click-id presence as a boolean signal without storing the click ID", () => {
    const snapshot = createFirstTouchSnapshot({
      url: "https://glowlytics.ai/?gclid=secret-click-id&utm_campaign=launch",
      referrer: "",
    });

    assert.equal(snapshot.acquisition_source, "google");
    assert.equal(snapshot.acquisition_medium, "paid_search");
    assert.equal(snapshot.google_click_id_present, true);
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot, "gclid"), false);
    assert.equal(snapshot.utm_source, undefined);
  });

  it("omits sensitive UTM values while preserving non-sensitive campaign casing", () => {
    const snapshot = createFirstTouchSnapshot({
      url: "https://glowlytics.ai/?utm_source=ig&utm_campaign=LaunchWave&utm_term=Bearer%20abc123&utm_content=api_key=secret",
      referrer: "",
    });

    assert.equal(snapshot.utm_campaign, "LaunchWave");
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot, "utm_term"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot, "utm_content"), false);
  });

  it("sanitizes referrer and landing path before storage", () => {
    assert.equal(sanitizeReferrerHost("https://ref.example/path?email=a@example.com"), "ref.example");
    assert.equal(sanitizeLandingPath("https://glowlytics.ai/uv-scan?email=a@example.com#x"), "/uv-scan");
  });

  it("sanitizes final posthog-js CaptureResult shape across properties, $set, and $set_once", () => {
    const result = sanitizePostHogCaptureResult(captureResult({
      properties: {
        $current_url: "https://glowlytics.ai/uv-scan?gclid=secret-token&utm_source=ig#frag",
        $referrer: "https://www.google.com/search?q=lead@example.com",
        gclid: "secret-token",
        utm_source: "ig",
        landing_path: "/uv-scan",
        referrer_host: "www.google.com",
      },
      $set: { $current_url: "https://glowlytics.ai/pricing?gbraid=secret#x", name: "Lead Name" },
      $set_once: { $initial_current_url: "https://glowlytics.ai/?wbraid=secret", $initial_gclid: "secret", $gclid: "secret" },
    }));

    assert.ok(result);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("secret-token"), false);
    assert.equal(serialized.includes("lead@example.com"), false);
    assert.equal(serialized.includes("gclid"), false);
    assert.equal(serialized.includes("initial_gclid"), false);
    assert.equal(result.properties?.utm_source, "ig");
    assert.equal(result.properties?.landing_path, "/uv-scan");
    assert.equal(result.properties?.referrer_host, "www.google.com");
    assert.equal(Object.prototype.hasOwnProperty.call(result.properties || {}, "$current_url"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.properties || {}, "$referrer"), false);
  });
});
```

Create `/Users/mustafaboorenie/cornell-hackathon/apps/landing/components/__tests__/PostHogAttribution.config.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { POSTHOG_INIT_OPTIONS } from "../PostHogAttribution";
import type { CaptureResult } from "posthog-js";
const captureResult = (overrides: Partial<CaptureResult>): CaptureResult => ({
  uuid: "00000000-0000-4000-8000-000000000002",
  event: "$pageview",
  properties: {},
  ...overrides,
});


describe("PostHogAttribution init config", () => {
  it("disables SDK campaign persistence and keeps the sanitizer installed", () => {
    assert.equal(POSTHOG_INIT_OPTIONS.save_campaign_params, false);
    assert.equal(POSTHOG_INIT_OPTIONS.mask_personal_data_properties, true);
    assert.equal(typeof POSTHOG_INIT_OPTIONS.before_send, "function");

    const result = POSTHOG_INIT_OPTIONS.before_send(captureResult({
      properties: { $current_url: "https://glowlytics.ai/?gclid=secret&utm_source=ig", gclid: "secret", landing_path: "/" },
      $set_once: { $initial_gclid: "secret", $initial_current_url: "https://glowlytics.ai/?wbraid=secret" },
    }));
    assert.equal(POSTHOG_INIT_OPTIONS.before_send(null), null);

    assert.ok(result);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("secret"), false);
    assert.equal(serialized.includes("gclid"), false);
    assert.equal(result.properties?.landing_path, "/");
    assert.equal(Object.prototype.hasOwnProperty.call(result.properties || {}, "$current_url"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.$set_once || {}, "$initial_current_url"), false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails for the missing module**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/landing && node --import ./scripts/seo-engine/node_modules/tsx/dist/loader.mjs --test ./lib/__tests__/posthogAttribution.test.ts ./components/__tests__/PostHogAttribution.config.test.ts`

Expected: FAIL with import errors for `../posthogAttribution` and/or `../PostHogAttribution`; after the modules exist, these tests also fail until sensitive UTM values are omitted, the `before_send` sanitizer returns a safe final CaptureResult, and `POSTHOG_INIT_OPTIONS` disables SDK campaign persistence with `save_campaign_params=false` and `mask_personal_data_properties=true`.

- [ ] **Step 3: Implement the pure classifier and immutable browser storage helpers**

Create `/Users/mustafaboorenie/cornell-hackathon/apps/landing/lib/posthogAttribution.ts` with these exported signatures and behavior:

```ts
import type { CaptureResult } from "posthog-js";
export type Product = "glowlytics";
export type AcquisitionSource = "instagram" | "tiktok" | "google" | "other_search" | "ai_search" | "direct" | "referral" | "unknown";
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
const SDK_FULL_URL_KEYS = new Set(["$current_url", "$initial_current_url", "current_url", "$referrer", "$initial_referrer", "referrer"]);

function sanitizeContainer(input: CaptureContainer | undefined): CaptureContainer | undefined {
  if (!input) return input;
  const out: CaptureContainer = {};
  for (const [key, value] of Object.entries(input)) {
    if (CLICK_ID_KEY_RE.test(key)) continue;
    if (SDK_FULL_URL_KEYS.has(key)) continue;
    if (typeof value === "string" && SENSITIVE_VALUE_RE.test(value) && key.startsWith("utm_")) continue;
    out[key] = value;
  }
  return out;
}

export function sanitizePostHogCaptureResult(result: CaptureResult | null): CaptureResult | null {
  if (result === null) return null;
  return {
    ...result,
    properties: sanitizeContainer(result.properties as CaptureContainer | undefined),
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
    if (["instagram", "ig", "meta_instagram"].includes(utmSource)) return { acquisition_source: "instagram", acquisition_medium: utmMedium || "organic_social", attribution_quality: "utm" };
    if (["tiktok", "tik_tok"].includes(utmSource)) return { acquisition_source: "tiktok", acquisition_medium: utmMedium || "organic_social", attribution_quality: "utm" };
    if (utmSource.includes("google")) return { acquisition_source: "google", acquisition_medium: utmMedium || "paid_search", attribution_quality: "utm" };
    if (["chatgpt", "openai", "perplexity", "claude", "anthropic", "gemini", "copilot"].some((s) => utmSource.includes(s))) return { acquisition_source: "ai_search", acquisition_medium: "ai_search", attribution_quality: "utm" };
    if (OTHER_SEARCH_UTM_SOURCES.some((s) => utmSource.includes(s))) return { acquisition_source: "other_search", acquisition_medium: utmMedium || "organic_search", attribution_quality: "utm" };
  }

  const mediumCampaign = `${utmMedium || ""} ${utmCampaign || ""}`;
  if (/instagram|\big\b/.test(mediumCampaign)) return { acquisition_source: "instagram", acquisition_medium: utmMedium || "organic_social", attribution_quality: "utm" };
  if (/tiktok|tik_tok/.test(mediumCampaign)) return { acquisition_source: "tiktok", acquisition_medium: utmMedium || "organic_social", attribution_quality: "utm" };
  if (/google/.test(mediumCampaign)) return { acquisition_source: "google", acquisition_medium: utmMedium || "paid_search", attribution_quality: "utm" };
  if (/chatgpt|openai|perplexity|claude|anthropic|gemini|copilot/.test(mediumCampaign)) return { acquisition_source: "ai_search", acquisition_medium: "ai_search", attribution_quality: "utm" };
  if (/bing|duckduckgo|duck_duck_go|ddg|brave|yahoo|ecosia|baidu|yandex/.test(mediumCampaign)) return { acquisition_source: "other_search", acquisition_medium: utmMedium || "organic_search", attribution_quality: "utm" };
  if (utmSource || utmMedium || utmCampaign) return { acquisition_source: "referral", acquisition_medium: utmMedium || "referral", attribution_quality: "utm" };

  if (host) {
    const h = stripWww(host);
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
```

- [ ] **Step 4: Add the client bootstrap component**

Create `/Users/mustafaboorenie/cornell-hackathon/apps/landing/components/PostHogAttribution.tsx`:

```tsx
"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import posthog from "posthog-js";
import { createFirstTouchSnapshot, storeFirstTouchOnce, readStoredFirstTouch, sanitizePostHogCaptureResult } from "@/lib/posthogAttribution";

export const POSTHOG_INIT_OPTIONS = {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
  capture_pageview: false,
  autocapture: true,
  persistence: "localStorage+cookie" as const,
  save_campaign_params: false,
  mask_personal_data_properties: true,
  before_send: sanitizePostHogCaptureResult,
};

let initialized = false;

export function getPostHogDistinctId(): string | null {
  if (!initialized) return null;
  const id = posthog.get_distinct_id();
  return typeof id === "string" && id ? id : null;
}

export function getCurrentFirstTouch() {
  return readStoredFirstTouch();
}

export function captureLandingPageview(pathname: string, search: string, referrer: string) {
  const snapshot = storeFirstTouchOnce(createFirstTouchSnapshot({ url: `${pathname}${search}`, referrer }));
  posthog.register({ product: "glowlytics" });
  posthog.capture("$pageview", snapshot);
  return snapshot;
}

export default function PostHogAttribution() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
    if (!key) return;
    if (!initialized) {
      posthog.init(key, POSTHOG_INIT_OPTIONS);
      initialized = true;
    }
    const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
    captureLandingPageview(pathname, search, document.referrer || "");
  }, [pathname, searchParams]);

  return null;
}
```

- [ ] **Step 5: Mount the bootstrap and add `posthog-js`**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/landing/package.json`:

```json
{
  "dependencies": {
    "posthog-js": "^1.396.5"
  }
}
```

Keep all existing dependencies and scripts. Add a focused landing attribution script for this task:

```json
{
  "scripts": {
    "test:first-touch": "node --import ./scripts/seo-engine/node_modules/tsx/dist/loader.mjs --test ./lib/__tests__/posthogAttribution.test.ts ./components/__tests__/PostHogAttribution.config.test.ts"
  }
}
```

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/landing/app/layout.tsx` so `<PostHogAttribution />` renders inside `<body>` before existing children:

```tsx
import { Suspense } from "react";
import PostHogAttribution from "@/components/PostHogAttribution";

// inside RootLayout body; Suspense prevents Next 16 useSearchParams static-render bailout
<Suspense fallback={null}>
  <PostHogAttribution />
</Suspense>
{children}
```

- [ ] **Step 6: Run focused tests to verify the classifier passes**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/landing && npm install && npm run test:first-touch`

Expected: PASS for `classifyFirstTouch`, observed referrer hosts, Google click-ID boolean capture without click-ID storage, sensitive UTM omission with non-sensitive campaign/term/content casing preserved, path sanitization, referrer-host sanitization, `before_send` final CaptureResult deletion of SDK full URL/referrer fields across `properties`/`$set`/`$set_once` while preserving only canonical `landing_path` and `referrer_host`, `POSTHOG_INIT_OPTIONS.save_campaign_params=false`, `POSTHOG_INIT_OPTIONS.mask_personal_data_properties=true`, and `form_placement` exclusion.

- [ ] **Step 7: Commit**

```bash
cd /Users/mustafaboorenie/cornell-hackathon
git add apps/landing/package.json apps/landing/package-lock.json apps/landing/app/layout.tsx apps/landing/components/PostHogAttribution.tsx apps/landing/components/__tests__/PostHogAttribution.config.test.ts apps/landing/lib/posthogAttribution.ts apps/landing/lib/__tests__/posthogAttribution.test.ts
git commit -m "feat(glowlytics): add landing first-touch posthog capture"
```

---
