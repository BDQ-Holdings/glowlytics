import { generateFirstLookInsight } from '../firstLookInsight';
import type { HealthDailyRecord } from '../../types';

const makeRecord = (
  date: string,
  overrides: Partial<HealthDailyRecord> = {},
): HealthDailyRecord => ({
  health_daily_id: `test_${date}`,
  user_id: 'u1',
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
  synced_at: new Date().toISOString(),
  partial: true,
  ...overrides,
});

describe('generateFirstLookInsight', () => {
  it('returns null when no health records', () => {
    expect(generateFirstLookInsight([])).toBeNull();
  });

  it('returns null when all records are fully partial', () => {
    const records = [makeRecord('2026-04-01'), makeRecord('2026-04-02')];
    expect(generateFirstLookInsight(records)).toBeNull();
  });

  it('generates sleep insight when sleep data is present', () => {
    const records = [
      makeRecord('2026-04-01', { sleep_total_minutes: 420, partial: false }),
      makeRecord('2026-04-02', { sleep_total_minutes: 380, partial: false }),
      makeRecord('2026-04-03', { sleep_total_minutes: 450, partial: false }),
    ];
    const insight = generateFirstLookInsight(records);
    expect(insight).not.toBeNull();
    expect(insight!.headline.length).toBeLessThanOrEqual(80);
    expect(insight!.detail.length).toBeLessThanOrEqual(200);
    expect(insight!.driver).toBeDefined();
  });

  it('generates cycle insight when cycle data is present', () => {
    const records = [
      makeRecord('2026-04-01', { cycle_day_estimated: 1, menstrual_flow: 'heavy', partial: false }),
      makeRecord('2026-04-02', { cycle_day_estimated: 2, menstrual_flow: 'medium', partial: false }),
    ];
    const insight = generateFirstLookInsight(records);
    expect(insight).not.toBeNull();
    expect(insight!.driver).toBe('cycle_setup');
  });

  it('prefers cycle insight over sleep when both present', () => {
    const records = [
      makeRecord('2026-04-01', {
        sleep_total_minutes: 420,
        cycle_day_estimated: 5,
        menstrual_flow: 'light',
        partial: false,
      }),
    ];
    const insight = generateFirstLookInsight(records);
    expect(insight).not.toBeNull();
    expect(insight!.driver).toBe('cycle_setup');
  });
});
