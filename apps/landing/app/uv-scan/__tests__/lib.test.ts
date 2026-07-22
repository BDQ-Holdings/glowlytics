import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { postLead, SOURCE } from "../lib";
import type { FirstTouchSnapshot } from "../../../lib/posthogAttribution";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function recordLeadRequests() {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ ok: true, report_token: "report-token" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

function requestBody(calls: Array<{ init?: RequestInit }>) {
  assert.equal(calls.length, 1);
  assert.equal(typeof calls[0].init?.body, "string");
  return JSON.parse(calls[0].init!.body as string) as Record<string, unknown>;
}

describe("postLead attribution payload", () => {
  it("sends canonical first-touch acquisition fields without browser identity", async () => {
    const calls = recordLeadRequests();
    const firstTouch: FirstTouchSnapshot = {
      product: "glowlytics",
      acquisition_source: "google",
      acquisition_medium: "paid_search",
      attribution_model: "first_touch",
      attribution_quality: "utm",
      historical_backfill: false,
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "UV Launch",
      utm_term: "driver side",
      utm_content: "quiz-cta",
      google_click_id_present: true,
      referrer_host: "www.google.com",
      landing_path: "/uv-scan",
    };

    const token = await postLead("lead@example.com", "scan-1", "claim-1", {
      firstTouch,
      formPlacement: SOURCE,
      posthogSessionId: "0198b6bc-c2f8-7b5d-9e18-6c98232a1024",
    });

    assert.equal(token, "report-token");
    assert.deepEqual(requestBody(calls), {
      email: "lead@example.com",
      scan_id: "scan-1",
      claim_token: "claim-1",
      source: SOURCE,
      acquisition_source: "google",
      acquisition_medium: "paid_search",
      attribution_model: "first_touch",
      attribution_quality: "utm",
      form_placement: SOURCE,
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "UV Launch",
      utm_term: "driver side",
      utm_content: "quiz-cta",
      google_click_id_present: true,
      referrer_host: "www.google.com",
      landing_path: "/uv-scan",
      posthog_session_id: "0198b6bc-c2f8-7b5d-9e18-6c98232a1024",
    });
  });

  it("degrades safely when attribution is unavailable", async () => {
    const calls = recordLeadRequests();

    await postLead("lead@example.com", "scan-1", "claim-1", {
      firstTouch: null,
      formPlacement: SOURCE,
    });

    const body = requestBody(calls);
    assert.deepEqual(body, {
      email: "lead@example.com",
      scan_id: "scan-1",
      claim_token: "claim-1",
      source: SOURCE,
      acquisition_source: "unknown",
      acquisition_medium: "unknown",
      attribution_model: "first_touch",
      attribution_quality: "unknown",
      form_placement: SOURCE,
      google_click_id_present: false,
    });
    assert.equal(Object.prototype.hasOwnProperty.call(body, "posthog_distinct_id"), false);
    assert.equal(JSON.stringify(body).match(/lead@example\.com/g)?.length, 1);
  });

  it("drops a malformed session ID instead of forwarding account-like input", async () => {
    const calls = recordLeadRequests();

    await postLead("lead@example.com", "scan-1", "claim-1", {
      firstTouch: null,
      formPlacement: SOURCE,
      posthogSessionId: "glowlytics:user:user_123",
    });

    assert.equal(
      Object.prototype.hasOwnProperty.call(requestBody(calls), "posthog_session_id"),
      false,
    );
  });
});
