import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterKeywords, isAllowedKeyword, normalizeKeyword } from "../keyword-filter.js";

describe("normalizeKeyword", () => {
  it("lowercases, folds smart quotes, drops non-ascii", () => {
    assert.equal(normalizeKeyword("  What\u2019s Acné?  "), "what's acne?");
  });

  it("collapses whitespace", () => {
    assert.equal(normalizeKeyword("hello   world\nfoo"), "hello world foo");
  });
});

describe("isAllowedKeyword", () => {
  it("rejects short, empty, all-numeric, and oversize keywords", () => {
    assert.equal(isAllowedKeyword(""), false);
    assert.equal(isAllowedKeyword("a"), false);
    assert.equal(isAllowedKeyword("1234"), false);
    assert.equal(isAllowedKeyword("a".repeat(81)), false);
    assert.equal(isAllowedKeyword("one two three four five six seven eight nine"), false);
  });

  it("respects the banned-keywords data file", () => {
    // Patterns we know are in data/banned-keywords.json.
    assert.equal(isAllowedKeyword("acne near me"), false);
    assert.equal(isAllowedKeyword("cerave moisturizer review"), false);
    assert.equal(isAllowedKeyword("acne icd 10"), false);
  });

  it("allows clean dermatology queries", () => {
    assert.equal(isAllowedKeyword("hormonal acne in adults"), true);
    assert.equal(isAllowedKeyword("what causes redness"), true);
  });
});

describe("filterKeywords", () => {
  it("normalizes, filters, and dedupes", () => {
    const out = filterKeywords([
      "What\u2019s acne?",
      "what's acne?",
      "acne near me",
      "best skin care routine",
    ]);
    assert.deepEqual(out.sort(), ["best skin care routine", "what's acne?"].sort());
  });
});
