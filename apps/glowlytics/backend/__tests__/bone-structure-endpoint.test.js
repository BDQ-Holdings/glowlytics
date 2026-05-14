/**
 * /api/vision/bone-structure endpoint tests — authorization, persistence
 * race-condition surface, vertex content validation, and the `persisted`
 * response flag.
 *
 * pg is mocked so we can drive ownership queries and UPDATE rowCount.
 */

process.env.NODE_ENV = 'development';

const mockQuery = jest.fn();

jest.mock('pg', () => {
  const mockPool = { query: (...args) => mockQuery(...args) };
  return { Pool: jest.fn(() => mockPool) };
});

jest.mock('openai', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../rag', () => ({
  seedGuidelines: jest.fn(),
  queryGuidelines: jest.fn(),
  queryGuidelinesMulti: jest.fn(),
}));

const request = require('supertest');
const app = require('../app');
const { MEDIAPIPE_LANDMARKS } = require('../bone-structure-3d');

// Synthesise the same fixture mesh the math test uses so we drive ok-status
// responses without exercising network/heavy logic.
function buildIdealMesh() {
  const t = MEDIAPIPE_LANDMARKS;
  const setVertex = (arr, idx, x, y, z) => { if (idx == null) return; arr[idx*3] = x; arr[idx*3+1] = y; arr[idx*3+2] = z; };
  const verts = new Array(1500 * 3).fill(0);
  setVertex(verts, t.trichion, 0, 50, 0);
  setVertex(verts, t.glabella, 0, 16.7, 10);
  setVertex(verts, t.pronasale, 0, -10, 22);
  setVertex(verts, t.subnasale, 0, -16.7, 12);
  setVertex(verts, t.menton, 0, -50, 8);
  setVertex(verts, t.pogonion, 0, -45, 11);
  setVertex(verts, t.inner_canthus_L, 9, 20, 8);
  setVertex(verts, t.inner_canthus_R, -9, 20, 8);
  setVertex(verts, t.outer_canthus_L, 27, 21.88, 6);
  setVertex(verts, t.outer_canthus_R, -27, 21.88, 6);
  setVertex(verts, t.zygion_L, 45, 0, 6);
  setVertex(verts, t.zygion_R, -45, 0, 6);
  setVertex(verts, t.gonion_L, 32.5, -25, 14);
  setVertex(verts, t.gonion_R, -32.5, -25, 14);
  setVertex(verts, t.tragion_L, 39, 10, 0);
  setVertex(verts, t.tragion_R, -39, 10, 0);
  setVertex(verts, t.alar_L, 11.25, -10, 12);
  setVertex(verts, t.alar_R, -11.25, -10, 12);
  setVertex(verts, t.upper_lip_top, 0, -22, 13);
  setVertex(verts, t.upper_eyelid_L, 18, 23, 7);
  setVertex(verts, t.upper_eyelid_R, -18, 23, 7);
  setVertex(verts, t.lower_eyelid_L, 18, 17, 7);
  setVertex(verts, t.lower_eyelid_R, -18, 17, 7);
  setVertex(verts, t.iris_L, 18, 20, 7);
  setVertex(verts, t.iris_R, -18, 20, 7);
  setVertex(verts, t.brow_apex_L, 20, 26, 6);
  setVertex(verts, t.brow_apex_R, -20, 26, 6);
  setVertex(verts, t.brow_inner_L, 11, 25, 7);
  setVertex(verts, t.brow_inner_R, -11, 25, 7);
  return verts;
}

const BODY_BASE = (overrides = {}) => ({
  mesh: { vertices: buildIdealMesh(), source: 'mediapipe', ...overrides.mesh },
  ...overrides,
});

beforeEach(() => {
  mockQuery.mockReset();
  // Each test in this file shares an in-memory rate-limiter; reset it so a long
  // run of valid posts doesn't trip the 10-per-minute cap.
  if (app._resetRateLimiters) app._resetRateLimiters();
});

describe('POST /api/vision/bone-structure — input validation', () => {
  test('rejects missing mesh.vertices with 400', async () => {
    const res = await request(app).post('/api/vision/bone-structure').send({ mesh: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/vertices is required/);
  });

  test('rejects vertices length not divisible by 3', async () => {
    const res = await request(app).post('/api/vision/bone-structure').send({ mesh: { vertices: [1, 2, 3, 4], source: 'mediapipe' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/divisible by 3/);
  });

  test('rejects oversized mesh with 413', async () => {
    const tooMany = new Array(1501 * 3).fill(0);
    const res = await request(app).post('/api/vision/bone-structure').send({ mesh: { vertices: tooMany, source: 'mediapipe' } });
    expect(res.status).toBe(413);
  });

  test('rejects non-finite vertex values', async () => {
    const verts = buildIdealMesh();
    verts[0] = NaN;
    const res = await request(app).post('/api/vision/bone-structure').send({ mesh: { vertices: verts, source: 'mediapipe' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/finite numbers/);
  });

  test('rejects string vertex values', async () => {
    const verts = buildIdealMesh();
    verts[0] = 'oops';
    const res = await request(app).post('/api/vision/bone-structure').send({ mesh: { vertices: verts, source: 'mediapipe' } });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/vision/bone-structure — analysis path', () => {
  test('returns ok status + harmony for valid mesh (no daily_id)', async () => {
    const res = await request(app).post('/api/vision/bone-structure').send(BODY_BASE());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.harmony).toBe('number');
    expect(res.body.persisted).toBe(false); // no daily_id → no persistence attempt
  });

  test('includes downsampled_mesh with ≤200 vertices', async () => {
    const res = await request(app).post('/api/vision/bone-structure').send(BODY_BASE());
    expect(res.status).toBe(200);
    expect(res.body.downsampled_mesh).toBeDefined();
    expect(res.body.downsampled_mesh.vertices.length % 3).toBe(0);
    expect(res.body.downsampled_mesh.vertices.length / 3).toBeLessThanOrEqual(200);
  });

  test('surfaces interventions bundle with procedural disclaimer', async () => {
    const res = await request(app).post('/api/vision/bone-structure').send(BODY_BASE());
    expect(res.status).toBe(200);
    expect(res.body.interventions).toBeDefined();
    expect(Array.isArray(res.body.interventions.lifestyle)).toBe(true);
    expect(typeof res.body.interventions.procedural_disclaimer).toBe('string');
  });
});

describe('POST /api/vision/bone-structure — persistence + authorization (dev mode)', () => {
  // In dev mode (req.auth.userId = 'dev-user'), the endpoint skips ownership
  // and the user_profiles sex lookup — so the only DB call is the UPDATE.
  test('dev mode accepts daily_id without ownership check, persists when row exists', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE

    const res = await request(app)
      .post('/api/vision/bone-structure')
      .send({ ...BODY_BASE(), daily_id: 'd-test' });

    expect(res.status).toBe(200);
    expect(res.body.persisted).toBe(true);

    const updCall = mockQuery.mock.calls.find((c) => /UPDATE model_outputs/.test(c[0]));
    expect(updCall).toBeDefined();
    expect(updCall[1]).toContain('d-test');
  });

  test('persisted=false when UPDATE matches zero rows', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app)
      .post('/api/vision/bone-structure')
      .send({ ...BODY_BASE(), daily_id: 'd-missing' });

    expect(res.status).toBe(200);
    expect(res.body.persisted).toBe(false);
    expect(typeof res.body.harmony).toBe('number');
  });

  test('UPDATE error degrades to persisted=false rather than 500', async () => {
    mockQuery.mockRejectedValueOnce(new Error('pg: connection lost'));

    const res = await request(app)
      .post('/api/vision/bone-structure')
      .send({ ...BODY_BASE(), daily_id: 'd-flaky' });

    expect(res.status).toBe(200);
    expect(res.body.persisted).toBe(false);
  });
});

describe('POST /api/vision/bone-structure — sex resolution', () => {
  test('explicit sex_override beats the user-profile lookup', async () => {
    // No sex lookup should fire when override is present.
    const res = await request(app).post('/api/vision/bone-structure').send({
      ...BODY_BASE(),
      sex_override: 'female',
    });
    expect(res.status).toBe(200);
    expect(res.body.sex).toBe('female');
  });

  test('invalid sex_override falls back to null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // sex lookup (user not in db)
    const res = await request(app).post('/api/vision/bone-structure').send({
      ...BODY_BASE(),
      sex_override: 'banana',
    });
    expect(res.status).toBe(200);
    expect(res.body.sex).toBeNull();
  });
});
