import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../waitlist-lookup";

type Prepared = {
  bind: (...values: unknown[]) => {
    first: () => Promise<unknown>;
  };
};

function envWithRow(row: unknown, token = "lookup-token") {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string): Prepared {
      return {
        bind(...values: unknown[]) {
          calls.push({ sql, values });
          return { first: async () => row };
        },
      };
    },
  };
  return { env: { WAITLIST_DB: db, WAITLIST_LOOKUP_TOKEN: token } as never, calls };
}

function lookup(email: string, token = "lookup-token") {
  return new Request("https://glowlytics.ai/api/waitlist-lookup", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
}

describe("authenticated waitlist identity lookup", () => {
  it("returns one exact-email attribution row without returning the email", async () => {
    const row = {
      posthog_distinct_id: "landing-browser-1",
      acquisition_source: "facebook",
      acquisition_medium: "paid_social",
      attribution_model: "first_touch",
      attribution_quality: "utm",
      historical_backfill: 0,
      form_placement: "hero",
      utm_source: "facebook",
      utm_medium: "paid_social",
      utm_campaign: "launch",
      utm_term: null,
      utm_content: null,
      google_click_id_present: 0,
      referrer_host: "facebook.com",
      landing_path: "/",
    };
    const { env, calls } = envWithRow(row);

    const response = await onRequestPost({
      request: lookup(" Lead@Example.com "),
      env,
    } as never);

    assert.equal(response.status, 200);
    const responseText = await response.clone().text();
    assert.deepEqual(await response.json(), { matched: true, lead: row });
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /FROM waitlist[\s\S]*WHERE email = \?/);
    assert.deepEqual(calls[0].values, ["lead@example.com"]);
    assert.doesNotMatch(responseText, /lead@example\.com/i);
  });

  it("returns an authenticated non-match without exposing membership publicly", async () => {
    const { env, calls } = envWithRow(null);

    const response = await onRequestPost({ request: lookup("none@example.com"), env } as never);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { matched: false });
    assert.equal(calls.length, 1);
  });

  it("rejects a wrong bearer token before querying D1", async () => {
    const { env, calls } = envWithRow(null);

    const response = await onRequestPost({
      request: lookup("lead@example.com", "wrong-token"),
      env,
    } as never);

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "forbidden" });
    assert.equal(calls.length, 0);
  });

  it("fails closed when the server lookup token is not configured", async () => {
    const { env, calls } = envWithRow(null, "");

    const response = await onRequestPost({ request: lookup("lead@example.com"), env } as never);

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "unavailable" });
    assert.equal(calls.length, 0);
  });

  it("rejects malformed email before querying D1", async () => {
    const { env, calls } = envWithRow(null);

    const response = await onRequestPost({ request: lookup("not-an-email"), env } as never);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid email" });
    assert.equal(calls.length, 0);
  });
});
