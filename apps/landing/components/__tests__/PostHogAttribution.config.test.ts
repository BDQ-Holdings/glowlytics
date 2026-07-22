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
