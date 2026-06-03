import {
  scheduleDailyReminder,
  cancelDailyReminder,
  scheduleDropoffReminders,
  cancelDropoffReminders,
  syncEngagementNotifications,
  DAILY_PREFIX,
  DROPOFF_PREFIX,
} from '../notifications';
import { SKIN_TIPS } from '../../constants/skinTips';
import { localDateStr } from '../../utils/localDate';

// Stateful in-memory mock that mirrors expo's identifier semantics: scheduling
// with an existing identifier replaces it, and getAll/cancel operate by id.
jest.mock('expo-notifications', () => {
  let scheduled: any[] = [];
  let permission = 'granted';
  return {
    SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily' },
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => ({ status: permission })),
    requestPermissionsAsync: jest.fn(async () => ({ status: permission })),
    getAllScheduledNotificationsAsync: jest.fn(async () =>
      scheduled.map((s) => ({ identifier: s.identifier, content: s.content, trigger: s.trigger })),
    ),
    scheduleNotificationAsync: jest.fn(async (req: any) => {
      const id = req.identifier || `auto-${Math.random()}`;
      scheduled = scheduled.filter((s) => s.identifier !== id);
      scheduled.push({ identifier: id, content: req.content, trigger: req.trigger });
      return id;
    }),
    cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
      scheduled = scheduled.filter((s) => s.identifier !== id);
    }),
    cancelAllScheduledNotificationsAsync: jest.fn(async () => {
      scheduled = [];
    }),
    // test helpers
    __getScheduled: () => scheduled,
    __reset: () => {
      scheduled = [];
      permission = 'granted';
    },
    __setPermission: (p: string) => {
      permission = p;
    },
  };
});

jest.mock('../analytics', () => ({ trackEvent: jest.fn() }));

const Notifications = require('expo-notifications');

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
}

beforeEach(() => {
  Notifications.__reset();
  jest.clearAllMocks();
});

describe('scheduleDailyReminder', () => {
  it('schedules a rolling window of reminders all under the daily prefix', async () => {
    await scheduleDailyReminder(9, 0, 'acne');
    const ids = Notifications.__getScheduled().map((s: any) => s.identifier);
    expect(ids.length).toBeGreaterThanOrEqual(13); // 13 or 14 depending on time of day
    expect(ids.every((id: string) => id.startsWith(DAILY_PREFIX))).toBe(true);
  });

  it('uses goal-specific personalized tip copy', async () => {
    await scheduleDailyReminder(9, 0, 'acne', true);
    const titles = Notifications.__getScheduled().map((s: any) => s.content.title);
    const acneTitles = SKIN_TIPS.acne.map((t) => t.title);
    expect(titles.some((t: string) => acneTitles.includes(t))).toBe(true);
  });

  it('falls back to generic copy when personalized tips are disabled', async () => {
    await scheduleDailyReminder(9, 0, 'acne', false);
    const titles = Notifications.__getScheduled().map((s: any) => s.content.title);
    const acneTitles = SKIN_TIPS.acne.map((t) => t.title);
    expect(titles.some((t: string) => acneTitles.includes(t))).toBe(false);
  });

  // The core regression: changing the time must not leave the old series behind.
  it('replaces the prior series instead of stacking it (the key bug)', async () => {
    await scheduleDailyReminder(8, 0, 'acne');
    const firstCount = Notifications.__getScheduled().length;
    await scheduleDailyReminder(20, 30, 'acne');
    const ids = Notifications.__getScheduled().map((s: any) => s.identifier);
    // No accumulation — count stays in the same single-series range.
    expect(ids.length).toBeLessThanOrEqual(firstCount + 1);
    expect(ids.every((id: string) => id.startsWith(DAILY_PREFIX))).toBe(true);
  });

  it('leaves unrelated (e.g. pattern-unlock) notifications untouched', async () => {
    await Notifications.scheduleNotificationAsync({
      identifier: 'pattern-unlock',
      content: { title: 'Patterns ready' },
      trigger: null,
    });
    await scheduleDailyReminder(9, 0, 'acne');
    await cancelDailyReminder();
    const ids = Notifications.__getScheduled().map((s: any) => s.identifier);
    expect(ids).toContain('pattern-unlock');
    expect(ids.some((id: string) => id.startsWith(DAILY_PREFIX))).toBe(false);
  });

  it('schedules nothing when permission is denied', async () => {
    Notifications.__setPermission('denied');
    await scheduleDailyReminder(9, 0, 'acne');
    expect(Notifications.__getScheduled().length).toBe(0);
  });
});

describe('scheduleDropoffReminders', () => {
  it('schedules the full escalating series when anchored to today', async () => {
    await scheduleDropoffReminders(daysAgo(0), 9, 0);
    const ids = Notifications.__getScheduled().map((s: any) => s.identifier);
    expect(ids.length).toBe(5); // offsets 2,4,8,16,30 all in the future
    expect(ids.every((id: string) => id.startsWith(DROPOFF_PREFIX))).toBe(true);
  });

  it('skips offsets already in the past for a lapsed user', async () => {
    // Last scan 20 days ago → only the +30d offset is still in the future.
    await scheduleDropoffReminders(daysAgo(20), 9, 0);
    const ids = Notifications.__getScheduled().map((s: any) => s.identifier);
    expect(ids).toEqual([`${DROPOFF_PREFIX}30`]);
  });

  it('replaces a prior series on reschedule', async () => {
    await scheduleDropoffReminders(daysAgo(0), 9, 0);
    await scheduleDropoffReminders(daysAgo(0), 18, 0);
    const ids = Notifications.__getScheduled().map((s: any) => s.identifier);
    expect(ids.length).toBe(5);
  });

  it('cancelDropoffReminders clears only drop-off ids', async () => {
    await scheduleDropoffReminders(daysAgo(0), 9, 0);
    await Notifications.scheduleNotificationAsync({ identifier: 'pattern-unlock', content: {}, trigger: null });
    await cancelDropoffReminders();
    const ids = Notifications.__getScheduled().map((s: any) => s.identifier);
    expect(ids).toEqual(['pattern-unlock']);
  });
});

describe('syncEngagementNotifications', () => {
  it('schedules both daily and drop-off notifications when enabled', async () => {
    await syncEngagementNotifications({
      enabled: true,
      time: '09:00',
      goal: 'acne',
      personalizedTips: true,
      lastScanDate: daysAgo(0),
    });
    const ids = Notifications.__getScheduled().map((s: any) => s.identifier);
    expect(ids.some((id: string) => id.startsWith(DAILY_PREFIX))).toBe(true);
    expect(ids.some((id: string) => id.startsWith(DROPOFF_PREFIX))).toBe(true);
  });

  it('tears down all managed notifications when disabled', async () => {
    await syncEngagementNotifications({
      enabled: true, time: '09:00', goal: 'acne', personalizedTips: true, lastScanDate: daysAgo(0),
    });
    await syncEngagementNotifications({
      enabled: false, time: '09:00', goal: 'acne', personalizedTips: true, lastScanDate: daysAgo(0),
    });
    expect(Notifications.__getScheduled().length).toBe(0);
  });

  it('does not schedule when permission is denied', async () => {
    Notifications.__setPermission('denied');
    await syncEngagementNotifications({
      enabled: true, time: '09:00', goal: 'acne', personalizedTips: true, lastScanDate: daysAgo(0),
    });
    expect(Notifications.__getScheduled().length).toBe(0);
  });
});
