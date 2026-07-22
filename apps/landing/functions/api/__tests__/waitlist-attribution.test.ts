import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../waitlist";

type WaitlistRow = {
  id: number;
  email: string;
  source: string;
  created_at: string;
  posthog_distinct_id: string | null;
  acquisition_source: string;
  acquisition_medium: string;
  attribution_model: string;
  attribution_quality: string;
  historical_backfill: number;
  form_placement: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  google_click_id_present: number;
  referrer_host: string | null;
  landing_path: string | null;
  posthog_session_id: string | null;
};

type Prepared = {
  bind: (...values: unknown[]) => {
    first?: () => Promise<unknown>;
    run?: () => Promise<unknown>;
  };
};

function waitlistRow(overrides: Partial<WaitlistRow> = {}): WaitlistRow {
  return {
    id: 41,
    email: "lead@example.com",
    source: "hero",
    created_at: "2026-07-21T12:00:00.000Z",
    posthog_session_id: "0198b6bc-c2f8-7b5d-9e18-6c98232a1024",
    acquisition_source: "google",
    acquisition_medium: "paid_search",
    attribution_model: "first_touch",
    attribution_quality: "utm",
    historical_backfill: 0,
    form_placement: "hero",
    utm_source: "google",
    utm_medium: "paid_search",
    utm_campaign: "LaunchWave",
    utm_term: null,
    utm_content: null,
    google_click_id_present: 1,
    referrer_host: "www.google.com",
    landing_path: "/uv-scan",
    ...overrides,
  };
}

function envWithDb(
  firstRows: Array<unknown>,
  cutover: string | null = "2026-07-20T12:00:00.000Z",
) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const remainingRows = [...firstRows];
  const db = {
    prepare(sql: string): Prepared {
      if (sql.includes("rate_limit_counters")) {
        return {
          bind() {
            return { first: async () => ({ request_count: 1 }) };
          },
        };
      }
      return {
        bind(...values: unknown[]) {
          calls.push({ sql, values });
          return {
            first: async () => remainingRows.shift() ?? null,
            run: async () => ({ success: true, meta: { last_row_id: 41 } }),
          };
        },
      };
    },
  };
  return {
    env: {
      WAITLIST_DB: db,
      TRACK_SALT: "secret-salt",
      ...(cutover === null ? {} : { GLOWLYTICS_CUTOVER_AT: cutover }),
      NEXT_PUBLIC_POSTHOG_API_KEY: "phc_test",
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
    } as never,
    calls,
  };
}

const post = (body: unknown) =>
  new Request("https://glowlytics.ai/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json", "cf-connecting-ip": "1.2.3.4" },
    body: JSON.stringify(body),
  });

describe("waitlist attribution storage", () => {
  it("persists sanitized attribution, captures server-side, and returns no creation oracle", async () => {
    const { env, calls } = envWithDb([waitlistRow()]);
    const captureCalls: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captureCalls.push({ url: String(url), init });
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
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
        posthog_session_id: "0198b6bc-c2f8-7b5d-9e18-6c98232a1024",
      }), env } as never);

      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      const insert = calls.find((call) => call.sql.includes("INSERT OR IGNORE INTO waitlist"));
      assert.ok(insert);
      assert.equal(insert.values.includes("lead@example.com"), true);
      assert.equal(insert.values.includes("Lead@Example.com"), false);
      assert.equal(insert.values.includes("0190-browser-id"), false);
      assert.equal(insert.values.includes("unknown"), true);
      assert.equal(insert.values.includes("google"), true);
      assert.equal(insert.values.includes(1), true);
      assert.equal(insert.values.includes("/uv-scan"), true);
      assert.equal(insert.values.includes("/uv-scan?email=lead@example.com#frag"), false);
      assert.equal(insert.values.includes("www.google.com"), true);
      assert.equal(insert.values.includes("LaunchWave"), true);
      assert.equal(
        insert.values.some(
          (value) =>
            typeof value === "string" &&
            value.includes("lead@example.com") &&
            value !== "lead@example.com",
        ),
        false,
      );

      assert.equal(captureCalls.length, 1);
      assert.equal(captureCalls[0].url, "https://us.i.posthog.com/batch/");
      const captureBody = JSON.parse(String(captureCalls[0].init?.body));
      assert.equal(captureBody.api_key, "phc_test");
      assert.equal(captureBody.batch[0].event, "waitlist_submitted");
      assert.match(captureBody.batch[0].uuid, /^[0-9a-f-]{36}$/);
      assert.equal(captureBody.batch[0].timestamp, "2026-07-21T12:00:00.000Z");
      assert.equal(captureBody.batch[0].properties.distinct_id, "glowlytics:lead:d1:41");
      assert.equal(captureBody.batch[0].properties.product, "glowlytics");
      assert.equal(captureBody.batch[0].properties.acquisition_source, "google");
      assert.equal(
        captureBody.batch[0].properties.$session_id,
        "0198b6bc-c2f8-7b5d-9e18-6c98232a1024",
      );
      assert.equal(Object.prototype.hasOwnProperty.call(captureBody.batch[0].properties, "posthog_session_id"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(captureBody.batch[0].properties, "posthog_distinct_id"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(captureBody.batch[0].properties, "browser_distinct_id"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(captureBody.batch[0].properties, "account_alias"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(captureBody.batch[0].properties, "lead_alias"), false);
      assert.doesNotMatch(JSON.stringify(captureBody), /lead@example\.com/i);
      assert.doesNotMatch(JSON.stringify(captureBody), /0190-browser-id/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("drops malformed PostHog session IDs before storage and capture", async () => {
    const { env, calls } = envWithDb([waitlistRow({ posthog_session_id: null })]);
    const captureCalls: Array<RequestInit | undefined> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      captureCalls.push(init);
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
      const res = await onRequestPost({
        request: post({
          email: "lead@example.com",
          posthog_session_id: "glowlytics:user:user_123",
          posthog_distinct_id: "0190-browser-id",
        }),
        env,
      } as never);

      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      const insert = calls.find((call) => call.sql.includes("INSERT OR IGNORE INTO waitlist"));
      assert.ok(insert);
      assert.equal(insert.values.includes("glowlytics:user:user_123"), false);
      assert.equal(insert.values.includes("0190-browser-id"), false);
      const captureBody = JSON.parse(String(captureCalls[0]?.body));
      assert.equal(Object.prototype.hasOwnProperty.call(captureBody.batch[0].properties, "$session_id"), false);
      assert.doesNotMatch(JSON.stringify(captureBody), /glowlytics:user:user_123/);
      assert.doesNotMatch(JSON.stringify(captureBody), /0190-browser-id/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns the same response for an existing row and replays only its immutable event", async () => {
    const existing = waitlistRow();
    const { env, calls } = envWithDb([existing]);
    const captureCalls: Array<RequestInit | undefined> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      captureCalls.push(init);
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
      const res = await onRequestPost({ request: post({
        email: "lead@example.com",
        form_placement: "footer",
        acquisition_source: "instagram",
        acquisition_medium: "paid_social",
        posthog_session_id: "0198b6bd-58ad-7ab8-b11a-4bcb1005e036",
      }), env } as never);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.equal(calls.some((call) => call.sql.includes("INSERT OR IGNORE INTO waitlist")), true);
      const captureBody = JSON.parse(String(captureCalls[0]?.body));
      assert.equal(captureBody.batch[0].properties.acquisition_source, "google");
      assert.equal(captureBody.batch[0].properties.form_placement, "hero");
      assert.equal(
        captureBody.batch[0].properties.$session_id,
        "0198b6bc-c2f8-7b5d-9e18-6c98232a1024",
      );
      assert.doesNotMatch(JSON.stringify(captureBody), /0198b6bd-58ad-7ab8-b11a-4bcb1005e036/);
      assert.doesNotMatch(JSON.stringify(captureBody), /lead@example\.com/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not capture a row whose immutable creation timestamp predates cutover", async () => {
    const { env } = envWithDb([
      waitlistRow({ created_at: "2026-07-19T12:00:00.000Z" }),
    ]);
    const originalFetch = globalThis.fetch;
    let captureCount = 0;
    globalThis.fetch = (async () => {
      captureCount += 1;
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
      const res = await onRequestPost({
        request: post({ email: "precutover@example.com" }),
        env,
      } as never);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.equal(captureCount, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fails before storage when the cutover is missing or invalid", async () => {
    const { env, calls } = envWithDb([], null);

    const res = await onRequestPost({
      request: post({ email: "nogate@example.com" }),
      env,
    } as never);

    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "cutover_not_configured" });
    assert.equal(calls.length, 0);
  });

  it("keeps a written row retryable when the server-side capture fails", async () => {
    const { env, calls } = envWithDb([waitlistRow()]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 503 })) as typeof fetch;
    try {
      const res = await onRequestPost({
        request: post({ email: "lead@example.com" }),
        env,
      } as never);

      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: "tracking_unavailable" });
      assert.equal(calls.some((call) => call.sql.includes("INSERT OR IGNORE INTO waitlist")), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
