/**
 * Bone-structure / Harmony — UI-side constants.
 *
 * Backend `bone-structure-3d.js` owns the math, ideals, and the canonical list
 * of finding codes. This module mirrors the parts the UI needs:
 *
 *   - per-metric display copy (label, hint, unit, domain)
 *   - per-domain display copy (label, accent, weight)
 *   - finding-code → user-facing title + short explanation
 *   - landmark vertex pairs used to draw measurement overlays on the 3D head
 *
 * Any drift between this file and the backend must be reconciled — `findingCode`
 * values are the contract.
 */

import type { BoneDomain, BoneFindingCode, BoneMeshSource } from '../types';
import { Colors } from './theme';

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export interface BoneDomainMeta {
  key: BoneDomain;
  label: string;
  hint: string;
  weight: number;
  accent: string;
}

export const BONE_DOMAINS: readonly BoneDomainMeta[] = [
  { key: 'symmetry',    label: 'Symmetry',    hint: 'Thirds, fifths, mirror match', weight: 25, accent: '#7DE7E1' },
  { key: 'periorbital', label: 'Eye region',  hint: 'Canthal tilt, lid position',   weight: 20, accent: '#4DA6FF' },
  { key: 'mandibular',  label: 'Jawline',     hint: 'Gonial angle, chin, jaw width', weight: 20, accent: '#FF7A78' },
  { key: 'midface',     label: 'Midface',     hint: 'Cheekbones, ogee curve',       weight: 15, accent: '#F2B56A' },
  { key: 'nose',        label: 'Nose',        hint: 'Alar base, nasolabial angle',  weight: 10, accent: '#B68AFF' },
  { key: 'brow',        label: 'Brow',        hint: 'Brow rim, apex placement',     weight: 10, accent: '#9B8EC4' },
] as const;

export const HARMONY_ACCENT = Colors.harmony;

// ---------------------------------------------------------------------------
// Metrics — display metadata for each metric the backend returns
// ---------------------------------------------------------------------------

export type BoneMetricKey =
  | 'facial_thirds' | 'facial_fifths' | 'fluctuating_asymmetry'
  | 'canthal_tilt' | 'scleral_show' | 'palpebral_fissure_ratio' | 'ipd_ratio'
  | 'gonial_angle' | 'bigonial_bizygomatic_ratio' | 'chin_projection'
  | 'bitemporal_bizygomatic_ratio' | 'zygomatic_projection'
  | 'alar_bizygomatic_ratio' | 'nasolabial_angle'
  | 'brow_position' | 'brow_apex_lateral_third';

export interface BoneMetricMeta {
  key: BoneMetricKey;
  label: string;
  hint: string;
  unit: 'deg' | 'ratio' | 'mm' | 'none';
  domain: BoneDomain;
}

export const BONE_METRICS: readonly BoneMetricMeta[] = [
  { key: 'facial_thirds',                  label: 'Facial thirds',           hint: 'Top, middle, lower thirds match',  unit: 'ratio', domain: 'symmetry' },
  { key: 'facial_fifths',                  label: 'Facial fifths',           hint: 'Five equal vertical slices',       unit: 'ratio', domain: 'symmetry' },
  { key: 'fluctuating_asymmetry',          label: 'Mirror symmetry',         hint: 'Left vs right match',              unit: 'none',  domain: 'symmetry' },
  { key: 'canthal_tilt',                   label: 'Canthal tilt',            hint: 'Upward eye angle',                 unit: 'deg',   domain: 'periorbital' },
  { key: 'scleral_show',                   label: 'Scleral show',            hint: 'Lid covers inferior limbus',       unit: 'mm',    domain: 'periorbital' },
  { key: 'palpebral_fissure_ratio',        label: 'Eye aperture',            hint: 'Height vs width of eye opening',   unit: 'ratio', domain: 'periorbital' },
  { key: 'ipd_ratio',                      label: 'Interpupillary spacing',  hint: 'Pupil distance vs eye width',      unit: 'ratio', domain: 'periorbital' },
  { key: 'gonial_angle',                   label: 'Jaw angle',               hint: 'Mandibular gonion angle',          unit: 'deg',   domain: 'mandibular' },
  { key: 'bigonial_bizygomatic_ratio',     label: 'Jaw : cheekbone ratio',   hint: 'Lower-face width vs cheekbones',   unit: 'ratio', domain: 'mandibular' },
  { key: 'chin_projection',                label: 'Chin projection',         hint: 'Forward chin position',            unit: 'mm',    domain: 'mandibular' },
  { key: 'bitemporal_bizygomatic_ratio',   label: 'Temple : cheekbone',      hint: 'Temple width vs cheekbones',       unit: 'ratio', domain: 'midface' },
  { key: 'zygomatic_projection',           label: 'Cheekbone projection',    hint: 'Forward cheekbone position',       unit: 'mm',    domain: 'midface' },
  { key: 'alar_bizygomatic_ratio',         label: 'Nose base width',         hint: 'Alar base vs cheekbone width',     unit: 'ratio', domain: 'nose' },
  { key: 'nasolabial_angle',               label: 'Nasolabial angle',        hint: 'Columella to upper lip',           unit: 'deg',   domain: 'nose' },
  { key: 'brow_position',                  label: 'Brow position',           hint: 'Distance above orbital rim',       unit: 'ratio', domain: 'brow' },
  { key: 'brow_apex_lateral_third',        label: 'Brow apex placement',     hint: 'Apex at lateral third',            unit: 'ratio', domain: 'brow' },
] as const;

export const METRIC_BY_KEY: Record<BoneMetricKey, BoneMetricMeta> = Object.fromEntries(
  BONE_METRICS.map((m) => [m.key, m]),
) as Record<BoneMetricKey, BoneMetricMeta>;

// ---------------------------------------------------------------------------
// Findings — user-facing copy
// ---------------------------------------------------------------------------

export const FINDING_COPY: Record<BoneFindingCode, { title: string; description: string }> = {
  canthal_tilt_negative:    { title: 'Downward canthal tilt',  description: 'Your outer canthi sit at or below your inner canthi. A neutral-to-positive tilt reads as more youthful.' },
  canthal_tilt_excess:      { title: 'Steep canthal tilt',     description: 'Outer canthi are noticeably elevated. Most attractive ratings cluster in the 4–8° range.' },
  scleral_show_inferior:    { title: 'Inferior scleral show',  description: 'White sclera shows under your iris at neutral gaze, which can read as fatigue.' },
  palpebral_fissure_narrow: { title: 'Narrow eye aperture',    description: 'Your eye opening reads taller than wide is unusual — a height/width near 0.33 is typical.' },
  ipd_atypical:             { title: 'Atypical IPD',           description: 'Your interpupillary distance is outside the typical "rule of fifths" range. Often genetic and benign.' },
  gonial_angle_obtuse:      { title: 'Obtuse jaw angle',       description: 'The angle at your mandibular gonion is wider than the typical range, softening lower-face definition.' },
  gonial_angle_acute:       { title: 'Acute jaw angle',        description: 'Your jaw angle is sharper than the typical range, often from masseter hypertrophy.' },
  lower_face_wide:          { title: 'Wide lower face',        description: 'Your bigonial width is high relative to cheekbones, giving a square lower-face look.' },
  lower_face_narrow:        { title: 'Narrow lower face',      description: 'Lower face reads narrow versus your cheekbones — adds an inverted-triangle quality.' },
  chin_recessed:            { title: 'Recessed chin',          description: 'Your pogonion projects less than the cheekbones and nose, which affects profile.' },
  chin_excess:              { title: 'Prominent chin',         description: 'Chin projects further forward than is typical for the rest of your facial geometry.' },
  bitemporal_narrow:        { title: 'Narrow temples',         description: 'Temple width is narrow relative to cheekbones. Subtle but affects the ogee curve.' },
  bitemporal_wide:          { title: 'Wide temples',           description: 'Temple width exceeds cheekbones, an unusual proportion.' },
  midface_flat:             { title: 'Flat midface',           description: 'Cheekbones project less than the central face. Often improves with age-related volume changes addressed.' },
  alar_wide:                { title: 'Wide nasal base',        description: 'Your alar base spans more than ~1/4 of cheekbone width.' },
  nasolabial_acute:         { title: 'Acute nasolabial angle', description: 'Your columella sits closer to vertical than usual, often associated with a droopy tip on profile.' },
  nasolabial_obtuse:        { title: 'Obtuse nasolabial angle', description: 'Columella points up more than typical, often associated with an over-rotated tip.' },
  brow_low:                 { title: 'Low brow position',      description: 'Your brow sits closer to the supraorbital rim than typical; can read as heavy upper-eye.' },
  brow_high:                { title: 'High brow position',     description: 'Your brow apex sits unusually far above the orbital rim.' },
  brow_apex_misplaced:      { title: 'Brow apex placement',    description: 'Brow apex is not at the lateral third where it typically sits.' },
  thirds_uneven:            { title: 'Uneven facial thirds',   description: 'The upper, middle, and lower thirds of your face differ in length.' },
  fifths_uneven:            { title: 'Uneven facial fifths',   description: 'One or more of the five vertical slices differs noticeably from the others.' },
  asymmetry_elevated:       { title: 'Elevated asymmetry',     description: 'Left- and right-side landmarks do not mirror well — often habit-driven and reversible.' },
};

// ---------------------------------------------------------------------------
// Measurement overlay vertex pairs — for drawing dimension lines on the 3D head
//
// Indices are sourced per-mesh-source from the backend's LANDMARK_TABLES.
// `lineMetrics` produces a 2-point segment; `angleMetrics` produces a 3-point
// arc (vertexA, vertexCenter, vertexB).
// ---------------------------------------------------------------------------

export interface MeasurementLine {
  metricKey: BoneMetricKey;
  vertices: [number, number]; // [from, to]
  label: string;
}

export interface MeasurementAngle {
  metricKey: BoneMetricKey;
  vertices: [number, number, number]; // [armA, centre, armB]
  label: string;
}

const MEDIAPIPE_LINES: MeasurementLine[] = [
  { metricKey: 'canthal_tilt',                vertices: [133, 33],   label: 'Canthal tilt' },
  { metricKey: 'bigonial_bizygomatic_ratio',  vertices: [172, 397],  label: 'Jaw width' },
  { metricKey: 'bitemporal_bizygomatic_ratio',vertices: [127, 356],  label: 'Temple width' },
  { metricKey: 'alar_bizygomatic_ratio',      vertices: [49, 279],   label: 'Nose base' },
  { metricKey: 'ipd_ratio',                   vertices: [468, 473],  label: 'IPD' },
];

const MEDIAPIPE_ANGLES: MeasurementAngle[] = [
  { metricKey: 'gonial_angle',     vertices: [127, 172, 199], label: 'Jaw angle' },
  { metricKey: 'nasolabial_angle', vertices: [1, 2, 0],       label: 'Nasolabial' },
];

const ARKIT_LINES: MeasurementLine[] = [
  { metricKey: 'canthal_tilt',                vertices: [133, 33],   label: 'Canthal tilt' },
  { metricKey: 'bigonial_bizygomatic_ratio',  vertices: [395, 858],  label: 'Jaw width' },
  { metricKey: 'bitemporal_bizygomatic_ratio',vertices: [234, 454],  label: 'Temple width' },
  { metricKey: 'alar_bizygomatic_ratio',      vertices: [49, 279],   label: 'Nose base' },
];

const ARKIT_ANGLES: MeasurementAngle[] = [
  { metricKey: 'gonial_angle',     vertices: [234, 395, 175], label: 'Jaw angle' },
  { metricKey: 'nasolabial_angle', vertices: [4, 164, 13],    label: 'Nasolabial' },
];

export const MEASUREMENT_LINES: Record<BoneMeshSource, readonly MeasurementLine[]> = {
  mediapipe: MEDIAPIPE_LINES,
  arkit: ARKIT_LINES,
};

export const MEASUREMENT_ANGLES: Record<BoneMeshSource, readonly MeasurementAngle[]> = {
  mediapipe: MEDIAPIPE_ANGLES,
  arkit: ARKIT_ANGLES,
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatMetricValue(key: BoneMetricKey, value: number): string {
  if (!Number.isFinite(value)) return '—';
  const meta = METRIC_BY_KEY[key];
  if (!meta) return value.toFixed(2);
  switch (meta.unit) {
    case 'deg':   return `${value.toFixed(1)}°`;
    case 'ratio': return value.toFixed(2);
    case 'mm':    return `${value.toFixed(1)} mm`;
    default:      return value.toFixed(2);
  }
}

export function harmonyStatusLabel(score: number | null): string {
  if (score == null) return 'Pending';
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 55) return 'Balanced';
  if (score >= 40) return 'Mixed';
  return 'Watch';
}
