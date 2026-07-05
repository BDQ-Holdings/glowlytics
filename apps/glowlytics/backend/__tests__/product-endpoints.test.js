/**
 * Tests for enhanced product search, barcode enrichment, and photo identification endpoints.
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
    chat: {
      completions: {
        create: mockCreate,
      },
    },
    embeddings: {
      create: jest.fn(),
    },
  }));
});

jest.mock('pg', () => {
  const mockPool = { query: jest.fn() };
  // db-init.js calls types.setTypeParser at require time; provide it so the
  // schema/migration structural tests below can require('../db-init') safely.
  return { Pool: jest.fn(() => mockPool), types: { setTypeParser: jest.fn() } };
});

jest.mock('../rag', () => ({
  seedGuidelines: jest.fn(),
  queryGuidelines: jest.fn(),
  queryGuidelinesMulti: jest.fn().mockResolvedValue([]),
}));

// Mock external fetch for OBF/OFF APIs
const originalFetch = global.fetch;
const mockFetch = jest.fn();

const request = require('supertest');
const app = require('../app');
const { Pool } = require('pg');
const pool = new Pool();
const dbInit = require('../db-init');

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
  app._resetRateLimiters();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('GET /api/products/search', () => {
  it('returns curated results for "panoxyl"', async () => {
    // Mock external APIs to return empty (curated DB should still return results)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ products: [] }),
    });

    const res = await request(app)
      .get('/api/products/search?q=panoxyl')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].name.toLowerCase()).toContain('panoxyl');
    expect(res.body[0].source).toBe('curated');
    expect(res.body[0].ingredients).toBeTruthy();
  });

  it('returns curated results for "byoma"', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ products: [] }),
    });

    const res = await request(app)
      .get('/api/products/search?q=byoma')
      .expect(200);

    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].brands).toBe('Byoma');
  });

  it('merges curated + external results without duplicates', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [
          { product_name: 'CeraVe Foaming Facial Cleanser', brands: 'CeraVe', ingredients_text: 'Water', image_url: null },
          { product_name: 'Some Other Product', brands: 'Other', ingredients_text: 'Water, Glycerin', image_url: null },
        ],
      }),
    });

    const res = await request(app)
      .get('/api/products/search?q=cerave foaming')
      .expect(200);

    // Should not have duplicate CeraVe entries
    const names = res.body.map(r => r.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it('rejects queries shorter than 2 characters', async () => {
    await request(app)
      .get('/api/products/search?q=a')
      .expect(400);
  });

  it('falls back to curated-only when external APIs fail', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const res = await request(app)
      .get('/api/products/search?q=cerave')
      .expect(200);

    expect(res.body.length).toBeGreaterThan(0);
  });

  it('caps results at 15', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        products: Array.from({ length: 20 }, (_, i) => ({
          product_name: `Product ${i}`,
          brands: 'Brand',
          ingredients_text: 'Water',
          image_url: null,
        })),
      }),
    });

    const res = await request(app)
      .get('/api/products/search?q=product')
      .expect(200);

    expect(res.body.length).toBeLessThanOrEqual(15);
  });
});

describe('GET /api/products/lookup/:barcode', () => {
  it('returns curated product for known barcode', async () => {
    const res = await request(app)
      .get('/api/products/lookup/301871371054')
      .expect(200);

    expect(res.body.name).toContain('CeraVe');
    expect(res.body.source).toBe('curated');
    expect(res.body.ingredients).toBeTruthy();
  });

  it('falls back to external APIs for unknown barcode', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({
          status: 1,
          product: { product_name: 'External Product', ingredients_text: 'Water, Glycerin' },
        }),
      });

    const res = await request(app)
      .get('/api/products/lookup/9999999999999')
      .expect(200);

    expect(res.body.name).toBe('External Product');
  });

  it('enriches missing ingredients from curated DB', async () => {
    // Mock: UPCitemdb returns name only (no ingredients) for a known curated product name
    mockFetch
      .mockResolvedValueOnce({ json: async () => ({ status: 0 }) }) // OBF miss
      .mockResolvedValueOnce({ json: async () => ({ status: 0 }) }) // OFF miss
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ title: 'CeraVe Moisturizing Cream' }] }),
      }); // UPCitemdb returns name only

    const res = await request(app)
      .get('/api/products/lookup/0000000000001')
      .expect(200);

    expect(res.body.name).toBe('CeraVe Moisturizing Cream');
    // Should have been enriched with curated ingredients
    expect(res.body.ingredients).toBeTruthy();
    expect(res.body.ingredients.length).toBeGreaterThan(0);
  });

  it('returns 404 for completely unknown barcode', async () => {
    mockFetch
      .mockResolvedValueOnce({ json: async () => ({ status: 0 }) })
      .mockResolvedValueOnce({ json: async () => ({ status: 0 }) })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false });

    await request(app)
      .get('/api/products/lookup/0000000000000')
      .expect(404);
  });
});

describe('POST /api/products/identify-photo', () => {
  it('returns identified product from GPT-4o vision', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            identified: true,
            name: 'CeraVe Foaming Facial Cleanser',
            brand: 'CeraVe',
            ingredients: ['Water', 'Niacinamide', 'Ceramides'],
            confidence: 'high',
          }),
        },
      }],
    });

    const res = await request(app)
      .post('/api/products/identify-photo')
      .send({ image_base64: 'dGVzdA==' })
      .expect(200);

    expect(res.body.identified).toBe(true);
    expect(res.body.name).toContain('CeraVe');
    expect(res.body.brand).toBe('CeraVe');
    expect(res.body.ingredients.length).toBeGreaterThan(0);
  });

  it('enriches GPT-4o result from curated DB', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            identified: true,
            name: 'PanOxyl Acne Foaming Wash 10%',
            brand: 'PanOxyl',
            ingredients: ['Benzoyl Peroxide'],
            confidence: 'med',
          }),
        },
      }],
    });

    const res = await request(app)
      .post('/api/products/identify-photo')
      .send({ image_base64: 'dGVzdA==' })
      .expect(200);

    // Curated DB has more ingredients — should enrich
    expect(res.body.ingredients.length).toBeGreaterThan(1);
  });

  it('handles GPT-4o response wrapped in code fences', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: '```json\n{"identified": true, "name": "Test Product", "brand": "Test", "ingredients": ["Water"], "confidence": "low"}\n```',
        },
      }],
    });

    const res = await request(app)
      .post('/api/products/identify-photo')
      .send({ image_base64: 'dGVzdA==' })
      .expect(200);

    expect(res.body.identified).toBe(true);
    expect(res.body.name).toBe('Test Product');
  });

  it('returns identified: false when product not recognized', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({ identified: false, name: '', brand: '', ingredients: [], confidence: 'low' }),
        },
      }],
    });

    const res = await request(app)
      .post('/api/products/identify-photo')
      .send({ image_base64: 'dGVzdA==' })
      .expect(200);

    expect(res.body.identified).toBe(false);
  });

  it('returns 400 when image_base64 is missing', async () => {
    await request(app)
      .post('/api/products/identify-photo')
      .send({})
      .expect(400);
  });

  it('returns 413 when image is too large', async () => {
    const hugeBase64 = 'x'.repeat(11 * 1024 * 1024);

    await request(app)
      .post('/api/products/identify-photo')
      .send({ image_base64: hugeBase64 })
      .expect(413);
  });

  it('rate limits after 5 requests', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"identified": false}' } }],
    });

    // First 5 should succeed
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/products/identify-photo')
        .send({ image_base64: 'dGVzdA==' })
        .expect(200);
    }

    // 6th should be rate limited
    await request(app)
      .post('/api/products/identify-photo')
      .send({ image_base64: 'dGVzdA==' })
      .expect(429);
  });

  it('handles unparseable GPT-4o response gracefully', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'I cannot identify this product.' } }],
    });

    const res = await request(app)
      .post('/api/products/identify-photo')
      .send({ image_base64: 'dGVzdA==' })
      .expect(200);

    expect(res.body.identified).toBe(false);
  });
});

// A-fix: the mobile shelf keeps a product `image_url` (from barcode/search
// lookups). It must survive the backend round-trip — POST /api/products has to
// persist it and GET /api/products/:userId (SELECT *) has to hand it back —
// otherwise hydrateForUser overwrites the local shelf with imageless server
// rows and the thumbnails vanish on the second signed-in launch.
describe('product_catalog image_url column (db-init structural)', () => {
  it('declares image_url TEXT on the product_catalog CREATE TABLE', () => {
    const table = dbInit.schema.match(
      /CREATE TABLE IF NOT EXISTS product_catalog[\s\S]*?\);/
    );
    expect(table).not.toBeNull();
    expect(table[0]).toMatch(/image_url\s+TEXT/);
  });

  it('ships a guarded ALTER migration adding image_url for existing deployments', async () => {
    const migrationPool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await dbInit.initSchema(migrationPool);
    const ddl = migrationPool.query.mock.calls.map((c) => c[0]).join('\n');
    expect(ddl).toMatch(
      /ALTER TABLE product_catalog ADD COLUMN IF NOT EXISTS image_url/
    );
  });
});

describe('POST + GET /api/products image_url round-trip', () => {
  it('includes image_url in the INSERT column list + values and echoes it back', async () => {
    const imageUrl = 'https://images.example/cerave-cleanser.png';
    let insertSql = '';
    let insertParams = [];
    pool.query.mockImplementation((sql, params) => {
      insertSql = sql;
      insertParams = params;
      // RETURNING * echoes the row the DB stored; post-migration the column
      // exists so the inserted image_url comes straight back.
      return Promise.resolve({
        rows: [{ user_product_id: 'prod_1', image_url: imageUrl }],
      });
    });

    const res = await request(app)
      .post('/api/products')
      .send({
        product_name: 'CeraVe Foaming Cleanser',
        product_capture_method: 'barcode',
        ingredients_list: ['Ceramides', 'Niacinamide'],
        usage_schedule: 'both',
        start_date: '2026-03-01',
        image_url: imageUrl,
      })
      .expect(201);

    expect(insertSql).toContain('INSERT INTO product_catalog');
    expect(insertSql).toMatch(/image_url/);
    expect(insertParams).toContain(imageUrl);
    expect(res.body.image_url).toBe(imageUrl);
  });

  it('returns image_url on GET (SELECT * flows the column through)', async () => {
    const imageUrl = 'https://images.example/anthelios-spf.png';
    pool.query.mockResolvedValueOnce({
      rows: [{ user_product_id: 'prod_2', product_name: 'Anthelios', image_url: imageUrl }],
    });

    const res = await request(app).get('/api/products/dev-user').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].image_url).toBe(imageUrl);
  });
});
