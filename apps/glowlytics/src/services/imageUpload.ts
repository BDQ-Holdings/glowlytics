// apps/glowlytics/src/services/imageUpload.ts
//
// compressImageForUpload — produce a bounded, JPEG-compressed image for the
// shopping-advisor photo scan path. Modern phone photos are multi-MB; uploading
// the full-resolution base64 trips the backend's 10MB cap on
// POST /api/products/shopping-scan (-> 413 "Image too large") and is slow. We
// resize + compress first, and on ANY manipulation failure degrade gracefully
// to the raw base64 so the scan still works.
//
// The native dependencies are injectable so the helper is testable: jest-expo
// cannot load expo-image-manipulator / expo-file-system in a test module body
// (see onDeviceImageFeatures.test.ts), so the real modules live behind the
// DEFAULT deps below and tests inject fakes instead.

import { imageToBase64 } from './visionAPI';

/** A single resize manipulation (mirrors expo-image-manipulator's ActionResize). */
export interface ResizeAction {
  resize: { width: number };
}

/** Save options forwarded to the manipulator. `format` carries the JPEG value 'jpeg'. */
export interface ManipulateSaveOptions {
  format: string;
  base64: boolean;
  compress: number;
}

/** The subset of an expo-image-manipulator result this helper consumes. */
export interface ManipulateResult {
  uri?: string;
  base64?: string;
}

/** Tunables for the compression step. */
export interface CompressImageOptions {
  maxWidth?: number;
  quality?: number;
}

/** Injectable native dependencies — all optional, with real defaults. */
export interface ImageUploadDeps {
  manipulate?: (
    uri: string,
    actions: ResizeAction[],
    saveOpts: ManipulateSaveOptions,
  ) => Promise<ManipulateResult>;
  readRawBase64?: (uri: string) => Promise<string>;
  deleteFile?: (uri: string) => Promise<void>;
}

const DEFAULT_MAX_WIDTH = 1024;
const DEFAULT_QUALITY = 0.8;
/** SaveFormat.JPEG's runtime value; avoids importing the native enum at author time. */
const JPEG_FORMAT = 'jpeg';

const defaultManipulate = async (
  uri: string,
  actions: ResizeAction[],
  saveOpts: ManipulateSaveOptions,
): Promise<ManipulateResult> => {
  // Dynamic import (exception to ts-no-dynamic-import): expo-image-manipulator is
  // a native, on-device-only module that jest-expo cannot load in a module body,
  // so the real call is deferred to runtime behind this default dep.
  const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
  return manipulateAsync(uri, actions, {
    format: SaveFormat.JPEG,
    base64: saveOpts.base64,
    compress: saveOpts.compress,
  });
};

const defaultDeleteFile = async (uri: string): Promise<void> => {
  // Dynamic import (exception to ts-no-dynamic-import): same native / jest-expo
  // constraint as above. `idempotent` makes a missing temp file a no-op.
  const FileSystem = await import('expo-file-system/legacy');
  await FileSystem.deleteAsync(uri, { idempotent: true });
};

/**
 * Resize + JPEG-compress `uri` and return its base64 string (NO `data:` prefix).
 *
 * On any manipulation failure (throw, or missing/empty base64) it falls back to
 * the raw base64 of `uri` so the scan still works — it never throws for a
 * manipulation failure alone, only if the raw fallback itself throws. On success
 * it best-effort deletes the manipulator's temp file when it differs from `uri`.
 */
export async function compressImageForUpload(
  uri: string,
  opts: CompressImageOptions = {},
  deps: ImageUploadDeps = {},
): Promise<string> {
  const maxWidth = opts.maxWidth ?? DEFAULT_MAX_WIDTH;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const manipulate = deps.manipulate ?? defaultManipulate;
  const readRawBase64 = deps.readRawBase64 ?? imageToBase64;
  const deleteFile = deps.deleteFile ?? defaultDeleteFile;

  try {
    const result = await manipulate(
      uri,
      [{ resize: { width: maxWidth } }],
      { format: JPEG_FORMAT, base64: true, compress: quality },
    );
    const compressed = result.base64;
    const tempUri = result.uri;
    if (tempUri && tempUri !== uri) {
      // Best-effort cleanup of the manipulator's temp JPEG — runs whether or
      // not base64 came back, so the empty-base64 fallback path below doesn't
      // leak the file. A delete failure must NOT affect the returned base64.
      try {
        await deleteFile(tempUri);
      } catch {
        // non-fatal
      }
    }
    if (compressed) {
      return compressed;
    }
    // empty base64 -> fall through to the raw fallback below
  } catch {
    // manipulation threw -> fall through to the raw fallback below
  }
  return readRawBase64(uri);
}
