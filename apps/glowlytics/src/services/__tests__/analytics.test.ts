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
