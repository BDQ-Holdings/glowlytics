# Glowlytics PostHog Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Glowlytics lane B of the shared PostHog attribution design: forward landing/mobile/server capture plus dry-run-only historical manifests for the rollout lane.

**Architecture:** Landing owns first-touch capture, product registration, `$pageview`, D1 waitlist attribution persistence, and canonical `waitlist_submitted`. Expo owns stable Clerk identity transitions with product-namespaced IDs and never identifies a shared `anonymous` user. Railway owns UV-lead attribution storage, server-confirmed `account_created`, and deterministic dry-run historical manifest/batch generation; live historical ingestion is deferred to the PostHog rollout plan.

**Tech Stack:** Next.js 16, React 19, Cloudflare Pages Functions, Cloudflare D1, `posthog-js`, Expo 54, `posthog-react-native`, Clerk Expo, Node/Express, Railway PostgreSQL, Jest, `node:test`, raw PostHog `/batch/` payload JSON.

## Global Constraints

- This plan is prerequisite lane B for the live PostHog rollout plan; the rollout lane must consume the dry-run artifacts defined here before any historical ingestion.
- Choose and persist exactly one scheduled near-future `GLOWLYTICS_CUTOVER_AT` ISO timestamp before enabling production business-event capture. Deploy all landing, mobile, and Railway forward code/config before that timestamp; at the boundary ownership flips with no redeploy. Use the same value for Cloudflare/D1 source checks, Railway source checks, importer cutoff, summary `source_cutoff_at`, and rollout handoff; do not hard-code a calendar date in production dry-run commands.
- Shared PostHog project is `344248`; do not create a new PostHog project.
- Canonical funnel is `$pageview → waitlist_submitted → account_created`.
- Every business event carries `product="glowlytics"`.
- `form_placement` is a UI-placement field and is never an acquisition channel.
- `acquisition_source` values are `instagram`, `tiktok`, `google`, `other_search`, `ai_search`, `direct`, `referral`, or `unknown`.
- `attribution_model` is always `first_touch`.
- Forward-looking `historical_backfill` is `false`; dry-run historical conversion events set `historical_backfill=true`.
- First-touch attribution is immutable once written to browser storage, D1, or Railway lead storage.
- Store only `referrer_host`; never store a full referrer URL with path or query string.
- Store only `landing_path` without query string or fragment.
- Preserve raw UTM source/medium normalization and non-sensitive campaign/term/content casing, but omit any UTM value matching email, token, credential, or raw click-ID patterns; the explicit no-PII/token rule overrides raw UTM preservation.
- Do not copy unrelated URL parameters into event properties.
- Do not add plaintext email, phone, API keys, access tokens, credentials, raw user messages, or private user records to PostHog event properties or generated batches.
- Canonical stable user IDs are product-namespaced as `glowlytics:user:<clerk-user-id>`.
- Backfill identities are deterministic and opaque: D1 leads use `glowlytics:lead:d1:<id>`, Railway waitlist leads use `glowlytics:lead:railway:<id>`, Railway profiles use `glowlytics:user:<user_id>`, and UV enrichment never creates a cross-source join unless `uv_leads.clerk_user_id` is present.
- Historical Glowlytics dry run reconciles to 4 D1 waitlist leads plus 36 Railway waitlist leads (40 combined waitlist leads), and 142 Railway profiles/accounts.
- Historical Glowlytics lead/profile joins are unavailable; do not infer D1 or Railway waitlist-to-profile attribution from email, timing, source text, or landing-page rows. The verified sources have zero cross-source email overlap.
- Verified `uv_leads=0`; historical Railway profiles omit `waitlist_match` and `waitlist_bypassed`. Do not create a cross-source join or assert a historical match/bypass without an exported UV row.
- The approved historical baseline is 4 pre-cutover D1 waitlist leads plus 36 pre-cutover Railway waitlist leads (40 combined) and 142 pre-cutover Railway profiles/accounts. Every source and combined gate must pass before rollout; never silently omit or backdate records to force the baseline.
- Historical imports must use raw `/batch/` JSON with `historical_migration=true`, original ISO timestamps at least 48 hours before import time, caller-supplied UUIDv5 values, and no `sent_at`.
- Product code in this lane must generate dry-run manifest and batch files only; it must not send live historical events to PostHog.
- This lane does not update live PostHog artifacts; the rollout lane owns extending the existing dashboard `1800446` and cleanly cutting existing insight IDs `9824227`, `9824229`, `9824230`, and `9824234` from the old event name to `waitlist_submitted`.
- Expo and Railway stable account distinct IDs use the exact product-namespaced pattern `glowlytics:user:<id>` where `<id>` is the Clerk user ID. Existing dashboard `1800446` extension is owned by the rollout lane, not this lane.
- No synthetic historical `$pageview` events.

---

## File Structure

- `/Users/mustafaboorenie/cornell-hackathon/apps/landing/package.json` — adds `posthog-js` and test scripts for focused attribution tests.
- `/Users/mustafaboorenie/cornell-hackathon/apps/landing/app/layout.tsx` — mounts the client PostHog bootstrap once for all landing routes.
- `/Users/mustafaboorenie/cornell-hackathon/apps/landing/components/PostHogAttribution.tsx` — initializes `posthog-js`, registers `product`, captures `$pageview`, and installs the pure `before_send` sanitizer.
- `/Users/mustafaboorenie/cornell-hackathon/apps/landing/lib/posthogAttribution.ts` — pure first-touch classifier/snapshot helpers plus `before_send` CaptureResult sanitizer used by client components and tests.
- `/Users/mustafaboorenie/cornell-hackathon/apps/landing/lib/__tests__/posthogAttribution.test.ts` — `node:test` coverage for channel precedence, immutable first touch, sanitized UTM retention/omission, SDK CaptureResult sanitization, path/referrer sanitization, and PII omission.
- `/Users/mustafaboorenie/cornell-hackathon/apps/landing/components/WaitlistForm.tsx` — sends first-touch fields, opaque PostHog ID, and form placement to D1, then captures `waitlist_submitted` after server confirmation.
- `/Users/mustafaboorenie/cornell-hackathon/apps/landing/functions/api/_schema_003_posthog_attribution.sql` — D1 migration for canonical attribution fields and opaque PostHog ID.
- `/Users/mustafaboorenie/cornell-hackathon/apps/landing/functions/api/waitlist.ts` — validates and stores canonical attribution fields without overwriting an existing lead snapshot.
- `/Users/mustafaboorenie/cornell-hackathon/apps/landing/functions/api/__tests__/waitlist-attribution.test.ts` — Cloudflare handler unit tests for insertion, duplicate immutability, PII omission, and canonical fields.
- `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/services/analytics.ts` — canonical Glowlytics ID helper, product-enriched capture wrapper, and safe identify/reset behavior.
- `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/app/_layout.tsx` — fixes Clerk identity transitions: no shared `anonymous`, identify on every Clerk user transition.
- `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/services/__tests__/analytics.test.ts` — Jest coverage for canonical IDs, product registration, and no shared anonymous identify.
- `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/config/env.ts` and `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/config/__tests__/env.test.ts` — add configurable PostHog host while preserving existing API URL guards.
- `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/db-init.js` — Railway migration for UV attribution fields plus the durable `reconciliation_pending → pending_delivery → delivered` account-delivery state machine and pre-cutover historical ownership marker.
- `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/queries/uv.js` — stores immutable UV first-touch fields, returns them during customer promotion, and recovers a verified lead already linked before a process crash.
- `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/posthog.js` — server-side PostHog capture helper for forward `account_created` only, consuming the exact frozen PII-free property object on every retry.
- `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/app.js` — reserves account delivery only after conclusive matched/unmatched reconciliation, leaves unavailable lookups unresolved, retries independently of clients, and preserves verified matches when Loops fails.
- `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/server.js` and `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/server-startup.test.js` — fail closed on schema/cutover configuration before listening, then run a non-overlapping bounded retry worker.
- `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/uv-db.test.js` and `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/uv-endpoints.test.js` — extend existing UV tests for attribution storage, strict reconciliation, frozen delivery, crash recovery, and terminal delivery.
- `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/scripts/posthog-backfill-glowlytics.js` — deterministic dry-run importer CLI; writes manifest/batch/summary/rejects and has no send mode.
- `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/posthog-backfill-glowlytics.test.js` — Jest coverage for 4 D1 + 36 Railway waitlist + 142 profile counts, UUIDv5 stability, 48-hour deferral, no `sent_at`, no PII, and no live import path.
- `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/fixtures/posthog-backfill-glowlytics/` — small JSON fixtures for D1 waitlist rows, Railway waitlist rows, Railway profile rows, and UV enrichment rows.
- Final dry-run artifacts live under a unique non-overwriting directory derived from the runtime `GLOWLYTICS_CUTOVER_AT` as `lane-b-YYYYMMDDTHHMMSSZ-final/`; the reviewed final run is `lane-b-20260719123000Z-final`.

---

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

### Task 2: D1 Waitlist Attribution and Canonical `waitlist_submitted`

**Files:**
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/landing/package.json`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/landing/components/WaitlistForm.tsx`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/landing/functions/api/waitlist.ts`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/landing/functions/api/_schema_003_posthog_attribution.sql`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/landing/functions/api/__tests__/waitlist-attribution.test.ts`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/landing/components/__tests__/WaitlistForm.attribution.test.ts`

**Interfaces:**
- Consumes: `getCurrentFirstTouch()` and `getPostHogDistinctId()` from `/components/PostHogAttribution.tsx`.
- Produces:
  - D1 columns: `posthog_distinct_id`, `acquisition_source`, `acquisition_medium`, `attribution_model`, `attribution_quality`, `historical_backfill`, `form_placement`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `google_click_id_present`, `referrer_host`, `landing_path`.
  - API payload type: `WaitlistAttributionPayload` with the same field names and no email in PostHog properties.
  - API response shape: `{ ok: true; created: true; created_at: string; tracking_enabled: boolean }` for a newly inserted unique lead and `{ ok: true; created: false }` for duplicate-email success. `created_at` is the server timestamp stored in D1; `tracking_enabled` is true only when `created_at >= env.GLOWLYTICS_CUTOVER_AT`.
  - Canonical event: `waitlist_submitted` captured only when `/api/waitlist` returns `ok: true`, `created: true`, and `tracking_enabled: true`. `$pageview` capture may start before the cutoff; business conversion capture waits for the server boundary.
  - `form_placement` is normalized to the shared contract `"hero" | "footer" | "modal" | "pricing" | "mobile_onboarding" | "unknown"`; `final-cta` and `blog-newsletter` map to `footer`, `uv-scan-web` maps to `unknown`, and no arbitrary `source` string may become a placement.

- [ ] **Step 1: Write failing handler tests for created responses, field validation, and duplicate immutability**

Create `/Users/mustafaboorenie/cornell-hackathon/apps/landing/functions/api/__tests__/waitlist-attribution.test.ts`:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../waitlist";

type Prepared = { bind: (...values: unknown[]) => { first?: () => Promise<unknown>; run?: () => Promise<unknown> } };

function envWithDb(existing: unknown = null) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string): Prepared {
      return {
        bind(...values: unknown[]) {
          calls.push({ sql, values });
          return {
            first: async () => existing,
            run: async () => ({ success: true }),
          };
        },
      };
    },
  };
  return { env: { WAITLIST_DB: db, GLOWLYTICS_CUTOVER_AT: "2026-07-20T12:00:00.000Z" } as never, calls };
}

const post = (body: unknown) =>
  new Request("https://glowlytics.ai/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("waitlist attribution storage", () => {
  it("inserts canonical sanitized attribution fields and returns created=true for a new lead", async () => {
    const { env, calls } = envWithDb(null);
    const res = await onRequestPost({ request: post({
      email: "Lead@Example.com",
      form_placement: "not-approved-placement",
      posthog_distinct_id: "0190-browser-id",
      acquisition_source: "google",
      acquisition_medium: "paid_search",
      attribution_model: "first_touch",
      attribution_quality: "utm",
      historical_backfill: false,
      utm_source: "google",
      utm_campaign: "LaunchWave",
      utm_content: "lead@example.com",
      google_click_id_present: true,
      landing_path: "/uv-scan?email=lead@example.com#frag",
      referrer_host: "https://www.google.com/search?q=lead@example.com",
    }), env } as never);

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.created, true);
    assert.equal(body.tracking_enabled, true);
    assert.match(body.created_at, /^\d{4}-\d{2}-\d{2}T/);
    const insert = calls.find((c) => c.sql.includes("INSERT INTO waitlist"));
    assert.ok(insert);
    assert.ok(insert!.sql.includes("posthog_distinct_id"));
    assert.ok(insert!.sql.includes("acquisition_source"));
    assert.ok(insert!.sql.includes("form_placement"));
    assert.ok(insert!.sql.includes("google_click_id_present"));
    assert.equal(insert!.values.includes("lead@example.com"), true);
    assert.equal(insert!.values.includes("Lead@Example.com"), false);
    assert.equal(insert!.values.includes("unknown"), true);
    assert.equal(insert!.values.includes("google"), true);
    assert.equal(insert!.values.includes(1), true);
    assert.equal(insert!.values.includes("/uv-scan"), true);
    assert.equal(insert!.values.includes("/uv-scan?email=lead@example.com#frag"), false);
    assert.equal(insert!.values.includes("www.google.com"), true);
    assert.equal(insert!.values.includes("LaunchWave"), true);
    assert.equal(insert!.values.filter((v) => v === "lead@example.com").length, 1);
    assert.equal(insert!.values.some((v) => typeof v === "string" && v.includes("lead@example.com") && v !== "lead@example.com"), false);
  });

  it("does not overwrite an existing waitlist row attribution snapshot and returns created=false", async () => {
    const { env, calls } = envWithDb({ id: 1 });
    const res = await onRequestPost({ request: post({
      email: "lead@example.com",
      form_placement: "footer",
      acquisition_source: "instagram",
      acquisition_medium: "paid_social",
      attribution_model: "first_touch",
      attribution_quality: "utm",
      historical_backfill: false,
    }), env } as never);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, created: false });
    assert.equal(calls.some((c) => c.sql.includes("INSERT INTO waitlist")), false);
  });

  it("marks a new lead as not tracking-enabled before the scheduled cutover", async () => {
    const { env } = envWithDb(null);
    env.GLOWLYTICS_CUTOVER_AT = "2999-01-01T00:00:00.000Z";
    const res = await onRequestPost({ request: post({ email: "precutover@example.com" }), env } as never);

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.created, true);
    assert.equal(body.tracking_enabled, false);
  });

  it("fails before insert when GLOWLYTICS_CUTOVER_AT is missing or invalid", async () => {
    const { env, calls } = envWithDb(null);
    delete (env as { GLOWLYTICS_CUTOVER_AT?: string }).GLOWLYTICS_CUTOVER_AT;

    const res = await onRequestPost({ request: post({ email: "nogate@example.com" }), env } as never);

    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "cutover_not_configured" });
    assert.equal(calls.some((c) => c.sql.includes("INSERT INTO waitlist")), false);
  });
});
```

Create `/Users/mustafaboorenie/cornell-hackathon/apps/landing/components/__tests__/WaitlistForm.attribution.test.ts` with pure branch tests that do not need a DOM:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldCaptureWaitlistSubmitted, normalizeFormPlacement } from "../WaitlistForm";

describe("WaitlistForm attribution helpers", () => {
  it("captures waitlist_submitted only for a newly inserted lead at or after server cutoff", () => {
    assert.equal(shouldCaptureWaitlistSubmitted({ ok: true, created: true, tracking_enabled: true }), true);
    assert.equal(shouldCaptureWaitlistSubmitted({ ok: true, created: true, tracking_enabled: false }), false);
    assert.equal(shouldCaptureWaitlistSubmitted({ ok: true, created: false }), false);
    assert.equal(shouldCaptureWaitlistSubmitted({ ok: false }), false);
  });

  it("maps known UI placements and rejects arbitrary source strings", () => {
    assert.equal(normalizeFormPlacement("hero"), "hero");
    assert.equal(normalizeFormPlacement("final-cta"), "footer");
    assert.equal(normalizeFormPlacement("blog-newsletter"), "footer");
    assert.equal(normalizeFormPlacement("uv-scan-web"), "unknown");
    assert.equal(normalizeFormPlacement("source=google"), "unknown");
  });
});
```

- [ ] **Step 2: Run the handler/form tests to verify the schema/API and capture branch are missing**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/landing && node --import ./scripts/seo-engine/node_modules/tsx/dist/loader.mjs --test ./functions/api/__tests__/waitlist-attribution.test.ts ./components/__tests__/WaitlistForm.attribution.test.ts`

Expected: FAIL because `/api/waitlist` does not accept/store canonical sanitized attribution fields, does not omit sensitive UTM values, does not return `created`, and `WaitlistForm` does not expose the created-only capture branch helpers yet.

- [ ] **Step 3: Add the D1 migration**

Create `/Users/mustafaboorenie/cornell-hackathon/apps/landing/functions/api/_schema_003_posthog_attribution.sql`:

```sql
-- Migration 003: shared PostHog attribution contract for Glowlytics waitlist.
-- Apply remote:
--   wrangler d1 execute glowlytics-waitlist --remote --file=functions/api/_schema_003_posthog_attribution.sql
-- Apply local:
--   wrangler d1 execute glowlytics-waitlist --local --file=functions/api/_schema_003_posthog_attribution.sql

ALTER TABLE waitlist ADD COLUMN posthog_distinct_id TEXT;
ALTER TABLE waitlist ADD COLUMN acquisition_source TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE waitlist ADD COLUMN acquisition_medium TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE waitlist ADD COLUMN attribution_model TEXT NOT NULL DEFAULT 'first_touch';
ALTER TABLE waitlist ADD COLUMN attribution_quality TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE waitlist ADD COLUMN historical_backfill INTEGER NOT NULL DEFAULT 0;
ALTER TABLE waitlist ADD COLUMN form_placement TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE waitlist ADD COLUMN utm_source TEXT;
ALTER TABLE waitlist ADD COLUMN utm_medium TEXT;
ALTER TABLE waitlist ADD COLUMN utm_campaign TEXT;
ALTER TABLE waitlist ADD COLUMN utm_term TEXT;
ALTER TABLE waitlist ADD COLUMN utm_content TEXT;
ALTER TABLE waitlist ADD COLUMN google_click_id_present INTEGER NOT NULL DEFAULT 0;
ALTER TABLE waitlist ADD COLUMN referrer_host TEXT;
ALTER TABLE waitlist ADD COLUMN landing_path TEXT;

CREATE INDEX IF NOT EXISTS idx_waitlist_posthog_distinct_id ON waitlist(posthog_distinct_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_acquisition_source ON waitlist(acquisition_source);
CREATE INDEX IF NOT EXISTS idx_waitlist_form_placement ON waitlist(form_placement);
```

- [ ] **Step 4: Add the blocking remote D1 migration verification gate**

Before any Cloudflare preview or production landing deployment that contains the new handler/form code, run an idempotent remote D1 preflight. Use an OMP Eval JavaScript cell for the schema check; do not use inline `node -e`, output redirection, or blind migration reapply.

```js
const cwd = "/Users/mustafaboorenie/cornell-hackathon/apps/landing";
const required = ["posthog_distinct_id","acquisition_source","acquisition_medium","attribution_model","attribution_quality","historical_backfill","form_placement","utm_source","utm_medium","utm_campaign","utm_term","utm_content","google_click_id_present","referrer_host","landing_path"];
const raw = await Bun.$`npx wrangler d1 execute glowlytics-waitlist --remote --command "PRAGMA table_info(waitlist);" --json`.cwd(cwd).text();
const parsed = JSON.parse(raw);
const rows = parsed[0]?.results || parsed.result?.[0]?.results || [];
const cols = new Set(rows.map((r) => r.name));
const present = required.filter((c) => cols.has(c));
if (present.length === required.length) {
  console.log("remote D1 attribution columns already verified; skip migration");
} else if (present.length > 0) {
  throw new Error(`partial remote D1 attribution schema; stop deploy and inspect missing columns: ${required.filter((c) => !cols.has(c)).join(",")}`);
} else {
  await Bun.$`npx wrangler d1 execute glowlytics-waitlist --remote --file=functions/api/_schema_003_posthog_attribution.sql`.cwd(cwd);
  const verifyRaw = await Bun.$`npx wrangler d1 execute glowlytics-waitlist --remote --command "PRAGMA table_info(waitlist);" --json`.cwd(cwd).text();
  const verifyRows = JSON.parse(verifyRaw)[0]?.results || JSON.parse(verifyRaw).result?.[0]?.results || [];
  const verifyCols = new Set(verifyRows.map((r) => r.name));
  for (const c of required) if (!verifyCols.has(c)) throw new Error(`missing remote D1 column ${c}`);
  console.log("remote D1 attribution columns verified after migration");
}
```

Expected: PASS with either `remote D1 attribution columns already verified; skip migration` or `remote D1 attribution columns verified after migration`. If any attribution column exists but the full set is incomplete, the eval cell throws and deployment stops; do not deploy preview or production landing code until this gate passes.

- [ ] **Step 5: Update the Cloudflare handler with a canonical payload parser**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/landing/functions/api/waitlist.ts` by adding these types/helpers near the top:

Also extend the handler `Env` interface with `GLOWLYTICS_CUTOVER_AT?: string` so the response can gate forward business capture from the server timestamp.

```ts
type AcquisitionSource = "instagram" | "tiktok" | "google" | "other_search" | "ai_search" | "direct" | "referral" | "unknown";
type AttributionQuality = "utm" | "referrer" | "unknown" | "backfilled";
type FormPlacement = "hero" | "footer" | "modal" | "pricing" | "mobile_onboarding" | "unknown";
const ACQUISITION_SOURCES = new Set<AcquisitionSource>(["instagram", "tiktok", "google", "other_search", "ai_search", "direct", "referral", "unknown"]);
const ATTRIBUTION_QUALITIES = new Set<AttributionQuality>(["utm", "referrer", "unknown", "backfilled"]);
const FORM_PLACEMENT_ALIASES = new Map<string, FormPlacement>([["hero", "hero"], ["footer", "footer"], ["final-cta", "footer"], ["blog-newsletter", "footer"], ["modal", "modal"], ["pricing", "pricing"], ["mobile_onboarding", "mobile_onboarding"], ["uv-scan-web", "unknown"], ["unknown", "unknown"]]);
const MAX_ATTR = 256;

function field(input: unknown, max = MAX_ATTR): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

const SENSITIVE_VALUE_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|((api[_-]?key|api|secret|password|credential|bearer|access|refresh|id)?[_-]?token=?)|\b(api[_-]?key|secret|password|credential|bearer)\b|((gclid|gbraid|wbraid)=?)/i;
function marketingField(input: unknown, max = MAX_ATTR): string | null {
  const value = field(input, max);
  return value && !SENSITIVE_VALUE_RE.test(value) ? value : null;
}

export function normalizeFormPlacement(input: unknown): FormPlacement {
  const value = field(input, 64);
  return (value && FORM_PLACEMENT_ALIASES.get(value)) || "unknown";
}

function hostnameOnly(input: unknown): string | null {
  const raw = field(input, 1024);
  if (!raw) return null;
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase().slice(0, MAX_ATTR) || null;
  } catch {
    return /^[a-z0-9.-]+$/i.test(raw) && !raw.includes("@") ? raw.toLowerCase().slice(0, MAX_ATTR) : null;
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
    posthog_distinct_id: field(payload.posthog_distinct_id, 128),
    acquisition_source: acquisitionSource && ACQUISITION_SOURCES.has(acquisitionSource) ? acquisitionSource : "unknown",
    acquisition_medium: field(payload.acquisition_medium, 64) || "unknown",
    attribution_model: "first_touch" as const,
    attribution_quality: attributionQuality && ATTRIBUTION_QUALITIES.has(attributionQuality) ? attributionQuality : "unknown",
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
```

Keep the existing duplicate-email read before insert. Return `{ ok: true, created: false }` from that path and do not mutate the original attribution snapshot.

For the legacy `attribution_referrer` column, write only the sanitized canonical hostname (`attribution.referrer_host`) or `null`; never write the legacy full URL/referrer string.

Replace the insert with a field-complete insert and return `{ ok: true, created: true }` after it succeeds:

```ts
const cutoverMs = Date.parse(env.GLOWLYTICS_CUTOVER_AT || "");
if (!Number.isFinite(cutoverMs)) {
  return json(500, { error: "cutover_not_configured" });
}
const attribution = parseAttribution(payload as Record<string, unknown>);
const createdAt = new Date().toISOString();

await env.WAITLIST_DB.prepare(
  `INSERT INTO waitlist
     (email, source, attribution_slug, attribution_referrer, posthog_distinct_id,
      acquisition_source, acquisition_medium, attribution_model, attribution_quality,
      historical_backfill, form_placement, utm_source, utm_medium, utm_campaign,
      utm_term, utm_content, google_click_id_present, referrer_host, landing_path, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
)
  .bind(
    email,
    source,
    attributionSlug,
    attribution.referrer_host,
    attribution.posthog_distinct_id,
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

const trackingEnabled = Date.parse(createdAt) >= cutoverMs;
return json(200, { ok: true, created: true, created_at: createdAt, tracking_enabled: trackingEnabled });
```

- [ ] **Step 6: Update the form to submit attribution and capture `waitlist_submitted` only for newly inserted leads**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/landing/components/WaitlistForm.tsx`:

```tsx
import posthog from "posthog-js";
import { getCurrentFirstTouch, getPostHogDistinctId } from "./PostHogAttribution";

type FormPlacement = "hero" | "footer" | "modal" | "pricing" | "mobile_onboarding" | "unknown";
const FORM_PLACEMENT_ALIASES = new Map<string, FormPlacement>([["hero", "hero"], ["footer", "footer"], ["final-cta", "footer"], ["blog-newsletter", "footer"], ["modal", "modal"], ["pricing", "pricing"], ["mobile_onboarding", "mobile_onboarding"], ["uv-scan-web", "unknown"], ["unknown", "unknown"]]);

export function normalizeFormPlacement(value: unknown): FormPlacement {
  return typeof value === "string" ? FORM_PLACEMENT_ALIASES.get(value) || "unknown" : "unknown";
}

export function shouldCaptureWaitlistSubmitted(body: unknown): boolean {
  return Boolean(body && typeof body === "object" && (body as { ok?: unknown; created?: unknown; tracking_enabled?: unknown }).ok === true && (body as { created?: unknown }).created === true && (body as { tracking_enabled?: unknown }).tracking_enabled === true);
}

function buildWaitlistAttribution(formPlacement: string) {
  const firstTouch = getCurrentFirstTouch();
  return {
    ...(firstTouch || {
      product: "glowlytics",
      acquisition_source: "unknown",
      acquisition_medium: "unknown",
      attribution_model: "first_touch",
      attribution_quality: "unknown",
      historical_backfill: false,
      google_click_id_present: false,
    }),
    form_placement: normalizeFormPlacement(formPlacement),
    posthog_distinct_id: getPostHogDistinctId(),
  };
}
```

Inside `submit`, build attribution before `fetch`, send it to D1, parse the response body, then capture the event only if the server confirms this request created the unique waitlist row:

```tsx
const attribution = buildWaitlistAttribution(source);
const res = await fetch("/api/waitlist", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: trimmed,
    source,
    ...readAttribution(),
    ...attribution,
  }),
});
const body = await res.json().catch(() => null);

// after the existing ok check succeeds
if (shouldCaptureWaitlistSubmitted(body)) {
  posthog.capture("waitlist_submitted", {
    product: "glowlytics",
    acquisition_source: attribution.acquisition_source,
    acquisition_medium: attribution.acquisition_medium,
    attribution_model: "first_touch",
    attribution_quality: attribution.attribution_quality,
    historical_backfill: false,
    form_placement: attribution.form_placement,
    utm_source: attribution.utm_source ?? null,
    utm_medium: attribution.utm_medium ?? null,
    utm_campaign: attribution.utm_campaign ?? null,
    utm_term: attribution.utm_term ?? null,
    utm_content: attribution.utm_content ?? null,
    google_click_id_present: attribution.google_click_id_present ?? false,
    referrer_host: attribution.referrer_host ?? null,
    landing_path: attribution.landing_path ?? null,
  });
}
```

Do not include `email` in the `posthog.capture` properties. Do not treat duplicate-email `{ ok: true, created: false }` responses or pre-cutover `{ ok: true, created: true, tracking_enabled: false }` responses as canonical `waitlist_submitted` events; those are respectively idempotent API successes and historical-backfill-owned conversions, not forward business events.

- [ ] **Step 7: Update the landing attribution test script**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/landing/package.json` so the full landing attribution script runs all focused attribution files:

```json
{
  "scripts": {
    "test:attribution": "node --import ./scripts/seo-engine/node_modules/tsx/dist/loader.mjs --test ./lib/__tests__/posthogAttribution.test.ts ./functions/api/__tests__/waitlist-attribution.test.ts ./components/__tests__/WaitlistForm.attribution.test.ts"
  }
}
```

- [ ] **Step 8: Run focused landing tests**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/landing && npm run test:attribution`

Expected: PASS for first-touch classifier, waitlist handler attribution validation, created/duplicate API response semantics, and created-only `waitlist_submitted` capture branching.

- [ ] **Step 9: Commit**

```bash
cd /Users/mustafaboorenie/cornell-hackathon
git add apps/landing/package.json apps/landing/components/WaitlistForm.tsx apps/landing/components/__tests__/WaitlistForm.attribution.test.ts apps/landing/functions/api/waitlist.ts apps/landing/functions/api/_schema_003_posthog_attribution.sql apps/landing/functions/api/__tests__/waitlist-attribution.test.ts
git commit -m "feat(glowlytics): capture canonical waitlist attribution"
```

---

### Task 3: Expo Clerk Identity Transition Fix

**Files:**
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/services/analytics.ts`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/app/_layout.tsx`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/config/env.ts`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/services/__tests__/analytics.test.ts`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/config/__tests__/env.test.ts`

**Interfaces:**
- Produces:
  - `canonicalGlowlyticsUserId(userId: string): string`
  - `identifyGlowlyticsUser(userId: string): boolean` always identifies the namespaced Clerk ID with exactly `{ product: "glowlytics" }` once the SDK is ready, returns whether an identify actually happened, and accepts no arbitrary traits.
  - `trackEvent(event: string, properties?: Record<string, string | number | boolean | null>): void` always adds `product="glowlytics"` unless the caller already supplied it.
- Consumes: Clerk `userId` from `useAuth()`.

- [ ] **Step 1: Extend failing analytics tests for canonical IDs and no shared anonymous identify**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/services/__tests__/analytics.test.ts`:

```ts
const MockPostHog = jest.requireMock('posthog-react-native') as jest.Mock;
const instance = () => MockPostHog.mock.results.at(-1)?.value;

describe('Glowlytics canonical PostHog identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = 'phc_test';
    jest.resetModules();
  });

  it('namespaces Clerk IDs for the shared project', () => {
    const { canonicalGlowlyticsUserId } = require('../analytics');
    expect(canonicalGlowlyticsUserId('user_2xABC')).toBe('glowlytics:user:user_2xABC');
  });

  it('identifyGlowlyticsUser identifies the namespaced ID and never identifies literal anonymous', async () => {
    const { initAnalytics, identifyGlowlyticsUser, identifyUser } = require('../analytics');
    await initAnalytics();
    identifyGlowlyticsUser('user_2xABC');
    identifyUser('anonymous');

    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_2xABC', { product: 'glowlytics' });
    expect(instance().identify).not.toHaveBeenCalledWith('anonymous', expect.anything());
  });

  it('does not accept or emit email/name-like identify traits from stale callers', async () => {
    const { initAnalytics, identifyGlowlyticsUser, identifyUser } = require('../analytics');
    await initAnalytics();
    (identifyGlowlyticsUser as unknown as (id: string, traits: unknown) => void)('user_2xABC', { email: 'lead@example.com', name: 'Lead Name' });
    (identifyUser as unknown as (id: string, traits: unknown) => void)('user_2xDEF', { phone: '+15555550100' });
    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_2xABC', { product: 'glowlytics' });
    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_2xDEF', { product: 'glowlytics' });
    expect(JSON.stringify(instance().identify.mock.calls)).not.toMatch(/lead@example\.com|Lead Name|\+15555550100/);
  });

  it('signed-in startup identifies after analytics readiness, not before', async () => {
    const { initAnalytics, identifyGlowlyticsUser } = require('../analytics');
    expect(identifyGlowlyticsUser('user_startup')).toBe(false);
    await expect(initAnalytics()).resolves.toBe(true);
    expect(identifyGlowlyticsUser('user_startup')).toBe(true);
    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_startup', { product: 'glowlytics' });
  });

  it('trackEvent adds product=glowlytics', async () => {
    const { initAnalytics, trackEvent } = require('../analytics');
    await initAnalytics();
    trackEvent('scan_started', { subscription_tier: 'free' });
    expect(instance().capture).toHaveBeenCalledWith('scan_started', {
      product: 'glowlytics',
      subscription_tier: 'free',
    });
  });
});
```

- [ ] **Step 2: Run the analytics tests to verify failure**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics && npm test -- src/services/__tests__/analytics.test.ts --runInBand`

Expected: FAIL because `canonicalGlowlyticsUserId` and `identifyGlowlyticsUser` do not exist, existing identity helpers allow arbitrary traits, and `trackEvent` does not add `product`.

- [ ] **Step 3: Implement canonical ID helpers and product enrichment**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/services/analytics.ts`:

```ts
import PostHog from 'posthog-react-native';
import { env } from '../config/env';

let posthog: PostHog | null = null;
let initPromise: Promise<boolean> | null = null;

export function canonicalGlowlyticsUserId(userId: string): string {
  return `glowlytics:user:${userId}`;
}

export async function initAnalytics(): Promise<boolean> {
  if (posthog) return true;
  if (!env.POSTHOG_API_KEY) return false;
  initPromise ||= Promise.resolve().then(() => {
    posthog = new PostHog(env.POSTHOG_API_KEY, {
      host: env.POSTHOG_HOST,
      enableSessionReplay: false,
    });
    return true;
  });
  return initPromise;
}

export function identifyGlowlyticsUser(userId: string): boolean {
  if (!posthog) return false;
  posthog.identify(canonicalGlowlyticsUserId(userId), { product: 'glowlytics' });
  return true;
}

export function identifyUser(userId: string): void {
  if (userId === 'anonymous') return;
  identifyGlowlyticsUser(userId);
}

export function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!posthog) return;
  posthog.capture(event, { product: 'glowlytics', ...(properties || {}) });
}

export function trackScreen(
  name: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!posthog) return;
  posthog.screen(name, { product: 'glowlytics', ...(properties || {}) });
}

export function resetAnalytics(): void {
  if (!posthog) return;
  posthog.reset();
}
```

- [ ] **Step 4: Add configurable PostHog host**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/config/env.ts`:

```ts
interface EnvConfig {
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_INSTANCE_HOST: string;
  CLERK_KEY_ENV: 'live' | 'test' | 'unknown';
  API_BASE_URL: string;
  REVENUECAT_API_KEY: string;
  POSTHOG_API_KEY: string;
  POSTHOG_HOST: string;
  ENABLE_APPLE_OAUTH: boolean;
  ENABLE_GOOGLE_OAUTH: boolean;
  SENTRY_DSN: string;
}

// inside exported env
POSTHOG_API_KEY: process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '',
POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
```

Extend `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/src/config/__tests__/env.test.ts` with:

```ts
it('defaults PostHog host to the US ingestion host', () => {
  withDev(true, () => {
    const env = loadEnv('http://localhost:3001');
    expect(env.env.POSTHOG_HOST).toBe('https://us.i.posthog.com');
  });
});
```

- [ ] **Step 5: Fix `_layout.tsx` so identity updates on Clerk transitions and no shared anonymous is identified**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/app/_layout.tsx` import:

```ts
import { initAnalytics, identifyGlowlyticsUser, trackEvent, resetAnalytics } from '../src/services/analytics';
```

Replace the one-shot `identifyAnalyticsUser(userId || 'anonymous')` inside deferred initialization with no identify call:

```ts
await initAnalytics();
trackEvent('app_init_complete', {
  has_revenuecat_key: !!env.REVENUECAT_API_KEY,
  has_posthog_key: !!env.POSTHOG_API_KEY,
  has_api_url: !!env.API_BASE_URL,
});
```

Add a separate effect below the deferred init effect:

```ts
const lastAnalyticsUserId = useRef<string | null>(null);

useEffect(() => {
  if (!clerkLoaded) return;
  let cancelled = false;
  if (userId && lastAnalyticsUserId.current !== userId) {
    void initAnalytics().then((ready) => {
      if (cancelled || !ready) return;
      if (identifyGlowlyticsUser(userId)) {
        lastAnalyticsUserId.current = userId;
      }
    });
    return () => {
      cancelled = true;
    };
  }
  if (!userId && lastAnalyticsUserId.current) {
    resetAnalytics();
    lastAnalyticsUserId.current = null;
  }
}, [clerkLoaded, userId]);
```

- [ ] **Step 6: Run focused Expo tests**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics && npm test -- src/services/__tests__/analytics.test.ts src/config/__tests__/env.test.ts --runInBand`

Expected: PASS. Confirm captured events include `product="glowlytics"`, signed-in startup waits for analytics readiness before setting the last identified user ref, and no assertion permits `identify('anonymous')`.

- [ ] **Step 7: Commit**

```bash
cd /Users/mustafaboorenie/cornell-hackathon
 git add apps/glowlytics/src/services/analytics.ts apps/glowlytics/app/_layout.tsx apps/glowlytics/src/config/env.ts apps/glowlytics/src/services/__tests__/analytics.test.ts apps/glowlytics/src/config/__tests__/env.test.ts
 git commit -m "fix(glowlytics): use stable product-namespaced posthog identity"
```

---

### Task 4: Railway UV Attribution Storage and Server-Confirmed `account_created`

**Files:**
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/package.json`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/db-init.js`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/queries/uv.js`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/posthog.js`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/app.js`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/server.js`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/uv-db.test.js`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/uv-endpoints.test.js`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/server-startup.test.js`

**Interfaces:**
- Consumes: verified Clerk `req.auth.userId`, verified Clerk primary email lookup, and explicit UV reconciliation result `matched`/`unmatched`/`unavailable` from `uvQueries.markCustomer` plus its surrounding Clerk/database lookup.
- Produces:
  - `canonicalGlowlyticsUserId(userId: string): string`
  - `accountCreatedUuid(userId: string): string`
  - `captureAccountCreated({ userId, uuid, timestamp, properties }: { userId: string; uuid: string; timestamp: string; properties: Record<string, unknown> }): Promise<void>`
  - `uvQueries.upsertLead(pool, lead)` accepts immutable attribution fields.
  - `uvQueries.findCustomerLead(pool, userId)` returns a lead already linked to that same Clerk user so a crash between `markCustomer` and delivery reservation cannot erase matched evidence.
  - `account_created` event properties include `product`, canonical attribution fields, `historical_backfill=false`, `waitlist_match`, and `waitlist_bypassed`.
  - Delivery state stored on each `user_profiles` row: `posthog_account_created_status` is one of `reconciliation_pending`, `pending_delivery`, `delivered`, or `historical_backfill_owned`; stable UUID/timestamp/properties/match fields are nullable until reconciliation is conclusive. A newly inserted post-cutover profile is durably `reconciliation_pending` even when Clerk or UV lookup is unavailable. Conclusive resolution atomically freezes the stable tuple and advances to `pending_delivery`; failed PostHog transport retries that frozen tuple.
  - Forward ownership starts at the scheduled boundary: `account_created` is emitted only when `user_profiles.created_at >= process.env.GLOWLYTICS_CUTOVER_AT`; older profiles are migrated to `historical_backfill_owned`. `waitlist_bypassed=true` is valid only after successful reconciliation returned `unmatched`, never after missing Clerk configuration, a transient lookup failure, or a Loops marketing failure. A bounded startup/interval worker retries both unresolved reconciliation and frozen delivery without relying on the client to repeat account creation.

- [ ] **Step 1: Add failing UV storage and delivery-metadata tests**

Extend `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/uv-db.test.js`:

```js
test('migrationV7 adds immutable PostHog attribution columns and retry-safe account delivery metadata', () => {
  const m = dbInit.migrationV7;
  expect(m).toContain('ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS posthog_distinct_id TEXT');
  expect(m).toContain('ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS acquisition_source TEXT');
  expect(m).toContain('ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS attribution_model TEXT');
  expect(m).toContain('ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS google_click_id_present BOOLEAN DEFAULT FALSE');
  expect(m).toContain('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_uuid UUID');
  expect(m).toContain('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_timestamp TIMESTAMPTZ');
  expect(m).toContain('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_sent_at TIMESTAMPTZ');
  expect(m).toContain("ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_status TEXT NOT NULL DEFAULT 'reconciliation_pending'");
  expect(m).toContain('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_properties JSONB');
  expect(m).toContain('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_waitlist_match BOOLEAN');
  expect(m).not.toContain('UPDATE user_profiles');
  expect(m).toContain('CREATE INDEX IF NOT EXISTS idx_user_profiles_posthog_account_created_pending');
  expect(typeof dbInit.markPreCutoverProfilesHistorical).toBe('function');
});

test('pre-cutover ownership marking is rerunnable and never consumes a forward reconciliation row', async () => {
  const pool = statefulProfilePool([
    { user_id: 'old', created_at: '2026-07-19T00:00:00Z', posthog_account_created_status: 'reconciliation_pending' },
    { user_id: 'forward', created_at: '2026-07-21T00:00:00Z', posthog_account_created_status: 'reconciliation_pending' },
  ]);
  await dbInit.markPreCutoverProfilesHistorical(pool, '2026-07-20T00:00:00Z');
  await dbInit.markPreCutoverProfilesHistorical(pool, '2026-07-20T00:00:00Z');
  expect(profileState(pool, 'old').posthog_account_created_status).toBe('historical_backfill_owned');
  expect(profileState(pool, 'forward').posthog_account_created_status).toBe('reconciliation_pending');
});

test('upsertLead stores first-touch fields on insert and does not overwrite them on duplicate email', async () => {
  const lead = {
    id: 'lead_1',
    email: 'a@b.com',
    report_token: 'tok_xyz',
    scan_id: 'scan_abc',
    source: 'uv-scan-web',
    posthog_distinct_id: 'browser-1',
    acquisition_source: 'google',
    acquisition_medium: 'paid_search',
    attribution_model: 'first_touch',
    attribution_quality: 'utm',
    utm_source: 'google',
    google_click_id_present: true,
    landing_path: '/uv-scan',
    referrer_host: 'www.google.com',
  };
  const pool = fakePool([{ id: 'lead_1' }]);

  await upsertLead(pool, lead);

  const sql = pool.query.mock.calls[0][0];
  expect(sql).toContain('posthog_distinct_id');
  expect(sql).not.toMatch(/SET[\s\S]*acquisition_source\s*=/);
  expect(pool.query.mock.calls[0][1]).toEqual(expect.arrayContaining(['browser-1', 'google', 'paid_search', 'first_touch', 'utm', true, '/uv-scan']));
});
```

- [ ] **Step 2: Add failing account-created endpoint tests for retry-safe delivery**

Extend `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/uv-endpoints.test.js`:

```js
jest.mock('../posthog', () => ({
  captureAccountCreated: jest.fn().mockResolvedValue(undefined),
  canonicalGlowlyticsUserId: (id) => `glowlytics:user:${id}`,
  accountCreatedUuid: (id) => `11111111-1111-5111-8111-${id.padStart(12, '0').slice(0, 12)}`,
}));
const posthog = require('../posthog');

test('POST /api/users emits server-confirmed account_created with stable UUID/timestamp and sanitized UV attribution', async () => {
  uvQueries.markCustomer.mockResolvedValue({
    email: 'lead@example.com',
    status: 'customer',
    acquisition_source: 'google',
    acquisition_medium: 'paid_search',
    attribution_model: 'first_touch',
    attribution_quality: 'utm',
    google_click_id_present: true,
    landing_path: '/uv-scan',
    referrer_host: 'www.google.com',
    utm_content: 'api_key=secret',
    utm_term: 'Bearer abc123',
  });

  const res = await request(app).post('/api/users').send(validBody);

  expect(res.status).toBe(201);
  expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'dev-user',
    uuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
    timestamp: expect.any(String),
    properties: expect.objectContaining({
      distinct_id: 'glowlytics:user:dev-user',
      acquisition_source: 'google',
      landing_path: '/uv-scan',
      waitlist_match: true,
      waitlist_bypassed: false,
    }),
  }));
  expect(JSON.stringify(posthog.captureAccountCreated.mock.calls[0][0])).not.toMatch(/lead@example\.com|api_key|Bearer|secret/);
  expect(pool.query.mock.calls.some(([sql]) => /posthog_account_created_sent_at\s*=\s*NOW\(\)/.test(sql))).toBe(true);
});

test('POST /api/users retries account_created with the same UUID/timestamp/properties after a failed capture', async () => {
  posthog.captureAccountCreated.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined);
  uvQueries.markCustomer
    .mockResolvedValueOnce({ acquisition_source: 'google', acquisition_medium: 'paid_search', attribution_model: 'first_touch', attribution_quality: 'utm', landing_path: '/uv-scan' })
    .mockResolvedValueOnce(null);

  const first = await request(app).post('/api/users').send(validBody);
  const second = await request(app).post('/api/users').send(validBody);

  expect(first.status).toBe(201);
  expect(second.status).toBe(409);
  expect(posthog.captureAccountCreated).toHaveBeenCalledTimes(2);
  expect(posthog.captureAccountCreated.mock.calls[1][0].uuid).toBe(posthog.captureAccountCreated.mock.calls[0][0].uuid);
  expect(posthog.captureAccountCreated.mock.calls[1][0].timestamp).toBe(posthog.captureAccountCreated.mock.calls[0][0].timestamp);
  expect(posthog.captureAccountCreated.mock.calls[1][0].properties).toEqual(posthog.captureAccountCreated.mock.calls[0][0].properties);
  const failedCallIndex = pool.query.mock.calls.findIndex(([sql]) => /posthog_account_created_sent_at\s*=\s*NOW\(\)/.test(sql));
  expect(failedCallIndex).toBeGreaterThan(posthog.captureAccountCreated.mock.invocationCallOrder[0]);
});

test('unavailable reconciliation stays durable and the bounded worker later resolves it without inventing bypass evidence', async () => {
  uvQueries.markCustomer
    .mockRejectedValueOnce(new Error('temporary Railway lookup failure'))
    .mockResolvedValueOnce(null);

  const first = await request(app).post('/api/users').send(validBody);
  expect(first.status).toBe(201);
  expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
  expect(profileState('dev-user')).toEqual(expect.objectContaining({
    posthog_account_created_status: 'reconciliation_pending',
    posthog_account_created_uuid: null,
    posthog_account_created_waitlist_match: null,
  }));

  await app._retryPendingAccountCreatedDeliveries({ limit: 1 });

  expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'dev-user',
    timestamp: profileCreatedAt.toISOString(),
    properties: expect.objectContaining({ waitlist_match: false, waitlist_bypassed: true }),
  }));
  expect(profileState('dev-user').posthog_account_created_status).toBe('delivered');
});

test('missing Clerk configuration remains reconciliation_pending for a later worker pass', async () => {
  delete process.env.CLERK_SECRET_KEY;
  const res = await request(app).post('/api/users').send(validBody);
  expect(res.status).toBe(201);
  expect(uvQueries.markCustomer).not.toHaveBeenCalled();
  expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
  expect(profileState('dev-user').posthog_account_created_status).toBe('reconciliation_pending');
});

test('Loops failure cannot turn a verified lead match into a bypass', async () => {
  uvQueries.markCustomer.mockResolvedValue({ acquisition_source: 'google', attribution_model: 'first_touch' });
  loops.sendEvent.mockRejectedValueOnce(new Error('Loops unavailable'));

  const res = await request(app).post('/api/users').send(validBody);

  expect(res.status).toBe(201);
  expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({ properties: expect.objectContaining({ waitlist_match: true, waitlist_bypassed: false }) }));
  expect(profileState('dev-user')).toEqual(expect.objectContaining({
    posthog_account_created_status: 'delivered',
    posthog_account_created_waitlist_match: true,
  }));
});

test('worker recovers a lead already linked before a crash without relabeling it unmatched', async () => {
  uvQueries.markCustomer.mockResolvedValue(null);
  uvQueries.findCustomerLead.mockResolvedValue({ clerk_user_id: 'dev-user', acquisition_source: 'google' });
  seedProfiles([{ user_id: 'dev-user', posthog_account_created_status: 'reconciliation_pending' }]);

  await app._retryPendingAccountCreatedDeliveries({ limit: 1 });

  expect(loops.sendEvent).not.toHaveBeenCalled();
  expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({ properties: expect.objectContaining({ waitlist_match: true, waitlist_bypassed: false }) }));
});

test('retry worker is bounded and skips historical/delivered rows', async () => {
  seedProfiles([
    { user_id: 'pending-1', posthog_account_created_status: 'reconciliation_pending' },
    { user_id: 'pending-2', posthog_account_created_status: 'reconciliation_pending' },
    { user_id: 'old', posthog_account_created_status: 'historical_backfill_owned' },
    { user_id: 'done', posthog_account_created_status: 'delivered' },
  ]);

  await app._retryPendingAccountCreatedDeliveries({ limit: 1 });

  expect(uvQueries.markCustomer).toHaveBeenCalledTimes(1);
  expect(posthog.captureAccountCreated).toHaveBeenCalledTimes(1);
  expect(profileState('pending-2').posthog_account_created_status).toBe('reconciliation_pending');
});

test('profiles created before GLOWLYTICS_CUTOVER_AT do not emit forward account_created', async () => {
  process.env.GLOWLYTICS_CUTOVER_AT = '2999-01-01T00:00:00.000Z';
  pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

  const res = await request(app).post('/api/users').send(validBody);

  expect(res.status).toBe(201);
  expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
});

test('POST /api/users fails before profile insert when GLOWLYTICS_CUTOVER_AT is missing or invalid', async () => {
  delete process.env.GLOWLYTICS_CUTOVER_AT;

  const res = await request(app).post('/api/users').send(validBody);

  expect(res.status).toBe(500);
  expect(res.body).toEqual({ error: 'cutover_not_configured' });
  expect(pool.query.mock.calls.some(([sql]) => /INSERT INTO user_profiles/.test(sql))).toBe(false);
  expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
});
```

Create `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/server-startup.test.js` with mocked `pg.Pool`, `db-init`, `app`, and `signal-models` dependencies and Jest fake timers so the scheduled retry interval cannot leak across tests. Export `startServer` from `server.js` and guard its production invocation with `require.main === module`, then prove behavior rather than source text:

```js
test('schema failure prevents the listener from accepting traffic', async () => {
  initSchema.mockRejectedValueOnce(new Error('migration failed'));
  await expect(startServer()).rejects.toThrow('migration failed');
  expect(app.listen).not.toHaveBeenCalled();
});

test('missing cutover configuration prevents the listener from accepting traffic', async () => {
  initSchema.mockResolvedValueOnce(undefined);
  delete process.env.GLOWLYTICS_CUTOVER_AT;

  await expect(startServer()).rejects.toThrow('GLOWLYTICS_CUTOVER_AT missing or invalid');

  expect(app.listen).not.toHaveBeenCalled();
});

test('successful startup initializes schema before listen and starts bounded account retry', async () => {
  process.env.GLOWLYTICS_CUTOVER_AT = '2026-07-22T12:00:00.000Z';
  initSchema.mockResolvedValueOnce(undefined);
  app.listen.mockReturnValue({ close: jest.fn() });
  app._retryPendingAccountCreatedDeliveries.mockResolvedValueOnce(undefined);

  await startServer();

  expect(initSchema.mock.invocationCallOrder[0]).toBeLessThan(app.listen.mock.invocationCallOrder[0]);
  expect(app._retryPendingAccountCreatedDeliveries).toHaveBeenCalledWith({ limit: 100 });
});
```

- [ ] **Step 3: Run backend tests to verify failure**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/server-startup.test.js --runInBand`

Expected: FAIL because `migrationV7`, UV attribution columns, retry-safe delivery metadata, scheduled-cutover account gating, and stable PostHog account delivery helpers do not exist.

- [ ] **Step 4: Add Railway migration V7**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/db-init.js`:

```js
const migrationV7 = `
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS posthog_distinct_id TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS acquisition_source TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS acquisition_medium TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS attribution_model TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS attribution_quality TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS utm_term TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS google_click_id_present BOOLEAN DEFAULT FALSE;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS referrer_host TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS landing_path TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS form_placement TEXT;

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_uuid UUID;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_timestamp TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_sent_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_status TEXT NOT NULL DEFAULT 'reconciliation_pending';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_properties JSONB;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_waitlist_match BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_uv_leads_posthog_distinct_id ON uv_leads(posthog_distinct_id);
CREATE INDEX IF NOT EXISTS idx_uv_leads_acquisition_source ON uv_leads(acquisition_source);
CREATE INDEX IF NOT EXISTS idx_user_profiles_posthog_account_created_pending
  ON user_profiles(posthog_account_created_status, created_at)
  WHERE posthog_account_created_status IN ('reconciliation_pending', 'pending_delivery');
`;
```
`migrationV7` is rerun by `initSchema`, so it must contain DDL/indexes only. Never put an unbounded `UPDATE user_profiles` in that string: a later restart would misclassify unresolved forward rows as historical.

Add a separately parameterized, idempotent ownership gate and keep both it and V7 fatal:

```js
async function markPreCutoverProfilesHistorical(externalPool, cutoverAt) {
  const cutoverMs = Date.parse(cutoverAt || '');
  if (!Number.isFinite(cutoverMs)) throw new Error('GLOWLYTICS_CUTOVER_AT missing or invalid');
  await externalPool.query(
    `UPDATE user_profiles
        SET posthog_account_created_sent_at = COALESCE(posthog_account_created_sent_at, NOW()),
            posthog_account_created_status = 'historical_backfill_owned'
      WHERE created_at < $1::timestamptz
        AND posthog_account_created_status = 'reconciliation_pending'
        AND posthog_account_created_uuid IS NULL`,
    [new Date(cutoverMs).toISOString()]
  );
}
```

Add `verifyPostHogAttributionSchema(pool)` in `db-init.js`. It must query `information_schema.columns` for every V7 column above plus existing `user_profiles.created_at` and `uv_leads.created_at`, throw on any missing column, and make deployment/cutover fail fast; do not log-and-continue or treat this verification as a warning. In `initSchema`, run these in order before the server accepts requests:

```js
await externalPool.query(migrationV7);
await verifyPostHogAttributionSchema(externalPool);
await markPreCutoverProfilesHistorical(externalPool, process.env.GLOWLYTICS_CUTOVER_AT);
```

Every profile with `created_at < GLOWLYTICS_CUTOVER_AT` is therefore historical-owned on every restart; every unresolved row at or after the boundary remains `reconciliation_pending`. Export the gate:

```js
module.exports = { schema, migrationV5, migrationV6, migrationV7, initSchema, markPreCutoverProfilesHistorical };
```

- [ ] **Step 5: Extend UV query storage without overwriting first-touch**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/queries/uv.js`:

```js
async function upsertLead(pool, {
  id, email, report_token, scan_id, source,
  posthog_distinct_id, acquisition_source, acquisition_medium, attribution_model,
  attribution_quality, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
  google_click_id_present, referrer_host, landing_path, form_placement,
}) {
  const { rows } = await pool.query(
    `INSERT INTO uv_leads
       (id, email, report_token, scan_id, source, posthog_distinct_id,
        acquisition_source, acquisition_medium, attribution_model, attribution_quality,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        google_click_id_present, referrer_host, landing_path, form_placement)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     ON CONFLICT (email) DO UPDATE SET
       source = COALESCE(EXCLUDED.source, uv_leads.source)
     RETURNING *`,
    [id, email, report_token, scan_id, source, posthog_distinct_id || null,
     acquisition_source || null, acquisition_medium || null, attribution_model || null, attribution_quality || null,
     utm_source || null, utm_medium || null, utm_campaign || null, utm_term || null, utm_content || null,
     Boolean(google_click_id_present), referrer_host || null, landing_path || null, form_placement || null]
  );
  return rows[0];
}

async function findCustomerLead(pool, userId) {
  const { rows } = await pool.query(
    `SELECT *
       FROM uv_leads
      WHERE clerk_user_id = $1
      ORDER BY created_at, id
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

```
Add `findCustomerLead` to the existing `module.exports` object at the bottom of `queries/uv.js`; do not replace that object or drop its current exports.

- [ ] **Step 6: Add the backend PostHog forward-capture helper**

Create `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/posthog.js`:

```js
const crypto = require('crypto');

const UUID_NAMESPACE = '8f3138f3-b4e5-5af1-bd6f-25fb94a89a9f';

function deterministicUuidV5(name, namespace = UUID_NAMESPACE) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = crypto.createHash('sha1').update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalGlowlyticsUserId(userId) {
  return `glowlytics:user:${userId}`;
}

function accountCreatedUuid(userId) {
  return deterministicUuidV5(`glowlytics|forward|account_created|${userId}`);
}

const ACQUISITION_SOURCES = new Set(['instagram', 'tiktok', 'google', 'other_search', 'ai_search', 'direct', 'referral', 'unknown']);
const ATTRIBUTION_QUALITIES = new Set(['utm', 'referrer', 'unknown', 'backfilled']);
const SENSITIVE_VALUE_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|((api[_-]?key|api|secret|password|credential|bearer|access|refresh|id)?[_-]?token=?)|\b(api[_-]?key|secret|password|credential|bearer)\b|((gclid|gbraid|wbraid)=?)/i;
const marketing = (value, max = 256) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed && !SENSITIVE_VALUE_RE.test(trimmed) ? trimmed : null;
};
const enumOr = (set, value, fallback) => (typeof value === 'string' && set.has(value) ? value : fallback);
function normalizeHost(value) {
  const raw = marketing(value, 512);
  if (!raw) return null;
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase().slice(0, 256);
  } catch {
    return null;
  }
}
function normalizePath(value) {
  const raw = marketing(value, 512);
  if (!raw) return null;
  try {
    const parsed = raw.startsWith('/') ? new URL(`https://glowlytics.invalid${raw}`) : new URL(raw);
    return parsed.pathname.slice(0, 256);
  } catch {
    return raw.startsWith('/') ? raw.split(/[?#]/, 1)[0].slice(0, 256) : null;
  }
}

function accountAttributionProperties(attribution, waitlistMatch) {
  return {
    product: 'glowlytics',
    acquisition_source: enumOr(ACQUISITION_SOURCES, attribution?.acquisition_source, 'unknown'),
    acquisition_medium: marketing(attribution?.acquisition_medium, 64) || 'unknown',
    attribution_model: 'first_touch',
    attribution_quality: enumOr(ATTRIBUTION_QUALITIES, attribution?.attribution_quality, 'unknown'),
    historical_backfill: false,
    utm_source: marketing(attribution?.utm_source, 128)?.toLowerCase() || null,
    utm_medium: marketing(attribution?.utm_medium, 128)?.toLowerCase() || null,
    utm_campaign: marketing(attribution?.utm_campaign, 256),
    utm_term: marketing(attribution?.utm_term, 256),
    utm_content: marketing(attribution?.utm_content, 256),
    google_click_id_present: Boolean(attribution?.google_click_id_present),
    referrer_host: normalizeHost(attribution?.referrer_host),
    landing_path: normalizePath(attribution?.landing_path),
    form_placement: attribution?.form_placement || null,
    waitlist_match: Boolean(waitlistMatch),
    waitlist_bypassed: !waitlistMatch,
  };
}

async function captureAccountCreated({ userId, uuid, timestamp, properties }) {
  if (!properties || properties.distinct_id !== canonicalGlowlyticsUserId(userId)) {
    throw new Error('account_created properties must contain the canonical distinct_id');
  }
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) throw new Error('POSTHOG_API_KEY missing; account_created remains pending');
  const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
  const body = {
    api_key: apiKey,
    batch: [{
      uuid,
      event: 'account_created',
      timestamp,
      properties,
    }],
  };
  const res = await fetch(`${host.replace(/\/$/, '')}/batch/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`PostHog batch capture failed: ${res.status}`);
  return { ok: true };
}

module.exports = { deterministicUuidV5, canonicalGlowlyticsUserId, accountCreatedUuid, accountAttributionProperties, captureAccountCreated };
```

This helper emits only forward server-confirmed `account_created`; the dry-run historical importer in Task 5 remains separate and sendless. It does not add `sent_at`, and retries reuse the exact same `uuid`, `event`, `timestamp`, and `distinct_id`.

- [ ] **Step 7: Wire UV lead payloads and retry-safe account capture into `app.js`**

In `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/app.js`, import:

```js
const posthog = require('./posthog');
```

Extend `/api/uv/lead` request parsing:

```js
const {
  email: rawEmail, scan_id, source, claim_token,
  posthog_distinct_id, acquisition_source, acquisition_medium, attribution_model,
  attribution_quality, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
  google_click_id_present, referrer_host, landing_path, form_placement,
} = req.body || {};
```

Validate the UV attribution payload before storage and before later PostHog reuse. Do not persist full referrer URLs, landing paths with query strings, arbitrary placement/source values, or sensitive UTM values:

```js
const FORM_PLACEMENT_ALIASES = new Map([['hero', 'hero'], ['footer', 'footer'], ['final-cta', 'footer'], ['blog-newsletter', 'footer'], ['modal', 'modal'], ['pricing', 'pricing'], ['mobile_onboarding', 'mobile_onboarding'], ['uv-scan-web', 'unknown'], ['unknown', 'unknown']]);
const ACQUISITION_SOURCES = new Set(['instagram', 'tiktok', 'google', 'other_search', 'ai_search', 'direct', 'referral', 'unknown']);
const ATTRIBUTION_QUALITIES = new Set(['utm', 'referrer', 'unknown', 'backfilled']);
const SENSITIVE_VALUE_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|((api[_-]?key|api|secret|password|credential|bearer|access|refresh|id)?[_-]?token=?)|\b(api[_-]?key|secret|password|credential|bearer)\b|((gclid|gbraid|wbraid)=?)/i;

function marketingField(value, max = 256) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed && !SENSITIVE_VALUE_RE.test(trimmed) ? trimmed : null;
}

function normalizeFormPlacement(value) {
  return typeof value === 'string' ? FORM_PLACEMENT_ALIASES.get(value) || 'unknown' : 'unknown';
}

function normalizeHost(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.includes('://') ? value : `https://${value}`);
    return parsed.hostname.toLowerCase().slice(0, 256) || null;
  } catch {
    return /^[a-z0-9.-]+$/i.test(value) && !value.includes('@') ? value.toLowerCase().slice(0, 256) : null;
  }
}

function normalizePath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = value.startsWith('/') ? new URL(value, 'https://glowlytics.ai') : new URL(value);
    return (parsed.pathname || '/').slice(0, 256);
  } catch {
    const path = value.split(/[?#]/, 1)[0];
    return path.startsWith('/') ? path.slice(0, 256) : null;
  }
}
```

Pass only normalized fields into `upsertLead`:

```js
const safeAcquisitionSource = ACQUISITION_SOURCES.has(acquisition_source) ? acquisition_source : 'unknown';
const safeAttributionQuality = ATTRIBUTION_QUALITIES.has(attribution_quality) ? attribution_quality : 'unknown';
const lead = await uvQueries.upsertLead(pool, {
  id: uuidv4(),
  email,
  report_token: uuidv4().replace(/-/g, ''),
  scan_id,
  source: source || 'uv-scan-web',
  posthog_distinct_id,
  acquisition_source: safeAcquisitionSource,
  acquisition_medium: marketingField(acquisition_medium, 64) || 'unknown',
  attribution_model: 'first_touch',
  attribution_quality: safeAttributionQuality,
  utm_source: marketingField(utm_source, 128)?.toLowerCase() || null,
  utm_medium: marketingField(utm_medium, 128)?.toLowerCase() || null,
  utm_campaign: marketingField(utm_campaign, 256),
  utm_term: marketingField(utm_term, 256),
  utm_content: marketingField(utm_content, 256),
  google_click_id_present: google_click_id_present === true,
  referrer_host: normalizeHost(referrer_host),
  landing_path: normalizePath(landing_path),
  form_placement: normalizeFormPlacement(form_placement),
});
```

Change `convertUvLeadToCustomer` to return an explicit reconciliation result. `matched` and `unmatched` are conclusive; `unavailable` means no delivery metadata may be reserved yet:

```js
async function convertUvLeadToCustomer(userId) {
  try {
    if (!process.env.CLERK_SECRET_KEY) {
      return { status: 'unavailable' };
    }
    const clerkApiBase = process.env.CLERK_API_BASE || 'https://api.clerk.com';
    const clerkRes = await fetch(`${clerkApiBase}/v1/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!clerkRes.ok) return { status: 'unavailable' };
    const data = await clerkRes.json();
    const rawEmail =
      data.email_addresses?.find((entry) => entry.id === data.primary_email_address_id)?.email_address ||
      data.email_addresses?.[0]?.email_address ||
      null;
    if (!rawEmail) return { status: 'unavailable' };
    const email = rawEmail.toLowerCase().trim();
    const transitionedLead = await uvQueries.markCustomer(pool, { email, clerk_user_id: userId });
    const row = transitionedLead || await uvQueries.findCustomerLead(pool, userId);
    if (row) {
      if (transitionedLead) {
        try {
          await loops.sendEvent(email, 'became_customer', {
            contactProperties: { clerkUserId: userId },
          });
        } catch (loopsErr) {
          log.warn('[uv] became_customer marketing event failed:', loopsErr?.message || loopsErr);
        }
      }
      return { status: 'matched', lead: row };
    }
    return { status: 'unmatched' };
  } catch (err) {
    log.warn('[uv] lead->customer conversion failed:', err?.message || err);
    return { status: 'unavailable' };
  }
}
```

Add retry-safe delivery helpers inside `app.js`. A new profile's migration default is already durable `reconciliation_pending`. Reconciliation never writes match/bypass evidence until it is conclusive. Reservation atomically freezes the original `created_at` timestamp, sanitized properties, match result, and deterministic UUID, then advances to `pending_delivery`. Transport retries load the frozen row; they never reclassify it.

```js
const RETRYABLE_ACCOUNT_STATUSES = ['reconciliation_pending', 'pending_delivery'];

async function loadAccountCreatedDelivery(userId) {
  const { rows } = await pool.query(
    `SELECT user_id, created_at,
            posthog_account_created_status AS status,
            posthog_account_created_uuid AS uuid,
            posthog_account_created_timestamp AS timestamp,
            posthog_account_created_properties AS properties,
            posthog_account_created_waitlist_match AS waitlist_match
       FROM user_profiles
      WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function markRuntimePreCutoverProfileHistorical(userId, cutoverAt) {
  await pool.query(
    `UPDATE user_profiles
        SET posthog_account_created_sent_at = COALESCE(posthog_account_created_sent_at, NOW()),
            posthog_account_created_status = 'historical_backfill_owned'
      WHERE user_id = $1
        AND created_at < $2::timestamptz
        AND posthog_account_created_status = 'reconciliation_pending'
        AND posthog_account_created_uuid IS NULL`,
    [userId, cutoverAt]
  );
}

async function reserveAccountCreatedDelivery(userId, attribution, matchStatus) {
  if (!['matched', 'unmatched'].includes(matchStatus)) {
    throw new Error('account_created delivery requires conclusive waitlist reconciliation');
  }
  const waitlistMatch = matchStatus === 'matched';
  const uuid = posthog.accountCreatedUuid(userId);
  const cutoverAt = process.env.GLOWLYTICS_CUTOVER_AT;
  if (!cutoverAt) throw new Error('GLOWLYTICS_CUTOVER_AT missing');
  const properties = {
    distinct_id: posthog.canonicalGlowlyticsUserId(userId),
    ...posthog.accountAttributionProperties(attribution, waitlistMatch),
  };
  const { rows } = await pool.query(
    `UPDATE user_profiles
        SET posthog_account_created_uuid = COALESCE(posthog_account_created_uuid, $2::uuid),
            posthog_account_created_timestamp = COALESCE(posthog_account_created_timestamp, created_at),
            posthog_account_created_properties = COALESCE(posthog_account_created_properties, $4::jsonb),
            posthog_account_created_waitlist_match = COALESCE(posthog_account_created_waitlist_match, $5::boolean),
            posthog_account_created_status = 'pending_delivery'
      WHERE user_id = $1
        AND created_at >= $3::timestamptz
        AND posthog_account_created_status IN ('reconciliation_pending', 'pending_delivery')
      RETURNING posthog_account_created_uuid AS uuid,
                posthog_account_created_timestamp AS timestamp,
                posthog_account_created_properties AS properties,
                posthog_account_created_waitlist_match AS waitlist_match,
                posthog_account_created_status AS status`,
    [userId, uuid, cutoverAt, JSON.stringify(properties), waitlistMatch]
  );
  return rows[0] || null;
}

async function markAccountCreatedSent(userId, uuid) {
  await pool.query(
    `UPDATE user_profiles
        SET posthog_account_created_sent_at = NOW(),
            posthog_account_created_status = 'delivered'
      WHERE user_id = $1
        AND posthog_account_created_uuid = $2::uuid
        AND posthog_account_created_status = 'pending_delivery'`,
    [userId, uuid]
  );
}

async function sendReservedAccountCreated(userId, delivery) {
  const timestamp = new Date(delivery.timestamp).toISOString();
  await posthog.captureAccountCreated({
    userId,
    uuid: delivery.uuid,
    timestamp,
    properties: delivery.properties,
  });
  await markAccountCreatedSent(userId, delivery.uuid);
}

async function reconcileAndDeliverAccountCreated(userId) {
  const current = await loadAccountCreatedDelivery(userId);
  if (!current || !RETRYABLE_ACCOUNT_STATUSES.includes(current.status)) return;
  const cutoverMs = Date.parse(process.env.GLOWLYTICS_CUTOVER_AT || '');
  if (!Number.isFinite(cutoverMs)) throw new Error('GLOWLYTICS_CUTOVER_AT missing or invalid');
  if (new Date(current.created_at).getTime() < cutoverMs) {
    await markRuntimePreCutoverProfileHistorical(userId, new Date(cutoverMs).toISOString());
    return;
  }
  if (current.status === 'pending_delivery') {
    await sendReservedAccountCreated(userId, current);
    return;
  }
  const reconciliation = await convertUvLeadToCustomer(userId);
  if (reconciliation.status === 'unavailable') return;
  const delivery = await reserveAccountCreatedDelivery(
    userId,
    reconciliation.status === 'matched' ? reconciliation.lead : undefined,
    reconciliation.status
  );
  if (delivery) await sendReservedAccountCreated(userId, delivery);
}

async function retryPendingAccountCreatedDeliveries({ limit = 100 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('invalid retry limit');
  const { rows } = await pool.query(
    `SELECT user_id
       FROM user_profiles
      WHERE posthog_account_created_status IN ('reconciliation_pending', 'pending_delivery')
      ORDER BY created_at, user_id
      LIMIT $1`,
    [limit]
  );
  for (const { user_id: userId } of rows) {
    try {
      await reconcileAndDeliverAccountCreated(userId);
    } catch (err) {
      log.warn('[posthog] pending account_created retry failed:', err?.message || err);
    }
  }
}

app._retryPendingAccountCreatedDeliveries = retryPendingAccountCreatedDeliveries;
```

Before `INSERT INTO user_profiles`, fail closed if the cutover config is missing or invalid so the row is not inserted into an unowned historical/forward gap:

```js
const cutoverMs = Date.parse(process.env.GLOWLYTICS_CUTOVER_AT || '');
if (!Number.isFinite(cutoverMs)) {
  return res.status(500).json({ error: 'cutover_not_configured' });
}
```

After `INSERT INTO user_profiles` succeeds, attempt immediate reconciliation. Returning `201` is safe even when this attempt is unavailable because the inserted row is already durable `reconciliation_pending` and the server worker owns retry:

```js
await reconcileAndDeliverAccountCreated(userId)
  .catch((err) => log.warn('[posthog] account_created attempt failed:', err?.message || err));
res.status(201).json(result.rows[0]);
```

In the duplicate `23505` branch, invoke the same state-machine entry point for a fast retry. This is an optimization, not the only retry path:

```js
const duplicateUserId = (req.auth && req.auth.userId) || null;
if (duplicateUserId) {
  await reconcileAndDeliverAccountCreated(duplicateUserId)
    .catch((err) => log.warn('[posthog] duplicate account_created retry failed:', err?.message || err));
}
return res.status(409).json({ error: 'User profile already exists' });
```

Modify `server.js` so migrations and `verifyPostHogAttributionSchema` finish and `GLOWLYTICS_CUTOVER_AT` is validated before `app.listen`; V7 or cutover failure must reject startup rather than use the existing log-and-continue path. After the listener is ready, trigger one bounded retry pass and schedule later passes without overlapping. The initial retry is asynchronous and may not block readiness on up to 100 Clerk lookups:

```js
async function initDB() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const migrationPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: poolSsl() });
  attachPoolErrorHandler(migrationPool, 'server-init');
  try {
    await initSchema(migrationPool);
  } finally {
    await migrationPool.end();
  }
}

async function startServer() {
  await initDB();
  const cutoverMs = Date.parse(process.env.GLOWLYTICS_CUTOVER_AT || '');
  if (!Number.isFinite(cutoverMs)) throw new Error('GLOWLYTICS_CUTOVER_AT missing or invalid');
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Glowlytics API running on port ${PORT}`);
  });
  let retryRunning = false;
  const runAccountRetry = async () => {
    if (retryRunning) return;
    retryRunning = true;
    try {
      await app._retryPendingAccountCreatedDeliveries({ limit: 100 });
    } finally {
      retryRunning = false;
    }
  };
  runAccountRetry().catch((err) => console.error('[posthog] initial retry worker failed:', err?.message || err));
  const retryTimer = setInterval(
    () => runAccountRetry().catch((err) => console.error('[posthog] retry worker failed:', err?.message || err)),
    60_000
  );
  retryTimer.unref();
  signalModels.initModels().catch((err) => console.error('[models] init failed:', err?.message || err));
  return server;
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[server] fatal startup failure:', err?.message || err);
    process.exitCode = 1;
  });
}
module.exports = { startServer };
```

- [ ] **Step 8: Run focused backend tests**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/server-startup.test.js --runInBand`

Expected: PASS. Confirm the tests prove UV attribution fields are stored immutably, old profiles are `historical_backfill_owned` and never emitted forward, profiles with `created_at < GLOWLYTICS_CUTOVER_AT` stay historical-owned, unavailable Clerk/UV reconciliation is durably `reconciliation_pending`, the bounded worker retries without client repetition, Loops failure cannot change a verified match, conclusive resolution freezes `pending_delivery`, failed PostHog transport retries the same `uuid`/`event`/original `timestamp`/`distinct_id`/properties tuple, `delivered` is terminal, `waitlist_match=true` appears only for a verified UV lead, and `waitlist_bypassed=true` appears only after conclusive `unmatched`.

- [ ] **Step 9: Commit**

```bash
cd /Users/mustafaboorenie/cornell-hackathon
git add apps/glowlytics/backend/package.json apps/glowlytics/backend/package-lock.json apps/glowlytics/backend/db-init.js apps/glowlytics/backend/queries/uv.js apps/glowlytics/backend/posthog.js apps/glowlytics/backend/app.js apps/glowlytics/backend/server.js apps/glowlytics/backend/__tests__/uv-db.test.js apps/glowlytics/backend/__tests__/uv-endpoints.test.js apps/glowlytics/backend/__tests__/server-startup.test.js
git commit -m "feat(glowlytics): emit server confirmed account creation"
```

---

### Task 5: Dry-Run-Only Historical Importer Manifest and Batch Generation

**Files:**
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/scripts/posthog-backfill-glowlytics.js`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/posthog-backfill-glowlytics.test.js`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/fixtures/posthog-backfill-glowlytics/d1-waitlist.json`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/fixtures/posthog-backfill-glowlytics/railway-waitlist.json`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/fixtures/posthog-backfill-glowlytics/railway-user-profiles.json`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/fixtures/posthog-backfill-glowlytics/railway-uv-leads.json`

**Interfaces:**
- CLI setup: choose one scheduled future boundary, export it as `GLOWLYTICS_CUTOVER_AT` before deploying gated forward code, and reuse that exact value when running `node scripts/posthog-backfill-glowlytics.js --dry-run --d1-waitlist-json data/posthog-backfill/glowlytics/source-d1-waitlist.json --railway-waitlist-json data/posthog-backfill/glowlytics/source-railway-waitlist.json --railway-profiles-json data/posthog-backfill/glowlytics/source-railway-user-profiles.json --railway-uv-leads-json data/posthog-backfill/glowlytics/source-railway-uv-leads.json --artifact-root data/posthog-backfill/glowlytics --cutover-source "glowlytics-forward-enable:$GLOWLYTICS_CUTOVER_AT"`.
- The final artifact run ID is derived from the runtime `GLOWLYTICS_CUTOVER_AT` as `lane-b-YYYYMMDDTHHMMSSZ-final`; do not hard-code the reviewed example or pass a hand-written slug in production.
- Final artifact directory: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/data/posthog-backfill/glowlytics/lane-b-YYYYMMDDTHHMMSSZ-final/` (the CLI refuses to overwrite it).
- Handoff variable names: `artifactRoot="data/posthog-backfill/glowlytics"` and `artifactRunId=summary.artifact_run_id`; every verification snippet and rollout handoff must derive paths from these values instead of using mutable top-level files.
- Manifest path: `.../${artifactRunId}/manifest.jsonl`
- Batch path: `.../${artifactRunId}/batch.json`
- Summary path: `.../${artifactRunId}/summary.json`
- Rejects path: `.../${artifactRunId}/rejects.jsonl`
- Manifest row schema version: `glowlytics-posthog-backfill-v1`.
- Manifest row fields: `schema_version`, `source`, `source_table`, `source_pk`, `event`, `product`, `distinct_id`, `timestamp`, `uuid`, `properties`, `eligible`, `defer_reason`, `cutover_at`, `cutover_source`.
- Sources: `glowlytics_d1_waitlist`, `glowlytics_railway_waitlist`, `glowlytics_railway_user_profiles`, and enrichment-only `glowlytics_railway_uv_leads`.
- Batch shape: `{ "api_key": "dry-run", "historical_migration": true, "batch": [{ "uuid": "uuid-v5", "event": "waitlist_submitted|account_created", "timestamp": "ISO-8601", "properties": { "distinct_id": "opaque-product-namespaced-id", "product": "glowlytics", "historical_backfill": true } }] }` with no `sent_at` key. The product importer never reads `process.env.POSTHOG_API_KEY`; the live rollout lane injects the real key only when it is ready to send historical events.
- Cutover and 48-hour rules: rows with `timestamp >= cutover_at` are rejected with `defer_reason="at_or_after_cutover"` and reported outside the historical baseline; structurally valid rows with `timestamp < cutover_at` must be 4 D1 waitlist leads, 36 Railway waitlist leads, 40 combined waitlist leads, and 142 Railway profiles. Rows not yet 48 hours old are excluded from the sendable batch with `defer_reason="timestamp_within_48_hours"` until the rollout lane waits past `historical_send_ready_at`.
- Unique-lead semantics: the 40 `waitlist_submitted` dry-run events are one event per source row: 4 D1 `waitlist.id` rows use `glowlytics:lead:d1:<id>` and 36 Railway waitlist `id` rows use `glowlytics:lead:railway:<id>`. There is no cross-source dedupe or profile join.
- Historical account waitlist semantics: verified `uv_leads=0`, so every historical Railway `account_created` profile omits `waitlist_match` and `waitlist_bypassed`.

- [ ] **Step 1: Add fixture files that encode the required counts without PII**

Create fixture generators in the test file rather than hard-coding 182 rows by hand. The fixture files can contain compact arrays generated by the test setup:

function d1Rows(count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    created_at: `2026-06-${String((i % 20) + 1).padStart(2, '0')}T10:00:00.000Z`,
    source: i % 2 === 0 ? 'hero' : 'footer',
    posthog_distinct_id: `browser-${i + 1}`,
    acquisition_source: i % 3 === 0 ? 'google' : 'unknown',
    acquisition_medium: i % 3 === 0 ? 'paid_search' : 'unknown',
    attribution_quality: 'backfilled',
    landing_path: i % 2 === 0 ? '/' : '/uv-scan',
  }));
}

function railwayWaitlistRows(count = 36) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    created_at: `2026-06-${String((i % 20) + 1).padStart(2, '0')}T11:00:00.000Z`,
    source: i % 2 === 0 ? 'hero' : 'footer',
  }));
}

function profileRows(count = 142) {
  return Array.from({ length: count }, (_, i) => ({
    user_id: `user_${String(i + 1).padStart(4, '0')}`,
    created_at: `2026-06-${String((i % 20) + 1).padStart(2, '0')}T12:00:00.000Z`,
  }));
}
```

- [ ] **Step 2: Write failing importer tests for counts, conditional historical waitlist booleans, UUID stability, 48-hour boundary, PII omission, and no live import**

Create `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/posthog-backfill-glowlytics.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildDryRun,
  deriveArtifactRunId,
  deterministicUuidV5,
  manifestRowForD1Lead,
  manifestRowForRailwayProfile,
} = require('../scripts/posthog-backfill-glowlytics');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glowlytics-posthog-backfill-'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function d1Rows(count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    email: `d1-lead${i + 1}@example.invalid`,
    created_at: `2026-06-${String((i % 20) + 1).padStart(2, '0')}T10:00:00.000Z`,
    source: i % 2 === 0 ? 'hero' : 'footer',
  }));
}
function railwayWaitlistRows(count = 36) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    email: `railway-lead${i + 1}@example.invalid`,
    created_at: `2026-06-${String((i % 20) + 1).padStart(2, '0')}T11:00:00.000Z`,
    source: i % 2 === 0 ? 'hero' : 'footer',
  }));
}
function profileRows(count = 142) {
  return Array.from({ length: count }, (_, i) => ({
    user_id: `user_${String(i + 1).padStart(4, '0')}`,
    created_at: `2026-06-${String((i % 20) + 1).padStart(2, '0')}T12:00:00.000Z`,
  }));
}

test('dry run writes 4 D1 + 36 Railway waitlist and 142 Railway profile events without sending live imports', async () => {
  const dir = tempDir();
  const d1 = path.join(dir, 'd1.json');
  const railwayWaitlist = path.join(dir, 'railway-waitlist.json');
  const profiles = path.join(dir, 'profiles.json');
  const uv = path.join(dir, 'uv.json');
  writeJson(d1, d1Rows());
  writeJson(railwayWaitlist, railwayWaitlistRows());
  writeJson(profiles, profileRows());
  writeJson(uv, []);
  const summary = await buildDryRun({
    d1WaitlistJson: d1,
    railwayWaitlistJson: railwayWaitlist,
    railwayProfilesJson: profiles,
    railwayUvLeadsJson: uv,
    artifactRoot: dir, artifactRunId: 'test-run',
    cutoverAt: '2026-07-20T00:00:00.000Z', cutoverSource: 'unit-test-cutover',
    now: '2026-07-20T12:00:00.000Z',
  });
  const artifactDir = path.join(dir, 'test-run');
  expect(summary.sources.glowlytics_d1_waitlist.eligible).toBe(4);
  expect(summary.sources.glowlytics_railway_waitlist.eligible).toBe(36);
  expect(summary.combined_waitlist.eligible).toBe(40);
  expect(summary.sources.glowlytics_railway_user_profiles.eligible).toBe(142);
  expect(summary.sources.glowlytics_d1_waitlist.baseline_pre_cutoff).toBe(4);
  expect(summary.sources.glowlytics_railway_waitlist.baseline_pre_cutoff).toBe(36);
  expect(summary.combined_waitlist.baseline_pre_cutoff).toBe(40);
  expect(summary.live_send_enabled).toBe(false);
  const batch = JSON.parse(fs.readFileSync(path.join(artifactDir, 'batch.json'), 'utf8'));
  expect(batch.historical_migration).toBe(true);
  expect(batch.sent_at).toBeUndefined();
  expect(batch.batch).toHaveLength(182);
  expect(summary.approved_baseline).toEqual({ d1_waitlist: 4, railway_waitlist: 36, combined_waitlist: 40, railway_profiles: 142 });
});

test('dry run fails source coverage when a source or combined pre-cutover total changes', async () => {
  const dir = tempDir();
  const d1 = path.join(dir, 'd1.json');
  const railwayWaitlist = path.join(dir, 'railway-waitlist.json');
  const profiles = path.join(dir, 'profiles.json');
  writeJson(d1, d1Rows());
  writeJson(railwayWaitlist, railwayWaitlistRows(35));
  writeJson(profiles, profileRows());
  await expect(buildDryRun({
    d1WaitlistJson: d1, railwayWaitlistJson: railwayWaitlist, railwayProfilesJson: profiles,
    artifactRoot: dir, artifactRunId: 'mismatch-run',
    cutoverAt: '2026-07-20T00:00:00.000Z', cutoverSource: 'unit-test-cutover',
    now: '2026-07-20T12:00:00.000Z',
  })).rejects.toThrow(/source coverage mismatch.*reviewed reconciliation/);
});
test('manifest rows use opaque identities, UUIDv5 is stable, and properties omit email', () => {
  const row = manifestRowForD1Lead(d1Rows(1)[0], { now: '2026-07-20T12:00:00.000Z', cutoverAt: '2026-07-20T00:00:00.000Z', cutoverSource: 'unit-test-cutover' });
  expect(row.distinct_id).toBe('glowlytics:lead:d1:1');
  expect(row.uuid).toBe(deterministicUuidV5('glowlytics|glowlytics_d1_waitlist|1|waitlist_submitted'));
  expect(JSON.stringify(row.properties)).not.toMatch(/lead1@example\.invalid/);
  expect(row.properties.product).toBe('glowlytics');
  expect(row.properties.historical_backfill).toBe(true);
  expect(row.cutover_at).toBe('2026-07-20T00:00:00.000Z');
  expect(row.cutover_source).toBe('unit-test-cutover');
});

test('historical Railway profiles omit waitlist booleans when no deterministic UV lead exists', () => {
  const row = manifestRowForRailwayProfile(profileRows(1)[0], { now: '2026-07-20T12:00:00.000Z', cutoverAt: '2026-07-20T00:00:00.000Z', cutoverSource: 'unit-test-cutover' }, new Map());
  expect(row.event).toBe('account_created');
  expect(row.distinct_id).toBe('glowlytics:user:user_0001');
  expect(row.properties.waitlist_match).toBeUndefined();
  expect(row.properties.waitlist_bypassed).toBeUndefined();
  expect(row.properties.acquisition_source).toBe('unknown');
  expect(row.properties.acquisition_medium).toBe('unknown');
});


test('manifest sanitizes attribution fields and rejects unsafe raw values', () => {
  const row = manifestRowForD1Lead({
    ...d1Rows(1)[0],
    acquisition_source: 'newsletter',
    acquisition_medium: 'CPC',
    utm_source: 'Google',
    utm_campaign: 'api_key=secret',
    utm_term: 'SkinCare',
    utm_content: 'lead@example.invalid',
    referrer_host: 'https://www.google.com/search?q=secret',
    landing_path: '/uv-scan?email=lead@example.invalid',
  }, { now: '2026-07-20T12:00:00.000Z', cutoverAt: '2026-07-20T00:00:00.000Z', cutoverSource: 'unit-test-cutover' });
  expect(row.properties.acquisition_source).toBe('unknown');
  expect(row.properties.acquisition_medium).toBe('cpc');
  expect(row.properties.utm_source).toBe('google');
  expect(row.properties.utm_campaign).toBeNull();
  expect(row.properties.utm_term).toBe('SkinCare');
  expect(row.properties.utm_content).toBeNull();
  expect(row.properties.referrer_host).toBe('www.google.com');
  expect(row.properties.landing_path).toBe('/uv-scan');
  expect(JSON.stringify(row.properties)).not.toMatch(/lead@example\.invalid|api_key|secret/);
});

test('manifest reports missing source primary keys as rejects instead of aborting valid rows', () => {
  const d1Reject = manifestRowForD1Lead({ ...d1Rows(1)[0], id: undefined }, { now: '2026-07-20T12:00:00.000Z', cutoverAt: '2026-07-20T00:00:00.000Z', cutoverSource: 'unit-test-cutover' });
  const profileReject = manifestRowForRailwayProfile({ created_at: '2026-06-01T12:00:00.000Z' }, { now: '2026-07-20T12:00:00.000Z', cutoverAt: '2026-07-20T00:00:00.000Z', cutoverSource: 'unit-test-cutover' });
  expect(d1Reject.eligible).toBe(false);
  expect(d1Reject.defer_reason).toBe('missing_source_pk');
  expect(d1Reject.uuid).toBeNull();
  expect(profileReject.eligible).toBe(false);
  expect(profileReject.defer_reason).toBe('missing_source_pk');
  expect(profileReject.uuid).toBeNull();
});

test('invalid source timestamps become rejects instead of throwing before eligibility', () => {
  const row = manifestRowForD1Lead({ ...d1Rows(1)[0], created_at: 'not-a-date' }, { now: '2026-07-20T12:00:00.000Z', cutoverAt: '2026-07-20T00:00:00.000Z', cutoverSource: 'unit-test-cutover' });
  expect(row.eligible).toBe(false);
  expect(row.defer_reason).toBe('invalid_timestamp');
  expect(row.timestamp).toBe('not-a-date');
  expect(row.uuid).toBeNull();
});

test('profiles newer than the 48-hour boundary are deferred, not backdated', () => {
  const row = manifestRowForRailwayProfile({ user_id: 'user_recent', created_at: '2026-07-19T12:00:00.000Z' }, { now: '2026-07-20T12:00:00.000Z', cutoverAt: '2026-07-20T00:00:00.000Z', cutoverSource: 'unit-test-cutover' });
  expect(row.eligible).toBe(false);
  expect(row.defer_reason).toBe('timestamp_within_48_hours');
  expect(row.timestamp).toBe('2026-07-19T12:00:00.000Z');
});

test('rows at or after the forward cutover are rejected to prevent dry-run/deploy overlap', () => {
  const row = manifestRowForD1Lead({ ...d1Rows(1)[0], created_at: '2026-07-20T00:00:00.000Z' }, { now: '2026-07-20T12:00:00.000Z', cutoverAt: '2026-07-20T00:00:00.000Z', cutoverSource: 'unit-test-cutover' });
  expect(row.eligible).toBe(false);
  expect(row.defer_reason).toBe('at_or_after_cutover');
  expect(row.cutover_at).toBe('2026-07-20T00:00:00.000Z');
});

test('post-cutoff exported rows are reported separately and do not break approved pre-cutoff coverage', async () => {
  const dir = tempDir();
  const d1 = path.join(dir, 'd1.json');
  const profiles = path.join(dir, 'profiles.json');
  const railwayWaitlist = path.join(dir, 'railway-waitlist.json');
  const profiles = path.join(dir, 'profiles.json');
  writeJson(d1, [...d1Rows(4), { ...d1Rows(1)[0], id: 5, created_at: '2026-07-20T00:00:00.000Z' }]);
  writeJson(railwayWaitlist, railwayWaitlistRows(36));
  writeJson(profiles, [...profileRows(142), { user_id: 'user_post_cutoff', created_at: '2026-07-20T01:00:00.000Z' }]);
  const summary = await buildDryRun({ d1WaitlistJson: d1, railwayWaitlistJson: railwayWaitlist, railwayProfilesJson: profiles, artifactRoot: dir, artifactRunId: 'post-cutoff-run', cutoverAt: '2026-07-20T00:00:00.000Z', cutoverSource: 'unit-test-cutover', now: '2026-07-20T12:00:00.000Z' });
  expect(summary.sources.glowlytics_d1_waitlist.eligible).toBe(4);
  expect(summary.sources.glowlytics_railway_waitlist.eligible).toBe(36);
  expect(summary.combined_waitlist.eligible).toBe(40);
  expect(summary.sources.glowlytics_d1_waitlist.post_cutoff).toBe(1);
  expect(summary.sources.glowlytics_railway_user_profiles.eligible).toBe(142);
  expect(summary.sources.glowlytics_railway_user_profiles.post_cutoff).toBe(1);
});

test('recent pre-cutoff rows defer and malformed rows reject while valid rows still emit artifacts', async () => {
  const dir = tempDir();
  const d1 = path.join(dir, 'd1.json');
  const profiles = path.join(dir, 'profiles.json');
  writeJson(d1, [
    ...d1Rows(39),
    { ...d1Rows(1)[0], id: 40, created_at: '2026-07-19T23:00:00.000Z' },
    { ...d1Rows(1)[0], id: 41, created_at: 'bad-timestamp' },
  ]);
  writeJson(profiles, profileRows(142));

  const summary = await buildDryRun({ d1WaitlistJson: d1, railwayProfilesJson: profiles, artifactRoot: dir, artifactRunId: 'deferred-and-rejected-run', cutoverAt: '2026-07-20T00:00:00.000Z', cutoverSource: 'unit-test-cutover', now: '2026-07-20T12:00:00.000Z' });
  const artifactDir = path.join(dir, 'deferred-and-rejected-run');
  const batch = JSON.parse(fs.readFileSync(path.join(artifactDir, 'batch.json'), 'utf8'));
  const rejects = fs.readFileSync(path.join(artifactDir, 'rejects.jsonl'), 'utf8');

  expect(summary.sources.glowlytics_d1_waitlist.baseline_pre_cutoff).toBe(4);
  expect(summary.sources.glowlytics_d1_waitlist.eligible).toBe(3);
  expect(summary.sources.glowlytics_d1_waitlist.deferred_48h).toBe(1);
  expect(summary.sources.glowlytics_d1_waitlist.malformed).toBe(1);
  expect(summary.deferred_48h).toBe(1);
  expect(batch.batch).toHaveLength(181);
  expect(rejects).toMatch(/timestamp_within_48_hours/);
  expect(rejects).toMatch(/invalid_timestamp/);
});

test('dry run refuses to overwrite an existing artifact run directory', async () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, 'existing-run'));
  await expect(buildDryRun({ d1WaitlistJson: 'unused', railwayProfilesJson: 'unused', artifactRoot: dir, artifactRunId: 'existing-run', cutoverAt: '2026-07-20T00:00:00.000Z', cutoverSource: 'unit-test-cutover', now: '2026-07-20T12:00:00.000Z' })).rejects.toThrow(/refusing to overwrite/);
});
```

- [ ] **Step 3: Run the importer tests to verify failure**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/posthog-backfill-glowlytics.test.js --runInBand`

Expected: FAIL because `scripts/posthog-backfill-glowlytics.js` does not exist.

- [ ] **Step 4: Implement the sendless importer module and CLI**

Create `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/scripts/posthog-backfill-glowlytics.js`:

```js
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = 'glowlytics-posthog-backfill-v1';
const UUID_NAMESPACE = 'b7b3422d-9972-5b42-8e4f-7a8906603b58';
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function deterministicUuidV5(name, namespace = UUID_NAMESPACE) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = crypto.createHash('sha1').update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function eligibility(timestamp, { now, cutoverAt }) {
  const ts = new Date(timestamp).getTime();
  const current = new Date(now).getTime();
  const cutover = new Date(cutoverAt).getTime();
  if (!Number.isFinite(ts)) return { eligible: false, defer_reason: 'invalid_timestamp' };
  if (ts >= cutover) return { eligible: false, defer_reason: 'at_or_after_cutover' };
  if (current - ts < FORTY_EIGHT_HOURS_MS) return { eligible: false, defer_reason: 'timestamp_within_48_hours' };
  return { eligible: true, defer_reason: null };
}

const FORM_PLACEMENT_ALIASES = new Map([['hero', 'hero'], ['footer', 'footer'], ['final-cta', 'footer'], ['blog-newsletter', 'footer'], ['modal', 'modal'], ['pricing', 'pricing'], ['mobile_onboarding', 'mobile_onboarding'], ['uv-scan-web', 'unknown'], ['unknown', 'unknown']]);
function normalizeFormPlacement(value) {
  return typeof value === 'string' ? FORM_PLACEMENT_ALIASES.get(value) || 'unknown' : 'unknown';
}

const ACQUISITION_SOURCES = new Set(['instagram', 'tiktok', 'google', 'other_search', 'ai_search', 'direct', 'referral', 'unknown']);
const SENSITIVE_VALUE_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|((api[_-]?key|api|secret|password|credential|bearer|access|refresh|id)?[_-]?token=?)|\b(api[_-]?key|secret|password|credential|bearer)\b|((gclid|gbraid|wbraid)=?)/i;
const field = (value, max = 256) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed && !SENSITIVE_VALUE_RE.test(trimmed) ? trimmed : null;
};
const lowerField = (value, max = 128) => field(value, max)?.toLowerCase() || null;
const acquisitionSource = (value) => (typeof value === 'string' && ACQUISITION_SOURCES.has(value) ? value : 'unknown');
function normalizeHost(value) {
  const raw = field(value, 512);
  if (!raw) return null;
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase().slice(0, 256);
  } catch {
    return null;
  }
}
function normalizePath(value) {
  const raw = field(value, 512);
  if (!raw) return null;
  try {
    const parsed = raw.startsWith('/') ? new URL(`https://glowlytics.invalid${raw}`) : new URL(raw);
    return parsed.pathname.slice(0, 256);
  } catch {
    return raw.startsWith('/') ? raw.split(/[?#]/, 1)[0].slice(0, 256) : null;
  }
}
function cleanSourcePk(value) {
  return value === undefined || value === null || String(value).trim() === '' ? null : String(value);
}

function normalizeTimestamp(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function canonicalBackfilledAttribution(row) {
  return {
    product: 'glowlytics',
    acquisition_source: acquisitionSource(row.acquisition_source),
    acquisition_medium: lowerField(row.acquisition_medium, 64) || 'unknown',
    attribution_model: 'first_touch',
    attribution_quality: 'backfilled',
    historical_backfill: true,
    form_placement: normalizeFormPlacement(row.form_placement || row.source),
    utm_source: lowerField(row.utm_source, 128),
    utm_medium: lowerField(row.utm_medium, 128),
    utm_campaign: field(row.utm_campaign, 256),
    utm_term: field(row.utm_term, 256),
    utm_content: field(row.utm_content, 256),
    referrer_host: normalizeHost(row.referrer_host),
    landing_path: normalizePath(row.landing_path),
  };
}

function manifestRow({ source, source_table, source_pk, event, distinct_id, timestamp, properties, now, cutoverAt, cutoverSource }) {
  const pk = cleanSourcePk(source_pk);
  const normalizedTimestamp = normalizeTimestamp(timestamp);
  const distinct = distinct_id === undefined || distinct_id === null || String(distinct_id).trim() === '' ? null : String(distinct_id);
  const rejectReason =
    !pk ? 'missing_source_pk' :
    !distinct ? 'missing_distinct_id' :
    !normalizedTimestamp ? 'invalid_timestamp' :
    null;
  const state = rejectReason ? { eligible: false, defer_reason: rejectReason } : eligibility(normalizedTimestamp, { now, cutoverAt });
  const uuid = rejectReason ? null : deterministicUuidV5(`glowlytics|${source}|${pk}|${event}`);
  return {
    schema_version: SCHEMA_VERSION,
    source,
    source_table,
    source_pk: pk,
    event,
    product: 'glowlytics',
    distinct_id: distinct,
    timestamp: normalizedTimestamp || String(timestamp || ''),
    uuid,
    properties: { ...(distinct ? { distinct_id: distinct } : {}), ...properties },
    eligible: state.eligible,
    defer_reason: state.defer_reason,
    cutover_at: cutoverAt,
    cutover_source: cutoverSource,
  };
}

function manifestRowForD1Lead(row, context) {
  return manifestRow({
    source: 'glowlytics_d1_waitlist',
    source_table: 'waitlist',
    source_pk: row.id,
    event: 'waitlist_submitted',
    distinct_id: row.id === undefined || row.id === null || String(row.id).trim() === '' ? null : `glowlytics:lead:d1:${row.id}`,
    timestamp: row.created_at,
    properties: canonicalBackfilledAttribution(row),
    ...context,
  });
}
function manifestRowForRailwayWaitlist(row, context) {
  return manifestRow({
    source: 'glowlytics_railway_waitlist',
    source_table: 'waitlist',
    source_pk: row.id,
    event: 'waitlist_submitted',
    distinct_id: row.id === undefined || row.id === null || String(row.id).trim() === '' ? null : `glowlytics:lead:railway:${row.id}`,
    timestamp: row.created_at,
    properties: canonicalBackfilledAttribution(row),
    ...context,
  });
}

function manifestRowForRailwayProfile(row, context) {
  return manifestRow({
    source: 'glowlytics_railway_user_profiles',
    source_table: 'user_profiles',
    source_pk: row.user_id,
    event: 'account_created',
    distinct_id: row.user_id === undefined || row.user_id === null || String(row.user_id).trim() === '' ? null : `glowlytics:user:${row.user_id}`,
    timestamp: row.created_at,
    properties: { ...canonicalBackfilledAttribution({}), form_placement: null },
    ...context,
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function createArtifactDirs(artifactRoot, artifactRunId) {
  const artifactDir = path.resolve(artifactRoot, artifactRunId);
  if (fs.existsSync(artifactDir)) throw new Error(`refusing to overwrite existing artifact directory: ${artifactDir}`);
  fs.mkdirSync(path.resolve(artifactRoot), { recursive: true });
  const stagingDir = path.resolve(artifactRoot, `.${artifactRunId}.tmp-${process.pid}`);
  if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: false });
  return { artifactDir, stagingDir };
}

const APPROVED_BASELINE = { d1Waitlist: 4, railwayWaitlist: 36, combinedWaitlist: 40, railwayProfiles: 142 };
function deriveArtifactRunId(cutoverAt) {
  const slug = new Date(cutoverAt).toISOString().replace(/\D/g, '').slice(0, 14);
  if (!slug) throw new Error('invalid GLOWLYTICS_CUTOVER_AT');
  return `lane-b-${slug}Z-final`;
}
function approvedSourceCoverageError(d1, railwayWaitlist, profiles) {
  const combined = d1 + railwayWaitlist;
  if (d1 !== APPROVED_BASELINE.d1Waitlist || railwayWaitlist !== APPROVED_BASELINE.railwayWaitlist || combined !== APPROVED_BASELINE.combinedWaitlist || profiles !== APPROVED_BASELINE.railwayProfiles) {
    return `source coverage mismatch: expected 4/36/40/142, got ${d1}/${railwayWaitlist}/${combined}/${profiles}; stop for reviewed reconciliation`;
  }
  return null;
}
async function buildDryRun({ d1WaitlistJson, railwayWaitlistJson, railwayProfilesJson, railwayUvLeadsJson, artifactRoot, artifactRunId, cutoverAt, cutoverSource, now }) {
  const runId = artifactRunId || deriveArtifactRunId(cutoverAt);
  const context = { now, cutoverAt, cutoverSource };
  const d1Rows = readJson(d1WaitlistJson);
  const railwayWaitlistRows = readJson(railwayWaitlistJson);
  const profileRows = readJson(railwayProfilesJson);
  const { artifactDir, stagingDir } = createArtifactDirs(artifactRoot, runId);
  const uvRows = railwayUvLeadsJson ? readJson(railwayUvLeadsJson) : [];
  if (uvRows.length !== 0) throw new Error('verified historical UV export must contain zero rows');
  const rows = [...d1Rows.map((r) => manifestRowForD1Lead(r, context)), ...railwayWaitlistRows.map((r) => manifestRowForRailwayWaitlist(r, context)), ...profileRows.map((r) => manifestRowForRailwayProfile(r, context))];
  const eligibleRows = rows.filter((r) => r.eligible);
  const rejectedRows = rows.filter((r) => !r.eligible);
  const malformedReasons = new Set(['missing_source_pk', 'missing_distinct_id', 'invalid_timestamp']);
  const sourceStats = (source, total) => {
    const scoped = rows.filter((r) => r.source === source);
    const rejectedScoped = rejectedRows.filter((r) => r.source === source);
    return { baseline_pre_cutoff: scoped.filter((r) => r.timestamp && !malformedReasons.has(r.defer_reason) && Date.parse(r.timestamp) < Date.parse(cutoverAt)).length, eligible: scoped.filter((r) => r.eligible).length, total, rejected: rejectedScoped.length, deferred_48h: rejectedScoped.filter((r) => r.defer_reason === 'timestamp_within_48_hours').length, post_cutoff: rejectedScoped.filter((r) => r.defer_reason === 'at_or_after_cutover').length, malformed: rejectedScoped.filter((r) => malformedReasons.has(r.defer_reason)).length };
  };
  const d1Stats = sourceStats('glowlytics_d1_waitlist', d1Rows.length);
  const railwayWaitlistStats = sourceStats('glowlytics_railway_waitlist', railwayWaitlistRows.length);
  const profileStats = sourceStats('glowlytics_railway_user_profiles', profileRows.length);
  const combinedWaitlist = { baseline_pre_cutoff: d1Stats.baseline_pre_cutoff + railwayWaitlistStats.baseline_pre_cutoff, eligible: d1Stats.eligible + railwayWaitlistStats.eligible };
  const coverageError = approvedSourceCoverageError(d1Stats.baseline_pre_cutoff, railwayWaitlistStats.baseline_pre_cutoff, profileStats.baseline_pre_cutoff);
  fs.writeFileSync(path.join(stagingDir, 'manifest.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(stagingDir, 'rejects.jsonl'), rejectedRows.map((r) => JSON.stringify(r)).join('\n') + (rejectedRows.length ? '\n' : ''));
  fs.writeFileSync(path.join(stagingDir, 'batch.json'), JSON.stringify({ api_key: 'dry-run', historical_migration: true, batch: eligibleRows.map((r) => ({ uuid: r.uuid, event: r.event, timestamp: r.timestamp, properties: r.properties })) }, null, 2));
  const summary = { schema_version: SCHEMA_VERSION, live_send_enabled: false, artifact_dir: artifactDir, artifact_run_id: runId, cutover_at: cutoverAt, source_cutoff_at: cutoverAt, cutover_source: cutoverSource, sources: { glowlytics_d1_waitlist: d1Stats, glowlytics_railway_waitlist: railwayWaitlistStats, glowlytics_railway_user_profiles: profileStats, glowlytics_railway_uv_leads: { enrichment_rows: 0 } }, combined_waitlist: combinedWaitlist, approved_baseline: { d1_waitlist: 4, railway_waitlist: 36, combined_waitlist: 40, railway_profiles: 142 }, batch_events: eligibleRows.length, rejects: rejectedRows.length, historical_send_ready_at: new Date(Date.parse(cutoverAt) + FORTY_EIGHT_HOURS_MS).toISOString(), deferred_48h: rejectedRows.filter((r) => r.defer_reason === 'timestamp_within_48_hours').length, coverage_error: coverageError };
  fs.writeFileSync(path.join(stagingDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.renameSync(stagingDir, artifactDir);
  if (coverageError) throw new Error(coverageError);
  return summary;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args['dry-run']) throw new Error('Only --dry-run is supported; this CLI never sends historical events.');
  const cutoverAt = args['cutover-at'] || process.env.GLOWLYTICS_CUTOVER_AT;
  if (!cutoverAt) throw new Error('GLOWLYTICS_CUTOVER_AT is required; capture the actual forward-enable timestamp once and pass it through this importer.');
  const cutoverSource = args['cutover-source'] || `glowlytics-forward-enable:${cutoverAt}`;
  buildDryRun({
    d1WaitlistJson: args['d1-waitlist-json'],
    railwayWaitlistJson: args['railway-waitlist-json'],
    railwayProfilesJson: args['railway-profiles-json'],
    railwayUvLeadsJson: args['railway-uv-leads-json'],
    artifactRoot: args['artifact-root'],
    artifactRunId: args['artifact-run-id'] || deriveArtifactRunId(cutoverAt),
    cutoverAt,
    cutoverSource,
    now: args.now || new Date().toISOString(),
  }).then((summary) => {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  });
}

module.exports = {
  deriveArtifactRunId,
  deterministicUuidV5,
  manifestRowForD1Lead,
  manifestRowForRailwayProfile,
  buildDryRun,
};
```

- [ ] **Step 5: Run importer tests**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/posthog-backfill-glowlytics.test.js --runInBand`

Expected: PASS. The tests prove source gates of 4 D1 + 36 Railway waitlist = 40 combined `waitlist_submitted` rows, 142 profiles, zero historical UV matches/bypasses, stable UUIDv5 replay keys, and safe dry-run artifacts.

- [ ] **Step 6: Run dry-run against reviewed exports and verify counts**
Export the reviewed D1/Railway source snapshots with an OMP Eval JavaScript cell so source files are generated before any importer run and without exposing credentials in the plan:

```js
const landing = "/Users/mustafaboorenie/cornell-hackathon/apps/landing";
const backend = "/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend";
const out = `${backend}/data/posthog-backfill/glowlytics`;
await Bun.$`mkdir -p ${out}`;
const d1Raw = await Bun.$`npx wrangler d1 execute glowlytics-waitlist --remote --command "SELECT id, email, source, attribution_slug, attribution_referrer, posthog_distinct_id, acquisition_source, acquisition_medium, attribution_model, attribution_quality, historical_backfill, form_placement, utm_source, utm_medium, utm_campaign, utm_term, utm_content, google_click_id_present, referrer_host, landing_path, created_at FROM waitlist ORDER BY id" --json`.cwd(landing).text();
const d1Rows = JSON.parse(d1Raw)[0]?.results || JSON.parse(d1Raw).result?.[0]?.results || [];
await Bun.write(`${out}/source-d1-waitlist.json`, JSON.stringify(d1Rows, null, 2));
const dbUrl = env("RAILWAY_DATABASE_URL");
if (!dbUrl) throw new Error("RAILWAY_DATABASE_URL missing");
const railwayWaitlistJson = await Bun.$`psql ${dbUrl} -At -c "SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at, t.id), '[]'::json) FROM (SELECT id, email, created_at, source, acquisition_source, acquisition_medium, form_placement, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer_host, landing_path FROM waitlist) t"`.text();
await Bun.write(`${out}/source-railway-waitlist.json`, JSON.stringify(JSON.parse(railwayWaitlistJson), null, 2));
const profilesJson = await Bun.$`psql ${dbUrl} -At -c "SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at, t.user_id), '[]'::json) FROM (SELECT user_id, created_at, posthog_account_created_uuid, posthog_account_created_timestamp, posthog_account_created_sent_at, posthog_account_created_status FROM user_profiles) t"`.text();
await Bun.write(`${out}/source-railway-user-profiles.json`, JSON.stringify(JSON.parse(profilesJson), null, 2));
const uvJson = await Bun.$`psql ${dbUrl} -At -c "SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.created_at, t.id), '[]'::json) FROM (SELECT id, email, clerk_user_id, created_at, source, posthog_distinct_id, acquisition_source, acquisition_medium, attribution_model, attribution_quality, form_placement, utm_source, utm_medium, utm_campaign, utm_term, utm_content, google_click_id_present, referrer_host, landing_path FROM uv_leads) t"`.text();
await Bun.write(`${out}/source-railway-uv-leads.json`, JSON.stringify(JSON.parse(uvJson), null, 2));
console.log(`exported ${d1Rows.length} D1 rows plus Railway snapshots under ${out}`);
```

Immediately run the preflight source-coverage cell below. It must verify 4 D1 waitlist rows, 36 Railway waitlist rows, 40 combined, and 142 Railway profiles before the importer runs.


After securely producing local export files, choose a scheduled near-future production forward-enable boundary and persist it once as `GLOWLYTICS_CUTOVER_AT` in Cloudflare Pages, Expo/EAS runtime config, Railway, and the importer shell. Deploy all gated forward code before that timestamp. Historical dry-run eligibility is `timestamp < GLOWLYTICS_CUTOVER_AT`; forward business capture is `created_at >= GLOWLYTICS_CUTOVER_AT`, so there is no gap or overlap.

Preflight the reviewed exports before running the importer:

```js
const backend = "/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend";
const cutoverAt = env("GLOWLYTICS_CUTOVER_AT");
if (!cutoverAt) throw new Error("GLOWLYTICS_CUTOVER_AT missing");
const cutoff = Date.parse(cutoverAt);
if (!Number.isFinite(cutoff)) throw new Error("GLOWLYTICS_CUTOVER_AT invalid");
const d1 = JSON.parse(await Bun.file(`${backend}/data/posthog-backfill/glowlytics/source-d1-waitlist.json`).text());
const railwayWaitlist = JSON.parse(await Bun.file(`${backend}/data/posthog-backfill/glowlytics/source-railway-waitlist.json`).text());
const profiles = JSON.parse(await Bun.file(`${backend}/data/posthog-backfill/glowlytics/source-railway-user-profiles.json`).text());
const hasPk = (value) => value !== undefined && value !== null && String(value).trim() !== "";
const structurallyValidPreCutoff = (rows, pkField) => rows.filter((r) => hasPk(r[pkField]) && Number.isFinite(Date.parse(r.created_at)) && Date.parse(r.created_at) < cutoff).length;
const d1Pre = structurallyValidPreCutoff(d1, "id");
const railwayWaitlistPre = structurallyValidPreCutoff(railwayWaitlist, "id");
const profilePre = structurallyValidPreCutoff(profiles, "user_id");
if (d1Pre !== 4 || railwayWaitlistPre !== 36 || d1Pre + railwayWaitlistPre !== 40 || profilePre !== 142) throw new Error(`source coverage mismatch before dry run: expected 4/36/40/142, got ${d1Pre}/${railwayWaitlistPre}/${d1Pre + railwayWaitlistPre}/${profilePre}; stop for reviewed reconciliation`);
```
Run the dry-run importer; the CLI derives the unique artifact run ID from `GLOWLYTICS_CUTOVER_AT` and refuses to overwrite any existing run directory:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend
GLOWLYTICS_CUTOVER_AT="$GLOWLYTICS_CUTOVER_AT" \
node scripts/posthog-backfill-glowlytics.js \
  --dry-run \
  --d1-waitlist-json data/posthog-backfill/glowlytics/source-d1-waitlist.json \
  --railway-waitlist-json data/posthog-backfill/glowlytics/source-railway-waitlist.json \
  --railway-profiles-json data/posthog-backfill/glowlytics/source-railway-user-profiles.json \
  --railway-uv-leads-json data/posthog-backfill/glowlytics/source-railway-uv-leads.json \
  --artifact-root data/posthog-backfill/glowlytics \
  --cutover-source "glowlytics-forward-enable:$GLOWLYTICS_CUTOVER_AT"
```

Expected `summary.json` in `data/posthog-backfill/glowlytics/<summary.artifact_run_id>/`:

```json
{
  "schema_version": "glowlytics-posthog-backfill-v1",
  "live_send_enabled": false,
  "artifact_run_id": "deriveArtifactRunId(process.env.GLOWLYTICS_CUTOVER_AT)",
  "cutover_at": "process.env.GLOWLYTICS_CUTOVER_AT",
  "source_cutoff_at": "process.env.GLOWLYTICS_CUTOVER_AT",
  "cutover_source": "glowlytics-forward-enable:${process.env.GLOWLYTICS_CUTOVER_AT}",
  "sources": {
    "glowlytics_d1_waitlist": { "baseline_pre_cutoff": 4, "eligible": 4 },
    "glowlytics_railway_waitlist": { "baseline_pre_cutoff": 36, "eligible": 36 },
    "glowlytics_railway_user_profiles": { "baseline_pre_cutoff": 142, "eligible": 142 },
    "glowlytics_railway_uv_leads": { "enrichment_rows": 0 }
  },
  "combined_waitlist": { "baseline_pre_cutoff": 40, "eligible": 40 },
  "artifact_root": "data/posthog-backfill/glowlytics",
  "artifact_dir": "data/posthog-backfill/glowlytics/${summary.artifact_run_id}",
  "unique_lead_semantics": "4 D1 rows use glowlytics:lead:d1:<id>; 36 Railway waitlist rows use glowlytics:lead:railway:<id>; no cross-source dedupe or inferred profile join",
  "approved_baseline": { "d1_waitlist": 4, "railway_waitlist": 36, "combined_waitlist": 40, "railway_profiles": 142 },
  "coverage_check": "each 4/36/142 source gate and combined 40 waitlist gate must pass before rollout",
  "historical_send_ready_at": "new Date(Date.parse(process.env.GLOWLYTICS_CUTOVER_AT) + 48h)",
  "deferred_48h": 0,
  "coverage_error": null,
  "batch_events": 182,
  "rejects": 0
}
```

If `glowlytics_railway_uv_leads.enrichment_rows` is nonzero, it may enrich only profiles whose `clerk_user_id` already exists; it must not create additional historical leads, must not infer D1 waitlist-to-profile joins, and must leave unlinked historical profiles without `waitlist_match` or `waitlist_bypassed` because missing linkage is unknown rather than bypass evidence.

- [ ] **Step 7: Commit**

```bash
cd /Users/mustafaboorenie/cornell-hackathon
git add apps/glowlytics/backend/scripts/posthog-backfill-glowlytics.js apps/glowlytics/backend/__tests__/posthog-backfill-glowlytics.test.js apps/glowlytics/backend/__tests__/fixtures/posthog-backfill-glowlytics
git commit -m "feat(glowlytics): generate dry-run posthog backfill artifacts"
```

---

### Task 6: Focused Verification and Deployment Smoke Path

**Files:**
- Verify: all files from Tasks 1-5.
- Do not modify implementation files in this task unless a verification step fails and the fix belongs to a previous task.

**Interfaces:**
- Consumes final dry-run artifacts named `lane-b-YYYYMMDDTHHMMSSZ-final`, derived from the runtime `GLOWLYTICS_CUTOVER_AT` (reviewed final run: `lane-b-20260719123000Z-final`).
- Produces a handoff note with the runtime-derived final `artifactRunId`, source coverage, 4/36/40/142 baselines, zero historical UV matches/bypasses, and dry-run counts.

- [ ] **Step 1: Run all focused automated checks for this lane**

Run:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/landing
npm run test:attribution
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics
npm test -- src/services/__tests__/analytics.test.ts src/config/__tests__/env.test.ts --runInBand
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend
npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Expected: all listed tests PASS.

- [ ] **Step 2: Verify the dry-run artifacts are safe for rollout review**

Use an OMP Eval JavaScript cell; do not use inline `node -e`, shell redirection, or ad-hoc cleanup. Derive `artifactRunId` from the same runtime `GLOWLYTICS_CUTOVER_AT` and verify `summary.json` matches it:

```js
const backend = "/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend";
const cutoverAt = env("GLOWLYTICS_CUTOVER_AT");
if (!cutoverAt) throw new Error("GLOWLYTICS_CUTOVER_AT missing");
const root = `${backend}/data/posthog-backfill/glowlytics`;
const slug = `lane-b-${new Date(cutoverAt).toISOString().replace(/\D/g, "").slice(0, 14)}Z-final`;
const dir = `${root}/${slug}`;
const batch = JSON.parse(await Bun.file(`${dir}/batch.json`).text());
if (batch.sent_at) throw new Error("sent_at present");
if (!batch.historical_migration) throw new Error("historical_migration missing");
if (JSON.stringify(batch).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)) throw new Error("email leaked");
const summary = JSON.parse(await Bun.file(`${dir}/summary.json`).text());
if (summary.artifact_run_id !== slug) throw new Error("artifact_run_id mismatch");
if (summary.cutover_at !== cutoverAt || summary.source_cutoff_at !== cutoverAt) throw new Error("cutover/source cutoff mismatch");
if (summary.sources.glowlytics_d1_waitlist.baseline_pre_cutoff !== 4) throw new Error("D1 baseline ownership mismatch");
if (summary.sources.glowlytics_railway_waitlist.baseline_pre_cutoff !== 36) throw new Error("Railway waitlist baseline ownership mismatch");
if (summary.combined_waitlist.baseline_pre_cutoff !== 40) throw new Error("combined waitlist baseline ownership mismatch");
if (summary.sources.glowlytics_railway_user_profiles.baseline_pre_cutoff !== 142) throw new Error("profile baseline ownership mismatch");
if (summary.deferred_48h !== 0) throw new Error(`historical send blocked: ${summary.deferred_48h} rows are still within 48h; wait until ${summary.historical_send_ready_at}`);
if (Date.now() < Date.parse(summary.historical_send_ready_at)) throw new Error(`historical send blocked until ${summary.historical_send_ready_at}`);
if (summary.sources.glowlytics_d1_waitlist.eligible !== 4) throw new Error("D1 eligible count mismatch after send-ready gate");
if (summary.sources.glowlytics_railway_waitlist.eligible !== 36 || summary.combined_waitlist.eligible !== 40) throw new Error("Railway/combined eligible count mismatch after send-ready gate");
if (summary.sources.glowlytics_railway_user_profiles.eligible !== 142) throw new Error("profile eligible count mismatch after send-ready gate");
if (summary.live_send_enabled !== false) throw new Error("live send enabled");
const historicalAccounts = batch.batch.filter((event) => event.event === "account_created");
for (const event of historicalAccounts) {
  if ("waitlist_match" in event.properties || "waitlist_bypassed" in event.properties) throw new Error("zero-UV historical profiles must omit waitlist booleans");
}
console.log(`safe batch ${batch.batch.length}`);
console.log(`counts ok ${summary.batch_events}`);
console.log(`historical account linkage ok ${historicalAccounts.length}`);
console.log(`cutover ${summary.source_cutoff_at} from ${summary.cutover_source}`);
console.log(`historical send ready after ${summary.historical_send_ready_at}`);
```

Expected:

```text
safe batch 182
counts ok 182
historical account linkage ok 142
cutover $GLOWLYTICS_CUTOVER_AT from glowlytics-forward-enable:$GLOWLYTICS_CUTOVER_AT
historical send ready after $GLOWLYTICS_CUTOVER_AT + 48h
```

- [ ] **Step 3: Landing deployment smoke path**

Use a staging or preview deployment with the shared project env vars set:
Persist the same scheduled future `GLOWLYTICS_CUTOVER_AT` value in Cloudflare Pages before deploy, deploy before that boundary, and submit the smoke lead only after the boundary has passed; this is the D1/landing cutoff that the dry-run importer must later reuse.
Before this build/deploy command, re-run the blocking remote D1 migration verification gate from Task 2 Step 4 and confirm it passes against the target D1 database.

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/landing
GLOWLYTICS_CUTOVER_AT="$GLOWLYTICS_CUTOVER_AT" NEXT_PUBLIC_POSTHOG_API_KEY="$NEXT_PUBLIC_POSTHOG_API_KEY" NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com npm run build
npx wrangler pages deploy out --project-name glowlytics --branch posthog-attribution-glowlytics
```

Smoke scenario:

1. Visit preview URL with `?utm_source=ig&utm_medium=paid_social&utm_campaign=lane-b-smoke`.
2. Confirm browser network sends `$pageview` to PostHog with `product="glowlytics"`, `acquisition_source="instagram"`, `attribution_model="first_touch"`, `historical_backfill=false`, and no email property.
3. Submit a controlled test address to the waitlist form.
4. Confirm `/api/waitlist` request contains `form_placement` and `posthog_distinct_id`.
5. Confirm PostHog receives `waitlist_submitted` only after the API response is `ok: true, created: true`; duplicate-email `ok: true, created: false` responses must not emit another canonical business event.
6. Visit a second URL with `?utm_source=google`; confirm the stored first-touch remains Instagram for subsequent waitlist submission in the same browser profile.

Expected: first-touch immutability holds, `form_placement` is present, `form_placement` is not used as `acquisition_source`, and no plaintext email is in PostHog properties.

- [ ] **Step 4: Expo/Railway deployment smoke path**

Use staging env vars:

```bash
EXPO_PUBLIC_POSTHOG_API_KEY="$EXPO_PUBLIC_POSTHOG_API_KEY"
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_KEY="$POSTHOG_API_KEY"
POSTHOG_HOST=https://us.i.posthog.com
GLOWLYTICS_CUTOVER_AT="$GLOWLYTICS_CUTOVER_AT"
```

Smoke scenario:

1. Launch the app signed out and confirm no call identifies `anonymous`.
2. Sign in or create a Clerk account and confirm the first identify call uses `glowlytics:user:<clerk-user-id>`.
3. Complete onboarding so the mobile app calls Railway `POST /api/users`.
4. Confirm Railway emits `account_created` with `distinct_id="glowlytics:user:<clerk-user-id>"`, `product="glowlytics"`, `historical_backfill=false`, and either:
   - `waitlist_match=true`, `waitlist_bypassed=false`, and UV first-touch fields when a verified UV lead exists; or
   - `waitlist_match=false`, `waitlist_bypassed=true`, `acquisition_source="unknown"`, and `acquisition_medium="unknown"` when no verified lead exists.

Expected: server-confirmed `account_created` appears once per post-cutover profile creation flow, is absent for `created_at < GLOWLYTICS_CUTOVER_AT`, has product isolation, remains `reconciliation_pending` while Clerk/UV lookup is unavailable, sets bypass only after conclusive no-match, retries the exact frozen UUID/timestamp/distinct-ID/property tuple, marks `posthog_account_created_sent_at` only after successful PostHog HTTP delivery, and does not contain plaintext email.

- [ ] **Step 5: Handoff to live PostHog rollout lane**

Send the rollout lane these exact artifacts, variables, and contracts:

```text
Glowlytics lane B plan: /Users/mustafaboorenie/cornell-hackathon/docs/superpowers/plans/2026-07-20-posthog-attribution-glowlytics.md
Importer CLI: /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/scripts/posthog-backfill-glowlytics.js
Artifact root variable: artifactRoot=data/posthog-backfill/glowlytics
Artifact run variable: artifactRunId=summary.artifact_run_id, derived from runtime GLOWLYTICS_CUTOVER_AT as lane-b-YYYYMMDDTHHMMSSZ-final.
Artifact directory: /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/data/posthog-backfill/glowlytics/${artifactRunId}/
Dry-run manifest: /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/data/posthog-backfill/glowlytics/${artifactRunId}/manifest.jsonl
Dry-run batch: /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/data/posthog-backfill/glowlytics/${artifactRunId}/batch.json
Dry-run summary: /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/data/posthog-backfill/glowlytics/${artifactRunId}/summary.json
Dry-run rejects: /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/data/posthog-backfill/glowlytics/${artifactRunId}/rejects.jsonl
Manifest schema version: glowlytics-posthog-backfill-v1
source_cutoff_at / cutover_at: summary.source_cutoff_at === summary.cutover_at === process.env.GLOWLYTICS_CUTOVER_AT
cutover_source: glowlytics-forward-enable:${process.env.GLOWLYTICS_CUTOVER_AT}
Expected ownership counts: 4 D1 + 36 Railway = 40 combined historical waitlist_submitted rows, and 142 historical account_created rows; live_send_enabled=false.
Production historical send gate: rollout must not send the dry-run batch until summary.deferred_48h === 0, summary.coverage_error === null, and current time is at or after summary.historical_send_ready_at (GLOWLYTICS_CUTOVER_AT + 48h). At that point expected batch_events is 182; before then valid baseline rows may be deferred but still counted in baseline_pre_cutoff.
Source coverage: D1/Railway waitlist/Railway profile source gates are 4/36/142 and the combined waitlist gate is 40. `uv_leads=0`; there is no cross-source join/dedupe and historical profiles omit waitlist booleans.
Unique lead semantics: D1 rows use `glowlytics:lead:d1:<id>` and Railway waitlist rows use `glowlytics:lead:railway:<id>`.
Historical account waitlist linkage: verified `uv_leads=0`, so all historical account_created rows omit both booleans.
Retry-safe forward account contract: a post-cutover profile starts `reconciliation_pending`; missing Clerk config, lookup timeout/error, or other unavailable reconciliation leaves UUID/properties/match fields unset. Only conclusive `matched` or `unmatched` freezes `posthog_account_created_uuid`, original timestamp, canonical distinct ID, PII-free properties, and match state, then advances to `pending_delivery`. A bounded startup/interval worker retries independently of clients; all sends reuse the exact tuple; `delivered` and `posthog_account_created_sent_at` are written only after successful PostHog HTTP delivery. Historical dry-run rows remain `< GLOWLYTICS_CUTOVER_AT`, UUIDv5-deterministic, and omit `sent_at`.
Exact dry-run command reviewed:
  cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend
  GLOWLYTICS_CUTOVER_AT="$GLOWLYTICS_CUTOVER_AT" node scripts/posthog-backfill-glowlytics.js --dry-run --d1-waitlist-json data/posthog-backfill/glowlytics/source-d1-waitlist.json --railway-waitlist-json data/posthog-backfill/glowlytics/source-railway-waitlist.json --railway-profiles-json data/posthog-backfill/glowlytics/source-railway-user-profiles.json --railway-uv-leads-json data/posthog-backfill/glowlytics/source-railway-uv-leads.json --artifact-root data/posthog-backfill/glowlytics --cutover-source "glowlytics-forward-enable:$GLOWLYTICS_CUTOVER_AT"
```

- [ ] **Step 6: Commit any final verification-only test fixture changes**

If Task 6 created or adjusted only test fixtures, commit them:

```bash
cd /Users/mustafaboorenie/cornell-hackathon
 git add apps/glowlytics/backend/__tests__/fixtures/posthog-backfill-glowlytics
 git commit -m "test(glowlytics): lock posthog dry-run backfill fixtures"
```

If no files changed in Task 6, do not create an empty commit.

---

## Rollout Boundary

This Glowlytics plan deliberately stops before live historical ingestion. The only historical output is a dry-run manifest, dry-run raw `/batch` JSON, summary, and reject file in a unique non-overwriting artifact run directory derived from the scheduled `GLOWLYTICS_CUTOVER_AT`. The live PostHog rollout plan owns reading the runtime `artifactRunId` artifacts, honoring `summary.source_cutoff_at === summary.cutover_at === GLOWLYTICS_CUTOVER_AT`, preserving the boundary where historical rows are strictly `< cutover` and forward business events are `>= cutover`, keeping historical account waitlist linkage conditional (`waitlist_match=true`/`waitlist_bypassed=false` only for deterministic UV matches and both properties omitted when unlinked), extending dashboard `1800446`, updating existing insight IDs `9824227`, `9824229`, `9824230`, and `9824234`, validating PostHog API schemas, and deciding when to send historical events.
