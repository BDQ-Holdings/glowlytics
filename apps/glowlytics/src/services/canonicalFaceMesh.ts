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

// Anatomical landmark coordinates sampled from a real 3D human head bust
// generated via Hyper3D Rodin (17k-vert photorealistic male model), then
// re-projected into Glowlytics axes and normalised to roughly ±50 in Y.
//
// Pipeline: Blender → nearest-vertex sampling at 32 known anatomical targets
// → axis swap (Blender Y forward → Glowlytics Z forward) → scale to canonical
// units → symmetry-enforce midline + mirror pairs.
//
// Compared with the older schematic placement, this set captures real face
// geometry: the nose tip projects ~3× further forward (z = 62 vs 22), the
// cheekbones and temples have realistic relative widths, and the eye line
// has the actual depth offset between inner / outer canthi.
const CANONICAL_LANDMARKS: LandmarkVertex[] = [
  // Midline (x forced to 0 for perfect symmetry; metric pipeline depends on it)
  { index: 10,  label: 'trichion',           x:  0,    y:  48.59, z:   7.11 },
  { index: 9,   label: 'glabella',           x:  0,    y:  12.82, z:  50.86 },
  { index: 1,   label: 'pronasale',          x:  0,    y:   2.75, z:  62.48 },
  { index: 2,   label: 'subnasale',          x:  0,    y:  -7.22, z:  56.55 },
  { index: 0,   label: 'upper_lip_top',      x:  0,    y: -17.26, z:  54.60 },
  { index: 17,  label: 'lower_lip_bot',      x:  0,    y: -28.98, z:  51.03 },
  { index: 199, label: 'pogonion',           x:  0,    y: -30.07, z:  44.10 },
  { index: 152, label: 'menton',             x:  0,    y: -50.00, z:  16.47 },
  // Eyes — _L tags get +X (the original file's labelling convention; see
  // bone-structure-3d.js for why the L/R suffixes don't track subject anatomy).
  // Pairs are mirrored on X and averaged on Y/Z so left vs right are perfectly
  // symmetric — fluctuating-asymmetry metric is supposed to be 0 on the canonical.
  { index: 133, label: 'inner_canthus_L',    x:  7.97, y:   8.87, z:  51.63 },
  { index: 362, label: 'inner_canthus_R',    x: -7.97, y:   8.87, z:  51.63 },
  { index: 33,  label: 'outer_canthus_L',    x: 23.60, y:   6.41, z:  39.06 },
  { index: 263, label: 'outer_canthus_R',    x: -23.60,y:   6.41, z:  39.06 },
  { index: 159, label: 'upper_eyelid_L',     x: 17.18, y:  10.57, z:  47.11 },
  { index: 386, label: 'upper_eyelid_R',     x: -17.18,y:  10.57, z:  47.11 },
  { index: 145, label: 'lower_eyelid_L',     x: 18.03, y:   2.36, z:  47.37 },
  { index: 374, label: 'lower_eyelid_R',     x: -18.03,y:   2.36, z:  47.37 },
  { index: 468, label: 'iris_L',             x: 16.61, y:   7.40, z:  48.44 },
  { index: 473, label: 'iris_R',             x: -16.61,y:   7.40, z:  48.44 },
  // Brows
  { index: 105, label: 'brow_apex_L',        x: 20.41, y:  22.95, z:  42.95 },
  { index: 334, label: 'brow_apex_R',        x: -20.41,y:  22.95, z:  42.95 },
  { index: 55,  label: 'brow_inner_L',       x:  7.39, y:  13.71, z:  51.61 },
  { index: 285, label: 'brow_inner_R',       x: -7.39, y:  13.71, z:  51.61 },
  // Nose base
  { index: 49,  label: 'alar_L',             x:  5.36, y:  -3.85, z:  58.39 },
  { index: 279, label: 'alar_R',             x: -5.36, y:  -3.85, z:  58.39 },
  // Cheekbone (zygion), temple (tragion), jaw angle (gonion)
  { index: 234, label: 'zygion_L',           x: 30.94, y:   4.45, z:  14.94 },
  { index: 454, label: 'zygion_R',           x: -30.94,y:   4.45, z:  14.94 },
  { index: 127, label: 'tragion_L',          x: 19.57, y:   9.00, z:  -4.11 },
  { index: 356, label: 'tragion_R',          x: -19.57,y:   9.00, z:  -4.11 },
  { index: 172, label: 'gonion_L',           x: 17.39, y: -27.10, z:  10.93 },
  { index: 397, label: 'gonion_R',           x: -17.39,y: -27.10, z:  10.93 },
  // Mouth corners
  { index: 61,  label: 'cheilion_L',         x:  9.75, y: -20.61, z:  48.50 },
  { index: 291, label: 'cheilion_R',         x: -9.75, y: -20.61, z:  48.50 },
  // ── NEW: mid-temple + fronto-temporal (forehead width) ──
  { index: 21,  label: 'mid_temple_L',       x:  27.50, y:  22.00, z:  10.00 },
  { index: 251, label: 'mid_temple_R',       x: -27.50, y:  22.00, z:  10.00 },
  { index: 54,  label: 'upper_temple_L',     x:  24.00, y:  36.00, z:   6.00 },
  { index: 284, label: 'upper_temple_R',     x: -24.00, y:  36.00, z:   6.00 },
  // ── NEW: lip arch (philtral columns / cupid's bow peaks) ──
  { index: 37,  label: 'philtrum_L',         x:   2.40, y: -15.40, z:  55.20 },
  { index: 267, label: 'philtrum_R',         x:  -2.40, y: -15.40, z:  55.20 },
  // ── NEW: lateral vermilion border (lip outline) ──
  { index: 40,  label: 'upper_vermilion_L',  x:   5.60, y: -16.80, z:  53.00 },
  { index: 270, label: 'upper_vermilion_R',  x:  -5.60, y: -16.80, z:  53.00 },
  { index: 91,  label: 'lower_vermilion_L',  x:   5.60, y: -25.60, z:  51.80 },
  { index: 321, label: 'lower_vermilion_R',  x:  -5.60, y: -25.60, z:  51.80 },
  // ── NEW: lower mandibular border (jaw underline: gonion → menton arc) ──
  { index: 149, label: 'jaw_mid_L',          x:  13.50, y: -38.00, z:  15.00 },
  { index: 378, label: 'jaw_mid_R',          x: -13.50, y: -38.00, z:  15.00 },
  { index: 176, label: 'submandible_L',      x:   7.50, y: -46.00, z:  16.00 },
  { index: 400, label: 'submandible_R',      x:  -7.50, y: -46.00, z:  16.00 },
  // ── NEW: submental region (under-chin volume) ──
  { index: 175, label: 'submental_center',   x:   0.00, y: -53.00, z:   6.00 },
  { index: 171, label: 'submental_L',        x:   6.00, y: -49.00, z:   6.50 },
  { index: 396, label: 'submental_R',        x:  -6.00, y: -49.00, z:   6.50 },
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

/**
 * Named vertex-index groups for the landmarks added to give the canonical
 * head fuller "marquis mask" geometry. Visualization-only — these indices are
 * not referenced by the metric/scoring pipeline (that reads the captured mesh
 * via the measurement tables in boneStructure.ts), so adding them changes the
 * rendered wireframe without touching any score.
 */
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

/**
 * Triangle faces used by the 3D viewer to render the canonical head as a
 * semi-transparent clay sculpt behind the wireframe — gives the mesh
 * dimensional weight rather than a "wire-only" feel.
 *
 * Winding convention: each triangle is listed so that when viewed from the
 * camera at +z (looking at the face front), the screen-space cross product
 * of (B - A) × (C - A) is NEGATIVE. Triangles whose cross flips to positive
 * during rotation are currently back-facing and skipped by the viewer.
 *
 * Coverage: forehead → brow → eyes → nose → cheeks → mouth → chin → jaw.
 * Side-of-face wrap triangles (zygion ↔ tragion ↔ gonion) included so the
 * silhouette has volume when the mesh rotates past ±45°.
 */
export const CANONICAL_TRIANGLES: ReadonlyArray<[number, number, number]> = [
  // ── Forehead ──
  [10,  55, 285],
  [10, 105,  55],
  [10, 334, 285],
  [10, 127, 105],
  [10, 356, 334],
  // ── Brow / glabella ──
  [ 9,  55, 285],
  [55, 105, 159],
  [285, 334, 386],
  // ── Eye region ──
  [55, 159, 133],
  [285, 386, 362],
  [33, 159, 145],
  [263, 386, 374],
  [33, 145, 133],
  [263, 374, 362],
  [105, 33, 159],
  [334, 263, 386],
  // ── Nose ──
  [ 9,   1,  55],
  [ 9, 285,   1],
  [ 1,  49,   2],
  [ 1,   2, 279],
  [133,   1,  49],
  [362, 279,   1],
  // ── Cheek / midface ──
  [33, 234,  49],
  [263, 279, 454],
  [49, 234,  61],
  [279, 291, 454],
  // ── Upper lip / philtrum ──
  [ 2,  49,  61],
  [ 2, 291, 279],
  [ 2,  61,   0],
  [ 2,   0, 291],
  // ── Lower lip / chin ──
  [ 0,  61,  17],
  [ 0,  17, 291],
  [17,  61, 199],
  [17, 199, 291],
  // ── Jaw ──
  [61, 172, 199],
  [291, 199, 397],
  [61, 234, 172],
  [291, 397, 454],
  // ── Chin → menton ──
  [199, 172, 152],
  [199, 152, 397],
  // ── Silhouette wrap (visible during yaw) ──
  [127, 234, 172],
  [356, 397, 454],
  [127, 172, 152],
  [356, 152, 397],
  // ── NEW: lips (vermilion fill) ──
  [61, 40, 37], [61, 37, 0], [0, 267, 291], [267, 270, 291],
  [61, 91, 17], [17, 321, 291],
  // ── NEW: jaw underside + submental ──
  [172, 149, 176], [172, 176, 152], [397, 378, 400], [397, 400, 152],
  [152, 175, 171], [152, 396, 175], [172, 171, 175], [397, 175, 396],
  // ── NEW: temple planes ──
  [127, 21, 54], [356, 284, 251],
];

/**
 * Indices used by the 3D viewer to draw a wireframe outline of the canonical
 * head. Order matters: front-facing edges first, so the capture-flow reveal
 * animation paints the face features (eyes / nose / mouth) before the
 * silhouette and the rear-bracing edges land.
 */
export const CANONICAL_OUTLINE_EDGES: ReadonlyArray<[number, number]> = [
  // ── Front-facing features (drawn first; revealed first in capture flow) ──

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

  // Mouth — vermilion outline (replaces the 4 coarse cheilion↔midline↔chin edges)
  [61, 40], [40, 37], [37, 0], [0, 267], [267, 270], [270, 291],   // upper vermilion arc
  [61, 91], [91, 17], [17, 321], [321, 291],                       // lower vermilion arc
  [37, 2], [267, 2],                                               // philtral columns → subnasale
  [61, 49], [291, 279], [61, 199], [291, 199],

  // ── Cheek + midface planes ──
  [234, 33],  [454, 263],        // zygion ↔ outer canthus
  [234, 49],  [454, 279],        // zygion ↔ alar
  [234, 61],  [454, 291],        // zygion ↔ mouth corner
  [234, 172], [454, 397],        // zygion ↔ gonion
  [33, 263],                     // outer canthus span (intercanthal vault)
  [49, 279],                     // alar span — already; nasal base width

  // ── Forehead ──
  [10, 9],                        // hairline → glabella midline
  [10, 55], [10, 285],            // hairline → brow inners
  [10, 105], [10, 334],           // hairline → brow apexes
  [10, 127], [10, 356],           // hairline → temples
  [9, 105], [9, 334],             // glabella → brow apex

  // ── Jaw silhouette + chin bracing ──
  [127, 234], [234, 172], [172, 199], [199, 397], [397, 454], [454, 356],
  [127, 356],                     // ear-to-ear over the top (skull arc)
  [172, 152], [397, 152], [199, 152],    // jawline → menton
  [127, 172], [356, 397],         // tragion → gonion (ramus)
  [199, 17],                      // chin → lower lip
  // ── NEW: temple fan (fuller forehead sides) ──
  [127, 21], [21, 54], [54, 10], [21, 105],
  [356, 251], [251, 284], [284, 10], [251, 334],
  // ── NEW: lower mandibular border (jaw underline) ──
  [172, 149], [149, 176], [176, 152],
  [397, 378], [378, 400], [400, 152],
  // ── NEW: submental arc (under-chin volume) ──
  [152, 175], [175, 171], [171, 172], [175, 396], [396, 397], [199, 175],
];
