/**
 * Security hardening regression tests — BACKEND findings B1, B3, B4, B5, B6.
 *
 * Mirrors the mocking harness of uv-endpoints.test.js (pg / openai / rag and
 * the four UV modules are all stubbed) so requiring ../app never opens a real
 * connection, and each test drives the query/loops returns it needs.
 *
 * B2 (SSE error leak) lives in security-backend-sse.test.js because it must run
 * with NODE_ENV=production behind a verified-JWT path, which conflicts with the
 * development-mode passthrough the rest of these tests rely on.
 */

process.env.NODE_ENV = 'development';
delete process.env.CLERK_SECRET_KEY; // B4: ensure the unverified path by default
// Auth fails closed whenever an issuer is configured (even in development) —
// clear any issuer leaked by an earlier test file (jest shares process.env
// across files at maxWorkers=1). Set '' (not delete): app.js's dotenv would
// re-inject a developer's .env CLERK_ISSUER_URL into a deleted slot.
process.env.CLERK_ISSUER_URL = '';

const mockQuery = jest.fn();
jest.mock('pg', () => {
  const mockPool = { query: (...args) => mockQuery(...args) };
  return { Pool: jest.fn(() => mockPool) };
});

jest.mock('openai', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../rag', () => ({
  seedGuidelines: jest.fn(),
  queryGuidelines: jest.fn().mockResolvedValue([]),
  queryGuidelinesMulti: jest.fn().mockResolvedValue([]),
}));

jest.mock('../uv-scan', () => ({
  screenImage: jest.fn(),
  analyzeUv: jest.fn(),
}));
jest.mock('../loops', () => ({
  loopsEnabled: jest.fn(),
  sendEvent: jest.fn(),
  updateContact: jest.fn(),
}));
jest.mock('../uv-report', () => ({
  buildReportPdf: jest.fn(),
}));
jest.mock('../queries/uv', () => ({
  insertScan: jest.fn(),
  getScan: jest.fn(),
  claimScan: jest.fn(),
  upsertLead: jest.fn(),
  getLeadByEmail: jest.fn(),
  getLeadByToken: jest.fn(),
  markCustomer: jest.fn(),
}));

jest.mock('../posthog', () => {
  const actual = jest.requireActual('../posthog');
  return {
    ...actual,
    captureAccountCreated: jest.fn().mockResolvedValue(undefined),
    captureWaitlistSubmitted: jest.fn().mockResolvedValue(undefined),
  };
});

const request = require('supertest');
const app = require('../app');
const uvScan = require('../uv-scan');
const loops = require('../loops');
const uvQueries = require('../queries/uv');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.CLERK_SECRET_KEY;
});

// ==================== B1: claim_token capability binding (UV lead IDOR) ====

describe('B1 — /api/uv/analyze issues a claim_token', () => {
  const analysis = {
    overall: { sunDamageScore: 42, severity: 'moderate', confidence: 0.8 },
    heatmap: { cols: 1, rows: 1, bounds: { x: 0, y: 0, w: 1, h: 1 }, cells: [0.1] },
    regions: [],
    asymmetry: { score: 10, dominantSide: 'balanced', leftMean: 0.3, rightMean: 0.3, perRegionDelta: [] },
    screener: { ok: true, canProceed: true, confidence: 0.8, checks: [] },
  };

  test('200 returns a hex claim_token and persists the SAME token', async () => {
    uvScan.analyzeUv.mockResolvedValue(analysis);
    uvQueries.insertScan.mockResolvedValue({ id: 'persisted', created_at: '2026-06-27T00:00:00.000Z' });

    const res = await request(app).post('/api/uv/analyze').send({ image_base64: 'abc', source: 'test' });

    expect(res.status).toBe(200);
    expect(res.body.claim_token).toMatch(/^[0-9a-f]{32}$/);
    const [, scanArg] = uvQueries.insertScan.mock.calls[0];
    expect(scanArg.claim_token).toBe(res.body.claim_token);
  });
});

describe('B1 — /api/uv/lead enforces the claim_token binding', () => {
  const baseScan = { id: 'scan1', overall: {}, asymmetry: {} };

  test('happy path: correct token claims the report (200)', async () => {
    uvQueries.getScan.mockResolvedValue({ ...baseScan, claim_token: 'TOK', claimed: false });
    uvQueries.getLeadByEmail.mockResolvedValue(null);
    uvQueries.upsertLead.mockResolvedValue({
      id: '152605c9-cf42-449a-9b71-f9d731ff1856',
      email: 'a@b.com',
      report_token: 'rt1',
      scan_id: 'scan1',
      created_at: '2026-07-21T12:00:00.000Z',
    });
    uvQueries.claimScan.mockResolvedValue({ id: 'scan1', claimed: true });
    loops.sendEvent.mockResolvedValue({ skipped: true });

    const res = await request(app)
      .post('/api/uv/lead')
      .send({ email: 'a@b.com', scan_id: 'scan1', claim_token: 'TOK' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, report_token: 'rt1' });
    expect(uvQueries.upsertLead).toHaveBeenCalledTimes(1);
  });

  test('wrong token on a token-bearing scan → 403, no lead written', async () => {
    uvQueries.getScan.mockResolvedValue({ ...baseScan, claim_token: 'TOK', claimed: false });

    const res = await request(app)
      .post('/api/uv/lead')
      .send({ email: 'attacker@b.com', scan_id: 'scan1', claim_token: 'WRONG' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'invalid claim token' });
    expect(uvQueries.upsertLead).not.toHaveBeenCalled();
    expect(uvQueries.claimScan).not.toHaveBeenCalled();
  });

  test('absent token on a token-bearing scan → 403', async () => {
    uvQueries.getScan.mockResolvedValue({ ...baseScan, claim_token: 'TOK', claimed: false });

    const res = await request(app)
      .post('/api/uv/lead')
      .send({ email: 'attacker@b.com', scan_id: 'scan1' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'invalid claim token' });
    expect(uvQueries.upsertLead).not.toHaveBeenCalled();
  });

  test('second claim of an already-claimed scan by a DIFFERENT email → 409', async () => {
    // Same client holds the correct token but tries a different email.
    uvQueries.getScan.mockResolvedValue({ ...baseScan, claim_token: 'TOK', claimed: true });
    uvQueries.getLeadByEmail.mockResolvedValue(null); // the new email has no lead yet

    const res = await request(app)
      .post('/api/uv/lead')
      .send({ email: 'second@b.com', scan_id: 'scan1', claim_token: 'TOK' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'scan already claimed' });
    expect(uvQueries.upsertLead).not.toHaveBeenCalled();
  });

  test('same-email re-claim is idempotent → 200 with the original token', async () => {
    uvQueries.getScan.mockResolvedValue({ ...baseScan, claim_token: 'TOK', claimed: true });
    uvQueries.getLeadByEmail.mockResolvedValue({ email: 'a@b.com', scan_id: 'scan1', report_token: 'rt1' });
    uvQueries.upsertLead.mockResolvedValue({
      id: '152605c9-cf42-449a-9b71-f9d731ff1856',
      email: 'a@b.com',
      report_token: 'rt1',
      scan_id: 'scan1',
      created_at: '2026-07-21T12:00:00.000Z',
    });
    uvQueries.claimScan.mockResolvedValue({ id: 'scan1', claimed: true });
    loops.sendEvent.mockResolvedValue({ skipped: true });

    const res = await request(app)
      .post('/api/uv/lead')
      .send({ email: 'a@b.com', scan_id: 'scan1', claim_token: 'TOK' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, report_token: 'rt1' });
  });

  test('legacy scan (null claim_token) stays claimable → 200', async () => {
    uvQueries.getScan.mockResolvedValue({ ...baseScan, claim_token: null, claimed: false });
    uvQueries.getLeadByEmail.mockResolvedValue(null);
    uvQueries.upsertLead.mockResolvedValue({
      id: '152605c9-cf42-449a-9b71-f9d731ff1856',
      email: 'a@b.com',
      report_token: 'rtLegacy',
      scan_id: 'scan1',
      created_at: '2026-07-21T12:00:00.000Z',
    });
    uvQueries.claimScan.mockResolvedValue({ id: 'scan1', claimed: true });
    loops.sendEvent.mockResolvedValue({ skipped: true });

    const res = await request(app)
      .post('/api/uv/lead')
      .send({ email: 'a@b.com', scan_id: 'scan1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, report_token: 'rtLegacy' });
  });
});

// ==================== B3: authorizeUser fails closed ====================

describe('B3 — authorizeUser fail-closed', () => {
  test('req.auth undefined → returns false and 403 (fail closed)', () => {
    const req = {}; // bypassed authMiddleware entirely
    let statusCode;
    let payload;
    const res = {
      status(c) { statusCode = c; return this; },
      json(p) { payload = p; return this; },
    };

    const result = app._authorizeUser(req, res, 'someUser');

    expect(result).toBe(false);
    expect(statusCode).toBe(403);
    expect(payload).toEqual({ error: 'Access denied' });
  });

  test('matching req.auth.userId → returns true, no 403', () => {
    const req = { auth: { userId: 'u1' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    expect(app._authorizeUser(req, res, 'u1')).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('mismatched req.auth.userId → returns false and 403', () => {
    const req = { auth: { userId: 'u1' } };
    let statusCode;
    const res = { status(c) { statusCode = c; return this; }, json() { return this; } };

    expect(app._authorizeUser(req, res, 'other')).toBe(false);
    expect(statusCode).toBe(403);
  });
});

// ==================== B4: convert never binds body.email unverified ========

describe('B4 — convertUvLeadToCustomer ignores body.email when CLERK_SECRET_KEY unset', () => {
  test('POST /api/users with a victim body.email does NOT convert/markCustomer', async () => {
    delete process.env.CLERK_SECRET_KEY; // cannot verify ownership
    mockQuery.mockResolvedValue({ rows: [{ user_id: 'dev-user', age_range: '25-34' }] });

    const res = await request(app)
      .post('/api/users')
      .send({ age_range: '25-34', location_coarse: 'US-CA', email: 'victim@example.com' });

    expect(res.status).toBe(201);
    expect(uvQueries.markCustomer).not.toHaveBeenCalled();
    expect(loops.sendEvent).not.toHaveBeenCalled();
  });
});

// ==================== B5: trial dates no longer client-writable ===========

describe('B5 — PATCH /api/users/:id drops trial_start_date / trial_end_date', () => {
  test('body with only trial_end_date → 400 (no whitelisted fields)', async () => {
    const res = await request(app)
      .patch('/api/users/dev-user')
      .send({ trial_end_date: '2099-01-01', trial_start_date: '2099-01-01' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'No valid fields to update' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('trial_end_date is stripped while a benign field still updates', async () => {
    mockQuery.mockResolvedValue({ rows: [{ user_id: 'dev-user', onboarding_complete: true }] });

    const res = await request(app)
      .patch('/api/users/dev-user')
      .send({ onboarding_complete: true, trial_end_date: '2099-01-01' });

    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('onboarding_complete');
    expect(sql).not.toContain('trial_end_date');
    expect(params).toEqual(['dev-user', true]);
  });
});

// ==================== B6: oversized image guard on UV endpoints ===========

describe('B6 — oversized image_base64 rejected with 413', () => {
  const huge = 'a'.repeat(15 * 1024 * 1024 + 10); // just over the 15MB cap

  test('/api/uv/screen → 413, screenImage never called', async () => {
    const res = await request(app).post('/api/uv/screen').send({ image_base64: huge });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Image too large (max 15MB)' });
    expect(uvScan.screenImage).not.toHaveBeenCalled();
  });

  test('/api/uv/analyze → 413, analyzeUv never called', async () => {
    const res = await request(app).post('/api/uv/analyze').send({ image_base64: huge });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Image too large (max 15MB)' });
    expect(uvScan.analyzeUv).not.toHaveBeenCalled();
  });

  test('normal-size image still passes the guard (/api/uv/screen 200)', async () => {
    uvScan.screenImage.mockResolvedValue({ ok: true, canProceed: true, confidence: 0.9, checks: [] });

    const res = await request(app).post('/api/uv/screen').send({ image_base64: 'abc' });

    expect(res.status).toBe(200);
    expect(uvScan.screenImage).toHaveBeenCalledTimes(1);
  });
});

// ==================== Waitlist rate limiting (public, DB-writing) ==========

describe('waitlist endpoints are rate-limited per IP', () => {
  beforeEach(() => {
    app._resetRateLimiters();
    mockQuery.mockImplementation(async (sql) => (
      /INSERT INTO waitlist/.test(sql)
        ? {
            rows: [{
              id: '66fd1965-6388-4071-9e50-382223698678',
              source: 'landing',
              created_at: '2026-07-21T12:00:00.000Z',
            }],
            rowCount: 1,
          }
        : { rows: [{ count: '0' }] }
    ));
  });
  afterEach(() => {
    app._resetRateLimiters(); // don't leak a hot limiter into other describes
  });

  test('POST /api/waitlist bursts past the per-IP window → 429 without hitting the DB', async () => {
    // detectRateLimit allows 10 requests / 10s / IP; the 11th must 429.
    for (let i = 0; i < 10; i++) {
      const ok = await request(app).post('/api/waitlist').send({ email: `w${i}@example.com` });
      expect(ok.status).toBe(200);
    }
    const queriesBefore = mockQuery.mock.calls.length;
    const blocked = await request(app).post('/api/waitlist').send({ email: 'w11@example.com' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/rate limit/i);
    expect(mockQuery.mock.calls.length).toBe(queriesBefore); // limiter fired before the handler
  });

  test('GET /api/waitlist/count shares the same per-IP limiter', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).get('/api/waitlist/count').expect(200);
    }
    await request(app).get('/api/waitlist/count').expect(429);
  });
});

// ==================== /health model visibility =============================

describe('GET /health reports loaded models without gating on them', () => {
  test('200 with a models array even when no ONNX session is loaded', async () => {
    // signal-models is the REAL module here (unmocked); no initModels() has
    // run, so every session is null — /health must still be 200 (degraded,
    // not dead: Railway's healthcheck depends on it) and list zero models.
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.models).toEqual([]);
  });
});
