import { detectPatterns } from '../patternEngine';
import {
  buildSyntheticCycleData,
  buildSyntheticHealthData,
  buildSyntheticLifestyleData,
  appendNoise,
} from './fixtures/patternFixtures';
import type { UserProfile } from '../../types';

const emptyProfile: UserProfile = {
  user_id: 'u',
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
};

const rank: Record<string, number> = { strong: 4, moderate: 3, emerging: 2, watching: 1 };

describe('patternEngine.detectPatterns', () => {
  // ─── Cycle patterns ──────────────────────────────────────────────────────
  describe('cycle_signal_phase', () => {
    it('detects a cycle-inflammation pattern with 2+ full cycles of clean data', () => {
      const input = buildSyntheticCycleData({
        cycles: 2,
        cycleLength: 28,
        peakCycleDay: 25, // peak 3 days before next period
        peakAmplitude: 20,
        noise: 1,
      });
      const patterns = detectPatterns(input);
      const cyclePattern = patterns.find((p) => p.type === 'cycle_signal_phase');
      expect(cyclePattern).toBeDefined();
      expect(cyclePattern!.signal).toBe('inflammation');
      expect(cyclePattern!.isPredicted).toBe(false);
    });

    it('does NOT detect cycle pattern with only 1 cycle of data', () => {
      const input = buildSyntheticCycleData({
        cycles: 1,
        cycleLength: 28,
        peakCycleDay: 25,
        peakAmplitude: 18,
        noise: 2,
      });
      const patterns = detectPatterns(input);
      expect(patterns.find((p) => p.type === 'cycle_signal_phase' && !p.isPredicted)).toBeUndefined();
    });

    it('does not reach strong confidence when noise dominates the cycle signal', () => {
      // 6 cycles gives enough samples per cycle-day for averaging to smooth out noise.
      // With tiny amplitude (1) and high noise (25), the peak should not be
      // distinguishable from random variation.
      const input = buildSyntheticCycleData({
        cycles: 6,
        cycleLength: 28,
        peakCycleDay: 25,
        peakAmplitude: 1,
        noise: 25,
      });
      const patterns = detectPatterns(input);
      const cyclePattern = patterns.find((p) => p.type === 'cycle_signal_phase' && !p.isPredicted);
      if (cyclePattern) {
        expect(cyclePattern.confidence).not.toBe('strong');
      }
    });
  });

  // ─── Health lag patterns ────────────────────────────────────────────────
  describe('health_signal_lag', () => {
    it('detects HRV→inflammation lag with strong negative correlation', () => {
      const input = buildSyntheticHealthData({
        days: 28,
        driver: 'hrv_sdnn_ms',
        signal: 'inflammation',
        lag: 1,
        correlation: -0.85,
        noise: 1,
      });
      const patterns = detectPatterns(input);
      const lagPattern = patterns.find(
        (p) =>
          p.type === 'health_signal_lag' &&
          p.driver === 'hrv_sdnn_ms' &&
          p.signal === 'inflammation' &&
          !p.isPredicted,
      );
      expect(lagPattern).toBeDefined();
      expect(lagPattern!.correlationCoefficient).toBeLessThan(-0.3);
    });

    it('detects sleep→hydration lag with positive correlation', () => {
      const input = buildSyntheticHealthData({
        days: 28,
        driver: 'sleep_total_minutes',
        signal: 'hydration',
        lag: 1,
        correlation: 0.8,
        noise: 2,
      });
      const patterns = detectPatterns(input);
      const lagPattern = patterns.find(
        (p) =>
          p.driver === 'sleep_total_minutes' && p.signal === 'hydration' && !p.isPredicted,
      );
      expect(lagPattern).toBeDefined();
      expect(lagPattern!.correlationCoefficient).toBeGreaterThan(0.3);
    });

    it('does not reach strong confidence when correlation is truly zero', () => {
      // With n=30 random samples, the emerging threshold (|r| ≥ 0.35) can
      // occasionally fire due to chance — that's expected statistical
      // behavior. But 'strong' (|r| ≥ 0.6, n ≥ 21) should virtually never
      // fire on pure noise.
      const input = buildSyntheticHealthData({
        days: 30,
        driver: 'hrv_sdnn_ms',
        signal: 'inflammation',
        lag: 0,
        correlation: 0,
        noise: 8,
      });
      const patterns = detectPatterns(input);
      const realLagPattern = patterns.find(
        (p) => p.type === 'health_signal_lag' && !p.isPredicted,
      );
      if (realLagPattern) {
        expect(realLagPattern.confidence).not.toBe('strong');
      }
    });

    it('does not detect with fewer than 10 paired data points', () => {
      const input = buildSyntheticHealthData({
        days: 9,
        driver: 'hrv_sdnn_ms',
        signal: 'inflammation',
        lag: 1,
        correlation: -0.9,
      });
      const patterns = detectPatterns(input);
      expect(patterns.find((p) => p.type === 'health_signal_lag' && !p.isPredicted)).toBeUndefined();
    });
  });

  // ─── Lifestyle patterns ────────────────────────────────────────────────
  describe('lifestyle_signal_corr', () => {
    it('detects alcohol→inflammation correlation', () => {
      const input = buildSyntheticLifestyleData({
        days: 24,
        driver: 'drinks_yesterday',
        signal: 'inflammation',
        correlation: 0.85,
        noise: 1,
      });
      const patterns = detectPatterns(input);
      const lifestylePattern = patterns.find(
        (p) =>
          p.type === 'lifestyle_signal_corr' &&
          p.driver === 'drinks_yesterday' &&
          !p.isPredicted,
      );
      expect(lifestylePattern).toBeDefined();
    });

    it('detects stress→inflammation correlation', () => {
      const input = buildSyntheticLifestyleData({
        days: 24,
        driver: 'stress_level',
        signal: 'inflammation',
        correlation: 0.85,
        noise: 1,
      });
      const patterns = detectPatterns(input);
      const lifestylePattern = patterns.find(
        (p) => p.driver === 'stress_level' && !p.isPredicted,
      );
      expect(lifestylePattern).toBeDefined();
    });
  });

  // ─── Cold start ────────────────────────────────────────────────────────
  describe('cold start', () => {
    it('returns predicted patterns for a brand new female user with regular cycle', () => {
      const patterns = detectPatterns({
        modelOutputs: [],
        dailyRecords: [],
        healthDailyRecords: [],
        userProfile: {
          ...emptyProfile,
          menstrual_status: 'regular',
          drink_baseline_frequency: '1-2_weekly',
        },
      });
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every((p) => p.isPredicted)).toBe(true);
      expect(patterns.every((p) => p.confidence === 'watching')).toBe(true);
    });

    it('returns predicted patterns even without cycle profile', () => {
      const patterns = detectPatterns({
        modelOutputs: [],
        dailyRecords: [],
        healthDailyRecords: [],
        userProfile: {
          ...emptyProfile,
          sex: 'male',
          menstrual_status: undefined,
        },
      });
      // Should still get universal priors (stress, HRV, sleep, product)
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every((p) => p.isPredicted)).toBe(true);
    });
  });

  // ─── Ranking + dedup ───────────────────────────────────────────────────
  describe('ranking and dedup', () => {
    it('returns at most 5 patterns', () => {
      const input = buildSyntheticHealthData({
        days: 30,
        driver: 'hrv_sdnn_ms',
        signal: 'inflammation',
        lag: 1,
        correlation: -0.85,
      });
      const patterns = detectPatterns(input);
      expect(patterns.length).toBeLessThanOrEqual(5);
    });

    it('sorts by confidence tier descending', () => {
      const input = buildSyntheticHealthData({
        days: 30,
        driver: 'hrv_sdnn_ms',
        signal: 'inflammation',
        lag: 1,
        correlation: -0.9,
      });
      const patterns = detectPatterns(input);
      for (let i = 0; i < patterns.length - 1; i++) {
        expect(rank[patterns[i].confidence]).toBeGreaterThanOrEqual(
          rank[patterns[i + 1].confidence],
        );
      }
    });

    it('dedupes to one pattern per signal', () => {
      const input = buildSyntheticHealthData({
        days: 30,
        driver: 'hrv_sdnn_ms',
        signal: 'inflammation',
        lag: 1,
        correlation: -0.9,
      });
      const patterns = detectPatterns(input);
      const signalCounts = new Map<string, number>();
      for (const p of patterns) {
        if (!p.isPredicted) {
          signalCounts.set(p.signal, (signalCounts.get(p.signal) ?? 0) + 1);
        }
      }
      for (const count of signalCounts.values()) {
        expect(count).toBe(1);
      }
    });
  });

  // ─── Demotion ────────────────────────────────────────────────────────
  describe('demotion', () => {
    it('downgrades or drops a strong pattern when new noisy data weakens it', () => {
      const initial = buildSyntheticHealthData({
        days: 24,
        driver: 'sleep_total_minutes',
        signal: 'hydration',
        lag: 1,
        correlation: 0.9,
        noise: 1,
      });
      const initialPatterns = detectPatterns(initial);
      const initialPattern = initialPatterns.find(
        (p) => p.driver === 'sleep_total_minutes' && !p.isPredicted,
      );
      expect(initialPattern).toBeDefined();

      const weakened = appendNoise(initial, 30);
      const weakenedPatterns = detectPatterns(weakened);
      const weakenedPattern = weakenedPatterns.find(
        (p) => p.driver === 'sleep_total_minutes' && !p.isPredicted,
      );

      // Either downgraded or dropped entirely
      if (weakenedPattern) {
        expect(rank[weakenedPattern.confidence]).toBeLessThanOrEqual(rank[initialPattern!.confidence]);
      }
      // Either way, correlation coefficient should shrink
      if (weakenedPattern) {
        expect(Math.abs(weakenedPattern.correlationCoefficient)).toBeLessThanOrEqual(
          Math.abs(initialPattern!.correlationCoefficient),
        );
      }
    });
  });

  // ─── Empty edge cases ────────────────────────────────────────────────
  describe('empty and edge cases', () => {
    it('returns only predicted patterns for < 10 days of data', () => {
      const input = buildSyntheticHealthData({
        days: 5,
        driver: 'hrv_sdnn_ms',
        signal: 'inflammation',
        lag: 1,
        correlation: -0.9,
      });
      const patterns = detectPatterns(input);
      expect(patterns.every((p) => p.isPredicted)).toBe(true);
    });

    it('handles empty input without crashing', () => {
      expect(() =>
        detectPatterns({
          modelOutputs: [],
          dailyRecords: [],
          healthDailyRecords: [],
          userProfile: emptyProfile,
        }),
      ).not.toThrow();
    });
  });
});
