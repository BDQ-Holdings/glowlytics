import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const DAILY_SCAN_IDENTIFIER = 'daily-scan';
const RITUAL_IDENTIFIERS = {
  am: 'ritual-am',
  pm: 'ritual-pm',
} as const;

type ReminderTime = { hour: number; minute: number };
type RitualReminderSection = keyof typeof RITUAL_IDENTIFIERS;

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function scheduleDailyNotification(
  identifier: string,
  time: ReminderTime,
  title: string,
  body: string,
): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifier);

  const granted = await requestNotificationPermissions();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title,
      body,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.hour,
      minute: time.minute,
    },
  });
}

export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  await scheduleDailyNotification(
    DAILY_SCAN_IDENTIFIER,
    { hour, minute },
    'Time for your skin scan',
    'Take 30 seconds to track your progress.',
  );
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_SCAN_IDENTIFIER);
}

export async function scheduleRitualReminder(
  section: RitualReminderSection,
  time: ReminderTime,
): Promise<void> {
  await scheduleDailyNotification(
    RITUAL_IDENTIFIERS[section],
    time,
    section === 'am' ? 'Morning ritual' : 'Evening ritual',
    section === 'am'
      ? 'A few small steps are waiting for your morning routine.'
      : 'Wind down with your evening skin ritual.',
  );
}

export async function cancelRitualReminder(section: RitualReminderSection): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(RITUAL_IDENTIFIERS[section]);
}

export async function cancelAllAppNotifications(): Promise<void> {
  await Promise.all([
    cancelDailyReminder(),
    cancelRitualReminder('am'),
    cancelRitualReminder('pm'),
  ]);
}

/**
 * One-time upgrade path: builds before the identifier-based scheduler used
 * cancelAllScheduledNotificationsAsync + identifier-less scheduling, so the
 * per-identifier cancels above can never reach a pre-upgrade reminder — it
 * would keep firing forever and re-enabling would stack a second one.
 * Nukes everything; the caller reschedules enabled reminders afterwards.
 */
export async function migrateLegacyNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
