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

import {
  initAnalytics,
  identifyUser,
  trackEvent,
  trackScreen,
  resetAnalytics,
} from '../analytics';

describe('analytics', () => {
  it('trackEvent is a no-op before init', () => {
    expect(() => trackEvent('test_event')).not.toThrow();
  });

  it('identifyUser is a no-op before init', () => {
    expect(() => identifyUser('user-1')).not.toThrow();
  });

  it('trackScreen is a no-op before init', () => {
    expect(() => trackScreen('HomeScreen')).not.toThrow();
  });

  it('resetAnalytics is a no-op before init', () => {
    expect(() => resetAnalytics()).not.toThrow();
  });

  it('initAnalytics does not throw when POSTHOG_API_KEY is empty', async () => {
    await expect(initAnalytics()).resolves.not.toThrow();
  });
});
