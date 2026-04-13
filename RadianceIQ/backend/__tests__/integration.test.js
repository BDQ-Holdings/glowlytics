/**
 * Integration tests — supertest against the Express app
 *
 * These are higher-level tests that exercise the full middleware stack
 * (CORS, JSON parsing, auth middleware, route handlers) using supertest.
 * All external services (OpenAI, PostgreSQL) are mocked at the module level.
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

jest.mock('pg', () => {
  const mockPool = { query: jest.fn() };
  return { Pool: jest.fn(() => mockPool) };
});

jest.mock('../rag', () => ({
  seedGuidelines: jest.fn(),
  queryGuidelines: jest.fn(),
  queryGuidelinesMulti: jest.fn().mockResolvedValue([]),
}));

const request = require('supertest');
const app = require('../app');

// ---- Tests ----

describe('Integration tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/health returns 200 with status ok', async () => {
    const res = await request(app)
      .get('/api/health')
      .expect(200);

    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    // Verify timestamp is a valid ISO string
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  test('POST /api/vision/analyze with mocked OpenAI returns valid response in dev mode', async () => {
    const modelOutput = {
      acne_score: 35,
      sun_damage_score: 20,
      skin_age_score: 45,
      confidence: 'med',
      primary_driver: 'sun_damage',
      recommended_action: 'Increase SPF usage.',
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(modelOutput) } }],
    });

    const res = await request(app)
      .post('/api/vision/analyze')
      .send({
        image_base64: 'dGVzdA==',
        context: {
          primary_goal: 'general tracking',
          scan_region: 'full face',
        },
      })
      .expect(200);

    // Original 6 fields are preserved; new additive fields (conditions,
    // rag_recommendations, personalized_feedback) are also present.
    expect(res.body).toMatchObject(modelOutput);
    expect(res.body.conditions).toEqual([]);
    expect(res.body.rag_recommendations).toEqual([]);
    expect(res.body.personalized_feedback).toBe('');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // Verify the OpenAI call includes the image
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(2);
    expect(callArgs.messages[0].role).toBe('system');
    expect(callArgs.messages[1].role).toBe('user');
  });

  test('auth middleware passes in dev mode without a token', async () => {
    // The health endpoint is public (before authMiddleware), so test a
    // protected endpoint -- vision/analyze requires auth middleware.
    // In dev mode (NODE_ENV=development), unauthenticated requests pass through.
    const modelOutput = {
      acne_score: 10,
      sun_damage_score: 5,
      skin_age_score: 15,
      confidence: 'high',
      primary_driver: 'general',
      recommended_action: 'Looking good.',
    };

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(modelOutput) } }],
    });

    // No Authorization header -- should still pass in dev mode
    const res = await request(app)
      .post('/api/vision/analyze')
      .send({
        image_base64: 'dGVzdA==',
        context: { primary_goal: 'acne tracking' },
      })
      .expect(200);

    // If auth blocked us, we would get 401 -- 200 proves dev-mode passthrough works
    expect(res.body.acne_score).toBe(10);
    expect(res.body.confidence).toBe('high');
  });
});
