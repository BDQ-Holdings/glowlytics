/**
 * On-device signal score fusion + lesion feedback.
 *
 * TypeScript port of the merge math from `backend/signal-models.js`. Combines
 * L1 deterministic + L2 ONNX + L3 (GPT-4o / fallback) signal scores using
 * uncertainty-weighted fusion, then folds in the lesion-detector feedback.
 *
 * Output shapes match the backend so downstream consumers (camera UI,
 * results screen, MCP tools) stay agnostic about where computation ran.
 */

import type {
  DetectedLesion,
  FacialRegion,
  SignalConfidence,
  SignalConfidenceLevel,
  SignalFeatures,
  SignalScores,
} from '../types';
import type { DeterministicFeatures } from './onDeviceImageFeatures';

const SIGNAL_KEYS = ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'] as const;
type SignalKey = (typeof SIGNAL_KEYS)[number];

// ---------------------------------------------------------------------------
// L1 features → L1 signal scores
// ---------------------------------------------------------------------------

const clampScore = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

const safeNumber = (v: unknown, fallback = 0): number =>
  Number.isFinite(v) ? (v as number) : fallback;

/**
 * Convert raw deterministic features to per-signal scores 0-100. Uses the
 * same empirical thresholds as the backend `featuresToSignalScores`.
 */
export function featuresToSignalScores(features: DeterministicFeatures): SignalScores {
  // INFLAMMATION: CIELAB a* > 10 is the clinical erythema threshold (Stamatas 2004)
  const aStar = safeNumber(features.inflammation?.a_star_mean, 5);
  const inflammationRaw = ((aStar + 5) / 30) * 100;
  const inflammation = clampScore(100 - inflammationRaw);

  // SUN DAMAGE: ITA CV > 0.3 indicates uneven pigmentation (Flament 2013)
  const itaCv = safeNumber(features.sunDamage?.ita_cv, 0.1);
  const spotCount = safeNumber(features.sunDamage?.spot_count, 0);
  const sunDamageRaw = (itaCv / 0.5) * 50 + Math.min(spotCount, 20) * 2.5;
  const sunDamage = clampScore(100 - sunDamageRaw);

  // HYDRATION
  const specRatio = safeNumber(features.hydration?.specular_ratio, 0.05);
  const lbpEntropy = safeNumber(features.hydration?.lbp_entropy, 5);
  const specUniformity = safeNumber(features.hydration?.specular_uniformity, 0.5);
  const hydrationRaw =
    (1 - specRatio * 10) * 30 + (lbpEntropy / 8) * 40 + (1 - specUniformity) * 30;
  const hydration = clampScore(100 - hydrationRaw);

  // STRUCTURE: lower GLCM contrast + homogeneity = smoother texture
  const glcmContrast = safeNumber(features.structure?.glcm_contrast, 2);
  const glcmHomogeneity = safeNumber(features.structure?.glcm_homogeneity, 0.7);
  const poreProxy = safeNumber(features.structure?.pore_proxy, 2);
  const structureRaw =
    (glcmContrast / 10) * 40 + (1 - glcmHomogeneity) * 30 + Math.min(poreProxy, 10) * 3;
  const structure = clampScore(100 - structureRaw);

  // ELASTICITY: lower wrinkle index + GLCM contrast = better elasticity
  const wrinkleIndex = safeNumber(features.elasticity?.wrinkle_index, 5);
  const foreheadContrast = safeNumber(features.elasticity?.forehead_glcm?.contrast, 2);
  const elasticityRaw = Math.min(wrinkleIndex, 30) * 2 + (foreheadContrast / 8) * 40;
  const elasticity = clampScore(100 - elasticityRaw);

  return { structure, hydration, inflammation, sunDamage, elasticity };
}

/**
 * Pull a compact summary of the L1 features into the API response shape.
 */
export function extractSummaryFeatures(features: DeterministicFeatures): SignalFeatures {
  return {
    inflammation_a_star: Math.round(features.inflammation.a_star_mean * 100) / 100,
    ita_variance: Math.round(features.sunDamage.ita_cv * 1000) / 1000,
    spot_count: features.sunDamage.spot_count,
    pore_density: Math.round(features.structure.pore_proxy * 100) / 100,
    wrinkle_index: Math.round(features.elasticity.wrinkle_index * 100) / 100,
    specular_ratio: Math.round(features.hydration.specular_ratio * 10000) / 10000,
  };
}

// ---------------------------------------------------------------------------
// Bbox → facial zone (matches backend `bboxToZone`)
// ---------------------------------------------------------------------------

export function bboxToZone(cx: number, cy: number): FacialRegion {
  if (cy < 0.25) return 'forehead';
  if (cy < 0.45) {
    if (cx < 0.35) return 'left_cheek';
    if (cx > 0.65) return 'right_cheek';
    return 'nose';
  }
  if (cy < 0.65) {
    if (cx < 0.35) return 'left_cheek';
    if (cx > 0.65) return 'right_cheek';
    return 'nose';
  }
  if (cy < 0.8) return 'chin';
  return 'jaw';
}

// ---------------------------------------------------------------------------
// Per-layer reliability betas (same numbers as backend)
// ---------------------------------------------------------------------------

const BETA_L1: Record<SignalKey, number> = {
  structure: 0.5,
  hydration: 0.5,
  inflammation: 0.8,
  sunDamage: 0.8,
  elasticity: 0.5,
};

const BETA_L2_LOADED: Record<SignalKey, number> = {
  structure: 0.9,
  hydration: 0.9,
  inflammation: 0.0, // no Layer 2 model for inflammation
  sunDamage: 0.85,
  elasticity: 0.9,
};

const BETA_L3: Record<SignalKey, number> = {
  structure: 0.6,
  hydration: 0.6,
  inflammation: 0.6,
  sunDamage: 0.6,
  elasticity: 0.6,
};

export interface Layer2Results {
  signalOverrides: Partial<Record<SignalKey, number | null>>;
  lesions: DetectedLesion[];
  signalConfidence: SignalConfidence;
}

/**
 * Merge L1 + L2 + L3 signal scores using uncertainty-weighted fusion.
 *
 *   merged = (β_L1·L1 + β_L2·L2 + β_L3·L3) / (β_L1 + β_L2 + β_L3)
 *
 * When a layer is missing, its β collapses to 0 and the formula gracefully
 * degrades to the remaining layers. Layer 3 may be `null` (no LLM available)
 * — we zero its weight so it never contributes a phantom signal.
 */
export function mergeSignalScores(
  layer1Scores: SignalScores,
  layer2Results: Layer2Results,
  layer3Scores: SignalScores | null | undefined,
): SignalScores {
  const overrides = layer2Results.signalOverrides;
  const merged = {} as SignalScores;
  const l3Available = layer3Scores != null;

  for (const signal of SIGNAL_KEYS) {
    const rawL1 = layer1Scores[signal];
    const l1 = Number.isFinite(rawL1) ? rawL1 : 50;
    const rawL2 = overrides?.[signal];
    const l2 = Number.isFinite(rawL2) ? (rawL2 as number) : undefined;
    const rawL3 = l3Available ? (layer3Scores as SignalScores)[signal] : undefined;
    const l3 = Number.isFinite(rawL3) ? (rawL3 as number) : l1;

    const betaL1 = BETA_L1[signal];
    const betaL2 = l2 !== undefined ? BETA_L2_LOADED[signal] : 0;
    const betaL3 = l3Available && Number.isFinite(rawL3) ? BETA_L3[signal] : 0;

    const totalBeta = betaL1 + betaL2 + betaL3;
    if (totalBeta === 0) {
      merged[signal] = clampScore(l1);
      continue;
    }

    const weightedSum = betaL1 * l1 + betaL2 * (l2 ?? 0) + betaL3 * l3;
    merged[signal] = clampScore(weightedSum / totalBeta);
  }

  return merged;
}

/**
 * Apply lesion detection feedback to signal scores.
 *
 * Confirmed acne lesions create per-confidence penalties for inflammation and
 * structure, capped to ±25 so a few lesions don't dominate the result.
 */
export function applyLesionFeedback(
  signalScores: SignalScores,
  lesions: DetectedLesion[] | null | undefined,
): SignalScores {
  if (!lesions || lesions.length === 0) return { ...signalScores };

  let inflammationPenalty = 0;
  let structurePenalty = 0;

  for (const lesion of lesions) {
    if (lesion.tier !== 'confirmed') continue;
    const conf = lesion.confidence;
    inflammationPenalty += conf * 5;
    structurePenalty += conf * 2;
  }

  return {
    structure: Math.max(0, Math.round(signalScores.structure - Math.min(25, structurePenalty))),
    hydration: signalScores.hydration,
    inflammation: Math.max(0, Math.round(signalScores.inflammation - Math.min(25, inflammationPenalty))),
    sunDamage: signalScores.sunDamage,
    elasticity: signalScores.elasticity,
  };
}

// ---------------------------------------------------------------------------
// Default confidence — used when L2 isn't available
// ---------------------------------------------------------------------------

export const DEFAULT_SIGNAL_CONFIDENCE: SignalConfidence = {
  structure: 'med' as SignalConfidenceLevel,
  hydration: 'med',
  inflammation: 'med',
  sunDamage: 'med',
  elasticity: 'med',
};
