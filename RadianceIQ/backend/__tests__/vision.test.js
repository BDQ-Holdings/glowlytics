/**
 * Vision API endpoint tests — POST /api/vision/analyze
 *
 * These tests verify the backend vision proxy that sits between the mobile app
 * and the fine-tuned GPT-4o model. The proxy handles input validation, JSON
 * parsing (including markdown code-block stripping), score clamping (0-100),
 * confidence validation, error mapping (401 -> 502, 429 -> 429), condition
 * detection with zone-level granularity, and RAG-based guideline recommendations.
 *
 * We mock three external dependencies:
 *   - openai: so no real API calls are made
 *   - pg: so no database connection is attempted on import
 *   - rag: so no Pinecone calls are made (queryGuidelines is mocked)
 */

process.env.NODE_ENV = 'development';

// ---- Module mocks (must be before require) ----

const mockCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));
});

jest.mock('pg', () => {
  const mockPool = { query: jest.fn() };
  return { Pool: jest.fn(() => mockPool) };
});

const mockQueryGuidelines = jest.fn();
const mockQueryGuidelinesMulti = jest.fn();

jest.mock('../rag', () => ({
  seedGuidelines: jest.fn(),
  queryGuidelines: mockQueryGuidelines,
  queryGuidelinesMulti: mockQueryGuidelinesMulti,
}));

const request = require('supertest');
const app = require('../app');

// ---- Helpers ----

const VALID_BODY = {
  image_base64: 'dGVzdGltYWdlZGF0YQ==',
  context: {
    primary_goal: 'acne tracking',
    scan_region: 'full face',
    sunscreen_used: true,
    sleep_quality: 'good',
    stress_level: 'low',
    scan_count: 5,
  },
};

function mockVisionResponse(jsonObj) {
  mockCreate.mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: JSON.stringify(jsonObj),
        },
      },
    ],
  });
}

// ---- Tests ----

describe('POST /api/vision/analyze', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset rate limiters so tests don't interfere with each other
    if (app._resetRateLimiters) app._resetRateLimiters();
    // By default, PINECONE_API_KEY is not set so RAG is skipped
    delete process.env.PINECONE_API_KEY;
  });

  // ==================== Original tests (updated for new additive fields) ====================

  test('valid request returns core 6 fields plus new additive fields', async () => {
    const modelOutput = {
      acne_score: 25,
      sun_damage_score: 10,
      skin_age_score: 40,
      confidence: 'high',
      primary_driver: 'acne',
      recommended_action: 'Continue retinoid use.',
    };
    mockVisionResponse(modelOutput);

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    // Original 6 fields still present and correct
    expect(res.body.acne_score).toBe(25);
    expect(res.body.sun_damage_score).toBe(10);
    expect(res.body.skin_age_score).toBe(40);
    expect(res.body.confidence).toBe('high');
    expect(res.body.primary_driver).toBe('acne');
    expect(res.body.recommended_action).toBe('Continue retinoid use.');

    // New additive fields default gracefully when model doesn't return them
    expect(res.body.conditions).toEqual([]);
    expect(res.body.rag_recommendations).toEqual([]);
    expect(res.body.personalized_feedback).toBe('');

    // Signal-specific fields are present (from 3-layer pipeline)
    expect(res.body.signal_scores).toBeDefined();
    expect(typeof res.body.signal_scores.structure).toBe('number');
    expect(typeof res.body.signal_scores.hydration).toBe('number');
    expect(typeof res.body.signal_scores.inflammation).toBe('number');
    expect(typeof res.body.signal_scores.sunDamage).toBe('number');
    expect(typeof res.body.signal_scores.elasticity).toBe('number');
    expect(res.body.signal_confidence).toBeDefined();
    expect(Array.isArray(res.body.lesions)).toBe(true);

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test('handles markdown code blocks in model response', async () => {
    const wrappedResponse = '```json\n{"acne_score":30,"sun_damage_score":15,"skin_age_score":20,"confidence":"med","primary_driver":"sun_damage","recommended_action":"Apply SPF daily."}\n```';

    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: wrappedResponse } }],
    });

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    expect(res.body.acne_score).toBe(30);
    expect(res.body.sun_damage_score).toBe(15);
    expect(res.body.confidence).toBe('med');
  });

  test('scores are clamped to 0-100', async () => {
    const modelOutput = {
      acne_score: 150,
      sun_damage_score: -20,
      skin_age_score: 250,
      confidence: 'high',
      primary_driver: 'acne',
      recommended_action: 'See a dermatologist.',
    };
    mockVisionResponse(modelOutput);

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    expect(res.body.acne_score).toBe(100);
    expect(res.body.sun_damage_score).toBe(0);
    expect(res.body.skin_age_score).toBe(100);
  });

  test('invalid confidence defaults to low', async () => {
    const modelOutput = {
      acne_score: 20,
      sun_damage_score: 10,
      skin_age_score: 30,
      confidence: 'super_high',
      primary_driver: 'general',
      recommended_action: 'Keep it up.',
    };
    mockVisionResponse(modelOutput);

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    expect(res.body.confidence).toBe('low');
  });

  test('returns 400 when image_base64 is missing', async () => {
    const res = await request(app)
      .post('/api/vision/analyze')
      .send({ context: VALID_BODY.context })
      .expect(400);

    expect(res.body.error).toMatch(/image_base64/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('returns 400 when context is missing', async () => {
    const res = await request(app)
      .post('/api/vision/analyze')
      .send({ image_base64: VALID_BODY.image_base64 })
      .expect(400);

    expect(res.body.error).toMatch(/context/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('returns 502 on empty model response', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '' } }],
    });

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(502);

    expect(res.body.error).toMatch(/empty/i);
  });

  test('returns 502 on non-JSON model response', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'I cannot analyze this image.' } }],
    });

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(502);

    expect(res.body.error).toMatch(/could not parse/i);
  });

  test('returns 502 on invalid API key', async () => {
    const err = new Error('Incorrect API key provided');
    err.status = 401;
    err.code = 'invalid_api_key';
    mockCreate.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(502);

    expect(res.body.error).toMatch(/api key/i);
  });

  test('returns 429 on rate limit', async () => {
    const err = new Error('Rate limit exceeded');
    err.status = 429;
    mockCreate.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(429);

    expect(res.body.error).toMatch(/rate limit/i);
  });

  // ==================== Phase 2: Condition detection tests ====================

  test('response includes conditions array when model returns them', async () => {
    const modelOutput = {
      acne_score: 45,
      sun_damage_score: 20,
      skin_age_score: 30,
      confidence: 'high',
      primary_driver: 'acne',
      recommended_action: 'Use benzoyl peroxide on affected areas.',
      conditions: [
        {
          name: 'acne',
          severity: 'moderate',
          zones: [
            { region: 'chin', severity: 'moderate' },
            { region: 'forehead', severity: 'mild' },
          ],
          description: 'Inflammatory acne with papules concentrated on the chin.',
        },
        {
          name: 'dehydration',
          severity: 'mild',
          zones: [
            { region: 'left_cheek', severity: 'mild' },
          ],
          description: 'Mild dehydration visible on left cheek area.',
        },
      ],
      personalized_feedback: 'Focus on treating chin acne with targeted spot treatment.',
    };
    mockVisionResponse(modelOutput);

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    expect(res.body.conditions).toHaveLength(2);
    expect(res.body.conditions[0].name).toBe('acne');
    expect(res.body.conditions[0].severity).toBe('moderate');
    expect(res.body.conditions[0].zones).toHaveLength(2);
    expect(res.body.conditions[0].zones[0].region).toBe('chin');
    expect(res.body.conditions[1].name).toBe('dehydration');
  });

  test('response includes empty conditions array when model does not return them', async () => {
    // Simulates the fine-tuned model only returning the original 6 fields
    const modelOutput = {
      acne_score: 25,
      sun_damage_score: 10,
      skin_age_score: 40,
      confidence: 'high',
      primary_driver: 'acne',
      recommended_action: 'Continue retinoid use.',
    };
    mockVisionResponse(modelOutput);

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    expect(res.body.conditions).toEqual([]);
    // Original fields still intact
    expect(res.body.acne_score).toBe(25);
    expect(res.body.primary_driver).toBe('acne');
  });

  test('malformed conditions are filtered out', async () => {
    const modelOutput = {
      acne_score: 30,
      sun_damage_score: 15,
      skin_age_score: 25,
      confidence: 'med',
      primary_driver: 'acne',
      recommended_action: 'Spot treat breakouts.',
      conditions: [
        // Valid condition
        {
          name: 'acne',
          severity: 'mild',
          zones: [{ region: 'forehead', severity: 'mild' }],
          description: 'Minor comedonal acne on forehead.',
        },
        // Missing name
        {
          severity: 'moderate',
          zones: [{ region: 'chin', severity: 'moderate' }],
          description: 'No name field.',
        },
        // Invalid severity
        {
          name: 'rosacea',
          severity: 'extreme',
          zones: [{ region: 'nose', severity: 'extreme' }],
          description: 'Invalid severity value.',
        },
        // Zones is not an array
        {
          name: 'dark_circles',
          severity: 'mild',
          zones: 'under_eye',
          description: 'Zones should be an array.',
        },
        // Missing description
        {
          name: 'dehydration',
          severity: 'mild',
          zones: [],
        },
        // null entry
        null,
      ],
    };
    mockVisionResponse(modelOutput);

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    // Only the first valid condition survives filtering
    expect(res.body.conditions).toHaveLength(1);
    expect(res.body.conditions[0].name).toBe('acne');
  });

  // ==================== Phase 2: Personalized feedback tests ====================

  test('personalized_feedback is passed through when present', async () => {
    const modelOutput = {
      acne_score: 20,
      sun_damage_score: 35,
      skin_age_score: 15,
      confidence: 'high',
      primary_driver: 'sun_damage',
      recommended_action: 'Apply SPF 50 daily.',
      personalized_feedback: 'Your sun damage shows early signs of hyperpigmentation. Consider adding a vitamin C serum in the morning. Reapply sunscreen every 2 hours when outdoors.',
    };
    mockVisionResponse(modelOutput);

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    expect(res.body.personalized_feedback).toBe(
      'Your sun damage shows early signs of hyperpigmentation. Consider adding a vitamin C serum in the morning. Reapply sunscreen every 2 hours when outdoors.'
    );
  });

  // ==================== Phase 2: RAG integration tests ====================

  test('response includes rag_recommendations when RAG is available', async () => {
    // Enable Pinecone for this test
    process.env.PINECONE_API_KEY = 'test-pinecone-key';

    const modelOutput = {
      acne_score: 55,
      sun_damage_score: 20,
      skin_age_score: 30,
      confidence: 'high',
      primary_driver: 'acne',
      recommended_action: 'Use benzoyl peroxide.',
      conditions: [
        {
          name: 'acne',
          severity: 'moderate',
          zones: [{ region: 'chin', severity: 'moderate' }],
          description: 'Moderate inflammatory acne.',
        },
      ],
    };
    mockVisionResponse(modelOutput);

    // Mock RAG returning guideline results (now uses queryGuidelinesMulti)
    mockQueryGuidelinesMulti.mockResolvedValueOnce([
      {
        id: 'aad-acne-mgmt-01',
        score: 0.92,
        text: 'AAD Acne Management: For mild acne, topical retinoids are first-line therapy.',
        category: 'acne_management',
        signal: 'inflammation',
        evidence_level: 'A',
      },
      {
        id: 'aad-acne-mgmt-02',
        score: 0.87,
        text: 'AAD Acne Management: For moderate inflammatory acne, combination therapy is recommended.',
        category: 'acne_management',
        signal: 'inflammation',
        evidence_level: 'A',
      },
    ]);

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    expect(res.body.rag_recommendations).toHaveLength(2);
    expect(res.body.rag_recommendations[0]).toEqual({
      text: 'AAD Acne Management: For mild acne, topical retinoids are first-line therapy.',
      category: 'acne_management',
      relevance: 0.92,
      signal: 'inflammation',
      evidence_level: 'A',
      source_citation: '',
    });
    expect(res.body.rag_recommendations[1].category).toBe('acne_management');

    // Verify queryGuidelinesMulti was called
    expect(mockQueryGuidelinesMulti).toHaveBeenCalled();
  });

  test('response includes empty rag_recommendations when RAG fails (graceful degradation)', async () => {
    // Enable Pinecone for this test
    process.env.PINECONE_API_KEY = 'test-pinecone-key';

    const modelOutput = {
      acne_score: 40,
      sun_damage_score: 10,
      skin_age_score: 20,
      confidence: 'high',
      primary_driver: 'acne',
      recommended_action: 'Continue current routine.',
    };
    mockVisionResponse(modelOutput);

    // Mock RAG throwing an error
    mockQueryGuidelinesMulti.mockRejectedValueOnce(new Error('Pinecone connection timed out'));

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    // Vision analysis succeeds despite RAG failure
    expect(res.body.acne_score).toBe(40);
    expect(res.body.rag_recommendations).toEqual([]);
    // All original fields still present
    expect(res.body.primary_driver).toBe('acne');
    expect(res.body.recommended_action).toBe('Continue current routine.');
  });

  test('RAG is skipped when PINECONE_API_KEY is not set', async () => {
    // PINECONE_API_KEY is deleted in beforeEach
    const modelOutput = {
      acne_score: 30,
      sun_damage_score: 15,
      skin_age_score: 25,
      confidence: 'med',
      primary_driver: 'general tracking',
      recommended_action: 'Keep scanning daily.',
    };
    mockVisionResponse(modelOutput);

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    expect(res.body.rag_recommendations).toEqual([]);
    expect(mockQueryGuidelinesMulti).not.toHaveBeenCalled();
  });
});
