/**
 * Layer 2: Custom CV Model Inference via ONNX Runtime
 *
 * V2 models (knowledge-distilled from Claude Sonnet 4):
 * - skin_signals.onnx: Unified multi-head EfficientNet-B0 predicting
 *   structure, hydration, sunDamage, elasticity (4 outputs, 0-1 range)
 * - acne_detector.onnx: YOLOv8s single-class acne lesion detector
 *
 * Models are loaded from ONNX format. When models are not available,
 * Layer 1 deterministic features are used as fallback.
 */

const path = require('path');
const fs = require('fs');

let ort;
try {
  ort = require('onnxruntime-node');
} catch {
  ort = null;
}

let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}

const MODEL_DIR = path.join(__dirname, 'models');

// V2 model sessions
let skinSignalsSession = null;
let acneDetectorSession = null;

/**
 * Check if a model file exists.
 */
function modelExists(name) {
  return fs.existsSync(path.join(MODEL_DIR, `${name}.onnx`));
}

/**
 * Ensure a model file is present and valid (not an external-data stub).
 * Downloads from HuggingFace if missing or below minSize.
 */
async function ensureModel(name, url, minSize) {
  const modelPath = path.join(MODEL_DIR, `${name}.onnx`);
  if (fs.existsSync(modelPath)) {
    const sz = fs.statSync(modelPath).size;
    if (sz >= minSize) {
      console.log(`[signal-models] ${name}.onnx: ${(sz / 1024 / 1024).toFixed(1)} MB (ok)`);
      return;
    }
    console.log(`[signal-models] ${name}.onnx: ${(sz / 1024 / 1024).toFixed(1)} MB (too small, re-downloading)`);
  } else {
    console.log(`[signal-models] ${name}.onnx: not found, downloading`);
  }

  try {
    const https = require('https');
    const tmpPath = modelPath + '.tmp';
    await new Promise((resolve, reject) => {
      const follow = (reqUrl) => {
        https.get(reqUrl, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            follow(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          const file = fs.createWriteStream(tmpPath);
          res.pipe(file);
          file.on('finish', () => { file.close(resolve); });
          file.on('error', reject);
        }).on('error', reject);
      };
      follow(url);
    });
    fs.renameSync(tmpPath, modelPath);
    const sz = fs.statSync(modelPath).size;
    console.log(`[signal-models] ${name}.onnx: downloaded ${(sz / 1024 / 1024).toFixed(1)} MB`);
  } catch (err) {
    console.warn(`[signal-models] Failed to download ${name}:`, err.message);
    // Clean up partial download
    const tmpPath = modelPath + '.tmp';
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

/**
 * Load an ONNX model session (cached).
 */
async function loadModel(name) {
  if (!ort) return null;
  const modelPath = path.join(MODEL_DIR, `${name}.onnx`);
  if (!fs.existsSync(modelPath)) return null;

  try {
    return await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
    });
  } catch (err) {
    console.warn(`[signal-models] Failed to load ${name}:`, err.message);
    return null;
  }
}

/**
 * Initialize all model sessions. Call once at startup.
 */
async function initModels() {
  if (!ort) {
    console.warn('[signal-models] onnxruntime-node not available — using Layer 1 features only');
    return { loaded: [] };
  }

  const loaded = [];

  // Ensure models directory exists
  if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
  }

  // Auto-download models if missing or incomplete (external-data stub).
  // Pin to commit 18966b9 where models were force-added (removed from HEAD to
  // unblock `railway up`). NOTE: the path inside that commit is still the
  // pre-monorepo layout `RadianceIQ/backend/models/`, NOT `apps/glowlytics/...`.
  // Repo also moved RadianceIQ → BDQ-Holdings.
  const GH_BASE = 'https://raw.githubusercontent.com/BDQ-Holdings/glowlytics/18966b9/RadianceIQ/backend/models';
  await ensureModel('skin_signals_v2', `${GH_BASE}/skin_signals_v2.onnx`, 10_000_000);
  await ensureModel('acne_detector', `${GH_BASE}/acne_detector.onnx`, 30_000_000);

  if (modelExists('skin_signals_v2')) {
    skinSignalsSession = await loadModel('skin_signals_v2');
    if (skinSignalsSession) loaded.push('skin_signals_v2');
  }

  if (modelExists('acne_detector')) {
    acneDetectorSession = await loadModel('acne_detector');
    if (acneDetectorSession) loaded.push('acne_detector');
  }

  console.log(`[signal-models] Loaded models: ${loaded.length > 0 ? loaded.join(', ') : 'none (using Layer 1 fallback)'}`);
  return { loaded };
}

/**
 * Map facial zone from bbox center coordinates.
 */
function bboxToZone(cx, cy) {
  if (cy < 0.25) return 'forehead';
  if (cy < 0.45) {
    if (cx < 0.35) return 'left_cheek';
    if (cx > 0.65) return 'right_cheek';
    return 'nose';
  }
  if (cy < 0.65) {
    if (cx < 0.35) return 'left_cheek';
    if (cx > 0.65) return 'right_cheek';
    return 'nose';
  }
  if (cy < 0.8) return 'chin';
  return 'jaw';
}

const LESION_CLASSES = ['acne'];

// ImageNet normalization constants
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

/**
 * Prepare an image tensor for the v2 skin signals model.
 * Resize shortest side to 256, center crop 224x224, ImageNet normalize.
 *
 * @param {string} base64Image - Base64-encoded image
 * @returns {Promise<ort.Tensor|null>} Float32 tensor [1, 3, 224, 224]
 */
async function prepareImageTensorV2(base64Image) {
  if (!sharp || !ort) return null;

  const buf = Buffer.from(base64Image, 'base64');
  const metadata = await sharp(buf).metadata();
  const { width, height } = metadata;
  const scale = 256 / Math.min(width, height);
  const resizedW = Math.round(width * scale);
  const resizedH = Math.round(height * scale);

  const cropLeft = Math.round((resizedW - 224) / 2);
  const cropTop = Math.round((resizedH - 224) / 2);

  const { data } = await sharp(buf)
    .resize(resizedW, resizedH)
    .extract({ left: cropLeft, top: cropTop, width: 224, height: 224 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = 224 * 224;
  const floats = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    floats[i] = (data[i * 3] / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    floats[pixels + i] = (data[i * 3 + 1] / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    floats[2 * pixels + i] = (data[i * 3 + 2] / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }

  return new ort.Tensor('float32', floats, [1, 3, 224, 224]);
}

/**
 * Prepare an image tensor for the YOLOv8 lesion detector.
 * Resize to 640x640, normalize to [0, 1] (no ImageNet normalization).
 *
 * @param {string} base64Image - Base64-encoded image
 * @returns {Promise<ort.Tensor|null>} Float32 tensor [1, 3, 640, 640]
 */
async function prepareDetectorTensor(base64Image) {
  if (!sharp || !ort) return null;

  const buf = Buffer.from(base64Image, 'base64');
  const { data } = await sharp(buf)
    .resize(640, 640, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = 640 * 640;
  const floats = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    floats[i] = data[i * 3] / 255;
    floats[pixels + i] = data[i * 3 + 1] / 255;
    floats[2 * pixels + i] = data[i * 3 + 2] / 255;
  }

  return new ort.Tensor('float32', floats, [1, 3, 640, 640]);
}

/**
 * Compute Intersection over Union for two axis-aligned bounding boxes.
 * Boxes are [x, y, w, h].
 */
function computeIoU(boxA, boxB) {
  const ax1 = boxA[0], ay1 = boxA[1], ax2 = boxA[0] + boxA[2], ay2 = boxA[1] + boxA[3];
  const bx1 = boxB[0], by1 = boxB[1], bx2 = boxB[0] + boxB[2], by2 = boxB[1] + boxB[3];

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;

  const areaA = boxA[2] * boxA[3];
  const areaB = boxB[2] * boxB[3];
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

/**
 * Greedy Non-Maximum Suppression.
 * @param {Array<[number,number,number,number]>} boxes - [x, y, w, h]
 * @param {number[]} scores - confidence scores
 * @param {number} iouThreshold
 * @returns {number[]} kept indices
 */
function nms(boxes, scores, iouThreshold) {
  const indices = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const kept = [];
  const suppressed = new Set();

  for (const i of indices) {
    if (suppressed.has(i)) continue;
    kept.push(i);
    for (const j of indices) {
      if (j === i || suppressed.has(j)) continue;
      if (computeIoU(boxes[i], boxes[j]) > iouThreshold) {
        suppressed.add(j);
      }
    }
  }

  return kept;
}

/**
 * Run the unified v2 skin signals model.
 * Returns {structure, hydration, sunDamage, elasticity} scores 0-100, or null.
 */
async function runSkinSignalsModel(base64Image) {
  if (!skinSignalsSession) return null;

  const tensor = await prepareImageTensorV2(base64Image);
  if (!tensor) return null;

  const results = await skinSignalsSession.run({ image: tensor });
  const output = results[Object.keys(results)[0]];
  const data = output.data;

  // Output order: [structure, hydration, sunDamage, elasticity], values in [0,1]
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v * 100)));
  return {
    structure: clamp(data[0]),
    hydration: clamp(data[1]),
    sunDamage: clamp(data[2]),
    elasticity: clamp(data[3]),
  };
}

/**
 * Run YOLOv8s acne detector (single-class).
 * Returns array of detected lesions with bounding boxes.
 */
async function runAcneDetector(base64Image) {
  if (!acneDetectorSession) return [];

  const tensor = await prepareDetectorTensor(base64Image);
  if (!tensor) return [];

  const results = await acneDetectorSession.run({ images: tensor });
  const outputKey = results.output0 ? 'output0' : Object.keys(results)[0];
  const raw = results[outputKey];

  // raw shape: [1, 5, 8400] — 4 bbox coords + 1 class score per detection
  const data = raw.data;
  const numDetections = 8400;
  // Two-tier confidence: 0.15 for display (dimmed), 0.30 for scoring impact
  const confThresholdDisplay = 0.04;
  const confThresholdScoring = 0.08;
  const iouThreshold = 0.45;

  const candidateBoxes = [];
  const candidateScores = [];

  for (let d = 0; d < numDetections; d++) {
    const cx = data[0 * numDetections + d];
    const cy = data[1 * numDetections + d];
    const w = data[2 * numDetections + d];
    const h = data[3 * numDetections + d];
    const score = data[4 * numDetections + d];

    if (score < confThresholdDisplay) continue;

    // Convert center format to [x, y, w, h] normalized
    const bx = (cx - w / 2) / 640;
    const by = (cy - h / 2) / 640;
    const bw = w / 640;
    const bh = h / 640;

    candidateBoxes.push([bx, by, bw, bh]);
    candidateScores.push(score);
  }

  if (candidateBoxes.length === 0) return [];

  // Single-class NMS
  const keptIndices = nms(candidateBoxes, candidateScores, iouThreshold);

  // Sort by confidence descending, limit to top 20
  keptIndices.sort((a, b) => candidateScores[b] - candidateScores[a]);

  return keptIndices.slice(0, 20).map((i) => {
    const [bx, by, bw, bh] = candidateBoxes[i];
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    return {
      class: 'acne',
      confidence: Math.round(candidateScores[i] * 100) / 100,
      bbox: [bx, by, bw, bh],
      zone: bboxToZone(cx, cy),
      tier: candidateScores[i] >= confThresholdScoring ? 'confirmed' : 'possible',
    };
  });
}

/**
 * Run all available models on the image.
 * Returns model-based signal score overrides and lesion detections.
 *
 * @param {string} base64Image - Base64-encoded image
 * @param {object} layer1Features - Features from deterministic image processing
 * @returns {Promise<object>} Model inference results
 */
async function runAllModels(base64Image, layer1Features) {
  const results = {
    signalOverrides: {
      structure: null,
      hydration: null,
      sunDamage: null,
      elasticity: null,
    },
    lesions: [],
    signalConfidence: {
      structure: 'med',
      hydration: 'med',
      inflammation: 'med',
      sunDamage: 'med',
      elasticity: 'med',
    },
  };

  const promises = [];

  if (skinSignalsSession) {
    promises.push(
      runSkinSignalsModel(base64Image)
        .then((scores) => {
          if (scores) {
            results.signalOverrides.structure = scores.structure;
            results.signalOverrides.hydration = scores.hydration;
            results.signalOverrides.sunDamage = scores.sunDamage;
            results.signalOverrides.elasticity = scores.elasticity;
            results.signalConfidence.structure = 'high';
            results.signalConfidence.hydration = 'high';
            results.signalConfidence.sunDamage = 'high';
            results.signalConfidence.elasticity = 'high';
          }
        })
        .catch((err) => {
          console.warn('[signal-models] Skin signals model error:', err.message);
        })
    );
  }

  if (acneDetectorSession) {
    promises.push(
      runAcneDetector(base64Image)
        .then((lesions) => {
          results.lesions = lesions;
        })
        .catch((err) => {
          console.warn('[signal-models] Acne detector error:', err.message);
        })
    );
  }

  await Promise.all(promises);

  return results;
}

/**
 * Reliability coefficients for uncertainty-weighted score fusion.
 *
 * Per-layer, per-signal beta values (0-1) reflecting each layer's
 * expected reliability for that signal. Inspired by Dempster-Shafer
 * discounting: lower beta = less influence on final score.
 *
 * Layer 1 (deterministic): strong for inflammation (a*) and sunDamage (ITA),
 *   moderate for structure/hydration/elasticity (texture proxies).
 * Layer 2 (v2 unified model): highest reliability when loaded, 0 otherwise.
 *   Correlations: structure r=0.913, hydration r=0.889, sunDamage r=0.882, elasticity r=0.940
 * Layer 3 (GPT-4o): moderate — excellent semantic understanding but
 *   coarse numerical precision from a vision-language model.
 */
const BETA_L1 = {
  structure: 0.5,
  hydration: 0.5,
  inflammation: 0.8,
  sunDamage: 0.8,
  elasticity: 0.5,
};

const BETA_L2_LOADED = {
  structure: 0.9,
  hydration: 0.9,
  inflammation: 0.0, // no Layer 2 model for inflammation
  sunDamage: 0.85,   // v2 model covers sunDamage (r=0.882)
  elasticity: 0.9,
};

const BETA_L3 = {
  structure: 0.6,
  hydration: 0.6,
  inflammation: 0.6,
  sunDamage: 0.6,
  elasticity: 0.6,
};

/**
 * Merge scores from all three layers using uncertainty-weighted fusion.
 *
 * merged_signal = (beta_L1 * L1 + beta_L2 * L2 + beta_L3 * L3) / (beta_L1 + beta_L2 + beta_L3)
 *
 * When Layer 2 is unavailable (beta=0), formula naturally falls back to L1+L3 blend.
 * When all 3 are present, Layer 2 dominates (beta=0.9) but L1 and L3 still contribute corrections.
 *
 * @param {object} layer1Scores - Signal scores from deterministic features
 * @param {object} layer2Results - Results from custom CV models
 * @param {object} layer3Scores - Signal scores from GPT-4o (now direct, not derived)
 * @returns {object} Merged signal scores
 */
function mergeSignalScores(layer1Scores, layer2Results, layer3Scores) {
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
  const overrides = layer2Results.signalOverrides;
  const signals = ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'];
  const merged = {};

  // When Layer 3 is unavailable (no-LLM mode or quota error), pass null/undefined
  // and we zero its weight so it contributes nothing to the merge — the formula
  // collapses cleanly to a Layer 1 + Layer 2 only blend.
  const l3Available = layer3Scores != null;

  for (const signal of signals) {
    const rawL1 = layer1Scores[signal];
    const l1 = Number.isFinite(rawL1) ? rawL1 : 50;
    const rawL2 = overrides?.[signal];
    const l2 = Number.isFinite(rawL2) ? rawL2 : undefined;
    const rawL3 = l3Available ? layer3Scores[signal] : undefined;
    const l3 = Number.isFinite(rawL3) ? rawL3 : l1;

    const betaL1 = BETA_L1[signal];
    const betaL2 = l2 !== undefined ? BETA_L2_LOADED[signal] : 0;
    const betaL3 = l3Available && Number.isFinite(rawL3) ? BETA_L3[signal] : 0;

    const totalBeta = betaL1 + betaL2 + betaL3;
    if (totalBeta === 0) {
      merged[signal] = clamp(l1);
      continue;
    }

    const weightedSum = betaL1 * l1 + betaL2 * (l2 ?? 0) + betaL3 * l3;
    merged[signal] = clamp(weightedSum / totalBeta);
  }

  return merged;
}

/**
 * Apply lesion detection feedback to signal scores.
 * Detected acne lesions create penalties for inflammation and structure,
 * closing the loop between visual detection and quantitative scoring.
 *
 * Only "confirmed" tier lesions (confidence >= 0.30) affect scores.
 * Penalties are capped to prevent lesion count from dominating signals.
 *
 * @param {object} signalScores - Merged signal scores
 * @param {Array} lesions - Detected lesions from Layer 2
 * @returns {object} Adjusted signal scores
 */
function applyLesionFeedback(signalScores, lesions) {
  if (!lesions || lesions.length === 0) return { ...signalScores };

  let inflammationPenalty = 0;
  let structurePenalty = 0;

  for (const lesion of lesions) {
    if (lesion.tier !== 'confirmed') continue;
    const conf = lesion.confidence;

    // Single-class acne detector: apply generalized penalties
    inflammationPenalty += conf * 5;
    structurePenalty += conf * 2;
  }

  return {
    structure: Math.max(0, Math.round(signalScores.structure - Math.min(25, structurePenalty))),
    hydration: signalScores.hydration,
    inflammation: Math.max(0, Math.round(signalScores.inflammation - Math.min(25, inflammationPenalty))),
    sunDamage: signalScores.sunDamage,
    elasticity: signalScores.elasticity,
  };
}

module.exports = {
  initModels,
  runAllModels,
  runAcneDetector,
  runSkinSignalsModel,
  mergeSignalScores,
  applyLesionFeedback,
  bboxToZone,
  LESION_CLASSES,
  // Exported for testing
  prepareImageTensorV2,
  prepareDetectorTensor,
  computeIoU,
  nms,
};
