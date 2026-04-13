/**
 * Launch blocker tests — Issues #4, #2, #14, #13, #11
 *
 * Tests for:
 * - #4: POST /api/users uses Clerk user_id from req.auth (not gen_random_uuid)
 * - #2: DELETE /api/users/:id cascading account deletion
 * - #14: Input validation on POST /api/users
 * - #13: RAG seed endpoint requires ADMIN_SECRET
 * - #11: Rate limiting on POST /api/vision/analyze
 */

process.env.NODE_ENV = 'development';

// ---- Module mocks ----

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

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClient = {
  query: mockClientQuery,
  release: jest.fn(),
};

jest.mock('pg', () => {
  const mockPool = {
    query: mockQuery,
    connect: jest.fn().mockResolvedValue(mockClient),
  };
  return { Pool: jest.fn(() => mockPool) };
});

jest.mock('../rag', () => ({
  seedGuidelines: jest.fn().mockResolvedValue({ seeded: 0, categories: [] }),
  queryGuidelines: jest.fn().mockResolvedValue([]),
  queryGuidelinesMulti: jest.fn().mockResolvedValue([]),
}));

jest.mock('../image-processing', () => ({
  extractFeatures: jest.fn().mockRejectedValue(new Error('skip')),
  featuresToSignalScores: jest.fn(),
  extractSummaryFeatures: jest.fn(),
}));

jest.mock('../signal-models', () => ({
  runAllModels: jest.fn(),
  mergeSignalScores: jest.fn(),
  applyLesionFeedback: jest.fn(),
  runLesionDetector: jest.fn().mockResolvedValue([]),
}));

const request = require('supertest');
const app = require('../app');

// ---- Issue #4: POST /api/users uses Clerk user_id ----

describe('Issue #4: user_id from Clerk auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/users stores req.auth.userId as user_id (dev mode uses dev-user)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        user_id: 'dev-user',
        age_range: '25-34',
        location_coarse: 'New York',
        period_applicable: 'prefer_not',
      }],
    });

    const res = await request(app)
      .post('/api/users')
      .send({
        age_range: '25-34',
        location_coarse: 'New York',
      })
      .expect(201);

    // Verify the INSERT query includes user_id parameter
    const queryCall = mockQuery.mock.calls[0];
    const sql = queryCall[0];
    const params = queryCall[1];

    // user_id should be in the INSERT columns
    expect(sql).toContain('user_id');
    // First param should be the auth user ID (dev-user in dev mode)
    expect(params[0]).toBe('dev-user');
  });

  test('POST /api/users returns 409 if user already exists', async () => {
    // Simulate unique constraint violation
    const dupError = new Error('duplicate key value violates unique constraint');
    dupError.code = '23505';
    mockQuery.mockRejectedValueOnce(dupError);

    const res = await request(app)
      .post('/api/users')
      .send({
        age_range: '25-34',
        location_coarse: 'New York',
      })
      .expect(409);

    expect(res.body.error).toMatch(/already exists/i);
  });
});

// ---- Issue #2: Account deletion ----

describe('Issue #2: DELETE /api/users/:id account deletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('DELETE /api/users/:id returns 200 and cascading deletes data', async () => {
    // Mock the transactional client queries (BEGIN, 5 deletes, user delete, COMMIT)
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // delete model_outputs
      .mockResolvedValueOnce({ rows: [] }) // delete daily_records
      .mockResolvedValueOnce({ rows: [] }) // delete product_catalog
      .mockResolvedValueOnce({ rows: [] }) // delete scan_protocols
      .mockResolvedValueOnce({ rows: [] }) // delete report_artifacts
      .mockResolvedValueOnce({ rows: [{ user_id: 'dev-user' }], rowCount: 1 }) // delete user_profiles
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .delete('/api/users/dev-user')
      .expect(200);

    expect(res.body.success).toBe(true);
    // Should have called BEGIN, 6 deletes, COMMIT = 8 total
    expect(mockClientQuery.mock.calls.length).toBeGreaterThanOrEqual(7);
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('DELETE /api/users/:id returns 404 if user not found', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // delete model_outputs
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // delete daily_records
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // delete product_catalog
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // delete scan_protocols
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // delete report_artifacts
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // delete user_profiles — 0 rows = not found
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await request(app)
      .delete('/api/users/dev-user')
      .expect(404);

    expect(mockClient.release).toHaveBeenCalled();
  });
});

// ---- Issue #14: Input validation on POST /api/users ----

describe('Issue #14: Input validation on POST /api/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects invalid age_range', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({
        age_range: 'invalid_range',
        location_coarse: 'New York',
      })
      .expect(400);

    expect(res.body.error).toMatch(/age_range/i);
  });

  test('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({})
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  test('rejects invalid cycle_length_days', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({
        age_range: '25-34',
        location_coarse: 'New York',
        cycle_length_days: 999,
      })
      .expect(400);

    expect(res.body.error).toMatch(/cycle_length/i);
  });

  test('accepts valid input', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        user_id: 'dev-user',
        age_range: '25-34',
        location_coarse: 'New York',
        period_applicable: 'prefer_not',
      }],
    });

    await request(app)
      .post('/api/users')
      .send({
        age_range: '25-34',
        location_coarse: 'New York',
      })
      .expect(201);
  });
});

// ---- Issue #13: RAG seed endpoint security ----

describe('Issue #13: RAG seed endpoint requires ADMIN_SECRET', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST /api/rag/seed returns 403 without admin secret header', async () => {
    await request(app)
      .post('/api/rag/seed')
      .expect(403);
  });

  test('POST /api/rag/seed returns 403 with wrong admin secret', async () => {
    await request(app)
      .post('/api/rag/seed')
      .set('X-Admin-Secret', 'wrong-secret')
      .expect(403);
  });
});

// ---- IDOR fix: POST /api/model-outputs ownership check ----

describe('POST /api/model-outputs ownership check (IDOR fix)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 403 when authenticated user does not own the daily_id', async () => {
    // Ownership query returns no matching rows — user does not own this daily_id
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app)
      .post('/api/model-outputs')
      .send({
        daily_id: 'some-other-users-daily-id',
        acne_score: 10,
        sun_damage_score: 5,
        skin_age_score: 15,
        confidence: 'high',
        primary_driver: 'acne',
        recommended_action: 'Use retinol.',
      })
      .expect(403);

    expect(res.body.error).toMatch(/access denied/i);

    // Ownership query should have been called with the daily_id and the authenticated userId
    const ownershipCall = mockQuery.mock.calls[0];
    expect(ownershipCall[0]).toMatch(/daily_records/);
    expect(ownershipCall[1]).toEqual(['some-other-users-daily-id', 'dev-user']);
  });

  test('returns 201 and inserts when authenticated user owns the daily_id', async () => {
    const fakeRow = {
      output_id: 'abc-123',
      daily_id: 'owned-daily-id',
      acne_score: 10,
    };

    // First call: ownership check succeeds (rowCount: 1)
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ '?column?': 1 }] });
    // Second call: INSERT returns the new row
    mockQuery.mockResolvedValueOnce({ rows: [fakeRow] });

    const res = await request(app)
      .post('/api/model-outputs')
      .send({
        daily_id: 'owned-daily-id',
        acne_score: 10,
        sun_damage_score: 5,
        skin_age_score: 15,
        confidence: 'high',
        primary_driver: 'acne',
        recommended_action: 'Use retinol.',
      })
      .expect(201);

    expect(res.body.output_id).toBe('abc-123');

    // Ownership query should have been called first
    const ownershipCall = mockQuery.mock.calls[0];
    expect(ownershipCall[0]).toMatch(/daily_records/);
    expect(ownershipCall[1]).toEqual(['owned-daily-id', 'dev-user']);

    // INSERT should have been called second
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[0]).toMatch(/INSERT INTO model_outputs/);
  });
});

// ---- Issue #11: Rate limiting on vision/analyze ----

describe('Issue #11: Rate limiting on POST /api/vision/analyze', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 429 after exceeding rate limit', async () => {
    // This test verifies the rate limiter exists on the endpoint.
    // We need to make many rapid requests. The exact limit may vary
    // but we should get 429 eventually (or the route should have
    // the middleware attached).
    const modelOutput = {
      acne_score: 10,
      sun_damage_score: 5,
      skin_age_score: 15,
      confidence: 'high',
      primary_driver: 'general',
      recommended_action: 'Looking good.',
    };

    // Mock OpenAI to always succeed
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(modelOutput) } }],
    });

    const results = [];
    // Send 25 rapid requests (limit should be ~10/min per user)
    for (let i = 0; i < 25; i++) {
      results.push(
        request(app)
          .post('/api/vision/analyze')
          .send({
            image_base64: 'dGVzdA==',
            context: { primary_goal: 'acne tracking' },
          })
      );
    }

    const responses = await Promise.all(results);
    const statuses = responses.map((r) => r.status);

    // At least some should be rate limited
    expect(statuses).toContain(429);
  });
});
