/**
 * On-device bone-structure parity tests. Keep behavior mirrored with
 * backend/__tests__/bone-structure-3d.test.js.
 */

import { buildCanonicalMesh } from '../canonicalFaceMesh';
import {
  analyzeBoneStructure,
  composeHarmonyScore,
  deriveLandmarksFromMesh,
  findingsFromScores,
  MEDIAPIPE_LANDMARKS,
  resolveIdeal,
  scoreFromIdeal,
  DOMAIN_WEIGHTS,
} from '../onDeviceBoneStructure';

function setVertex(arr: number[], idx: number, x: number, y: number, z: number) {
  arr[idx * 3 + 0] = x;
  arr[idx * 3 + 1] = y;
  arr[idx * 3 + 2] = z;
}

function addLoop(vertices: number[], indices: number[], points: Array<[number, number, number]>) {
  const centerIndex = vertices.length / 3;
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  const cz = points.reduce((s, p) => s + p[2], 0) / points.length;
  vertices.push(cx, cy, cz);
  const first = vertices.length / 3;
  for (const [x, y, z] of points) vertices.push(x, y, z);
  for (let i = 0; i < points.length; i++) {
    indices.push(centerIndex, first + i, first + ((i + 1) % points.length));
  }
}

function buildSyntheticArkitMesh() {
  const vertices: number[] = [];
  const indices: number[] = [];

  // Deterministic ellipsoid points in ARKit face-anchor metres (+x right, +y up, +z forward).
  for (let yi = 0; yi < 20; yi++) {
    const y = -0.09 + (yi / 19) * 0.17;
    const vertical = 1 - Math.min(1, Math.abs((y + 0.005) / 0.095));
    const rx = 0.025 + 0.045 * Math.max(0, vertical);
    const rz = 0.028 + 0.018 * Math.max(0, vertical);
    for (let ai = 0; ai < 44; ai++) {
      const a = (ai / 44) * Math.PI * 2;
      vertices.push(Math.cos(a) * rx, y, 0.015 + Math.sin(a) * rz);
    }
  }

  const landmarks = {
    trichion: vertices.length / 3, glabella: vertices.length / 3 + 1, pronasale: vertices.length / 3 + 2,
    subnasale: vertices.length / 3 + 3, menton: vertices.length / 3 + 4, pogonion: vertices.length / 3 + 5,
    zygionL: vertices.length / 3 + 6, zygionR: vertices.length / 3 + 7,
    tragionL: vertices.length / 3 + 8, tragionR: vertices.length / 3 + 9,
    gonionL: vertices.length / 3 + 10, gonionR: vertices.length / 3 + 11,
    alarL: vertices.length / 3 + 12, alarR: vertices.length / 3 + 13,
    browL: vertices.length / 3 + 14, browR: vertices.length / 3 + 15,
  };
  vertices.push(
    0, 0.085, 0.04,    // trichion/forehead top
    0, 0.036, 0.048,   // glabella
    0, -0.006, 0.078,  // pronasale
    0, -0.026, 0.046,  // subnasale
    0, -0.094, 0.038,  // menton
    0, -0.075, 0.052,  // pogonion
    -0.075, 0.000, -0.012, 0.075, 0.000, -0.012, // zygia
    -0.078, 0.028, -0.034, 0.078, 0.028, -0.034, // tragia
    -0.056, -0.064, -0.004, 0.056, -0.064, -0.004, // gonia
    -0.018, -0.016, 0.058, 0.018, -0.016, 0.058, // alar rims
    -0.030, 0.042, 0.044, 0.030, 0.042, 0.044, // brow apices
  );

  addLoop(vertices, indices, [
    [0, 0.088, 0.035], [-0.050, 0.070, 0.010], [-0.071, 0.025, -0.024], [-0.065, -0.040, -0.020],
    [-0.030, -0.092, 0.015], [0, -0.098, 0.030], [0.030, -0.092, 0.015], [0.065, -0.040, -0.020],
    [0.071, 0.025, -0.024], [0.050, 0.070, 0.010],
  ]);
  addLoop(vertices, indices, [
    [-0.045, 0.027, 0.034], [-0.038, 0.034, 0.037], [-0.028, 0.035, 0.039], [-0.020, 0.028, 0.039],
    [-0.028, 0.020, 0.038], [-0.038, 0.020, 0.036],
  ]);
  addLoop(vertices, indices, [
    [0.020, 0.028, 0.039], [0.028, 0.035, 0.039], [0.038, 0.034, 0.037], [0.045, 0.027, 0.034],
    [0.038, 0.020, 0.036], [0.028, 0.020, 0.038],
  ]);
  addLoop(vertices, indices, [
    [-0.028, -0.047, 0.046], [-0.015, -0.039, 0.050], [0, -0.036, 0.052], [0.015, -0.039, 0.050],
    [0.028, -0.047, 0.046], [0.014, -0.057, 0.047], [0, -0.062, 0.046], [-0.014, -0.057, 0.047],
  ]);

  expect(vertices.length / 3).toBeGreaterThanOrEqual(900);
  return { vertices, indices, landmarks };
}

function canonicalResult() {
  return analyzeBoneStructure({ vertices: buildCanonicalMesh(), source: 'canonical', sex: null });
}

describe('analyzeBoneStructure (on-device)', () => {
  it('calibrates the bundled real-face template as a plausible estimate, not a zero-domain face', () => {
    const result = canonicalResult();
    expect(result.status).toBe('ok');
    expect(result.estimate).toBe(true);
    expect(result.landmark_source).toBe('template');
    expect(result.confidence).toBe('medium');
    expect(result.harmony).toBeGreaterThanOrEqual(70);
    expect(result.harmony).toBeLessThanOrEqual(90);
    for (const score of Object.values(result.domainScores)) {
      expect(score).not.toBe(0);
    }
    expect(result.findings.filter((f) => f.severity !== 'mild')).toHaveLength(0);
    expect(result.metrics.facial_index.value).toBeGreaterThan(0.8);
    expect(result.metrics.mouth_nose_ratio.value).toBeGreaterThan(1.0);
    expect(result.metrics.lip_ratio.value).toBeGreaterThan(0.2);
  });

  it('derives ARKit landmarks from geometry and holes instead of fixed indices', () => {
    const mesh = buildSyntheticArkitMesh();
    const derived = deriveLandmarksFromMesh(mesh.vertices, mesh.indices);
    expect(derived.status).toBe('ok');
    expect(derived.landmarks.pronasale?.z).toBeCloseTo(0.078, 2);
    expect(derived.landmarks.menton?.y).toBeCloseTo(-0.098, 2);
    expect(derived.landmarks.inner_canthus_L?.x).toBeLessThan(0);
    expect(derived.landmarks.inner_canthus_R?.x).toBeGreaterThan(0);
    expect(derived.landmarks.cheilion_L?.x).toBeCloseTo(-0.028, 2);
    expect(derived.landmarks.cheilion_R?.x).toBeCloseTo(0.028, 2);

    const result = analyzeBoneStructure({ vertices: mesh.vertices, indices: mesh.indices, source: 'arkit', sex: null });
    expect(result.status).toBe('ok');
    expect(result.landmark_source).toBe('derived');
    expect(result.confidence).toBe('high');
    expect(result.metrics.facial_index.value).toBeGreaterThan(0.7);
    expect(result.metrics.mouth_nose_ratio.value).toBeGreaterThan(1.3);
    expect(result.metrics.lip_ratio.value).toBeGreaterThan(0.3);
  });

  it('does not fabricate eye or mouth metrics when an ARKit mesh has no boundary holes', () => {
    const mesh = buildSyntheticArkitMesh();
    const result = analyzeBoneStructure({ vertices: mesh.vertices, indices: [0, 1, 2], source: 'arkit', sex: null });
    expect(result.status).not.toBe('no_face');
    expect(result.confidence).toBe('medium');
    expect(result.metrics.scleral_show).toBeUndefined();
    expect(result.metrics.mouth_nose_ratio).toBeUndefined();
    expect(result.metrics.lip_ratio).toBeUndefined();
  });

  it('returns no_face for all-zero meshes on both indexed and ARKit paths', () => {
    expect(analyzeBoneStructure({ vertices: new Float32Array(474 * 3), source: 'canonical' }).status).toBe('no_face');
    expect(analyzeBoneStructure({ vertices: new Float32Array(1220 * 3), indices: [0, 1, 2], source: 'arkit' }).status).toBe('no_face');
  });

  it('uses lid geometry for scleral_show and never gaze blendshapes', () => {
    const neutral = canonicalResult();
    const gaze = analyzeBoneStructure({
      vertices: buildCanonicalMesh(),
      source: 'canonical',
      blendShapes: { eyeLookDownLeft: 1, eyeLookDownRight: 1 },
    });
    expect(gaze.metrics.scleral_show?.raw?.source).not.toBe('blendshape');
    expect(gaze.metrics.scleral_show?.value).toBeCloseTo(neutral.metrics.scleral_show.value, 6);
  });

  it('degrades non-neutral expressions and suppresses mouth, eye, and jaw metrics', () => {
    const mesh = buildSyntheticArkitMesh();
    const result = analyzeBoneStructure({
      vertices: mesh.vertices,
      indices: mesh.indices,
      source: 'arkit',
      blendShapes: { jawOpen: 0.4, mouthSmile_L: 0.0, mouthSmile_R: 0.0 },
    });
    expect(result.status).toBe('insufficient');
    expect(result.confidence).toBe('low');
    expect(result.metrics.canthal_tilt).toBeUndefined();
    expect(result.metrics.gonial_angle).toBeUndefined();
    expect(result.metrics.mouth_nose_ratio).toBeUndefined();
  });
});

describe('scoreFromIdeal', () => {
  it('returns 100 for a value inside a range ideal', () => {
    expect(scoreFromIdeal(6, { idealMin: 4, idealMax: 8, hardMin: -8, hardMax: 16 })).toBe(100);
  });

  it('returns 0 at the hard bound of a range ideal', () => {
    expect(scoreFromIdeal(-8, { idealMin: 4, idealMax: 8, hardMin: -8, hardMax: 16 })).toBe(0);
  });

  it('decays linearly below the ideal floor', () => {
    const score = scoreFromIdeal(0, { idealMin: 4, idealMax: 8, hardMin: -8, hardMax: 16 });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(85);
  });

  it('returns 100 at a point-ideal target', () => {
    expect(scoreFromIdeal(1.0, { target: 1.0, halfWidth: 0.04 })).toBe(100);
  });

  it('returns 0 beyond fallToZero', () => {
    expect(scoreFromIdeal(1.5, { target: 1.0, halfWidth: 0.04, fallToZero: 0.2 })).toBe(0);
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
      bitemporal_bizygomatic_ratio: 100, zygomatic_projection: 100, facial_index: 100, lip_ratio: 100,
      alar_bizygomatic_ratio: 100, nasolabial_angle: 100, mouth_nose_ratio: 100,
      brow_position: 100, brow_apex_lateral_third: 100,
    };
    const { harmony, presentDomains } = composeHarmonyScore(allHundred, 'high');
    expect(harmony).toBe(100);
    expect(presentDomains).toBe(6);
  });

  it('does not silently renormalize when fewer than four domains are present', () => {
    const partial = { gonial_angle: 80, canthal_tilt: 90 };
    const { harmony, domainScores, presentDomains } = composeHarmonyScore(partial, 'medium');
    expect(harmony).toBeNull();
    expect(presentDomains).toBe(2);
    expect(domainScores.mandibular).toBe(80);
    expect(domainScores.periorbital).toBe(90);
  });
});

describe('findingsFromScores', () => {
  it('emits the new contracted finding codes on the correct side', () => {
    const findings = findingsFromScores(
      { facial_index: { value: 2.0 }, mouth_nose_ratio: { value: 1.1 }, lip_ratio: { value: 0.9 } },
      { facial_index: 40, mouth_nose_ratio: 40, lip_ratio: 40 },
      null,
    );
    expect(findings.map((f) => f.findingCode)).toEqual(expect.arrayContaining(['face_long', 'mouth_narrow', 'lip_ratio_high']));
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
    expect(findingsFromScores({ canthal_tilt: { value: 6 } }, { canthal_tilt: 100 }, null)).toHaveLength(0);
  });
});

describe('landmark tables', () => {
  it('keeps MediaPipe/canonical landmarks indexed but removes the fake ARKit table', () => {
    expect(MEDIAPIPE_LANDMARKS.pronasale).toBe(1);
    expect(MEDIAPIPE_LANDMARKS.stomion).toBe(13);
  });
});
