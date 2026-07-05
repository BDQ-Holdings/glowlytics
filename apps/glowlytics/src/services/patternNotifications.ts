import * as Notifications from 'expo-notifications';
import type { Pattern } from '../types';
import { trackEvent } from './analytics';

export async function maybeSendFirstPatternUnlockNotification(
  previousPatterns: Pattern[],
  newPatterns: Pattern[],
  alreadySent: boolean,
): Promise<boolean> {
  if (alreadySent) return false;

  const hadRealBefore = previousPatterns.some((p) => !p.isPredicted);
  const hasRealNow = newPatterns.some((p) => !p.isPredicted);
  if (hadRealBefore || !hasRealNow) return false;

  try {
    // Check notification permission
    const settings = await Notifications.getPermissionsAsync();
    if (!settings.granted) {
      const request = await Notifications.requestPermissionsAsync();
      if (!request.granted) return false;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your patterns are ready',
        body: `Your skin kept notes this month. ${newPatterns.filter((p) => !p.isPredicted).length} of them. Tap to read.`,
        data: { deepLink: '/(tabs)/today' },
      },
      trigger: null, // fire immediately
    });
    trackEvent('pattern_unlock_notification_shown', {
      pattern_count_at_unlock: newPatterns.filter((p) => !p.isPredicted).length,
    });
    return true;
  } catch (e: any) {
    trackEvent('pattern_engine_error', {
      error_message: `notification_failed: ${e?.message ?? e}`,
      stack_short: '',
    });
    return false;
  }
}
