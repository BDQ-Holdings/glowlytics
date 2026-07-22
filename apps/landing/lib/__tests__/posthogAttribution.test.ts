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

  it("classifies explicit Facebook UTM aliases before generic referral fallback", () => {
    const cases = [
      { utmSource: "facebook", expectedMedium: "organic_social" },
      { utmSource: "fb", expectedMedium: "organic_social" },
      { utmSource: "meta_facebook", expectedMedium: "organic_social" },
      { utmSource: "facebook", utmMedium: "paid_social", expectedMedium: "paid_social" },
    ];

    for (const testCase of cases) {
      const result = classifyFirstTouch(testCase);
      assert.equal(result.acquisition_source, "facebook");
      assert.equal(result.acquisition_medium, testCase.expectedMedium);
      assert.equal(result.attribution_quality, "utm");
    }
  });

  it("classifies Facebook campaign, medium, and referrer signals", () => {
    const campaign = classifyFirstTouch({ utmCampaign: "Facebook Launch" });
    assert.equal(campaign.acquisition_source, "facebook");
    assert.equal(campaign.acquisition_medium, "organic_social");
    assert.equal(campaign.attribution_quality, "utm");

    const paidMedium = classifyFirstTouch({ utmMedium: "Paid Facebook" });
    assert.equal(paidMedium.acquisition_source, "facebook");
    assert.equal(paidMedium.acquisition_medium, "paid facebook");
    assert.equal(paidMedium.attribution_quality, "utm");

    for (const referrerHost of ["facebook.com", "www.facebook.com", "m.facebook.com"]) {
      const result = classifyFirstTouch({ referrerHost });
      assert.equal(result.acquisition_source, "facebook");
      assert.equal(result.acquisition_medium, "organic_social");
      assert.equal(result.attribution_quality, "referrer");
    }
  });

  it("maps remaining usable UTM signals to referral instead of direct", () => {
    const partner = classifyFirstTouch({ utmSource: "newsletter_partner", utmMedium: "email" });
    assert.equal(partner.acquisition_source, "referral");
    assert.equal(partner.acquisition_medium, "email");
    assert.equal(partner.attribution_quality, "utm");
    assert.equal(classifyFirstTouch({ utmSource: "meta", utmMedium: "paid_social" }).acquisition_source, "referral");
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
