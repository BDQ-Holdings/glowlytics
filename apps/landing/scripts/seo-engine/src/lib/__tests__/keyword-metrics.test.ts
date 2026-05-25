import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeOpportunityScore } from "../keyword-metrics.js";

describe("computeOpportunityScore", () => {
  it("falls back to PAA + related baseline when no metrics", () => {
    const score = computeOpportunityScore({
      relatedKeywordCount: 5,
      paaQuestionCount: 4,
    });
    // 1 + 5 + 4*2 = 14
    assert.equal(score, 14);
  });

  it("rewards search volume on a log scale", () => {
    const small = computeOpportunityScore({
      relatedKeywordCount: 0,
      paaQuestionCount: 0,
      metrics: {
        provider: "test",
        fetchedAt: "now",
        searchVolume: 100,
        keywordDifficulty: 0,
      },
    });
    const big = computeOpportunityScore({
      relatedKeywordCount: 0,
      paaQuestionCount: 0,
      metrics: {
        provider: "test",
        fetchedAt: "now",
        searchVolume: 100_000,
        keywordDifficulty: 0,
      },
    });
    assert.ok(big > small, `expected ${big} > ${small}`);
    // Log10 difference ≈ 3 orders → roughly 36 raw points apart at *12.
    assert.ok(big - small > 20);
  });

  it("penalizes high keyword difficulty", () => {
    const easy = computeOpportunityScore({
      relatedKeywordCount: 0,
      paaQuestionCount: 0,
      metrics: {
        provider: "test",
        fetchedAt: "now",
        searchVolume: 1000,
        keywordDifficulty: 5,
      },
    });
    const hard = computeOpportunityScore({
      relatedKeywordCount: 0,
      paaQuestionCount: 0,
      metrics: {
        provider: "test",
        fetchedAt: "now",
        searchVolume: 1000,
        keywordDifficulty: 95,
      },
    });
    assert.ok(easy > hard, `expected easy ${easy} > hard ${hard}`);
  });

  it("penalizes high commercial competition softly", () => {
    const lowCompete = computeOpportunityScore({
      relatedKeywordCount: 0,
      paaQuestionCount: 0,
      metrics: { provider: "test", fetchedAt: "now", searchVolume: 1000, competition: 0 },
    });
    const highCompete = computeOpportunityScore({
      relatedKeywordCount: 0,
      paaQuestionCount: 0,
      metrics: { provider: "test", fetchedAt: "now", searchVolume: 1000, competition: 1 },
    });
    assert.ok(lowCompete > highCompete);
    // Soft penalty (max 4).
    assert.ok(lowCompete - highCompete <= 4 + 0.01);
  });
});
