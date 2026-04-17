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
