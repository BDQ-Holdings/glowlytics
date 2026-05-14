jest.mock('../httpClient', () => {
  // Plain ES5 function so the factory stays hoist-safe (no TS-only `public` params).
  function ApiError(status: number, body: string) {
    const err = new Error(`API ${status}: ${body}`);
    (err as Error & { status: number; body: string }).status = status;
    (err as Error & { status: number; body: string }).body = body;
    return err;
  }
  return { httpJson: jest.fn(), ApiError };
});
jest.mock('../../config/env', () => ({
  env: { API_BASE_URL: 'https://api.test' },
}));

import { analyzeBoneStructure } from '../boneStructure';
import { httpJson, ApiError } from '../httpClient';
import type { CapturedFaceMesh } from '../../types';

const mockHttpJson = httpJson as jest.MockedFunction<typeof httpJson>;

beforeEach(() => mockHttpJson.mockReset());

const SAMPLE_MESH: CapturedFaceMesh = {
  vertices: new Array(60).fill(0).map((_, i) => i),
  source: 'arkit',
  capturedAt: new Date('2026-05-13').toISOString(),
};

describe('analyzeBoneStructure', () => {
  it('POSTs the mesh to /api/vision/bone-structure', async () => {
    mockHttpJson.mockResolvedValueOnce({
      harmony: 78,
      status: 'ok',
      domain_scores: { symmetry: 80, periorbital: 75, mandibular: 80, midface: 78, nose: 70, brow: 72 },
      scored_metrics: { canthal_tilt: 90, gonial_angle: 70 },
      metrics: { canthal_tilt: { value: 6 }, gonial_angle: { value: 122 } },
      findings: [],
      interventions: { lifestyle: [], pharmacological: [], interventional: [], procedural_disclaimer: 'X' },
      dominant_driver: 'nose',
      source: 'arkit',
      sex: 'female',
      generated_at: '2026-05-13T00:00:00Z',
    });

    const result = await analyzeBoneStructure({ mesh: SAMPLE_MESH, dailyId: 'daily-1', sexOverride: 'female' });

    expect(mockHttpJson).toHaveBeenCalledWith(
      'https://api.test/api/vision/bone-structure',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          mesh: expect.objectContaining({ source: 'arkit' }),
          daily_id: 'daily-1',
          sex_override: 'female',
        }),
      }),
    );
    expect(result.harmony).toBe(78);
    expect(result.dominant_driver).toBe('nose');
  });

  it('rejects a malformed mesh (length not divisible by 3)', async () => {
    const bad: CapturedFaceMesh = { ...SAMPLE_MESH, vertices: [1, 2, 3, 4] };
    await expect(analyzeBoneStructure({ mesh: bad })).rejects.toThrow(/flat xyz/);
    expect(mockHttpJson).not.toHaveBeenCalled();
  });

  it('rejects an empty mesh', async () => {
    const empty: CapturedFaceMesh = { ...SAMPLE_MESH, vertices: [] };
    await expect(analyzeBoneStructure({ mesh: empty })).rejects.toThrow();
  });

  it('clamps harmony to 0-100', async () => {
    mockHttpJson.mockResolvedValueOnce({
      harmony: 250,
      status: 'ok',
      source: 'mediapipe',
      generated_at: '2026-05-13T00:00:00Z',
    });
    const result = await analyzeBoneStructure({ mesh: SAMPLE_MESH });
    expect(result.harmony).toBe(100);
  });

  it('preserves null harmony for insufficient-data responses', async () => {
    mockHttpJson.mockResolvedValueOnce({
      harmony: null,
      status: 'insufficient',
      source: 'mediapipe',
      generated_at: '2026-05-13T00:00:00Z',
    });
    const result = await analyzeBoneStructure({ mesh: SAMPLE_MESH });
    expect(result.harmony).toBeNull();
    expect(result.status).toBe('insufficient');
  });

  it('wraps backend ApiError into a descriptive Error', async () => {
    const apiErr = (ApiError as unknown as (s: number, b: string) => Error)(429, 'rate limited');
    mockHttpJson.mockRejectedValueOnce(apiErr);
    await expect(analyzeBoneStructure({ mesh: SAMPLE_MESH })).rejects.toThrow(/429/);
  });

  it('falls back to empty interventions when backend omits them', async () => {
    mockHttpJson.mockResolvedValueOnce({
      harmony: 70,
      status: 'ok',
      source: 'mediapipe',
      generated_at: '2026-05-13T00:00:00Z',
    });
    const result = await analyzeBoneStructure({ mesh: SAMPLE_MESH });
    expect(result.interventions).toEqual({
      lifestyle: [], pharmacological: [], interventional: [], procedural_disclaimer: '',
    });
  });
});
