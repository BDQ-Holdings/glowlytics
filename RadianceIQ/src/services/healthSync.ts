import { Platform } from 'react-native';
import {
  queryCategorySamples,
  queryQuantitySamples,
  CategoryValueSleepAnalysis,
} from '@kingstinct/react-native-healthkit';
import type { HealthDailyRecord } from '../types';
import { localDateStr } from '../utils/localDate';

const generateId = () => `hdr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

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
      { limit: 0, filter: dateFilter },
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
      { limit: 1, filter: dateFilter, ascending: false },
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
      { limit: 0, filter: dateFilter },
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
      sleepTotal === null ||
      hrv === null ||
      rhr === null ||
      steps === null ||
      mindful === null,
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
