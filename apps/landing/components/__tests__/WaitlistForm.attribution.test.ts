import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeFormPlacement } from "../WaitlistForm";

describe("WaitlistForm attribution helpers", () => {

  it("maps known UI placements and rejects arbitrary source strings", () => {
    assert.equal(normalizeFormPlacement("hero"), "hero");
    assert.equal(normalizeFormPlacement("final-cta"), "footer");
    assert.equal(normalizeFormPlacement("blog-newsletter"), "footer");
    assert.equal(normalizeFormPlacement("uv-scan-web"), "unknown");
    assert.equal(normalizeFormPlacement("source=google"), "unknown");
  });

});
