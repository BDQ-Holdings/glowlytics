// Mock AsyncStorage (needed when tests transitively import useStore)
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// Mock uuid (needed transitively via useStore)
jest.mock('uuid', () => ({
  v4: () => `test-id-${Date.now()}-${Math.random().toString(36).slice(2)}`,
}));

// Mock react-native-get-random-values
jest.mock('react-native-get-random-values', () => {});

// Mock react-native-purchases
jest.mock('react-native-purchases', () => ({
  setLogLevel: jest.fn(),
  configure: jest.fn(),
  logIn: jest.fn(),
  getCustomerInfo: jest.fn(),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
  LOG_LEVEL: { ERROR: 0 },
}));

// Mock react-native-purchases-ui
jest.mock('react-native-purchases-ui', () => ({
  presentPaywallIfNeeded: jest.fn(),
  presentCustomerCenter: jest.fn(),
  PAYWALL_RESULT: {
    NOT_PRESENTED: 'NOT_PRESENTED',
    ERROR: 'ERROR',
    CANCELLED: 'CANCELLED',
    PURCHASED: 'PURCHASED',
    RESTORED: 'RESTORED',
  },
}));

import {
  canScan,
  isTrialActive,
  trialDaysRemaining,
  startTrial,
  defaultSubscription,
  subscriptionFromCustomerInfo,
  restorePurchases,
} from '../subscription';
import type { SubscriptionState } from '../../types';

describe('subscription', () => {
  describe('canScan', () => {
    it('returns true for premium subscribers', () => {
      const sub: SubscriptionState = {
        ...defaultSubscription(),
        tier: 'premium',
        is_active: true,
        expires_at: '2026-04-14T00:00:00Z',
        product_id: 'glowlytics_premium_monthly',
        free_scans_used: 10,
      };
      expect(canScan(sub)).toBe(true);
    });

    it('returns true for users with active trial', () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      const sub: SubscriptionState = {
        ...defaultSubscription(),
        trial_start_date: new Date().toISOString(),
        trial_end_date: future.toISOString(),
      };
      expect(canScan(sub)).toBe(true);
    });

    it('returns false for users with expired trial', () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      const sub: SubscriptionState = {
        ...defaultSubscription(),
        trial_start_date: new Date(past.getTime() - 7 * 86400000).toISOString(),
        trial_end_date: past.toISOString(),
      };
      expect(canScan(sub)).toBe(false);
    });

    it('returns false for free users with no trial', () => {
      const sub = defaultSubscription();
      expect(canScan(sub)).toBe(false);
    });
  });

  describe('isTrialActive', () => {
    it('returns false when no trial dates', () => {
      expect(isTrialActive(defaultSubscription())).toBe(false);
    });

    it('returns true when trial end date is in future', () => {
      const future = new Date();
      future.setDate(future.getDate() + 3);
      const sub: SubscriptionState = {
        ...defaultSubscription(),
        trial_start_date: new Date().toISOString(),
        trial_end_date: future.toISOString(),
      };
      expect(isTrialActive(sub)).toBe(true);
    });
  });

  describe('trialDaysRemaining', () => {
    it('returns 0 when no trial', () => {
      expect(trialDaysRemaining(defaultSubscription())).toBe(0);
    });

    it('returns positive days for active trial', () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      const sub: SubscriptionState = {
        ...defaultSubscription(),
        trial_start_date: new Date().toISOString(),
        trial_end_date: future.toISOString(),
      };
      expect(trialDaysRemaining(sub)).toBeGreaterThanOrEqual(4);
      expect(trialDaysRemaining(sub)).toBeLessThanOrEqual(5);
    });
  });

  describe('startTrial', () => {
    it('returns trial dates 7 days apart', () => {
      const result = startTrial();
      expect(result.trial_start_date).toBeDefined();
      expect(result.trial_end_date).toBeDefined();
      const start = new Date(result.trial_start_date!);
      const end = new Date(result.trial_end_date!);
      const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      expect(diff).toBe(7);
    });
  });

  describe('subscriptionFromCustomerInfo', () => {
    const current = defaultSubscription();

    it('returns premium state when entitlement is active', () => {
      const mockInfo = {
        entitlements: {
          active: {
            'Glow Pro': {
              expirationDate: '2026-04-14T00:00:00Z',
              productIdentifier: 'glowlytics_premium_monthly',
            },
          },
        },
      } as any;

      const result = subscriptionFromCustomerInfo(mockInfo, current);
      expect(result.tier).toBe('premium');
      expect(result.is_active).toBe(true);
      expect(result.expires_at).toBe('2026-04-14T00:00:00Z');
      expect(result.product_id).toBe('glowlytics_premium_monthly');
    });

    it('returns free state when no active entitlement', () => {
      const mockInfo = {
        entitlements: {
          active: {},
        },
      } as any;

      const result = subscriptionFromCustomerInfo(mockInfo, current);
      expect(result.tier).toBe('free');
      expect(result.is_active).toBe(false);
      expect(result.expires_at).toBeNull();
    });

    it('preserves free_scans_used from current state', () => {
      const currentWithScans = { ...current, free_scans_used: 2 };
      const mockInfo = {
        entitlements: {
          active: {
            'Glow Pro': {
              expirationDate: '2026-04-14T00:00:00Z',
              productIdentifier: 'glowlytics_premium_monthly',
            },
          },
        },
      } as any;

      const result = subscriptionFromCustomerInfo(mockInfo, currentWithScans);
      expect(result.free_scans_used).toBe(2);
    });
  });

  describe('restorePurchases', () => {
    it('returns current state when REVENUECAT_API_KEY is empty', async () => {
      const current = defaultSubscription();
      const result = await restorePurchases(current);
      expect(result).toBe(current);
    });
  });

  describe('defaultSubscription', () => {
    it('returns the correct default state', () => {
      const sub = defaultSubscription();
      expect(sub.tier).toBe('free');
      expect(sub.is_active).toBe(false);
      expect(sub.expires_at).toBeNull();
      expect(sub.product_id).toBeNull();
      expect(sub.free_scans_used).toBe(0);
      expect(sub.trial_start_date).toBeNull();
      expect(sub.trial_end_date).toBeNull();
    });
  });

  describe('gateWithPaywall trial fallback (fix layer 3 of 3)', () => {
    // These tests verify that gateWithPaywall auto-grants a trial when the user
    // has never had one. This is the defensive layer — even if layers 1 and 2
    // failed for some reason, no user can be locked out of scanning.
    it('grants a trial and returns true when user has no trial and no entitlement', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { useStore } = require('../../store/useStore');
      const { gateWithPaywall } = require('../subscription');

      // Simulate the stuck legacy state: no trial, no entitlement
      useStore.setState({
        user: { user_id: 'test-user', age_range: '25-34', onboarding_complete: true } as any,
        subscription: {
          tier: 'free',
          is_active: false,
          expires_at: null,
          product_id: null,
          free_scans_used: 0,
          trial_start_date: null,
          trial_end_date: null,
        },
      });

      const allowed = await gateWithPaywall();

      expect(allowed).toBe(true);
      const sub = useStore.getState().subscription;
      expect(sub.trial_start_date).not.toBeNull();
      expect(sub.trial_end_date).not.toBeNull();
    });
  });
});
