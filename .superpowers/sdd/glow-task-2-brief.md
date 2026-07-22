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
