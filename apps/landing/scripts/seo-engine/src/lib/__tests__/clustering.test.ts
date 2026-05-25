import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clusterKeywords, PaaLookup } from "../clustering.js";

// Disable network-based embedding pass for unit tests — we only care about
// lexical behavior + the PAA-lookup-fix here.
process.env.SEO_DISABLE_EMBEDDINGS = "1";

describe("PaaLookup", () => {
  it("returns PAA for keywords that contain a seed token", () => {
    const map = new Map<string, string[]>([
      ["acne", ["why do i get acne", "is acne genetic"]],
      ["redness", ["what causes redness"]],
    ]);
    const lookup = new PaaLookup(map);

    // Direct match on a seed.
    assert.deepEqual(lookup.lookupForKeyword("acne").sort(), [
      "is acne genetic",
      "why do i get acne",
    ]);

    // Substring match: previously this returned [] because paaMap was keyed
    // only by seed strings.
    const cysticAcne = lookup.lookupForKeyword("cystic acne in adults");
    assert.ok(cysticAcne.includes("why do i get acne"));

    // No seed in keyword → no PAA.
    assert.deepEqual(lookup.lookupForKeyword("hyaluronic acid serum"), []);
  });
});

describe("clusterKeywords", () => {
  it("groups near-duplicate keywords lexically", async () => {
    const keywords = [
      "hormonal acne",
      "hormonal acne treatment",
      "hormonal acne adults",
      "skin barrier",
      "skin barrier repair",
    ];
    const clusters = await clusterKeywords(keywords, new Map());

    assert.equal(clusters.length, 2);
    const acneCluster = clusters.find((c) => c.slug.includes("hormonal-acne"));
    const barrierCluster = clusters.find((c) => c.slug.includes("skin-barrier"));
    assert.ok(acneCluster);
    assert.ok(barrierCluster);
    assert.ok(acneCluster!.relatedKeywords.length >= 1);
    assert.ok(barrierCluster!.relatedKeywords.length >= 1);
  });

  it("populates paaQuestions from substring lookup, not just exact seed match", async () => {
    const paaMap = new Map<string, string[]>([
      ["acne", ["what causes acne", "how to clear acne fast"]],
    ]);
    const clusters = await clusterKeywords(
      ["hormonal acne", "hormonal acne treatment"],
      paaMap
    );

    assert.equal(clusters.length, 1);
    assert.ok(
      clusters[0].paaQuestions.length >= 2,
      `expected PAA to flow through, got ${JSON.stringify(clusters[0].paaQuestions)}`
    );
  });
});
