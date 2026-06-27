const express = require('express');
const request = require('supertest');

beforeEach(() => {
  jest.resetModules();
});

function buildApp() {
  const { mcpRateLimit, _resetRateLimitForTest } = require('../../mcp/rate-limit');
  _resetRateLimitForTest();
  const app = express();
  app.use((req, _res, next) => { req.userId = req.headers['x-test-user'] || null; next(); });
  app.get('/probe', mcpRateLimit, (_req, res) => res.json({ ok: true }));
  return app;
}

test('allows requests under the burst limit', async () => {
  const app = buildApp();
  for (let i = 0; i < 10; i++) {
    const res = await request(app).get('/probe').set('x-test-user', 'user_a');
    expect(res.status).toBe(200);
  }
});

test('rejects with 429 + retryAfter when burst (10/sec) is exceeded', async () => {
  const app = buildApp();
  for (let i = 0; i < 10; i++) {
    await request(app).get('/probe').set('x-test-user', 'user_a');
  }
  const res = await request(app).get('/probe').set('x-test-user', 'user_a');
  expect(res.status).toBe(429);
  expect(res.body.error).toBe('rate_limited');
  expect(typeof res.body.retryAfter).toBe('number');
  expect(res.body.retryAfter).toBeGreaterThan(0);
});

test('rejects when minute limit (60/min) is exceeded even if burst window has passed', async () => {
  const app = buildApp();
  let t = Date.now();
  jest.spyOn(Date, 'now').mockImplementation(() => t);

  for (let i = 0; i < 60; i++) {
    await request(app).get('/probe').set('x-test-user', 'user_a');
    t += 200;
  }
  const res = await request(app).get('/probe').set('x-test-user', 'user_a');
  expect(res.status).toBe(429);

  Date.now.mockRestore();
});

test('isolates per-user limits', async () => {
  const app = buildApp();
  for (let i = 0; i < 10; i++) {
    await request(app).get('/probe').set('x-test-user', 'user_a');
  }
  const aBlocked = await request(app).get('/probe').set('x-test-user', 'user_a');
  const bAllowed = await request(app).get('/probe').set('x-test-user', 'user_b');
  expect(aBlocked.status).toBe(429);
  expect(bAllowed.status).toBe(200);
});

test('returns 401 when req.userId is not set', async () => {
  const app = buildApp();
  const res = await request(app).get('/probe');
  expect(res.status).toBe(401);
});
// ---------------------------------------------------------------------------
// MCP-M2: the module-level bucket Map must not grow unbounded — a sweep evicts
// buckets whose burst+minute windows have both fully expired, while active
// users keep their bucket (and their limit).
// ---------------------------------------------------------------------------
function buildAppWithHandles() {
  const mod = require('../../mcp/rate-limit');
  mod._resetRateLimitForTest();
  const app = express();
  app.use((req, _res, next) => { req.userId = req.headers['x-test-user'] || null; next(); });
  app.get('/probe', mod.mcpRateLimit, (_req, res) => res.json({ ok: true }));
  return { app, ...mod };
}

test('M2: evicts a bucket after its window fully expires and a sweep runs', async () => {
  let t = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => t);
  const { app, sweepBuckets, _bucketsForTest } = buildAppWithHandles();

  await request(app).get('/probe').set('x-test-user', 'user_expire');
  expect(_bucketsForTest.has('user_expire')).toBe(true);

  // Advance well past the 60s minute window so both arrays are stale.
  t += 120_000;
  sweepBuckets();

  expect(_bucketsForTest.has('user_expire')).toBe(false);
  expect(_bucketsForTest.size).toBe(0);

  Date.now.mockRestore();
});

test('M2: a sweep keeps an active user bucket, which still limits at the threshold', async () => {
  let t = 2_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => t);
  const { app, sweepBuckets, _bucketsForTest } = buildAppWithHandles();

  // 5 requests within the burst window (all at the same instant).
  for (let i = 0; i < 5; i++) {
    const res = await request(app).get('/probe').set('x-test-user', 'user_active');
    expect(res.status).toBe(200);
  }

  // A sweep at the same instant must NOT evict an active bucket.
  sweepBuckets();
  expect(_bucketsForTest.has('user_active')).toBe(true);

  // Fill the rest of the burst budget (10 total); the 11th is rate-limited.
  for (let i = 0; i < 5; i++) {
    await request(app).get('/probe').set('x-test-user', 'user_active');
  }
  const limited = await request(app).get('/probe').set('x-test-user', 'user_active');
  expect(limited.status).toBe(429);
  expect(limited.body.error).toBe('rate_limited');
  expect(_bucketsForTest.has('user_active')).toBe(true);

  Date.now.mockRestore();
});

test('M2: an active bucket survives a sweep but is evicted once it expires', async () => {
  let t = 3_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => t);
  const { app, sweepBuckets, _bucketsForTest } = buildAppWithHandles();

  await request(app).get('/probe').set('x-test-user', 'user_a');
  await request(app).get('/probe').set('x-test-user', 'user_b');
  expect(_bucketsForTest.size).toBe(2);

  // user_a stays active inside the minute window; user_b goes idle.
  t += 30_000; // half a minute later
  await request(app).get('/probe').set('x-test-user', 'user_a');
  sweepBuckets();
  expect(_bucketsForTest.has('user_a')).toBe(true);
  expect(_bucketsForTest.has('user_b')).toBe(true); // user_b's minute window not yet expired

  // Now move past user_b's full window; user_a's last hit is still recent.
  t += 35_000; // user_b idle ~65s, user_a idle ~35s
  sweepBuckets();
  expect(_bucketsForTest.has('user_b')).toBe(false); // evicted
  expect(_bucketsForTest.has('user_a')).toBe(true);  // retained

  Date.now.mockRestore();
});
