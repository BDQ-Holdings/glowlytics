import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bucketCount, rateLimited as waitlistRateLimited } from "../waitlist.js";
import { resolveTrackSalt, rateLimited as trackRateLimited } from "../track.js";

// Minimal in-memory stand-in for a Cloudflare KVNamespace: records puts so we
// can assert the TTL and that a blocked request performs no write.
function fakeKV() {
  const store = new Map<string, string>();
  const puts: Array<{ key: string; value: string; ttl?: number }> = [];
  return {
    store,
    puts,
    async get(key: string): Promise<string | null> {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
      store.set(key, value);
      puts.push({ key, value, ttl: opts?.expirationTtl });
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

describe("rateLimited (LND-03) — waitlist copy", () => {
  it("fails closed when RATE_LIMIT_KV is unbound", async () => {
    const env = { WAITLIST_DB: {} } as never;
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 1), true);
  });

  it("allows up to the cap, then blocks; writes carry a ~25h TTL", async () => {
    const kv = fakeKV();
    const env = { WAITLIST_DB: {}, RATE_LIMIT_KV: kv } as never;
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 2), false); // 0 -> 1
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 2), false); // 1 -> 2
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 2), true); // 2 >= 2
    assert.equal(kv.puts.length, 2); // the blocked request performs no write
    assert.equal(kv.puts.at(-1)?.ttl, 90000);
  });

  it("keys counters per IP independently", async () => {
    const kv = fakeKV();
    const env = { WAITLIST_DB: {}, RATE_LIMIT_KV: kv } as never;
    assert.equal(await waitlistRateLimited(env, reqFrom("9.9.9.9"), "waitlist", 1), false);
    assert.equal(await waitlistRateLimited(env, reqFrom("9.9.9.9"), "waitlist", 1), true);
    assert.equal(await waitlistRateLimited(env, reqFrom("8.8.8.8"), "waitlist", 1), false);
  });

  it("keys counters per bucket independently", async () => {
    const kv = fakeKV();
    const env = { WAITLIST_DB: {}, RATE_LIMIT_KV: kv } as never;
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 1), false);
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 1), true);
    // Same IP, different bucket -> fresh counter.
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "track", 1), false);
  });

  it("treats a corrupt counter value as zero rather than hard-failing", async () => {
    const kv = fakeKV();
    const day = new Date().toISOString().slice(0, 10);
    kv.store.set(`rl:waitlist:${day}:1.2.3.4`, "not-a-number");
    const env = { WAITLIST_DB: {}, RATE_LIMIT_KV: kv } as never;
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 5), false);
  });
  it("fails closed when KV cannot read the counter", async () => {
    const kv = {
      async get(): Promise<string | null> {
        throw new Error("KV unavailable");
      },
      async put(): Promise<void> {},
    };
    const env = { WAITLIST_DB: {}, RATE_LIMIT_KV: kv } as never;
    assert.equal(await waitlistRateLimited(env, reqFrom("1.2.3.4"), "waitlist", 5), true);
  });

});

describe("rateLimited (LND-03) — track copy", () => {
  it("fails closed when RATE_LIMIT_KV is unbound", async () => {
    const env = { WAITLIST_DB: {} } as never;
    assert.equal(await trackRateLimited(env, reqFrom("5.5.5.5"), "track", 1), true);
  });

  it("blocks once the cap is exceeded", async () => {
    const kv = fakeKV();
    const env = { WAITLIST_DB: {}, RATE_LIMIT_KV: kv } as never;
    assert.equal(await trackRateLimited(env, reqFrom("5.5.5.5"), "track", 1), false);
    assert.equal(await trackRateLimited(env, reqFrom("5.5.5.5"), "track", 1), true);
  });
  it("fails closed when KV cannot write the counter", async () => {
    const kv = {
      async get(): Promise<string | null> {
        return null;
      },
      async put(): Promise<void> {
        throw new Error("KV unavailable");
      },
    };
    const env = { WAITLIST_DB: {}, RATE_LIMIT_KV: kv } as never;
    assert.equal(await trackRateLimited(env, reqFrom("5.5.5.5"), "track", 1), true);
  });

});
