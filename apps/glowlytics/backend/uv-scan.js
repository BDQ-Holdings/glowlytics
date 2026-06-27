/**
 * UV Mirror — deterministic UV/sun-damage + facial-asymmetry vision core.
 *
 * Pure, sharp-based, model-free. Two public async functions:
 *   - screenImage(imageBase64, landmarks?)            -> quality-gate screener
 *   - analyzeUv(imageBase64, { landmarks?, source? }) -> full UV analysis
 *
 * Reuses the CIELAB / ITA / spot primitives from image-processing.js so the
 * marketing scanner shares the same validated colour math as the app.
 *
 * Coordinate convention (load-bearing): "left"/"right" are the SUBJECT's
 * anatomical sides, which are the MIRROR of image x. Subject-left lives at
 * higher image x (viewer's right); subject-right at lower image x.
 *
 * Graceful degradation: if `sharp` cannot be required (V8 isolates / CI without
 * native deps) we return a deterministic, low-confidence result instead of
 * throwing — mirroring image-processing.js.
 */

let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}

const { srgbToLab, computeITA, countSpots, stats } = require('./image-processing');

// ---- Tunables --------------------------------------------------------------
const ANALYZE_MAX_SIDE = 512; // cap longest side for the per-pixel pass
const SCREEN_MAX_SIDE = 256; // cheaper decode for the live screener
const GRID_COLS = 48; // heatmap columns (rows derived from bbox aspect)
const GRID_ROWS_MIN = 16;
const GRID_ROWS_MAX = 96;

// Screener thresholds (per plan "Vision method")
const BRIGHTNESS_MIN = 40;
const BRIGHTNESS_MAX = 225;
const CLIP_HI = 250; // luma above this = blown highlight
const CLIP_LO = 5; // luma below this = crushed black
const CLIP_FRACTION_MAX = 0.12; // >12% clipped fails
const LIGHTING_RATIO_MAX = 0.18; // |Lleft-Lright|/overall > this fails
const COVERAGE_MIN = 0.12;
const COVERAGE_MAX = 0.92;
const YAW_DEG_MAX = 18;

// damageIntensity blend
const PIGMENT_ITA_HI = 55; // ITA >= this -> no pigment contribution
const PIGMENT_ITA_LO = -60; // ITA <= this -> full pigment contribution
const B_LAP_NORM = 12; // b* Laplacian magnitude -> spot response scale
const DARK_NORM = 25; // local luminance darkening scale
const W_PIGMENT = 0.6;
const W_SPOT = 0.25;
const W_DARK = 0.15;

const ASYM_BALANCED_ABS = 0.02; // |L-R| below this (and low relative) => balanced
const ASYM_BALANCED_REL = 0.05;

// Region layout: local fractions inside the face bbox.
// x: 0 = image-left, 1 = image-right. "_left"/"_right" suffixes are SUBJECT
// sides, so "_left" sits at high x (image-right) and "_right" at low x.
const REGION_LAYOUT = [
  { id: 'forehead', label: 'Forehead', side: 'center', x0: 0.18, y0: 0.04, x1: 0.82, y1: 0.24 },
  { id: 'periorbital_left', label: 'Left eye area', side: 'left', x0: 0.58, y0: 0.26, x1: 0.9, y1: 0.46 },
  { id: 'periorbital_right', label: 'Right eye area', side: 'right', x0: 0.1, y0: 0.26, x1: 0.42, y1: 0.46 },
  { id: 'cheek_left', label: 'Left cheek', side: 'left', x0: 0.6, y0: 0.48, x1: 0.92, y1: 0.74 },
  { id: 'cheek_right', label: 'Right cheek', side: 'right', x0: 0.08, y0: 0.48, x1: 0.4, y1: 0.74 },
  { id: 'nose', label: 'Nose', side: 'center', x0: 0.42, y0: 0.3, x1: 0.58, y1: 0.64 },
  { id: 'perioral_chin', label: 'Mouth & chin', side: 'center', x0: 0.3, y0: 0.74, x1: 0.7, y1: 0.96 },
];

// ---- Small helpers ---------------------------------------------------------
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
const clamp01 = (v) => clamp(v, 0, 1);
const round2 = (v) => Math.round(v * 100) / 100;
const round3 = (v) => Math.round(v * 1000) / 1000;
const lumaOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Broad skin-tone rule (Kovac et al. style). Neutral greys are rejected, so a
// uniform grey frame reads as 0 coverage and a full-frame skin crop as ~1.
function isSkin(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return (
    r > 95 &&
    g > 40 &&
    b > 20 &&
    mx - mn > 15 &&
    Math.abs(r - g) > 15 &&
    r > g &&
    r > b
  );
}

function severityOf(score) {
  // low < 33 <= moderate < 66 <= high
  if (score < 33) return 'low';
  if (score < 66) return 'moderate';
  return 'high';
}

/**
 * Decode base64 -> raw RGB, scaling the longest side down to `maxSide`.
 * Returns { data, width, height, srcWidth, srcHeight }.
 */
async function decodeRaw(imageBase64, maxSide) {
  const buffer = Buffer.from(imageBase64 || '', 'base64');
  if (buffer.length === 0) {
    const err = new Error('empty image');
    err.code = 'UV_BAD_IMAGE';
    throw err;
  }
  const meta = await sharp(buffer).metadata();
  if (!meta.width || !meta.height) {
    const err = new Error('undecodable image');
    err.code = 'UV_BAD_IMAGE';
    throw err;
  }
  const longest = Math.max(meta.width, meta.height);
  const scale = longest > maxSide ? maxSide / longest : 1;
  const width = Math.max(1, Math.round(meta.width * scale));
  const height = Math.max(1, Math.round(meta.height * scale));
  const { data } = await sharp(buffer)
    .resize(width, height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width, height, srcWidth: meta.width, srcHeight: meta.height };
}

/**
 * Normalise a caller-supplied landmarks object to fractional [0,1] eye/nose
 * points. Returns null when eyes+nose are not all resolvable (so face_angle
 * is skipped). Accepts {leftEye,rightEye,nose} with camelCase / snake_case /
 * noseTip aliases; pixel coords (any value > 1.5) are normalised by src dims.
 */
function extractLandmarkPoints(landmarks, srcW, srcH) {
  if (!landmarks || typeof landmarks !== 'object') return null;
  const pick = (...keys) => {
    for (const k of keys) {
      const p = landmarks[k];
      if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
    }
    return null;
  };
  const le = pick('leftEye', 'left_eye');
  const re = pick('rightEye', 'right_eye');
  const nose = pick('nose', 'noseTip', 'nose_tip');
  if (!le || !re || !nose) return null;

  const looksPixel =
    Math.max(le.x, le.y, re.x, re.y, nose.x, nose.y) > 1.5;
  const nx = (p) => clamp01(looksPixel ? p.x / srcW : p.x);
  const ny = (p) => clamp01(looksPixel ? p.y / srcH : p.y);

  return {
    leftEye: { x: nx(le), y: ny(le) },
    rightEye: { x: nx(re), y: ny(re) },
    nose: { x: nx(nose), y: ny(nose) },
  };
}

/**
 * Yaw proxy in degrees from eye/nose horizontal balance. 0 = centred.
 * Sign is informational; the screener gates on |yaw|.
 */
function computeYawDeg(pts) {
  // Identify which eye is on the image-left (smaller x) regardless of label.
  const imgLeft = pts.leftEye.x <= pts.rightEye.x ? pts.leftEye : pts.rightEye;
  const imgRight = pts.leftEye.x <= pts.rightEye.x ? pts.rightEye : pts.leftEye;
  const dLeft = pts.nose.x - imgLeft.x; // nose distance from image-left eye
  const dRight = imgRight.x - pts.nose.x; // nose distance from image-right eye
  const denom = dLeft + dRight;
  if (Math.abs(denom) < 1e-6) return 0;
  const balance = (dRight - dLeft) / denom; // [-1,1], 0 = symmetric
  return clamp(balance, -1, 1) * 90;
}

// ---- Screener --------------------------------------------------------------

function buildScreenChecks(decoded, yawDeg, hasLandmarks) {
  const { data, width, height } = decoded;
  const total = width * height;
  let sumLuma = 0;
  let sumLeft = 0;
  let sumRight = 0;
  let cntLeft = 0;
  let cntRight = 0;
  let clipped = 0;
  let skin = 0;
  const halfX = width / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const l = lumaOf(r, g, b);
      sumLuma += l;
      if (l > CLIP_HI || l < CLIP_LO) clipped++;
      if (isSkin(r, g, b)) skin++;
      if (x < halfX) {
        sumLeft += l;
        cntLeft++;
      } else {
        sumRight += l;
        cntRight++;
      }
    }
  }

  const meanLuma = sumLuma / total;
  const clipFraction = clipped / total;
  const leftMean = cntLeft ? sumLeft / cntLeft : 0;
  const rightMean = cntRight ? sumRight / cntRight : 0;
  const lightingRatio = meanLuma > 0 ? Math.abs(leftMean - rightMean) / meanLuma : 0;
  const skinFraction = skin / total;

  const brightness = {
    id: 'brightness',
    label: 'Lighting brightness',
    pass: meanLuma >= BRIGHTNESS_MIN && meanLuma <= BRIGHTNESS_MAX,
    value: round2(meanLuma),
    message:
      meanLuma < BRIGHTNESS_MIN
        ? 'Too dark — find brighter, even light.'
        : meanLuma > BRIGHTNESS_MAX
        ? 'Too bright — reduce direct light.'
        : 'Brightness looks good.',
  };
  const highlight_clipping = {
    id: 'highlight_clipping',
    label: 'Highlight / shadow clipping',
    pass: clipFraction <= CLIP_FRACTION_MAX,
    value: round3(clipFraction),
    message:
      clipFraction > CLIP_FRACTION_MAX
        ? 'Blown highlights or crushed shadows — soften the light.'
        : 'Tonal range looks usable.',
  };
  const lighting_symmetry = {
    id: 'lighting_symmetry',
    label: 'Even side-to-side lighting',
    pass: lightingRatio <= LIGHTING_RATIO_MAX,
    value: round3(lightingRatio),
    message:
      lightingRatio > LIGHTING_RATIO_MAX
        ? 'One side is lit more than the other — face the light squarely.'
        : 'Lighting is balanced left to right.',
  };
  const face_coverage = {
    id: 'face_coverage',
    label: 'Face fills the frame',
    pass: skinFraction >= COVERAGE_MIN && skinFraction <= COVERAGE_MAX,
    value: round3(skinFraction),
    message:
      skinFraction < COVERAGE_MIN
        ? 'No face detected or too far away — move closer.'
        : skinFraction > COVERAGE_MAX
        ? 'Too close — pull back so the whole face is visible.'
        : 'Face coverage looks good.',
  };
  const face_angle = hasLandmarks
    ? {
        id: 'face_angle',
        label: 'Looking straight ahead',
        pass: Math.abs(yawDeg) <= YAW_DEG_MAX,
        value: round2(yawDeg),
        message:
          Math.abs(yawDeg) > YAW_DEG_MAX
            ? 'Head is turned — look straight at the camera.'
            : 'Head is facing forward.',
      }
    : {
        id: 'face_angle',
        label: 'Looking straight ahead',
        pass: null,
        value: null,
        message: 'skipped',
      };

  return [brightness, highlight_clipping, lighting_symmetry, face_coverage, face_angle];
}

function summariseScreener(checks, hasLandmarks) {
  const byId = (id) => checks.find((c) => c.id === id);
  const hardPass = byId('brightness').pass === true && byId('highlight_clipping').pass === true;
  const canProceed = checks.every((c) => c.pass === null || c.pass === true);

  let confidence = hasLandmarks ? 0.9 : 0.6; // lower when landmarks absent
  for (const c of checks) {
    if (c.pass !== false) continue;
    if (c.id === 'brightness') confidence *= 0.4;
    else if (c.id === 'highlight_clipping') confidence *= 0.5;
    else if (c.id === 'lighting_symmetry') confidence *= 0.85;
    else if (c.id === 'face_coverage') confidence *= 0.8;
    else if (c.id === 'face_angle') confidence *= 0.7;
  }

  return {
    ok: hardPass, // no HARD failure -> analysis may run
    canProceed, // all measurable checks pass -> ideal capture
    confidence: round2(clamp01(confidence)),
    checks,
  };
}

function fallbackScreen(hasLandmarks) {
  // sharp unavailable: we cannot measure pixels — pass softly at low confidence.
  const note = 'sharp unavailable — screening skipped';
  const checks = ['brightness', 'highlight_clipping', 'lighting_symmetry', 'face_coverage'].map(
    (id) => ({ id, label: id, pass: true, value: null, message: note })
  );
  checks.push({
    id: 'face_angle',
    label: 'face_angle',
    pass: hasLandmarks ? true : null,
    value: null,
    message: hasLandmarks ? note : 'skipped',
  });
  return { ok: true, canProceed: true, confidence: 0.1, checks };
}

async function screenImage(imageBase64, landmarks) {
  const hasLandmarks = !!(landmarks && typeof landmarks === 'object');
  if (!sharp) return fallbackScreen(hasLandmarks);

  const decoded = await decodeRaw(imageBase64, SCREEN_MAX_SIDE);
  const pts = extractLandmarkPoints(landmarks, decoded.srcWidth, decoded.srcHeight);
  const yawDeg = pts ? computeYawDeg(pts) : 0;
  const checks = buildScreenChecks(decoded, yawDeg, !!pts);
  return summariseScreener(checks, !!pts);
}

// ---- Analysis --------------------------------------------------------------

// Separable box blur (radius r) over a Float32Array -> mean luminance field.
function boxBlur(src, width, height, r) {
  const tmp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let cnt = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= width) continue;
        sum += src[y * width + xx];
        cnt++;
      }
      tmp[y * width + x] = sum / cnt;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let cnt = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        sum += tmp[yy * width + x];
        cnt++;
      }
      out[y * width + x] = sum / cnt;
    }
  }
  return out;
}

/**
 * Per-pixel damage intensity field in [0,1]. Blends low-ITA pigment, b*
 * Laplacian spot response, and local luminance darkening. Also returns the
 * b* field (for region spot counting) and a skin mask (for the bbox).
 */
function computeDamageField(decoded) {
  const { data, width, height } = decoded;
  const total = width * height;
  const bStar = new Float32Array(total);
  const ita = new Float32Array(total);
  const lum = new Float32Array(total);
  const skinMask = new Uint8Array(total);

  for (let i = 0; i < total; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    const lab = srgbToLab(r, g, b);
    bStar[i] = lab.b;
    ita[i] = computeITA(lab.L, lab.b);
    lum[i] = lumaOf(r, g, b);
    if (isSkin(r, g, b)) skinMask[i] = 1;
  }

  const blurLum = boxBlur(lum, width, height, 2);
  const damage = new Float32Array(total);
  const pigSpan = PIGMENT_ITA_HI - PIGMENT_ITA_LO;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const pigment = clamp01((PIGMENT_ITA_HI - ita[i]) / pigSpan);

      let lap = 0;
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        lap =
          4 * bStar[i] -
          bStar[i - 1] -
          bStar[i + 1] -
          bStar[i - width] -
          bStar[i + width];
      }
      const spot = clamp01(Math.abs(lap) / B_LAP_NORM);
      const dark = clamp01((blurLum[i] - lum[i]) / DARK_NORM);

      damage[i] = clamp01(W_PIGMENT * pigment + W_SPOT * spot + W_DARK * dark);
    }
  }

  return { damage, bStar, skinMask, width, height };
}

/**
 * Face bounding box (normalised [0,1]) from landmark eyes/nose if present,
 * else from the skin-tone pixel centroid + spread. Falls back to a centred box.
 */
function computeFaceBounds(field, pts) {
  const { skinMask, width, height } = field;
  if (pts) {
    const eyeMidX = (pts.leftEye.x + pts.rightEye.x) / 2;
    const eyeY = (pts.leftEye.y + pts.rightEye.y) / 2;
    const eyeDist = Math.max(0.04, Math.abs(pts.rightEye.x - pts.leftEye.x));
    const w = clamp01(eyeDist * 2.2);
    const h = clamp01(eyeDist * 3.2);
    const x = clamp01(eyeMidX - w / 2);
    const y = clamp01(eyeY - eyeDist * 1.1);
    return {
      x: round3(x),
      y: round3(y),
      w: round3(Math.min(w, 1 - x)),
      h: round3(Math.min(h, 1 - y)),
    };
  }

  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!skinMask[y * width + x]) continue;
      const fx = x / width;
      const fy = y / height;
      n++;
      sx += fx;
      sy += fy;
      sxx += fx * fx;
      syy += fy * fy;
    }
  }
  if (n / (width * height) < 0.05) {
    return { x: 0.2, y: 0.1, w: 0.6, h: 0.8 };
  }
  const mx = sx / n;
  const my = sy / n;
  const stdX = Math.sqrt(Math.max(0, sxx / n - mx * mx));
  const stdY = Math.sqrt(Math.max(0, syy / n - my * my));
  const x0 = clamp01(mx - 2.2 * stdX);
  const y0 = clamp01(my - 2.2 * stdY);
  const x1 = clamp01(mx + 2.2 * stdX);
  const y1 = clamp01(my + 2.2 * stdY);
  return {
    x: round3(x0),
    y: round3(y0),
    w: round3(Math.max(0.05, x1 - x0)),
    h: round3(Math.max(0.05, y1 - y0)),
  };
}

/** Downsample the damage field within `bounds` into a cols*rows heatmap grid. */
function buildHeatmap(field, bounds) {
  const { damage, width, height } = field;
  const bx = Math.floor(bounds.x * width);
  const by = Math.floor(bounds.y * height);
  const bw = Math.max(1, Math.round(bounds.w * width));
  const bh = Math.max(1, Math.round(bounds.h * height));
  const x1 = Math.min(width, bx + bw);
  const y1 = Math.min(height, by + bh);
  const spanW = Math.max(1, x1 - bx);
  const spanH = Math.max(1, y1 - by);

  const cols = Math.max(1, Math.min(GRID_COLS, spanW));
  const rowsTarget = Math.round(GRID_COLS * (spanH / spanW));
  const rows = Math.max(1, Math.min(GRID_ROWS_MAX, Math.max(GRID_ROWS_MIN, rowsTarget), spanH));

  const sums = new Float64Array(cols * rows);
  const cnts = new Uint32Array(cols * rows);
  for (let y = by; y < y1; y++) {
    const rr = Math.min(rows - 1, Math.floor(((y - by) / spanH) * rows));
    for (let x = bx; x < x1; x++) {
      const cc = Math.min(cols - 1, Math.floor(((x - bx) / spanW) * cols));
      const cell = rr * cols + cc;
      sums[cell] += damage[y * width + x];
      cnts[cell]++;
    }
  }
  const cells = new Array(cols * rows);
  for (let i = 0; i < cells.length; i++) {
    cells[i] = cnts[i] ? round3(clamp01(sums[i] / cnts[i])) : 0;
  }
  return { cols, rows, bounds, cells };
}

/** Mean damage + spot count + score for one normalised box region. */
function regionStats(field, x0n, y0n, x1n, y1n) {
  const { damage, bStar, width, height } = field;
  const x0 = clamp(Math.floor(x0n * width), 0, width - 1);
  const y0 = clamp(Math.floor(y0n * height), 0, height - 1);
  const x1 = clamp(Math.ceil(x1n * width), x0 + 1, width);
  const y1 = clamp(Math.ceil(y1n * height), y0 + 1, height);
  const w = x1 - x0;
  const h = y1 - y0;

  let sum = 0;
  let cnt = 0;
  const bPatch = new Float32Array(w * h);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      sum += damage[i];
      bPatch[(y - y0) * w + (x - x0)] = bStar[i];
      cnt++;
    }
  }
  const intensity = cnt ? sum / cnt : 0;
  const spotCount = w >= 3 && h >= 3 ? countSpots(bPatch, w, h, 15) : 0;
  return {
    intensity: round3(clamp01(intensity)),
    spotCount,
    score: clamp(Math.round(intensity * 100), 0, 100),
  };
}

function buildRegions(field, bounds) {
  return REGION_LAYOUT.map((r) => {
    const x0 = bounds.x + r.x0 * bounds.w;
    const y0 = bounds.y + r.y0 * bounds.h;
    const x1 = bounds.x + r.x1 * bounds.w;
    const y1 = bounds.y + r.y1 * bounds.h;
    const st = regionStats(field, x0, y0, x1, y1);
    return {
      id: r.id,
      label: r.label,
      side: r.side,
      score: st.score,
      intensity: st.intensity,
      spotCount: st.spotCount,
      polygon: [
        [round3(x0), round3(y0)],
        [round3(x1), round3(y0)],
        [round3(x1), round3(y1)],
        [round3(x0), round3(y1)],
      ],
    };
  });
}

/**
 * Asymmetry from the heatmap grid reflected across the subject midline.
 * Subject-left = cells whose centre x > midline (image-right) and vice versa.
 */
function computeAsymmetry(heatmap, regions, midlineX) {
  const { cols, rows, bounds, cells } = heatmap;
  let leftSum = 0;
  let leftCnt = 0;
  let rightSum = 0;
  let rightCnt = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const centreX = bounds.x + ((c + 0.5) / cols) * bounds.w;
      const v = cells[r * cols + c];
      if (centreX > midlineX) {
        leftSum += v;
        leftCnt++;
      } else {
        rightSum += v;
        rightCnt++;
      }
    }
  }
  const leftMean = leftCnt ? leftSum / leftCnt : 0;
  const rightMean = rightCnt ? rightSum / rightCnt : 0;
  const diff = Math.abs(leftMean - rightMean);
  const rel = diff / ((leftMean + rightMean) / 2 + 1e-6);

  let dominantSide;
  if (diff < ASYM_BALANCED_ABS && rel < ASYM_BALANCED_REL) dominantSide = 'balanced';
  else dominantSide = leftMean > rightMean ? 'left' : 'right';

  const regionById = (id) => regions.find((r) => r.id === id);
  const pairDelta = (leftId, rightId) =>
    round3((regionById(leftId).intensity || 0) - (regionById(rightId).intensity || 0));

  return {
    score: clamp(Math.round(rel * 100), 0, 100),
    dominantSide,
    leftMean: round3(leftMean),
    rightMean: round3(rightMean),
    perRegionDelta: [
      { pair: 'periorbital', delta: pairDelta('periorbital_left', 'periorbital_right') },
      { pair: 'cheek', delta: pairDelta('cheek_left', 'cheek_right') },
    ],
  };
}

function fallbackAnalyze(imageBase64, hasLandmarks) {
  // Deterministic, low-confidence stand-in when sharp is unavailable.
  const buf = Buffer.from(imageBase64 || '', 'base64');
  const seed = (buf.length % 17) / 200; // tiny, stable, in ~[0,0.08]
  const intensity = round3(clamp01(0.05 + seed));
  const score = clamp(Math.round(intensity * 100), 0, 100);
  const cols = GRID_COLS;
  const rows = GRID_COLS;
  const bounds = { x: 0.2, y: 0.1, w: 0.6, h: 0.8 };
  const cells = new Array(cols * rows).fill(intensity);
  const regions = REGION_LAYOUT.map((r) => {
    const x0 = bounds.x + r.x0 * bounds.w;
    const y0 = bounds.y + r.y0 * bounds.h;
    const x1 = bounds.x + r.x1 * bounds.w;
    const y1 = bounds.y + r.y1 * bounds.h;
    return {
      id: r.id,
      label: r.label,
      side: r.side,
      score,
      intensity,
      spotCount: 0,
      polygon: [
        [round3(x0), round3(y0)],
        [round3(x1), round3(y0)],
        [round3(x1), round3(y1)],
        [round3(x0), round3(y1)],
      ],
    };
  });
  return {
    overall: { sunDamageScore: score, severity: severityOf(score), confidence: 0.1 },
    heatmap: { cols, rows, bounds, cells },
    regions,
    asymmetry: {
      score: 0,
      dominantSide: 'balanced',
      leftMean: intensity,
      rightMean: intensity,
      perRegionDelta: [
        { pair: 'periorbital', delta: 0 },
        { pair: 'cheek', delta: 0 },
      ],
    },
    screener: fallbackScreen(hasLandmarks),
    landmarksUsed: false,
  };
}

async function analyzeUv(imageBase64, options) {
  const { landmarks } = options || {};
  const hasLandmarks = !!(landmarks && typeof landmarks === 'object');

  const screener = await screenImage(imageBase64, landmarks);
  if (!screener.ok) {
    const err = new Error('Image unusable for UV analysis (too dark/bright or clipped).');
    err.code = 'UV_UNUSABLE';
    err.checks = screener.checks;
    throw err;
  }

  if (!sharp) return fallbackAnalyze(imageBase64, hasLandmarks);

  const decoded = await decodeRaw(imageBase64, ANALYZE_MAX_SIDE);
  const pts = extractLandmarkPoints(landmarks, decoded.srcWidth, decoded.srcHeight);
  const field = computeDamageField(decoded);
  const bounds = computeFaceBounds(field, pts);
  const heatmap = buildHeatmap(field, bounds);
  const regions = buildRegions(field, bounds);
  const midlineX = pts ? pts.nose.x : bounds.x + bounds.w / 2;
  const asymmetry = computeAsymmetry(heatmap, regions, midlineX);

  const sunDamageScore = clamp(
    Math.round(regions.reduce((s, r) => s + r.score, 0) / regions.length),
    0,
    100
  );

  return {
    overall: {
      sunDamageScore,
      severity: severityOf(sunDamageScore),
      confidence: screener.confidence,
    },
    heatmap,
    regions,
    asymmetry,
    screener,
    landmarksUsed: !!pts,
  };
}

module.exports = { screenImage, analyzeUv };
