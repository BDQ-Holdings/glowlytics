import type { BiologicalSex, MenstrualStatus, OnboardingScreenName } from '../types';

/**
 * Builds the onboarding screen flow based on user answers.
 *
 * Flow order:
 *   welcome → age-range → sex → skin-goal → health-permission
 *     → [menstrual → cycle-details]? (female AND !healthSyncedCycleDetected)
 *     → scan-reminder → preview → paywall
 *
 * The third argument `healthSyncedCycleDetected` is set by the health-permission
 * screen after granting HealthKit access. When true AND user is female, the manual
 * menstrual + cycle-details screens are skipped because HealthKit already provides
 * the cycle data.
 */
export function buildOnboardingFlow(
  sex?: BiologicalSex,
  menstrualStatus?: MenstrualStatus,
  healthSyncedCycleDetected?: boolean,
): OnboardingScreenName[] {
  const flow: OnboardingScreenName[] = [
    'welcome',
    'age-range',
    'sex',
    'skin-goal',
    'health-permission',
  ];

  // Female users who did NOT get cycle data from HealthKit: show manual screens.
  if (sex === 'female' && !healthSyncedCycleDetected) {
    flow.push('menstrual');
    if (menstrualStatus === 'regular' || menstrualStatus === 'irregular') {
      flow.push('cycle-details');
    }
  }

  flow.push('scan-reminder', 'preview', 'paywall');

  return flow;
}

/**
 * Longest currently possible path: female users with regular/irregular cycles
 * who do not import cycle data from HealthKit.
 */
export const LONGEST_ONBOARDING_FLOW_LENGTH = buildOnboardingFlow('female', 'regular').length;

/**
 * Progress UI excludes welcome and paywall while keeping a stable denominator
 * across shorter/longer paths.
 */
export const ONBOARDING_PROGRESS_DOT_COUNT = Math.max(LONGEST_ONBOARDING_FLOW_LENGTH - 2, 1);

/**
 * Maps an OnboardingScreenName to the Expo Router path.
 */
export function screenToRoute(screen: OnboardingScreenName): string {
  return `/onboarding/${screen}`;
}

/**
 * Returns the next screen in the flow, or null if at the end.
 */
export function getNextScreen(
  flow: OnboardingScreenName[],
  currentIndex: number,
): OnboardingScreenName | null {
  if (currentIndex + 1 >= flow.length) return null;
  return flow[currentIndex + 1];
}

/**
 * Returns the previous screen in the flow, or null if at the start.
 */
export function getPreviousScreen(
  flow: OnboardingScreenName[],
  currentIndex: number,
): OnboardingScreenName | null {
  if (currentIndex <= 0) return null;
  return flow[currentIndex - 1];
}
