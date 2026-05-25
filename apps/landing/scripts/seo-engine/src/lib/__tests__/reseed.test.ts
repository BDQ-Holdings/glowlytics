import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseCsv, parseGscCsv } from "../../reseed.js";

describe("parseCsv", () => {
  it("handles RFC-4180 quoted commas and double-quote escapes", () => {
    const rows = parseCsv(
      'Top queries,Clicks,Impressions\n"oily, combination skin",4,200\n"she said ""hi""",1,50\n'
    );
    assert.deepEqual(rows, [
      ["Top queries", "Clicks", "Impressions"],
      ["oily, combination skin", "4", "200"],
      ['she said "hi"', "1", "50"],
    ]);
  });

  it("skips blank lines and handles CRLF", () => {
    const rows = parseCsv("a,b\r\n\r\n1,2\r\n");
    assert.deepEqual(rows, [
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseGscCsv", () => {
  it("ingests a typical GSC export and tolerates percent / comma formatting", () => {
    const tmp = path.join(os.tmpdir(), `gsc-${Date.now()}.csv`);
    fs.writeFileSync(
      tmp,
      [
        "Top queries,Clicks,Impressions,CTR,Position",
        '"hormonal acne in adults",12,"1,240","0.97%",11.2',
        '"vitamin c serum for sensitive skin",0,420,"0.00%",17.8',
      ].join("\n")
    );

    try {
      const rows = parseGscCsv(tmp);
      assert.equal(rows.length, 2);
      assert.equal(rows[0].query, "hormonal acne in adults");
      assert.equal(rows[0].clicks, 12);
      assert.equal(rows[0].impressions, 1240);
      assert.ok(rows[0].ctr > 0.9 && rows[0].ctr < 1.0);
      assert.equal(rows[0].position, 11.2);

      assert.equal(rows[1].clicks, 0);
      assert.equal(rows[1].impressions, 420);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
