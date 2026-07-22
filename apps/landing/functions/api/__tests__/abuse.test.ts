import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bucketCount, rateLimited as waitlistRateLimited } from "../waitlist.js";
import { resolveTrackSalt, rateLimited as trackRateLimited } from "../track.js";

// Minimal D1 stand-in that models the single-statement upsert atomically: the
// count changes before first() resolves, as it does inside SQLite.
function fakeD1(options: { fail?: boolean } = {}) {
  const counts = new Map<string, number>();
  const statements: string[] = [];
  return {
    counts,
    statements,
    prepare(sql: string) {
      statements.push(sql);
      return {
        bind(bucket: string, day: string, visitorHash: string, maxPerDay: number) {
          return {
            async first(): Promise<{ request_count: number } | null> {
              if (options.fail) throw new Error("D1 unavailable");
              assert.match(visitorHash, /^[0-9a-f]{64}$/);
              const key = `${bucket}:${day}:${visitorHash}`;
              const current = counts.get(key) ?? 0;
              if (current >= maxPerDay) return null;
              const requestCount = current + 1;
              counts.set(key, requestCount);
              return { request_count: requestCount };
            },
          };
        },
      };
    },
  };
}

const reqFrom = (ip: string, url = "https://example.com/api/x") =>
  new Request(url, { method: "POST", headers: { "cf-connecting-ip": ip } });

describe("bucketCount (LND-05)", () => {
  it("rounds a precise total down to the nearest 50", () => {
    assert.equal(bucketCount(0), 0);
    assert.equal(bucketCount(1), 0);
    assert.equal(bucketCount(49), 0);
    assert.equal(bucketCount(50), 50);
    assert.equal(bucketCount(99), 50);
    assert.equal(bucketCount(100), 100);
    assert.equal(bucketCount(137), 100);
  });

  it("clamps invalid / negative input to 0", () => {
    assert.equal(bucketCount(-5), 0);
    assert.equal(bucketCount(Number.NaN), 0);
    assert.equal(bucketCount(Number.POSITIVE_INFINITY), 0);
  });
});

describe("resolveTrackSalt (LND-08 fail-closed salt)", () => {
  it("returns the configured salt when TRACK_SALT is set", () => {
    const env = { WAITLIST_DB: {}, TRACK_SALT: "secret-salt" } as never;
    assert.equal(resolveTrackSalt(env), "secret-salt");
  });

  it("fails closed to a random 128-bit hex salt when unset (non-correlatable)", () => {
    const env = { WAITLIST_DB: {} } as never;
    const a = resolveTrackSalt(env);
    const b = resolveTrackSalt(env);
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.match(b, /^[0-9a-f]{32}$/);
    // Random per request: a missing salt must not be a stable, brute-forceable value.
    assert.notEqual(a, b);
  });
});

describe("rateLimited (LND-03) — waitlist export", () => {
  it("fails closed without the stable hashing secret", async () => {
    const env = { WAITLIST_DB: fakeD1() } as never;
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 1), true);
  });

  it("allows up to the cap, then blocks with one atomic upsert per request", async () => {
    const db = fakeD1();
    const env = { WAITLIST_DB: db, TRACK_SALT: "secret-salt" } as never;
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 2), false);
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 2), false);
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 2), true);
    assert.equal([...db.counts.values()][0], 2);
    assert.match(db.statements[0], /ON CONFLICT[\s\S]+WHERE[\s\S]+RETURNING/);
  });

  it("enforces the cap across concurrent requests", async () => {
    const db = fakeD1();
    const env = { WAITLIST_DB: db, TRACK_SALT: "secret-salt" } as never;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 2),
      ),
    );

    assert.equal(results.filter((limited) => !limited).length, 2);
    assert.equal(results.filter(Boolean).length, 6);
    assert.equal([...db.counts.values()][0], 2);
  });

  it("keys counters per IP and bucket without storing the raw IP", async () => {
    const db = fakeD1();
    const env = { WAITLIST_DB: db, TRACK_SALT: "secret-salt" } as never;
    assert.equal(await waitlistRateLimited(env, reqFrom("9.9.9.9"), "waitlist", 1), false);
    assert.equal(await waitlistRateLimited(env, reqFrom("9.9.9.9"), "waitlist", 1), true);
    assert.equal(await waitlistRateLimited(env, reqFrom("8.8.8.8"), "waitlist", 1), false);
    assert.equal(await waitlistRateLimited(env, reqFrom("9.9.9.9"), "track", 1), false);
    assert.equal(db.counts.size, 3);
    assert.equal([...db.counts.keys()].some((key) => key.includes("9.9.9.9")), false);
  });

  it("fails closed when D1 cannot consume the allowance", async () => {
    const env = {
      WAITLIST_DB: fakeD1({ fail: true }),
      TRACK_SALT: "secret-salt",
    } as never;
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 5), true);
  });
});

describe("rateLimited (LND-03) — track export", () => {
  it("enforces the cap across concurrent requests", async () => {
    const db = fakeD1();
    const env = { WAITLIST_DB: db, TRACK_SALT: "secret-salt" } as never;
    const results = await Promise.all(
      Array.from({ length: 8 }, () => trackRateLimited(env, reqFrom("5.5.5.5"), "track", 2)),
    );

    assert.equal(results.filter((limited) => !limited).length, 2);
    assert.equal(results.filter(Boolean).length, 6);
  });
});
