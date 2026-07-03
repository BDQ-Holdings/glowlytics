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

import type { BoneDomain, BoneFindingCode, BoneStructureResult } from '../types';
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
  | 'facial_thirds' | 'facial_fifths' | 'facial_index' | 'fluctuating_asymmetry'
  | 'canthal_tilt' | 'scleral_show' | 'palpebral_fissure_ratio' | 'ipd_ratio'
  | 'gonial_angle' | 'bigonial_bizygomatic_ratio' | 'chin_projection'
  | 'bitemporal_bizygomatic_ratio' | 'zygomatic_projection' | 'lip_ratio'
  | 'alar_bizygomatic_ratio' | 'mouth_nose_ratio' | 'nasolabial_angle'
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
  { key: 'facial_index',                   label: 'Face length ratio',       hint: 'Face height vs cheekbone width',   unit: 'ratio', domain: 'midface' },
  { key: 'fluctuating_asymmetry',          label: 'Mirror symmetry',         hint: 'Left vs right match',              unit: 'none',  domain: 'symmetry' },
  { key: 'canthal_tilt',                   label: 'Canthal tilt',            hint: 'Upward eye angle',                 unit: 'deg',   domain: 'periorbital' },
  { key: 'scleral_show',                   label: 'Scleral show',            hint: 'Lid covers inferior limbus',       unit: 'ratio', domain: 'periorbital' },
  { key: 'palpebral_fissure_ratio',        label: 'Eye aperture',            hint: 'Height vs width of eye opening',   unit: 'ratio', domain: 'periorbital' },
  { key: 'ipd_ratio',                      label: 'Interpupillary spacing',  hint: 'Pupil distance vs eye width',      unit: 'ratio', domain: 'periorbital' },
  { key: 'gonial_angle',                   label: 'Jaw angle',               hint: 'Mandibular gonion angle',          unit: 'deg',   domain: 'mandibular' },
  { key: 'bigonial_bizygomatic_ratio',     label: 'Jaw : cheekbone ratio',   hint: 'Lower-face width vs cheekbones',   unit: 'ratio', domain: 'mandibular' },
  { key: 'chin_projection',                label: 'Chin projection',         hint: 'Forward chin position',            unit: 'ratio', domain: 'mandibular' },
  { key: 'bitemporal_bizygomatic_ratio',   label: 'Temple : cheekbone',      hint: 'Temple width vs cheekbones',       unit: 'ratio', domain: 'midface' },
  { key: 'zygomatic_projection',           label: 'Cheekbone projection',    hint: 'Forward cheekbone position',       unit: 'ratio', domain: 'midface' },
  { key: 'lip_ratio',                      label: 'Lip balance',             hint: 'Upper vs lower lip height',        unit: 'ratio', domain: 'midface' },
  { key: 'alar_bizygomatic_ratio',         label: 'Nose base width',         hint: 'Alar base vs cheekbone width',     unit: 'ratio', domain: 'nose' },
  { key: 'mouth_nose_ratio',               label: 'Mouth-to-nose width',     hint: 'Smile width vs nose base',         unit: 'ratio', domain: 'nose' },
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
type HarmonyFindingCode =
  | BoneFindingCode
  | 'face_long' | 'face_short'
  | 'mouth_narrow' | 'mouth_wide'
  | 'lip_ratio_high' | 'lip_ratio_low';

export const FINDING_COPY: Record<HarmonyFindingCode, { title: string; description: string }> = {
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
  face_long:                { title: 'Longer face ratio',         description: 'Your face height runs a little longer relative to cheekbone width. The read is a more elongated oval than the classic balanced proportion.' },
  face_short:               { title: 'Shorter face ratio',        description: 'Your face height is compact relative to cheekbone width. This gives the face a broader, more grounded read rather than an elongated one.' },
  mouth_narrow:             { title: 'Narrow mouth-to-nose width', description: 'Your mouth width sits closer to your nose base than the classic proportion. It reads as a compact central feature balance.' },
  mouth_wide:               { title: 'Wide mouth-to-nose width',   description: 'Your mouth width extends further beyond the nose base than the classic proportion. It gives the lower midface a more open read.' },
  lip_ratio_high:           { title: 'Upper lip reads fuller',    description: 'Your upper lip height is high relative to the lower lip. The lip balance reads more top-weighted than the usual relaxed proportion.' },
  lip_ratio_low:            { title: 'Lower lip reads fuller',    description: 'Your lower lip carries more height relative to the upper lip. This is common and usually reads soft rather than sharp.' },
};

// ---------------------------------------------------------------------------
// Indices follow the canonical MediaPipe face topology used by the viewer.
// `lineMetrics` produces one or more 2-point segments; `angleMetrics`
// produces a 3-point arc (vertexA, vertexCenter, vertexB). Multi-segment
// lines let a single metric (e.g. thirds/fifths) draw every span it compares.
// ---------------------------------------------------------------------------

type MeasurementSegment = [number, number];

export interface MeasurementLine {
  metricKey: BoneMetricKey;
  vertices: MeasurementSegment | MeasurementSegment[]; // [from, to] or multiple spans
  label: string;
}

export interface MeasurementAngle {
  metricKey: BoneMetricKey;
  vertices: [number, number, number]; // [armA, centre, armB]
  label: string;
}

export const MEASUREMENT_LINES: readonly MeasurementLine[] = [
  { metricKey: 'facial_thirds',                  vertices: [[10, 9], [9, 2], [2, 152]],             label: 'Facial thirds' },
  { metricKey: 'facial_fifths',                  vertices: [[127, 33], [33, 133], [133, 362], [362, 263], [263, 356]], label: 'Facial fifths' },
  { metricKey: 'facial_index',                   vertices: [[10, 152], [234, 454]],                 label: 'Face length' },
  { metricKey: 'canthal_tilt',                   vertices: [[133, 33], [362, 263]],                 label: 'Canthal tilt' },
  { metricKey: 'scleral_show',                   vertices: [[468, 145], [473, 374]],                label: 'Lower sclera' },
  { metricKey: 'palpebral_fissure_ratio',        vertices: [[159, 145], [386, 374]],                label: 'Eye aperture' },
  { metricKey: 'ipd_ratio',                      vertices: [468, 473],                              label: 'IPD' },
  { metricKey: 'bigonial_bizygomatic_ratio',     vertices: [172, 397],                              label: 'Jaw width' },
  { metricKey: 'chin_projection',                vertices: [2, 199],                                label: 'Chin depth' },
  { metricKey: 'bitemporal_bizygomatic_ratio',   vertices: [127, 356],                              label: 'Temple width' },
  { metricKey: 'zygomatic_projection',           vertices: [234, 454],                              label: 'Cheekbone line' },
  { metricKey: 'lip_ratio',                      vertices: [[0, 13], [13, 17]],                     label: 'Lip balance' },
  { metricKey: 'alar_bizygomatic_ratio',         vertices: [49, 279],                               label: 'Nose base' },
  { metricKey: 'mouth_nose_ratio',               vertices: [[61, 291], [49, 279]],                  label: 'Mouth : nose' },
  { metricKey: 'brow_position',                  vertices: [[105, 159], [334, 386]],                label: 'Brow height' },
  { metricKey: 'brow_apex_lateral_third',        vertices: [[55, 105], [105, 33], [285, 334], [334, 263]], label: 'Brow apex' },
];

export const MEASUREMENT_ANGLES: readonly MeasurementAngle[] = [
  { metricKey: 'gonial_angle',     vertices: [127, 172, 199], label: 'Jaw angle' },
  { metricKey: 'nasolabial_angle', vertices: [1, 2, 0],       label: 'Nasolabial' },
];

export const MEASUREMENT_OVERLAY_NOTES: Partial<Record<BoneMetricKey, string>> = {
  fluctuating_asymmetry: 'Drawn from multiple paired left/right landmarks rather than a single stable line segment.',
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

// ---------------------------------------------------------------------------
// Interpretation — turn 0..100 scores into a band + plain-language meaning
// ---------------------------------------------------------------------------

/** Domain/metric harmony scores are 0..100, higher is better. At/above this
 *  they read as "in range"; below reads as "below range". */
export const IDEAL_SCORE_MIN = 70;

export type ScoreBand = 'below' | 'ideal' | 'above';

export interface ScoreInterpretation {
  band: ScoreBand;
  bandLabel: string;
  label: string;
  scoreText: string;
  idealText: string;
  meaning: string;
}

const IDEAL_TEXT = `ideal ${IDEAL_SCORE_MIN}–100`;

export const DOMAIN_INTERPRETATION: Record<
  BoneDomain,
  { label: string; below: string; inRange: string; pending: string }
> = {
  symmetry: {
    label: 'Symmetry',
    below: 'your facial thirds and left–right mirror-match diverge more than the balanced range.',
    inRange: 'your proportions and left–right match sit in a balanced range.',
    pending: 'not enough data yet to read your symmetry.',
  },
  periorbital: {
    label: 'Eye region',
    below: 'your eye framing — tilt, aperture and lid position — reads heavier than the balanced range.',
    inRange: 'your eye region reads open and rested.',
    pending: 'not enough data yet to read your eye region.',
  },
  mandibular: {
    label: 'Jawline',
    below: 'your jaw angle, chin projection or jaw width pulls the lower third out of balance.',
    inRange: 'your jawline and chin sit in a balanced range.',
    pending: 'not enough data yet to read your jawline.',
  },
  midface: {
    label: 'Midface balance',
    below: 'the middle third of your face is set back relative to the upper and lower thirds.',
    inRange: 'your cheekbones and midface project in balance with the rest of your face.',
    pending: 'not enough data yet to read your midface.',
  },
  nose: {
    label: 'Nose',
    below: 'your nasal base width or nasolabial angle sits outside the balanced range.',
    inRange: 'your nose proportions sit in a balanced range.',
    pending: 'not enough data yet to read your nose.',
  },
  brow: {
    label: 'Brow',
    below: 'your brow height or arch placement pulls the upper face out of balance.',
    inRange: 'your brow sits at a balanced height and arch.',
    pending: 'not enough data yet to read your brow.',
  },
};

/** Explicit per-metric copy where we have it; other metrics fall back to the
 *  metric's own hint so every metric is still interpretable. */
export const METRIC_INTERPRETATION: Partial<Record<BoneMetricKey, { below: string; inRange: string }>> = {
  gonial_angle: {
    below: 'your jaw angle is softer than the balanced range, blurring the jaw–neck line.',
    inRange: 'your jaw angle sits in a balanced range, giving a clean jaw–neck line.',
  },
  chin_projection: {
    below: 'your chin projects less forward than balanced, which flattens the side profile.',
    inRange: 'your chin projects in balance with your nose and lips on profile.',
  },
  canthal_tilt: {
    below: 'your outer eye corners run flat or downward rather than the balanced upward tilt.',
    inRange: 'your outer eye corners carry a balanced upward tilt.',
  },
  facial_thirds: {
    below: 'your three vertical face-thirds are less even than the balanced range.',
    inRange: 'your three vertical face-thirds come out close to even.',
  },
  facial_index: {
    below: 'your face height-to-width ratio sits outside the classic balanced oval range.',
    inRange: 'your face height and cheekbone width sit near the classic balanced oval ratio.',
  },
  zygomatic_projection: {
    below: 'your cheekbones sit closer to the central-face plane than balanced.',
    inRange: 'your cheekbones project in a balanced range.',
  },
  bitemporal_bizygomatic_ratio: {
    below: 'your temples are narrow relative to your cheekbones, softening the ogee curve.',
    inRange: 'your temple-to-cheekbone width sits in a balanced range.',
  },
  lip_ratio: {
    below: 'your upper-to-lower lip height balance sits outside the relaxed proportional range.',
    inRange: 'your upper and lower lip heights sit in a balanced range.',
  },
  mouth_nose_ratio: {
    below: 'your mouth width and nose-base width sit outside the classic central-face proportion.',
    inRange: 'your mouth width and nose-base width sit in a balanced range.',
  },
};

function bandLabelFor(band: ScoreBand): string {
  if (band === 'ideal') return 'In range';
  if (band === 'above') return 'Above range';
  return 'Below range';
}

export function interpretDomainScore(domain: BoneDomain, score: number | null): ScoreInterpretation {
  const copy = DOMAIN_INTERPRETATION[domain];
  if (score == null || !Number.isFinite(score)) {
    return { band: 'below', bandLabel: 'Pending', label: copy.label, scoreText: '—', idealText: IDEAL_TEXT, meaning: copy.pending };
  }
  const band: ScoreBand = score >= IDEAL_SCORE_MIN ? 'ideal' : 'below';
  return {
    band,
    bandLabel: bandLabelFor(band),
    label: copy.label,
    scoreText: `${Math.round(score)}/100`,
    idealText: IDEAL_TEXT,
    meaning: band === 'ideal' ? copy.inRange : copy.below,
  };
}

export function interpretMetricScore(key: BoneMetricKey, score: number): ScoreInterpretation {
  const meta = METRIC_BY_KEY[key];
  const band: ScoreBand = Number.isFinite(score) && score >= IDEAL_SCORE_MIN ? 'ideal' : 'below';
  const copy = METRIC_INTERPRETATION[key];
  const label = meta?.label ?? key;
  const hint = meta?.hint ? meta.hint.toLowerCase() : 'this measurement';
  const meaning = copy
    ? band === 'ideal' ? copy.inRange : copy.below
    : band === 'ideal'
      ? `${label} sits in a balanced range (${hint}).`
      : `${label} is below its balanced range (${hint}).`;
  return {
    band,
    bandLabel: bandLabelFor(band),
    label,
    scoreText: Number.isFinite(score) ? `${Math.round(score)}/100` : '—',
    idealText: IDEAL_TEXT,
    meaning,
  };
}

export interface DriverReadout {
  domain: BoneDomain;
  label: string;
  scoreText: string;
  band: ScoreBand;
  bandLabel: string;
  meaning: string;
}

export function buildDriverReadout(
  bone: Pick<BoneStructureResult, 'dominant_driver' | 'domain_scores'>,
): DriverReadout | null {
  const d = bone.dominant_driver;
  if (!d) return null;
  const interp = interpretDomainScore(d, bone.domain_scores?.[d] ?? null);
  return { domain: d, label: interp.label, scoreText: interp.scoreText, band: interp.band, bandLabel: interp.bandLabel, meaning: interp.meaning };
}

// ---------------------------------------------------------------------------
// Measurement-label layout — nudge overlapping labels apart (pure, testable)
// ---------------------------------------------------------------------------

/** A label's bounding box. `y` is the TOP of the box; it spans [y, y+height]. */
export interface LabelBox { x: number; y: number; width: number; height: number }

/**
 * Push label boxes down (never sideways) until none overlap. Boxes are
 * processed top-first; each that would collide with an already-placed box is
 * dropped below it by `gap`. Deterministic and independent of any render, so
 * the collision behaviour is unit-testable. Input order is preserved in the
 * returned array.
 */
export function resolveLabelCollisions(boxes: readonly LabelBox[], gap = 2): LabelBox[] {
  const order = boxes.map((_, i) => i).sort((a, z) => boxes[a].y - boxes[z].y);
  const placed: LabelBox[] = [];
  const out = new Array<LabelBox>(boxes.length);
  for (const i of order) {
    const src = boxes[i];
    let y = src.y;
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of placed) {
        const overlapX = Math.abs(p.x - src.x) * 2 < p.width + src.width;
        const overlapY = y < p.y + p.height + gap && p.y < y + src.height + gap;
        if (overlapX && overlapY) { y = p.y + p.height + gap; changed = true; }
      }
    }
    const resolved: LabelBox = { x: src.x, y, width: src.width, height: src.height };
    placed.push(resolved);
    out[i] = resolved;
  }
  return out;
}
