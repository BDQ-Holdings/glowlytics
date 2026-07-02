/**
 * Supertest coverage for POST /api/products/shopping-scan (authed verdict layer).
 * Mocking mirrors product-endpoints.test.js: openai, pg, rag, and global.fetch.
 */

process.env.NODE_ENV = 'development';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-for-ci';
// Auth fails closed when an issuer is configured. Set '' (not delete): jest
// shares process.env across files (maxWorkers=1) and app.js's dotenv would
// re-inject a developer's .env CLERK_ISSUER_URL into a deleted slot.
process.env.CLERK_ISSUER_URL = '';

const mockCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
    embeddings: { create: jest.fn() },
  }));
});

jest.mock('pg', () => {
  const mockPool = { query: jest.fn() };
  return { Pool: jest.fn(() => mockPool) };
});

jest.mock('../rag', () => ({
  seedGuidelines: jest.fn(),
  queryGuidelines: jest.fn(),
  queryGuidelinesMulti: jest.fn().mockResolvedValue([]),
}));

const originalFetch = global.fetch;
const mockFetch = jest.fn();

const request = require('supertest');
const app = require('../app');
const { Pool } = require('pg');
const pool = new Pool();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
  app._resetRateLimiters();
});

afterAll(() => {
  global.fetch = originalFetch;
});

// Default DB stub: no protocol goal, no profile, empty routine. Tests override.
function stubDb({ goal, profile, routine } = {}) {
  pool.query.mockImplementation((sql) => {
    if (/scan_protocols/.test(sql)) {
      return Promise.resolve({ rows: goal ? [{ primary_goal: goal }] : [] });
    }
    if (/user_profiles/.test(sql)) {
      return Promise.resolve({ rows: profile ? [profile] : [] });
    }
    if (/product_catalog/.test(sql)) {
      return Promise.resolve({ rows: routine || [] });
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('POST /api/products/shopping-scan', () => {
  it('identifies via a curated barcode and returns the full verdict shape', async () => {
    stubDb({ goal: 'acne', routine: [] });

    const res = await request(app)
      .post('/api/products/shopping-scan')
      .send({ barcode: '301871371054' }) // curated CeraVe (no external fetch needed)
      .expect(200);

    expect(res.body.identified).toBe(true);
    expect(res.body.product).toBeTruthy();
    expect(res.body.product.name).toContain('CeraVe');
    expect(Array.isArray(res.body.product.ingredients)).toBe(true);
    expect(res.body.product.source).toBe('curated');
    expect(['buy', 'maybe', 'skip']).toContain(res.body.verdict);
    expect(typeof res.body.score).toBe('number');
    expect(res.body.score).toBeGreaterThanOrEqual(0);
    expect(res.body.score).toBeLessThanOrEqual(100);
    expect(typeof res.body.headline).toBe('string');
    expect(Array.isArray(res.body.reasons)).toBe(true);
    expect(res.body.goalFit).toBeTruthy();
    expect(Array.isArray(res.body.conflicts)).toBe(true);
    expect(Array.isArray(res.body.flags)).toBe(true);
    expect(res.body).toHaveProperty('redundancy');
  });

  it('flags a second-retinoid conflict and caps the verdict at maybe', async () => {
    // Candidate (via barcode waterfall) is a retinol product; routine already has a retinoid.
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        status: 1,
        product: { product_name: 'Night Retinol Serum', brands: 'Test', ingredients_text: 'Water, Retinol, Glycerin' },
      }),
    });
    stubDb({
      goal: 'skin_age',
      routine: [{ product_name: 'My Tretinoin', ingredients_list: ['Tretinoin'] }],
    });

    const res = await request(app)
      .post('/api/products/shopping-scan')
      .send({ barcode: '9999999999991' }) // not curated -> external waterfall
      .expect(200);

    expect(res.body.identified).toBe(true);
    expect(res.body.conflicts.some((c) => c.code === 'second_retinoid')).toBe(true);
    expect(res.body.verdict).toBe('maybe');
    expect(res.body.verdict).not.toBe('buy');

    // Scoping: every DB query must use the authenticated user id, never body.user_id.
    for (const call of pool.query.mock.calls) {
      expect(call[1][0]).toBe('dev-user');
    }
  });

  it('returns { identified: false } for an unidentified barcode', async () => {
    mockFetch
      .mockResolvedValueOnce({ json: async () => ({ status: 0 }) }) // OBF miss
      .mockResolvedValueOnce({ json: async () => ({ status: 0 }) }) // OFF miss
      .mockResolvedValueOnce({ ok: false }) // UPCitemdb miss
      .mockResolvedValueOnce({ ok: false }); // NIH miss
    stubDb({});

    const res = await request(app)
      .post('/api/products/shopping-scan')
      .send({ barcode: '9999999999992' })
      .expect(200);

    expect(res.body.identified).toBe(false);
  });

  it('returns 400 when no identification input is provided', async () => {
    stubDb({});
    await request(app)
      .post('/api/products/shopping-scan')
      .send({})
      .expect(400);
  });

  it('returns 400 for a malformed barcode', async () => {
    stubDb({});
    await request(app)
      .post('/api/products/shopping-scan')
      .send({ barcode: 'not-a-barcode' })
      .expect(400);
  });

  it('accepts a direct name + ingredients candidate and scopes to req.auth.userId', async () => {
    stubDb({
      goal: 'skin_age',
      routine: [{ product_name: 'My Tretinoin', ingredients_list: ['Tretinoin'] }],
    });

    const res = await request(app)
      .post('/api/products/shopping-scan')
      .send({
        user_id: 'attacker-supplied', // must be ignored
        name: 'Some Retinol Serum',
        ingredients: ['Retinol'],
      })
      .expect(200);

    expect(res.body.identified).toBe(true);
    expect(res.body.conflicts.some((c) => c.code === 'second_retinoid')).toBe(true);
    expect(pool.query).toHaveBeenCalled();
    for (const call of pool.query.mock.calls) {
      expect(call[1][0]).toBe('dev-user'); // never 'attacker-supplied'
    }
  });
  it('identifies via photo (mocked vision) and returns a verdict', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            identified: true,
            name: 'Generic Retinol Night Serum',
            brand: 'Test',
            ingredients: ['Water', 'Retinol', 'Glycerin'],
            confidence: 'high',
          }),
        },
      }],
    });
    stubDb({ goal: 'skin_age', routine: [] });

    const res = await request(app)
      .post('/api/products/shopping-scan')
      .send({ image_base64: 'dGVzdA==' })
      .expect(200);

    expect(res.body.identified).toBe(true);
    expect(res.body.product.source).toBe('gpt4o_vision');
    expect(res.body.product.name).toContain('Retinol');
    expect(['buy', 'maybe', 'skip']).toContain(res.body.verdict);
    expect(typeof res.body.score).toBe('number');
    expect(Array.isArray(res.body.reasons)).toBe(true);
  });

  it('returns { identified: false } when the photo cannot be identified', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ identified: false, name: '', brand: '', ingredients: [] }) } }],
    });
    stubDb({});

    const res = await request(app)
      .post('/api/products/shopping-scan')
      .send({ image_base64: 'dGVzdA==' })
      .expect(200);

    expect(res.body.identified).toBe(false);
  });

  it('rejects an oversized image_base64 with 413', async () => {
    stubDb({});
    const hugeBase64 = 'x'.repeat(11 * 1024 * 1024);
    await request(app)
      .post('/api/products/shopping-scan')
      .send({ image_base64: hugeBase64 })
      .expect(413);
  });

  it('rejects a manual ingredient list over the 200-item bound with 400', async () => {
    stubDb({});
    await request(app)
      .post('/api/products/shopping-scan')
      .send({ name: 'Kitchen Sink', ingredients: new Array(201).fill('Water') })
      .expect(400);
  });

  it('rejects an over-long manual ingredient string with 400', async () => {
    stubDb({});
    await request(app)
      .post('/api/products/shopping-scan')
      .send({ name: 'Kitchen Sink', ingredients: ['x'.repeat(201)] })
      .expect(400);
  });

  it('sets partial:true (best-effort verdict preserved) when the active-routine load fails', async () => {
    // Goals + profile resolve; only the active-routine (product_catalog) query rejects.
    pool.query.mockImplementation((sql) => {
      if (/scan_protocols/.test(sql)) {
        return Promise.resolve({ rows: [{ primary_goal: 'skin_age' }] });
      }
      if (/user_profiles/.test(sql)) {
        return Promise.resolve({ rows: [] });
      }
      if (/product_catalog/.test(sql)) {
        return Promise.reject(new Error('connection reset'));
      }
      return Promise.resolve({ rows: [] });
    });

    // A retinol product that WOULD conflict against a routine retinoid had the shelf loaded;
    // because the shelf failed to load, no conflict is seen -> the danger we surface via partial.
    const res = await request(app)
      .post('/api/products/shopping-scan')
      .send({ name: 'Some Retinol Serum', ingredients: ['Retinol'] })
      .expect(200);

    expect(res.body.identified).toBe(true);
    expect(res.body.partial).toBe(true);
    expect(['buy', 'maybe', 'skip']).toContain(res.body.verdict);
  });

  it('omits partial on a successful scan where the routine loads cleanly', async () => {
    stubDb({ goal: 'acne', routine: [] });

    const res = await request(app)
      .post('/api/products/shopping-scan')
      .send({ barcode: '301871371054' })
      .expect(200);

    expect(res.body.identified).toBe(true);
    expect(res.body).not.toHaveProperty('partial');
    expect(res.body.partial).toBeUndefined();
  });

  it('does not add partial to a 400 identification-failure response', async () => {
    stubDb({});
    const res = await request(app)
      .post('/api/products/shopping-scan')
      .send({})
      .expect(400);
    expect(res.body).not.toHaveProperty('partial');
  });

});
