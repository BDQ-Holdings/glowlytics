import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('posthog-react-native', () => {
  const mockCapture = jest.fn();
  const mockIdentify = jest.fn();
  const mockScreen = jest.fn();
  const mockReset = jest.fn();

  return jest.fn().mockImplementation(() => ({
    capture: mockCapture,
    identify: mockIdentify,
    screen: mockScreen,
    reset: mockReset,
  }));
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

  it('trackEvent adds product=glowlytics', async () => {
    const { initAnalytics, trackEvent } = require('../analytics');
    await initAnalytics();
    trackEvent('scan_started', { subscription_tier: 'free' });
    expect(instance().capture).toHaveBeenCalledWith('scan_started', {
      product: 'glowlytics',
      subscription_tier: 'free',
    });
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
  let mockIdentifyGlowlyticsUser: jest.Mock;
  let mockResetAnalytics: jest.Mock;
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
    mockIdentifyGlowlyticsUser = jest.fn((userId: string) => {
      identityEvents.push(`identify:${userId}`);
      return true;
    });
    mockResetAnalytics = jest.fn(() => {
      identityEvents.push('reset');
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
      identifyGlowlyticsUser: mockIdentifyGlowlyticsUser,
      trackEvent: jest.fn(),
      resetAnalytics: mockResetAnalytics,
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

  it('resets PostHog before identifying a different already-signed-in Clerk user', async () => {
    await act(async () => {
      tree = create(React.createElement(RootLayout));
      await flushIdentityEffects();
    });

    expect(identityEvents).toEqual(['identify:user_a']);
    expect(mockResetAnalytics).not.toHaveBeenCalled();

    mockAuth = { ...mockAuth, userId: 'user_b' };

    await act(async () => {
      tree!.update(React.createElement(RootLayout));
      await flushIdentityEffects();
    });

    expect(identityEvents).toEqual(['identify:user_a', 'reset', 'identify:user_b']);
    expect(mockResetAnalytics).toHaveBeenCalledTimes(1);
    expect(mockIdentifyGlowlyticsUser).toHaveBeenCalledTimes(2);
  });

  it('does not reset PostHog for ordinary initial sign-in from a signed-out render', async () => {
    mockAuth = { ...mockAuth, userId: null };

    await act(async () => {
      tree = create(React.createElement(RootLayout));
      await flushIdentityEffects();
    });

    expect(identityEvents).toEqual([]);

    mockAuth = { ...mockAuth, userId: 'user_b' };

    await act(async () => {
      tree!.update(React.createElement(RootLayout));
      await flushIdentityEffects();
    });

    expect(identityEvents).toEqual(['identify:user_b']);
    expect(mockResetAnalytics).not.toHaveBeenCalled();
    expect(mockIdentifyGlowlyticsUser).toHaveBeenCalledTimes(1);
  });
});
