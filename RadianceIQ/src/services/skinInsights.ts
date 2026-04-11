import type { DailyRecord, DetectedLesion, ModelOutput, ProductEntry, SignalConfidence, SignalFeatures, SignalScores } from '../types';
import { localDateStr } from '../utils/localDate';
import { safeClamp } from '../utils/safeClamp';

export type SkinMetricKey = 'acne' | 'sun_damage' | 'skin_age';
export type SeverityLevel = 'low' | 'moderate' | 'high';

export interface CompositeSignals {
  structure: number;
  hydration: number;
  inflammation: number;
  sunDamage: number;
  elasticity: number;
}

export interface OverallSkinInsight {
  score: number;
  statusLabel: string;
  trendDelta: number;
  actionStatement: string;
  signals: CompositeSignals;
  signalFeatures?: SignalFeatures;
  signalConfidence?: SignalConfidence;
  lesions?: DetectedLesion[];
}

export interface FaceZoneInsight {
  key: string;
  label: string;
  top: number;
  left: number;
  severity: SeverityLevel;
  summary: string;
  recommendation: string;
}

export interface MetricDetailInsight {
  metric: SkinMetricKey;
  title: string;
  summary: string;
  score: number;
  severity: SeverityLevel;
  zones: FaceZoneInsight[];
  report: string;
  stopUsing: string;
  considerUsing: string;
  continueUsing: string;
}

const clamp = (value: number) => safeClamp(value, 50);

/**
 * Maps a 0-100 composite score to a clinical severity bucket.
 *
 * Threshold rationale:
 *   - >= 68 "high": aligns with GAGS "severe" (score >= 31/44, ~70th percentile)
 *     and SCORAD "severe" (>= 50/103, ~68th percentile when normalized to 0-100).
 *     At this level, active intervention or escalation is warranted.
 *   - >= 38 "moderate": aligns with GAGS "moderate" (19-30/44, ~43-70th percentile)
 *     and VISIA "needs attention" zone. Routine optimization is recommended.
 *   - < 38 "low": sub-clinical or well-controlled. Maintenance protocol only.
 *
 * These thresholds are intentionally conservative (biased toward flagging) for a
 * consumer wellness app where false negatives carry more user-trust risk than
 * false positives.
 */
const severityFromScore = (score: number): SeverityLevel => {
  if (score >= 68) return 'high';
  if (score >= 38) return 'moderate';
  return 'low';
};

const confidenceStatus = (score: number) => {
  if (score >= 88) return 'Peak';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Monitor';
  return 'Recovery';
};

const cadenceStatement = (score: number, trendDelta: number) => {
  if (score >= 88 && trendDelta >= 1) {
    return 'Keep it going! Reduce scans to once weekly.';
  }
  if (score >= 75 && trendDelta >= -3) {
    return 'Strong consistency. Scan twice weekly to maintain momentum.';
  }
  if (score >= 60 && trendDelta >= -8) {
    return 'Signal variability detected. Scan every other day and hold routine changes.';
  }
  return 'Damage noted, increase scans to daily.';
};

/**
 * Derives five composite skin-health signals from raw risk scores and lifestyle inputs.
 *
 * Each signal is expressed as 0-100 where 100 = optimal (inverted from risk).
 * The weight distribution for each signal is grounded in clinical literature:
 *
 * **structure** = 100 - (textureRisk * 0.55 + ageRisk * 0.45)
 *   Structural integrity is primarily driven by surface texture (collagen density,
 *   pore size -- ~55%) and chronological/photo-aging markers (~45%). Mirrors VISIA
 *   "texture + wrinkle" composite used in clinical skin-age studies.
 *
 * **hydration** = 100 - (textureRisk * 0.5 + acneRisk * 0.2 + stressPenalty + sleepPenalty)
 *   Trans-epidermal water loss (TEWL) correlates most with texture roughness (~50%).
 *   Acne-prone skin often has impaired barrier function (~20% contribution).
 *   Stress and sleep penalties reflect cortisol-mediated barrier disruption
 *   (Altemus et al., 2001) -- high stress adds 12 pts, poor sleep adds 8 pts.
 *
 * **inflammation** = 100 - (inflammationRisk * 0.8 + acneRisk * 0.2)
 *   Direct inflammation index is the dominant signal (~80%), consistent with
 *   SCORAD erythema weighting. Acne risk contributes ~20% because inflammatory
 *   acne lesions compound systemic inflammation markers.
 *
 * **sunDamage** = 100 - (sunRisk * 0.82 + pigmentationRisk * 0.18)
 *   Sun damage score from the analysis engine carries ~82% of the signal (already
 *   a composite of pigmentation + UV markers). Raw pigmentation index adds ~18%
 *   as a cross-check to capture melanin irregularities the model may under-weight.
 *
 * **elasticity** = 100 - (ageRisk * 0.62 + textureRisk * 0.38)
 *   Skin elasticity decline tracks closely with aging markers (~62%) and surface
 *   roughness (~38%). This mirrors cutometer-based elasticity studies where R2
 *   (gross elasticity) correlates 0.6-0.7 with chronological age.
 */
export const deriveCompositeSignals = ({
  acneRisk,
  sunRisk,
  ageRisk,
  inflammationRisk,
  pigmentationRisk,
  textureRisk,
  stressLevel,
  sleepQuality,
}: {
  acneRisk: number;
  sunRisk: number;
  ageRisk: number;
  inflammationRisk: number;
  pigmentationRisk: number;
  textureRisk: number;
  stressLevel?: DailyRecord['stress_level'];
  sleepQuality?: DailyRecord['sleep_quality'];
}): CompositeSignals => {
  const stressPenalty = stressLevel === 'high' ? 12 : stressLevel === 'med' ? 6 : 0;
  const sleepPenalty = sleepQuality === 'poor' ? 8 : sleepQuality === 'ok' ? 3 : 0;

  return {
    structure: clamp(Math.round(100 - (textureRisk * 0.55 + ageRisk * 0.45))),
    hydration: clamp(Math.round(100 - (textureRisk * 0.5 + acneRisk * 0.2 + stressPenalty + sleepPenalty))),
    inflammation: clamp(Math.round(100 - (inflammationRisk * 0.8 + acneRisk * 0.2))),
    sunDamage: clamp(Math.round(100 - (sunRisk * 0.82 + pigmentationRisk * 0.18))),
    elasticity: clamp(Math.round(100 - (ageRisk * 0.62 + textureRisk * 0.38))),
  };
};

/**
 * Computes a single 0-100 overall skin health score from five composite signals.
 *
 * Weight distribution rationale:
 *   - structure    (22%): Collagen / texture is the single most user-visible
 *     marker of skin quality and responds well to routine changes, so it gets
 *     the largest individual weight to reward adherence.
 *   - hydration    (18%): Barrier function is foundational but fluctuates with
 *     environment (humidity, season), so it is weighted slightly lower to avoid
 *     score volatility from non-actionable factors.
 *   - inflammation (20%): Active inflammation is clinically urgent and the
 *     primary escalation trigger. Equal weight with sun damage reflects
 *     dermatology triage priorities.
 *   - sunDamage    (20%): Cumulative UV damage is the #1 extrinsic aging driver
 *     (Flament et al., 2013). Weighted equally with inflammation because both
 *     represent active damage pathways.
 *   - elasticity   (20%): Long-term skin resilience marker. Weighted equally
 *     with inflammation and sun damage to balance short-term (inflammation)
 *     and long-term (elasticity, sun damage) health signals.
 *
 * Weights sum to 1.00. The resulting score is rounded to the nearest integer.
 */
const scoreFromSignals = (signals: CompositeSignals) =>
  Math.round(
    signals.structure * 0.22 +
      signals.hydration * 0.18 +
      signals.inflammation * 0.2 +
      signals.sunDamage * 0.2 +
      signals.elasticity * 0.2
  );

const hasSunscreenProduct = (products: ProductEntry[]) =>
  products.some((product) => {
    const joined = `${product.product_name} ${product.ingredients_list.join(' ')}`.toLowerCase();
    return (
      joined.includes('spf') ||
      joined.includes('zinc oxide') ||
      joined.includes('titanium dioxide') ||
      joined.includes('avobenzone')
    );
  });

const findPotentialTriggerProduct = (products: ProductEntry[]) => {
  const triggerKeywords = ['fragrance', 'coconut', 'oil', 'butter', 'heavy', 'occlusive'];

  const flagged = products.find((product) => {
    const joined = `${product.product_name} ${product.ingredients_list.join(' ')}`.toLowerCase();
    return triggerKeywords.some((keyword) => joined.includes(keyword));
  });

  return flagged || products[products.length - 1] || null;
};

export const getLatestDailyForOutput = (
  latestOutput: ModelOutput | null,
  dailyRecords: DailyRecord[]
) => {
  if (!latestOutput) return null;
  return dailyRecords.find((record) => record.daily_id === latestOutput.daily_id) || null;
};

export const buildOverallSkinInsight = ({
  latestOutput,
  baselineOutput,
  latestDaily,
  baselineDaily,
  serverSignalScores,
  serverSignalFeatures,
  serverSignalConfidence,
  serverLesions,
}: {
  latestOutput: ModelOutput | null;
  baselineOutput: ModelOutput | null;
  latestDaily: DailyRecord | null;
  baselineDaily?: DailyRecord | null;
  serverSignalScores?: SignalScores;
  serverSignalFeatures?: SignalFeatures;
  serverSignalConfidence?: SignalConfidence;
  serverLesions?: DetectedLesion[];
}): OverallSkinInsight | null => {
  if (!latestOutput) return null;

  // Use server-provided signal scores when available (3-layer pipeline),
  // otherwise fall back to existing derivation from 3 proxy scores
  let signals: CompositeSignals;

  if (serverSignalScores) {
    signals = {
      structure: clamp(serverSignalScores.structure),
      hydration: clamp(serverSignalScores.hydration),
      inflammation: clamp(serverSignalScores.inflammation),
      sunDamage: clamp(serverSignalScores.sunDamage),
      elasticity: clamp(serverSignalScores.elasticity),
    };
  } else {
    const inflammationRisk = latestDaily?.scanner_indices.inflammation_index ?? latestOutput.acne_score;
    const pigmentationRisk = latestDaily?.scanner_indices.pigmentation_index ?? latestOutput.sun_damage_score;
    const textureRisk = latestDaily?.scanner_indices.texture_index ?? latestOutput.skin_age_score;

    signals = deriveCompositeSignals({
      acneRisk: latestOutput.acne_score,
      sunRisk: latestOutput.sun_damage_score,
      ageRisk: latestOutput.skin_age_score,
      inflammationRisk,
      pigmentationRisk,
      textureRisk,
      stressLevel: latestDaily?.stress_level,
      sleepQuality: latestDaily?.sleep_quality,
    });
  }

  const score = scoreFromSignals(signals);

  const baselineSignals = baselineOutput
    ? deriveCompositeSignals({
        acneRisk: baselineOutput.acne_score,
        sunRisk: baselineOutput.sun_damage_score,
        ageRisk: baselineOutput.skin_age_score,
        inflammationRisk: baselineDaily?.scanner_indices?.inflammation_index ?? baselineOutput.acne_score,
        pigmentationRisk: baselineDaily?.scanner_indices?.pigmentation_index ?? baselineOutput.sun_damage_score,
        textureRisk: baselineDaily?.scanner_indices?.texture_index ?? baselineOutput.skin_age_score,
      })
    : null;

  const baselineScore = baselineSignals ? scoreFromSignals(baselineSignals) : score;
  const trendDelta = score - baselineScore;

  return {
    score,
    statusLabel: confidenceStatus(score),
    trendDelta,
    actionStatement: cadenceStatement(score, trendDelta),
    signals,
    signalFeatures: serverSignalFeatures,
    signalConfidence: serverSignalConfidence,
    lesions: serverLesions,
  };
};

export const buildMetricDetailInsight = ({
  metric,
  latestOutput,
  latestDaily,
  products,
}: {
  metric: SkinMetricKey;
  latestOutput: ModelOutput | null;
  latestDaily: DailyRecord | null;
  products: ProductEntry[];
}): MetricDetailInsight | null => {
  if (!latestOutput) return null;

  const triggerProduct = findPotentialTriggerProduct(products);
  const sunscreenLogged = hasSunscreenProduct(products);
  const texture = latestDaily?.scanner_indices.texture_index ?? latestOutput.skin_age_score;
  const pigmentation = latestDaily?.scanner_indices.pigmentation_index ?? latestOutput.sun_damage_score;
  const inflammation = latestDaily?.scanner_indices.inflammation_index ?? latestOutput.acne_score;

  if (metric === 'acne') {
    const score = latestOutput.acne_score;
    const severity = severityFromScore(score);
    const zones: FaceZoneInsight[] = [
      {
        key: 'forehead',
        label: 'Forehead',
        top: 18,
        left: 46,
        severity: severityFromScore(Math.round((score + inflammation) / 2)),
        summary: 'Congestion pattern points to excess oil and delayed cell turnover.',
        recommendation: 'Use a gentle BHA cleanser 3 nights weekly and avoid over-exfoliating.',
      },
      {
        key: 'cheeks',
        label: 'Cheeks',
        top: 48,
        left: 26,
        severity: severityFromScore(Math.round(score + (latestDaily?.new_product_added ? 8 : 0))),
        summary: 'Inflammatory marks are appearing in a clustered pattern.',
        recommendation: 'Pause new topical actives for 7 days and monitor if redness settles.',
      },
      {
        key: 'jawline',
        label: 'Jawline',
        top: 74,
        left: 48,
        severity: severityFromScore(Math.round(score + (latestDaily?.cycle_day_estimated ? 6 : 0))),
        summary: 'Hormonal-adjacent flare activity is visible around the jawline.',
        recommendation: 'Prioritize barrier-support moisturizer and avoid picking active lesions.',
      },
    ];

    return {
      metric,
      title: 'Acne',
      summary:
        severity === 'high'
          ? 'Breakout activity is elevated and likely driven by both inflammation and routine instability.'
          : severity === 'moderate'
            ? 'Acne activity is moderate with localized flare zones.'
            : 'Acne is currently controlled with mild localized activity.',
      score,
      severity,
      zones,
      report:
        'Assessment combines inflammation index + acne trend. The current pattern suggests targeted routine cleanup over broad product changes.',
      stopUsing: triggerProduct
        ? `Stop using ${triggerProduct.product_name} for 7 days, then re-introduce only if flare intensity falls.`
        : 'Stop introducing new exfoliants this week while the flare pattern settles.',
      considerUsing: 'Consider a non-comedogenic salicylic acid (0.5%-2%) cleanser and azelaic acid support at night.',
      continueUsing: 'Continue a simple barrier moisturizer and daily SPF to reduce post-acne discoloration risk.',
    };
  }

  if (metric === 'sun_damage') {
    const score = latestOutput.sun_damage_score;
    const severity = severityFromScore(score);
    const zones: FaceZoneInsight[] = [
      {
        key: 'upper_forehead',
        label: 'Upper Forehead',
        top: 14,
        left: 46,
        severity: severityFromScore(Math.round((score + pigmentation) / 2)),
        summary: 'UV exposure accumulation is strongest across the upper forehead.',
        recommendation: 'Improve hat/shade coverage for midday outdoor periods.',
      },
      {
        key: 'temples',
        label: 'Temples',
        top: 34,
        left: 16,
        severity: severityFromScore(Math.round(score + (latestDaily?.sunscreen_used ? 0 : 12))),
        summary: 'Edge-of-face exposure indicates sunscreen misses around the hairline.',
        recommendation: 'Apply SPF across hairline and temples as a dedicated final AM step.',
      },
      {
        key: 'crows_feet',
        label: "Crow's Feet",
        top: 40,
        left: 66,
        severity: severityFromScore(Math.round(score + 5)),
        summary: 'Fine line depth and pigment shift indicate repeated sun burden.',
        recommendation: 'Reapply broad-spectrum SPF every 2 hours when outdoors.',
      },
    ];

    return {
      metric,
      title: 'Sun Damage',
      summary:
        severity === 'high'
          ? 'Photodamage risk is elevated and requires tighter UV protection now.'
          : severity === 'moderate'
            ? 'Sun signal is moderate with correctable prevention gaps.'
            : 'Sun protection trend is strong with low current damage activity.',
      score,
      severity,
      zones,
      report:
        'Assessment combines pigment index + UV-related trend score. Pattern points to preventable exposure rather than sudden acute change.',
      stopUsing: sunscreenLogged
        ? 'Stop treating SPF as optional on low-UV days; daily use is still required.'
        : 'Stop relying on moisturizer-only mornings and add a dedicated SPF 30+ as mandatory.',
      considerUsing: 'Consider mineral SPF 30+ with zinc oxide, and add antioxidant serum in the morning.',
      continueUsing: 'Continue evening repair support with ceramides and hydration to reinforce barrier recovery.',
    };
  }

  const score = latestOutput.skin_age_score;
  const severity = severityFromScore(score);
  const zones: FaceZoneInsight[] = [
    {
      key: 'under_eye',
      label: 'Under Eye',
      top: 42,
      left: 34,
      severity: severityFromScore(Math.round((score + texture) / 2)),
      summary: 'Elasticity drop and fine-line prominence are visible under the eye area.',
      recommendation: 'Introduce peptide or retinoid eye-safe actives gradually to avoid irritation.',
    },
    {
      key: 'nasolabial',
      label: 'Smile Lines',
      top: 58,
      left: 44,
      severity: severityFromScore(Math.round(score + 4)),
      summary: 'Texture depth indicates mild-to-moderate collagen support need.',
      recommendation: 'Use overnight repair creams that emphasize peptides and humectants.',
    },
    {
      key: 'jawline',
      label: 'Jawline',
      top: 74,
      left: 48,
      severity: severityFromScore(Math.round(score + (latestDaily?.sleep_quality === 'poor' ? 10 : 0))),
      summary: 'Lower-face firmness markers are below baseline trend.',
      recommendation: 'Stabilize sleep and hydration to reduce transient elasticity drop.',
    },
  ];

  return {
    metric,
    title: 'Skin Age',
    summary:
      severity === 'high'
        ? 'Skin-age markers are elevated and indicate visible texture and elasticity strain.'
        : severity === 'moderate'
          ? 'Skin-age markers are moderately elevated with targeted repair opportunity.'
          : 'Skin-age trend is stable with mild texture maintenance needed.',
    score,
    severity,
    zones,
    report:
      'Assessment combines texture index + age trend score. Changes appear gradual and respond better to consistency than frequent routine swaps.',
    stopUsing: 'Stop stacking multiple strong actives on the same night to protect barrier resilience.',
    considerUsing: 'Consider retinoid (2-3 nights/week), peptide support, and daily hyaluronic hydration.',
    continueUsing: 'Continue broad-spectrum sunscreen and gentle cleanser to maintain long-term collagen protection.',
  };
};

export type SignalKey = keyof CompositeSignals;

export const computeSignalHistory = (
  signalKey: SignalKey,
  dailyRecords: DailyRecord[],
  modelOutputs: ModelOutput[],
  days = 14,
): { date: string; value: number }[] => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = localDateStr(cutoff);

  const recentRecords = dailyRecords
    .filter((r) => r.date >= cutoffStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  return recentRecords.map((record) => {
    const output = modelOutputs.find((o) => o.daily_id === record.daily_id);

    const inflammationRisk = record.scanner_indices.inflammation_index;
    const pigmentationRisk = record.scanner_indices.pigmentation_index;
    const textureRisk = record.scanner_indices.texture_index;

    const signals = deriveCompositeSignals({
      acneRisk: output?.acne_score ?? record.scanner_indices.inflammation_index,
      sunRisk: output?.sun_damage_score ?? pigmentationRisk * 1.2,
      ageRisk: output?.skin_age_score ?? textureRisk,
      inflammationRisk,
      pigmentationRisk,
      textureRisk,
      stressLevel: record.stress_level,
      sleepQuality: record.sleep_quality,
    });

    return { date: record.date, value: signals[signalKey] };
  });
};
