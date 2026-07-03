/**
 * /api/vision/bone-structure endpoint tests — validation, persistence race
 * surface, source/count coherence, and payload honesty fields.
 */

process.env.NODE_ENV = 'development';
process.env.CLERK_ISSUER_URL = '';

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

function setVertex(arr, idx, x, y, z) {
  if (idx == null) return;
  arr[idx * 3 + 0] = x;
  arr[idx * 3 + 1] = y;
  arr[idx * 3 + 2] = z;
}

function buildIndexedMesh() {
  const t = MEDIAPIPE_LANDMARKS;
  const verts = new Array(474 * 3).fill(0);
  setVertex(verts, t.trichion, 0, 82.62, 44.82);
  setVertex(verts, t.glabella, 0, 48.86, 53.85);
  setVertex(verts, t.pronasale, 0, -11.27, 74.76);
  setVertex(verts, t.subnasale, 0, -20.89, 60.58);
  setVertex(verts, t.menton, 0, -94.0, 42.6);
  setVertex(verts, t.pogonion, 0, -37.07, 58.65);
  setVertex(verts, t.upper_lip_top, 0, -34.06, 59.8);
  setVertex(verts, t.stomion, 0, -39.18, 55.69);
  setVertex(verts, t.lower_lip_bot, 0, -53.65, 55.35);
  setVertex(verts, t.inner_canthus_L, -18.6, 25.9, 37.6);
  setVertex(verts, t.inner_canthus_R, 18.6, 25.9, 37.6);
  setVertex(verts, t.outer_canthus_L, -44.5, 26.6, 31.7);
  setVertex(verts, t.outer_canthus_R, 44.5, 26.6, 31.7);
  setVertex(verts, t.upper_eyelid_L, -32, 32, 41);
  setVertex(verts, t.upper_eyelid_R, 32, 32, 41);
  setVertex(verts, t.lower_eyelid_L, -32, 20, 38);
  setVertex(verts, t.lower_eyelid_R, 32, 20, 38);
  setVertex(verts, t.iris_L, -31.5, 26, 40);
  setVertex(verts, t.iris_R, 31.5, 26, 40);
  setVertex(verts, t.brow_apex_L, -36, 43, 39);
  setVertex(verts, t.brow_apex_R, 36, 43, 39);
  setVertex(verts, t.brow_inner_L, -15, 39, 44);
  setVertex(verts, t.brow_inner_R, 15, 39, 44);
  setVertex(verts, t.alar_L, -16, -15, 55);
  setVertex(verts, t.alar_R, 16, -15, 55);
  setVertex(verts, t.zygion_L, -76.6, 6.7, -24.4);
  setVertex(verts, t.zygion_R, 76.6, 6.7, -24.4);
  setVertex(verts, t.tragion_L, -72, 8, -30);
  setVertex(verts, t.tragion_R, 72, 8, -30);
  setVertex(verts, t.gonion_L, -59.4, -62.2, -6.3);
  setVertex(verts, t.gonion_R, 59.4, -62.2, -6.3);
  setVertex(verts, t.cheilion_L, -26, -41, 53);
  setVertex(verts, t.cheilion_R, 26, -41, 53);
  return verts;
}

const BODY_BASE = (overrides = {}) => ({
  mesh: { vertices: buildIndexedMesh(), source: 'canonical', ...overrides.mesh },
  ...overrides,
});

beforeEach(() => {
  mockQuery.mockReset();
  if (app._resetRateLimiters) app._resetRateLimiters();
});

describe('POST /api/vision/bone-structure — input validation', () => {
  test('rejects missing mesh.vertices with 400', async () => {
    const res = await request(app).post('/api/vision/bone-structure').send({ mesh: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/vertices is required/);
  });

  test('rejects vertices length not divisible by 3', async () => {
    const res = await request(app).post('/api/vision/bone-structure').send({ mesh: { vertices: [1, 2, 3, 4], source: 'canonical' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/divisible by 3/);
  });

  test('rejects oversized mesh with 413', async () => {
    const tooMany = new Array(1501 * 3).fill(0);
    const res = await request(app).post('/api/vision/bone-structure').send({ mesh: { vertices: tooMany, source: 'arkit', indices: [0, 1, 2] } });
    expect(res.status).toBe(413);
  });

  test('rejects non-finite vertex values', async () => {
    const verts = buildIndexedMesh();
    verts[0] = NaN;
    const res = await request(app).post('/api/vision/bone-structure').send({ mesh: { vertices: verts, source: 'canonical' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/finite numbers/);
  });

  test('rejects source/count mismatches before analysis', async () => {
    const res1 = await request(app).post('/api/vision/bone-structure').send({ mesh: { vertices: buildIndexedMesh(), source: 'arkit', indices: [0, 1, 2] } });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toMatch(/source/i);

    const arkitVerts = new Array(1220 * 3).fill(0).map((_, i) => (i % 3 === 0 ? 0.001 : i % 3 === 1 ? 0.002 : 0.003));
    const res2 = await request(app).post('/api/vision/bone-structure').send({ mesh: { vertices: arkitVerts, source: 'canonical' } });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/source/i);
  });

  test('rejects ARKit meshes without triangle indices', async () => {
    const verts = new Array(1220 * 3).fill(0).map((_, i) => (i % 3 === 0 ? 0.001 : i % 3 === 1 ? 0.002 : 0.003));
    const res = await request(app).post('/api/vision/bone-structure').send({ mesh: { vertices: verts, source: 'arkit' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/indices/i);
  });
});

describe('POST /api/vision/bone-structure — analysis path', () => {
  test('returns ok status + honesty fields for valid canonical mesh (no daily_id)', async () => {
    const res = await request(app).post('/api/vision/bone-structure').send(BODY_BASE());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.harmony).toBe('number');
    expect(res.body.estimate).toBe(true);
    expect(res.body.confidence).toBe('medium');
    expect(res.body.landmark_source).toBe('template');
    expect(res.body.persisted).toBe(false);
  });

  test('includes the captured mesh at full resolution in the response', async () => {
    const res = await request(app).post('/api/vision/bone-structure').send(BODY_BASE());
    expect(res.status).toBe(200);
    expect(res.body.downsampled_mesh.vertices.length).toBe(474 * 3);
    expect(res.body.downsampled_mesh.source).toBe('canonical');
  });

  test('surfaces interventions bundle with procedural disclaimer', async () => {
    const res = await request(app).post('/api/vision/bone-structure').send(BODY_BASE());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.interventions.lifestyle)).toBe(true);
    expect(typeof res.body.interventions.procedural_disclaimer).toBe('string');
  });
});

describe('POST /api/vision/bone-structure — persistence + authorization (dev mode)', () => {
  test('dev mode accepts daily_id without ownership check, persists when row exists', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const res = await request(app).post('/api/vision/bone-structure').send({ ...BODY_BASE(), daily_id: 'd-test' });
    expect(res.status).toBe(200);
    expect(res.body.persisted).toBe(true);
    const updCall = mockQuery.mock.calls.find((c) => /UPDATE model_outputs/.test(c[0]));
    expect(updCall).toBeDefined();
    expect(updCall[1]).toContain('d-test');
  });

  test('persisted=false when UPDATE matches zero rows', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).post('/api/vision/bone-structure').send({ ...BODY_BASE(), daily_id: 'd-missing' });
    expect(res.status).toBe(200);
    expect(res.body.persisted).toBe(false);
  });
});

describe('POST /api/vision/bone-structure — sex resolution', () => {
  test('explicit sex_override beats the user-profile lookup', async () => {
    const res = await request(app).post('/api/vision/bone-structure').send({ ...BODY_BASE(), sex_override: 'female' });
    expect(res.status).toBe(200);
    expect(res.body.sex).toBe('female');
  });

  test('invalid sex_override falls back to null', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/vision/bone-structure').send({ ...BODY_BASE(), sex_override: 'banana' });
    expect(res.status).toBe(200);
    expect(res.body.sex).toBeNull();
  });
});
