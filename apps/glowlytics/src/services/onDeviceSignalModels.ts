/**
 * On-device skin signals model (Layer 2) via ONNX Runtime.
 *
 * Loads `skin_signals_v2.onnx` (EfficientNet-B0, multi-head) — downloaded
 * once on demand via modelDownload.ts (rev-pinned URL, exact-size verified,
 * ~19MB; no longer bundled in the IPA) — and runs inference locally with the
 * CoreML execution provider on iOS (falls back to CPU). Preprocessing matches
 * the backend pipeline in `backend/signal-models.js` exactly: resize shortest
 * side to 256, center crop 224x224, ImageNet normalize.
 *
 * Why this exists:
 *   - The Railway backend's L2 path (`onnxruntime-node` on shared-CPU
 *     container) costs ~1-3 s wall-clock per request and is the main reason
 *     scans time out. iPhone 16 Pro Max with CoreML EP runs the same model
 *     in ~10-30 ms.
 *   - Lesion detection already runs on-device via
 *     `onDeviceLesionDetection.ts`. This module extends the pattern to the
 *     four signal scores (structure, hydration, sunDamage, elasticity).
 *
 * Output contract matches `backend/signal-models.js:runSkinSignalsModel`
 * exactly so the backend can trust client-provided scores without
 * re-normalization.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { trackEvent } from './analytics';
import { ensureModel, isModelCached } from './modelDownload';
import type { SignalConfidence, SignalScores } from '../types';

const TAG = '[SignalModels]';

const INPUT_SIZE = 224;
const RESIZE_SHORT_SIDE = 256;
const TENSOR_FLOATS = 3 * INPUT_SIZE * INPUT_SIZE;

// ImageNet normalization constants (must match backend/signal-models.js).
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];

// Model exposes one input ("image") and one output ("scores", shape [1, 4]).
// Output order: structure, hydration, sunDamage, elasticity, each in [0, 1].
const INPUT_NAME = 'image';
const OUTPUT_NAME = 'scores';

let session: InferenceSession | null = null;
let loadingPromise: Promise<boolean> | null = null;

// Pre-allocated tensor buffer — reused across scans to avoid GC pressure.
let tensorBuffer: Float32Array | null = null;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Resolve the model path: valid cached file, else on-demand download. The
 * wait is bounded to 20s because the scan pipeline awaits this init inline
 * (analyzing.tsx) — past that the scan proceeds on the backend L2 fallback
 * while the download finishes in the background for the next scan.
 */
async function resolveModelPath(): Promise<{ path: string | null; cached: boolean }> {
  const cached = await isModelCached('skin_signals_v2');
  const path = await ensureModel('skin_signals_v2', { timeoutMs: 20_000 });
  if (!path) console.warn(TAG, 'No model available — on-device L2 disabled for this scan');
  return { path, cached };
}

/**
 * Initialise the model session and run a warmup pass to force CoreML to
 * compile the compute graph. Idempotent and safe to call multiple times.
 */
export async function initSignalModels(): Promise<boolean> {
  if (session) return true;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const { path: modelPath, cached } = await resolveModelPath();
      if (!modelPath) return false;

      session = await InferenceSession.create(modelPath, {
        executionProviders: ['coreml', 'cpu'],
      });
      tensorBuffer = new Float32Array(TENSOR_FLOATS);

      // Warmup — first inference is materially slower until CoreML compiles
      // the graph. Running once at startup hides that latency from the
      // user-visible scan flow.
      try {
        const warmup = new Tensor('float32', new Float32Array(TENSOR_FLOATS), [
          1,
          3,
          INPUT_SIZE,
          INPUT_SIZE,
        ]);
        await session.run({ [INPUT_NAME]: warmup });
      } catch (warmErr: any) {
        console.warn(TAG, 'Warmup failed (non-fatal):', warmErr?.message);
      }

      trackEvent('signal_model_loaded', { source: cached ? 'cached' : 'downloaded' });
      return true;
    } catch (err: any) {
      console.error(TAG, 'Init failed:', err?.message || err);
      trackEvent('signal_model_failed', { error: String(err?.message || err) });
      session = null;
      tensorBuffer = null;
      return false;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

export function releaseSignalModels(): void {
  session = null;
  tensorBuffer = null;
}

export function isReady(): boolean {
  return session !== null;
}

// ---------------------------------------------------------------------------
// Preprocessing
// ---------------------------------------------------------------------------

function base64ToUint8Array(base64: string): Uint8Array {
  // atob is available in Hermes via the Expo polyfill set.
  const raw = globalThis.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Resize shortest side to 256, center-crop 224x224, decode to raw pixels,
 * and fill `tensorBuffer` with CHW Float32 ImageNet-normalised values.
 *
 * Mirrors `backend/signal-models.js:prepareImageTensorV2` exactly. Any
 * deviation here (resize filter, crop offset, normalisation constants) will
 * make on-device and server-side scores diverge.
 */
async function preprocess(photoUri: string): Promise<Float32Array | null> {
  if (!tensorBuffer) return null;

  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');

    // 1. Probe original dimensions. A no-op manipulate is the cheapest way
    //    to read width/height through the manipulator API.
    const probe = await manipulateAsync(photoUri, [], { format: SaveFormat.JPEG });
    const { width, height } = probe;
    if (probe.uri && probe.uri !== photoUri) {
      FileSystem.deleteAsync(probe.uri, { idempotent: true }).catch(() => {});
    }
    if (!width || !height) return null;

    // 2. Resize so the shortest side equals 256, then center-crop 224x224.
    const scale = RESIZE_SHORT_SIDE / Math.min(width, height);
    const resizedW = Math.round(width * scale);
    const resizedH = Math.round(height * scale);
    const cropX = Math.max(0, Math.round((resizedW - INPUT_SIZE) / 2));
    const cropY = Math.max(0, Math.round((resizedH - INPUT_SIZE) / 2));

    const processed = await manipulateAsync(
      photoUri,
      [
        { resize: { width: resizedW, height: resizedH } },
        { crop: { originX: cropX, originY: cropY, width: INPUT_SIZE, height: INPUT_SIZE } },
      ],
      { format: SaveFormat.JPEG, base64: true },
    );

    if (!processed.base64) return null;

    // 3. Decode the 224x224 JPEG to RGBA via jpeg-js. We only ever decode
    //    a 224x224 region (≈50 KB JPEG) so the JS decode cost is negligible.
    const { decode: decodeJpeg } = await import('jpeg-js');
    const jpegBytes = base64ToUint8Array(processed.base64);
    const decoded = decodeJpeg(jpegBytes, { useTArray: true, formatAsRGBA: true });
    const rgba = decoded.data as unknown as Uint8Array;

    // 4. Pack into CHW Float32 with ImageNet normalisation.
    const pixels = INPUT_SIZE * INPUT_SIZE;
    const buf = tensorBuffer;
    for (let i = 0; i < pixels; i++) {
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];
      buf[i] = (r / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
      buf[pixels + i] = (g / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
      buf[2 * pixels + i] = (b / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
    }

    if (processed.uri && processed.uri !== photoUri) {
      FileSystem.deleteAsync(processed.uri, { idempotent: true }).catch(() => {});
    }

    return buf;
  } catch (err: any) {
    console.warn(TAG, 'Preprocess failed:', err?.message || err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

export interface SignalInferenceResult {
  signal_scores: SignalScores;
  signal_confidence: SignalConfidence;
  latency_ms: number;
}

const clamp100 = (v: number): number => {
  if (!Number.isFinite(v)) return 50;
  return Math.max(0, Math.min(100, Math.round(v * 100)));
};

/**
 * Run the v2 skin signals model on a captured photo.
 *
 * Resolves to `null` when the model isn't loaded or preprocessing failed —
 * the caller should fall back to the server-side L2 path in that case.
 *
 * The returned `signal_confidence` is intentionally `'high'` for every
 * channel: on iPhone the L2 model is the most reliable source we have for
 * structure/hydration/sunDamage/elasticity. `inflammation` keeps `'med'`
 * because this model doesn't predict it.
 */
export async function runSkinSignals(
  photoUri: string,
): Promise<SignalInferenceResult | null> {
  if (!session) {
    if (__DEV__) console.warn(TAG, 'Session not ready — call initSignalModels() first');
    return null;
  }

  const t0 = Date.now();
  const tensorData = await preprocess(photoUri);
  if (!tensorData) return null;

  try {
    const input = new Tensor('float32', tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const out = await session.run({ [INPUT_NAME]: input });
    const tensor = out[OUTPUT_NAME] ?? out[Object.keys(out)[0]];
    const data = tensor.data as Float32Array;

    // The model predicts 4 channels in this fixed order.
    const signal_scores: SignalScores = {
      structure: clamp100(data[0]),
      hydration: clamp100(data[1]),
      // `inflammation` isn't predicted by this model — leave as a neutral
      // value so downstream UI doesn't render 0 for "no inflammation".
      // Backend keeps its own `a*` channel signal for inflammation.
      inflammation: 50,
      sunDamage: clamp100(data[2]),
      elasticity: clamp100(data[3]),
    };

    const signal_confidence: SignalConfidence = {
      structure: 'high',
      hydration: 'high',
      inflammation: 'med',
      sunDamage: 'high',
      elasticity: 'high',
    };

    return { signal_scores, signal_confidence, latency_ms: Date.now() - t0 };
  } catch (err: any) {
    console.warn(TAG, 'Inference failed:', err?.message || err);
    trackEvent('signal_model_inference_failed', { error: String(err?.message || err) });
    return null;
  }
}
