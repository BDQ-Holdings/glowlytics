/**
 * No-LLM fallback — tests for the deterministic alternatives to the L3
 * (GPT-4o) and insight-stream paths.
 */

process.env.NODE_ENV = 'development';

const {
  isLLMDisabled,
  isFatalOpenAIError,
  buildLayer3FromDeterministic,
  buildInsightsFromDeterministic,
  SIGNAL_KEYS,
} = require('../no-llm-fallback');

describe('isLLMDisabled', () => {
  const savedDisabled = process.env.OPENAI_DISABLED;
  const savedKey = process.env.OPENAI_API_KEY;
  afterEach(() => {
    if (savedDisabled === undefined) delete process.env.OPENAI_DISABLED;
    else process.env.OPENAI_DISABLED = savedDisabled;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  });

  test('returns true when OPENAI_DISABLED=true', () => {
    process.env.OPENAI_DISABLED = 'true';
    process.env.OPENAI_API_KEY = 'sk-real';
    expect(isLLMDisabled()).toBe(true);
  });

  test('returns true when OPENAI_DISABLED=1', () => {
    process.env.OPENAI_DISABLED = '1';
    process.env.OPENAI_API_KEY = 'sk-real';
    expect(isLLMDisabled()).toBe(true);
  });

  test('returns true when OPENAI_API_KEY is empty', () => {
    delete process.env.OPENAI_DISABLED;
    process.env.OPENAI_API_KEY = '';
    expect(isLLMDisabled()).toBe(true);
  });

  test('returns false when key is set and flag is off', () => {
    delete process.env.OPENAI_DISABLED;
    process.env.OPENAI_API_KEY = 'sk-real';
    expect(isLLMDisabled()).toBe(false);
  });
});

describe('isFatalOpenAIError', () => {
  test('429 quota is fatal', () => {
    expect(isFatalOpenAIError({ status: 429 })).toBe(true);
  });
  test('401 invalid_api_key is fatal', () => {
    expect(isFatalOpenAIError({ status: 401, code: 'invalid_api_key' })).toBe(true);
  });
  test('insufficient_quota code is fatal', () => {
    expect(isFatalOpenAIError({ code: 'insufficient_quota' })).toBe(true);
  });
  test('5xx is NOT fatal (transient, may retry)', () => {
    expect(isFatalOpenAIError({ status: 500 })).toBe(false);
    expect(isFatalOpenAIError({ status: 503 })).toBe(false);
  });
  test('null/undefined error returns false', () => {
    expect(isFatalOpenAIError(null)).toBe(false);
    expect(isFatalOpenAIError(undefined)).toBe(false);
  });
});

describe('buildLayer3FromDeterministic', () => {
  const layer1Scores = { structure: 80, hydration: 70, inflammation: 60, sunDamage: 50, elasticity: 65 };
  const layer2Results = {
    signalOverrides: { structure: 78, hydration: 72, sunDamage: 55, elasticity: 68 },
    lesions: [
      { class: 'acne', zone: 'forehead', tier: 'confirmed', confidence: 0.6, bbox: [0, 0, 0.05, 0.05] },
      { class: 'acne', zone: 'forehead', tier: 'confirmed', confidence: 0.55, bbox: [0, 0, 0.05, 0.05] },
      { class: 'acne', zone: 'chin', tier: 'possible', confidence: 0.18, bbox: [0, 0, 0.05, 0.05] },
    ],
  };

  test('returns the full vision-response shape', () => {
    const r = buildLayer3FromDeterministic({ layer1Scores, layer2Results });
    expect(r.signal_scores).toBeDefined();
    for (const k of SIGNAL_KEYS) {
      expect(typeof r.signal_scores[k]).toBe('number');
      expect(r.signal_scores[k]).toBeGreaterThanOrEqual(0);
      expect(r.signal_scores[k]).toBeLessThanOrEqual(100);
    }
    expect(typeof r.acne_score).toBe('number');
    expect(typeof r.sun_damage_score).toBe('number');
    expect(typeof r.skin_age_score).toBe('number');
    expect(r.confidence).toBe('med');
    expect(typeof r.primary_driver).toBe('string');
    expect(typeof r.recommended_action).toBe('string');
    expect(typeof r.personalized_feedback).toBe('string');
    expect(r.zone_severity).toBeDefined();
    expect(Array.isArray(r.conditions)).toBe(true);
  });

  test('synthesised signal_scores blend L1 + L2 where L2 is present', () => {
    const r = buildLayer3FromDeterministic({ layer1Scores, layer2Results });
    // structure: (80 + 78) / 2 = 79
    expect(r.signal_scores.structure).toBe(79);
    // inflammation: no L2 override → L1 only = 60
    expect(r.signal_scores.inflammation).toBe(60);
  });

  test('legacy scalar scores derive from signal_scores (severity inverted)', () => {
    const r = buildLayer3FromDeterministic({ layer1Scores, layer2Results });
    // acne_score = 100 - inflammation
    expect(r.acne_score).toBe(100 - r.signal_scores.inflammation);
    // sun_damage_score = 100 - sunDamage
    expect(r.sun_damage_score).toBe(100 - r.signal_scores.sunDamage);
  });

  test('primary_driver tracks the weakest signal', () => {
    // sunDamage will be 52 (avg of 50, 55), the lowest. Weakest signal driver:
    const r = buildLayer3FromDeterministic({ layer1Scores, layer2Results });
    expect(r.primary_driver.toLowerCase()).toMatch(/pigment|uv/);
  });

  test('lesions in forehead populate zone_severity + conditions', () => {
    const r = buildLayer3FromDeterministic({ layer1Scores, layer2Results });
    expect(r.zone_severity.forehead.dominant_signal).toBe('inflammation');
    expect(r.zone_severity.forehead.severity).toBeGreaterThanOrEqual(30);
    const acne = r.conditions.find((c) => c.name === 'acne');
    expect(acne).toBeDefined();
    expect(acne.zones.some((z) => z.region === 'forehead')).toBe(true);
    // The 'possible'-tier chin lesion should NOT appear (confirmed-only)
    expect(acne.zones.some((z) => z.region === 'chin')).toBe(false);
  });

  test('handles empty L2 (deterministic-only) input', () => {
    const r = buildLayer3FromDeterministic({
      layer1Scores,
      layer2Results: { signalOverrides: {}, lesions: [] },
    });
    expect(r.signal_scores.structure).toBe(80);
    expect(r.conditions).toHaveLength(0);
  });

  test('handles fully missing layer1 (everything defaults to 50)', () => {
    const r = buildLayer3FromDeterministic({
      layer1Scores: {},
      layer2Results: { signalOverrides: {}, lesions: [] },
    });
    for (const k of SIGNAL_KEYS) expect(r.signal_scores[k]).toBe(50);
  });
});

describe('buildInsightsFromDeterministic', () => {
  test('returns the full insights-stream shape', () => {
    const r = buildInsightsFromDeterministic({
      signal_scores: { structure: 60, hydration: 70, inflammation: 80, sunDamage: 55, elasticity: 65 },
      lesions: [],
      conditions: [],
      scan_count: 5,
    });
    expect(typeof r.overall_summary).toBe('string');
    expect(typeof r.overall_score_context).toBe('string');
    expect(r.signal_insights).toBeDefined();
    expect(Array.isArray(r.zone_findings)).toBe(true);
    expect(r.product_guidance).toBeDefined();
    expect(Array.isArray(r.action_plan)).toBe(true);
    expect(r.action_plan).toHaveLength(3);
  });

  test('overall_summary references both strongest and weakest signal', () => {
    const r = buildInsightsFromDeterministic({
      signal_scores: { structure: 90, hydration: 80, inflammation: 70, sunDamage: 30, elasticity: 75 },
      lesions: [],
      conditions: [],
      scan_count: 5,
    });
    // strongest = structure (90), weakest = sunDamage (30)
    expect(r.overall_summary).toMatch(/Structure/);
    expect(r.overall_summary).toMatch(/Sun Damage/);
  });

  test('baseline-scan context fires when scan_count <= 1', () => {
    const r = buildInsightsFromDeterministic({
      signal_scores: { structure: 60, hydration: 70, inflammation: 80, sunDamage: 55, elasticity: 65 },
      lesions: [],
      conditions: [],
      scan_count: 1,
    });
    expect(r.overall_score_context.toLowerCase()).toMatch(/baseline/);
  });

  test('zone_findings populated when confirmed lesions exist', () => {
    const r = buildInsightsFromDeterministic({
      signal_scores: { structure: 60, hydration: 70, inflammation: 80, sunDamage: 55, elasticity: 65 },
      lesions: [
        { class: 'acne', zone: 'forehead', tier: 'confirmed' },
        { class: 'acne', zone: 'forehead', tier: 'confirmed' },
        { class: 'acne', zone: 'chin', tier: 'possible' },
      ],
      conditions: [],
      scan_count: 3,
    });
    expect(r.zone_findings.length).toBeGreaterThan(0);
    expect(r.zone_findings.some((z) => z.zone === 'forehead')).toBe(true);
    // 'possible' chin lesion should not produce a finding
    expect(r.zone_findings.some((z) => z.zone === 'chin')).toBe(false);
  });

  test('action_plan addresses the weakest two signals in order', () => {
    const r = buildInsightsFromDeterministic({
      signal_scores: { structure: 90, hydration: 80, inflammation: 30, sunDamage: 40, elasticity: 75 },
      lesions: [],
      conditions: [],
      scan_count: 3,
    });
    // weakest = inflammation (30), 2nd = sunDamage (40)
    expect(r.action_plan[0].toLowerCase()).toMatch(/inflammation/);
    expect(r.action_plan[1].toLowerCase()).toMatch(/sun damage/);
  });
});
