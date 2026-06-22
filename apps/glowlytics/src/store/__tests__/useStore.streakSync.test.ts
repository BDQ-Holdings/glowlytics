/**
 * Regression tests for two Today/health-sync bugs:
 *  - #45 getStreak() reset to 0 every morning before the day's first scan.
 *  - #11 a sync killed mid-flight persisted in_progress:true and the mutex then
 *    short-circuited every future sync forever; cold start must reset it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../useStore';
import { localDateStr } from '../../utils/localDate';
import type { DailyRecord, HealthDailyRecord } from '../../types';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('uuid', () => ({ v4: () => `test-id-${Math.random().toString(36).slice(2)}` }));
jest.mock('react-native-get-random-values', () => {});
jest.mock('react-native-purchases', () => ({ LOG_LEVEL: { ERROR: 0 } }));
jest.mock('react-native-purchases-ui', () => ({ PAYWALL_RESULT: {} }));
jest.mock('../../services/secureStorage', () => ({
  encryptJson: jest.fn((o: unknown) => Promise.resolve(JSON.stringify(o))),
  decryptJson: jest.fn(() => Promise.resolve(null)),
}));

const secureStorage = require('../../services/secureStorage');

// getStreak only reads `date`; the rest of DailyRecord is irrelevant here, so
// build minimal shapes and widen through unknown (ts-no-any compliant).
const recOn = (date: string): DailyRecord => ({ date } as unknown as DailyRecord);
const dayStr = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return localDateStr(d);
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getStreak — morning grace (#45)', () => {
  it('keeps the streak alive through yesterday when today is not scanned yet', () => {
    // Scanned yesterday and the day before, but NOT today (typical morning).
    useStore.setState({ dailyRecords: [recOn(dayStr(2)), recOn(dayStr(1))] });
    // Pre-fix this returned 0 (walk started at today, missed, broke immediately).
    expect(useStore.getState().getStreak()).toBe(2);
  });

  it('counts today + the run behind it once today is scanned', () => {
    useStore.setState({ dailyRecords: [recOn(dayStr(2)), recOn(dayStr(1)), recOn(dayStr(0))] });
    expect(useStore.getState().getStreak()).toBe(3);
  });

  it('breaks on a real gap (neither today nor yesterday scanned)', () => {
    useStore.setState({ dailyRecords: [recOn(dayStr(3)), recOn(dayStr(2))] });
    expect(useStore.getState().getStreak()).toBe(0);
  });

  it('is 0 with no records', () => {
    useStore.setState({ dailyRecords: [] });
    expect(useStore.getState().getStreak()).toBe(0);
  });
});

describe('loadPersistedData — health sync flag reset (#11)', () => {
  it('forces healthSyncStatus.in_progress false on restore so sync is never wedged', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('cipher');
    secureStorage.decryptJson.mockResolvedValueOnce({
      user: { user_id: 'user_A', onboarding_complete: true },
      healthSyncStatus: {
        last_sync_at: '2026-06-20T00:00:00.000Z',
        last_success_at: null,
        last_error: null,
        in_progress: true, // persisted while a sync was killed mid-flight
      },
    });

    await useStore.getState().loadPersistedData();

    expect(useStore.getState().healthSyncStatus.in_progress).toBe(false);
    // Other persisted fields on the status are preserved.
    expect(useStore.getState().healthSyncStatus.last_sync_at).toBe('2026-06-20T00:00:00.000Z');
  });
});

describe('loadPersistedData — onboarding flow restore (#34)', () => {
  it('restores the persisted flow verbatim instead of rebuilding (no menstrual re-insert)', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('cipher');
    // Female user whose persisted flow SKIPPED the manual menstrual screens
    // (HealthKit supplied cycle data). The old rebuild dropped that decision and
    // re-inserted them, desyncing the resume index.
    const persistedFlow = [
      'welcome', 'age-range', 'sex', 'skin-goal', 'camera-permission',
      'health-permission', 'scan-reminder', 'preview', 'paywall',
    ];
    secureStorage.decryptJson.mockResolvedValueOnce({
      user: { user_id: 'user_A', onboarding_complete: false, sex: 'female' },
      onboardingFlow: persistedFlow,
      onboardingFlowIndex: 6,
    });

    await useStore.getState().loadPersistedData();

    const s = useStore.getState();
    expect(s.onboardingFlow).toEqual(persistedFlow);
    expect(s.onboardingFlow).not.toContain('menstrual');
    expect(s.onboardingFlowIndex).toBe(6);
  });
});

describe('upsertHealthDailyRecord — non-destructive merge (#13)', () => {
  const healthRec = (date: string, over: Partial<HealthDailyRecord>): HealthDailyRecord => ({
    health_daily_id: `h-${date}`,
    user_id: 'user_A',
    date,
    source: 'apple_health',
    sleep_total_minutes: null,
    sleep_deep_minutes: null,
    sleep_rem_minutes: null,
    hrv_sdnn_ms: null,
    resting_hr_bpm: null,
    steps: null,
    mindful_minutes: null,
    menstrual_flow: null,
    cycle_day_estimated: null,
    synced_at: '2026-06-20T00:00:00.000Z',
    partial: true,
    ...over,
  });

  it('keeps prior metrics when a later sync returns an all-null (failed) record', () => {
    const date = '2026-06-19';
    useStore.setState({ healthDailyRecords: [] });
    useStore.getState().upsertHealthDailyRecord(
      date,
      healthRec(date, { sleep_total_minutes: 420, hrv_sdnn_ms: 55, resting_hr_bpm: 58, steps: 8000, partial: false }),
    );
    // Transient HealthKit failure → all-null record for the same day.
    useStore.getState().upsertHealthDailyRecord(date, healthRec(date, {}));

    const rec = useStore.getState().healthDailyRecords.find((r) => r.date === date);
    expect(rec?.sleep_total_minutes).toBe(420);
    expect(rec?.hrv_sdnn_ms).toBe(55);
    expect(rec?.resting_hr_bpm).toBe(58);
    expect(rec?.steps).toBe(8000);
    expect(rec?.partial).toBe(false);
  });
});
