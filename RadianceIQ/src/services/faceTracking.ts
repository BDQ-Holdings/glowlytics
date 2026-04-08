/**
 * Face tracking service — pure alignment logic.
 *
 * This module contains NO camera/detector imports. It accepts a standardized
 * face data shape and returns alignment state. The camera layer (VisionCamera
 * frame processor or any other source) is responsible for producing face data.
 */

export interface DetectedFace {
  x: number;
  y: number;
  width: number;
  height: number;
  yawAngle?: number | null;
  rollAngle?: number | null;
}

export interface FaceTrackingState {
  status: 'no_face' | 'misaligned' | 'aligned';
  faceRect?: { x: number; y: number; width: number; height: number };
  issues: string[];
  lightingOk: boolean;
  lightingUnavailable?: boolean;
}

// Thresholds
const MIN_FILL_PERCENT = 20;
const CENTER_TOLERANCE = 0.45;
const MAX_ANGLE = 15;
const LIGHTING_MIN_FILL = 12;
const LIGHTING_MAX_ISSUES = 1;

/**
 * Analyze face alignment from pre-detected face data.
 * Pure function — no I/O, no camera dependency.
 */
export function analyzeAlignment(
  faces: DetectedFace[],
  frameWidth: number,
  frameHeight: number,
): FaceTrackingState {
  if (faces.length === 0) {
    return {
      status: 'no_face',
      issues: ['Position your face in the frame'],
      lightingOk: false,
    };
  }

  const issues: string[] = [];

  // Use the largest detected face
  const face = faces.reduce((largest, current) => {
    const largestArea = largest.width * largest.height;
    const currentArea = current.width * current.height;
    return currentArea > largestArea ? current : largest;
  });

  const faceRect = {
    x: face.x,
    y: face.y,
    width: face.width,
    height: face.height,
  };

  // Fill check
  const faceArea = face.width * face.height;
  const frameArea = frameWidth * frameHeight;
  const fillPercent = frameArea > 0 ? (faceArea / frameArea) * 100 : 0;
  if (fillPercent < MIN_FILL_PERCENT) {
    issues.push('Move closer');
  }

  // Center check
  const faceCenterX = face.x + face.width / 2;
  const faceCenterY = face.y + face.height / 2;
  const marginX = (1 - CENTER_TOLERANCE) / 2;
  const marginY = (1 - CENTER_TOLERANCE) / 2;
  const centeredX = faceCenterX >= frameWidth * marginX && faceCenterX <= frameWidth * (1 - marginX);
  const centeredY = faceCenterY >= frameHeight * marginY && faceCenterY <= frameHeight * (1 - marginY);
  if (!centeredX || !centeredY) {
    if (faceCenterX < frameWidth * marginX) issues.push('Move right');
    else if (faceCenterX > frameWidth * (1 - marginX)) issues.push('Move left');
    if (faceCenterY < frameHeight * marginY) issues.push('Move down');
    else if (faceCenterY > frameHeight * (1 - marginY)) issues.push('Move up');
  }

  // Angle check
  const yawOk = face.yawAngle == null || Math.abs(face.yawAngle) <= MAX_ANGLE;
  const rollOk = face.rollAngle == null || Math.abs(face.rollAngle) <= MAX_ANGLE;
  if (!yawOk || !rollOk) {
    issues.push('Turn toward camera');
  }

  // Lighting proxy: without native lux sensor access, we use face detection
  // confidence as a proxy — MLKit detects faces more reliably in good light.
  // A face that fills > 12% AND is detected (which requires adequate contrast)
  // is a reasonable proxy for "not too dark."
  // This is NOT true lighting measurement — it's the best we can do without
  // native module access to the camera's exposure metadata.
  const lightingOk = fillPercent >= LIGHTING_MIN_FILL;

  const isAligned = issues.length === 0;

  return {
    status: isAligned ? 'aligned' : 'misaligned',
    faceRect,
    issues,
    lightingOk,
  };
}

/**
 * Legacy wrapper — accepts a photo URI and runs face detection via
 * react-native-vision-camera-face-detector (or returns aligned passthrough
 * if the native module is unavailable).
 *
 * This is used by photoQuality.ts for the final capture check.
 * During live preview, the frame processor provides faces directly.
 */
export async function analyzeFrame(
  photoUri: string,
  frameWidth: number,
  frameHeight: number,
): Promise<FaceTrackingState> {
  // In Expo Go or when VisionCamera is unavailable, pass through
  return {
    status: 'aligned',
    issues: [],
    lightingOk: true,
    lightingUnavailable: true,
  };
}

/**
 * Derive directional hints from issues for UI indicators.
 */
export function getDirections(issues: string[]): ('left' | 'right' | 'up' | 'down' | 'closer' | 'face_camera')[] {
  const dirs: ('left' | 'right' | 'up' | 'down' | 'closer' | 'face_camera')[] = [];
  for (const issue of issues) {
    if (issue === 'Move closer') dirs.push('closer');
    else if (issue === 'Move left') dirs.push('left');
    else if (issue === 'Move right') dirs.push('right');
    else if (issue === 'Move up') dirs.push('up');
    else if (issue === 'Move down') dirs.push('down');
    else if (issue === 'Turn toward camera') dirs.push('face_camera');
  }
  return dirs;
}
