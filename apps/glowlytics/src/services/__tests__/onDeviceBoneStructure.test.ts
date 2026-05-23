/**
 * On-device bone-structure parity tests — mirror the backend
 * `backend/__tests__/bone-structure-3d.test.js` so any drift between the two
 * implementations surfaces quickly. The synthetic ideal-mesh fixture is
 * intentionally identical (same MediaPipe landmark indices, same coordinates).
 */

import {
  analyzeBoneStructure,
  composeHarmonyScore,
  findingsFromScores,
  resolveIdeal,
  scoreFromIdeal,
  ARKIT_LANDMARKS,
  MEDIAPIPE_LANDMARKS,
  DOMAIN_WEIGHTS,
} from '../onDeviceBoneStructure';

// ---------------------------------------------------------------------------
// Synthetic "anatomically ideal" face — same numbers as the backend fixture
// so the parity tests stay tight.
// ---------------------------------------------------------------------------

function buildIdealMesh(table = MEDIAPIPE_LANDMARKS): Float32Array {
  const setVertex = (arr: Float32Array, idx: number | undefined, x: number, y: number, z: number) => {
    if (idx == null) return;
    arr[idx * 3 + 0] = x;
    arr[idx * 3 + 1] = y;
    arr[idx * 3 + 2] = z;
  };

  const verts = new Float32Array(1500 * 3);

  setVertex(verts, table.trichion,         0,  50.0,  0);
  setVertex(verts, table.glabella,         0,  16.7, 10);
  setVertex(verts, table.pronasale,        0, -10.0, 22);
  setVertex(verts, table.subnasale,        0, -16.7, 12);
  setVertex(verts, table.menton,           0, -50.0,  8);
  setVertex(verts, table.pogonion,         0, -45.0, 11);
  setVertex(verts, table.upper_lip_top,    0, -22.0, 13);
  setVertex(verts, table.lower_lip_bot,    0, -32.0, 12);

  const tilt = 6 * Math.PI / 180;
  setVertex(verts, table.inner_canthus_L,  9,  20,                       8);
  setVertex(verts, table.inner_canthus_R, -9,  20,                       8);
  setVertex(verts, table.outer_canthus_L, 27, 20 + Math.sin(tilt) * 18, 6);
  setVertex(verts, table.outer_canthus_R,-27, 20 + Math.sin(tilt) * 18, 6);

  setVertex(verts, table.upper_eyelid_L,  18, 23.0, 7);
  setVertex(verts, table.upper_eyelid_R, -18, 23.0, 7);
  setVertex(verts, table.lower_eyelid_L,  18, 17.0, 7);
  setVertex(verts, table.lower_eyelid_R, -18, 17.0, 7);

  setVertex(verts, table.iris_L,          18, 20, 7);
  setVertex(verts, table.iris_R,         -18, 20, 7);

  setVertex(verts, table.brow_apex_L,     20, 26, 6);
  setVertex(verts, table.brow_apex_R,    -20, 26, 6);
  setVertex(verts, table.brow_inner_L,    11, 25, 7);
  setVertex(verts, table.brow_inner_R,   -11, 25, 7);

  setVertex(verts, table.alar_L,         11.25, -10, 12);
  setVertex(verts, table.alar_R,        -11.25, -10, 12);

  setVertex(verts, table.zygion_L,        45,   0,  6);
  setVertex(verts, table.zygion_R,       -45,   0,  6);

  setVertex(verts, table.tragion_L,       39,  10,  0);
  setVertex(verts, table.tragion_R,      -39,  10,  0);

  setVertex(verts, table.gonion_L,        32.5, -25, 14);
  setVertex(verts, table.gonion_R,       -32.5, -25, 14);

  setVertex(verts, table.cheilion_L,       18, -32, 11);
  setVertex(verts, table.cheilion_R,      -18, -32, 11);

  return verts;
}

describe('analyzeBoneStructure (on-device)', () => {
  it('produces a high harmony score for an anatomically ideal mesh', () => {
    const vertices = buildIdealMesh();
    const result = analyzeBoneStructure({ vertices, source: 'mediapipe', sex: 'female' });

    expect(result.status).toBe('ok');
    expect(result.harmony).not.toBeNull();
    expect(result.harmony!).toBeGreaterThan(70);
    expect(Object.keys(result.scored).length).toBeGreaterThan(5);
  });

  it('returns no_face when the mesh has no resolvable landmarks', () => {
    const result = analyzeBoneStructure({ vertices: new Float32Array(0), source: 'mediapipe' });
    expect(result.status).toBe('no_face');
    expect(result.harmony).toBeNull();
  });

  it('throws on an unknown source', () => {
    expect(() => analyzeBoneStructure({
      vertices: new Float32Array(100),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      source: 'bogus' as any,
    })).toThrow();
  });
});

describe('scoreFromIdeal', () => {
  it('returns 100 for a value inside a range ideal', () => {
    const ideal = { idealMin: 4, idealMax: 8, hardMin: -8, hardMax: 16 };
    expect(scoreFromIdeal(6, ideal)).toBe(100);
  });

  it('returns 0 at the hard bound of a range ideal', () => {
    const ideal = { idealMin: 4, idealMax: 8, hardMin: -8, hardMax: 16 };
    expect(scoreFromIdeal(-8, ideal)).toBe(0);
  });

  it('decays linearly below the ideal floor', () => {
    const ideal = { idealMin: 4, idealMax: 8, hardMin: -8, hardMax: 16 };
    const score = scoreFromIdeal(0, ideal);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(85);
  });

  it('returns 100 at a point-ideal target', () => {
    const ideal = { target: 1.0, halfWidth: 0.04 };
    expect(scoreFromIdeal(1.0, ideal)).toBe(100);
  });

  it('returns 0 beyond fallToZero', () => {
    const ideal = { target: 1.0, halfWidth: 0.04, fallToZero: 0.2 };
    expect(scoreFromIdeal(1.5, ideal)).toBe(0);
  });

  it('rejects null inputs', () => {
    expect(scoreFromIdeal(null, { target: 1.0, halfWidth: 0.04 })).toBeNull();
    expect(scoreFromIdeal(1.0, null)).toBeNull();
  });
});

describe('resolveIdeal — sex-aware metrics', () => {
  it('picks the male gonial_angle ideal for male subjects', () => {
    const ideal = resolveIdeal('gonial_angle', 'male') as { idealMin: number; idealMax: number };
    expect(ideal.idealMin).toBe(115);
    expect(ideal.idealMax).toBe(125);
  });

  it('picks the female gonial_angle ideal for female subjects', () => {
    const ideal = resolveIdeal('gonial_angle', 'female') as { idealMin: number; idealMax: number };
    expect(ideal.idealMin).toBe(120);
    expect(ideal.idealMax).toBe(130);
  });

  it('falls back to unisex when sex is null', () => {
    const ideal = resolveIdeal('gonial_angle', null) as { idealMin: number };
    expect(ideal.idealMin).toBe(117);
  });

  it('returns the same ideal regardless of sex for non-sex-aware metrics', () => {
    expect(resolveIdeal('canthal_tilt', 'male')).toEqual(resolveIdeal('canthal_tilt', 'female'));
  });
});

describe('composeHarmonyScore', () => {
  it('domain weights sum to exactly 100', () => {
    const sum = Object.values(DOMAIN_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it('returns 100 when every scored metric is 100', () => {
    const allHundred: Record<string, number> = {
      facial_thirds: 100, facial_fifths: 100, fluctuating_asymmetry: 100,
      canthal_tilt: 100, scleral_show: 100, palpebral_fissure_ratio: 100, ipd_ratio: 100,
      gonial_angle: 100, bigonial_bizygomatic_ratio: 100, chin_projection: 100,
      bitemporal_bizygomatic_ratio: 100, zygomatic_projection: 100,
      alar_bizygomatic_ratio: 100, nasolabial_angle: 100,
      brow_position: 100, brow_apex_lateral_third: 100,
    };
    const { harmony } = composeHarmonyScore(allHundred);
    expect(harmony).toBe(100);
  });

  it('returns a finite harmony when only some domains have data', () => {
    const partial = { gonial_angle: 80, canthal_tilt: 90 };
    const { harmony, domainScores } = composeHarmonyScore(partial);
    expect(harmony).not.toBeNull();
    expect(domainScores.mandibular).toBe(80);
    expect(domainScores.periorbital).toBe(90);
    expect(domainScores.symmetry).toBeNull();
  });

  it('returns null harmony when no metrics scored', () => {
    const { harmony } = composeHarmonyScore({});
    expect(harmony).toBeNull();
  });
});

describe('findingsFromScores', () => {
  it('emits canthal_tilt_negative when the value drops below the ideal range', () => {
    const findings = findingsFromScores(
      { canthal_tilt: { value: -5 } },
      { canthal_tilt: 40 },
      null,
    );
    expect(findings.find((f) => f.findingCode === 'canthal_tilt_negative')).toBeDefined();
  });

  it('emits canthal_tilt_excess when the value rises above the ideal range', () => {
    const findings = findingsFromScores(
      { canthal_tilt: { value: 14 } },
      { canthal_tilt: 30 },
      null,
    );
    expect(findings.find((f) => f.findingCode === 'canthal_tilt_excess')).toBeDefined();
  });

  it('sorts findings most-severe-first', () => {
    const findings = findingsFromScores(
      { canthal_tilt: { value: -5 }, gonial_angle: { value: 138 } },
      { canthal_tilt: 65, gonial_angle: 30 },
      'male',
    );
    expect(findings[0].score).toBeLessThanOrEqual(findings[1].score);
  });

  it('emits no findings when all scores meet the threshold', () => {
    const findings = findingsFromScores(
      { canthal_tilt: { value: 6 } },
      { canthal_tilt: 100 },
      null,
    );
    expect(findings).toHaveLength(0);
  });
});

describe('landmark tables', () => {
  it('ARKit and MediaPipe share their common landmark keys', () => {
    const arkitKeys = new Set(Object.keys(ARKIT_LANDMARKS));
    const mpKeys = new Set(Object.keys(MEDIAPIPE_LANDMARKS));
    for (const k of arkitKeys) expect(mpKeys.has(k)).toBe(true);
  });

  it('every landmark index is a non-negative integer', () => {
    for (const v of Object.values(MEDIAPIPE_LANDMARKS)) {
      if (v == null) continue;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('metric sensitivity to landmark perturbation', () => {
  it('flattening the canthi → canthal_tilt collapses near zero', () => {
    const vertices = buildIdealMesh();
    const t = MEDIAPIPE_LANDMARKS;
    vertices[(t.outer_canthus_L as number) * 3 + 1] = vertices[(t.inner_canthus_L as number) * 3 + 1];
    vertices[(t.outer_canthus_R as number) * 3 + 1] = vertices[(t.inner_canthus_R as number) * 3 + 1];
    const result = analyzeBoneStructure({ vertices, source: 'mediapipe', sex: 'female' });
    expect(Math.abs(result.metrics.canthal_tilt.value)).toBeLessThan(1);
    expect(result.scored.canthal_tilt).toBeLessThan(100);
  });

  it('widening the gonion → bigonial:bizygomatic ratio rises', () => {
    const vertices = buildIdealMesh();
    const t = MEDIAPIPE_LANDMARKS;
    vertices[(t.gonion_L as number) * 3 + 0] = 44;
    vertices[(t.gonion_R as number) * 3 + 0] = -44;
    const result = analyzeBoneStructure({ vertices, source: 'mediapipe', sex: 'female' });
    expect(result.metrics.bigonial_bizygomatic_ratio.value).toBeGreaterThan(0.9);
    expect(result.scored.bigonial_bizygomatic_ratio).toBeLessThan(100);
  });

  it('breaking mirror symmetry → fluctuating_asymmetry rises', () => {
    const vertices = buildIdealMesh();
    const t = MEDIAPIPE_LANDMARKS;
    vertices[(t.zygion_L as number) * 3 + 0] = 40;
    const result = analyzeBoneStructure({ vertices, source: 'mediapipe', sex: 'female' });
    expect(result.metrics.fluctuating_asymmetry.value).toBeGreaterThan(0.01);
  });
});
