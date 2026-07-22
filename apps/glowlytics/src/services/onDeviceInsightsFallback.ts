/**
 * On-device deterministic fallback for the L3 (GPT-4o) and Stage-2 streaming
 * insights endpoints. TypeScript port of `backend/no-llm-fallback.js`.
 *
 * Used when:
 *   - Network is unavailable
 *   - The backend `/api/vision/generate-insights` stream fails
 *   - The user opts out of LLM enrichment
 *
 * The shape produced matches the GPT-4o response schema exactly so the rest
 * of the scan pipeline doesn't need any branching beyond their entry points.
 */

import type {
  ConditionSeverity,
  Confidence,
  DetectedCondition,
  DetectedLesion,
  FacialRegion,
  GeneratedInsights,
  SignalScores,
  ZoneSeverity,
  ZoneSeverityEntry,
} from '../types';

export const SIGNAL_KEYS = ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'] as const;
type SignalKey = (typeof SIGNAL_KEYS)[number];

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  structure: 'Structure',
  hydration: 'Hydration',
  inflammation: 'Inflammation',
  sunDamage: 'Sun Damage',
  elasticity: 'Elasticity',
};

export const SIGNAL_DRIVERS: Record<SignalKey, string> = {
  structure: 'texture and pore visibility',
  hydration: 'moisture and barrier function',
  inflammation: 'redness and breakouts',
  sunDamage: 'pigmentation and UV exposure',
  elasticity: 'firmness and fine lines',
};

export const SIGNAL_ACTIONS: Record<SignalKey, string> = {
  structure: 'Use a gentle exfoliant 2–3× weekly and keep your barrier strong with ceramides.',
  hydration: 'Layer a humectant serum (hyaluronic acid, glycerin) under your moisturiser morning and night.',
  inflammation: 'Reduce active treatments for 48 hours and add a fragrance-free soothing serum (niacinamide, centella).',
  sunDamage: 'Apply broad-spectrum SPF 30+ daily and consider adding vitamin C in the morning.',
  elasticity: 'Continue retinoid use at tolerance and prioritise sleep + protein intake.',
};

function clamp(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50;
}

const ZONE_ORDER: FacialRegion[] = ['forehead', 'left_cheek', 'right_cheek', 'nose', 'chin', 'jaw'];

export interface Layer3FallbackInput {
  layer1Scores?: Partial<Record<SignalKey, number>>;
  layer2Overrides?: Partial<Record<SignalKey, number | null>>;
  lesions?: DetectedLesion[];
}

export interface Layer3FallbackResult {
  signal_scores: SignalScores;
  acne_score: number;
  sun_damage_score: number;
  skin_age_score: number;
  confidence: Confidence;
  primary_driver: string;
  recommended_action: string;
  personalized_feedback: string;
  zone_severity: ZoneSeverity;
  conditions: DetectedCondition[];
}

/**
 * Derive a Layer-3-equivalent payload from Layer 1 + Layer 2 results.
 * Matches the shape parsed out of the GPT response so downstream consumers
 * don't need a separate code path for the fallback.
 */
export function buildLayer3FromDeterministic({
  layer1Scores,
  layer2Overrides,
  lesions,
}: Layer3FallbackInput): Layer3FallbackResult {
  const overrides = layer2Overrides || {};

  const signal_scores = {} as SignalScores;
  for (const k of SIGNAL_KEYS) {
    const l1raw = layer1Scores?.[k];
    const l1 = Number.isFinite(l1raw) ? (l1raw as number) : 50;
    const l2raw = overrides[k];
    const l2 = Number.isFinite(l2raw) ? (l2raw as number) : null;
    signal_scores[k] = clamp(l2 != null ? (l1 + l2) / 2 : l1);
  }

  const acne_score       = clamp(100 - signal_scores.inflammation);
  const sun_damage_score = clamp(100 - signal_scores.sunDamage);
  const skin_age_score   = clamp(100 - (signal_scores.structure + signal_scores.elasticity) / 2);

  const ranked = (Object.entries(signal_scores) as Array<[SignalKey, number]>)
    .sort((a, b) => a[1] - b[1]);
  const weakest: SignalKey = ranked[0]?.[0] ?? 'structure';
  const strongest: SignalKey = ranked[ranked.length - 1]?.[0] ?? 'structure';

  const primary_driver = SIGNAL_DRIVERS[weakest] || 'general skin health';
  const recommended_action = SIGNAL_ACTIONS[weakest] || 'Continue daily scans for more data.';

  const personalized_feedback = [
    `Your ${SIGNAL_LABELS[strongest].toLowerCase()} is your strongest signal (${signal_scores[strongest]}/100).`,
    `${SIGNAL_LABELS[weakest]} is your most actionable area at ${signal_scores[weakest]}/100.`,
    SIGNAL_ACTIONS[weakest],
  ].join(' ');

  const lesionByZone: Partial<Record<FacialRegion, number>> = {};
  for (const lesion of lesions || []) {
    if (lesion.tier !== 'confirmed') continue;
    const zone = lesion.zone as FacialRegion;
    lesionByZone[zone] = (lesionByZone[zone] || 0) + 1;
  }
  const zone_severity: ZoneSeverity = {};
  for (const zone of ZONE_ORDER) {
    const count = lesionByZone[zone] || 0;
    const entry: ZoneSeverityEntry = {
      dominant_signal: count > 0 ? 'inflammation' : 'structure',
      severity: clamp(count > 0 ? 30 + count * 15 : 100 - signal_scores.structure),
    };
    zone_severity[zone] = entry;
  }

  const conditions: DetectedCondition[] = [];
  const totalConfirmed = Object.values(lesionByZone).reduce<number>((a, b) => a + (b ?? 0), 0);
  if (totalConfirmed > 0) {
    const zones = (Object.entries(lesionByZone) as Array<[FacialRegion, number]>)
      .filter(([, c]) => c > 0)
      .map(([region, c]) => ({
        region,
        severity: (c >= 3 ? 'severe' : c >= 2 ? 'moderate' : 'mild') as ConditionSeverity,
      }));
    conditions.push({
      name: 'acne',
      severity: (
        zones.some((z) => z.severity === 'severe') ? 'severe' :
        zones.some((z) => z.severity === 'moderate') ? 'moderate' : 'mild'
      ) as ConditionSeverity,
      zones,
      description: `Detected ${totalConfirmed} lesion${totalConfirmed === 1 ? '' : 's'} via on-device detection.`,
    });
  }

  return {
    signal_scores,
    acne_score,
    sun_damage_score,
    skin_age_score,
    confidence: 'med',
    primary_driver,
    recommended_action,
    personalized_feedback,
    zone_severity,
    conditions,
  };
}

export interface InsightsFallbackInput {
  signal_scores: SignalScores | undefined | null;
  lesions?: DetectedLesion[];
  conditions?: DetectedCondition[];
  scan_count?: number;
}

/**
 * Generate the same `GeneratedInsights` structure that the streamed GPT
 * response would produce.
 */
export function buildInsightsFromDeterministic({
  signal_scores,
  lesions,
  conditions,
  scan_count,
}: InsightsFallbackInput): GeneratedInsights {
  const safeScores = {} as SignalScores;
  for (const k of SIGNAL_KEYS) safeScores[k] = clamp(signal_scores?.[k]);

  const ranked = (Object.entries(safeScores) as Array<[SignalKey, number]>)
    .sort((a, b) => a[1] - b[1]);
  const weakest: SignalKey = ranked[0][0];
  const secondWeakest: SignalKey = ranked[1][0];
  const strongest: SignalKey = ranked[ranked.length - 1][0];

  const overall = Math.round(
    SIGNAL_KEYS.reduce((acc, k) => acc + safeScores[k], 0) / SIGNAL_KEYS.length,
  );

  const lesionCount = Array.isArray(lesions)
    ? lesions.filter((l) => l.tier === 'confirmed').length
    : 0;
  const conditionNames = (conditions || []).map((c) => c.name).slice(0, 2);

  const overall_summary = [
    `Composite skin score: ${overall}/100.`,
    `${SIGNAL_LABELS[strongest]} is leading at ${safeScores[strongest]}, while ${SIGNAL_LABELS[weakest]} is the most actionable at ${safeScores[weakest]}.`,
    lesionCount > 0
      ? `${lesionCount} lesion${lesionCount === 1 ? '' : 's'} flagged this scan.`
      : conditionNames.length > 0
        ? `Tracking ${conditionNames.join(' and ')}.`
        : 'No active concerns flagged this scan.',
  ].join(' ');

  const overall_score_context =
    (scan_count ?? 0) <= 1
      ? 'This is your baseline. Future scans will show how each signal moves over time.'
      : `Your composite is ${overall < 60 ? 'in the watch range' : overall < 75 ? 'stable' : 'strong'}. Focus on ${SIGNAL_LABELS[weakest].toLowerCase()} for the biggest near-term gain.`;

  const signal_insights: GeneratedInsights['signal_insights'] = {};
  for (const k of SIGNAL_KEYS) {
    signal_insights[k] = {
      status: `${SIGNAL_LABELS[k]} scored ${safeScores[k]}/100.`,
      driver: SIGNAL_DRIVERS[k],
      action: SIGNAL_ACTIONS[k],
    };
  }

  const zone_findings: GeneratedInsights['zone_findings'] = [];
  const lesionByZone: Partial<Record<FacialRegion, number>> = {};
  for (const l of lesions || []) {
    if (l.tier !== 'confirmed') continue;
    const zone = l.zone as FacialRegion;
    lesionByZone[zone] = (lesionByZone[zone] || 0) + 1;
  }
  for (const [zone, count] of Object.entries(lesionByZone) as Array<[FacialRegion, number]>) {
    if (count > 0) {
      zone_findings.push({
        zone,
        finding: `${count} active lesion${count === 1 ? '' : 's'} detected.`,
        recommendation: 'Spot-treat with benzoyl peroxide 2.5% or salicylic acid 2% nightly until cleared.',
      });
    }
  }

  return {
    overall_summary,
    overall_score_context,
    signal_insights,
    zone_findings,
    product_guidance: {
      stop: 'No products flagged to discontinue based on this scan alone.',
      consider: `Add a product targeting your ${SIGNAL_LABELS[weakest].toLowerCase()} signal.`,
      continue: 'Maintain your current SPF and cleansing routine.',
    },
    action_plan: [
      `Priority 1: Address ${SIGNAL_LABELS[weakest].toLowerCase()}. ${SIGNAL_ACTIONS[weakest]}`,
      `Priority 2: Support ${SIGNAL_LABELS[secondWeakest].toLowerCase()}. ${SIGNAL_ACTIONS[secondWeakest]}`,
      'Priority 3: Daily broad-spectrum SPF 30+ and 7–9 hours of sleep.',
    ],
  };
}
