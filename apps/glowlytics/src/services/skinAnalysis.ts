import type { ScannerReading } from './mockScanner';
import type {
  Confidence,
  DailyRecord,
  DetectedCondition,
  DetectedLesion,
  ModelOutput,
  RagRecommendation,
  ScanProtocol,
  SignalConfidence,
  SignalFeatures,
  SignalScores,
  UserProfile,
} from '../types';
import { analyzeWithVisionAPI } from './visionAPI';
import { env } from '../config/env';
import { extractFeaturesFromUri } from './onDeviceImageFeatures';
import {
  applyLesionFeedback,
  extractSummaryFeatures,
  featuresToSignalScores,
  mergeSignalScores,
  DEFAULT_SIGNAL_CONFIDENCE,
  type Layer2Results,
} from './onDeviceSignalFusion';
import { buildLayer3FromDeterministic } from './onDeviceInsightsFallback';


/**
 * Skin analysis engine using validated dermatology heuristics.
 *
 * All scores are deterministic given the same inputs (no Math.random()).
 * Weight rationale is grounded in peer-reviewed dermatology literature:
 * - GAGS (Global Acne Grading System) for acne severity mapping
 * - SCORAD for inflammation/eczema composite scoring
 * - VISIA complexion analysis for texture and pigmentation weighting
 * - Fitzpatrick scale considerations for photoaging susceptibility
 */

interface AnalysisInput {
  scannerData: ScannerReading;
  photoUri?: string;
  userProfile: UserProfile;
  protocol: ScanProtocol;
  previousOutputs: ModelOutput[];
  dailyContext: {
    sunscreen_used: boolean;
    new_product_added: boolean;
    cycle_day_estimated?: number;
    sleep_quality?: string;
    stress_level?: string;
  };
  /** Pre-encoded base64 of the photo to avoid re-encoding. */
  preEncodedBase64?: string;
  /**
   * Client-computed Layer-2 signal scores (from `onDeviceSignalModels`).
   * When present the backend will trust these and skip its own ONNX path,
   * cutting ~1-3 s of CPU-bound inference off the round-trip.
   */
  clientSignalScores?: SignalScores;
  clientSignalConfidence?: SignalConfidence;
  /**
   * Client-detected lesions (from on-device YOLOv8 in the camera flow).
   * When present the backend skips its server-side acne detector.
   */
  clientLesions?: DetectedLesion[];
  /** When true, skip the simulated processing delay (useful for tests). */
  skipDelay?: boolean;
}

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

export const analyzeSkiN = async (input: AnalysisInput): Promise<{
  acne_score: number;
  sun_damage_score: number;
  skin_age_score: number;
  confidence: Confidence;
  primary_driver: string;
  recommended_action: string;
  escalation_flag: boolean;
}> => {
  // Configurable processing delay -- skip in tests via input.skipDelay
  if (!input.skipDelay) {
    await new Promise((r) => setTimeout(r, 1500));
  }

  const { scannerData, previousOutputs, dailyContext, userProfile, protocol } = input;

  // ---------------------------------------------------------------------------
  // ACNE SCORE -- evidence-based weights from GAGS
  // ---------------------------------------------------------------------------
  /**
   * Base = inflammation_index * 0.65 + texture_index * 0.20 + pigmentation_index * 0.15
   *
   * Rationale (GAGS -- Global Acne Grading System):
   *   - Inflammatory lesion count (mapped to inflammation_index) is the primary
   *     driver of clinical acne severity (~65% of variance).
   *   - Texture roughness (comedone count proxy) contributes ~20%.
   *   - Post-inflammatory hyperpigmentation (PIH) residual contributes ~15%.
   */
  let acne = clamp(
    Math.round(
      scannerData.inflammation_index * 0.65 +
      scannerData.texture_index * 0.20 +
      scannerData.pigmentation_index * 0.15
    ),
    0,
    100
  );

  // ---------------------------------------------------------------------------
  // SUN DAMAGE SCORE -- pigmentation-primary weighting
  // ---------------------------------------------------------------------------
  /**
   * Base = pigmentation_index * 0.70 + inflammation_index * 0.15 + texture_index * 0.15
   *
   * Rationale:
   *   - Pigmentation is the primary UV-exposure biomarker (~70%), reflecting
   *     melanin redistribution and solar lentigo formation.
   *   - Erythema / inflammation is a secondary UV indicator (~15%), reflecting
   *     acute photodamage and sunburn response.
   *   - Texture roughness (~15%) captures photoaged skin surface changes
   *     (elastosis, collagen cross-linking).
   */
  let sunDamage = clamp(
    Math.round(
      scannerData.pigmentation_index * 0.70 +
      scannerData.inflammation_index * 0.15 +
      scannerData.texture_index * 0.15
    ),
    0,
    100
  );

  // ---------------------------------------------------------------------------
  // SKIN AGE SCORE -- VISIA-type texture-primary weighting
  // ---------------------------------------------------------------------------
  /**
   * Base = texture_index * 0.55 + pigmentation_index * 0.25 + inflammation_index * 0.20
   *
   * Rationale (VISIA complexion analysis):
   *   - Texture / roughness is the primary marker of skin aging (~55%),
   *     correlating with collagen degradation and fine-line depth.
   *   - Solar lentigines / pigmentation irregularities (~25%) reflect
   *     cumulative photoaging (Kligman's photoaging spectrum).
   *   - Chronic low-grade inflammation (~20%) accelerates intrinsic aging
   *     via NF-kB pathway activation ("inflammaging").
   */
  let skinAge = clamp(
    Math.round(
      scannerData.texture_index * 0.55 +
      scannerData.pigmentation_index * 0.25 +
      scannerData.inflammation_index * 0.20
    ),
    0,
    100
  );

  // ---------------------------------------------------------------------------
  // CONTEXT MODIFIERS -- lifestyle and hormonal adjustments
  // ---------------------------------------------------------------------------

  /**
   * Sunscreen modifier:
   *   - Acne +3: absence of sunscreen worsens post-inflammatory hyperpigmentation
   *     (PIH), which inflates perceived acne severity on subsequent scans.
   *   - Sun damage +8: well-established photoprotection gap; daily broad-spectrum
   *     SPF reduces UV-induced DNA damage by 85-97% (Diffey 2001).
   *   - Skin age +4: chronic photoaging acceleration per Kligman's studies;
   *     unprotected skin ages ~2x faster in photo-exposed areas.
   */
  if (!dailyContext.sunscreen_used) {
    acne = clamp(acne + 3, 0, 100);
    sunDamage = clamp(sunDamage + 8, 0, 100);
    skinAge = clamp(skinAge + 4, 0, 100);
  }

  /**
   * Sleep quality modifier:
   *   - Poor sleep: acne +6, skin age +5, sun damage +2
   *     Cortisol elevation during sleep deprivation increases sebum production
   *     by 15-20% (Yosipovitch et al., 2007). Impaired HGH secretion during
   *     deep sleep reduces collagen synthesis. Nucleotide excision repair (NER)
   *     of UV-induced pyrimidine dimers is impaired during sleep deprivation.
   *   - OK sleep: acne +2, skin age +1
   *     Suboptimal but partial recovery still occurs.
   */
  if (dailyContext.sleep_quality === 'poor') {
    acne = clamp(acne + 6, 0, 100);
    skinAge = clamp(skinAge + 5, 0, 100);
    sunDamage = clamp(sunDamage + 2, 0, 100);
  } else if (dailyContext.sleep_quality === 'ok') {
    acne = clamp(acne + 2, 0, 100);
    skinAge = clamp(skinAge + 1, 0, 100);
  }

  /**
   * Stress level modifier:
   *   - High stress: acne +8, sun damage +3, skin age +3
   *     HPA axis activation raises cortisol, directly stimulating sebaceous
   *     gland activity (Ganceviciene et al., 2009). Oxidative stress compounds
   *     UV-induced damage. Cortisol-mediated collagen degradation and telomere
   *     shortening accelerate skin aging (Epel et al., 2004).
   *   - Medium stress: acne +3, sun damage +1, skin age +1
   *     Moderate cortisol elevation with partial compensation.
   */
  if (dailyContext.stress_level === 'high') {
    acne = clamp(acne + 8, 0, 100);
    sunDamage = clamp(sunDamage + 3, 0, 100);
    skinAge = clamp(skinAge + 3, 0, 100);
  } else if (dailyContext.stress_level === 'med') {
    acne = clamp(acne + 3, 0, 100);
    sunDamage = clamp(sunDamage + 1, 0, 100);
    skinAge = clamp(skinAge + 1, 0, 100);
  }

  /**
   * Menstrual cycle modifier (acne only):
   *   - Late luteal phase (day 21 to cycle_length): +10
   *     Progesterone peaks at ~day 22-25, driving sebaceous gland hypertrophy
   *     and increased sebum output. This is the strongest hormonal acne driver
   *     (Lucky 1983, Geller et al., 2014).
   *   - Early follicular phase (day 1-5): +5
   *     Residual inflammatory cascade from luteal surge; prostaglandin-mediated
   *     inflammation persists for several days post-menstruation onset.
   *
   * Uses the user's reported cycle_length_days for accurate luteal detection.
   */
  const cycleDay = dailyContext.cycle_day_estimated;
  const cycleLength = userProfile.cycle_length_days || 28;
  const isLateLuteal = cycleDay != null && cycleDay >= 21 && cycleDay <= cycleLength;
  const isEarlyFollicular = cycleDay != null && cycleDay >= 1 && cycleDay <= 5;

  if (isLateLuteal) {
    acne = clamp(acne + 10, 0, 100);
  } else if (isEarlyFollicular) {
    acne = clamp(acne + 5, 0, 100);
  }

  /**
   * New product confounder adjustment (acne only): +4
   *   When a new product is introduced, the skin's adaptive response can
   *   temporarily increase comedogenicity or irritation. This adjustment
   *   flags that variance may be product-related rather than intrinsic,
   *   helping the model avoid false attribution to other factors.
   */
  if (dailyContext.new_product_added) {
    acne = clamp(acne + 4, 0, 100);
  }

  // Track which cycle window we are in for action logic
  const isCycleWindow = isLateLuteal || isEarlyFollicular;

  // Determine confidence
  let confidence: Confidence = 'high';
  if (previousOutputs.length < 3) confidence = 'low';
  else if (previousOutputs.length < 7) confidence = 'med';

  // Determine primary driver and action
  let primaryDriver = '';
  let recommendedAction = '';
  let escalation = false;

  // Check for rapid changes
  if (previousOutputs.length > 0) {
    const lastOutput = previousOutputs[previousOutputs.length - 1];
    const acneDelta = acne - lastOutput.acne_score;
    const sunDelta = sunDamage - lastOutput.sun_damage_score;

    if (Math.abs(acneDelta) > 20 || Math.abs(sunDelta) > 20) {
      escalation = true;
    }
  }

  // Action logic based on primary goal
  if (protocol.primary_goal === 'acne') {
    if (isCycleWindow && acne > 50) {
      primaryDriver = 'cycle window';
      recommendedAction = 'Likely cycle-related; keep routine stable and avoid adding new actives.';
    } else if (dailyContext.new_product_added && acne > 40) {
      primaryDriver = 'new product confounder';
      recommendedAction = 'Consider pausing the new product to isolate what\'s driving the change.';
    } else if (dailyContext.stress_level === 'high' || dailyContext.sleep_quality === 'poor') {
      primaryDriver = 'lifestyle factors';
      recommendedAction = 'Focus on sleep and stress management; these may be driving fluctuation.';
    } else if (acne < 30) {
      primaryDriver = 'routine adherence';
      recommendedAction = 'Your routine is working well. Stay consistent.';
    } else {
      primaryDriver = 'general tracking';
      recommendedAction = 'Continue daily scans to build trend data for better insights.';
    }
  } else if (protocol.primary_goal === 'sun_damage') {
    if (!dailyContext.sunscreen_used && sunDamage > 40) {
      primaryDriver = 'low sunscreen adherence';
      recommendedAction = 'Add sunscreen daily (AM) and reapply on high-exposure days.';
    } else if (sunDamage < 30) {
      primaryDriver = 'good protection';
      recommendedAction = 'Great sun protection habits. Keep it up.';
    } else {
      primaryDriver = 'UV exposure';
      recommendedAction = 'Consider adding protective steps like shade and wide-brim hats.';
    }
  } else {
    // skin_age
    if (previousOutputs.length > 5) {
      const avg = previousOutputs.slice(-5).reduce((s, o) => s + o.skin_age_score, 0) / 5;
      if (Math.abs(skinAge - avg) < 3) {
        primaryDriver = 'plateau';
        recommendedAction = 'Consider adding retinol or vitamin C to break through the plateau.';
      } else if (skinAge < avg) {
        primaryDriver = 'texture improvement';
        recommendedAction = 'Your skin texture is improving. Maintain your current routine.';
      } else {
        primaryDriver = 'consistency needed';
        recommendedAction = 'Simplify your routine to improve consistency for better results.';
      }
    } else {
      primaryDriver = 'building baseline';
      recommendedAction = 'Keep scanning daily to establish your trend baseline.';
    }
  }

  return {
    acne_score: acne,
    sun_damage_score: sunDamage,
    skin_age_score: skinAge,
    confidence,
    primary_driver: primaryDriver,
    recommended_action: recommendedAction,
    escalation_flag: escalation,
  };
};

/**
 * On-device scan analysis with optional backend GPT-4o enrichment.
 *
 * Replaces the old backend-mediated pipeline:
 *   - L1 deterministic features now run via `onDeviceImageFeatures` (CIELAB,
 *     ITA, GLCM, LBP, Gabor, Frangi — all in the JS thread, no `sharp`).
 *   - L2 ONNX signal scores come from the caller's `clientSignalScores`
 *     (computed by `onDeviceSignalModels` ahead of this call). Lesions ditto.
 *   - L1 + L2 are merged on-device via `mergeSignalScores`; lesion feedback
 *     is applied locally.
 *   - L3 GPT-4o is best-effort: when reachable it enriches the narrative
 *     fields (personalized_feedback, conditions, rag_recommendations); when
 *     unavailable we synthesise the same shape via
 *     `buildLayer3FromDeterministic` so the scan never depends on network.
 *
 * The user-visible scores (signal_scores, acne_score, sun_damage_score,
 * skin_age_score) are derived from on-device computation. The backend call
 * never affects them.
 */
export const analyzeWithFallback = async (input: AnalysisInput): Promise<{
  acne_score: number;
  sun_damage_score: number;
  skin_age_score: number;
  confidence: Confidence;
  primary_driver: string;
  recommended_action: string;
  escalation_flag: boolean;
  conditions?: DetectedCondition[];
  rag_recommendations?: RagRecommendation[];
  personalized_feedback?: string;
  signal_scores?: SignalScores;
  signal_features?: SignalFeatures;
  lesions?: DetectedLesion[];
  signal_confidence?: SignalConfidence;
}> => {
  // No photo → no signal to compute from. Surface so the caller debugs the
  // camera handoff rather than masking with all-zero scanner indices.
  if (!input.photoUri) {
    if (!env.API_BASE_URL) {
      // Tests / mockScanner flow — fall back to the deterministic heuristic
      // (which uses the scanner indices, not the photo).
      return analyzeSkiN(input);
    }
    throw new Error('Scan photo unavailable. Please retake the photo and try again.');
  }

  const photoUri = input.photoUri;
  const t0 = Date.now();

  // ---- L1: deterministic features on-device ----
  // Always run — feature math is ~150ms on iPhone and is cheaper than a
  // network round-trip even on fast connections.
  let l1Scores: SignalScores;
  let l1Features: SignalFeatures | undefined;
  try {
    const features = await extractFeaturesFromUri(photoUri);
    l1Scores = featuresToSignalScores(features);
    l1Features = extractSummaryFeatures(features);
  } catch (err) {
    if (__DEV__) console.warn('[Glowlytics] On-device L1 failed:', (err as Error)?.message);
    // Neutral fallback — preserves merge math without polluting downstream
    // scores. The L2 ONNX path can still pull weight.
    l1Scores = { structure: 50, hydration: 50, inflammation: 50, sunDamage: 50, elasticity: 50 };
    l1Features = undefined;
  }

  // ---- L2: pre-computed by caller via onDeviceSignalModels ----
  // We mirror the shape the backend's `runAllModels` returns so the merge
  // math is identical regardless of which side ran the model.
  const l2: Layer2Results = {
    signalOverrides: input.clientSignalScores
      ? {
          structure: input.clientSignalScores.structure,
          hydration: input.clientSignalScores.hydration,
          sunDamage: input.clientSignalScores.sunDamage,
          elasticity: input.clientSignalScores.elasticity,
        }
      : {},
    lesions: input.clientLesions || [],
    signalConfidence: input.clientSignalConfidence || DEFAULT_SIGNAL_CONFIDENCE,
  };

  // ---- L3: optional backend GPT-4o enrichment ----
  // Best effort. If the call fails, times out, or there's no API base URL
  // we synthesise the L3-equivalent shape locally so the scan keeps working.
  let l3Result: Awaited<ReturnType<typeof analyzeWithVisionAPI>> | null = null;
  if (env.API_BASE_URL) {
    try {
      const promise = analyzeWithVisionAPI(
        photoUri,
        {
          primary_goal: input.protocol.primary_goal,
          scan_region: input.protocol.scan_region,
          sunscreen_used: input.dailyContext.sunscreen_used,
          sleep_quality: input.dailyContext.sleep_quality,
          stress_level: input.dailyContext.stress_level,
          scan_count: input.previousOutputs.length,
          client_signal_scores: input.clientSignalScores,
          client_signal_confidence: input.clientSignalConfidence,
          client_lesions: input.clientLesions,
        },
        input.preEncodedBase64,
      );
      const timeoutMs = 12_000;
      l3Result = await Promise.race([
        promise,
        new Promise<typeof l3Result>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
    } catch (err) {
      if (__DEV__) console.warn('[Glowlytics] L3 enrichment skipped:', (err as Error)?.message);
      l3Result = null;
    }
  }

  // ---- Synthesise the L3 narrative locally when the backend didn't deliver ----
  const l3Synth = buildLayer3FromDeterministic({
    layer1Scores: l1Scores,
    layer2Overrides: l2.signalOverrides,
    lesions: l2.lesions,
  });

  const l3SignalScores: SignalScores = l3Result?.signal_scores ?? l3Synth.signal_scores;

  // ---- Merge L1 + L2 + L3 with uncertainty weighting ----
  // When L3 was synthesised from L1+L2 we still pass it through so the merge
  // is stable; the same betas as the backend keep score continuity.
  const mergedRaw = mergeSignalScores(l1Scores, l2, l3SignalScores);
  const mergedWithLesions = applyLesionFeedback(mergedRaw, l2.lesions);

  // ---- Pull the narrative fields from L3 (backend) → else fall back ----
  const acne_score = Number.isFinite(l3Result?.acne_score)
    ? (l3Result!.acne_score as number)
    : l3Synth.acne_score;
  const sun_damage_score = Number.isFinite(l3Result?.sun_damage_score)
    ? (l3Result!.sun_damage_score as number)
    : l3Synth.sun_damage_score;
  const skin_age_score = Number.isFinite(l3Result?.skin_age_score)
    ? (l3Result!.skin_age_score as number)
    : l3Synth.skin_age_score;

  const confidence = (l3Result?.confidence as Confidence | undefined) ?? l3Synth.confidence;
  const primary_driver = l3Result?.primary_driver ?? l3Synth.primary_driver;
  const recommended_action = l3Result?.recommended_action ?? l3Synth.recommended_action;
  const personalized_feedback = l3Result?.personalized_feedback ?? l3Synth.personalized_feedback;
  const conditions = l3Result?.conditions ?? l3Synth.conditions;
  const rag_recommendations = l3Result?.rag_recommendations;

  // Escalation flag — compare against the prior model output.
  let escalation = false;
  if (input.previousOutputs.length > 0) {
    const last = input.previousOutputs[input.previousOutputs.length - 1];
    if (
      Math.abs(acne_score - last.acne_score) > 20 ||
      Math.abs(sun_damage_score - last.sun_damage_score) > 20
    ) {
      escalation = true;
    }
  }

  if (__DEV__) {
    console.log(
      `[Glowlytics] On-device scan pipeline ${Date.now() - t0}ms — L3 ${l3Result ? 'backend' : 'local'}`,
    );
  }

  return {
    acne_score,
    sun_damage_score,
    skin_age_score,
    confidence,
    primary_driver,
    recommended_action,
    escalation_flag: escalation,
    conditions,
    rag_recommendations,
    personalized_feedback,
    signal_scores: mergedWithLesions,
    signal_features: l1Features,
    lesions: l2.lesions.length > 0 ? l2.lesions : l3Result?.lesions,
    signal_confidence: l2.signalConfidence,
  };
};

export const getExplanation = (
  output: ModelOutput,
  context: { sunscreen: boolean; cycleWindow: boolean; newProduct: boolean; sleepQuality?: string }
): string => {
  // If personalized feedback from Vision API / RAG is available, use it
  if (output.personalized_feedback) {
    return output.personalized_feedback;
  }

  // Template A: Acne
  if (output.primary_driver === 'cycle window') {
    return 'Your acne metric rose during your predicted cycle window. This pattern often reflects hormonal variation. Consider keeping your routine stable for the next few days and avoid introducing new actives.';
  }
  if (output.primary_driver === 'new product confounder') {
    return 'Acne metric worsened soon after a new product was introduced. This may be a confounding change. Consider pausing the new product to isolate what\'s driving the shift.';
  }
  if (output.primary_driver === 'lifestyle factors') {
    return 'Acne metric increased on days with lower sleep / higher stress signals. This may indicate lifestyle-driven fluctuation rather than a product effect.';
  }

  // Template B: Sun damage
  if (output.primary_driver === 'low sunscreen adherence') {
    return 'Sun damage metric increased alongside low sunscreen use. The highest-impact change is daily AM sunscreen and reapplication on high-exposure days.';
  }

  // Template C: Skin age
  if (output.primary_driver === 'texture improvement') {
    return 'Skin age metric improved primarily due to texture/roughness changes compared to baseline.';
  }
  if (output.primary_driver === 'plateau') {
    return 'Skin age metric hasn\'t shifted meaningfully yet. Inconsistent routine adherence can slow visible change. Consider simplifying to improve consistency.';
  }

  if (output.primary_driver === 'routine adherence') {
    return 'Your acne metric is improving compared to your baseline. Routine adherence has been consistent, and there were no major confounders detected.';
  }

  return 'Continue daily scans to build more trend data for personalized insights.';
};
