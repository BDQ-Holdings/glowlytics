/**
 * On-demand ONNX model delivery.
 *
 * The two on-device models used to ship inside the IPA via expo-asset
 * (~62MB of the ~108MB bundle). They now download once on demand to
 * `${documentDirectory}models/` — the exact cache path the services already
 * probed — and are reused across launches. Absence is always non-fatal:
 * every caller has a server-side fallback (camera → /api/vision/detect-lesions,
 * scan → backend L2 scoring), so a failed or slow download only shifts
 * compute to the backend until the next attempt.
 *
 * Integrity: both URLs are pinned to immutable revisions (an HF commit SHA
 * and a GitHub commit), and downloads are verified by EXACT byte size.
 * We deliberately do not sha256 the files on-device: hashing a 43MB file
 * through JS requires a base64 round-trip of the whole payload in memory,
 * which is a real OOM hazard on older devices. Immutable-rev URL + exact
 * size is the right trade here; the backend verifies full digests
 * (backend/models/models.sha256) for its copies of the same artifacts.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { trackEvent } from './analytics';

const TAG = '[ModelDownload]';

export type ModelName = 'acne_detector' | 'skin_signals_v2';

interface ModelSpec {
  /** Immutable, revision-pinned URL. */
  url: string;
  /** Exact expected size in bytes — download integrity check. */
  bytes: number;
}

const MODELS: Record<ModelName, ModelSpec> = {
  // HF repo mufasabrownie/glowlytics-skin-models @ a1bbdb6 (immutable rev).
  // sha256 de7b25f3d1e2af69ee18f2b55cb6d93edf3c8dd29662a1c64cf8d903c3fa8526
  acne_detector: {
    url: 'https://huggingface.co/mufasabrownie/glowlytics-skin-models/resolve/a1bbdb624b6045bdb1503050c56045728f2efaf0/acne_detector.onnx',
    bytes: 44_745_921,
  },
  // GH BDQ-Holdings/glowlytics @ 18966b9 (immutable commit; pre-monorepo path).
  // sha256 c11efc295efd118e654434abd27a817bd527038f40476a06c801d12444ad2883
  skin_signals_v2: {
    url: 'https://raw.githubusercontent.com/BDQ-Holdings/glowlytics/18966b9/RadianceIQ/backend/models/skin_signals_v2.onnx',
    bytes: 19_980_946,
  },
};

/** Matches the pre-existing cache dir probed by onDeviceLesionDetection —
 *  models cached by earlier builds are reused without a re-download. */
export const MODELS_DIR = `${FileSystem.documentDirectory}models/`;

export function modelPath(name: ModelName): string {
  return `${MODELS_DIR}${name}.onnx`;
}

/** File exists and matches the exact expected byte size. */
async function isValidFile(uri: string, bytes: number): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory && info.size === bytes;
  } catch {
    return false;
  }
}

export function isModelCached(name: ModelName): Promise<boolean> {
  return isValidFile(modelPath(name), MODELS[name].bytes);
}

// Single-flight per model: concurrent ensureModel calls (boot init + camera
// mount + scan pipeline) share one download. The entry is cleared only when
// the underlying download settles, so a timed-out caller's download keeps
// running and the NEXT caller picks up the finished file.
const inflight = new Map<ModelName, Promise<string | null>>();

async function download(name: ModelName, spec: ModelSpec): Promise<string | null> {
  const dest = modelPath(name);
  const tmp = `${dest}.tmp`;
  try {
    await FileSystem.makeDirectoryAsync(MODELS_DIR, { intermediates: true }).catch(() => {});
    if (__DEV__) console.log(TAG, `Downloading ${name} (${(spec.bytes / 1024 / 1024).toFixed(1)} MB)...`);
    const res = await FileSystem.downloadAsync(spec.url, tmp);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (!(await isValidFile(tmp, spec.bytes))) throw new Error('size mismatch');
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
    await FileSystem.moveAsync({ from: tmp, to: dest });
    trackEvent('model_download_completed', { model: name, bytes: spec.bytes });
    return dest;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(TAG, `${name} download failed:`, message);
    trackEvent('model_download_failed', { model: name, error: message });
    await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
    return null;
  }
}

/**
 * Resolve a local URI for `name`, downloading it if absent or invalid.
 *
 * `timeoutMs` bounds how long the CALLER waits — on expiry it receives null
 * (fallbacks engage) while the download itself keeps running in the
 * background so a later call returns the cached file. Never throws.
 */
export async function ensureModel(
  name: ModelName,
  opts?: { timeoutMs?: number },
): Promise<string | null> {
  const spec = MODELS[name];
  const dest = modelPath(name);
  if (await isValidFile(dest, spec.bytes)) return dest;

  let job = inflight.get(name);
  if (!job) {
    job = download(name, spec).finally(() => {
      inflight.delete(name);
    });
    inflight.set(name, job);
  }

  const timeoutMs = opts?.timeoutMs;
  if (timeoutMs && timeoutMs > 0) {
    // Executor form required: Promise.withResolvers is unavailable on this
    // runtime baseline (Node 21 jest; Hermes support not guaranteed).
    const expiry = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    });
    return Promise.race([job, expiry]);
  }
  return job;
}
