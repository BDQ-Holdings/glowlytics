import { checkPhotoQualityFromFaces, PhotoQualityResult } from '../photoQuality';
import type { DetectedFace } from '../faceTracking';

// No mocks needed — checkPhotoQualityFromFaces is a pure function

const FRAME_W = 1000;
const FRAME_H = 1000;

describe('checkPhotoQualityFromFaces', () => {
  it('returns failure with "No face detected" when no faces are found', () => {
    const result: PhotoQualityResult = checkPhotoQualityFromFaces([], FRAME_W, FRAME_H);

    expect(result.faceDetected).toBe(false);
    expect(result.overallPass).toBe(false);
    expect(result.issues).toContain('No face detected');
  });

  it('returns "Move closer" when face is too small (<20% fill)', () => {
    // 100x100 face in 1000x1000 frame = 1% fill
    const faces: DetectedFace[] = [
      { x: 450, y: 450, width: 100, height: 100, yawAngle: 0, rollAngle: 0 },
    ];

    const result = checkPhotoQualityFromFaces(faces, FRAME_W, FRAME_H);

    expect(result.faceDetected).toBe(true);
    expect(result.fillPercent).toBeLessThan(20);
    expect(result.overallPass).toBe(false);
    expect(result.issues).toContain('Move closer');
  });

  it('returns "Center your face" when face is off-center', () => {
    // Face in the top-left corner: origin (0,0), size 300x300 => center at (150,150).
    // Center band (50% tolerance) is 250..750, so (150,150) is outside.
    const faces: DetectedFace[] = [
      { x: 0, y: 0, width: 300, height: 300, yawAngle: 0, rollAngle: 0 },
    ];

    const result = checkPhotoQualityFromFaces(faces, FRAME_W, FRAME_H);

    expect(result.faceDetected).toBe(true);
    expect(result.centered).toBe(false);
    expect(result.issues).toContain('Center your face');
  });

  it('returns "Face camera directly" when yaw exceeds 20 degrees', () => {
    const faces: DetectedFace[] = [
      { x: 200, y: 200, width: 600, height: 600, yawAngle: 25, rollAngle: 0 },
    ];

    const result = checkPhotoQualityFromFaces(faces, FRAME_W, FRAME_H);

    expect(result.faceDetected).toBe(true);
    expect(result.angleValid).toBe(false);
    expect(result.overallPass).toBe(false);
    expect(result.issues).toContain('Face camera directly');
  });

  it('returns overallPass true with no issues for a valid face', () => {
    // Well-centered, large, straight-on face
    const faces: DetectedFace[] = [
      { x: 200, y: 200, width: 600, height: 600, yawAngle: 5, rollAngle: -3 },
    ];

    const result = checkPhotoQualityFromFaces(faces, FRAME_W, FRAME_H);

    expect(result.faceDetected).toBe(true);
    expect(result.centered).toBe(true);
    expect(result.fillPercent).toBeGreaterThanOrEqual(20);
    expect(result.angleValid).toBe(true);
    expect(result.overallPass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('selects the largest face when multiple detected', () => {
    const faces: DetectedFace[] = [
      { x: 400, y: 400, width: 50, height: 50, yawAngle: 0, rollAngle: 0 },
      { x: 200, y: 200, width: 600, height: 600, yawAngle: 0, rollAngle: 0 },
    ];

    const result = checkPhotoQualityFromFaces(faces, FRAME_W, FRAME_H);

    expect(result.faceDetected).toBe(true);
    expect(result.fillPercent).toBeGreaterThanOrEqual(20);
    expect(result.overallPass).toBe(true);
  });

  it('treats null angles as valid', () => {
    const faces: DetectedFace[] = [
      { x: 200, y: 200, width: 600, height: 600, yawAngle: null, rollAngle: null },
    ];

    const result = checkPhotoQualityFromFaces(faces, FRAME_W, FRAME_H);

    expect(result.angleValid).toBe(true);
    expect(result.overallPass).toBe(true);
  });
});
