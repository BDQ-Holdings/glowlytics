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

  it("accepts canonical facebook attribution for a new lead", async () => {
    const { env, calls } = envWithDb(null);
    const res = await onRequestPost({ request: post({
      email: "facebook@example.com",
      acquisition_source: "facebook",
      acquisition_medium: "organic_social",
      attribution_model: "first_touch",
      attribution_quality: "referrer",
      historical_backfill: false,
      form_placement: "hero",
      referrer_host: "m.facebook.com",
      landing_path: "/",
    }), env } as never);

    assert.equal(res.status, 200);
    const insert = calls.find((c) => c.sql.includes("INSERT INTO waitlist"));
    assert.ok(insert);
    assert.equal(insert!.values.includes("facebook"), true);
    assert.equal(insert!.values.includes("m.facebook.com"), true);
    assert.equal(insert!.values.includes("unknown"), false);
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
