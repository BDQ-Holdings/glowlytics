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

// User-facing copy for each finding code. Warmer + more specific than purely
// clinical phrasing — we lead with the visible read ("how it looks") and
// follow with the technical detail, instead of the other way around. Loaded
// comparatives like "more attractive" are out; descriptive read-language
// ("alert", "rested", "balanced") is in.
export const FINDING_COPY: Record<BoneFindingCode, { title: string; description: string }> = {
  canthal_tilt_negative:    { title: 'Downward eye tilt',         description: 'Your eye corners run flat or angle slightly down. Even a few degrees of upward tilt at the outer corner shifts the read toward alert and rested.' },
  canthal_tilt_excess:      { title: 'Sharp upward eye tilt',     description: 'Your outer corners sit unusually high. The cosmesis sweet spot tends to land between 4° and 8° — yours is just past that.' },
  scleral_show_inferior:    { title: 'Sclera visible under iris', description: 'A thin band of white shows below your iris at neutral gaze. This often reads as tired regardless of how you actually feel, and it’s among the most reversible items on this list.' },
  palpebral_fissure_narrow: { title: 'Narrow eye opening',        description: 'Your eye opening is taller relative to its width than is typical. Sometimes this is hereditary; sometimes it shifts with hydration and sleep.' },
  ipd_atypical:             { title: 'Unusual pupil spacing',     description: 'Your pupils sit slightly outside the classical "rule of fifths" spacing. This is almost always genetic and benign — most people never notice it on themselves.' },
  gonial_angle_obtuse:      { title: 'Soft jaw angle',            description: 'The angle where your jaw turns up toward your ear is wider than typical, which softens the line between your face and neck. Masseter tone and weight composition can shift this read over months.' },
  gonial_angle_acute:       { title: 'Sharp jaw angle',           description: 'Your jaw angle is sharper than typical — often the result of masseter hypertrophy from clenching or chewing habits. Frequently reversible with a different jaw-rest pattern.' },
  lower_face_wide:          { title: 'Square lower face',         description: 'Your jaw width is high relative to your cheekbones, which gives a strong square read in the lower third. Often masseter-driven.' },
  lower_face_narrow:        { title: 'Narrow lower face',         description: 'Your lower face is narrower than your cheekbones — an inverted-triangle profile. Common, and a matter of taste rather than concern.' },
  chin_recessed:            { title: 'Set-back chin',             description: 'Your chin projects less forward than the rest of your face on profile. This is the single change with the biggest impact on side-view balance.' },
  chin_excess:              { title: 'Forward-set chin',          description: 'Your chin extends further forward than your nose and cheekbones, slightly imbalancing the side view.' },
  bitemporal_narrow:        { title: 'Narrow temples',            description: 'Your temples are narrower than typical relative to your cheekbones. Subtle, but it affects the soft S-curve from forehead to cheek (the "ogee").' },
  bitemporal_wide:          { title: 'Wide temples',              description: 'Your temples sit wider than your cheekbones — an unusual proportion. Often a head-shape signature rather than something to change.' },
  midface_flat:             { title: 'Flatter midface',           description: 'Your cheekbones sit closer to the plane of your central face than is typical. The cheekbone read often improves on its own as hydration and sleep recover.' },
  alar_wide:                { title: 'Wide nasal base',           description: 'The base of your nose is wider than about a quarter of your cheekbone width. Often a defining feature rather than a flaw.' },
  nasolabial_acute:         { title: 'Tight nasolabial angle',    description: 'On profile, the line from your nose to your lip leans more vertical than typical — often associated with a slight tip droop.' },
  nasolabial_obtuse:        { title: 'Open nasolabial angle',     description: 'On profile, your nasal column tips upward more than typical — sometimes called an over-rotated tip.' },
  brow_low:                 { title: 'Low-set brow',              description: 'Your brow sits close to the bony rim above your eye. This can make the upper eye read heavy. Sleep and head-elevation often lift it visibly overnight.' },
  brow_high:                { title: 'High brow position',        description: 'Your brow apex sits noticeably above the bony rim — usually a natural arch rather than anything to adjust.' },
  brow_apex_misplaced:      { title: 'Brow arch placement',       description: 'Your brow’s highest point sits inside the lateral third where the typical "open eye" arch lands. Shaping can shift this gently.' },
  thirds_uneven:            { title: 'Facial thirds differ',      description: 'The three vertical thirds of your face (hairline to brow, brow to nose, nose to chin) don’t come out equal. Mostly a perceptual quirk, but it’s what trained eyes notice first.' },
  fifths_uneven:            { title: 'Facial fifths differ',      description: 'One or more of the five vertical "fifths" across your face differs in width. Usually small enough that you spot it only when measured.' },
  asymmetry_elevated:       { title: 'Mirror-side asymmetry',     description: 'Your left and right sides don’t mirror each other as closely as typical. Habit-driven asymmetry (sleep side, chewing side) often softens on its own when those habits change.' },
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
