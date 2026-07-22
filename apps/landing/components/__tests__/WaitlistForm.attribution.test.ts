import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWaitlistAttribution, normalizeFormPlacement } from "../WaitlistForm";

describe("WaitlistForm attribution helpers", () => {

  it("maps known UI placements and rejects arbitrary source strings", () => {
    assert.equal(normalizeFormPlacement("hero"), "hero");
    assert.equal(normalizeFormPlacement("final-cta"), "footer");
    assert.equal(normalizeFormPlacement("blog-newsletter"), "footer");
    assert.equal(normalizeFormPlacement("uv-scan-web"), "unknown");
    assert.equal(normalizeFormPlacement("source=google"), "unknown");
  });

  it("adds a valid PostHog session ID as non-identity submission metadata", () => {
    const attribution = buildWaitlistAttribution(
      "hero",
      "0198b6bc-c2f8-7b5d-9e18-6c98232a1024",
    );

    assert.equal(attribution.posthog_session_id, "0198b6bc-c2f8-7b5d-9e18-6c98232a1024");
    assert.equal(Object.prototype.hasOwnProperty.call(attribution, "$session_id"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(attribution, "posthog_distinct_id"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(attribution, "distinct_id"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(attribution, "account_alias"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(attribution, "lead_alias"), false);
  });

  it("drops malformed PostHog session IDs before submission", () => {
    for (const value of [
      "0198b6bc-c2f8-6b5d-9e18-6c98232a1024",
      "0198b6bc-c2f8-7b5d-7e18-6c98232a1024",
      "0198b6bcc2f87b5d9e186c98232a1024",
      "0198b6bc-c2f8-7b5d-9e18-6c98232a1024-extra",
      "glowlytics:user:user_123",
      "",
    ]) {
      const attribution = buildWaitlistAttribution("hero", value);
      assert.equal(Object.prototype.hasOwnProperty.call(attribution, "posthog_session_id"), false);
    }
  });

});
