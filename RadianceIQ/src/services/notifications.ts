import * as Notifications from 'expo-notifications';
import type { PrimaryGoal } from '../types';
import { getTipsForGoal } from '../constants/skinTips';
import { trackEvent } from './analytics';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Identifier scheme ───────────────────────────────────────────────────
// Every notification we schedule carries a stable, prefixed identifier so we
// can cancel *only* our own notifications by category — never a blanket
// cancelAllScheduledNotificationsAsync(), which would also wipe pattern-unlock
// notifications and create the "old + new both persist" class of bugs when a
// reschedule is interrupted mid-flight.
const PREFIX = 'glow';
export const DAILY_PREFIX = `${PREFIX}-daily-`;
export const DROPOFF_PREFIX = `${PREFIX}-dropoff-`;

// How many days of rotating daily reminders to seed ahead. Re-seeded whenever
// the app opens or settings change, so the window keeps rolling forward. If the
// user goes longer than this without opening the app, the drop-off series takes
// over re-engagement.
const DAILY_HORIZON_DAYS = 14;

// Exponential-ish day offsets (from the last scan) for re-engagement reminders.
const DROPOFF_OFFSETS_DAYS = [2, 4, 8, 16, 30];

export interface EngagementSyncOptions {
  enabled: boolean;
  /** "HH:MM" — the user's chosen reminder time. */
  time: string | null;
  goal: PrimaryGoal | null | undefined;
  /** Whether to use goal-personalized tip copy in daily reminders. */
  personalizedTips: boolean;
  /** "YYYY-MM-DD" date of the most recent scan, or null if never scanned. */
  lastScanDate: string | null;
}

// ─── Permissions ─────────────────────────────────────────────────────────
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function hasPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

// ─── Identifier-based cancellation ───────────────────────────────────────
/**
 * Cancels every scheduled notification whose identifier starts with `prefix`.
 * Enumerates the pending queue and cancels by id, leaving notifications we do
 * not own (e.g. immediate pattern-unlock alerts) untouched.
 */
async function cancelByPrefix(prefix: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => typeof n.identifier === 'string' && n.identifier.startsWith(prefix))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

// ─── Time helpers ────────────────────────────────────────────────────────
function parseTime(time: string | null): { hour: number; minute: number } {
  const [h, m] = (time || '08:00').split(':').map(Number);
  return {
    hour: Number.isFinite(h) ? h : 8,
    minute: Number.isFinite(m) ? m : 0,
  };
}

/** A Date `daysFromNow` days ahead, at the given local hour:minute. */
function dateAtOffset(daysFromNow: number, hour: number, minute: number): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

// ─── Daily scan reminder (rotating, semi-personalized) ───────────────────
/**
 * Schedules a rolling window of daily scan reminders, each carrying a rotating
 * goal-specific tip. Replaces any previously scheduled daily reminders by
 * cancelling our daily-prefixed ids first — this is the robust fix for stale
 * reminders persisting after a time change.
 */
export async function scheduleDailyReminder(
  hour: number,
  minute: number,
  goal?: PrimaryGoal | null,
  personalizedTips = true,
): Promise<void> {
  // Cancel our prior daily reminders first so a time/goal change never leaves
  // an orphaned series behind.
  await cancelByPrefix(DAILY_PREFIX);

  const granted = await requestNotificationPermissions();
  if (!granted) return;

  const tips = personalizedTips ? getTipsForGoal(goal) : getTipsForGoal(null);
  const now = Date.now();

  for (let i = 0; i < DAILY_HORIZON_DAYS; i++) {
    const fireDate = dateAtOffset(i, hour, minute);
    // Skip a slot whose time has already passed today.
    if (fireDate.getTime() <= now) continue;
    const tip = tips[i % tips.length];
    await Notifications.scheduleNotificationAsync({
      identifier: `${DAILY_PREFIX}${i}`,
      content: {
        title: tip.title,
        body: tip.body,
        sound: true,
        data: { deepLink: '/(tabs)/camera', kind: 'daily_reminder', tipId: tip.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
    });
  }
}

export async function cancelDailyReminder(): Promise<void> {
  await cancelByPrefix(DAILY_PREFIX);
}

// ─── Exponential drop-off re-engagement reminders ────────────────────────
const DROPOFF_COPY: { title: string; body: string }[] = [
  { title: 'Your skin changes daily', body: 'A 30-second scan keeps your trend line moving. Ready?' },
  { title: 'A few days off?', body: 'Consistency is how the small wins add up. Jump back in with a quick scan.' },
  { title: 'There is a gap in your trend', body: "It's been over a week. One scan picks up right where you left off." },
  { title: 'We miss tracking with you', body: 'Your skin has kept changing — see what you missed in 30 seconds.' },
  { title: 'Restart your streak today', body: 'One scan reopens your insights and gets you back on track.' },
];

/**
 * Schedules an escalating series of re-engagement reminders anchored to the
 * user's last scan. Offsets already in the past (because the user has lapsed)
 * are skipped, so the next reminder always fires at the right cadence.
 */
export async function scheduleDropoffReminders(
  lastScanDate: string | null,
  hour: number,
  minute: number,
): Promise<void> {
  await cancelByPrefix(DROPOFF_PREFIX);

  if (!(await hasPermission())) return;

  // Anchor: last scan date at local midnight, or today if never scanned.
  const anchor = lastScanDate ? new Date(`${lastScanDate}T00:00:00`) : new Date();
  if (Number.isNaN(anchor.getTime())) return;
  const now = Date.now();

  for (let i = 0; i < DROPOFF_OFFSETS_DAYS.length; i++) {
    const fireDate = new Date(anchor);
    fireDate.setDate(fireDate.getDate() + DROPOFF_OFFSETS_DAYS[i]);
    fireDate.setHours(hour, minute, 0, 0);
    if (fireDate.getTime() <= now) continue; // past offset — user already lapsed past it
    const copy = DROPOFF_COPY[i] ?? DROPOFF_COPY[DROPOFF_COPY.length - 1];
    await Notifications.scheduleNotificationAsync({
      identifier: `${DROPOFF_PREFIX}${DROPOFF_OFFSETS_DAYS[i]}`,
      content: {
        title: copy.title,
        body: copy.body,
        sound: true,
        data: { deepLink: '/(tabs)/camera', kind: 'dropoff', offsetDays: DROPOFF_OFFSETS_DAYS[i] },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
    });
  }
}

export async function cancelDropoffReminders(): Promise<void> {
  await cancelByPrefix(DROPOFF_PREFIX);
}

// ─── Orchestrator ────────────────────────────────────────────────────────
/**
 * Single entry point that brings all engagement notifications into sync with
 * the current app state. Idempotent — safe to call on app start, on foreground,
 * after each scan, and whenever notification settings change.
 */
export async function syncEngagementNotifications(opts: EngagementSyncOptions): Promise<void> {
  const { enabled, time, goal, personalizedTips, lastScanDate } = opts;

  // Disabled (or permission revoked) → tear down everything we own.
  if (!enabled || !(await hasPermission())) {
    await cancelByPrefix(DAILY_PREFIX);
    await cancelByPrefix(DROPOFF_PREFIX);
    return;
  }

  const { hour, minute } = parseTime(time);
  try {
    await scheduleDailyReminder(hour, minute, goal, personalizedTips);
    await scheduleDropoffReminders(lastScanDate, hour, minute);
  } catch (e: any) {
    trackEvent('notification_schedule_error', { error_message: String(e?.message ?? e) });
  }
}
