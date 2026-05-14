/**
 * Face-mesh capture facade.
 *
 * Tries ARKit FaceAnchor first (via the expo-arkit-face native module).
 * Falls back to a deformed canonical mesh keyed by simple traits sampled
 * from the 2D face detector when the native module isn't linked.
 *
 * The metric pipeline downstream is agnostic to which source produced the
 * mesh — both ARKit and MediaPipe vertex tables share landmark keys.
 */

import * as arkitFace from '../../modules/expo-arkit-face';
import type { ARFaceCaptureFrame } from '../../modules/expo-arkit-face';
import { captureCanonicalMesh, deformCanonicalMesh, type FaceTraits } from './canonicalFaceMesh';
import type { CapturedFaceMesh } from '../types';

export type FaceMeshCaptureMode = 'arkit' | 'canonical';

export interface FaceMeshCaptureResult {
  mesh: CapturedFaceMesh;
  /** True if the mesh came from ARKit / TrueDepth (high fidelity). */
  isHighFidelity: boolean;
  /** Diagnostic — which path produced the mesh. */
  mode: FaceMeshCaptureMode;
}

/** Returns true when ARKit FaceAnchor capture is available on this device. */
export async function isArkitAvailable(): Promise<boolean> {
  return arkitFace.isSupported();
}

function frameToMesh(frame: ARFaceCaptureFrame): CapturedFaceMesh {
  return {
    vertices: frame.vertices,
    indices: frame.indices,
    blendShapes: frame.blendShapes,
    source: 'arkit',
    capturedAt: new Date(frame.timestamp).toISOString(),
  };
}

/**
 * One-shot face-mesh capture.
 *
 * On ARKit-capable devices: starts an AR session, samples one frame, stops
 * the session, returns the captured mesh.
 *
 * Otherwise: returns a deformed canonical mesh keyed by `traits` (the 2D
 * face detector's coarse measurements). Without traits, returns the
 * unmodified canonical mesh.
 */
export async function captureFaceMesh(opts: { traits?: FaceTraits } = {}): Promise<FaceMeshCaptureResult> {
  if (await isArkitAvailable()) {
    try {
      await arkitFace.startTracking();
      // ARKit needs a frame or two to fit the face. We poll captureFrame
      // up to ~1.5 s with 100 ms spacing.
      let frame: ARFaceCaptureFrame | null = null;
      for (let attempt = 0; attempt < 15 && !frame; attempt++) {
        frame = await arkitFace.captureFrame();
        if (!frame) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      await arkitFace.stopTracking();
      if (frame) {
        return { mesh: frameToMesh(frame), isHighFidelity: true, mode: 'arkit' };
      }
    } catch {
      // Fall through to canonical mesh.
    }
  }

  const mesh = opts.traits ? deformCanonicalMesh(opts.traits) : captureCanonicalMesh();
  return { mesh, isHighFidelity: false, mode: 'canonical' };
}
