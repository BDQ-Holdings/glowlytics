import type { FirstLookInsight, HealthDailyRecord } from '../types';

/**
 * Generates a Day-1 insight from HealthKit bootstrap data.
 * Minimal v1: picks the most interesting metric and writes a simple headline.
 */
export function generateFirstLookInsight(
  healthRecords: HealthDailyRecord[],
): FirstLookInsight | null {
  if (healthRecords.length === 0) return null;

  // Check for cycle data first (highest value — most personal/novel).
  const withCycle = healthRecords.filter(
    (r) => r.cycle_day_estimated !== null && r.menstrual_flow !== null,
  );
  if (withCycle.length >= 1) {
    const latest = withCycle[withCycle.length - 1];
    return {
      headline: `Cycle day ${latest.cycle_day_estimated}. Tracking started.`,
      detail:
        'Glowlytics will correlate your cycle with skin changes over the next few weeks. Patterns typically emerge after 2-3 cycles.',
      driver: 'cycle_setup',
    };
  }

  // Check for sleep data.
  const withSleep = healthRecords.filter((r) => r.sleep_total_minutes !== null);
  if (withSleep.length >= 3) {
    const avg = Math.round(
      withSleep.reduce((sum, r) => sum + r.sleep_total_minutes!, 0) / withSleep.length,
    );
    const hours = Math.floor(avg / 60);
    const mins = avg % 60;
    return {
      headline: `You average ${hours}h ${mins}m of sleep.`,
      detail:
        "Sleep is one of the strongest predictors of skin health. We'll track how your scores change with your sleep patterns.",
      driver: 'positive_percentile',
    };
  }

  // Check for HRV.
  const withHrv = healthRecords.filter((r) => r.hrv_sdnn_ms !== null);
  if (withHrv.length >= 3) {
    const avg = Math.round(
      withHrv.reduce((sum, r) => sum + r.hrv_sdnn_ms!, 0) / withHrv.length,
    );
    return {
      headline: `Your average HRV is ${avg} ms.`,
      detail:
        'Heart rate variability reflects your stress and recovery. Both affect skin. Higher HRV often correlates with clearer skin.',
      driver: 'positive_percentile',
    };
  }

  // Not enough data for any insight.
  return null;
}
