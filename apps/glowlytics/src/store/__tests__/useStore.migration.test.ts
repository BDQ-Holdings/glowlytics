import { migratePersisted } from '../useStore';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/secureStorage');
jest.mock('../../services/analytics', () => ({
  trackEvent: jest.fn(),
  resetAnalytics: jest.fn(),
}));
jest.mock('../../services/notifications', () => ({
  scheduleDailyReminder: jest.fn(() => Promise.resolve()),
  cancelDailyReminder: jest.fn(() => Promise.resolve()),
  scheduleRitualReminder: jest.fn(() => Promise.resolve()),
  cancelRitualReminder: jest.fn(() => Promise.resolve()),
  cancelAllAppNotifications: jest.fn(() => Promise.resolve()),
  migrateLegacyNotifications: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/subscription', () => ({
  defaultSubscription: () => ({
    tier: 'free',
    is_active: false,
    expires_at: null,
    product_id: null,
    free_scans_used: 0,
    trial_start_date: null,
    trial_end_date: null,
  }),
  canScan: jest.fn(() => true),
  startTrial: jest.fn(() => ({})),
  logOutRevenueCat: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../services/api', () => ({
  getUser: jest.fn(() => Promise.resolve(null)),
  getProtocol: jest.fn(() => Promise.resolve(null)),
  getProducts: jest.fn(() => Promise.resolve([])),
  getDailyRecords: jest.fn(() => Promise.resolve([])),
  getModelOutputs: jest.fn(() => Promise.resolve([])),
  createUser: jest.fn(() => Promise.resolve({})),
  updateUser: jest.fn(() => Promise.resolve({})),
  clearAuthTokenCache: jest.fn(),
}));
jest.mock('uuid', () => ({ v4: () => `test-id-${Math.random().toString(36).slice(2)}` }));
jest.mock('react-native-get-random-values', () => {});
jest.mock('react-native-purchases', () => ({ LOG_LEVEL: { ERROR: 0 } }));
jest.mock('react-native-purchases-ui', () => ({ PAYWALL_RESULT: {} }));

describe('migratePersisted — rose default migration', () => {
  it('moves carried v3 dusk defaults to rose', () => {
    const migrated = migratePersisted({
      schemaVersion: 3,
      appearance: {
        palette: 'dusk',
        mode: 'light',
        textSize: 0.4,
        serifItalics: true,
        reduceMotion: false,
        icon: 'og-dusk',
      },
    }, 3);

    expect(migrated.appearance).toMatchObject({
      palette: 'rose',
      icon: 'og-rose',
    });
  });

  it('leaves explicit non-default palette and icon choices untouched', () => {
    const migrated = migratePersisted({
      schemaVersion: 3,
      appearance: {
        palette: 'meadow',
        mode: 'light',
        textSize: 0.4,
        serifItalics: true,
        reduceMotion: false,
        icon: 'og-sunset',
      },
    }, 3);

    expect(migrated.appearance).toMatchObject({
      palette: 'meadow',
      icon: 'og-sunset',
    });
  });

  it('does not throw when the blob has no appearance slice', () => {
    expect(() => migratePersisted({ schemaVersion: 3 }, 3)).not.toThrow();
  });

  it('leaves v4 blobs untouched', () => {
    const persisted = {
      schemaVersion: 4,
      appearance: {
        palette: 'dusk',
        mode: 'light',
        textSize: 0.4,
        serifItalics: true,
        reduceMotion: false,
        icon: 'og-dusk',
      },
    } as const;

    expect(migratePersisted(persisted, 4)).toBe(persisted);
  });
});
