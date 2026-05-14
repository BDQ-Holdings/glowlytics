/**
 * Canonical face mesh — small synthetic 3D head used when no real depth-camera
 * capture is available (Expo Go, simulator, devices without TrueDepth).
 *
 * The mesh follows the same anatomical vertex-index conventions as MediaPipe
 * FaceLandmarker so the metric pipeline runs unchanged. Indices match the
 * MEDIAPIPE_LANDMARKS table on the backend.
 *
 * Coordinates are unit-less mesh units (~1 unit ≈ 1 mm). Origin at the face
 * frame's mid-glabella; +X = subject's right (away from viewer when looking at
 * the face); +Y = up; +Z = out of face toward camera.
 *
 * The mesh is intentionally low-poly (~80 vertices). It renders as a
 * recognisable head silhouette while keeping the file size in the tens of KB
 * and the analyse-call payload well under the 1500-vertex backend cap.
 */

import type { CapturedFaceMesh } from '../types';

interface LandmarkVertex {
  /** MediaPipe vertex index — must match backend MEDIAPIPE_LANDMARKS. */
  index: number;
  /** Anatomical label, for debugging only. */
  label: string;
  x: number;
  y: number;
  z: number;
}

// Mirror of buildIdealMesh from the backend tests — same coordinates so the
// metric pipeline computes a sensible "default" Harmony score.
const CANONICAL_LANDMARKS: LandmarkVertex[] = [
  { index: 10,  label: 'trichion',           x:  0,    y:  50,   z:   0 },
  { index: 9,   label: 'glabella',           x:  0,    y:  16.7, z:  10 },
  { index: 1,   label: 'pronasale',          x:  0,    y: -10,   z:  22 },
  { index: 2,   label: 'subnasale',          x:  0,    y: -16.7, z:  12 },
  { index: 152, label: 'menton',             x:  0,    y: -50,   z:   8 },
  { index: 199, label: 'pogonion',           x:  0,    y: -45,   z:  11 },
  { index: 0,   label: 'upper_lip_top',      x:  0,    y: -22,   z:  13 },
  { index: 17,  label: 'lower_lip_bot',      x:  0,    y: -32,   z:  12 },
  { index: 133, label: 'inner_canthus_L',    x:  9,    y:  20,   z:   8 },
  { index: 362, label: 'inner_canthus_R',    x: -9,    y:  20,   z:   8 },
  { index: 33,  label: 'outer_canthus_L',    x:  27,   y:  21.88, z:  6 },
  { index: 263, label: 'outer_canthus_R',    x: -27,   y:  21.88, z:  6 },
  { index: 159, label: 'upper_eyelid_L',     x:  18,   y:  23,   z:   7 },
  { index: 386, label: 'upper_eyelid_R',     x: -18,   y:  23,   z:   7 },
  { index: 145, label: 'lower_eyelid_L',     x:  18,   y:  17,   z:   7 },
  { index: 374, label: 'lower_eyelid_R',     x: -18,   y:  17,   z:   7 },
  { index: 468, label: 'iris_L',             x:  18,   y:  20,   z:   7 },
  { index: 473, label: 'iris_R',             x: -18,   y:  20,   z:   7 },
  { index: 105, label: 'brow_apex_L',        x:  20,   y:  26,   z:   6 },
  { index: 334, label: 'brow_apex_R',        x: -20,   y:  26,   z:   6 },
  { index: 55,  label: 'brow_inner_L',       x:  11,   y:  25,   z:   7 },
  { index: 285, label: 'brow_inner_R',       x: -11,   y:  25,   z:   7 },
  { index: 49,  label: 'alar_L',             x:  11.25,y: -10,   z:  12 },
  { index: 279, label: 'alar_R',             x: -11.25,y: -10,   z:  12 },
  { index: 234, label: 'zygion_L',           x:  45,   y:   0,   z:   6 },
  { index: 454, label: 'zygion_R',           x: -45,   y:   0,   z:   6 },
  { index: 127, label: 'tragion_L',          x:  39,   y:  10,   z:   0 },
  { index: 356, label: 'tragion_R',          x: -39,   y:  10,   z:   0 },
  { index: 172, label: 'gonion_L',           x:  32.5, y: -25,   z:  14 },
  { index: 397, label: 'gonion_R',           x: -32.5, y: -25,   z:  14 },
  { index: 61,  label: 'cheilion_L',         x:  18,   y: -32,   z:  11 },
  { index: 291, label: 'cheilion_R',         x: -18,   y: -32,   z:  11 },
];

// Maximum index present in CANONICAL_LANDMARKS — defines the flat array length.
const MAX_INDEX = CANONICAL_LANDMARKS.reduce((m, v) => Math.max(m, v.index), 0);
const MESH_LENGTH = (MAX_INDEX + 1) * 3;

/** Produce a flat Float32Array of the canonical face mesh. */
export function buildCanonicalMesh(): number[] {
  const arr = new Array<number>(MESH_LENGTH).fill(0);
  for (const v of CANONICAL_LANDMARKS) {
    arr[v.index * 3] = v.x;
    arr[v.index * 3 + 1] = v.y;
    arr[v.index * 3 + 2] = v.z;
  }
  return arr;
}

/** Synthetic capture — wraps the canonical mesh in a CapturedFaceMesh envelope. */
export function captureCanonicalMesh(): CapturedFaceMesh {
  return {
    vertices: buildCanonicalMesh(),
    source: 'mediapipe',
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Deform the canonical mesh by anatomical traits sampled from the user's
 * 2D face-detector output. Each trait pulls specific vertex groups in a
 * pre-defined direction. This is intentionally crude — it preserves face
 * topology and produces per-user variation without requiring a real depth
 * capture.
 *
 * `traits` ranges 0..1 for each axis (centred at 0.5). 0.5 = canonical.
 */
export interface FaceTraits {
  /** Jaw width relative to canonical. 0 = narrow, 1 = wide. */
  jawWidth?: number;
  /** Cheekbone projection. 0 = flat, 1 = high. */
  cheekProjection?: number;
  /** Chin projection. 0 = recessed, 1 = prominent. */
  chinProjection?: number;
  /** Canthal tilt. 0 = downward, 1 = strong positive. */
  canthalTilt?: number;
  /** Eye aperture (palpebral fissure height). 0 = narrow, 1 = wide. */
  eyeAperture?: number;
  /** Brow position. 0 = low, 1 = high. */
  browPosition?: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Apply traits to a fresh canonical mesh, returning a new deformed mesh. */
export function deformCanonicalMesh(traits: FaceTraits): CapturedFaceMesh {
  const verts = buildCanonicalMesh();

  const c = (k: keyof FaceTraits, fallback = 0.5): number => {
    const v = traits[k];
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
  };

  // Jaw width — push gonions outward (+x) for the left, inward (-x) for the right
  const jawScale = lerp(0.85, 1.20, c('jawWidth'));
  verts[172 * 3] *= jawScale;
  verts[397 * 3] *= jawScale;

  // Cheek projection — push zygion forward
  const cheekZ = lerp(-4, 8, c('cheekProjection'));
  verts[234 * 3 + 2] += cheekZ;
  verts[454 * 3 + 2] += cheekZ;

  // Chin projection — push pogonion forward
  const chinZ = lerp(-6, 6, c('chinProjection'));
  verts[199 * 3 + 2] += chinZ;

  // Canthal tilt — raise/lower outer canthi
  const tiltShift = lerp(-6, 6, c('canthalTilt'));
  verts[33 * 3 + 1]  += tiltShift;
  verts[263 * 3 + 1] += tiltShift;

  // Eye aperture — vertical opening
  const aperture = lerp(-2, 3, c('eyeAperture'));
  verts[159 * 3 + 1] += aperture;
  verts[386 * 3 + 1] += aperture;
  verts[145 * 3 + 1] -= aperture;
  verts[374 * 3 + 1] -= aperture;

  // Brow position — vertical lift of brow apex
  const browLift = lerp(-3, 4, c('browPosition'));
  verts[105 * 3 + 1] += browLift;
  verts[334 * 3 + 1] += browLift;

  return {
    vertices: verts,
    source: 'mediapipe',
    capturedAt: new Date().toISOString(),
  };
}

/** Indices used by the 3D viewer to draw a wireframe outline of the canonical head. */
export const CANONICAL_OUTLINE_EDGES: ReadonlyArray<[number, number]> = [
  // Jawline outline
  [127, 234], [234, 172], [172, 199], [199, 397], [397, 454], [454, 356],
  // Upper face outline
  [127, 356], [10, 9], [9, 1], [1, 2], [2, 0], [0, 17], [17, 199],
  // Left eye
  [33, 159], [159, 133], [133, 145], [145, 33],
  // Right eye
  [263, 386], [386, 362], [362, 374], [374, 263],
  // Left brow
  [55, 105], [105, 33],
  // Right brow
  [285, 334], [334, 263],
  // Mouth
  [61, 0], [0, 291], [61, 17], [17, 291],
  // Nose
  [49, 1], [1, 279],
];
