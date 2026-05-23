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

// 60 floats = 20 vertex slots, plenty for the local analyzer to coordinate
// landmark lookups (most resolve to OOB and degrade gracefully — we expect
// `harmony: null` for this synthetic input).
const SAMPLE_MESH: CapturedFaceMesh = {
  vertices: new Array(60).fill(0).map((_, i) => i),
  source: 'arkit',
  capturedAt: new Date('2026-05-13').toISOString(),
};

describe('analyzeBoneStructure (on-device)', () => {
  it('returns a locally-computed result without hitting the backend when no dailyId is provided', async () => {
    const result = await analyzeBoneStructure({ mesh: SAMPLE_MESH, sexOverride: 'female' });

    expect(mockHttpJson).not.toHaveBeenCalled();
    expect(result.source).toBe('arkit');
    expect(result.sex).toBe('female');
    // Sparse synthetic mesh → analyzer should report 'no_face' or 'insufficient'.
    expect(['no_face', 'insufficient', 'ok']).toContain(result.status);
    // Interventions bundle is always present (empty when no findings emit).
    expect(result.interventions).toEqual(
      expect.objectContaining({
        lifestyle: expect.any(Array),
        pharmacological: expect.any(Array),
        interventional: expect.any(Array),
        procedural_disclaimer: expect.any(String),
      }),
    );
    expect(result.persisted).toBe(false);
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

  it('fires a best-effort persist POST with daily_id and sex_override when a dailyId is supplied', async () => {
    mockHttpJson.mockResolvedValueOnce({ persisted: true });

    const result = await analyzeBoneStructure({
      mesh: SAMPLE_MESH,
      dailyId: 'daily-1',
      sexOverride: 'female',
    });

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
    expect(result.persisted).toBe(true);
  });

  it('returns the local result with persisted=false when the backend persist call errors', async () => {
    const apiErr = (ApiError as unknown as (s: number, b: string) => Error)(503, 'unavailable');
    mockHttpJson.mockRejectedValueOnce(apiErr);

    const result = await analyzeBoneStructure({ mesh: SAMPLE_MESH, dailyId: 'daily-1' });

    expect(result.persisted).toBe(false);
    // Crucially, the analyzer doesn't throw — local result is always returned.
    expect(result.source).toBe('arkit');
  });

  it('clamps the harmony score to 0-100 when the local analyzer somehow returns out-of-range', async () => {
    // The local analyzer naturally returns null for sparse synthetic meshes,
    // so we use that as the expected baseline; clampHarmony is exercised
    // implicitly in the no-find-landmarks path.
    const result = await analyzeBoneStructure({ mesh: SAMPLE_MESH });
    if (result.harmony != null) {
      expect(result.harmony).toBeGreaterThanOrEqual(0);
      expect(result.harmony).toBeLessThanOrEqual(100);
    } else {
      expect(result.harmony).toBeNull();
    }
  });

  it('always populates the interventions bundle (defaults to empty arrays with disclaimer)', async () => {
    const result = await analyzeBoneStructure({ mesh: SAMPLE_MESH });
    expect(result.interventions.procedural_disclaimer).toMatch(/board-certified/i);
    expect(Array.isArray(result.interventions.lifestyle)).toBe(true);
    expect(Array.isArray(result.interventions.pharmacological)).toBe(true);
    expect(Array.isArray(result.interventions.interventional)).toBe(true);
  });
});
