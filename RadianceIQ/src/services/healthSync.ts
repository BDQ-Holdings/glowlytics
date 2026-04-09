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
  let maxRank = -1;
  let maxLabel: MenstrualFlowLevel = 'none';
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
  const elapsed = today.getTime() - lastEpisode.startDate.getTime();

  if (elapsed > SIXTY_DAYS_MS) return null;

  return Math.floor(elapsed / (1000 * 60 * 60 * 24)) + 1;
}

interface SyncOneDayResult {
  record: HealthDailyRecord;
  errors: string[];
}

async function syncOneDay(date: Date, userId: string): Promise<SyncOneDayResult> {
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
  const records: HealthDailyRecord[] = [];
  const errors: string[] = [];
  for (let daysAgo = 0; daysAgo < n; daysAgo++) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const result = await syncOneDay(date, userId);
    records.push(result.record);
    errors.push(...result.errors);
  }
  return { records, errors };
}
