/**
 * UV Mirror endpoints — integration tests (supertest).
 *
 * The vision core, Loops client, PDF generator, and query helpers are all
 * mocked: these tests pin app.js's wiring contract (status codes, validation,
 * persistence calls, Loops side effects, lead -> customer conversion) — NOT the
 * behaviour of the underlying modules, which have their own suites.
 *
 * pg / openai / rag are mocked exactly like the other endpoint suites so
 * requiring ../app never opens a real connection or loads a model.
 */

process.env.NODE_ENV = 'development';
// Auth fails closed when an issuer is configured. Set '' (not delete): jest
// shares process.env across files (maxWorkers=1) and app.js's dotenv would
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

// The four UV modules app.js integrates. Factory mocks keep the suite fast and
// deterministic (no sharp / pdfkit / network) and let each test drive returns.
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

const request = require('supertest');
const app = require('../app');
const uvScan = require('../uv-scan');
const loops = require('../loops');
const uvReport = require('../uv-report');
const uvQueries = require('../queries/uv');

// Error carrying the code app.js maps on (UV_UNUSABLE / UV_BAD_IMAGE).
function uvError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/uv/screen', () => {
  test('200 returns the screenImage result', async () => {
    const screen = { ok: true, canProceed: true, confidence: 0.9, checks: [] };
    uvScan.screenImage.mockResolvedValue(screen);

    const res = await request(app)
      .post('/api/uv/screen')
      .send({ image_base64: 'abc', landmarks: { foo: 1 } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(screen);
    expect(uvScan.screenImage).toHaveBeenCalledWith('abc', { foo: 1 });
  });

  test('400 when image_base64 missing', async () => {
    const res = await request(app).post('/api/uv/screen').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'image_base64 required' });
    expect(uvScan.screenImage).not.toHaveBeenCalled();
  });

  test('400 when screenImage throws UV_BAD_IMAGE', async () => {
    uvScan.screenImage.mockRejectedValue(uvError('UV_BAD_IMAGE', 'undecodable image'));

    const res = await request(app).post('/api/uv/screen').send({ image_base64: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'undecodable image' });
  });
});

describe('POST /api/uv/analyze', () => {
  const analysis = {
    overall: { sunDamageScore: 42, severity: 'moderate', confidence: 0.8 },
    heatmap: { cols: 2, rows: 2, bounds: { x: 0, y: 0, w: 1, h: 1 }, cells: [0, 0.1, 0.2, 0.3] },
    regions: [{ id: 'forehead', label: 'Forehead', side: 'center', score: 40, intensity: 0.4, spotCount: 2, polygon: [] }],
    asymmetry: { score: 10, dominantSide: 'balanced', leftMean: 0.3, rightMean: 0.3, perRegionDelta: [] },
    screener: { ok: true, canProceed: true, confidence: 0.8, checks: [] },
    landmarksUsed: true,
  };

  test('200 persists the scan and returns scan_id + analysis', async () => {
    uvScan.analyzeUv.mockResolvedValue(analysis);
    uvQueries.insertScan.mockResolvedValue({ id: 'persisted', created_at: '2026-06-26T00:00:00.000Z' });

    const res = await request(app)
      .post('/api/uv/analyze')
      .send({ image_base64: 'abc', source: 'test' });

    expect(res.status).toBe(200);
    expect(typeof res.body.scan_id).toBe('string');
    expect(res.body.created_at).toBe('2026-06-26T00:00:00.000Z');
    expect(res.body.overall).toEqual(analysis.overall);
    expect(res.body.heatmap).toEqual(analysis.heatmap);
    expect(res.body.regions).toEqual(analysis.regions);
    expect(res.body.asymmetry).toEqual(analysis.asymmetry);
    expect(res.body.screener).toEqual(analysis.screener);

    expect(uvScan.analyzeUv).toHaveBeenCalledWith('abc', { landmarks: undefined, source: 'test' });
    expect(uvQueries.insertScan).toHaveBeenCalledTimes(1);
    const [poolArg, scanArg] = uvQueries.insertScan.mock.calls[0];
    expect(poolArg).toBeDefined();
    expect(scanArg).toEqual(
      expect.objectContaining({
        id: res.body.scan_id,
        overall: analysis.overall,
        regions: analysis.regions,
        asymmetry: analysis.asymmetry,
        heatmap: analysis.heatmap,
        screener: analysis.screener,
        source: 'test',
      }),
    );
    expect(typeof scanArg.ip_hash).toBe('string');
  });

  test('422 + checks when analyzeUv throws UV_UNUSABLE', async () => {
    const checks = [{ id: 'brightness', label: 'Brightness', pass: false, value: 12, message: 'too dark' }];
    uvScan.analyzeUv.mockRejectedValue(uvError('UV_UNUSABLE', 'image unusable', { checks }));

    const res = await request(app).post('/api/uv/analyze').send({ image_base64: 'abc' });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'image unusable', checks });
    expect(uvQueries.insertScan).not.toHaveBeenCalled();
  });

  test('400 when analyzeUv throws UV_BAD_IMAGE', async () => {
    uvScan.analyzeUv.mockRejectedValue(uvError('UV_BAD_IMAGE', 'bad image'));

    const res = await request(app).post('/api/uv/analyze').send({ image_base64: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'bad image' });
    expect(uvQueries.insertScan).not.toHaveBeenCalled();
  });
});

describe('POST /api/uv/lead', () => {
  test('200 upserts lead, claims scan, fires Loops (parsing JSON-string jsonb)', async () => {
    // overall arrives as a JSON string to exercise the parse guard.
    uvQueries.getScan.mockResolvedValue({
      id: 'scan1',
      overall: JSON.stringify({ sunDamageScore: 55, severity: 'moderate' }),
      asymmetry: { score: 12 },
    });
    uvQueries.upsertLead.mockResolvedValue({ email: 'a@b.com', report_token: 'tok123' });
    uvQueries.claimScan.mockResolvedValue({ id: 'scan1', claimed: true });
    loops.sendEvent.mockResolvedValue({ skipped: true });

    const res = await request(app)
      .post('/api/uv/lead')
      .send({ email: 'a@b.com', scan_id: 'scan1', source: 'test', consent: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, report_token: 'tok123' });

    expect(uvQueries.upsertLead).toHaveBeenCalledTimes(1);
    expect(uvQueries.upsertLead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: 'a@b.com', scan_id: 'scan1', source: 'test' }),
    );
    expect(uvQueries.claimScan).toHaveBeenCalledWith(expect.anything(), 'scan1');
    expect(loops.sendEvent).toHaveBeenCalledWith('a@b.com', 'uv_report_requested', {
      contactProperties: {
        source: 'test',
        uvSunDamageScore: 55,
        uvSeverity: 'moderate',
        uvAsymmetryScore: 12,
        reportToken: 'tok123',
      },
    });
  });

  test('400 on invalid email — scan never looked up', async () => {
    const res = await request(app)
      .post('/api/uv/lead')
      .send({ email: 'not-an-email', scan_id: 'scan1' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid email' });
    expect(uvQueries.getScan).not.toHaveBeenCalled();
  });

  test('400 on unknown scan_id — no lead upserted', async () => {
    uvQueries.getScan.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/uv/lead')
      .send({ email: 'a@b.com', scan_id: 'nope' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'unknown scan_id' });
    expect(uvQueries.upsertLead).not.toHaveBeenCalled();
  });

  // B1 capability binding — claim_token closes the scan_id IDOR. A scan that
  // carries a claim_token may only be claimed by a caller presenting it.
  const CLAIM_TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

  test('403 when scan carries a claim_token but a WRONG one is presented', async () => {
    uvQueries.getScan.mockResolvedValue({
      id: 'scan1',
      claim_token: CLAIM_TOKEN,
      claimed: false,
      overall: { sunDamageScore: 55, severity: 'moderate' },
      asymmetry: { score: 12 },
    });

    const res = await request(app)
      .post('/api/uv/lead')
      .send({ email: 'a@b.com', scan_id: 'scan1', claim_token: 'deadbeefdeadbeefdeadbeefdeadbeef' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'invalid claim token' });
    expect(uvQueries.upsertLead).not.toHaveBeenCalled();
    expect(uvQueries.claimScan).not.toHaveBeenCalled();
  });

  test('403 when scan carries a claim_token but NONE is presented', async () => {
    uvQueries.getScan.mockResolvedValue({
      id: 'scan1',
      claim_token: CLAIM_TOKEN,
      claimed: false,
      overall: { sunDamageScore: 55, severity: 'moderate' },
      asymmetry: { score: 12 },
    });

    const res = await request(app)
      .post('/api/uv/lead')
      .send({ email: 'a@b.com', scan_id: 'scan1' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'invalid claim token' });
    expect(uvQueries.upsertLead).not.toHaveBeenCalled();
    expect(uvQueries.claimScan).not.toHaveBeenCalled();
  });

  test('409 when an already-claimed scan is claimed by a DIFFERENT email', async () => {
    // Correct token clears the B1 gate; the 409 guard then rejects the takeover.
    uvQueries.getScan.mockResolvedValue({
      id: 'scan1',
      claim_token: CLAIM_TOKEN,
      claimed: true,
      overall: { sunDamageScore: 55, severity: 'moderate' },
      asymmetry: { score: 12 },
    });
    // The new email has no existing lead, so it cannot be the original claimer.
    uvQueries.getLeadByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/uv/lead')
      .send({ email: 'intruder@b.com', scan_id: 'scan1', claim_token: CLAIM_TOKEN });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'scan already claimed' });
    expect(uvQueries.upsertLead).not.toHaveBeenCalled();
    expect(uvQueries.claimScan).not.toHaveBeenCalled();
  });
});

describe('GET /api/uv/report/:token', () => {
  test('200 returns application/pdf when token + scan resolve', async () => {
    uvQueries.getLeadByToken.mockResolvedValue({ email: 'a@b.com', report_token: 'tok', scan_id: 'scan1' });
    uvQueries.getScan.mockResolvedValue({ id: 'scan1', overall: { sunDamageScore: 30 } });
    const pdf = Buffer.from('%PDF-1.4 fake report bytes');
    uvReport.buildReportPdf.mockResolvedValue(pdf);

    const res = await request(app).get('/api/uv/report/tok');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(uvReport.buildReportPdf).toHaveBeenCalledTimes(1);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.toString().startsWith('%PDF')).toBe(true);
  });

  test('404 when token is unknown', async () => {
    uvQueries.getLeadByToken.mockResolvedValue(null);

    const res = await request(app).get('/api/uv/report/missing');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'report not found' });
    expect(uvReport.buildReportPdf).not.toHaveBeenCalled();
  });
});

describe('POST /api/users — lead -> customer conversion hook', () => {
  const realFetch = global.fetch;
  const validBody = { age_range: '25-34', location_coarse: 'US-CA' };

  beforeEach(() => {
    process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
    // Clerk user lookup returns a primary email.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        email_addresses: [{ id: 'idn_1', email_address: 'lead@example.com' }],
        primary_email_address_id: 'idn_1',
      }),
    });
    // Profile insert succeeds -> 201 path.
    mockQuery.mockResolvedValue({ rows: [{ user_id: 'dev-user', age_range: '25-34' }] });
  });

  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.CLERK_SECRET_KEY;
  });

  test('first transition: markCustomer returns a row -> fires became_customer, 201', async () => {
    uvQueries.markCustomer.mockResolvedValue({ email: 'lead@example.com', status: 'customer' });

    const res = await request(app).post('/api/users').send(validBody);

    expect(res.status).toBe(201);
    expect(uvQueries.markCustomer).toHaveBeenCalledWith(expect.anything(), {
      email: 'lead@example.com',
      clerk_user_id: 'dev-user',
    });
    expect(loops.sendEvent).toHaveBeenCalledWith('lead@example.com', 'became_customer', {
      contactProperties: { clerkUserId: 'dev-user' },
    });
  });

  test('no transition: markCustomer returns null -> became_customer NOT fired, 201', async () => {
    uvQueries.markCustomer.mockResolvedValue(null);

    const res = await request(app).post('/api/users').send(validBody);

    expect(res.status).toBe(201);
    expect(uvQueries.markCustomer).toHaveBeenCalledTimes(1);
    expect(loops.sendEvent).not.toHaveBeenCalled();
  });
});
