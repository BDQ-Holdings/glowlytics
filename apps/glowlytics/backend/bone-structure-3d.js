/**
 * Bone Structure 3D — facial-architecture metrics computed on a captured 3D mesh.
 *
 * Inputs:
 *   - vertices: flat Float32Array | number[] of length N*3 (xyz triples)
 *   - blendShapes (optional): Record<string, number>  ARKit-style 52 keys, 0..1
 *   - sex: 'male' | 'female' | null  (ideals shift on dimorphic metrics)
 *   - source: 'arkit' | 'mediapipe'  (selects landmark index table)
 *
 * Convention for the model-local frame:
 *   +X = subject's right (viewer's left when looking at the face)
 *   +Y = up
 *   +Z = out of the face, toward the camera
 *
 * Units are arbitrary mesh units (ARKit reports metres; MediaPipe is normalized).
 * Ratios are unit-free; angles are in degrees. Linear distances are reported as
 * raw mesh units alongside the unit-free ratios that drive scoring.
 */

// ---------------------------------------------------------------------------
// Landmark vertex indices
// ---------------------------------------------------------------------------
//
// These indices identify anatomical landmarks on the canonical mesh topology
// of each source. ARKit and MediaPipe both emit a fixed topology per session,
// so vertex N always corresponds to the same anatomical point across faces.
//
// ARKit indices below are community-empirical (Apple does not publish a
// labelled landmark table). The MediaPipe indices come from the FaceLandmarker
// 478-point canonical mapping (well documented).
//
// All metrics gracefully degrade when a landmark index resolves to an
// out-of-range vertex — see `vec()` below.
//
// LR convention: L = subject's left (positive X). R = subject's right.

const ARKIT_LANDMARKS = {
  trichion:        16,   // mesh apex (forehead top) — ARKit mesh stops before hairline
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

const MEDIAPIPE_LANDMARKS = {
  trichion:        10,    // top forehead vertex (closest available)
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

  // Iris center — MediaPipe only (refined landmarks output)
  iris_L:          468,
  iris_R:          473,
};

const LANDMARK_TABLES = {
  arkit: ARKIT_LANDMARKS,
  mediapipe: MEDIAPIPE_LANDMARKS,
};

// ---------------------------------------------------------------------------
// Domain weights — calibrated against the cosmesis literature (see plan).
// Must sum to 100.
// ---------------------------------------------------------------------------

const DOMAIN_WEIGHTS = {
  symmetry: 25,
  periorbital: 20,
  mandibular: 20,
  midface: 15,
  nose: 10,
  brow: 10,
};

// Which metrics roll up into which domain
const METRICS_BY_DOMAIN = {
  symmetry: ['facial_thirds', 'facial_fifths', 'fluctuating_asymmetry'],
  periorbital: ['canthal_tilt', 'scleral_show', 'palpebral_fissure_ratio', 'ipd_ratio'],
  mandibular: ['gonial_angle', 'bigonial_bizygomatic_ratio', 'chin_projection'],
  midface: ['bitemporal_bizygomatic_ratio', 'zygomatic_projection'],
  nose: ['alar_bizygomatic_ratio', 'nasolabial_angle'],
  brow: ['brow_position', 'brow_apex_lateral_third'],
};

// ---------------------------------------------------------------------------
// Sex-adjusted ideals — sourced from Naini & Bashour normative tables.
// Each entry is either:
//   { target, halfWidth }                    — point ideal, symmetric penalty
//   { idealMin, idealMax, hardMin, hardMax } — range ideal, linear decay outside
// Sex shift applies the `male` or `female` sub-block; null sex uses `unisex`.
// ---------------------------------------------------------------------------

const IDEALS = {
  // Symmetry domain
  facial_thirds:           { target: 1.0, halfWidth: 0.04 },          // ratio of mean third length to overall/3
  facial_fifths:           { target: 1.0, halfWidth: 0.05 },          // ratio of mean fifth width to overall/5
  fluctuating_asymmetry:   { target: 0.0, halfWidth: 0.01, fallToZero: 0.08 }, // mean mirror-plane deviation in mesh units

  // Periorbital
  canthal_tilt:            { idealMin: 4, idealMax: 8, hardMin: -8, hardMax: 16 },   // degrees, positive = lateral up
  scleral_show:            { idealMin: -0.5, idealMax: 0.0, hardMin: -2, hardMax: 2 }, // mm equivalent, negative = lid covers limbus
  palpebral_fissure_ratio: { target: 0.33, halfWidth: 0.04 },         // height / width
  ipd_ratio:               { target: 2.0, halfWidth: 0.1, fallToZero: 0.6 },  // IPD / (one eye width) — anatomic ratio ~2.1

  // Mandibular  (sex-aware)
  gonial_angle: {
    male:    { idealMin: 115, idealMax: 125, hardMin: 100, hardMax: 140 },
    female:  { idealMin: 120, idealMax: 130, hardMin: 105, hardMax: 145 },
    unisex:  { idealMin: 117, idealMax: 128, hardMin: 102, hardMax: 142 },
  },
  bigonial_bizygomatic_ratio: { idealMin: 0.70, idealMax: 0.75, hardMin: 0.55, hardMax: 0.90 },
  chin_projection:            { target: 0.0, halfWidth: 0.5, fallToZero: 4.0 }, // mesh units relative to subnasale-pronasale baseline

  // Midface
  bitemporal_bizygomatic_ratio: { idealMin: 0.83, idealMax: 0.92, hardMin: 0.70, hardMax: 1.05 },
  zygomatic_projection:         { target: 0.0, halfWidth: 0.5, fallToZero: 3.0 },

  // Nose (sex-aware)
  alar_bizygomatic_ratio: { idealMin: 0.22, idealMax: 0.28, hardMin: 0.15, hardMax: 0.40 }, // ~1:4
  nasolabial_angle: {
    male:   { idealMin: 90,  idealMax: 100, hardMin: 70,  hardMax: 115 },
    female: { idealMin: 95,  idealMax: 110, hardMin: 75,  hardMax: 125 },
    unisex: { idealMin: 92,  idealMax: 105, hardMin: 72,  hardMax: 120 },
  },

  // Brow (sex-aware) — brow position measured as y-offset of brow apex above supraorbital rim
  // normalised by interpupillary distance.
  brow_position: {
    male:   { target: 0.00, halfWidth: 0.04, fallToZero: 0.20 },
    female: { target: 0.06, halfWidth: 0.04, fallToZero: 0.20 },
    unisex: { target: 0.03, halfWidth: 0.05, fallToZero: 0.22 },
  },
  brow_apex_lateral_third: { target: 0.66, halfWidth: 0.08 }, // brow apex at 2/3 of brow length (lateral)
};

// ---------------------------------------------------------------------------
// Vector helpers — work on flat xyz arrays
// ---------------------------------------------------------------------------

function vec(vertices, index) {
  const i = index * 3;
  if (i < 0 || i + 2 >= vertices.length) return null;
  return { x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] };
}

function sub(a, b)  { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add(a, b)  { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function mul(a, s)  { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function dot(a, b)  { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function len(a)     { return Math.sqrt(dot(a, a)); }
function norm(a)    { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }
function distance(a, b) { return len(sub(a, b)); }

function angleDeg(u, v) {
  const denom = (len(u) * len(v)) || 1;
  const c = Math.max(-1, Math.min(1, dot(u, v) / denom));
  return Math.acos(c) * 180 / Math.PI;
}

function midpoint(a, b) { return mul(add(a, b), 0.5); }

// ---------------------------------------------------------------------------
// Coordinate-system canonicalisation
//
// We derive a face-local frame from three stable landmarks so that the metrics
// don't depend on how the head was oriented during capture:
//
//   - origin   = midpoint of glabella + subnasale (sagittal anchor)
//   - up axis  = glabella → menton, projected onto the sagittal plane
//   - right    = inner_canthus_R → inner_canthus_L (subject's right→left)
//   - forward  = right × up
//
// All vectors used in metric computation are first transformed into this
// frame so that angles like canthal tilt are reported relative to the face's
// own horizontal, not the world's.
// ---------------------------------------------------------------------------

function buildFaceFrame(vertices, L) {
  const glabella   = vec(vertices, L.glabella);
  const subnasale  = vec(vertices, L.subnasale);
  const menton     = vec(vertices, L.menton);
  const innerCL    = vec(vertices, L.inner_canthus_L);
  const innerCR    = vec(vertices, L.inner_canthus_R);
  if (!glabella || !subnasale || !menton || !innerCL || !innerCR) return null;

  const origin = midpoint(glabella, subnasale);
  const right  = norm(sub(innerCL, innerCR));
  const downRaw = norm(sub(menton, glabella));
  // Right-handed frame with +Y up, +Z out of face toward camera.
  // forward = down × right gives a forward-pointing vector; up = forward × right
  // makes the y axis point opposite to the down vector (so up).
  const forward = norm(cross(downRaw, right));
  const up = norm(cross(forward, right));

  return { origin, right, up, forward };
}

function toLocal(frame, p) {
  const d = sub(p, frame.origin);
  return {
    x: dot(d, frame.right),
    y: dot(d, frame.up),
    z: dot(d, frame.forward),
  };
}

// ---------------------------------------------------------------------------
// Metric computation — all values are reported in face-local space
// ---------------------------------------------------------------------------

function computeMetrics3D(vertices, blendShapes, sex, source = 'arkit') {
  const L = LANDMARK_TABLES[source];
  if (!L) throw new Error(`Unknown landmark source: ${source}`);

  const frame = buildFaceFrame(vertices, L);
  if (!frame) return null;

  const lp = (idx) => {
    const v = vec(vertices, idx);
    return v ? toLocal(frame, v) : null;
  };

  // Common landmark resolutions in face-local frame
  const trichion  = lp(L.trichion);
  const glabella  = { x: 0, y: lp(L.glabella)?.y ?? 0, z: 0 }; // by construction
  const subnasale = { x: 0, y: lp(L.subnasale)?.y ?? 0, z: 0 };
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

  const metrics = {};

  // --- Symmetry domain ---

  // Facial thirds — ideal trichion→glabella ≈ glabella→subnasale ≈ subnasale→menton
  if (trichion && glabella && subnasale && menton) {
    const t1 = Math.abs(trichion.y - glabella.y);
    const t2 = Math.abs(glabella.y - subnasale.y);
    const t3 = Math.abs(subnasale.y - menton.y);
    const total = t1 + t2 + t3;
    if (total > 0) {
      const mean = total / 3;
      const dev = (Math.abs(t1 - mean) + Math.abs(t2 - mean) + Math.abs(t3 - mean)) / (3 * mean);
      metrics.facial_thirds = { value: 1 - dev, raw: { t1, t2, t3 } }; // 1.0 = perfectly equal
    }
  }

  // Facial fifths — each fifth ≈ one eye width
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

  // Fluctuating asymmetry — mean mirror-plane deviation across paired landmarks
  const mirrorPairs = [
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
    const mirrored = { x: -r.x, y: r.y, z: r.z };
    asymSum += distance(l, mirrored);
    asymCount++;
  }
  if (asymCount > 0) {
    metrics.fluctuating_asymmetry = { value: (asymSum / asymCount) / asymScale, raw: { pairs: asymCount } };
  }

  // --- Periorbital domain ---

  // Canthal tilt — angle of (inner→outer) line vs face-local horizontal, averaged L+R
  if (innerCL && outerCL && innerCR && outerCR) {
    const tiltL = Math.atan2(outerCL.y - innerCL.y, outerCL.x - innerCL.x) * 180 / Math.PI;
    const tiltR = Math.atan2(outerCR.y - innerCR.y, innerCR.x - outerCR.x) * 180 / Math.PI;
    metrics.canthal_tilt = { value: (tiltL + tiltR) / 2, raw: { tiltL, tiltR } };
  }

  // Scleral show — gap between lower eyelid and inferior iris boundary.
  // We don't have iris-edge landmarks, so approximate iris radius as half the
  // palpebral fissure height (a healthy iris fills the eye opening vertically).
  // scleral_show > 0 means the lower lid sits below the inferior limbus.
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
    // Coarse fallback using ARKit blend shapes — downcast gaze → more scleral show
    const down = ((blendShapes.eyeLookDownLeft || 0) + (blendShapes.eyeLookDownRight || 0)) / 2;
    metrics.scleral_show = { value: down * 2 - 1, raw: { source: 'blendshape' } };
  }

  // Palpebral fissure height/width ratio — averaged L+R
  if (upperLidL && lowerLidL && innerCL && outerCL && upperLidR && lowerLidR && innerCR && outerCR) {
    const hL = Math.abs(upperLidL.y - lowerLidL.y);
    const wL = distance(innerCL, outerCL);
    const hR = Math.abs(upperLidR.y - lowerLidR.y);
    const wR = distance(innerCR, outerCR);
    if (wL > 0 && wR > 0) {
      metrics.palpebral_fissure_ratio = { value: ((hL / wL) + (hR / wR)) / 2, raw: { hL, wL, hR, wR } };
    }
  }

  // IPD ratio — interpupillary distance vs one eye width.
  // Anatomically IPD ≈ 2 × eye width (rule-of-fifths: pupil sits at the centre of
  // its own fifth, two fifths span the inter-pupil gap).
  if (irisL && irisR && innerCL && outerCL) {
    const ipd = distance(irisL, irisR);
    const eyeWidth = distance(innerCL, outerCL);
    if (eyeWidth > 0) metrics.ipd_ratio = { value: ipd / eyeWidth, raw: { ipd, eyeWidth } };
  } else if (innerCL && innerCR && outerCL && outerCR) {
    // Fallback: midpoint of inner/outer canthi as pupil proxy
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
    // Chin projection — pogonion z (forward) minus a baseline derived from
    // subnasale and pronasale, normalised by face height.
    const baseline = (subnasale.z + pronasale.z) / 2;
    const faceHeight = trichion && menton ? Math.abs(trichion.y - menton.y) : 1;
    metrics.chin_projection = {
      value: (pogonion.z - baseline) / Math.max(faceHeight, 1e-6) * 10, // scaled to mesh units
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
    // Normalise the brow-rim offset by intercanthal distance — a stable
    // anchor available on every face.
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
// Scoring — each metric → 0..100 based on its ideal config
// ---------------------------------------------------------------------------

function resolveIdeal(metricKey, sex) {
  const cfg = IDEALS[metricKey];
  if (!cfg) return null;
  if (cfg.male || cfg.female || cfg.unisex) {
    if (sex === 'male' && cfg.male) return cfg.male;
    if (sex === 'female' && cfg.female) return cfg.female;
    return cfg.unisex || cfg.male || cfg.female;
  }
  return cfg;
}

function scoreFromIdeal(value, ideal) {
  if (value == null || !Number.isFinite(value) || !ideal) return null;

  if (ideal.idealMin != null && ideal.idealMax != null) {
    const { idealMin, idealMax, hardMin, hardMax } = ideal;
    if (value >= idealMin && value <= idealMax) return 100;
    if (value <= hardMin || value >= hardMax) return 0;
    if (value < idealMin) {
      return Math.round(85 * (value - hardMin) / (idealMin - hardMin));
    }
    return Math.round(85 * (hardMax - value) / (hardMax - idealMax));
  }

  if (ideal.target != null && ideal.halfWidth != null) {
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

function scoreMetrics(metrics, sex = null) {
  const scored = {};
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

function composeHarmonyScore(scored) {
  let total = 0;
  let weightUsed = 0;
  const domainScores = {};

  for (const [domain, weight] of Object.entries(DOMAIN_WEIGHTS)) {
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

// Finding code rules: { metric, direction: 'low' | 'high' | 'either', threshold, code, severity }
// `direction` is relative to ideal: 'low' = value below ideal range / negative side; 'high' = above.
const FINDING_RULES = [
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

const SEVERITY_THRESHOLDS = { mild: 75, moderate: 55, marked: 0 };

// Metrics scoring at or above this threshold do not emit a finding. Tied to
// `mild` severity so the bands stay coherent — anything that wouldn't even
// qualify as a mild concern is treated as healthy.
const FINDING_THRESHOLD = SEVERITY_THRESHOLDS.mild;

function severityFromScore(score) {
  if (score >= SEVERITY_THRESHOLDS.mild) return 'mild';
  if (score >= SEVERITY_THRESHOLDS.moderate) return 'moderate';
  return 'marked';
}

function findingsFromScores(metrics, scored, sex) {
  const findings = [];
  for (const rule of FINDING_RULES) {
    const metric = metrics[rule.metric];
    const score = scored[rule.metric];
    if (!metric || score == null || score >= FINDING_THRESHOLD) continue;

    const ideal = resolveIdeal(rule.metric, sex);
    if (!ideal) continue;

    let side = 'either';
    if (ideal.idealMin != null && ideal.idealMax != null) {
      side = metric.value < ideal.idealMin ? 'low' : metric.value > ideal.idealMax ? 'high' : 'either';
    } else if (ideal.target != null) {
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

  // Order: lowest score first (most severe)
  findings.sort((a, b) => a.score - b.score);
  return findings;
}

// ---------------------------------------------------------------------------
// Top-level orchestration
// ---------------------------------------------------------------------------

// A mesh with no spatial extent (all-zero / coincident points) must NOT be
// scored — every metric degenerates to a finite-but-meaningless number and the
// old code returned harmony 78 / status 'ok' for it (#4). Reject it as 'no_face'.
function isDegenerateMesh(vertices) {
  // Accept both Array and TypedArray (real meshes are Float32Array, for which
  // Array.isArray() is false) — gate on a usable numeric length instead.
  if (!vertices || typeof vertices.length !== 'number' || vertices.length < 3) return true;
  let min = Infinity;
  let max = -Infinity;
  let anyFinite = false;
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    if (!Number.isFinite(v)) continue;
    anyFinite = true;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // No finite coords, or zero bounding-box extent → degenerate.
  return !anyFinite || (max - min) < 1e-6;
}

function analyzeBoneStructure({ vertices, blendShapes = null, sex = null, source = 'arkit' }) {
  // Validate the source up-front: a bogus source is a programmer error and must
  // throw regardless of mesh content (otherwise the degenerate guard below would
  // mask it for an all-zero mesh).
  if (!LANDMARK_TABLES[source]) throw new Error(`Unknown landmark source: ${source}`);
  if (isDegenerateMesh(vertices)) {
    return { harmony: null, status: 'no_face', metrics: {}, scored: {}, findings: [], domainScores: {} };
  }
  const metrics = computeMetrics3D(vertices, blendShapes, sex, source);
  if (!metrics) {
    return { harmony: null, status: 'no_face', metrics: {}, scored: {}, findings: [], domainScores: {} };
  }
  const scored = scoreMetrics(metrics, sex);
  const { harmony, domainScores } = composeHarmonyScore(scored);
  const findings = findingsFromScores(metrics, scored, sex);

  // Dominant driver — domain with lowest score (most room to improve)
  let dominantDriver = null;
  let lowest = Infinity;
  for (const [domain, score] of Object.entries(domainScores)) {
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

module.exports = {
  // Top-level
  analyzeBoneStructure,
  // Granular for tests
  computeMetrics3D,
  scoreMetrics,
  composeHarmonyScore,
  findingsFromScores,
  resolveIdeal,
  scoreFromIdeal,
  // Constants
  ARKIT_LANDMARKS,
  MEDIAPIPE_LANDMARKS,
  LANDMARK_TABLES,
  DOMAIN_WEIGHTS,
  METRICS_BY_DOMAIN,
  IDEALS,
  FINDING_RULES,
  FINDING_THRESHOLD,
  SEVERITY_THRESHOLDS,
  // Helpers (exported only for tests / downstream lifting)
  buildFaceFrame,
  toLocal,
  vec,
};
