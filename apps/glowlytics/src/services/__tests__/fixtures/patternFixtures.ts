import type {
  ModelOutput,
  DailyRecord,
  HealthDailyRecord,
  UserProfile,
  SignalScores,
} from '../../../types';

// ─── Seeded PRNG for reproducible tests ────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number, mean: number, std: number): number {
  // Box-Muller
  const u1 = Math.max(1e-10, rand());
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

function dateAt(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function defaultSignalScores(): SignalScores {
  return {
    structure: 72,
    hydration: 70,
    inflammation: 55,
    sunDamage: 65,
    elasticity: 72,
  };
}

function buildModelOutput(overrides: {
  id: string;
  dailyId: string;
  signals: SignalScores;
}): ModelOutput {
  return {
    output_id: overrides.id,
    daily_id: overrides.dailyId,
    acne_score: overrides.signals.inflammation,
    sun_damage_score: overrides.signals.sunDamage,
    skin_age_score: 38,
    confidence: 'med',
    recommended_action: 'Keep scanning',
    escalation_flag: false,
    signal_scores: overrides.signals,
  };
}

function buildDailyRecord(overrides: {
  id: string;
  userId: string;
  date: string;
  cycleDay?: number;
  drinksYesterday?: string;
  stressLevel?: 'low' | 'med' | 'high';
  sleepQuality?: 'poor' | 'ok' | 'great';
}): DailyRecord {
  return {
    daily_id: overrides.id,
    user_id: overrides.userId,
    date: overrides.date,
    scanner_reading_id: `scan-${overrides.id}`,
    scanner_indices: {
      inflammation_index: 40,
      pigmentation_index: 30,
      texture_index: 35,
    },
    scanner_quality_flag: 'pass',
    scan_region: 'whole_face',
    sunscreen_used: true,
    new_product_added: false,
    cycle_day_estimated: overrides.cycleDay,
    drinks_yesterday: overrides.drinksYesterday,
    stress_level: overrides.stressLevel,
    sleep_quality: overrides.sleepQuality,
  };
}

function defaultUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    user_id: 'synthetic-user',
    age_range: '25-34',
    sex: 'female',
    location_coarse: 'US',
    period_applicable: 'yes',
    cycle_length_days: 28,
    menstrual_status: 'regular',
    wearable_connected: false,
    camera_permission_status: 'granted',
    health_connection: {
      status: 'granted',
      requested_types: [],
      granted_types: [],
      sync_skipped: false,
    },
    onboarding_complete: true,
    ...overrides,
  };
}

export interface PatternFixture {
  modelOutputs: ModelOutput[];
  dailyRecords: DailyRecord[];
  healthDailyRecords: HealthDailyRecord[];
  userProfile: UserProfile;
}

// ─── Cycle-signal phase fixture ────────────────────────────────────────────
export interface CycleFixtureOptions {
  cycles: number;
  cycleLength: number;                 // e.g. 28
  peakCycleDay: number;                // e.g. 25 = peak 3 days before next period
  peakAmplitude: number;               // e.g. 18 (score points)
  noise: number;                       // std dev of additive gaussian
  seed?: number;
}

export function buildSyntheticCycleData(opts: CycleFixtureOptions): PatternFixture {
  const rand = mulberry32(opts.seed ?? 42);
  const totalDays = opts.cycles * opts.cycleLength;
  const modelOutputs: ModelOutput[] = [];
  const dailyRecords: DailyRecord[] = [];

  for (let day = 0; day < totalDays; day++) {
    const date = dateAt(totalDays - day - 1);
    const cycleDay = (day % opts.cycleLength) + 1; // 1-indexed
    // Circular distance from the peak day
    let dist = Math.abs(cycleDay - opts.peakCycleDay);
    dist = Math.min(dist, opts.cycleLength - dist);
    // Gaussian-shaped peak
    const peakContribution = opts.peakAmplitude * Math.exp(-((dist / 2) ** 2));
    const inflammation = clamp(55 + peakContribution + gaussian(rand, 0, opts.noise), 0, 100);

    const signals: SignalScores = {
      ...defaultSignalScores(),
      inflammation,
    };

    const dailyId = `synthetic-daily-${day}`;
    dailyRecords.push(
      buildDailyRecord({
        id: dailyId,
        userId: 'synthetic-user',
        date,
        cycleDay,
      }),
    );
    modelOutputs.push(
      buildModelOutput({
        id: `synthetic-output-${day}`,
        dailyId,
        signals,
      }),
    );
  }

  return {
    modelOutputs,
    dailyRecords,
    healthDailyRecords: [],
    userProfile: defaultUserProfile(),
  };
}

// ─── Health-signal lag fixture ─────────────────────────────────────────────
export interface HealthLagFixtureOptions {
  days: number;
  driver: 'hrv_sdnn_ms' | 'sleep_total_minutes' | 'resting_hr_bpm';
  signal: 'inflammation' | 'hydration' | 'structure' | 'sunDamage' | 'elasticity';
  lag: number;                         // driver leads signal by `lag` days
  correlation: number;                 // target [-1, 1]
  noise?: number;
  seed?: number;
}

export function buildSyntheticHealthData(opts: HealthLagFixtureOptions): PatternFixture {
  const rand = mulberry32(opts.seed ?? 43);
  const noise = opts.noise ?? 3;
  const modelOutputs: ModelOutput[] = [];
  const dailyRecords: DailyRecord[] = [];
  const healthDailyRecords: HealthDailyRecord[] = [];

  // Generate driver series first
  const driverSeries: number[] = [];
  for (let day = 0; day < opts.days; day++) {
    driverSeries.push(gaussian(rand, 50, 15));
  }

  for (let day = 0; day < opts.days; day++) {
    const date = dateAt(opts.days - day - 1);
    const driverRaw = driverSeries[day];
    // Scale driver to realistic units per type
    const scaledDriver =
      opts.driver === 'hrv_sdnn_ms'
        ? 20 + driverRaw * 0.8
        : opts.driver === 'sleep_total_minutes'
        ? 360 + driverRaw * 3
        : 50 + driverRaw * 0.4; // resting_hr_bpm

    // Signal = base + correlation * (lagged driver) + noise
    const lagIndex = day - opts.lag;
    const laggedDriverRaw = lagIndex >= 0 ? driverSeries[lagIndex] : 50;
    const signalContribution = opts.correlation * (laggedDriverRaw - 50) * 0.8;
    const signalValue = clamp(55 + signalContribution + gaussian(rand, 0, noise), 0, 100);

    const signals: SignalScores = {
      ...defaultSignalScores(),
      [opts.signal]: signalValue,
    };

    const dailyId = `synthetic-daily-${day}`;
    dailyRecords.push(
      buildDailyRecord({
        id: dailyId,
        userId: 'synthetic-user',
        date,
      }),
    );
    modelOutputs.push(
      buildModelOutput({
        id: `synthetic-output-${day}`,
        dailyId,
        signals,
      }),
    );
    healthDailyRecords.push({
      health_daily_id: `synthetic-health-${day}`,
      user_id: 'synthetic-user',
      date,
      source: 'apple_health',
      sleep_total_minutes: opts.driver === 'sleep_total_minutes' ? scaledDriver : null,
      sleep_deep_minutes: null,
      sleep_rem_minutes: null,
      hrv_sdnn_ms: opts.driver === 'hrv_sdnn_ms' ? scaledDriver : null,
      resting_hr_bpm: opts.driver === 'resting_hr_bpm' ? scaledDriver : null,
      steps: null,
      mindful_minutes: null,
      menstrual_flow: null,
      cycle_day_estimated: null,
      synced_at: new Date().toISOString(),
      partial: true,
    });
  }

  return {
    modelOutputs,
    dailyRecords,
    healthDailyRecords,
    userProfile: defaultUserProfile(),
  };
}

// ─── Noise-append helper for demotion tests ────────────────────────────────
export function appendNoise(input: PatternFixture, days: number, seed = 99): PatternFixture {
  const rand = mulberry32(seed);
  const startOffset = input.modelOutputs.length;
  const newOutputs: ModelOutput[] = [];
  const newDailyRecords: DailyRecord[] = [];
  const newHealthRecords: HealthDailyRecord[] = [];

  for (let i = 0; i < days; i++) {
    // New dates are more recent than existing ones
    const date = dateAt(-i - 1); // future-dated relative to existing "present" anchor
    const dailyId = `noise-daily-${startOffset + i}`;
    const signals: SignalScores = {
      structure: clamp(72 + gaussian(rand, 0, 10), 0, 100),
      hydration: clamp(70 + gaussian(rand, 0, 20), 0, 100),
      inflammation: clamp(55 + gaussian(rand, 0, 20), 0, 100),
      sunDamage: clamp(65 + gaussian(rand, 0, 8), 0, 100),
      elasticity: clamp(72 + gaussian(rand, 0, 6), 0, 100),
    };
    newDailyRecords.push(
      buildDailyRecord({
        id: dailyId,
        userId: 'synthetic-user',
        date,
      }),
    );
    newOutputs.push(
      buildModelOutput({
        id: `noise-output-${startOffset + i}`,
        dailyId,
        signals,
      }),
    );
    newHealthRecords.push({
      health_daily_id: `noise-health-${startOffset + i}`,
      user_id: 'synthetic-user',
      date,
      source: 'apple_health',
      sleep_total_minutes: 420 + gaussian(rand, 0, 60),
      sleep_deep_minutes: null,
      sleep_rem_minutes: null,
      hrv_sdnn_ms: 45 + gaussian(rand, 0, 10),
      resting_hr_bpm: null,
      steps: null,
      mindful_minutes: null,
      menstrual_flow: null,
      cycle_day_estimated: null,
      synced_at: new Date().toISOString(),
      partial: true,
    });
  }

  return {
    modelOutputs: [...input.modelOutputs, ...newOutputs],
    dailyRecords: [...input.dailyRecords, ...newDailyRecords],
    healthDailyRecords: [...input.healthDailyRecords, ...newHealthRecords],
    userProfile: input.userProfile,
  };
}

// ─── Lifestyle correlation fixture ─────────────────────────────────────────
export interface LifestyleFixtureOptions {
  days: number;
  driver: 'drinks_yesterday' | 'stress_level' | 'sleep_quality';
  signal: 'inflammation' | 'hydration' | 'structure';
  correlation: number; // [-1, 1]
  noise?: number;
  seed?: number;
}

export function buildSyntheticLifestyleData(opts: LifestyleFixtureOptions): PatternFixture {
  const rand = mulberry32(opts.seed ?? 44);
  const noise = opts.noise ?? 3;
  const modelOutputs: ModelOutput[] = [];
  const dailyRecords: DailyRecord[] = [];

  for (let day = 0; day < opts.days; day++) {
    const date = dateAt(opts.days - day - 1);
    // Driver takes integer values: drinks 0-4, stress 1-3, sleep 1-3
    const driverNumeric = Math.round(clamp(gaussian(rand, 2, 1.5), 0, 4));

    const signalBase = 55;
    const signalContribution = opts.correlation * (driverNumeric - 2) * 8;
    const signalValue = clamp(signalBase + signalContribution + gaussian(rand, 0, noise), 0, 100);

    const signals: SignalScores = {
      ...defaultSignalScores(),
      [opts.signal]: signalValue,
    };

    let drinksYesterday: string | undefined;
    let stressLevel: 'low' | 'med' | 'high' | undefined;
    let sleepQuality: 'poor' | 'ok' | 'great' | undefined;
    if (opts.driver === 'drinks_yesterday') {
      drinksYesterday = String(driverNumeric);
    } else if (opts.driver === 'stress_level') {
      stressLevel = driverNumeric <= 1 ? 'low' : driverNumeric === 2 ? 'med' : 'high';
    } else if (opts.driver === 'sleep_quality') {
      sleepQuality = driverNumeric <= 1 ? 'poor' : driverNumeric === 2 ? 'ok' : 'great';
    }

    const dailyId = `synthetic-daily-${day}`;
    dailyRecords.push(
      buildDailyRecord({
        id: dailyId,
        userId: 'synthetic-user',
        date,
        drinksYesterday,
        stressLevel,
        sleepQuality,
      }),
    );
    modelOutputs.push(
      buildModelOutput({
        id: `synthetic-output-${day}`,
        dailyId,
        signals,
      }),
    );
  }

  return {
    modelOutputs,
    dailyRecords,
    healthDailyRecords: [],
    userProfile: defaultUserProfile(),
  };
}
