/**
 * Canonical face mesh — bundled real human face topology used whenever the app
 * needs a stable MediaPipe-indexed head: simulator/demo rendering, template
 * calibration, and non-TrueDepth fallback captures.
 *
 * Coordinates come from MediaPipe's canonical_face_model.obj via
 * canonicalFaceGeometry.ts: 474 flat xyz slots in millimetres, +Y up, +Z out of
 * the face toward the camera. Slots 0-467 are true MediaPipe anatomy; 468/473
 * are synthesized iris centres; 469-472 are intentionally zero placeholders.
 */

import type { CapturedFaceMesh } from '../types';
import {
  CANONICAL_FACE_TRIANGLES,
  CANONICAL_FACE_VERTICES,
} from './canonicalFaceGeometry';

/** MediaPipe landmark names used by Harmony metrics and viewer overlays. */
export const CANONICAL_LANDMARKS = {
  trichion: 10,
  glabella: 9,
  pronasale: 1,
  subnasale: 2,
  upper_lip_top: 0,
  upper_lip_mid: 13,
  lower_lip_bot: 17,
  pogonion: 199,
  menton: 152,

  inner_canthus_L: 133,
  inner_canthus_R: 362,
  outer_canthus_L: 33,
  outer_canthus_R: 263,
  upper_eyelid_L: 159,
  upper_eyelid_R: 386,
  lower_eyelid_L: 145,
  lower_eyelid_R: 374,
  iris_L: 468,
  iris_R: 473,

  brow_apex_L: 105,
  brow_apex_R: 334,
  brow_inner_L: 55,
  brow_inner_R: 285,

  alar_L: 49,
  alar_R: 279,
  zygion_L: 234,
  zygion_R: 454,
  tragion_L: 127,
  tragion_R: 356,
  gonion_L: 172,
  gonion_R: 397,
  cheilion_L: 61,
  cheilion_R: 291,

  mid_temple_L: 21,
  mid_temple_R: 251,
  upper_temple_L: 54,
  upper_temple_R: 284,
  philtrum_L: 37,
  philtrum_R: 267,
  upper_vermilion_L: 40,
  upper_vermilion_R: 270,
  lower_vermilion_L: 91,
  lower_vermilion_R: 321,
  jaw_mid_L: 149,
  jaw_mid_R: 378,
  submandible_L: 176,
  submandible_R: 400,
  submental_center: 175,
  submental_L: 171,
  submental_R: 396,
} as const satisfies Record<string, number>;

/** Produce a fresh mutable copy of the canonical 474-slot millimetre mesh. */
export function buildCanonicalMesh(): number[] {
  return CANONICAL_FACE_VERTICES.slice();
}

/** Named vertex-index groups used by the viewer and lightweight deformation. */
export const FACE_LANDMARK_GROUPS = {
  midTemple: [21, 251, 54, 284],
  lipArch: [37, 267],
  lateralVermilion: [40, 270, 91, 321],
  mandibularBorder: [149, 378, 176, 400],
  submental: [175, 171, 396],
} as const satisfies Record<string, readonly number[]>;

/** Synthetic capture — wraps the canonical mesh in a CapturedFaceMesh envelope. */
export function captureCanonicalMesh(): CapturedFaceMesh {
  return {
    vertices: buildCanonicalMesh(),
    source: 'canonical' as CapturedFaceMesh['source'],
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Deform the canonical mesh by anatomical traits sampled from 2D face-detector
 * output. The full 474-slot geometry is real topology, so edits use soft region
 * masks around landmark anchors rather than moving single isolated points.
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

function clamp01(v: number | undefined, fallback = 0.5): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

function coord(verts: readonly number[], idx: number): [number, number, number] {
  const o = idx * 3;
  return [verts[o], verts[o + 1], verts[o + 2]];
}

function distanceToClosestAnchor(verts: readonly number[], idx: number, anchors: readonly number[]): number {
  const [x, y, z] = coord(verts, idx);
  let best = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const [ax, ay, az] = coord(verts, anchor);
    const d = Math.hypot(x - ax, y - ay, z - az);
    if (d < best) best = d;
  }
  return best;
}

function applyRegion(
  verts: number[],
  anchors: readonly number[],
  radius: number,
  mutate: (idx: number, influence: number) => void,
): void {
  const count = Math.floor(verts.length / 3);
  for (let idx = 0; idx < count; idx++) {
    const o = idx * 3;
    if (verts[o] === 0 && verts[o + 1] === 0 && verts[o + 2] === 0) continue;
    const d = distanceToClosestAnchor(verts, idx, anchors);
    if (d > radius) continue;
    const t = 1 - d / radius;
    mutate(idx, t * t * (3 - 2 * t)); // smoothstep falloff
  }
}

/** Apply traits to a fresh canonical mesh, returning a new deformed capture. */
export function deformCanonicalMesh(traits: FaceTraits): CapturedFaceMesh {
  const verts = buildCanonicalMesh();

  // Jaw width — scale the mandibular border horizontally around gonion/menton.
  const jawScale = lerp(0.92, 1.12, clamp01(traits.jawWidth));
  applyRegion(verts, [172, 397, 149, 378, 176, 400], 36, (idx, influence) => {
    const o = idx * 3;
    verts[o] *= 1 + (jawScale - 1) * influence;
  });

  // Cheek projection — push zygomatic/outer-midface tissue forward as a sheet.
  const cheekZ = lerp(-4, 7, clamp01(traits.cheekProjection));
  applyRegion(verts, [234, 454, 50, 280], 34, (idx, influence) => {
    verts[idx * 3 + 2] += cheekZ * influence;
  });

  // Chin projection — move pogonion/mentolabial region forward/back together.
  const chinZ = lerp(-5, 6, clamp01(traits.chinProjection));
  applyRegion(verts, [199, 152, 175], 30, (idx, influence) => {
    verts[idx * 3 + 2] += chinZ * influence;
  });

  // Canthal tilt — lift/lower the lateral canthi and nearby lid corners.
  const tiltShift = lerp(-4, 4, clamp01(traits.canthalTilt));
  applyRegion(verts, [33, 263, 246, 466], 15, (idx, influence) => {
    verts[idx * 3 + 1] += tiltShift * influence;
  });

  // Eye aperture — separate upper and lower lids softly.
  const aperture = lerp(-1.8, 2.8, clamp01(traits.eyeAperture));
  applyRegion(verts, [159, 386], 13, (idx, influence) => {
    verts[idx * 3 + 1] += aperture * influence;
  });
  applyRegion(verts, [145, 374], 13, (idx, influence) => {
    verts[idx * 3 + 1] -= aperture * influence;
  });

  // Brow position — vertical lift/drop of the brow ridge, not the whole skull.
  const browLift = lerp(-3, 4, clamp01(traits.browPosition));
  applyRegion(verts, [105, 334, 55, 285], 20, (idx, influence) => {
    verts[idx * 3 + 1] += browLift * influence;
  });

  return {
    vertices: verts,
    source: 'canonical' as CapturedFaceMesh['source'],
    capturedAt: new Date().toISOString(),
  };
}

function tupleTriangles(flat: readonly number[]): ReadonlyArray<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]]);
  return out;
}

/** Real MediaPipe canonical-face triangle topology (898 faces, outward winding). */
export const CANONICAL_TRIANGLES: ReadonlyArray<[number, number, number]> = tupleTriangles(CANONICAL_FACE_TRIANGLES);

/**
 * Feature/silhouette edges used for hidden-line rendering and reveal animation.
 * The duplicate audit findings were [49,279] and [234,172]; both appear once.
 */
export const CANONICAL_OUTLINE_EDGES: ReadonlyArray<[number, number]> = [
  // Nose (centre-front pyramid)
  [9, 1], [1, 2], [49, 1], [1, 279], [49, 2], [279, 2],
  [49, 133], [279, 362], [49, 279],

  // Left eye + iris spokes
  [33, 159], [159, 133], [133, 145], [145, 33],
  [468, 159], [468, 145], [468, 133], [468, 33],
  // Right eye + iris spokes
  [263, 386], [386, 362], [362, 374], [374, 263],
  [473, 386], [473, 374], [473, 362], [473, 263],

  // Brows + brow-to-eye anchoring
  [55, 105], [105, 33], [55, 285],
  [285, 334], [334, 263],
  [9, 55], [9, 285], [55, 159], [285, 386],

  // Mouth / philtrum
  [61, 40], [40, 37], [37, 0], [0, 267], [267, 270], [270, 291],
  [61, 91], [91, 17], [17, 321], [321, 291],
  [37, 2], [267, 2],
  [61, 49], [291, 279], [61, 199], [291, 199],

  // Cheek + midface planes
  [234, 33], [454, 263],
  [234, 49], [454, 279],
  [234, 61], [454, 291],
  [234, 172], [454, 397],
  [33, 263],

  // Forehead
  [10, 9],
  [10, 55], [10, 285],
  [10, 105], [10, 334],
  [10, 127], [10, 356],
  [9, 105], [9, 334],

  // Jaw silhouette + chin bracing
  [127, 234], [172, 199], [199, 397], [397, 454], [454, 356],
  [127, 356],
  [172, 152], [397, 152], [199, 152],
  [127, 172], [356, 397],
  [199, 17],

  // Temple fan
  [127, 21], [21, 54], [54, 10], [21, 105],
  [356, 251], [251, 284], [284, 10], [251, 334],

  // Lower mandibular border
  [172, 149], [149, 176], [176, 152],
  [397, 378], [378, 400], [400, 152],

  // Submental arc
  [152, 175], [175, 171], [171, 172], [175, 396], [396, 397], [199, 175],
];
