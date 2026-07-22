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
  findCustomerLead: jest.fn(),
}));
jest.mock('../posthog', () => {
  const actual = jest.requireActual('../posthog');
  return {
    ...actual,
    captureAccountCreated: jest.fn().mockResolvedValue(undefined),
    accountCreatedUuid: (id) => `11111111-1111-5111-8111-${Buffer.from(id).toString('hex').padStart(12, '0').slice(0, 12)}`,
  };
});

const request = require('supertest');
const app = require('../app');
const uvScan = require('../uv-scan');
const loops = require('../loops');
const uvReport = require('../uv-report');
const uvQueries = require('../queries/uv');
const posthog = require('../posthog');

// Error carrying the code app.js maps on (UV_UNUSABLE / UV_BAD_IMAGE).
function uvError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

const profileCreatedAt = new Date('2026-07-21T00:00:00.000Z');
let profiles = new Map();

function normalizeProfile(row) {
  return {
    user_id: row.user_id,
    age_range: row.age_range || '25-34',
    location_coarse: row.location_coarse || 'US-CA',
    created_at: row.created_at || profileCreatedAt.toISOString(),
    posthog_account_created_uuid: row.posthog_account_created_uuid ?? null,
    posthog_account_created_timestamp: row.posthog_account_created_timestamp ?? null,
    posthog_account_created_sent_at: row.posthog_account_created_sent_at ?? null,
    posthog_account_created_status: row.posthog_account_created_status || 'reconciliation_pending',
    posthog_account_created_properties: row.posthog_account_created_properties ?? null,
    posthog_account_created_waitlist_match: row.posthog_account_created_waitlist_match ?? null,
    posthog_account_created_delivery_claimed_at: row.posthog_account_created_delivery_claimed_at ?? null,
    posthog_account_created_retry_after: row.posthog_account_created_retry_after ?? null,
  };
}

function deliveryRow(row, cutoverAt = process.env.GLOWLYTICS_CUTOVER_AT) {
  return {
    user_id: row.user_id,
    created_at: row.created_at,
    forward_owned: Date.parse(row.created_at) >= Date.parse(cutoverAt),
    status: row.posthog_account_created_status,
    uuid: row.posthog_account_created_uuid,
    timestamp: row.posthog_account_created_timestamp,
    properties: row.posthog_account_created_properties,
    waitlist_match: row.posthog_account_created_waitlist_match,
    delivery_claimed_at: row.posthog_account_created_delivery_claimed_at,
  };
}

function seedProfiles(rows = []) {
  profiles = new Map(rows.map((row) => [row.user_id, normalizeProfile(row)]));
  mockQuery.mockImplementation(async (sql, params = []) => {
    if (/INSERT INTO user_profiles/.test(sql)) {
      const userId = params[0];
      if (profiles.has(userId)) {
        throw Object.assign(new Error('duplicate user profile'), { code: '23505' });
      }
      const row = normalizeProfile({
        user_id: userId,
        age_range: params[1],
        location_coarse: params[2],
        created_at: profileCreatedAt.toISOString(),
      });
      profiles.set(userId, row);
      return { rows: [row], rowCount: 1 };
    }
    if (/SELECT user_id\s+FROM user_profiles/.test(sql) && /posthog_account_created_status IN/.test(sql)) {
      const limit = params[0];
      const rows = Array.from(profiles.values())
        .filter((row) => ['reconciliation_pending', 'pending_delivery'].includes(row.posthog_account_created_status))
        .filter((row) => !row.posthog_account_created_retry_after || Date.parse(row.posthog_account_created_retry_after) <= Date.now())
        .sort((a, b) => {
          const statusOrder = (value) => (value === 'pending_delivery' ? 0 : 1);
          return statusOrder(a.posthog_account_created_status) - statusOrder(b.posthog_account_created_status) ||
            Date.parse(a.created_at) - Date.parse(b.created_at) ||
            a.user_id.localeCompare(b.user_id);
        })
        .slice(0, limit)
        .map((row) => ({ user_id: row.user_id }));
      return { rows, rowCount: rows.length };
    }
    if (/SELECT user_id, created_at/.test(sql) && /WHERE user_id = \$1/.test(sql)) {
      const row = profiles.get(params[0]);
      return { rows: row ? [deliveryRow(row, params[1])] : [], rowCount: row ? 1 : 0 };
    }
    if (/UPDATE user_profiles/.test(sql) && /posthog_account_created_properties\s*=/.test(sql)) {
      const [userId, uuid, cutoverAt, propertiesJson, waitlistMatch] = params;
      const row = profiles.get(userId);
      const requiresReconciliationPending = /posthog_account_created_status = 'reconciliation_pending'/.test(sql);
      const statusMatches = requiresReconciliationPending
        ? row?.posthog_account_created_status === 'reconciliation_pending'
        : ['reconciliation_pending', 'pending_delivery'].includes(row?.posthog_account_created_status);
      if (
        row &&
        Date.parse(row.created_at) >= Date.parse(cutoverAt) &&
        statusMatches
      ) {
        row.posthog_account_created_uuid = row.posthog_account_created_uuid || uuid;
        row.posthog_account_created_timestamp = row.posthog_account_created_timestamp || row.created_at;
        row.posthog_account_created_properties = row.posthog_account_created_properties || JSON.parse(propertiesJson);
        row.posthog_account_created_waitlist_match = row.posthog_account_created_waitlist_match ?? waitlistMatch;
        row.posthog_account_created_status = 'pending_delivery';
        row.posthog_account_created_delivery_claimed_at = null;
        row.posthog_account_created_retry_after = null;
        return { rows: [deliveryRow(row)], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (/UPDATE user_profiles/.test(sql) && /posthog_account_created_delivery_claimed_at = NOW\(\)/.test(sql)) {
      const [userId, uuid] = params;
      const row = profiles.get(userId);
      const leaseMs = params[2] || 300_000;
      const claimedAt = row?.posthog_account_created_delivery_claimed_at && Date.parse(row.posthog_account_created_delivery_claimed_at);
      const claimExpired = Number.isFinite(claimedAt) && claimedAt < Date.now() - leaseMs;
      if (
        row &&
        row.posthog_account_created_uuid === uuid &&
        row.posthog_account_created_status === 'pending_delivery' &&
        (row.posthog_account_created_delivery_claimed_at == null || claimExpired)
      ) {
        row.posthog_account_created_delivery_claimed_at = new Date().toISOString();
        return { rows: [deliveryRow(row)], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (/UPDATE user_profiles/.test(sql) && /posthog_account_created_delivery_claimed_at = NULL/.test(sql) && !/posthog_account_created_sent_at/.test(sql)) {
      const [userId, uuid] = params;
      const row = profiles.get(userId);
      if (row && row.posthog_account_created_uuid === uuid && row.posthog_account_created_status === 'pending_delivery') {
        row.posthog_account_created_delivery_claimed_at = null;
        row.posthog_account_created_retry_after = null;
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (/UPDATE user_profiles/.test(sql) && /posthog_account_created_retry_after = NOW\(\)/.test(sql)) {
      const [userId] = params;
      const row = profiles.get(userId);
      if (row && row.posthog_account_created_status === 'reconciliation_pending') {
        row.posthog_account_created_retry_after = new Date(Date.now() + 60_000).toISOString();
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (/UPDATE user_profiles/.test(sql) && /posthog_account_created_status = 'delivered'/.test(sql)) {
      const [userId, uuid] = params;
      const row = profiles.get(userId);
      if (row && row.posthog_account_created_uuid === uuid && row.posthog_account_created_status === 'pending_delivery') {
        row.posthog_account_created_sent_at = '2026-07-21T00:00:01.000Z';
        row.posthog_account_created_delivery_claimed_at = null;
        row.posthog_account_created_retry_after = null;
        row.posthog_account_created_status = 'delivered';
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (/UPDATE user_profiles/.test(sql) && /historical_backfill_owned/.test(sql)) {
      const [userId, cutoverAt] = params;
      const row = profiles.get(userId);
      if (
        row &&
        Date.parse(row.created_at) < Date.parse(cutoverAt) &&
        row.posthog_account_created_status === 'reconciliation_pending' &&
        row.posthog_account_created_uuid == null
      ) {
        row.posthog_account_created_sent_at = row.posthog_account_created_sent_at || '2026-07-21T00:00:01.000Z';
        row.posthog_account_created_status = 'historical_backfill_owned';
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
}

function profileState(userId) {
  return profiles.get(userId);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
  if (typeof app._resetRateLimiters === 'function') app._resetRateLimiters();
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

  test('normalizes attribution fields before storing the UV lead', async () => {
    uvQueries.getScan.mockResolvedValue({
      id: 'scan1',
      overall: { sunDamageScore: 55, severity: 'moderate' },
      asymmetry: { score: 12 },
    });
    uvQueries.upsertLead.mockResolvedValue({ email: 'a@b.com', report_token: 'tok123' });
    uvQueries.claimScan.mockResolvedValue({ id: 'scan1', claimed: true });

    const res = await request(app)
      .post('/api/uv/lead')
      .send({
        email: 'a@b.com',
        scan_id: 'scan1',
        source: 'test',
        posthog_distinct_id: 'browser-1',
        acquisition_source: 'google',
        acquisition_medium: 'paid_search',
        attribution_quality: 'utm',
        utm_source: 'GOOGLE',
        utm_term: 'Bearer abc123',
        utm_content: 'api_key=secret',
        google_click_id_present: true,
        referrer_host: 'https://www.google.com/search?q=skin',
        landing_path: '/uv-scan?api_key=secret',
        form_placement: 'final-cta',
      });

    expect(res.status).toBe(200);
    expect(uvQueries.upsertLead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        acquisition_source: 'google',
        acquisition_medium: 'paid_search',
        attribution_model: 'first_touch',
        attribution_quality: 'utm',
        utm_source: 'google',
        utm_term: null,
        utm_content: null,
        google_click_id_present: true,
        referrer_host: 'www.google.com',
        landing_path: '/uv-scan',
        form_placement: 'footer',
      }),
    );
    expect(uvQueries.upsertLead.mock.calls[0][1]).not.toHaveProperty('posthog_distinct_id');
  });

  test('preserves facebook first-touch attribution with paid-social medium on UV leads', async () => {
    uvQueries.getScan.mockResolvedValue({
      id: 'scan1',
      claim_token: 'claim123',
      overall: { sunDamageScore: 55, severity: 'moderate' },
      asymmetry: { score: 12 },
    });
    uvQueries.upsertLead.mockResolvedValue({ email: 'a@b.com', report_token: 'tok123' });
    uvQueries.claimScan.mockResolvedValue({ id: 'scan1', claimed: true });

    const res = await request(app)
      .post('/api/uv/lead')
      .send({
        email: 'a@b.com',
        scan_id: 'scan1',
        claim_token: 'claim123',
        source: 'test',
        acquisition_source: 'facebook',
        acquisition_medium: 'paid_social',
        attribution_quality: 'utm',
        utm_source: 'facebook',
        referrer_host: 'https://m.facebook.com/l.php',
      });

    expect(res.status).toBe(200);
    expect(uvQueries.upsertLead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        acquisition_source: 'facebook',
        acquisition_medium: 'paid_social',
        attribution_quality: 'utm',
        utm_source: 'facebook',
        referrer_host: 'm.facebook.com',
      }),
    );
  });

  test('sanitizes source before storing the UV lead or sending Loops properties', async () => {
    uvQueries.getScan.mockResolvedValue({
      id: 'scan1',
      overall: { sunDamageScore: 55, severity: 'moderate' },
      asymmetry: { score: 12 },
    });
    uvQueries.upsertLead.mockResolvedValue({ email: 'a@b.com', report_token: 'tok123' });
    uvQueries.claimScan.mockResolvedValue({ id: 'scan1', claimed: true });

    const res = await request(app)
      .post('/api/uv/lead')
      .send({ email: 'a@b.com', scan_id: 'scan1', source: 'api_key=secret' });

    expect(res.status).toBe(200);
    expect(uvQueries.upsertLead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: 'uv-scan-web' }),
    );
    expect(loops.sendEvent).toHaveBeenCalledWith('a@b.com', 'uv_report_requested', expect.objectContaining({
      contactProperties: expect.objectContaining({ source: 'uv-scan-web' }),
    }));
    expect(JSON.stringify(uvQueries.upsertLead.mock.calls[0][1])).not.toMatch(/api_key|secret/);
    expect(JSON.stringify(loops.sendEvent.mock.calls[0][2])).not.toMatch(/api_key|secret/);
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
  const railwayLeadId = '152605c9-cf42-449a-9b71-f9d731ff1856';
  let waitlistLookupFetch;

  beforeEach(() => {
    process.env.CLERK_SECRET_KEY = 'sk_test_dummy';
    process.env.GLOWLYTICS_CUTOVER_AT = '2026-07-20T00:00:00.000Z';
    process.env.GLOWLYTICS_WAITLIST_LOOKUP_URL = 'https://glowlytics.ai/api/waitlist-lookup';
    process.env.GLOWLYTICS_WAITLIST_LOOKUP_TOKEN = 'waitlist-read-token';
    posthog.captureAccountCreated.mockReset();
    posthog.captureAccountCreated.mockResolvedValue(undefined);
    uvQueries.markCustomer.mockReset();
    uvQueries.markCustomer.mockResolvedValue(null);
    uvQueries.findCustomerLead.mockReset();
    uvQueries.findCustomerLead.mockResolvedValue(null);
    loops.sendEvent.mockReset();
    loops.sendEvent.mockResolvedValue({ skipped: true });
    seedProfiles([]);
    waitlistLookupFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ matched: false }),
    });
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).startsWith('https://api.clerk.com/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            email_addresses: [{ id: 'idn_1', email_address: 'lead@example.com' }],
            primary_email_address_id: 'idn_1',
          }),
        };
      }
      if (String(url) === process.env.GLOWLYTICS_WAITLIST_LOOKUP_URL) {
        return waitlistLookupFetch(url, options);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  });

  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.GLOWLYTICS_CUTOVER_AT;
    delete process.env.GLOWLYTICS_WAITLIST_LOOKUP_URL;
    delete process.env.GLOWLYTICS_WAITLIST_LOOKUP_TOKEN;
  });

  test('first transition: markCustomer returns a row -> fires became_customer, 201', async () => {
    uvQueries.markCustomer.mockResolvedValue({ id: railwayLeadId, email: 'lead@example.com', status: 'customer' });

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

  test('POST /api/users emits server-confirmed account_created with stable UUID/timestamp and sanitized UV attribution', async () => {
    uvQueries.markCustomer.mockResolvedValue({
      id: railwayLeadId,
      email: 'lead@example.com',
      status: 'customer',
      acquisition_source: 'google',
      acquisition_medium: 'paid_search',
      attribution_model: 'first_touch',
      attribution_quality: 'utm',
      google_click_id_present: true,
      landing_path: '/uv-scan',
      referrer_host: 'www.google.com',
      utm_content: 'api_key=secret',
      utm_term: 'Bearer abc123',
    });

    const res = await request(app).post('/api/users').send(validBody);

    expect(res.status).toBe(201);
    expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'dev-user',
      uuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
      timestamp: expect.any(String),
      properties: expect.objectContaining({
        distinct_id: 'glowlytics:user:dev-user',
        acquisition_source: 'google',
        landing_path: '/uv-scan',
        waitlist_match: true,
        waitlist_source_identity: `glowlytics:lead:railway:${railwayLeadId}`,
        waitlist_bypassed: false,
      }),
    }));
    expect(JSON.stringify(posthog.captureAccountCreated.mock.calls[0][0])).not.toMatch(/lead@example\.com|api_key|Bearer|secret/);
    expect(mockQuery.mock.calls.some(([sql]) => /posthog_account_created_sent_at\s*=\s*NOW\(\)/.test(sql))).toBe(true);
    expect(profileState('dev-user').posthog_account_created_status).toBe('delivered');
  });

  test('POST /api/users preserves facebook attribution from matched UV lead reconciliation', async () => {
    uvQueries.markCustomer.mockResolvedValue({
      id: railwayLeadId,
      email: 'lead@example.com',
      status: 'customer',
      acquisition_source: 'facebook',
      acquisition_medium: 'paid_social',
      attribution_quality: 'utm',
      utm_source: 'facebook',
      referrer_host: 'www.facebook.com',
      landing_path: '/uv-scan',
    });

    const res = await request(app).post('/api/users').send(validBody);

    expect(res.status).toBe(201);
    expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({
        acquisition_source: 'facebook',
        acquisition_medium: 'paid_social',
        attribution_quality: 'utm',
        utm_source: 'facebook',
        referrer_host: 'www.facebook.com',
        waitlist_match: true,
        waitlist_bypassed: false,
      }),
    }));
  });

  test('D1-only landing waitlist lead promotes its source identity without exposing browser identity', async () => {
    waitlistLookupFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        matched: true,
        lead: {
          source_identity: 'glowlytics:lead:d1:41',
          acquisition_source: 'facebook',
          acquisition_medium: 'paid_social',
          attribution_model: 'first_touch',
          attribution_quality: 'utm',
          historical_backfill: 0,
          form_placement: 'hero',
          utm_source: 'facebook',
          utm_medium: 'paid_social',
          utm_campaign: 'launch',
          utm_term: null,
          utm_content: null,
          google_click_id_present: 0,
          referrer_host: 'facebook.com',
          landing_path: '/',
        },
      }),
    });

    const res = await request(app).post('/api/users').send(validBody);

    expect(res.status).toBe(201);
    expect(uvQueries.markCustomer).toHaveBeenCalledWith(expect.anything(), {
      email: 'lead@example.com',
      clerk_user_id: 'dev-user',
    });
    expect(waitlistLookupFetch).toHaveBeenCalledWith(
      'https://glowlytics.ai/api/waitlist-lookup',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer waitlist-read-token',
          'Content-Type': 'application/json',
        },
      })
    );
    expect(JSON.parse(waitlistLookupFetch.mock.calls[0][1].body)).toEqual({
      email: 'lead@example.com',
    });
    expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'dev-user',
      properties: expect.objectContaining({
        distinct_id: 'glowlytics:user:dev-user',
        waitlist_match: true,
        waitlist_bypassed: false,
        acquisition_source: 'facebook',
        waitlist_source_identity: 'glowlytics:lead:d1:41',
      }),
    }));
    expect(posthog.captureAccountCreated.mock.calls[0][0].properties).not.toHaveProperty('$anon_distinct_id');
    expect(JSON.stringify(posthog.captureAccountCreated.mock.calls[0][0])).not.toMatch(
      /lead@example\.com|waitlist-read-token/
    );
  });

  test('D1 lookup failure leaves account reconciliation pending instead of inventing a bypass', async () => {
    waitlistLookupFetch.mockRejectedValueOnce(new Error('Cloudflare unavailable'));

    const res = await request(app).post('/api/users').send(validBody);

    expect(res.status).toBe(201);
    expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
    expect(profileState('dev-user')).toEqual(expect.objectContaining({
      posthog_account_created_status: 'reconciliation_pending',
      posthog_account_created_uuid: null,
      posthog_account_created_waitlist_match: null,
      posthog_account_created_retry_after: expect.any(String),
    }));
  });
  test('server account_created telemetry drops dirty persisted form placement values', async () => {
    uvQueries.markCustomer.mockResolvedValue({
      id: railwayLeadId,
      acquisition_source: 'google',
      attribution_quality: 'utm',
      form_placement: 'api_key=secret',
    });

    const res = await request(app).post('/api/users').send(validBody);

    expect(res.status).toBe(201);
    expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({ form_placement: null }),
    }));
    expect(JSON.stringify(posthog.captureAccountCreated.mock.calls[0][0])).not.toMatch(/api_key|secret/);
  });

  test('POST /api/users retries account_created with the same UUID/timestamp/properties after a failed capture', async () => {
    posthog.captureAccountCreated.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined);
    uvQueries.markCustomer
      .mockResolvedValueOnce({ id: railwayLeadId, acquisition_source: 'google', acquisition_medium: 'paid_search', attribution_model: 'first_touch', attribution_quality: 'utm', landing_path: '/uv-scan' })
      .mockResolvedValueOnce(null);

    const first = await request(app).post('/api/users').send(validBody);
    const second = await request(app).post('/api/users').send(validBody);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(posthog.captureAccountCreated).toHaveBeenCalledTimes(2);
    expect(posthog.captureAccountCreated.mock.calls[1][0].uuid).toBe(posthog.captureAccountCreated.mock.calls[0][0].uuid);
    expect(posthog.captureAccountCreated.mock.calls[1][0].timestamp).toBe(posthog.captureAccountCreated.mock.calls[0][0].timestamp);
    expect(posthog.captureAccountCreated.mock.calls[1][0].properties).toEqual(posthog.captureAccountCreated.mock.calls[0][0].properties);
    const sentCallIndexes = mockQuery.mock.calls
      .map(([sql], index) => (/posthog_account_created_sent_at\s*=\s*NOW\(\)/.test(sql) ? index : -1))
      .filter((index) => index >= 0);
    expect(sentCallIndexes).toHaveLength(1);
    expect(mockQuery.mock.invocationCallOrder[sentCallIndexes[0]]).toBeGreaterThan(posthog.captureAccountCreated.mock.invocationCallOrder[1]);
  });

  test('concurrent duplicate account_created delivery is claimed by one caller before capture', async () => {
    let releaseCapture;
    const captureStarted = new Promise((resolve) => {
      posthog.captureAccountCreated.mockImplementationOnce(async () => {
        resolve();
        return new Promise((release) => {
          releaseCapture = release;
        });
      });
    });
    uvQueries.markCustomer.mockResolvedValue({ id: railwayLeadId, acquisition_source: 'google', attribution_quality: 'utm' });

    const first = request(app).post('/api/users').send(validBody).then((res) => res);
    await Promise.race([
      captureStarted,
      new Promise((_, reject) => setTimeout(() => reject(new Error('capture did not start')), 1000)),
    ]);
    const second = await request(app).post('/api/users').send(validBody);

    expect(second.status).toBe(409);
    expect(posthog.captureAccountCreated).toHaveBeenCalledTimes(1);
    releaseCapture();
    const firstRes = await first;
    expect(firstRes.status).toBe(201);
    expect(profileState('dev-user').posthog_account_created_status).toBe('delivered');
  });

  test('unavailable reconciliation stays durable and the bounded worker later resolves it without inventing bypass evidence', async () => {
    uvQueries.markCustomer
      .mockRejectedValueOnce(new Error('temporary Railway lookup failure'))
      .mockResolvedValueOnce(null);

    const first = await request(app).post('/api/users').send(validBody);
    expect(first.status).toBe(201);
    expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
    expect(profileState('dev-user')).toEqual(expect.objectContaining({
      posthog_account_created_status: 'reconciliation_pending',
      posthog_account_created_uuid: null,
      posthog_account_created_waitlist_match: null,
    }));

    profileState('dev-user').posthog_account_created_retry_after = null;
    await app._retryPendingAccountCreatedDeliveries({ limit: 1 });

    expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'dev-user',
      timestamp: profileCreatedAt.toISOString(),
      properties: expect.objectContaining({ waitlist_match: false, waitlist_bypassed: true }),
    }));
    expect(profileState('dev-user').posthog_account_created_status).toBe('delivered');
  });

  test('missing Clerk configuration remains reconciliation_pending for a later worker pass', async () => {
    delete process.env.CLERK_SECRET_KEY;
    const res = await request(app).post('/api/users').send(validBody);
    expect(res.status).toBe(201);
    expect(uvQueries.markCustomer).not.toHaveBeenCalled();
    expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
    expect(profileState('dev-user').posthog_account_created_status).toBe('reconciliation_pending');
  });

  test('Loops failure cannot turn a verified lead match into a bypass', async () => {
    uvQueries.markCustomer.mockResolvedValue({ id: railwayLeadId, acquisition_source: 'google', attribution_model: 'first_touch' });
    loops.sendEvent.mockRejectedValueOnce(new Error('Loops unavailable'));

    const res = await request(app).post('/api/users').send(validBody);

    expect(res.status).toBe(201);
    expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({ properties: expect.objectContaining({ waitlist_match: true, waitlist_bypassed: false }) }));
    expect(profileState('dev-user')).toEqual(expect.objectContaining({
      posthog_account_created_status: 'delivered',
      posthog_account_created_waitlist_match: true,
    }));
  });

  test('worker recovers a lead already linked before a crash without relabeling it unmatched', async () => {
    uvQueries.markCustomer.mockResolvedValue(null);
    uvQueries.findCustomerLead.mockResolvedValue({ id: railwayLeadId, clerk_user_id: 'dev-user', acquisition_source: 'google' });
    seedProfiles([{ user_id: 'dev-user', posthog_account_created_status: 'reconciliation_pending' }]);

    await app._retryPendingAccountCreatedDeliveries({ limit: 1 });

    expect(loops.sendEvent).not.toHaveBeenCalled();
    expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({ properties: expect.objectContaining({ waitlist_match: true, waitlist_bypassed: false }) }));
  });

  test('retry worker is bounded and skips historical/delivered rows', async () => {
    seedProfiles([
      { user_id: 'pending-1', posthog_account_created_status: 'reconciliation_pending' },
      { user_id: 'pending-2', posthog_account_created_status: 'reconciliation_pending' },
      { user_id: 'old', posthog_account_created_status: 'historical_backfill_owned' },
      { user_id: 'done', posthog_account_created_status: 'delivered' },
    ]);

    await app._retryPendingAccountCreatedDeliveries({ limit: 1 });

    expect(uvQueries.markCustomer).toHaveBeenCalledTimes(1);
    expect(posthog.captureAccountCreated).toHaveBeenCalledTimes(1);
    expect(profileState('pending-2').posthog_account_created_status).toBe('reconciliation_pending');
  });

  test('retry worker prioritizes frozen pending_delivery rows ahead of unresolved reconciliation', async () => {
    seedProfiles([
      { user_id: 'blocked', created_at: '2026-07-21T00:00:00.000Z', posthog_account_created_status: 'reconciliation_pending' },
      {
        user_id: 'deliverable',
        created_at: '2026-07-21T00:00:01.000Z',
        posthog_account_created_status: 'pending_delivery',
        posthog_account_created_uuid: '11111111-1111-5111-8111-000000000002',
        posthog_account_created_timestamp: '2026-07-21T00:00:01.000Z',
        posthog_account_created_properties: { distinct_id: 'glowlytics:user:deliverable', product: 'glowlytics', waitlist_match: false, waitlist_bypassed: true },
        posthog_account_created_waitlist_match: false,
      },
    ]);

    await app._retryPendingAccountCreatedDeliveries({ limit: 1 });

    expect(uvQueries.markCustomer).not.toHaveBeenCalled();
    expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({ userId: 'deliverable' }));
    expect(profileState('deliverable').posthog_account_created_status).toBe('delivered');
  });

  test('concurrent workers that both read reconciliation_pending reserve and send only once', async () => {
    seedProfiles([{ user_id: 'race', posthog_account_created_status: 'reconciliation_pending' }]);
    let markCalls = 0;
    const releaseMarks = [];
    const bothReconcilersLoaded = new Promise((resolve) => {
      uvQueries.markCustomer.mockImplementation(async () => {
        markCalls += 1;
        if (markCalls === 2) resolve();
        await new Promise((release) => {
          releaseMarks.push(release);
        });
        return { id: railwayLeadId, acquisition_source: 'google', attribution_quality: 'utm' };
      });
    });
    let releaseCapture;
    const captureStarted = new Promise((resolve) => {
      posthog.captureAccountCreated.mockImplementationOnce(async () => {
        resolve();
        return new Promise((release) => {
          releaseCapture = release;
        });
      });
    });

    const first = app._retryPendingAccountCreatedDeliveries({ limit: 1 });
    const second = app._retryPendingAccountCreatedDeliveries({ limit: 1 });
    await bothReconcilersLoaded;
    releaseMarks[0]();
    await captureStarted;
    releaseMarks[1]();
    await new Promise((resolve) => setImmediate(resolve));

    expect(posthog.captureAccountCreated).toHaveBeenCalledTimes(1);
    releaseCapture();
    await Promise.all([first, second]);
    expect(profileState('race').posthog_account_created_status).toBe('delivered');
  });

  test('retry worker recovers pending_delivery after the delivery claim lease expires', async () => {
    seedProfiles([{
      user_id: 'leased',
      created_at: '2026-07-21T00:00:01.000Z',
      posthog_account_created_status: 'pending_delivery',
      posthog_account_created_uuid: '11111111-1111-5111-8111-000000000003',
      posthog_account_created_timestamp: '2026-07-21T00:00:01.000Z',
      posthog_account_created_properties: { distinct_id: 'glowlytics:user:leased', product: 'glowlytics', waitlist_match: false, waitlist_bypassed: true },
      posthog_account_created_waitlist_match: false,
      posthog_account_created_delivery_claimed_at: '2026-07-20T00:00:00.000Z',
    }]);

    await app._retryPendingAccountCreatedDeliveries({ limit: 1 });

    expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({ userId: 'leased' }));
    expect(profileState('leased').posthog_account_created_status).toBe('delivered');
  });

  test('retry worker defers unavailable reconciliation so later rows get turns', async () => {
    uvQueries.markCustomer
      .mockRejectedValueOnce(new Error('Clerk temporarily unavailable'))
      .mockResolvedValueOnce(null);
    seedProfiles([
      { user_id: 'blocked', created_at: '2026-07-21T00:00:00.000Z', posthog_account_created_status: 'reconciliation_pending' },
      { user_id: 'later', created_at: '2026-07-21T00:00:01.000Z', posthog_account_created_status: 'reconciliation_pending' },
    ]);

    await app._retryPendingAccountCreatedDeliveries({ limit: 1 });
    expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
    expect(profileState('blocked').posthog_account_created_retry_after).toBeTruthy();

    await app._retryPendingAccountCreatedDeliveries({ limit: 1 });

    expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({ userId: 'later' }));
    expect(profileState('later').posthog_account_created_status).toBe('delivered');
  });

  test('profiles created before GLOWLYTICS_CUTOVER_AT do not emit forward account_created', async () => {
    process.env.GLOWLYTICS_CUTOVER_AT = '2999-01-01T00:00:00.000Z';

    const res = await request(app).post('/api/users').send(validBody);

    expect(res.status).toBe(201);
    expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
    expect(profileState('dev-user').posthog_account_created_status).toBe('historical_backfill_owned');
  });

  test('POST /api/users fails before profile insert when GLOWLYTICS_CUTOVER_AT is missing or invalid', async () => {
    delete process.env.GLOWLYTICS_CUTOVER_AT;

    const res = await request(app).post('/api/users').send(validBody);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'cutover_not_configured' });
    expect(mockQuery.mock.calls.some(([sql]) => /INSERT INTO user_profiles/.test(sql))).toBe(false);
    expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
  });
});
