import type {
  Pattern,
  PatternSignal,
  UserProfile,
} from '../types';

export interface PredictedPatternTemplate {
  id: string;
  triggerWhen: (profile: UserProfile) => boolean;
  headline: string;
  detail: string;
  signal: PatternSignal;
  driver: string;
  driverLabel: string;
  unlocksAtDay: number;
  requiresHealthKit: boolean;
}

/**
 * Static table of pattern priors. When a user has < 2 real patterns, the engine
 * fills the remaining slots with these templated "watching" patterns based on
 * which triggerWhen predicates fire for the user's profile.
 */
export const PATTERN_PRIORS: PredictedPatternTemplate[] = [
  {
    id: 'cycle_inflammation_prior',
    triggerWhen: (p) => p.sex === 'female' && p.menstrual_status === 'regular',
    headline: 'Most cycles produce a 3-7 day inflammation peak before each period',
    detail:
      'In our data, most regularly cycling users see this pattern by day 14. We are tracking yours.',
    signal: 'inflammation',
    driver: 'cycle_day',
    driverLabel: 'cycle',
    unlocksAtDay: 14,
    requiresHealthKit: false,
  },
  {
    id: 'sleep_hydration_prior',
    triggerWhen: () => true,
    headline: 'Sleep is the strongest predictor of next-day hydration',
    detail:
      'Most users see this within 2 weeks once they sync Apple Health. Connect Health to unlock yours.',
    signal: 'hydration',
    driver: 'sleep_total_minutes',
    driverLabel: 'sleep',
    unlocksAtDay: 14,
    requiresHealthKit: true,
  },
  {
    id: 'alcohol_inflammation_prior',
    triggerWhen: (p) => {
      const freq = p.drink_baseline_frequency;
      if (typeof freq !== 'string') return false;
      return freq !== 'never' && freq !== '';
    },
    headline: 'Alcohol affects inflammation in most users, usually within 14 days',
    detail:
      'Your baseline says you drink semi-regularly. If alcohol is moving your skin, we will see it.',
    signal: 'inflammation',
    driver: 'drinks_yesterday',
    driverLabel: 'alcohol',
    unlocksAtDay: 14,
    requiresHealthKit: false,
  },
  {
    id: 'stress_overall_prior',
    triggerWhen: () => true,
    headline: 'High-stress days correlate with skin score drops the next day',
    detail:
      'Stress is the #1 lifestyle factor in our data. Track it daily to see your version.',
    signal: 'overall',
    driver: 'stress_level',
    driverLabel: 'stress',
    unlocksAtDay: 10,
    requiresHealthKit: false,
  },
  {
    id: 'hrv_inflammation_prior',
    triggerWhen: () => true,
    headline: 'Low HRV nights often precede inflammation spikes',
    detail: 'HRV is the most sensitive signal for upcoming flares. Requires Apple Health.',
    signal: 'inflammation',
    driver: 'hrv_sdnn_ms',
    driverLabel: 'HRV',
    unlocksAtDay: 14,
    requiresHealthKit: true,
  },
  {
    id: 'product_trajectory_prior',
    triggerWhen: (p) => p.onboarding_complete === true,
    headline: 'Every product you add gets a before/after trajectory analysis',
    detail:
      'As soon as you have used a product for 14 days, we will show you how it moved your skin.',
    signal: 'overall',
    driver: 'product_start',
    driverLabel: 'products',
    unlocksAtDay: 14,
    requiresHealthKit: false,
  },
];

/**
 * Select up to `maxCount` relevant predicted patterns for a user profile.
 * Returns fully-formed Pattern objects with isPredicted = true.
 */
export function selectPredictedPatterns(profile: UserProfile, maxCount = 3): Pattern[] {
  const now = new Date().toISOString();
  return PATTERN_PRIORS
    .filter((tpl) => tpl.triggerWhen(profile))
    .slice(0, maxCount)
    .map((tpl) => ({
      id: tpl.id,
      type: 'health_signal_lag' as const, // placeholder; predicted patterns don't have detected type
      signal: tpl.signal,
      driver: tpl.driver,
      driverLabel: tpl.driverLabel,
      confidence: 'watching' as const,
      correlationCoefficient: 0,
      sampleSize: 0,
      lagDays: 0,
      insightText: tpl.headline,
      detailText: tpl.detail,
      chartData: [],
      detectedAt: now,
      firstSeenAt: now,
      isPredicted: true,
      requiresHealthKit: tpl.requiresHealthKit,
      unlocksAtDay: tpl.unlocksAtDay,
    }));
}
