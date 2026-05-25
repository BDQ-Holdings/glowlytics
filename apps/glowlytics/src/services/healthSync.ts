import { Platform } from 'react-native';
import {
  queryCategorySamples,
  queryQuantitySamples,
  CategoryValueSleepAnalysis,
} from '@kingstinct/react-native-healthkit';
import type { HealthDailyRecord } from '../types';
import { localDateStr } from '../utils/localDate';

const generateId = () => `hdr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// ─── Menstrual flow severity mapping ─────────────────────────────
// CategoryValueMenstrualFlow enum: unspecified=1, light=2, medium=3, heavy=4, none=5.
// Note: none=5 is weirdly out of order — common HealthKit footgun.
type MenstrualFlowLevel = 'none' | 'light' | 'medium' | 'heavy' | 'unspecified';
const FLOW_SEVERITY: Record<number, { label: MenstrualFlowLevel; rank: number }> = {
  1: { label: 'unspecified', rank: 1 },
  2: { label: 'light', rank: 2 },
  3: { label: 'medium', rank: 3 },
  4: { label: 'heavy', rank: 4 },
  5: { label: 'none', rank: 0 },
};

export function pickMaxSeverity(
  samples: { value: number }[],
): MenstrualFlowLevel | null {
  if (samples.length === 0) return null;
  // Default to `null` so callers can distinguish "no enum-matching sample"
  // from "no period today". The legacy implementation defaulted to 'none',
  // which silently labeled garbage data as a confident no-flow reading.
  let maxRank = -1;
  let maxLabel: MenstrualFlowLevel | null = null;
  for (const s of samples) {
    const entry = FLOW_SEVERITY[s.value];
    if (entry && entry.rank > maxRank) {
      maxRank = entry.rank;
      maxLabel = entry.label;
    }
  }
  return maxLabel;
}

// ─── Cycle episode grouping ──────────────────────────────────────

interface Episode {
  startDate: Date;
  endDate: Date;
  days: number;
}

export function groupEpisodes(
  samples: { startDate: Date; endDate: Date; value: number }[],
): Episode[] {
  if (samples.length === 0) return [];

  const sorted = [...samples].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );

  const episodes: Episode[] = [];
  let episodeStart = new Date(sorted[0].startDate);
  let episodeEnd = new Date(sorted[0].startDate);
  let sampleCount = 1;

  for (let i = 1; i < sorted.length; i++) {
    const current = new Date(sorted[i].startDate);
    const gapDays =
      (current.getTime() - new Date(episodeEnd).getTime()) / (1000 * 60 * 60 * 24);

    if (gapDays <= 2) {
      episodeEnd = current;
      sampleCount++;
    } else {
      if (sampleCount >= 2) {
        const days =
          Math.round(
            (new Date(episodeEnd).getTime() - new Date(episodeStart).getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1;
        episodes.push({ startDate: new Date(episodeStart), endDate: new Date(episodeEnd), days });
      }
      episodeStart = current;
      episodeEnd = current;
      sampleCount = 1;
    }
  }

  if (sampleCount >= 2) {
    const days =
      Math.round(
        (new Date(episodeEnd).getTime() - new Date(episodeStart).getTime()) /
          (1000 * 60 * 60 * 24),
      ) + 1;
    episodes.push({ startDate: new Date(episodeStart), endDate: new Date(episodeEnd), days });
  }

  return episodes;
}

// ─── Cycle day derivation ────────────────────────────────────────

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export function deriveCycleDay(
  samples: { startDate: Date; endDate: Date; value: number }[],
  today: Date,
): number | null {
  const episodes = groupEpisodes(samples);
  if (episodes.length === 0) return null;

  const lastEpisode = episodes[episodes.length - 1];

  // Normalise both ends to local midnight before subtracting so a sample
  // logged at 23:00 on day N still counts as "day 1" when the user checks
  // their cycle day at 07:00 on day N+1. Without this, the elapsed math
  // would silently bias toward "day 2" depending on capture time.
  const startOfDay = (d: Date): Date => {
    const out = new Date(d);
    out.setHours(0, 0, 0, 0);
    return out;
  };
  const lastStart = startOfDay(lastEpisode.startDate);
  const todayStart = startOfDay(today);
  const elapsed = todayStart.getTime() - lastStart.getTime();

  if (elapsed < 0) return null; // future "today" → no cycle day
  if (elapsed > SIXTY_DAYS_MS) return null;

  return Math.floor(elapsed / (1000 * 60 * 60 * 24)) + 1;
}

interface SyncOneDayResult {
  record: HealthDailyRecord;
  errors: string[];
}

async function syncOneDay(
  date: Date,
  userId: string,
  menstrualSamples90d?: { startDate: Date; endDate: Date; value: number }[],
): Promise<SyncOneDayResult> {
  const errors: string[] = [];
  const dateStr = localDateStr(date);
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const dateFilter = { date: { startDate: startOfDay, endDate: endOfDay } };

  // Sleep: total minutes + deep + REM.
  // HealthKit sleep samples mostly record asleepCore/Deep/REM with per-stage durations;
  // some sources use asleepUnspecified. Sum all asleep* variants into the total.
  let sleepTotal: number | null = null;
  let sleepDeep: number | null = null;
  let sleepRem: number | null = null;
  try {
    const samples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      limit: 0,
      filter: dateFilter,
    });
    let total = 0;
    let deep = 0;
    let rem = 0;
    for (const s of samples) {
      const minutes =
        (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
      if (
        s.value === CategoryValueSleepAnalysis.asleepUnspecified ||
        s.value === CategoryValueSleepAnalysis.asleepCore
      ) {
        total += minutes;
      } else if (s.value === CategoryValueSleepAnalysis.asleepDeep) {
        total += minutes;
        deep += minutes;
      } else if (s.value === CategoryValueSleepAnalysis.asleepREM) {
        total += minutes;
        rem += minutes;
      }
    }
    if (total > 0) sleepTotal = Math.round(total);
    if (deep > 0) sleepDeep = Math.round(deep);
    if (rem > 0) sleepRem = Math.round(rem);
  } catch (e: any) {
    errors.push(`sleep: ${e?.message ?? e}`);
  }

  // HRV (average of SDNN samples for the day).
  let hrv: number | null = null;
  try {
    const samples = await queryQuantitySamples(
      'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
      { limit: 0, filter: dateFilter, unit: 'ms' },
    );
    if (samples.length > 0) {
      hrv = samples.reduce((sum, s) => sum + s.quantity, 0) / samples.length;
    }
  } catch (e: any) {
    errors.push(`hrv: ${e?.message ?? e}`);
  }

  // Resting HR (take the most-recent sample in the range).
  let rhr: number | null = null;
  try {
    const samples = await queryQuantitySamples(
      'HKQuantityTypeIdentifierRestingHeartRate',
      { limit: 1, filter: dateFilter, ascending: false, unit: 'count/min' },
    );
    if (samples.length > 0) rhr = samples[0].quantity;
  } catch (e: any) {
    errors.push(`rhr: ${e?.message ?? e}`);
  }

  // Steps (sum).
  let steps: number | null = null;
  try {
    const samples = await queryQuantitySamples(
      'HKQuantityTypeIdentifierStepCount',
      { limit: 0, filter: dateFilter, unit: 'count' },
    );
    if (samples.length > 0) {
      steps = Math.round(samples.reduce((sum, s) => sum + s.quantity, 0));
    }
  } catch (e: any) {
    errors.push(`steps: ${e?.message ?? e}`);
  }

  // Mindful minutes (sum of durations; mindful sessions have no quantity).
  let mindful: number | null = null;
  try {
    const samples = await queryCategorySamples(
      'HKCategoryTypeIdentifierMindfulSession',
      { limit: 0, filter: dateFilter },
    );
    if (samples.length > 0) {
      mindful = Math.round(
        samples.reduce(
          (sum, s) =>
            sum +
            (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000,
          0,
        ),
      );
    }
  } catch (e: any) {
    errors.push(`mindful: ${e?.message ?? e}`);
  }

  // Menstrual flow (classify by most-severe sample for this day).
  let menstrualFlow: HealthDailyRecord['menstrual_flow'] = null;
  try {
    const samples = await queryCategorySamples(
      'HKCategoryTypeIdentifierMenstrualFlow',
      { limit: 0, filter: dateFilter },
    );
    if (samples.length > 0) {
      menstrualFlow = pickMaxSeverity(samples);
    }
  } catch (e: any) {
    errors.push(`menstrual: ${e?.message ?? e}`);
  }

  // Cycle day: derive from pre-fetched 90-day menstrual samples.
  const cycleDay = menstrualSamples90d
    ? deriveCycleDay(menstrualSamples90d, date)
    : null;

  const record: HealthDailyRecord = {
    health_daily_id: generateId(),
    user_id: userId,
    date: dateStr,
    source: 'apple_health',
    sleep_total_minutes: sleepTotal,
    sleep_deep_minutes: sleepDeep,
    sleep_rem_minutes: sleepRem,
    hrv_sdnn_ms: hrv,
    resting_hr_bpm: rhr,
    steps,
    mindful_minutes: mindful,
    menstrual_flow: menstrualFlow,
    cycle_day_estimated: cycleDay,
    synced_at: new Date().toISOString(),
    partial:
      sleepTotal === null && hrv === null && rhr === null,
  };

  return { record, errors };
}

export async function pullLastNDays(
  n: number,
  userId: string,
): Promise<{ records: HealthDailyRecord[]; errors: string[] }> {
  if (Platform.OS !== 'ios') {
    return { records: [], errors: ['platform_not_ios'] };
  }

  // Pre-fetch 90-day menstrual window once (for cycle day derivation).
  let menstrualSamples90d: { startDate: Date; endDate: Date; value: number }[] = [];
  try {
    const now = new Date();
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const samples = await queryCategorySamples(
      'HKCategoryTypeIdentifierMenstrualFlow',
      { limit: 0, filter: { date: { startDate: ninetyDaysAgo, endDate: now } } },
    );
    menstrualSamples90d = samples.map((s) => ({
      startDate: new Date(s.startDate),
      endDate: new Date(s.endDate),
      value: s.value as number,
    }));
  } catch {
    // Non-fatal: cycle_day_estimated will be null for all days.
  }

  const records: HealthDailyRecord[] = [];
  const errors: string[] = [];
  for (let daysAgo = 0; daysAgo < n; daysAgo++) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const result = await syncOneDay(date, userId, menstrualSamples90d);
    records.push(result.record);
    errors.push(...result.errors);
  }
  return { records, errors };
}

/**
 * Build a rolling N-day average of HealthKit signals from already-stored
 * records, plus the most-severe menstrual flow seen in that window. The
 * backend insights endpoint takes this so its L3 prompt can ground
 * pattern-level copy ("your sleep dropped 1h on average this week")
 * instead of only seeing the single scan's lifestyle log.
 *
 * Returns null fields when no record carried a value — never falls back to
 * a default, so the prompt can omit the line rather than lie.
 */
export function buildHealthkitRollup(
  records: HealthDailyRecord[],
  windowDays: number = 7,
  today: Date = new Date(),
): {
  window_days: number;
  sleep_total_minutes_avg: number | null;
  sleep_deep_minutes_avg: number | null;
  sleep_rem_minutes_avg: number | null;
  hrv_sdnn_ms_avg: number | null;
  resting_hr_bpm_avg: number | null;
  steps_avg: number | null;
  mindful_minutes_avg: number | null;
  menstrual_flow_last7: string | null;
  cycle_day: number | null;
} {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = localDateStr(cutoff);
  const todayStr = localDateStr(today);
  const recent = records.filter((r) => r.date >= cutoffStr && r.date <= todayStr);

  const avg = (key: keyof HealthDailyRecord): number | null => {
    let sum = 0;
    let n = 0;
    for (const r of recent) {
      const v = r[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        sum += v;
        n += 1;
      }
    }
    return n > 0 ? Math.round((sum / n) * 10) / 10 : null;
  };

  // Most-severe flow tag across the window — heaviness is what's clinically
  // useful, and severity_rank lets us pick "heavy" over "light" without
  // averaging categorical labels.
  let flow: string | null = null;
  let flowRank = -1;
  for (const r of recent) {
    if (!r.menstrual_flow) continue;
    const rank: Record<string, number> = {
      none: 0, unspecified: 1, light: 2, medium: 3, heavy: 4,
    };
    const score = rank[r.menstrual_flow] ?? -1;
    if (score > flowRank) {
      flowRank = score;
      flow = r.menstrual_flow;
    }
  }

  // Cycle day on today's record, if we have one.
  const todayRecord = recent.find((r) => r.date === todayStr);
  const cycleDay = todayRecord?.cycle_day_estimated ?? null;

  return {
    window_days: windowDays,
    sleep_total_minutes_avg: avg('sleep_total_minutes'),
    sleep_deep_minutes_avg: avg('sleep_deep_minutes'),
    sleep_rem_minutes_avg: avg('sleep_rem_minutes'),
    hrv_sdnn_ms_avg: avg('hrv_sdnn_ms'),
    resting_hr_bpm_avg: avg('resting_hr_bpm'),
    steps_avg: avg('steps'),
    mindful_minutes_avg: avg('mindful_minutes'),
    menstrual_flow_last7: flow,
    cycle_day: cycleDay,
  };
}

export async function detectCycleFromHealthKit(): Promise<{
  detected: boolean;
  lastPeriodStart: Date | null;
  cycleLengthDays: number | null;
  menstrualStatus: 'regular' | 'irregular' | null;
}> {
  if (Platform.OS !== 'ios') {
    return { detected: false, lastPeriodStart: null, cycleLengthDays: null, menstrualStatus: null };
  }
  try {
    const now = new Date();
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const samples = await queryCategorySamples(
      'HKCategoryTypeIdentifierMenstrualFlow',
      { limit: 0, filter: { date: { startDate: ninetyDaysAgo, endDate: now } } },
    );
    const typedSamples = samples.map((s) => ({
      startDate: new Date(s.startDate),
      endDate: new Date(s.endDate),
      value: s.value as number,
    }));
    const episodes = groupEpisodes(typedSamples);
    if (episodes.length === 0) {
      return { detected: false, lastPeriodStart: null, cycleLengthDays: null, menstrualStatus: null };
    }

    const lastPeriodStart = episodes[episodes.length - 1].startDate;

    let cycleLengthDays: number | null = null;
    let menstrualStatus: 'regular' | 'irregular' | null = null;
    if (episodes.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < episodes.length; i++) {
        const gap = Math.round(
          (episodes[i].startDate.getTime() - episodes[i - 1].startDate.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        gaps.push(gap);
      }
      const sorted = [...gaps].sort((a, b) => a - b);
      cycleLengthDays = sorted[Math.floor(sorted.length / 2)];
      const maxDeviation = Math.max(...gaps.map((g) => Math.abs(g - cycleLengthDays!)));
      menstrualStatus = maxDeviation <= 3 ? 'regular' : 'irregular';
    }

    return { detected: true, lastPeriodStart, cycleLengthDays, menstrualStatus };
  } catch {
    return { detected: false, lastPeriodStart: null, cycleLengthDays: null, menstrualStatus: null };
  }
}
