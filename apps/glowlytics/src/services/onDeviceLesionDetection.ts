/**
 * On-device YOLOv8 lesion detection via ONNX Runtime.
 *
 * Model is bundled as an app asset via expo-asset plugin.
 * Falls back to document directory cache if bundled asset unavailable.
 * Runs inference on camera frames with per-class NMS post-processing.
 *
 * Pipeline V2 improvements:
 * - Native JPEG decode + resize via expo-image-manipulator (replaces pure-JS jpeg-js)
 * - Letterbox padding preserves aspect ratio (no distortion)
 * - ImageNet normalization matches training preprocessing
 * - Per-class NMS (different types at same location don't suppress each other)
 * - Pre-allocated tensor buffer (eliminates GC pressure)
 * - Warmup inference on init (eliminates first-frame latency spike)
 */
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { DetectedLesion, LesionClass, FacialRegion } from '../types';
import { trackEvent } from './analytics';

const TAG = '[LesionDetection]';

const MODELS_DIR = `${FileSystem.documentDirectory}models/`;
const MODEL_PATH = `${MODELS_DIR}acne_detector.onnx`;

const INPUT_SIZE = 640;
const NUM_CLASSES = 1;
const CONF_THRESHOLD = 0.025;
const IOU_THRESHOLD = 0.45;

const LESION_CLASSES: LesionClass[] = ['acne'];

// ImageNet normalization constants (matches backend signal-models.js)
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

let session: InferenceSession | null = null;
let loadingPromise: Promise<boolean> | null = null;

// Pre-allocated tensor buffer — reused across frames to avoid GC pressure
const TENSOR_SIZE = 3 * INPUT_SIZE * INPUT_SIZE;
let tensorBuffer: Float32Array | null = null;

// ---------------------------------------------------------------------------
// Model lifecycle
// ---------------------------------------------------------------------------

/**
 * Resolve model path: try bundled asset first, then check document cache.
 * Lazy-imports expo-asset so this module doesn't crash in Expo Go.
 */
async function resolveModelPath(): Promise<string | null> {
  // 1. Try bundled asset (native builds only — expo-asset crashes in Expo Go)
  try {
    const { Asset } = await import('expo-asset');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const asset = Asset.fromModule(require('../../assets/models/acne_detector.onnx'));
    await asset.downloadAsync();
    if (asset.localUri) {
      console.log(TAG, 'Using bundled model at:', asset.localUri);
      return asset.localUri;
    }
  } catch (err) {
    console.warn(TAG, 'Bundled asset not available (expected in Expo Go):', err);
  }

  // 2. Check if model was previously downloaded to document directory
  try {
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    if (info.exists && !info.isDirectory) {
      console.log(TAG, 'Using cached model at:', MODEL_PATH);
      return MODEL_PATH;
    }
  } catch {
    // Not cached
  }

  console.warn(TAG, 'No model available — on-device detection disabled');
  return null;
}

/** Ensure model is ready: resolve path, load ONNX session, run warmup. */
export async function initLesionDetection(
  _onProgress?: (pct: number) => void,
): Promise<boolean> {
  if (session) {
    console.log(TAG, 'Session already loaded');
    return true;
  }
  if (loadingPromise) {
    console.log(TAG, 'Init already in progress — awaiting');
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      console.log(TAG, 'Initializing...');
      const modelPath = await resolveModelPath();
      if (!modelPath) return false;

      console.log(TAG, 'Creating ONNX inference session...');
      session = await InferenceSession.create(modelPath, {
        executionProviders: ['coreml', 'cpu'],
      });
      console.log(TAG, 'ONNX session created successfully');

      // Pre-allocate tensor buffer
      tensorBuffer = new Float32Array(TENSOR_SIZE);

      // Warmup inference — forces CoreML to compile the model graph,
      // eliminating the ~500ms first-frame latency spike
      try {
        console.log(TAG, 'Running warmup inference...');
        const warmupTensor = new Tensor('float32', new Float32Array(TENSOR_SIZE), [1, 3, INPUT_SIZE, INPUT_SIZE]);
        await session.run({ images: warmupTensor });
        console.log(TAG, 'Warmup complete');
      } catch (warmupErr: any) {
        console.warn(TAG, 'Warmup inference failed (non-fatal):', warmupErr?.message);
      }

      trackEvent('lesion_model_loaded', { source: modelPath.includes('ExponentAsset') ? 'bundled' : 'cached' });
      return true;
    } catch (err: any) {
      console.error(TAG, 'Init failed:', err?.message || err);
      trackEvent('lesion_model_failed', { error: String(err?.message || err) });
      return false;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/** Release the model session and buffers. */
export function releaseLesionDetection(): void {
  console.log(TAG, 'Releasing session');
  session = null;
  tensorBuffer = null;
}

/** Check if model is loaded and ready for inference. */
export function isReady(): boolean {
  return session !== null;
}

// ---------------------------------------------------------------------------
// Image preprocessing — native pipeline
// ---------------------------------------------------------------------------

/**
 * Preprocess a camera frame for YOLO inference using native image manipulation.
 *
 * Pipeline:
 * 1. Native resize to 640×640 with letterbox padding (expo-image-manipulator)
 * 2. Read resized image as base64
 * 3. Decode to raw pixels
 * 4. Normalize with ImageNet mean/std
 * 5. Layout as CHW Float32Array
 *
 * Returns { tensor, scale, padX, padY } for coordinate de-letterboxing,
 * or null if preprocessing fails.
 */
async function preprocessFrame(frameUri: string): Promise<{
  tensor: Float32Array;
  scale: number;
  padX: number;
  padY: number;
} | null> {
  try {
    // Get the reusable buffer (or allocate if somehow null)
    const buffer = tensorBuffer ?? new Float32Array(TENSOR_SIZE);

    // Use expo-image-manipulator for native resize
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');

    // Get original dimensions via a no-op manipulate (returns width/height)
    let origWidth = 640, origHeight = 640;
    try {
      const probe = await manipulateAsync(frameUri, [], { format: SaveFormat.JPEG });
      origWidth = probe.width;
      origHeight = probe.height;
      // Clean up probe file
      if (probe.uri && probe.uri !== frameUri) {
        FileSystem.deleteAsync(probe.uri, { idempotent: true }).catch(() => {});
      }
    } catch {
      // Dimension read failed — use square assumption (letterbox will be identity)
    }

    // Compute letterbox: scale to fit within 640×640, pad the rest
    const scale = Math.min(INPUT_SIZE / origWidth, INPUT_SIZE / origHeight);
    const scaledW = Math.round(origWidth * scale);
    const scaledH = Math.round(origHeight * scale);
    const padX = Math.round((INPUT_SIZE - scaledW) / 2);
    const padY = Math.round((INPUT_SIZE - scaledH) / 2);

    // Native resize to the scaled dimensions (not full 640×640 — we'll pad)
    const resized = await manipulateAsync(
      frameUri,
      [{ resize: { width: scaledW, height: scaledH } }],
      { format: SaveFormat.JPEG, base64: true },
    );

    if (!resized.base64) return null;

    // Decode the resized JPEG to raw pixels
    // Use jpeg-js as fallback for pixel access (manipulator doesn't expose raw pixels)
    const { decode: decodeJpeg } = await import('jpeg-js');
    const jpegBytes = base64ToUint8Array(resized.base64);
    const { data: rgba, width: decW, height: decH } = decodeJpeg(jpegBytes, {
      useTArray: true,
      formatAsRGBA: true,
    });
    const pixels = rgba as unknown as Uint8Array;

    // Fill tensor with gray padding (0.5 normalized = ImageNet gray)
    const grayR = (0.5 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    const grayG = (0.5 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    const grayB = (0.5 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
    const pixels640 = INPUT_SIZE * INPUT_SIZE;
    for (let i = 0; i < pixels640; i++) {
      buffer[i] = grayR;
      buffer[pixels640 + i] = grayG;
      buffer[2 * pixels640 + i] = grayB;
    }

    // Copy resized image into padded region with ImageNet normalization
    for (let y = 0; y < decH && y < scaledH; y++) {
      for (let x = 0; x < decW && x < scaledW; x++) {
        const srcIdx = (y * decW + x) * 4;
        const dstX = x + padX;
        const dstY = y + padY;
        if (dstX >= INPUT_SIZE || dstY >= INPUT_SIZE) continue;
        const dstIdx = dstY * INPUT_SIZE + dstX;

        buffer[dstIdx] = (pixels[srcIdx] / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
        buffer[pixels640 + dstIdx] = (pixels[srcIdx + 1] / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
        buffer[2 * pixels640 + dstIdx] = (pixels[srcIdx + 2] / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
      }
    }

    // Clean up temp resized file
    if (resized.uri && resized.uri !== frameUri) {
      FileSystem.deleteAsync(resized.uri, { idempotent: true }).catch(() => {});
    }

    return { tensor: buffer, scale, padX, padY };
  } catch (err) {
    console.warn(TAG, 'Preprocess failed:', err);
    return null;
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const raw = globalThis.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// NMS + post-processing
// ---------------------------------------------------------------------------

interface RawBox {
  cx: number; cy: number; w: number; h: number;
  classIdx: number; confidence: number;
}

function computeIoU(a: RawBox, b: RawBox): number {
  const ax1 = a.cx - a.w / 2, ay1 = a.cy - a.h / 2;
  const ax2 = a.cx + a.w / 2, ay2 = a.cy + a.h / 2;
  const bx1 = b.cx - b.w / 2, by1 = b.cy - b.h / 2;
  const bx2 = b.cx + b.w / 2, by2 = b.cy + b.h / 2;

  const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);

  const aArea = a.w * a.h;
  const bArea = b.w * b.h;
  return inter / (aArea + bArea - inter + 1e-6);
}

/** Per-class NMS: run NMS within each class, then merge results. */
function perClassNms(boxes: RawBox[]): RawBox[] {
  // Group by class
  const byClass: Map<number, RawBox[]> = new Map();
  for (const box of boxes) {
    const group = byClass.get(box.classIdx);
    if (group) group.push(box);
    else byClass.set(box.classIdx, [box]);
  }

  // NMS within each class
  const kept: RawBox[] = [];
  for (const classBoxes of byClass.values()) {
    const sorted = classBoxes.sort((a, b) => b.confidence - a.confidence);
    for (const box of sorted) {
      let dominated = false;
      for (const k of kept) {
        if (k.classIdx === box.classIdx && computeIoU(box, k) > IOU_THRESHOLD) {
          dominated = true;
          break;
        }
      }
      if (!dominated) kept.push(box);
    }
  }

  return kept;
}

function bboxToZone(cx: number, cy: number): FacialRegion {
  if (cy < 0.33) {
    return cx < 0.33 ? 'temple' : cx < 0.66 ? 'forehead' : 'temple';
  }
  if (cy < 0.66) {
    return cx < 0.33 ? 'left_cheek' : cx < 0.66 ? 'nose' : 'right_cheek';
  }
  return cx < 0.33 ? 'jaw' : cx < 0.66 ? 'chin' : 'jaw';
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

/**
 * Detect lesions in a camera frame.
 * Accepts either a file URI (preferred — uses native preprocessing) or base64 string.
 * @param frameInput File URI or JPEG base64 string
 * @returns Array of detected lesions with normalized bbox coords
 */
export async function detectLesions(frameInput: string): Promise<DetectedLesion[]> {
  if (!session) return [];

  // Determine if input is a URI or base64
  const isUri = frameInput.startsWith('file://') || frameInput.startsWith('/');

  let tensorData: Float32Array | null;
  let scale = 1, padX = 0, padY = 0;

  if (isUri) {
    // Native preprocessing pipeline (preferred path)
    const result = await preprocessFrame(frameInput);
    if (!result) return [];
    tensorData = result.tensor;
    scale = result.scale;
    padX = result.padX;
    padY = result.padY;
  } else {
    // Legacy base64 path — simple preprocessing without letterbox
    tensorData = preprocessFrameLegacy(frameInput);
    if (!tensorData) return [];
  }

  try {
    const inputTensor = new Tensor('float32', tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const results = await session.run({ images: inputTensor });

    const outputKey = results.output0 ? 'output0' : Object.keys(results)[0];
    const raw = results[outputKey];
    const data = raw.data as Float32Array;

    // YOLOv8 output: [1, 5, 8400] — transposed format (4 bbox + 1 class)
    const numDetections = 8400;
    const candidates: RawBox[] = [];

    for (let d = 0; d < numDetections; d++) {
      let rawCx = data[0 * numDetections + d];
      let rawCy = data[1 * numDetections + d];
      let rawW = data[2 * numDetections + d];
      let rawH = data[3 * numDetections + d];

      let maxScore = 0;
      let classIdx = 0;
      for (let c = 0; c < NUM_CLASSES; c++) {
        const score = data[(4 + c) * numDetections + d];
        if (score > maxScore) {
          maxScore = score;
          classIdx = c;
        }
      }

      if (maxScore < CONF_THRESHOLD) continue;

      // De-letterbox: convert from padded 640×640 coords to original image coords
      if (isUri && scale > 0) {
        rawCx = (rawCx - padX) / scale;
        rawCy = (rawCy - padY) / scale;
        rawW = rawW / scale;
        rawH = rawH / scale;
        // Normalize to 0-1 using original image size (reconstructed from scale)
        const origW = (INPUT_SIZE - 2 * padX) / scale;
        const origH = (INPUT_SIZE - 2 * padY) / scale;
        candidates.push({
          cx: origW > 0 ? rawCx / origW : 0,
          cy: origH > 0 ? rawCy / origH : 0,
          w: origW > 0 ? rawW / origW : 0,
          h: origH > 0 ? rawH / origH : 0,
          classIdx,
          confidence: maxScore,
        });
      } else {
        // Legacy path: coords already normalized by INPUT_SIZE
        candidates.push({
          cx: rawCx / INPUT_SIZE,
          cy: rawCy / INPUT_SIZE,
          w: rawW / INPUT_SIZE,
          h: rawH / INPUT_SIZE,
          classIdx,
          confidence: maxScore,
        });
      }
    }

    // Diagnostic: log top scores per class (even below threshold)
    if (__DEV__) {
      const classMaxScores: number[] = new Array(NUM_CLASSES).fill(0);
      for (let d = 0; d < numDetections; d++) {
        for (let c = 0; c < NUM_CLASSES; c++) {
          const score = data[(4 + c) * numDetections + d];
          if (score > classMaxScores[c]) classMaxScores[c] = score;
        }
      }
      const classReport = LESION_CLASSES.map((cls, i) => `${cls}: ${(classMaxScores[i] * 100).toFixed(1)}%`).join(', ');
      console.log(TAG, `Candidates above ${CONF_THRESHOLD}: ${candidates.length} | Max scores → ${classReport}`);
    }

    // Per-class NMS
    const kept = perClassNms(candidates);

    return kept.map((box) => ({
      class: LESION_CLASSES[box.classIdx],
      confidence: box.confidence,
      bbox: [
        Math.max(0, box.cx - box.w / 2),
        Math.max(0, box.cy - box.h / 2),
        box.w,
        box.h,
      ] as [number, number, number, number],
      zone: bboxToZone(box.cx, box.cy),
    }));
  } catch (err) {
    console.warn(TAG, 'Inference failed:', err);
    return [];
  }
}

/**
 * Legacy preprocessing for base64 input — kept for backward compatibility.
 * Uses simple [0,1] normalization without letterbox or ImageNet stats.
 */
function preprocessFrameLegacy(jpegBase64: string): Float32Array | null {
  try {
    const jpegData = base64ToUint8Array(jpegBase64);
    const { decode: decodeJpeg } = require('jpeg-js');
    const { data: rgba, width, height } = decodeJpeg(jpegData, {
      useTArray: true,
      formatAsRGBA: true,
    });

    const pixels = rgba as unknown as Uint8Array;
    const buffer = tensorBuffer ?? new Float32Array(TENSOR_SIZE);

    const xRatio = width / INPUT_SIZE;
    const yRatio = height / INPUT_SIZE;

    for (let y = 0; y < INPUT_SIZE; y++) {
      const srcY = Math.min(Math.floor(y * yRatio), height - 1);
      for (let x = 0; x < INPUT_SIZE; x++) {
        const srcX = Math.min(Math.floor(x * xRatio), width - 1);
        const srcIdx = (srcY * width + srcX) * 4;

        const px = y * INPUT_SIZE + x;
        buffer[0 * INPUT_SIZE * INPUT_SIZE + px] = pixels[srcIdx] / 255;
        buffer[1 * INPUT_SIZE * INPUT_SIZE + px] = pixels[srcIdx + 1] / 255;
        buffer[2 * INPUT_SIZE * INPUT_SIZE + px] = pixels[srcIdx + 2] / 255;
      }
    }

    return buffer;
  } catch (err) {
    console.warn(TAG, 'Legacy preprocess failed:', err);
    return null;
  }
}
