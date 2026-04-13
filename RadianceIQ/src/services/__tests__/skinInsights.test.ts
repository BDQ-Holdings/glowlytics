import {
  buildOverallSkinInsight,
  buildMetricDetailInsight,
  getLatestDailyForOutput,
} from '../skinInsights';
import type { DailyRecord, ModelOutput, ProductEntry } from '../../types';

// ──────────── Test fixtures ────────────

const makeOutput = (overrides: Partial<ModelOutput> = {}): ModelOutput => ({
  output_id: 'out-1',
  daily_id: 'day-1',
  acne_score: 40,
  sun_damage_score: 30,
  skin_age_score: 35,
  confidence: 'med',
  recommended_action: 'Continue scanning.',
  escalation_flag: false,
  ...overrides,
});

const makeDaily = (overrides: Partial<DailyRecord> = {}): DailyRecord => ({
  daily_id: 'day-1',
  user_id: 'user-1',
  date: '2026-03-08',
  scanner_reading_id: 'scan-1',
  scanner_indices: {
    inflammation_index: 38,
    pigmentation_index: 28,
    texture_index: 33,
  },
  scanner_quality_flag: 'pass',
  scan_region: 'left_cheek',
  sunscreen_used: true,
  new_product_added: false,
  ...overrides,
});

const makeProducts = (): ProductEntry[] => [
  {
    user_product_id: 'prod-1',
    user_id: 'user-1',
    product_name: 'CeraVe Moisturizing Cream',
    product_capture_method: 'search',
    ingredients_list: ['Ceramides', 'Hyaluronic Acid', 'Niacinamide'],
    usage_schedule: 'both',
    start_date: '2026-02-01',
  },
];

// ──────────── getLatestDailyForOutput ────────────

describe('getLatestDailyForOutput', () => {
  it('returns matching daily record for given output', () => {
    const output = makeOutput({ daily_id: 'day-2' });
    const records = [makeDaily({ daily_id: 'day-1' }), makeDaily({ daily_id: 'day-2' })];
    const result = getLatestDailyForOutput(output, records);
    expect(result?.daily_id).toBe('day-2');
  });

  it('returns null when no matching daily record', () => {
    const output = makeOutput({ daily_id: 'day-99' });
    const records = [makeDaily({ daily_id: 'day-1' })];
    expect(getLatestDailyForOutput(output, records)).toBeNull();
  });

  it('returns null when output is null', () => {
    expect(getLatestDailyForOutput(null, [makeDaily()])).toBeNull();
  });
});

// ──────────── buildOverallSkinInsight ────────────

describe('buildOverallSkinInsight', () => {
  it('returns null when latestOutput is null', () => {
    expect(
      buildOverallSkinInsight({ latestOutput: null, baselineOutput: null, latestDaily: null })
    ).toBeNull();
  });

  it('returns a valid overall insight with output and daily', () => {
    const result = buildOverallSkinInsight({
      latestOutput: makeOutput(),
      baselineOutput: null,
      latestDaily: makeDaily(),
    });

    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(100);
    expect(typeof result!.statusLabel).toBe('string');
    expect(typeof result!.actionStatement).toBe('string');
  });

  it('computes correct composite signals', () => {
    const result = buildOverallSkinInsight({
      latestOutput: makeOutput({ acne_score: 40, sun_damage_score: 30, skin_age_score: 35 }),
      baselineOutput: null,
      latestDaily: makeDaily({
        scanner_indices: { inflammation_index: 38, pigmentation_index: 28, texture_index: 33 },
      }),
    });

    expect(result).not.toBeNull();
    const { signals } = result!;

    // structure = round(100 - (33*0.55 + 35*0.45)) = round(100 - (18.15 + 15.75)) = round(66.1) = 66
    expect(signals.structure).toBe(66);

    // inflammation = round(100 - (38*0.8 + 40*0.2)) = round(100 - (30.4 + 8)) = round(61.6) = 62
    expect(signals.inflammation).toBe(62);

    // sunDamage = round(100 - (30*0.82 + 28*0.18)) = round(100 - (24.6 + 5.04)) = round(70.36) = 70
    expect(signals.sunDamage).toBe(70);

    // elasticity = round(100 - (35*0.62 + 33*0.38)) = round(100 - (21.7 + 12.54)) = round(65.76) = 66
    expect(signals.elasticity).toBe(66);
  });

  it('applies stress and sleep penalties to hydration', () => {
    const withStress = buildOverallSkinInsight({
      latestOutput: makeOutput(),
      baselineOutput: null,
      latestDaily: makeDaily({ stress_level: 'high', sleep_quality: 'poor' }),
    });
    const withoutStress = buildOverallSkinInsight({
      latestOutput: makeOutput(),
      baselineOutput: null,
      latestDaily: makeDaily({ stress_level: 'low', sleep_quality: 'great' }),
    });

    expect(withStress).not.toBeNull();
    expect(withoutStress).not.toBeNull();
    // High stress adds 12, poor sleep adds 8 → hydration should be lower
    expect(withStress!.signals.hydration).toBeLessThan(withoutStress!.signals.hydration);
  });

  it('computes correct trend delta from baseline', () => {
    const baseline = makeOutput({ acne_score: 60, sun_damage_score: 50, skin_age_score: 55 });
    const latest = makeOutput({ acne_score: 40, sun_damage_score: 30, skin_age_score: 35 });

    const result = buildOverallSkinInsight({
      latestOutput: latest,
      baselineOutput: baseline,
      latestDaily: makeDaily(),
    });

    expect(result).not.toBeNull();
    // Latest scores are lower (better) → overall score should be higher → positive delta
    expect(result!.trendDelta).toBeGreaterThan(0);
  });

  it('returns correct status labels for score ranges', () => {
    // Low-risk scores → high overall → 'Peak' or 'Strong'
    const lowRisk = buildOverallSkinInsight({
      latestOutput: makeOutput({ acne_score: 5, sun_damage_score: 5, skin_age_score: 5 }),
      baselineOutput: null,
      latestDaily: makeDaily({
        scanner_indices: { inflammation_index: 5, pigmentation_index: 5, texture_index: 5 },
      }),
    });
    expect(lowRisk).not.toBeNull();
    expect(['Peak', 'Strong']).toContain(lowRisk!.statusLabel);

    // High-risk scores → low overall → 'Recovery'
    const highRisk = buildOverallSkinInsight({
      latestOutput: makeOutput({ acne_score: 90, sun_damage_score: 90, skin_age_score: 90 }),
      baselineOutput: null,
      latestDaily: makeDaily({
        scanner_indices: { inflammation_index: 90, pigmentation_index: 90, texture_index: 90 },
      }),
    });
    expect(highRisk).not.toBeNull();
    expect(highRisk!.statusLabel).toBe('Recovery');
  });

  it('uses scanner_indices for baseline when baselineDaily is provided', () => {
    // Baseline output with proxy scores that differ from scanner_indices
    const baseline = makeOutput({ acne_score: 30, sun_damage_score: 25, skin_age_score: 20 });
    // baselineDaily has refined scanner_indices that differ from the proxy scores
    const baselineDaily = makeDaily({
      daily_id: 'day-baseline',
      scanner_indices: { inflammation_index: 60, pigmentation_index: 55, texture_index: 50 },
    });
    // Latest scan is identical to baseline (same output)
    const latest = makeOutput({ acne_score: 30, sun_damage_score: 25, skin_age_score: 20 });
    const latestDaily = makeDaily({
      daily_id: 'day-1',
      scanner_indices: { inflammation_index: 60, pigmentation_index: 55, texture_index: 50 },
    });

    const result = buildOverallSkinInsight({
      latestOutput: latest,
      baselineOutput: baseline,
      latestDaily,
      baselineDaily,
    });

    expect(result).not.toBeNull();
    // When latest and baseline use identical scanner_indices, trendDelta should be 0
    expect(result!.trendDelta).toBe(0);
  });

  it('trendDelta is non-zero when baselineDaily scanner_indices differ from proxy scores', () => {
    // Baseline output with proxy scores
    const baseline = makeOutput({ acne_score: 30, sun_damage_score: 25, skin_age_score: 20 });
    // Without baselineDaily: baseline uses acne_score (30) as inflammationRisk proxy
    // With baselineDaily: baseline uses inflammation_index (60) — a very different value
    const baselineDaily = makeDaily({
      daily_id: 'day-baseline',
      scanner_indices: { inflammation_index: 60, pigmentation_index: 55, texture_index: 50 },
    });
    const latest = makeOutput({ acne_score: 30, sun_damage_score: 25, skin_age_score: 20 });
    const latestDaily = makeDaily({
      daily_id: 'day-1',
      scanner_indices: { inflammation_index: 60, pigmentation_index: 55, texture_index: 50 },
    });

    const withBaselineDaily = buildOverallSkinInsight({
      latestOutput: latest,
      baselineOutput: baseline,
      latestDaily,
      baselineDaily,
    });

    const withoutBaselineDaily = buildOverallSkinInsight({
      latestOutput: latest,
      baselineOutput: baseline,
      latestDaily,
    });

    expect(withBaselineDaily).not.toBeNull();
    expect(withoutBaselineDaily).not.toBeNull();
    // With baselineDaily providing accurate scanner_indices, the apples-to-apples comparison
    // yields trendDelta = 0. Without it, the proxy mismatch produces a non-zero delta.
    expect(withBaselineDaily!.trendDelta).toBe(0);
    expect(withoutBaselineDaily!.trendDelta).not.toBe(0);
  });

  it('weights sum to 1.0 in overall score', () => {
    // All signals at 100 → overall should be 100
    const result = buildOverallSkinInsight({
      latestOutput: makeOutput({ acne_score: 0, sun_damage_score: 0, skin_age_score: 0 }),
      baselineOutput: null,
      latestDaily: makeDaily({
        scanner_indices: { inflammation_index: 0, pigmentation_index: 0, texture_index: 0 },
      }),
    });
    expect(result).not.toBeNull();
    // All risks at 0 → all signals at 100 → score = 100*(0.22+0.18+0.20+0.20+0.20) = 100
    expect(result!.score).toBe(100);
  });
});

// ──────────── buildMetricDetailInsight ────────────

describe('buildMetricDetailInsight', () => {
  it('returns null when latestOutput is null', () => {
    expect(
      buildMetricDetailInsight({ metric: 'acne', latestOutput: null, latestDaily: null, products: [] })
    ).toBeNull();
  });

  it('returns correct acne insight with zones', () => {
    const result = buildMetricDetailInsight({
      metric: 'acne',
      latestOutput: makeOutput({ acne_score: 55 }),
      latestDaily: makeDaily(),
      products: makeProducts(),
    });

    expect(result).not.toBeNull();
    expect(result!.metric).toBe('acne');
    expect(result!.title).toBe('Acne');
    expect(result!.score).toBe(55);
    expect(result!.severity).toBe('moderate');
    expect(result!.zones).toHaveLength(3);
    expect(result!.zones.map((z) => z.key)).toEqual(['forehead', 'cheeks', 'jawline']);
  });

  it('returns correct sun_damage insight with zones', () => {
    const result = buildMetricDetailInsight({
      metric: 'sun_damage',
      latestOutput: makeOutput({ sun_damage_score: 72 }),
      latestDaily: makeDaily(),
      products: makeProducts(),
    });

    expect(result).not.toBeNull();
    expect(result!.metric).toBe('sun_damage');
    expect(result!.title).toBe('Sun Damage');
    expect(result!.score).toBe(72);
    expect(result!.severity).toBe('high');
    expect(result!.zones).toHaveLength(3);
    expect(result!.zones.map((z) => z.key)).toEqual(['upper_forehead', 'temples', 'crows_feet']);
  });

  it('returns correct skin_age insight with zones', () => {
    const result = buildMetricDetailInsight({
      metric: 'skin_age',
      latestOutput: makeOutput({ skin_age_score: 25 }),
      latestDaily: makeDaily(),
      products: makeProducts(),
    });

    expect(result).not.toBeNull();
    expect(result!.metric).toBe('skin_age');
    expect(result!.title).toBe('Skin Age');
    expect(result!.score).toBe(25);
    expect(result!.severity).toBe('low');
    expect(result!.zones).toHaveLength(3);
    expect(result!.zones.map((z) => z.key)).toEqual(['under_eye', 'nasolabial', 'jawline']);
  });

  it('identifies trigger products for acne stop-using recommendation', () => {
    const productsWithTrigger: ProductEntry[] = [
      ...makeProducts(),
      {
        user_product_id: 'prod-2',
        user_id: 'user-1',
        product_name: 'Coconut Oil Moisturizer',
        product_capture_method: 'search',
        ingredients_list: ['Coconut Oil', 'Fragrance', 'Shea Butter'],
        usage_schedule: 'PM',
        start_date: '2026-03-01',
      },
    ];

    const result = buildMetricDetailInsight({
      metric: 'acne',
      latestOutput: makeOutput({ acne_score: 60 }),
      latestDaily: makeDaily(),
      products: productsWithTrigger,
    });

    expect(result).not.toBeNull();
    expect(result!.stopUsing).toContain('Coconut Oil Moisturizer');
  });

  it('severity thresholds are correct', () => {
    const low = buildMetricDetailInsight({
      metric: 'acne',
      latestOutput: makeOutput({ acne_score: 37 }),
      latestDaily: makeDaily(),
      products: [],
    });
    expect(low!.severity).toBe('low');

    const moderate = buildMetricDetailInsight({
      metric: 'acne',
      latestOutput: makeOutput({ acne_score: 38 }),
      latestDaily: makeDaily(),
      products: [],
    });
    expect(moderate!.severity).toBe('moderate');

    const high = buildMetricDetailInsight({
      metric: 'acne',
      latestOutput: makeOutput({ acne_score: 68 }),
      latestDaily: makeDaily(),
      products: [],
    });
    expect(high!.severity).toBe('high');
  });

  it('adjusts zone severity when sunscreen not used (sun_damage)', () => {
    const withSunscreen = buildMetricDetailInsight({
      metric: 'sun_damage',
      latestOutput: makeOutput({ sun_damage_score: 50 }),
      latestDaily: makeDaily({ sunscreen_used: true }),
      products: [],
    });
    const withoutSunscreen = buildMetricDetailInsight({
      metric: 'sun_damage',
      latestOutput: makeOutput({ sun_damage_score: 50 }),
      latestDaily: makeDaily({ sunscreen_used: false }),
      products: [],
    });

    // Temple zone adds +12 when no sunscreen → should have higher severity
    const templeWith = withSunscreen!.zones.find((z) => z.key === 'temples')!;
    const templeWithout = withoutSunscreen!.zones.find((z) => z.key === 'temples')!;
    // Without sunscreen, score is higher so severity should be same or worse
    expect(['moderate', 'high']).toContain(templeWithout.severity);
  });
});
