import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWaitlistSubmittedProperties, shouldCaptureWaitlistSubmitted, normalizeFormPlacement } from "../WaitlistForm";

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

  it("builds the canonical waitlist_submitted property set without email", () => {
    const properties = buildWaitlistSubmittedProperties({
      email: "lead@example.com",
      product: "glowlytics",
      acquisition_source: "google",
      acquisition_medium: "paid_search",
      attribution_model: "first_touch",
      attribution_quality: "utm",
      historical_backfill: false,
      form_placement: "footer",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "LaunchWave",
      utm_term: null,
      utm_content: null,
      google_click_id_present: true,
      referrer_host: "www.google.com",
      landing_path: "/uv-scan",
      posthog_distinct_id: "0190-browser-id",
    });

    assert.deepEqual(properties, {
      product: "glowlytics",
      acquisition_source: "google",
      acquisition_medium: "paid_search",
      attribution_model: "first_touch",
      attribution_quality: "utm",
      historical_backfill: false,
      form_placement: "footer",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "LaunchWave",
      utm_term: null,
      utm_content: null,
      google_click_id_present: true,
      referrer_host: "www.google.com",
      landing_path: "/uv-scan",
    });
    assert.equal(Object.prototype.hasOwnProperty.call(properties, "email"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(properties, "posthog_distinct_id"), false);
  });
});
