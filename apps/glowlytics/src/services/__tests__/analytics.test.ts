import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('posthog-react-native', () => {
  const mockCapture = jest.fn();
  const mockIdentify = jest.fn();
  const mockScreen = jest.fn();
  const mockReset = jest.fn();
  const mockGetDistinctId = jest.fn(() => 'anonymous-device-id');
  const mockReady = jest.fn(() => Promise.resolve());

  const MockPostHog = jest.fn().mockImplementation(() => ({
    capture: mockCapture,
    identify: mockIdentify,
    screen: mockScreen,
    reset: mockReset,
    ready: mockReady,
    getDistinctId: mockGetDistinctId,
  }));
  Object.assign(MockPostHog, { mockReady });
  return MockPostHog;
});

const ORIGINAL_POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const ORIGINAL_CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

describe('analytics', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_fake';
    delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (ORIGINAL_POSTHOG_API_KEY === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
    else process.env.EXPO_PUBLIC_POSTHOG_API_KEY = ORIGINAL_POSTHOG_API_KEY;
    if (ORIGINAL_CLERK_KEY === undefined) delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = ORIGINAL_CLERK_KEY;
    jest.restoreAllMocks();
  });

  it('trackEvent is a no-op before init', () => {
    const { trackEvent } = require('../analytics');
    expect(() => trackEvent('test_event')).not.toThrow();
  });

  it('identifyUser is a no-op before init', () => {
    const { identifyUser } = require('../analytics');
    expect(() => identifyUser('user-1')).not.toThrow();
  });

  it('trackScreen is a no-op before init', () => {
    const { trackScreen } = require('../analytics');
    expect(() => trackScreen('HomeScreen')).not.toThrow();
  });

  it('resetAnalytics is a no-op before init', () => {
    const { resetAnalytics } = require('../analytics');
    expect(() => resetAnalytics()).not.toThrow();
  });

  it('initAnalytics does not throw when POSTHOG_API_KEY is empty', async () => {
    const { initAnalytics } = require('../analytics');
    await expect(initAnalytics()).resolves.not.toThrow();
  });
});

const instance = () => (jest.requireMock('posthog-react-native') as jest.Mock).mock.results.at(-1)?.value;
const readyMock = () => (
  jest.requireMock('posthog-react-native') as jest.Mock & { mockReady: jest.Mock }
).mockReady;
const initWithDistinctId = async (distinctId: string) => {
  const { initAnalytics } = require('../analytics');
  await initAnalytics();
  instance().getDistinctId.mockReturnValue(distinctId);
};

describe('Glowlytics canonical PostHog identity', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_fake';
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = 'phc_test';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (ORIGINAL_POSTHOG_API_KEY === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
    else process.env.EXPO_PUBLIC_POSTHOG_API_KEY = ORIGINAL_POSTHOG_API_KEY;
    if (ORIGINAL_CLERK_KEY === undefined) delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = ORIGINAL_CLERK_KEY;
    jest.restoreAllMocks();
  });
  it('namespaces Clerk IDs for the shared project', () => {
    const { canonicalGlowlyticsUserId } = require('../analytics');
    expect(canonicalGlowlyticsUserId('user_2xABC')).toBe('glowlytics:user:user_2xABC');
  });

  it('identifyGlowlyticsUser identifies the namespaced ID and never identifies literal anonymous', async () => {
    const { initAnalytics, identifyGlowlyticsUser, identifyUser } = require('../analytics');
    await initAnalytics();
    identifyGlowlyticsUser('user_2xABC');
    identifyUser('anonymous');

    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_2xABC', { product: 'glowlytics' });
    expect(instance().identify).not.toHaveBeenCalledWith('anonymous', expect.anything());
  });

  it('does not accept or emit email/name-like identify traits from stale callers', async () => {
    const { initAnalytics, identifyGlowlyticsUser, identifyUser } = require('../analytics');
    await initAnalytics();
    (identifyGlowlyticsUser as unknown as (id: string, traits: unknown) => void)('user_2xABC', { email: 'lead@example.com', name: 'Lead Name' });
    (identifyUser as unknown as (id: string, traits: unknown) => void)('user_2xDEF', { phone: '+15555550100' });
    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_2xABC', { product: 'glowlytics' });
    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_2xDEF', { product: 'glowlytics' });
    expect(JSON.stringify(instance().identify.mock.calls)).not.toMatch(/lead@example\.com|Lead Name|\+15555550100/);
  });

  it('signed-in startup identifies after analytics readiness, not before', async () => {
    const { initAnalytics, identifyGlowlyticsUser } = require('../analytics');
    expect(identifyGlowlyticsUser('user_startup')).toBe(false);
    await expect(initAnalytics()).resolves.toBe(true);
    expect(identifyGlowlyticsUser('user_startup')).toBe(true);
    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_startup', { product: 'glowlytics' });
  });

  it('waits for native PostHog storage readiness before resolving initialization', async () => {
    let releaseReady: (() => void) | undefined;
    readyMock().mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseReady = resolve;
    }));
    const { initAnalytics } = require('../analytics');
    let settled = false;

    const initialization = initAnalytics().then((result: boolean) => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(instance().ready).toHaveBeenCalledTimes(1);
    releaseReady?.();
    await expect(initialization).resolves.toBe(true);
  });

  it('trackEvent adds product=glowlytics', async () => {
    const { initAnalytics, trackEvent } = require('../analytics');
    await initAnalytics();
    trackEvent('scan_started', { subscription_tier: 'free' });
    expect(instance().capture).toHaveBeenCalledWith('scan_started', {
      product: 'glowlytics',
      subscription_tier: 'free',
    });
  });

  it('resets a persisted Glowlytics account when Clerk cold-starts signed out', async () => {
    const { prepareAnalyticsIdentityHandoff } = require('../analytics');
    await initWithDistinctId('glowlytics:user:user_a');

    await expect(prepareAnalyticsIdentityHandoff(null)).resolves.toBe(true);

    expect(instance().reset).toHaveBeenCalledTimes(1);
    expect(instance().identify).not.toHaveBeenCalled();
  });

  it.each(['user_legacy', 'anonymous'])(
    'resets a persisted legacy identified value %s when Clerk cold-starts signed out',
    async (legacyDistinctId) => {
      const { prepareAnalyticsIdentityHandoff } = require('../analytics');
      await initWithDistinctId(legacyDistinctId);

      await expect(prepareAnalyticsIdentityHandoff(null)).resolves.toBe(true);

      expect(instance().reset).toHaveBeenCalledTimes(1);
      expect(instance().identify).not.toHaveBeenCalled();
    },
  );

  it('resets a persisted Glowlytics account before identifying a different cold-start Clerk user', async () => {
    const { prepareAnalyticsIdentityHandoff } = require('../analytics');
    await initWithDistinctId('glowlytics:user:user_a');

    await expect(prepareAnalyticsIdentityHandoff('user_b')).resolves.toBe(true);

    expect(instance().reset).toHaveBeenCalledTimes(1);
    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_b', { product: 'glowlytics' });
    expect(instance().reset.mock.invocationCallOrder[0]).toBeLessThan(instance().identify.mock.invocationCallOrder[0]);
  });

  it('resets a persisted raw Clerk ID before identifying its canonical replacement', async () => {
    const { prepareAnalyticsIdentityHandoff } = require('../analytics');
    await initWithDistinctId('user_legacy');

    await expect(prepareAnalyticsIdentityHandoff('user_legacy')).resolves.toBe(true);

    expect(instance().reset).toHaveBeenCalledTimes(1);
    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_legacy', { product: 'glowlytics' });
    expect(instance().reset.mock.invocationCallOrder[0]).toBeLessThan(instance().identify.mock.invocationCallOrder[0]);
  });

  it('preserves anonymous history when identifying the first Clerk user', async () => {
    const { prepareAnalyticsIdentityHandoff } = require('../analytics');
    await initWithDistinctId('anonymous-device-id');

    await expect(prepareAnalyticsIdentityHandoff('user_first')).resolves.toBe(true);

    expect(instance().reset).not.toHaveBeenCalled();
    expect(instance().identify).toHaveBeenCalledWith('glowlytics:user:user_first', { product: 'glowlytics' });
  });

  it('resets before identifying direct account switches even when in-memory starts from the previous account', async () => {
    const { prepareAnalyticsIdentityHandoff } = require('../analytics');
    await initWithDistinctId('anonymous-device-id');
    await prepareAnalyticsIdentityHandoff('user_a');
    instance().getDistinctId.mockReturnValue('glowlytics:user:user_a');

    await prepareAnalyticsIdentityHandoff('user_b');

    expect(instance().reset).toHaveBeenCalledTimes(1);
    expect(instance().identify).toHaveBeenLastCalledWith('glowlytics:user:user_b', { product: 'glowlytics' });
    expect(instance().reset.mock.invocationCallOrder[0]).toBeLessThan(instance().identify.mock.invocationCallOrder.at(-1)!);
  });
});

describe('Glowlytics root layout analytics identity handoff', () => {
  let mockAuth: { getToken: jest.Mock; userId: string | null; isLoaded: boolean };
  let identityEvents: string[];
  let mockLoadPersistedData: jest.Mock;
  let mockReconcileAuthUserId: jest.Mock;
  let mockSetSubscription: jest.Mock;
  let mockSyncHealthData: jest.Mock;
  let mockInitAnalytics: jest.Mock;
  let mockPrepareAnalyticsIdentityHandoff: jest.Mock;
  let mockTrackEvent: jest.Mock;
  let RootLayout: React.ComponentType;
  let tree: ReactTestRenderer | undefined;

  const flushIdentityEffects = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_fake';
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = 'phc_test';
    identityEvents = [];
    mockAuth = { getToken: jest.fn(() => Promise.resolve('token')), userId: 'user_a', isLoaded: true };
    mockLoadPersistedData = jest.fn(() => Promise.resolve());
    mockReconcileAuthUserId = jest.fn();
    mockSetSubscription = jest.fn();
    mockSyncHealthData = jest.fn(() => Promise.resolve());
    mockInitAnalytics = jest.fn(() => Promise.resolve(true));
    mockPrepareAnalyticsIdentityHandoff = jest.fn((userId: string | null) => {
      identityEvents.push(userId ? `handoff:${userId}` : 'handoff:signed-out');
      return Promise.resolve(true);
    });
    mockTrackEvent = jest.fn((event: string) => {
      identityEvents.push(`track:${event}`);
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    jest.doMock('react', () => React);
    jest.doMock('expo-font', () => ({ useFonts: () => [true, null] }));
    jest.doMock('expo-status-bar', () => ({
      StatusBar: () => null,
    }));
    jest.doMock('expo-router', () => {
      const Stack = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children);
      Stack.Screen = () => null;
      return {
        Stack,
        Redirect: () => null,
        useSegments: () => [],
        useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
        SplashScreen: {
          preventAutoHideAsync: jest.fn(() => Promise.resolve()),
          hideAsync: jest.fn(() => Promise.resolve()),
        },
      };
    });
    jest.doMock('@clerk/clerk-expo', () => ({
      ClerkProvider: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
      useAuth: () => mockAuth,
      useUser: () => ({ user: null }),
    }));
    jest.doMock('@clerk/clerk-expo/token-cache', () => ({ tokenCache: {} }));
    jest.doMock('@clerk/clerk-expo/resource-cache', () => ({ resourceCache: {} }));
    jest.doMock('@sentry/react-native', () => ({
      init: jest.fn(),
      wrap: (component: React.ComponentType) => component,
      reactNavigationIntegration: jest.fn(() => ({})),
    }));
    jest.doMock('../../../src/config/env', () => ({
      env: {
        CLERK_PUBLISHABLE_KEY: 'pk_test_fake',
        CLERK_KEY_ENV: 'test',
        CLERK_INSTANCE_HOST: 'test.clerk.accounts.dev',
        SENTRY_DSN: '',
        POSTHOG_API_KEY: 'phc_test',
        API_BASE_URL: 'https://api.example.test',
        REVENUECAT_API_KEY: '',
      },
    }));
    jest.doMock('../../../src/services/api', () => ({
      setAuthTokenProvider: jest.fn(),
    }));
    jest.doMock('../../../src/services/subscription', () => ({
      initRevenueCat: jest.fn(() => Promise.resolve()),
      identifyUser: jest.fn(() => Promise.resolve(null)),
      subscriptionFromCustomerInfo: jest.fn(),
      setupCustomerInfoListener: jest.fn(() => jest.fn()),
    }));
    jest.doMock('../../../src/services/analytics', () => ({
      initAnalytics: mockInitAnalytics,
      prepareAnalyticsIdentityHandoff: mockPrepareAnalyticsIdentityHandoff,
      trackEvent: mockTrackEvent,
    }));
    jest.doMock('../../../src/services/appearance', () => ({
      applyAppIcon: jest.fn(() => Promise.resolve()),
      currentNativeIcon: jest.fn(() => 'glow'),
      resolveColorMode: () => 'light',
    }));
    jest.doMock('../../../src/services/onDeviceLesionDetection', () => ({
      initLesionDetection: jest.fn(() => Promise.resolve()),
    }));
    jest.doMock('../../../src/services/onDeviceSignalModels', () => ({
      initSignalModels: jest.fn(() => Promise.resolve()),
    }));
    jest.doMock('../../../src/store/useStore', () => {
      const state = {
        loadPersistedData: mockLoadPersistedData,
        reconcileAuthUserId: mockReconcileAuthUserId,
        setSubscription: mockSetSubscription,
        syncHealthData: mockSyncHealthData,
        user: null,
        healthSyncStatus: { last_sync_at: null },
        appearance: { mode: 'light', icon: 'glow' },
      };
      const useStore = (selector: (s: typeof state) => unknown) => selector(state);
      useStore.getState = () => state;
      return { useStore };
    });
    jest.doMock('../../../src/components/AppearanceHost', () => ({
      AppearanceHost: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    }));
    jest.doMock('../../../src/components/AppErrorBoundary', () => ({
      AppErrorBoundary: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    }));

    RootLayout = require('../../../app/_layout').default;
  });

  afterEach(async () => {
    await act(async () => {
      tree?.unmount();
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
    jest.useRealTimers();
    if (ORIGINAL_POSTHOG_API_KEY === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
    else process.env.EXPO_PUBLIC_POSTHOG_API_KEY = ORIGINAL_POSTHOG_API_KEY;
    if (ORIGINAL_CLERK_KEY === undefined) delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = ORIGINAL_CLERK_KEY;
    jest.restoreAllMocks();
  });

  it('hands off identity again when Clerk switches directly from account A to B', async () => {
    await act(async () => {
      tree = create(React.createElement(RootLayout));
      await flushIdentityEffects();
    });

    expect(identityEvents).toContain('handoff:user_a');

    mockAuth = { ...mockAuth, userId: 'user_b' };

    await act(async () => {
      tree!.update(React.createElement(RootLayout));
      await flushIdentityEffects();
    });

    expect(mockPrepareAnalyticsIdentityHandoff).toHaveBeenCalledWith('user_b');
    expect(identityEvents).toContain('handoff:user_b');
  });

  it('hands off ordinary first sign-in from a signed-out render without resetting in layout', async () => {
    mockAuth = { ...mockAuth, userId: null };

    await act(async () => {
      tree = create(React.createElement(RootLayout));
      await flushIdentityEffects();
    });

    expect(mockPrepareAnalyticsIdentityHandoff).toHaveBeenCalledWith(null);

    mockAuth = { ...mockAuth, userId: 'user_b' };

    await act(async () => {
      tree!.update(React.createElement(RootLayout));
      await flushIdentityEffects();
    });

    expect(mockPrepareAnalyticsIdentityHandoff).toHaveBeenCalledWith('user_b');
  });

  it('does not emit app_init_complete until the startup identity handoff resolves', async () => {
    let resolveHandoff!: (ready: boolean) => void;
    mockPrepareAnalyticsIdentityHandoff.mockImplementationOnce((userId: string | null) => {
      identityEvents.push(userId ? `handoff-start:${userId}` : 'handoff-start:signed-out');
      return new Promise<boolean>((resolve) => {
        resolveHandoff = resolve;
      });
    });

    await act(async () => {
      tree = create(React.createElement(RootLayout));
      await flushIdentityEffects();
    });

    expect(identityEvents).toEqual(['handoff-start:user_a']);
    expect(mockTrackEvent).not.toHaveBeenCalledWith('app_init_complete', expect.anything());

    await act(async () => {
      resolveHandoff(true);
      await flushIdentityEffects();
    });

    expect(identityEvents).toEqual(['handoff-start:user_a', 'track:app_init_complete']);
  });
  it('reconciles the latest Clerk user when startup identity handoff resolves after an account switch', async () => {
    let resolveHandoff!: (ready: boolean) => void;
    mockPrepareAnalyticsIdentityHandoff.mockImplementationOnce(() => (
      new Promise<boolean>((resolve) => {
        resolveHandoff = resolve;
      })
    ));

    await act(async () => {
      tree = create(React.createElement(RootLayout));
      await flushIdentityEffects();
    });

    mockAuth = { ...mockAuth, userId: 'user_b' };
    await act(async () => {
      tree!.update(React.createElement(RootLayout));
      await flushIdentityEffects();
    });

    expect(mockPrepareAnalyticsIdentityHandoff).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveHandoff(true);
      await flushIdentityEffects();
    });

    expect(mockPrepareAnalyticsIdentityHandoff).toHaveBeenLastCalledWith('user_b');
  });
});
