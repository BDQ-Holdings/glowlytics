import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeAlignment, FaceTrackingState } from '../services/faceTracking';
import type { DetectedFace } from '../services/faceTracking';

/**
 * Face tracking hook — receives face detection results from VisionCamera
 * frame processor and computes alignment state.
 *
 * The camera screen is responsible for running the frame processor and
 * calling `onFacesDetected` with mapped face data. This hook is pure
 * React state management + alignment math.
 */
export function useFaceTracking(
  enabled: boolean,
  frameWidth: number = 720,
  frameHeight: number = 1280,
): {
  trackingState: FaceTrackingState;
  onFacesDetected: (faces: DetectedFace[], w: number, h: number) => void;
  lastFrameWidth: number;
  lastFrameHeight: number;
} {
  const [trackingState, setTrackingState] = useState<FaceTrackingState>({
    status: 'no_face',
    issues: [],
    lightingOk: false,
  });
  const [frameDims, setFrameDims] = useState({ w: 0, h: 0 });
  const warmupDone = useRef(false);

  useEffect(() => {
    if (enabled) {
      const t = setTimeout(() => { warmupDone.current = true; }, 800);
      return () => { clearTimeout(t); warmupDone.current = false; };
    }
    warmupDone.current = false;
    setTrackingState({ status: 'no_face', issues: [], lightingOk: false });
  }, [enabled]);

  const onFacesDetected = useCallback((faces: DetectedFace[], w: number, h: number) => {
    if (!enabled || !warmupDone.current) return;
    if (w > 0 && h > 0) setFrameDims((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    // Use actual camera frame dimensions (not screen dims) since MLKit
    // returns face coords in camera-frame pixel space.
    const fw = w > 0 ? w : frameWidth;
    const fh = h > 0 ? h : frameHeight;
    // Mirror face X for front camera — the preview is mirrored so direction
    // hints need to match what the user sees, not raw camera coordinates.
    const mirrored = fw > 0 ? faces.map((f) => ({
      ...f,
      x: fw - f.x - f.width,
    })) : faces;
    const next = analyzeAlignment(mirrored, fw, fh);
    setTrackingState((prev) => {
      if (prev.status !== next.status) return next;
      if (prev.lightingOk !== next.lightingOk) return next;
      if (prev.issues.length !== next.issues.length) return next;
      // Compare actual issue strings — count match isn't enough
      if (prev.issues.some((iss, idx) => iss !== next.issues[idx])) return next;
      return prev;
    });
  }, [enabled, frameWidth, frameHeight]);

  return {
    trackingState,
    onFacesDetected,
    lastFrameWidth: frameDims.w,
    lastFrameHeight: frameDims.h,
  };
}
