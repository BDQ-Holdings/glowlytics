/**
 * On-device photo quality checks.
 *
 * Uses the pure alignment logic from faceTracking.ts. During live camera
 * preview, the VisionCamera frame processor provides faces directly. For
 * final capture validation, this module accepts pre-detected face data
 * or falls through as a pass when detection is unavailable.
 *
 * Quality criteria for skin assessment photos:
 *   1. A face must be detected in the image.
 *   2. The face must fill at least 20% of the frame.
 *   3. The face must be roughly centered (within the middle 50% of the frame).
 *   4. Yaw and roll angles must be within +/-20 degrees.
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { decode as decodeJpeg } from 'jpeg-js';

import type { DetectedFace } from './faceTracking';

export interface PhotoQualityResult {
  faceDetected: boolean;
  centered: boolean;
  fillPercent: number;
  angleValid: boolean;
  overallPass: boolean;
  issues: string[];
}

// Face / pose thresholds
const MIN_FILL_PERCENT = 20;
const CENTER_TOLERANCE = 0.50;
const MAX_ANGLE = 20;

// Capture-time luma thresholds. We downscale to ~64px wide, then read the JPEG
// in JS; this gives a cheap global exposure/contrast gate without delaying the
// scan hand-off. Mean luma is on the standard 0..255 scale. The bounds leave
// room for normal skin tones and bathroom lighting, while rejecting frames that
// are too dark to analyze (<45), blown out (>225), or nearly flat (stddev <12).
const QUALITY_SAMPLE_WIDTH = 64;
const MIN_MEAN_LUMA = 45;
const MAX_MEAN_LUMA = 225;
const MIN_LUMA_STDDEV = 12;

export type PhotoQualityIssueCode = 'too_dark' | 'too_bright' | 'low_contrast';

export interface PhotoQualityDependencies {
  manipulateAsync: typeof manipulateAsync;
  decodeJpeg: typeof decodeJpeg;
}

const defaultPhotoQualityDependencies: PhotoQualityDependencies = {
  manipulateAsync,
  decodeJpeg,
};

function base64ToUint8Array(base64: string): Uint8Array {
  const raw = globalThis.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function evaluateLumaQuality(lumaValues: ArrayLike<number>): PhotoQualityResult {
  const count = lumaValues.length;
  if (count === 0) {
    return {
      faceDetected: true,
      centered: true,
      fillPercent: 100,
      angleValid: true,
      overallPass: true,
      issues: [],
    };
  }

  let sum = 0;
  for (let i = 0; i < count; i++) sum += lumaValues[i];
  const mean = sum / count;

  let variance = 0;
  for (let i = 0; i < count; i++) {
    const delta = lumaValues[i] - mean;
    variance += delta * delta;
  }
  const stddev = Math.sqrt(variance / count);

  const issues: PhotoQualityIssueCode[] = [];
  if (mean < MIN_MEAN_LUMA) {
    issues.push('too_dark');
  } else if (mean > MAX_MEAN_LUMA) {
    issues.push('too_bright');
  } else if (stddev < MIN_LUMA_STDDEV) {
    issues.push('low_contrast');
  }

  return {
    faceDetected: true,
    centered: true,
    fillPercent: 100,
    angleValid: true,
    overallPass: issues.length === 0,
    issues,
  };
}

/**
 * Check photo quality from pre-detected face data.
 * This is the primary entry point — accepts faces from VisionCamera frame processor
 * or from any other detection source.
 */
export function checkPhotoQualityFromFaces(
  faces: DetectedFace[],
  frameWidth: number,
  frameHeight: number,
): PhotoQualityResult {
  const issues: string[] = [];

  if (faces.length === 0) {
    return {
      faceDetected: false,
      centered: false,
      fillPercent: 0,
      angleValid: false,
      overallPass: false,
      issues: ['No face detected'],
    };
  }

  // Use the largest detected face
  const face = faces.reduce((largest, current) => {
    const largestArea = largest.width * largest.height;
    const currentArea = current.width * current.height;
    return currentArea > largestArea ? current : largest;
  });

  // Fill check
  const faceArea = face.width * face.height;
  const frameArea = frameWidth * frameHeight;
  const fillPercent = frameArea > 0 ? (faceArea / frameArea) * 100 : 0;
  const fillPass = fillPercent >= MIN_FILL_PERCENT;
  if (!fillPass) {
    issues.push('Move closer');
  }

  // Center check
  const faceCenterX = face.x + face.width / 2;
  const faceCenterY = face.y + face.height / 2;
  const marginX = (1 - CENTER_TOLERANCE) / 2;
  const marginY = (1 - CENTER_TOLERANCE) / 2;
  const centeredX = faceCenterX >= frameWidth * marginX && faceCenterX <= frameWidth * (1 - marginX);
  const centeredY = faceCenterY >= frameHeight * marginY && faceCenterY <= frameHeight * (1 - marginY);
  const centered = centeredX && centeredY;
  if (!centered) {
    issues.push('Center your face');
  }

  // Angle check
  const yawOk = face.yawAngle == null || Math.abs(face.yawAngle) <= MAX_ANGLE;
  const rollOk = face.rollAngle == null || Math.abs(face.rollAngle) <= MAX_ANGLE;
  const angleValid = yawOk && rollOk;
  if (!angleValid) {
    issues.push('Face camera directly');
  }

  const overallPass = fillPass && centered && angleValid;

  return {
    faceDetected: true,
    centered,
    fillPercent: Math.round(fillPercent * 100) / 100,
    angleValid,
    overallPass,
    issues,
  };
}

/**
 * Capture-time photo quality check.
 *
 * VisionCamera still handles face pose/alignment during preview. This final
 * gate cheaply verifies exposure and contrast on the actual captured JPEG so a
 * dark, blown-out, or flat frame cannot slip through between preview and save.
 * It is fail-open by design: decoder/native failures warn and allow the scan,
 * because blocking analysis on a local pixel-read failure would be worse UX.
 */
export async function checkPhotoQuality(
  photoUri: string,
  frameWidth: number,
  frameHeight: number,
  deps: PhotoQualityDependencies = defaultPhotoQualityDependencies,
): Promise<PhotoQualityResult> {
  void frameWidth;
  void frameHeight;

  try {
    const processed = await deps.manipulateAsync(
      photoUri,
      [{ resize: { width: QUALITY_SAMPLE_WIDTH } }],
      { format: SaveFormat.JPEG, base64: true, compress: 0.75 },
    );

    if (!processed.base64) {
      throw new Error('Photo quality sample did not include base64 data');
    }

    const decoded = deps.decodeJpeg(base64ToUint8Array(processed.base64), {
      useTArray: true,
      formatAsRGBA: true,
    });
    const rgba = decoded.data as unknown as Uint8Array;
    const pixelCount = Math.min(decoded.width * decoded.height, Math.floor(rgba.length / 4));
    const lumaValues = new Float32Array(pixelCount);

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      lumaValues[i] = rgba[offset] * 0.2126 + rgba[offset + 1] * 0.7152 + rgba[offset + 2] * 0.0722;
    }

    if (processed.uri && processed.uri !== photoUri) {
      FileSystemLegacy.deleteAsync(processed.uri, { idempotent: true }).catch(() => {});
    }

    return evaluateLumaQuality(lumaValues);
  } catch (err) {
    console.warn('[PhotoQuality] Capture quality check failed open:', err);
    return {
      faceDetected: true,
      centered: true,
      fillPercent: 100,
      angleValid: true,
      overallPass: true,
      issues: [],
    };
  }
}
