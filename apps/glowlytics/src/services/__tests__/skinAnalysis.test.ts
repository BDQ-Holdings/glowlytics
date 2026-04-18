import { analyzeSkiN } from '../skinAnalysis';
import type { ScannerReading } from '../mockScanner';
import type { UserProfile, ScanProtocol, ModelOutput } from '../../types';

// Fixed test inputs for deterministic verification
const mockScannerData: ScannerReading = {
  inflammation_index: 40,
  pigmentation_index: 30,
  texture_index: 35,
};

const mockUser: UserProfile = {
  user_id: 'test-user',
  age_range: '25-34',
  location_coarse: '10001',
  period_applicable: 'yes',
  cycle_length_days: 28,
  wearable_connected: false,
  camera_permission_status: 'granted',
  health_connection: {
    status: 'not_requested',
    requested_types: [],
    granted_types: [],
    sync_skipped: true,
  },
  onboarding_complete: true,
};

const mockProtocol: ScanProtocol = {
  protocol_id: 'test-protocol',
  user_id: 'test-user',
  primary_goal: 'acne',
  scan_region: 'left_cheek',
  scan_frequency: 'daily',
  baseline_date: '2026-01-01',
};

const baseInput = {
  scannerData: mockScannerData,
  userProfile: mockUser,
  protocol: mockProtocol,
  previousOutputs: [] as ModelOutput[],
  dailyContext: {
    sunscreen_used: true,
    new_product_added: false,
    sleep_quality: 'ok' as const,
    stress_level: 'low' as const,
  },
  skipDelay: true,
};

// Expected base scores with inflammation=40, pigmentation=30, texture=35:
// acne  = round(40*0.65 + 35*0.20 + 30*0.15) = round(26 + 7 + 4.5) = 38
// sun   = round(30*0.70 + 40*0.15 + 35*0.15) = round(21 + 6 + 5.25) = 32
// age   = round(35*0.55 + 30*0.25 + 40*0.20) = round(19.25 + 7.5 + 8) = 35
// With ok sleep: acne +2, age +1  → acne=40, sun=32, age=36

describe('analyzeSkiN - deterministic scoring', () => {
  // ──────────── Score range validation ────────────

  it('returns scores clamped to 0-100 range', async () => {
    const result = await analyzeSkiN(baseInput);
    expect(result.acne_score).toBeGreaterThanOrEqual(0);
    expect(result.acne_score).toBeLessThanOrEqual(100);
    expect(result.sun_damage_score).toBeGreaterThanOrEqual(0);
    expect(result.sun_damage_score).toBeLessThanOrEqual(100);
    expect(result.skin_age_score).toBeGreaterThanOrEqual(0);
    expect(result.skin_age_score).toBeLessThanOrEqual(100);
  });

  it('produces identical results for identical inputs (deterministic)', async () => {
    const result1 = await analyzeSkiN(baseInput);
    const result2 = await analyzeSkiN(baseInput);
    expect(result1.acne_score).toBe(result2.acne_score);
    expect(result1.sun_damage_score).toBe(result2.sun_damage_score);
    expect(result1.skin_age_score).toBe(result2.skin_age_score);
  });

  // ──────────── Base score computation ────────────

  it('computes correct base acne score from scanner indices', async () => {
    const result = await analyzeSkiN({
      ...baseInput,
      dailyContext: {
        sunscreen_used: true,
        new_product_added: false,
        sleep_quality: 'great',
        stress_level: 'low',
      },
    });
    // Base acne = round(40*0.65 + 35*0.20 + 30*0.15) = 38, no modifiers
    expect(result.acne_score).toBe(38);
  });

  it('computes correct base sun damage score from scanner indices', async () => {
    const result = await analyzeSkiN({
      ...baseInput,
      dailyContext: {
        sunscreen_used: true,
        new_product_added: false,
        sleep_quality: 'great',
        stress_level: 'low',
      },
    });
    // Base sun = round(30*0.70 + 40*0.15 + 35*0.15) = 32
    expect(result.sun_damage_score).toBe(32);
  });

  it('computes correct base skin age score from scanner indices', async () => {
    const result = await analyzeSkiN({
      ...baseInput,
      dailyContext: {
        sunscreen_used: true,
        new_product_added: false,
        sleep_quality: 'great',
        stress_level: 'low',
      },
    });
    // Base age = round(35*0.55 + 30*0.25 + 40*0.20) = 35
    expect(result.skin_age_score).toBe(35);
  });

  // ──────────── Sunscreen modifier ────────────

  it('adds +3 acne, +8 sun, +4 age when no sunscreen', async () => {
    const withSunscreen = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sunscreen_used: true, sleep_quality: 'great' },
    });
    const withoutSunscreen = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sunscreen_used: false, sleep_quality: 'great' },
    });
    expect(withoutSunscreen.acne_score - withSunscreen.acne_score).toBe(3);
    expect(withoutSunscreen.sun_damage_score - withSunscreen.sun_damage_score).toBe(8);
    expect(withoutSunscreen.skin_age_score - withSunscreen.skin_age_score).toBe(4);
  });

  // ──────────── Sleep modifier ────────────

  it('adds +6 acne, +2 sun, +5 age for poor sleep', async () => {
    const baseline = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low' },
    });
    const poorSleep = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'poor', stress_level: 'low' },
    });
    expect(poorSleep.acne_score - baseline.acne_score).toBe(6);
    expect(poorSleep.sun_damage_score - baseline.sun_damage_score).toBe(2);
    expect(poorSleep.skin_age_score - baseline.skin_age_score).toBe(5);
  });

  it('adds +2 acne, +1 age for ok sleep', async () => {
    const baseline = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low' },
    });
    const okSleep = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'ok', stress_level: 'low' },
    });
    expect(okSleep.acne_score - baseline.acne_score).toBe(2);
    expect(okSleep.skin_age_score - baseline.skin_age_score).toBe(1);
  });

  // ──────────── Stress modifier ────────────

  it('adds +8 acne, +3 sun, +3 age for high stress', async () => {
    const baseline = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low' },
    });
    const highStress = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'high' },
    });
    expect(highStress.acne_score - baseline.acne_score).toBe(8);
    expect(highStress.sun_damage_score - baseline.sun_damage_score).toBe(3);
    expect(highStress.skin_age_score - baseline.skin_age_score).toBe(3);
  });

  it('adds +3 acne, +1 sun, +1 age for medium stress', async () => {
    const baseline = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low' },
    });
    const medStress = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'med' },
    });
    expect(medStress.acne_score - baseline.acne_score).toBe(3);
    expect(medStress.sun_damage_score - baseline.sun_damage_score).toBe(1);
    expect(medStress.skin_age_score - baseline.skin_age_score).toBe(1);
  });

  // ──────────── Cycle modifiers ────────────

  it('adds +10 acne for late luteal cycle window (day 22)', async () => {
    const baseline = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low' },
    });
    const lateLuteal = await analyzeSkiN({
      ...baseInput,
      dailyContext: {
        ...baseInput.dailyContext,
        sleep_quality: 'great',
        stress_level: 'low',
        cycle_day_estimated: 22,
      },
    });
    expect(lateLuteal.acne_score - baseline.acne_score).toBe(10);
  });

  it('adds +5 acne for early follicular cycle window (day 3)', async () => {
    const baseline = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low' },
    });
    const earlyFollicular = await analyzeSkiN({
      ...baseInput,
      dailyContext: {
        ...baseInput.dailyContext,
        sleep_quality: 'great',
        stress_level: 'low',
        cycle_day_estimated: 3,
      },
    });
    expect(earlyFollicular.acne_score - baseline.acne_score).toBe(5);
  });

  it('no cycle modifier for mid-cycle (day 14)', async () => {
    const baseline = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low' },
    });
    const midCycle = await analyzeSkiN({
      ...baseInput,
      dailyContext: {
        ...baseInput.dailyContext,
        sleep_quality: 'great',
        stress_level: 'low',
        cycle_day_estimated: 14,
      },
    });
    expect(midCycle.acne_score).toBe(baseline.acne_score);
  });

  // ──────────── New product modifier ────────────

  it('adds +4 acne for new product introduction', async () => {
    const baseline = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low', new_product_added: false },
    });
    const withNewProduct = await analyzeSkiN({
      ...baseInput,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low', new_product_added: true },
    });
    expect(withNewProduct.acne_score - baseline.acne_score).toBe(4);
  });

  // ──────────── Combined modifiers ────────────

  it('stacks multiple modifiers correctly', async () => {
    const result = await analyzeSkiN({
      ...baseInput,
      dailyContext: {
        sunscreen_used: false,
        new_product_added: true,
        sleep_quality: 'poor',
        stress_level: 'high',
        cycle_day_estimated: 23,
      },
    });
    // acne base 38 + no_sunscreen(3) + poor_sleep(6) + high_stress(8) + cycle_luteal(10) + new_product(4) = 69
    expect(result.acne_score).toBe(69);
    // sun base 32 + no_sunscreen(8) + poor_sleep(2) + high_stress(3) = 45
    expect(result.sun_damage_score).toBe(45);
    // age base 35 + no_sunscreen(4) + poor_sleep(5) + high_stress(3) = 47
    expect(result.skin_age_score).toBe(47);
  });

  // ──────────── Clamping at boundaries ────────────

  it('clamps scores to 100 with extreme inputs', async () => {
    const result = await analyzeSkiN({
      ...baseInput,
      scannerData: { inflammation_index: 100, pigmentation_index: 100, texture_index: 100 },
      dailyContext: {
        sunscreen_used: false,
        new_product_added: true,
        sleep_quality: 'poor',
        stress_level: 'high',
        cycle_day_estimated: 23,
      },
    });
    expect(result.acne_score).toBeLessThanOrEqual(100);
    expect(result.sun_damage_score).toBeLessThanOrEqual(100);
    expect(result.skin_age_score).toBeLessThanOrEqual(100);
  });

  it('produces low scores with zero scanner indices', async () => {
    const result = await analyzeSkiN({
      ...baseInput,
      scannerData: { inflammation_index: 0, pigmentation_index: 0, texture_index: 0 },
      dailyContext: {
        sunscreen_used: true,
        new_product_added: false,
        sleep_quality: 'great',
        stress_level: 'low',
      },
    });
    expect(result.acne_score).toBe(0);
    expect(result.sun_damage_score).toBe(0);
    expect(result.skin_age_score).toBe(0);
  });

  // ──────────── Confidence levels ────────────

  it('returns low confidence with 0 previous outputs', async () => {
    const result = await analyzeSkiN(baseInput);
    expect(result.confidence).toBe('low');
  });

  it('returns low confidence with 2 previous outputs', async () => {
    const outputs = makeOutputs(2);
    const result = await analyzeSkiN({ ...baseInput, previousOutputs: outputs });
    expect(result.confidence).toBe('low');
  });

  it('returns med confidence with 3 previous outputs', async () => {
    const outputs = makeOutputs(3);
    const result = await analyzeSkiN({ ...baseInput, previousOutputs: outputs });
    expect(result.confidence).toBe('med');
  });

  it('returns med confidence with 6 previous outputs', async () => {
    const outputs = makeOutputs(6);
    const result = await analyzeSkiN({ ...baseInput, previousOutputs: outputs });
    expect(result.confidence).toBe('med');
  });

  it('returns high confidence with 7 previous outputs', async () => {
    const outputs = makeOutputs(7);
    const result = await analyzeSkiN({ ...baseInput, previousOutputs: outputs });
    expect(result.confidence).toBe('high');
  });

  it('returns high confidence with 20 previous outputs', async () => {
    const outputs = makeOutputs(20);
    const result = await analyzeSkiN({ ...baseInput, previousOutputs: outputs });
    expect(result.confidence).toBe('high');
  });

  // ──────────── Escalation flag ────────────

  it('sets escalation flag when acne jumps >20 from previous', async () => {
    const previousOutputs: ModelOutput[] = [{
      output_id: 'prev-1', daily_id: 'day-1',
      acne_score: 15, sun_damage_score: 20, skin_age_score: 20,
      confidence: 'low', recommended_action: 'test', escalation_flag: false,
    }];
    // With inflammation=80: acne base = round(80*0.65 + 35*0.20 + 30*0.15) = round(52+7+4.5) = 64
    // Delta from 15 = 49 → escalation
    const result = await analyzeSkiN({
      ...baseInput,
      scannerData: { inflammation_index: 80, pigmentation_index: 30, texture_index: 35 },
      previousOutputs,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low' },
    });
    expect(result.escalation_flag).toBe(true);
  });

  it('sets escalation flag when sun damage jumps >20 from previous', async () => {
    const previousOutputs: ModelOutput[] = [{
      output_id: 'prev-1', daily_id: 'day-1',
      acne_score: 50, sun_damage_score: 10, skin_age_score: 50,
      confidence: 'low', recommended_action: 'test', escalation_flag: false,
    }];
    // With pigmentation=80: sun base = round(80*0.70 + 40*0.15 + 35*0.15) = round(56+6+5.25) = 67
    // Delta from 10 = 57 → escalation
    const result = await analyzeSkiN({
      ...baseInput,
      scannerData: { inflammation_index: 40, pigmentation_index: 80, texture_index: 35 },
      previousOutputs,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low' },
    });
    expect(result.escalation_flag).toBe(true);
  });

  it('does NOT set escalation flag for <20 point change', async () => {
    const previousOutputs: ModelOutput[] = [{
      output_id: 'prev-1', daily_id: 'day-1',
      acne_score: 35, sun_damage_score: 30, skin_age_score: 32,
      confidence: 'low', recommended_action: 'test', escalation_flag: false,
    }];
    const result = await analyzeSkiN({
      ...baseInput,
      previousOutputs,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low' },
    });
    // acne=38, delta=3; sun=32, delta=2; age=35, delta=3 → no escalation
    expect(result.escalation_flag).toBe(false);
  });

  // ──────────── Primary driver selection ────────────

  it('selects "cycle window" driver when in luteal phase with acne goal', async () => {
    const result = await analyzeSkiN({
      ...baseInput,
      scannerData: { inflammation_index: 60, pigmentation_index: 30, texture_index: 35 },
      dailyContext: {
        ...baseInput.dailyContext,
        sleep_quality: 'great',
        stress_level: 'low',
        cycle_day_estimated: 24,
      },
    });
    // acne base = round(60*0.65+35*0.20+30*0.15) = round(39+7+4.5) = 51, +10 cycle = 61 > 50
    expect(result.primary_driver).toBe('cycle window');
  });

  it('selects "new product confounder" when new product + elevated acne', async () => {
    const result = await analyzeSkiN({
      ...baseInput,
      scannerData: { inflammation_index: 55, pigmentation_index: 30, texture_index: 35 },
      dailyContext: {
        ...baseInput.dailyContext,
        sleep_quality: 'great',
        stress_level: 'low',
        new_product_added: true,
      },
    });
    // acne base = round(55*0.65+35*0.20+30*0.15)=round(35.75+7+4.5)=47, +4 product = 51 > 40
    expect(result.primary_driver).toBe('new product confounder');
  });

  it('selects "low sunscreen adherence" for sun_damage goal', async () => {
    const result = await analyzeSkiN({
      ...baseInput,
      protocol: { ...mockProtocol, primary_goal: 'sun_damage' },
      scannerData: { inflammation_index: 40, pigmentation_index: 50, texture_index: 35 },
      dailyContext: {
        ...baseInput.dailyContext,
        sunscreen_used: false,
        sleep_quality: 'great',
        stress_level: 'low',
      },
    });
    // sun base = round(50*0.70+40*0.15+35*0.15) = round(35+6+5.25) = 46, +8 no_sunscreen = 54 > 40
    expect(result.primary_driver).toBe('low sunscreen adherence');
  });

  it('selects driver for skin_age goal with history', async () => {
    const outputs = makeOutputs(6, { skin_age_score: 40 });
    const result = await analyzeSkiN({
      ...baseInput,
      protocol: { ...mockProtocol, primary_goal: 'skin_age' },
      previousOutputs: outputs,
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low' },
    });
    // skin_age = 35, avg of previous = 40, delta = -5, skinAge < avg → 'texture improvement'
    expect(result.primary_driver).toBe('texture improvement');
  });

  it('returns "routine adherence" for low acne score', async () => {
    const result = await analyzeSkiN({
      ...baseInput,
      scannerData: { inflammation_index: 20, pigmentation_index: 10, texture_index: 15 },
      dailyContext: { ...baseInput.dailyContext, sleep_quality: 'great', stress_level: 'low' },
    });
    // acne = round(20*0.65+15*0.20+10*0.15) = round(13+3+1.5) = 18 < 30
    expect(result.primary_driver).toBe('routine adherence');
  });
});

// ──────────── Test helpers ────────────

function makeOutputs(count: number, overrides: Partial<ModelOutput> = {}): ModelOutput[] {
  return Array.from({ length: count }, (_, i) => ({
    output_id: `out-${i}`,
    daily_id: `day-${i}`,
    acne_score: 50,
    sun_damage_score: 30,
    skin_age_score: 40,
    confidence: 'low' as const,
    recommended_action: 'test',
    escalation_flag: false,
    ...overrides,
  }));
}
