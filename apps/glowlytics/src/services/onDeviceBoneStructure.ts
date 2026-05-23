/**
 * On-device bone-structure / Harmony scoring.
 *
 * Direct TypeScript port of `backend/bone-structure-3d.js`. Pure deterministic
 * math over a captured 3D face mesh — no native dependencies, no ONNX, no
 * network. Runs in the JS thread on the iPhone, eliminating the
 * `/api/vision/bone-structure` round-trip entirely.
 *
 * Output shape is identical to the backend so consumers (BoneStructureResult
 * type, viewer overlay, MCP persistence) keep working unchanged.
 *
 * Convention for the model-local frame:
 *   +X = subject's right (viewer's left when looking at the face)
 *   +Y = up
 *   +Z = out of the face, toward the camera
 */

import type {
  BoneDomain,
  BoneFinding,
  BoneFindingCode,
  BoneFindingSeverity,
  BoneMeshSource,
} from '../types';

// ---------------------------------------------------------------------------
// Types — internal to this module
// ---------------------------------------------------------------------------

type Vec3 = { x: number; y: number; z: number };

interface MetricEntry {
  value: number;
  raw?: Record<string, unknown>;
}

type LandmarkTable = Record<string, number | undefined>;

interface PointIdeal {
  target: number;
  halfWidth: number;
  fallToZero?: number;
}

interface RangeIdeal {
  idealMin: number;
  idealMax: number;
  hardMin: number;
  hardMax: number;
}

interface SexAwareIdeal {
  male?: PointIdeal | RangeIdeal;
  female?: PointIdeal | RangeIdeal;
  unisex?: PointIdeal | RangeIdeal;
}

type Ideal = PointIdeal | RangeIdeal | SexAwareIdeal;

// ---------------------------------------------------------------------------
// Landmark vertex indices
// ---------------------------------------------------------------------------
//
// These indices identify anatomical landmarks on the canonical mesh topology
// of each source. ARKit and MediaPipe both emit a fixed topology per session,
// so vertex N always corresponds to the same anatomical point across faces.
// All metrics gracefully degrade when a landmark index resolves to an
// out-of-range vertex — see `vec()` below.
//
// LR convention: L = subject's left (positive X). R = subject's right.

export const ARKIT_LANDMARKS: LandmarkTable = {
  trichion:        16,
  glabella:        9,
  pronasale:       4,
  subnasale:       164,
  menton:          152,
  pogonion:        175,
  upper_lip_top:   13,
  lower_lip_bot:   17,

  inner_canthus_L: 33,
  inner_canthus_R: 263,
  outer_canthus_L: 133,
  outer_canthus_R: 362,
  upper_eyelid_L:  159,
  upper_eyelid_R:  386,
  lower_eyelid_L:  145,
  lower_eyelid_R:  374,

  brow_inner_L:    105,
  brow_inner_R:    334,
  brow_apex_L:     107,
  brow_apex_R:     336,

  alar_L:          49,
  alar_R:          279,

  zygion_L:        454,
  zygion_R:        927,
  tragion_L:       234,
  tragion_R:       454,
  gonion_L:        395,
  gonion_R:        858,

  cheilion_L:      270,
  cheilion_R:      813,
};

export const MEDIAPIPE_LANDMARKS: LandmarkTable = {
  trichion:        10,
  glabella:        9,
  pronasale:       1,
  subnasale:       2,
  menton:          152,
  pogonion:        199,
  upper_lip_top:   0,
  lower_lip_bot:   17,

  inner_canthus_L: 133,
  inner_canthus_R: 362,
  outer_canthus_L: 33,
  outer_canthus_R: 263,
  upper_eyelid_L:  159,
  upper_eyelid_R:  386,
  lower_eyelid_L:  145,
  lower_eyelid_R:  374,

  brow_inner_L:    55,
  brow_inner_R:    285,
  brow_apex_L:     105,
  brow_apex_R:     334,

  alar_L:          49,
  alar_R:          279,

  zygion_L:        234,
  zygion_R:        454,
  tragion_L:       127,
  tragion_R:       356,
  gonion_L:        172,
  gonion_R:        397,

  cheilion_L:      61,
  cheilion_R:      291,

  iris_L:          468,
  iris_R:          473,
};

export const LANDMARK_TABLES: Record<BoneMeshSource, LandmarkTable> = {
  arkit: ARKIT_LANDMARKS,
  mediapipe: MEDIAPIPE_LANDMARKS,
};

// ---------------------------------------------------------------------------
// Domain weights — calibrated against the cosmesis literature. Must sum to 100.
// ---------------------------------------------------------------------------

export const DOMAIN_WEIGHTS: Record<BoneDomain, number> = {
  symmetry: 25,
  periorbital: 20,
  mandibular: 20,
  midface: 15,
  nose: 10,
  brow: 10,
};

export const METRICS_BY_DOMAIN: Record<BoneDomain, string[]> = {
  symmetry: ['facial_thirds', 'facial_fifths', 'fluctuating_asymmetry'],
  periorbital: ['canthal_tilt', 'scleral_show', 'palpebral_fissure_ratio', 'ipd_ratio'],
  mandibular: ['gonial_angle', 'bigonial_bizygomatic_ratio', 'chin_projection'],
  midface: ['bitemporal_bizygomatic_ratio', 'zygomatic_projection'],
  nose: ['alar_bizygomatic_ratio', 'nasolabial_angle'],
  brow: ['brow_position', 'brow_apex_lateral_third'],
};

// ---------------------------------------------------------------------------
// Sex-adjusted ideals
// ---------------------------------------------------------------------------

export const IDEALS: Record<string, Ideal> = {
  // Symmetry domain
  facial_thirds:           { target: 1.0, halfWidth: 0.04 },
  facial_fifths:           { target: 1.0, halfWidth: 0.05 },
  fluctuating_asymmetry:   { target: 0.0, halfWidth: 0.01, fallToZero: 0.08 },

  // Periorbital
  canthal_tilt:            { idealMin: 4, idealMax: 8, hardMin: -8, hardMax: 16 },
  scleral_show:            { idealMin: -0.5, idealMax: 0.0, hardMin: -2, hardMax: 2 },
  palpebral_fissure_ratio: { target: 0.33, halfWidth: 0.04 },
  ipd_ratio:               { target: 2.0, halfWidth: 0.1, fallToZero: 0.6 },

  // Mandibular  (sex-aware)
  gonial_angle: {
    male:    { idealMin: 115, idealMax: 125, hardMin: 100, hardMax: 140 },
    female:  { idealMin: 120, idealMax: 130, hardMin: 105, hardMax: 145 },
    unisex:  { idealMin: 117, idealMax: 128, hardMin: 102, hardMax: 142 },
  } as SexAwareIdeal,
  bigonial_bizygomatic_ratio: { idealMin: 0.70, idealMax: 0.75, hardMin: 0.55, hardMax: 0.90 },
  chin_projection:            { target: 0.0, halfWidth: 0.5, fallToZero: 4.0 },

  // Midface
  bitemporal_bizygomatic_ratio: { idealMin: 0.83, idealMax: 0.92, hardMin: 0.70, hardMax: 1.05 },
  zygomatic_projection:         { target: 0.0, halfWidth: 0.5, fallToZero: 3.0 },

  // Nose (sex-aware)
  alar_bizygomatic_ratio: { idealMin: 0.22, idealMax: 0.28, hardMin: 0.15, hardMax: 0.40 },
  nasolabial_angle: {
    male:   { idealMin: 90,  idealMax: 100, hardMin: 70,  hardMax: 115 },
    female: { idealMin: 95,  idealMax: 110, hardMin: 75,  hardMax: 125 },
    unisex: { idealMin: 92,  idealMax: 105, hardMin: 72,  hardMax: 120 },
  } as SexAwareIdeal,

  // Brow (sex-aware)
  brow_position: {
    male:   { target: 0.00, halfWidth: 0.04, fallToZero: 0.20 },
    female: { target: 0.06, halfWidth: 0.04, fallToZero: 0.20 },
    unisex: { target: 0.03, halfWidth: 0.05, fallToZero: 0.22 },
  } as SexAwareIdeal,
  brow_apex_lateral_third: { target: 0.66, halfWidth: 0.08 },
};

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

export function vec(vertices: ArrayLike<number>, index: number | undefined): Vec3 | null {
  if (index == null) return null;
  const i = index * 3;
  if (i < 0 || i + 2 >= vertices.length) return null;
  return { x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] };
}

function sub(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add(a: Vec3, b: Vec3): Vec3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function mul(a: Vec3, s: number): Vec3 { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function len(a: Vec3): number { return Math.sqrt(dot(a, a)); }
function norm(a: Vec3): Vec3 { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }
function distance(a: Vec3, b: Vec3): number { return len(sub(a, b)); }

function angleDeg(u: Vec3, v: Vec3): number {
  const denom = (len(u) * len(v)) || 1;
  const c = Math.max(-1, Math.min(1, dot(u, v) / denom));
  return Math.acos(c) * 180 / Math.PI;
}

function midpoint(a: Vec3, b: Vec3): Vec3 { return mul(add(a, b), 0.5); }

// ---------------------------------------------------------------------------
// Coordinate-system canonicalisation
// ---------------------------------------------------------------------------

export interface FaceFrame {
  origin: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
}

export function buildFaceFrame(
  vertices: ArrayLike<number>,
  L: LandmarkTable,
): FaceFrame | null {
  const glabella   = vec(vertices, L.glabella);
  const subnasale  = vec(vertices, L.subnasale);
  const menton     = vec(vertices, L.menton);
  const innerCL    = vec(vertices, L.inner_canthus_L);
  const innerCR    = vec(vertices, L.inner_canthus_R);
  if (!glabella || !subnasale || !menton || !innerCL || !innerCR) return null;

  const origin = midpoint(glabella, subnasale);
  const right  = norm(sub(innerCL, innerCR));
  const downRaw = norm(sub(menton, glabella));
  const forward = norm(cross(downRaw, right));
  const up = norm(cross(forward, right));

  return { origin, right, up, forward };
}

export function toLocal(frame: FaceFrame, p: Vec3): Vec3 {
  const d = sub(p, frame.origin);
  return {
    x: dot(d, frame.right),
    y: dot(d, frame.up),
    z: dot(d, frame.forward),
  };
}

// ---------------------------------------------------------------------------
// Metric computation
// ---------------------------------------------------------------------------

export function computeMetrics3D(
  vertices: ArrayLike<number>,
  blendShapes: Record<string, number> | null,
  sex: 'male' | 'female' | null,
  source: BoneMeshSource = 'arkit',
): Record<string, MetricEntry> | null {
  const L = LANDMARK_TABLES[source];
  if (!L) throw new Error(`Unknown landmark source: ${source}`);

  const frame = buildFaceFrame(vertices, L);
  if (!frame) return null;

  const lp = (idx: number | undefined): Vec3 | null => {
    const v = vec(vertices, idx);
    return v ? toLocal(frame, v) : null;
  };

  const trichion  = lp(L.trichion);
  const glabella: Vec3  = { x: 0, y: lp(L.glabella)?.y ?? 0, z: 0 };
  const subnasale: Vec3 = { x: 0, y: lp(L.subnasale)?.y ?? 0, z: 0 };
  const menton    = lp(L.menton);
  const pogonion  = lp(L.pogonion);
  const upperLip  = lp(L.upper_lip_top);
  const pronasale = lp(L.pronasale);

  const innerCL = lp(L.inner_canthus_L);
  const innerCR = lp(L.inner_canthus_R);
  const outerCL = lp(L.outer_canthus_L);
  const outerCR = lp(L.outer_canthus_R);
  const upperLidL = lp(L.upper_eyelid_L);
  const upperLidR = lp(L.upper_eyelid_R);
  const lowerLidL = lp(L.lower_eyelid_L);
  const lowerLidR = lp(L.lower_eyelid_R);

  const browApexL = lp(L.brow_apex_L);
  const browApexR = lp(L.brow_apex_R);
  const browInnerL = lp(L.brow_inner_L);
  const browInnerR = lp(L.brow_inner_R);

  const alarL = lp(L.alar_L);
  const alarR = lp(L.alar_R);

  const zygionL = lp(L.zygion_L);
  const zygionR = lp(L.zygion_R);
  const tragionL = lp(L.tragion_L);
  const tragionR = lp(L.tragion_R);
  const gonionL = lp(L.gonion_L);
  const gonionR = lp(L.gonion_R);

  const irisL = L.iris_L != null ? lp(L.iris_L) : null;
  const irisR = L.iris_R != null ? lp(L.iris_R) : null;

  const metrics: Record<string, MetricEntry> = {};

  // --- Symmetry domain ---

  if (trichion && glabella && subnasale && menton) {
    const t1 = Math.abs(trichion.y - glabella.y);
    const t2 = Math.abs(glabella.y - subnasale.y);
    const t3 = Math.abs(subnasale.y - menton.y);
    const total = t1 + t2 + t3;
    if (total > 0) {
      const mean = total / 3;
      const dev = (Math.abs(t1 - mean) + Math.abs(t2 - mean) + Math.abs(t3 - mean)) / (3 * mean);
      metrics.facial_thirds = { value: 1 - dev, raw: { t1, t2, t3 } };
    }
  }

  if (tragionL && outerCL && innerCL && innerCR && outerCR && tragionR) {
    const fifths = [
      Math.abs(tragionL.x - outerCL.x),
      Math.abs(outerCL.x - innerCL.x),
      Math.abs(innerCL.x - innerCR.x),
      Math.abs(innerCR.x - outerCR.x),
      Math.abs(outerCR.x - tragionR.x),
    ];
    const total = fifths.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const mean = total / 5;
      const dev = fifths.reduce((acc, f) => acc + Math.abs(f - mean), 0) / (5 * mean);
      metrics.facial_fifths = { value: 1 - dev, raw: { fifths } };
    }
  }

  const mirrorPairs: Array<[Vec3 | null, Vec3 | null]> = [
    [innerCL, innerCR], [outerCL, outerCR], [upperLidL, upperLidR], [lowerLidL, lowerLidR],
    [browApexL, browApexR], [browInnerL, browInnerR],
    [alarL, alarR], [zygionL, zygionR], [tragionL, tragionR], [gonionL, gonionR],
  ];
  let asymSum = 0;
  let asymCount = 0;
  let asymScale = distance({ x: 0, y: 0, z: 0 }, innerCL || { x: 1, y: 0, z: 0 });
  if (!Number.isFinite(asymScale) || asymScale === 0) asymScale = 1;
  for (const [l, r] of mirrorPairs) {
    if (!l || !r) continue;
    const mirrored: Vec3 = { x: -r.x, y: r.y, z: r.z };
    asymSum += distance(l, mirrored);
    asymCount++;
  }
  if (asymCount > 0) {
    metrics.fluctuating_asymmetry = { value: (asymSum / asymCount) / asymScale, raw: { pairs: asymCount } };
  }

  // --- Periorbital domain ---

  if (innerCL && outerCL && innerCR && outerCR) {
    const tiltL = Math.atan2(outerCL.y - innerCL.y, outerCL.x - innerCL.x) * 180 / Math.PI;
    const tiltR = Math.atan2(outerCR.y - innerCR.y, innerCR.x - outerCR.x) * 180 / Math.PI;
    metrics.canthal_tilt = { value: (tiltL + tiltR) / 2, raw: { tiltL, tiltR } };
  }

  if (irisL && irisR && lowerLidL && lowerLidR && upperLidL && upperLidR) {
    const eyeHeightL = Math.abs(upperLidL.y - lowerLidL.y);
    const eyeHeightR = Math.abs(upperLidR.y - lowerLidR.y);
    const radiusL = eyeHeightL / 2;
    const radiusR = eyeHeightR / 2;
    const inferiorLimbusL = irisL.y - radiusL;
    const inferiorLimbusR = irisR.y - radiusR;
    const showL = inferiorLimbusL - lowerLidL.y;
    const showR = inferiorLimbusR - lowerLidR.y;
    metrics.scleral_show = { value: (showL + showR) / 2, raw: { showL, showR } };
  } else if (blendShapes && (blendShapes.eyeLookDownLeft != null || blendShapes.eyeLookDownRight != null)) {
    const down = ((blendShapes.eyeLookDownLeft || 0) + (blendShapes.eyeLookDownRight || 0)) / 2;
    metrics.scleral_show = { value: down * 2 - 1, raw: { source: 'blendshape' } };
  }

  if (upperLidL && lowerLidL && innerCL && outerCL && upperLidR && lowerLidR && innerCR && outerCR) {
    const hL = Math.abs(upperLidL.y - lowerLidL.y);
    const wL = distance(innerCL, outerCL);
    const hR = Math.abs(upperLidR.y - lowerLidR.y);
    const wR = distance(innerCR, outerCR);
    if (wL > 0 && wR > 0) {
      metrics.palpebral_fissure_ratio = { value: ((hL / wL) + (hR / wR)) / 2, raw: { hL, wL, hR, wR } };
    }
  }

  if (irisL && irisR && innerCL && outerCL) {
    const ipd = distance(irisL, irisR);
    const eyeWidth = distance(innerCL, outerCL);
    if (eyeWidth > 0) metrics.ipd_ratio = { value: ipd / eyeWidth, raw: { ipd, eyeWidth } };
  } else if (innerCL && innerCR && outerCL && outerCR) {
    const pupilL = midpoint(innerCL, outerCL);
    const pupilR = midpoint(innerCR, outerCR);
    const ipd = distance(pupilL, pupilR);
    const eyeWidth = distance(innerCL, outerCL);
    if (eyeWidth > 0) metrics.ipd_ratio = { value: ipd / eyeWidth, raw: { ipd, eyeWidth, source: 'proxy' } };
  }

  // --- Mandibular domain ---

  if (gonionL && pogonion && tragionL && gonionR && tragionR) {
    const angL = angleDeg(sub(tragionL, gonionL), sub(pogonion, gonionL));
    const angR = angleDeg(sub(tragionR, gonionR), sub(pogonion, gonionR));
    metrics.gonial_angle = { value: (angL + angR) / 2, raw: { angL, angR } };
  }

  if (gonionL && gonionR && zygionL && zygionR) {
    const bigonial = distance(gonionL, gonionR);
    const bizygomatic = distance(zygionL, zygionR);
    if (bizygomatic > 0) {
      metrics.bigonial_bizygomatic_ratio = { value: bigonial / bizygomatic, raw: { bigonial, bizygomatic } };
    }
  }

  if (pogonion && subnasale && pronasale) {
    const baseline = (subnasale.z + pronasale.z) / 2;
    const faceHeight = trichion && menton ? Math.abs(trichion.y - menton.y) : 1;
    metrics.chin_projection = {
      value: (pogonion.z - baseline) / Math.max(faceHeight, 1e-6) * 10,
      raw: { pogZ: pogonion.z, baseline },
    };
  }

  // --- Midface domain ---

  if (tragionL && tragionR && zygionL && zygionR) {
    const bitemporal = distance(tragionL, tragionR);
    const bizygomatic = distance(zygionL, zygionR);
    if (bizygomatic > 0) {
      metrics.bitemporal_bizygomatic_ratio = { value: bitemporal / bizygomatic, raw: { bitemporal, bizygomatic } };
    }
  }

  if (zygionL && zygionR && subnasale && pronasale) {
    const lateralZ = (zygionL.z + zygionR.z) / 2;
    const centralZ = (subnasale.z + pronasale.z) / 2;
    const faceWidth = distance(zygionL, zygionR) || 1;
    metrics.zygomatic_projection = {
      value: (centralZ - lateralZ) / faceWidth * 10,
      raw: { lateralZ, centralZ },
    };
  }

  // --- Nose domain ---

  if (alarL && alarR && zygionL && zygionR) {
    const alar = distance(alarL, alarR);
    const bizygomatic = distance(zygionL, zygionR);
    if (bizygomatic > 0) {
      metrics.alar_bizygomatic_ratio = { value: alar / bizygomatic, raw: { alar, bizygomatic } };
    }
  }

  if (subnasale && pronasale && upperLip) {
    // For the nasolabial-angle calculation, use world-space points so the
    // angle is intrinsic to the face geometry (matches the backend's
    // computation which reads vertices directly, not the projected ones).
    const sn = vec(vertices, L.subnasale);
    const pn = vec(vertices, L.pronasale);
    const ul = vec(vertices, L.upper_lip_top);
    if (sn && pn && ul) {
      const a = sub(pn, sn);
      const b = sub(ul, sn);
      metrics.nasolabial_angle = { value: angleDeg(a, b), raw: {} };
    }
  }

  // --- Brow domain ---

  if (browApexL && upperLidL && browApexR && upperLidR && innerCL && innerCR) {
    const intercanthal = distance(innerCL, innerCR) || 1;
    const offsetL = (browApexL.y - upperLidL.y) / intercanthal;
    const offsetR = (browApexR.y - upperLidR.y) / intercanthal;
    metrics.brow_position = { value: (offsetL + offsetR) / 2, raw: { offsetL, offsetR } };
  }

  if (browApexL && browInnerL && outerCL && browApexR && browInnerR && outerCR) {
    const lenL = distance(browInnerL, outerCL) || 1;
    const apexFracL = distance(browInnerL, browApexL) / lenL;
    const lenR = distance(browInnerR, outerCR) || 1;
    const apexFracR = distance(browInnerR, browApexR) / lenR;
    metrics.brow_apex_lateral_third = { value: (apexFracL + apexFracR) / 2, raw: { apexFracL, apexFracR } };
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function isSexAware(cfg: Ideal): cfg is SexAwareIdeal {
  const v = cfg as SexAwareIdeal;
  return v.male != null || v.female != null || v.unisex != null;
}

function isRangeIdeal(cfg: Ideal): cfg is RangeIdeal {
  const v = cfg as RangeIdeal;
  return v.idealMin != null && v.idealMax != null;
}

function isPointIdeal(cfg: Ideal): cfg is PointIdeal {
  const v = cfg as PointIdeal;
  return v.target != null && v.halfWidth != null;
}

export function resolveIdeal(
  metricKey: string,
  sex: 'male' | 'female' | null,
): PointIdeal | RangeIdeal | null {
  const cfg = IDEALS[metricKey];
  if (!cfg) return null;
  if (isSexAware(cfg)) {
    if (sex === 'male' && cfg.male) return cfg.male;
    if (sex === 'female' && cfg.female) return cfg.female;
    return cfg.unisex || cfg.male || cfg.female || null;
  }
  return cfg as PointIdeal | RangeIdeal;
}

export function scoreFromIdeal(
  value: number | null | undefined,
  ideal: PointIdeal | RangeIdeal | null,
): number | null {
  if (value == null || !Number.isFinite(value) || !ideal) return null;

  if (isRangeIdeal(ideal)) {
    const { idealMin, idealMax, hardMin, hardMax } = ideal;
    if (value >= idealMin && value <= idealMax) return 100;
    if (value <= hardMin || value >= hardMax) return 0;
    if (value < idealMin) {
      return Math.round(85 * (value - hardMin) / (idealMin - hardMin));
    }
    return Math.round(85 * (hardMax - value) / (hardMax - idealMax));
  }

  if (isPointIdeal(ideal)) {
    const { target, halfWidth } = ideal;
    const fallToZero = ideal.fallToZero ?? halfWidth * 5;
    const dev = Math.abs(value - target);
    if (dev <= halfWidth) {
      return Math.round(100 - 15 * (dev / halfWidth));
    }
    if (dev >= fallToZero) return 0;
    return Math.round(85 * (1 - (dev - halfWidth) / (fallToZero - halfWidth)));
  }

  return null;
}

export function scoreMetrics(
  metrics: Record<string, MetricEntry>,
  sex: 'male' | 'female' | null = null,
): Record<string, number> {
  const scored: Record<string, number> = {};
  for (const [key, entry] of Object.entries(metrics || {})) {
    const ideal = resolveIdeal(key, sex);
    const score = scoreFromIdeal(entry?.value, ideal);
    if (score != null) scored[key] = score;
  }
  return scored;
}

// ---------------------------------------------------------------------------
// Composite Harmony score
// ---------------------------------------------------------------------------

export function composeHarmonyScore(
  scored: Record<string, number>,
): { harmony: number | null; domainScores: Record<BoneDomain, number | null> } {
  let total = 0;
  let weightUsed = 0;
  const domainScores = {} as Record<BoneDomain, number | null>;

  for (const [domain, weight] of Object.entries(DOMAIN_WEIGHTS) as Array<[BoneDomain, number]>) {
    const keys = METRICS_BY_DOMAIN[domain] || [];
    const present = keys.map((k) => scored[k]).filter((s) => Number.isFinite(s));
    if (present.length === 0) {
      domainScores[domain] = null;
      continue;
    }
    const avg = present.reduce((a, b) => a + b, 0) / present.length;
    domainScores[domain] = Math.round(avg);
    total += avg * weight;
    weightUsed += weight;
  }

  const harmony = weightUsed > 0 ? Math.round(total / weightUsed) : null;
  return { harmony, domainScores };
}

// ---------------------------------------------------------------------------
// Findings — map below-threshold metrics into intervention-keyed codes
// ---------------------------------------------------------------------------

type FindingDirection = 'low' | 'high' | 'either';

interface FindingRule {
  metric: string;
  direction: FindingDirection;
  code: BoneFindingCode;
}

export const FINDING_RULES: FindingRule[] = [
  // Periorbital
  { metric: 'canthal_tilt',           direction: 'low',    code: 'canthal_tilt_negative' },
  { metric: 'canthal_tilt',           direction: 'high',   code: 'canthal_tilt_excess' },
  { metric: 'scleral_show',           direction: 'high',   code: 'scleral_show_inferior' },
  { metric: 'palpebral_fissure_ratio',direction: 'low',    code: 'palpebral_fissure_narrow' },
  { metric: 'ipd_ratio',              direction: 'either', code: 'ipd_atypical' },

  // Mandibular
  { metric: 'gonial_angle',           direction: 'high',   code: 'gonial_angle_obtuse' },
  { metric: 'gonial_angle',           direction: 'low',    code: 'gonial_angle_acute' },
  { metric: 'bigonial_bizygomatic_ratio', direction: 'high', code: 'lower_face_wide' },
  { metric: 'bigonial_bizygomatic_ratio', direction: 'low',  code: 'lower_face_narrow' },
  { metric: 'chin_projection',        direction: 'low',    code: 'chin_recessed' },
  { metric: 'chin_projection',        direction: 'high',   code: 'chin_excess' },

  // Midface
  { metric: 'bitemporal_bizygomatic_ratio', direction: 'low',  code: 'bitemporal_narrow' },
  { metric: 'bitemporal_bizygomatic_ratio', direction: 'high', code: 'bitemporal_wide' },
  { metric: 'zygomatic_projection',   direction: 'low',    code: 'midface_flat' },

  // Nose
  { metric: 'alar_bizygomatic_ratio', direction: 'high',   code: 'alar_wide' },
  { metric: 'nasolabial_angle',       direction: 'low',    code: 'nasolabial_acute' },
  { metric: 'nasolabial_angle',       direction: 'high',   code: 'nasolabial_obtuse' },

  // Brow
  { metric: 'brow_position',          direction: 'low',    code: 'brow_low' },
  { metric: 'brow_position',          direction: 'high',   code: 'brow_high' },
  { metric: 'brow_apex_lateral_third',direction: 'either', code: 'brow_apex_misplaced' },

  // Symmetry
  { metric: 'facial_thirds',          direction: 'low',    code: 'thirds_uneven' },
  { metric: 'facial_fifths',          direction: 'low',    code: 'fifths_uneven' },
  { metric: 'fluctuating_asymmetry',  direction: 'high',   code: 'asymmetry_elevated' },
];

export const SEVERITY_THRESHOLDS = { mild: 75, moderate: 55, marked: 0 } as const;
export const FINDING_THRESHOLD = SEVERITY_THRESHOLDS.mild;

function severityFromScore(score: number): BoneFindingSeverity {
  if (score >= SEVERITY_THRESHOLDS.mild) return 'mild';
  if (score >= SEVERITY_THRESHOLDS.moderate) return 'moderate';
  return 'marked';
}

export function findingsFromScores(
  metrics: Record<string, MetricEntry>,
  scored: Record<string, number>,
  sex: 'male' | 'female' | null,
): BoneFinding[] {
  const findings: BoneFinding[] = [];
  for (const rule of FINDING_RULES) {
    const metric = metrics[rule.metric];
    const score = scored[rule.metric];
    if (!metric || score == null || score >= FINDING_THRESHOLD) continue;

    const ideal = resolveIdeal(rule.metric, sex);
    if (!ideal) continue;

    let side: FindingDirection = 'either';
    if (isRangeIdeal(ideal)) {
      side = metric.value < ideal.idealMin ? 'low' : metric.value > ideal.idealMax ? 'high' : 'either';
    } else if (isPointIdeal(ideal)) {
      side = metric.value < ideal.target ? 'low' : metric.value > ideal.target ? 'high' : 'either';
    }

    if (rule.direction !== 'either' && rule.direction !== side) continue;

    findings.push({
      findingCode: rule.code,
      metric: rule.metric,
      value: metric.value,
      score,
      severity: severityFromScore(score),
    });
  }

  findings.sort((a, b) => a.score - b.score);
  return findings;
}

// ---------------------------------------------------------------------------
// Top-level orchestration
// ---------------------------------------------------------------------------

export interface AnalyzeBoneInput {
  vertices: ArrayLike<number>;
  blendShapes?: Record<string, number> | null;
  sex?: 'male' | 'female' | null;
  source?: BoneMeshSource;
}

export interface BoneAnalysis {
  harmony: number | null;
  status: 'ok' | 'no_face' | 'insufficient';
  metrics: Record<string, MetricEntry>;
  scored: Record<string, number>;
  domainScores: Record<BoneDomain, number | null>;
  findings: BoneFinding[];
  dominantDriver: BoneDomain | null;
  source: BoneMeshSource;
  sex: 'male' | 'female' | null;
}

export function analyzeBoneStructure({
  vertices,
  blendShapes = null,
  sex = null,
  source = 'arkit',
}: AnalyzeBoneInput): BoneAnalysis {
  const metrics = computeMetrics3D(vertices, blendShapes, sex, source);
  if (!metrics) {
    return {
      harmony: null,
      status: 'no_face',
      metrics: {},
      scored: {},
      findings: [],
      domainScores: {} as Record<BoneDomain, number | null>,
      dominantDriver: null,
      source,
      sex: sex || null,
    };
  }
  const scored = scoreMetrics(metrics, sex);
  const { harmony, domainScores } = composeHarmonyScore(scored);
  const findings = findingsFromScores(metrics, scored, sex);

  // Dominant driver — domain with lowest score (most room to improve)
  let dominantDriver: BoneDomain | null = null;
  let lowest = Infinity;
  for (const [domain, score] of Object.entries(domainScores) as Array<[BoneDomain, number | null]>) {
    if (score != null && score < lowest) { lowest = score; dominantDriver = domain; }
  }

  return {
    harmony,
    status: harmony == null ? 'insufficient' : 'ok',
    metrics,
    scored,
    domainScores,
    findings,
    dominantDriver,
    source,
    sex: sex || null,
  };
}
