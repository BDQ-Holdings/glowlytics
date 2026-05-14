/**
 * No-LLM fallback — derives the missing Layer-3 (GPT-4o) and insight-stream
 * fields from Layer 1 + Layer 2 results alone.
 *
 * Used when:
 *   - OPENAI_DISABLED=true is set (deterministic-only mode)
 *   - OPENAI_API_KEY is missing
 *   - OpenAI returns a non-retryable error (429 quota, 401 invalid key)
 *
 * The shape produced matches the GPT-4o response schema exactly so the rest
 * of /api/vision/analyze + the /api/vision/generate-insights stream don't
 * need any branching beyond their entry points.
 */

const SIGNAL_KEYS = ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'];

const SIGNAL_LABELS = {
  structure: 'Structure',
  hydration: 'Hydration',
  inflammation: 'Inflammation',
  sunDamage: 'Sun Damage',
  elasticity: 'Elasticity',
};

const SIGNAL_DRIVERS = {
  structure: 'texture and pore visibility',
  hydration: 'moisture and barrier function',
  inflammation: 'redness and breakouts',
  sunDamage: 'pigmentation and UV exposure',
  elasticity: 'firmness and fine lines',
};

const SIGNAL_ACTIONS = {
  structure: 'Use a gentle exfoliant 2–3× weekly and keep your barrier strong with ceramides.',
  hydration: 'Layer a humectant serum (hyaluronic acid, glycerin) under your moisturiser morning and night.',
  inflammation: 'Reduce active treatments for 48 hours and add a fragrance-free soothing serum (niacinamide, centella).',
  sunDamage: 'Apply broad-spectrum SPF 30+ daily and consider adding vitamin C in the morning.',
  elasticity: 'Continue retinoid use at tolerance and prioritise sleep + protein intake.',
};

function clamp(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50;
}

/** True when the LLM path is intentionally disabled or unavailable. */
function isLLMDisabled() {
  if (process.env.OPENAI_DISABLED === 'true' || process.env.OPENAI_DISABLED === '1') return true;
  const key = (process.env.OPENAI_API_KEY || '').replace(/\s+/g, '');
  return key.length === 0;
}

/** A vision-error code from the OpenAI SDK that indicates "don't retry, fall back". */
function isFatalOpenAIError(err) {
  if (!err) return false;
  const status = err.status || err.statusCode;
  if (status === 429 || status === 401 || status === 403) return true;
  if (err.code === 'invalid_api_key') return true;
  if (err.code === 'insufficient_quota') return true;
  return false;
}

/**
 * Derive a Layer-3-equivalent payload from Layer 1 + Layer 2 results.
 *
 * Returns the same shape /api/vision/analyze parses out of the GPT response,
 * minus per-zone narrative (those would need the actual image semantics).
 */
function buildLayer3FromDeterministic({ layer1Scores, layer2Results }) {
  // Merge L1 + L2 to get our best per-signal estimate (Layer 3 just gets
  // those same numbers — the merge later in app.js still respects per-layer
  // betas, but with our l3=l1+l2 estimate the merge is stable.)
  const overrides = layer2Results?.signalOverrides || {};
  const signal_scores = {};
  for (const k of SIGNAL_KEYS) {
    const l1 = Number.isFinite(layer1Scores?.[k]) ? layer1Scores[k] : 50;
    const l2 = Number.isFinite(overrides[k]) ? overrides[k] : null;
    signal_scores[k] = clamp(l2 != null ? (l1 + l2) / 2 : l1);
  }

  // Legacy scalar scores (severity 0–100, inverse of signals)
  const acne_score      = clamp(100 - signal_scores.inflammation);
  const sun_damage_score = clamp(100 - signal_scores.sunDamage);
  const skin_age_score  = clamp(100 - (signal_scores.structure + signal_scores.elasticity) / 2);

  // Pick the weakest signal as the primary driver — useful for routing in the UI
  const ranked = Object.entries(signal_scores).sort((a, b) => a[1] - b[1]);
  const weakest = ranked[0]?.[0] || 'structure';
  const primary_driver = SIGNAL_DRIVERS[weakest] || 'general skin health';

  // Recommended action — template from weakest signal
  const recommended_action = SIGNAL_ACTIONS[weakest] || 'Continue daily scans for more data.';

  // Personalised feedback — 2–3 deterministic sentences anchored on the scores
  const strongest = ranked[ranked.length - 1]?.[0] || 'structure';
  const personalized_feedback = [
    `Your ${SIGNAL_LABELS[strongest].toLowerCase()} is your strongest signal (${signal_scores[strongest]}/100).`,
    `${SIGNAL_LABELS[weakest]} is your most actionable area at ${signal_scores[weakest]}/100.`,
    SIGNAL_ACTIONS[weakest],
  ].join(' ');

  // Per-zone summary derived from detected lesions — we know WHERE the issues
  // are even without GPT-4o because the YOLO detector already mapped lesions
  // to zones.
  const lesionByZone = {};
  for (const lesion of layer2Results?.lesions || []) {
    if (lesion.tier !== 'confirmed') continue;
    lesionByZone[lesion.zone] = (lesionByZone[lesion.zone] || 0) + 1;
  }
  const zone_severity = {};
  for (const zone of ['forehead', 'left_cheek', 'right_cheek', 'nose', 'chin', 'jaw']) {
    const count = lesionByZone[zone] || 0;
    zone_severity[zone] = {
      dominant_signal: count > 0 ? 'inflammation' : 'structure',
      severity: clamp(count > 0 ? 30 + count * 15 : 100 - signal_scores.structure),
    };
  }

  // Detected conditions — we synthesise minimal entries from lesion zones so
  // the FacialMesh / 3D viewer overlay still has something to render.
  const conditions = [];
  if (Object.values(lesionByZone).some((c) => c > 0)) {
    const zones = Object.entries(lesionByZone)
      .filter(([, c]) => c > 0)
      .map(([region, c]) => ({ region, severity: c >= 3 ? 'severe' : c >= 2 ? 'moderate' : 'mild' }));
    conditions.push({
      name: 'acne',
      severity: zones.some((z) => z.severity === 'severe') ? 'severe' : zones.some((z) => z.severity === 'moderate') ? 'moderate' : 'mild',
      zones,
      description: `Detected ${Object.values(lesionByZone).reduce((a, b) => a + b, 0)} lesion${Object.values(lesionByZone).reduce((a, b) => a + b, 0) !== 1 ? 's' : ''} via on-device detection.`,
    });
  }

  return {
    signal_scores,
    acne_score,
    sun_damage_score,
    skin_age_score,
    confidence: 'med',  // we don't have GPT's confidence; med is honest
    primary_driver,
    recommended_action,
    personalized_feedback,
    zone_severity,
    conditions,
  };
}

/**
 * Generate the same `generated_insights` structure that the streamed GPT
 * response would produce. Returned synchronously — the caller emits this as
 * a single SSE chunk + DONE marker.
 */
function buildInsightsFromDeterministic({ signal_scores, lesions, conditions, scan_count }) {
  const safeScores = {};
  for (const k of SIGNAL_KEYS) safeScores[k] = clamp(signal_scores?.[k]);

  const ranked = Object.entries(safeScores).sort((a, b) => a[1] - b[1]);
  const weakest = ranked[0][0];
  const secondWeakest = ranked[1][0];
  const strongest = ranked[ranked.length - 1][0];

  const overall = Math.round(Object.values(safeScores).reduce((a, b) => a + b, 0) / SIGNAL_KEYS.length);

  const lesionCount = Array.isArray(lesions) ? lesions.filter((l) => l.tier === 'confirmed').length : 0;
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
    scan_count <= 1
      ? 'This is your baseline. Future scans will show how each signal moves over time.'
      : `Your composite is ${overall < 60 ? 'in the watch range' : overall < 75 ? 'stable' : 'strong'} — focus on ${SIGNAL_LABELS[weakest].toLowerCase()} for the biggest near-term gain.`;

  const signal_insights = {};
  for (const k of SIGNAL_KEYS) {
    signal_insights[k] = {
      status: `${SIGNAL_LABELS[k]} scored ${safeScores[k]}/100.`,
      driver: SIGNAL_DRIVERS[k],
      action: SIGNAL_ACTIONS[k],
    };
  }

  const zone_findings = [];
  const lesionByZone = {};
  for (const l of lesions || []) {
    if (l.tier !== 'confirmed') continue;
    lesionByZone[l.zone] = (lesionByZone[l.zone] || 0) + 1;
  }
  for (const [zone, count] of Object.entries(lesionByZone)) {
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
      `Priority 1: Address ${SIGNAL_LABELS[weakest].toLowerCase()} — ${SIGNAL_ACTIONS[weakest]}`,
      `Priority 2: Support ${SIGNAL_LABELS[secondWeakest].toLowerCase()} — ${SIGNAL_ACTIONS[secondWeakest]}`,
      'Priority 3: Daily broad-spectrum SPF 30+ and 7–9 hours of sleep.',
    ],
  };
}

module.exports = {
  isLLMDisabled,
  isFatalOpenAIError,
  buildLayer3FromDeterministic,
  buildInsightsFromDeterministic,
  SIGNAL_KEYS,
  SIGNAL_LABELS,
};
