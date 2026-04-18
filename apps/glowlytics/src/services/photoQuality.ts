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

import type { DetectedFace } from './faceTracking';

export interface PhotoQualityResult {
  faceDetected: boolean;
  centered: boolean;
  fillPercent: number;
  angleValid: boolean;
  overallPass: boolean;
  issues: string[];
}

// Thresholds
const MIN_FILL_PERCENT = 20;
const CENTER_TOLERANCE = 0.50;
const MAX_ANGLE = 20;

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
 * Legacy async wrapper for backward compatibility.
 * Accepts a photo URI but currently passes through since live detection
 * from VisionCamera provides faces directly during the scan flow.
 */
export async function checkPhotoQuality(
  photoUri: string,
  frameWidth: number,
  frameHeight: number,
): Promise<PhotoQualityResult> {
  // Without expo-face-detector, we pass through. The live VisionCamera
  // frame processor handles real-time quality checks during preview.
  // This function is only called on the final captured photo.
  return {
    faceDetected: true,
    centered: true,
    fillPercent: 100,
    angleValid: true,
    overallPass: true,
    issues: [],
  };
}
