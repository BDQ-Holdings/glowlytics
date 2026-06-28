import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../useStore';
import { localDateStr } from '../../utils/localDate';
import type { ConsideringItem } from '../../types';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

// MOB-01: persist/load now AES-encrypt the blob. Use the passthrough manual mock
// so these store-logic tests still observe plaintext JSON in AsyncStorage; the
// real AES layer is covered by services/__tests__/secureStorage.test.ts.
jest.mock('../../services/secureStorage');

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => `test-id-${Date.now()}-${Math.random().toString(36).slice(2)}`,
}));

// Mock react-native-get-random-values
jest.mock('react-native-get-random-values', () => {});

// Mock react-native-purchases
jest.mock('react-native-purchases', () => ({
  LOG_LEVEL: { ERROR: 0 },
}));

// Mock react-native-purchases-ui
jest.mock('react-native-purchases-ui', () => ({
  PAYWALL_RESULT: {},
}));

const resetStore = () => {
  useStore.setState({
    user: null,
    protocol: null,
    products: [],
    dailyRecords: [],
    modelOutputs: [],
    onboardingStep: 0,
    pendingScanResult: null,
    pendingPhotoBase64: null,
    gamification: {
      xp: 0,
      level: 'Beginner',
      badges: [],
      weekly_challenges: [],
      personal_bests: {
        longest_streak: 0,
        lowest_acne: 100,
        highest_skin_score: 0,
        most_consistent_week: 0,
      },
    },
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
};

describe('useStore', () => {
  beforeEach(resetStore);

  describe('addDailyRecord', () => {
    it('throws when user is null', () => {
      expect(() =>
        useStore.getState().addDailyRecord({
          date: '2026-03-15',
          scanner_reading_id: 'scan-1',
          scanner_indices: {
            inflammation_index: 40,
            pigmentation_index: 30,
            texture_index: 35,
          },
          scanner_quality_flag: 'pass',
          scan_region: 'left_cheek',
          sunscreen_used: true,
          new_product_added: false,
        }),
      ).toThrow('addDailyRecord called without a signed-in user');
    });

    it('adds a daily record with generated IDs', () => {
      // First create a user
      useStore.getState().createUser({
        age_range: '25-34',
        period_applicable: 'no',
      });

      const record = useStore.getState().addDailyRecord({
        date: '2026-03-01',
        scanner_reading_id: 'scan-1',
        scanner_indices: {
          inflammation_index: 40,
          pigmentation_index: 30,
          texture_index: 35,
        },
        scanner_quality_flag: 'pass',
        scan_region: 'left_cheek',
        sunscreen_used: true,
        new_product_added: false,
      });

      expect(record.daily_id).toBeTruthy();
      expect(record.date).toBe('2026-03-01');
      expect(useStore.getState().dailyRecords).toHaveLength(1);
    });
  });

  describe('addModelOutput', () => {
    it('adds a model output', () => {
      useStore.getState().addModelOutput({
        daily_id: 'day-1',
        acne_score: 45,
        sun_damage_score: 30,
        skin_age_score: 38,
        confidence: 'med',
        recommended_action: 'Keep scanning',
        escalation_flag: false,
      });

      const outputs = useStore.getState().modelOutputs;
      expect(outputs).toHaveLength(1);
      expect(outputs[0].acne_score).toBe(45);
      expect(outputs[0].output_id).toBeTruthy();
    });
  });

  describe('getOutputHistory', () => {
    it('returns outputs within the specified day window', () => {
      useStore.getState().createUser({
        age_range: '25-34',
        period_applicable: 'no',
      });

      const today = localDateStr();

      // Add a record for today
      const record1 = useStore.getState().addDailyRecord({
        date: today,
        scanner_reading_id: 'scan-1',
        scanner_indices: { inflammation_index: 40, pigmentation_index: 30, texture_index: 35 },
        scanner_quality_flag: 'pass',
        scan_region: 'left_cheek',
        sunscreen_used: true,
        new_product_added: false,
      });

      useStore.getState().addModelOutput({
        daily_id: record1.daily_id,
        acne_score: 45,
        sun_damage_score: 30,
        skin_age_score: 38,
        confidence: 'med',
        recommended_action: 'test',
        escalation_flag: false,
      });

      const history = useStore.getState().getOutputHistory(7);
      expect(history).toHaveLength(1);
      expect(history[0].acne_score).toBe(45);
    });
  });

  describe('getStreak', () => {
    it('returns 0 when no records', () => {
      expect(useStore.getState().getStreak()).toBe(0);
    });

    it('returns correct streak for consecutive days', () => {
      useStore.getState().createUser({
        age_range: '25-34',
        period_applicable: 'no',
      });

      // Add records for today and yesterday
      const today = new Date();
      for (let i = 0; i < 3; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        useStore.getState().addDailyRecord({
          date: localDateStr(d),
          scanner_reading_id: `scan-${i}`,
          scanner_indices: { inflammation_index: 40, pigmentation_index: 30, texture_index: 35 },
          scanner_quality_flag: 'pass',
          scan_region: 'left_cheek',
          sunscreen_used: true,
          new_product_added: false,
        });
      }

      expect(useStore.getState().getStreak()).toBe(3);
    });
  });

  describe('removeProduct', () => {
    it('removes a product by id', () => {
      useStore.getState().createUser({
        age_range: '25-34',
        period_applicable: 'no',
      });

      useStore.getState().addProduct({
        product_name: 'Test Product',
        product_capture_method: 'search',
        ingredients_list: ['Ingredient A'],
        usage_schedule: 'AM',
        start_date: '2026-03-01',
      });

      const products = useStore.getState().products;
      expect(products).toHaveLength(1);

      useStore.getState().removeProduct(products[0].user_product_id);
      expect(useStore.getState().products).toHaveLength(0);
    });
  });

  describe('pendingScanResult', () => {
    it('sets and clears pending scan result', () => {
      const mockResult = { acne_score: 45, sun_damage_score: 30 };
      useStore.getState().setPendingScanResult(mockResult);
      expect(useStore.getState().pendingScanResult).toEqual(mockResult);

      useStore.getState().clearPendingScanResult();
      expect(useStore.getState().pendingScanResult).toBeNull();
    });
  });

  describe('subscription', () => {
    it('starts with default free subscription', () => {
      const sub = useStore.getState().subscription;
      expect(sub.tier).toBe('free');
      expect(sub.is_active).toBe(false);
      expect(sub.free_scans_used).toBe(0);
    });

    it('setSubscription updates subscription state', () => {
      useStore.getState().setSubscription({
        tier: 'premium',
        is_active: true,
        expires_at: '2026-04-14T00:00:00Z',
        product_id: 'glowlytics_premium_monthly',
        free_scans_used: 2,
        trial_start_date: null,
        trial_end_date: null,
      });

      const sub = useStore.getState().subscription;
      expect(sub.tier).toBe('premium');
      expect(sub.is_active).toBe(true);
      expect(sub.product_id).toBe('glowlytics_premium_monthly');
    });

    it('incrementFreeScansUsed increments the counter', () => {
      useStore.getState().incrementFreeScansUsed();
      expect(useStore.getState().subscription.free_scans_used).toBe(1);

      useStore.getState().incrementFreeScansUsed();
      expect(useStore.getState().subscription.free_scans_used).toBe(2);
    });

    it('incrementFreeScansUsed persists to AsyncStorage', async () => {
      const mockSetItem = AsyncStorage.setItem as jest.Mock;
      mockSetItem.mockClear();

      useStore.getState().incrementFreeScansUsed();
      useStore.getState().incrementFreeScansUsed();

      // Wait for debounced persist (50ms timer + execution)
      await new Promise((r) => setTimeout(r, 100));

      expect(mockSetItem).toHaveBeenCalled();
      const [key, raw] = mockSetItem.mock.calls[mockSetItem.mock.calls.length - 1];
      expect(key).toBe('glowlytics_data');
      expect(raw).not.toBeNull();
      const persisted = JSON.parse(raw);
      expect(persisted.subscription.free_scans_used).toBe(2);
    });

    it('canPerformScan returns true for user with active trial', () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      useStore.getState().setSubscription({
        ...useStore.getState().subscription,
        trial_start_date: new Date().toISOString(),
        trial_end_date: future.toISOString(),
      });
      expect(useStore.getState().canPerformScan()).toBe(true);
    });

    it('canPerformScan returns false for free user without trial', () => {
      expect(useStore.getState().canPerformScan()).toBe(false);
    });

    it('canPerformScan returns true for premium user', () => {
      useStore.getState().setSubscription({
        tier: 'premium',
        is_active: true,
        expires_at: '2026-04-14T00:00:00Z',
        product_id: 'glowlytics_premium_monthly',
        free_scans_used: 10,
        trial_start_date: null,
        trial_end_date: null,
      });
      expect(useStore.getState().canPerformScan()).toBe(true);
    });

    it('addDailyRecord does not increment free_scans_used (trial model)', () => {
      useStore.getState().createUser({
        age_range: '25-34',
        period_applicable: 'no',
      });

      expect(useStore.getState().subscription.free_scans_used).toBe(0);

      useStore.getState().addDailyRecord({
        date: '2026-03-14',
        scanner_reading_id: 'scan-1',
        scanner_indices: {
          inflammation_index: 40,
          pigmentation_index: 30,
          texture_index: 35,
        },
        scanner_quality_flag: 'pass',
        scan_region: 'left_cheek',
        sunscreen_used: true,
        new_product_added: false,
      });

      // Trial model — no longer incrementing free scans
      expect(useStore.getState().subscription.free_scans_used).toBe(0);
    });

    it('does not increment free_scans_used for premium users', () => {
      useStore.getState().createUser({
        age_range: '25-34',
        period_applicable: 'no',
      });

      useStore.getState().setSubscription({
        tier: 'premium',
        is_active: true,
        expires_at: '2026-04-14T00:00:00Z',
        product_id: 'glowlytics_premium_monthly',
        free_scans_used: 0,
        trial_start_date: null,
        trial_end_date: null,
      });

      useStore.getState().addDailyRecord({
        date: '2026-03-15',
        scanner_reading_id: 'scan-1',
        scanner_indices: {
          inflammation_index: 40,
          pigmentation_index: 30,
          texture_index: 35,
        },
        scanner_quality_flag: 'pass',
        scan_region: 'left_cheek',
        sunscreen_used: true,
        new_product_added: false,
      });

      expect(useStore.getState().subscription.free_scans_used).toBe(0);
    });

    it('resetAll resets subscription to default', () => {
      useStore.getState().setSubscription({
        tier: 'premium',
        is_active: true,
        expires_at: '2026-04-14T00:00:00Z',
        product_id: 'glowlytics_premium_monthly',
        free_scans_used: 5,
        trial_start_date: null,
        trial_end_date: null,
      });

      useStore.getState().resetAll();

      const sub = useStore.getState().subscription;
      expect(sub.tier).toBe('free');
      expect(sub.is_active).toBe(false);
      expect(sub.free_scans_used).toBe(0);
    });
  });

  describe('createUser does NOT auto-fire trial (Apple 3.1.2 compliance)', () => {
    it('does not start a trial when createUser runs without an existing trial', () => {
      useStore.getState().createUser({ age_range: '25-34' });
      const sub = useStore.getState().subscription;
      // Pre-build-11, createUser auto-fired startTrial(). That bypassed Apple's
      // StoreKit purchase sheet and violated 3.1.2(a)/(b). The trial flag is
      // now only set by the RevenueCat customer-info listener after a real
      // purchase, or as a post-purchase fallback inside the onboarding paywall.
      expect(sub.trial_start_date).toBeNull();
      expect(sub.trial_end_date).toBeNull();
    });

    it('canPerformScan returns false immediately after createUser (paywall not yet completed)', () => {
      useStore.getState().createUser({ age_range: '25-34' });
      expect(useStore.getState().canPerformScan()).toBe(false);
    });

    it('does not overwrite an existing trial when createUser runs again', () => {
      // Simulate the post-paywall state: trial was set by RevenueCat customer-info listener.
      useStore.getState().startTrial();
      const firstStart = useStore.getState().subscription.trial_start_date;
      expect(firstStart).not.toBeNull();
      useStore.getState().createUser({ age_range: '25-34' });
      expect(useStore.getState().subscription.trial_start_date).toBe(firstStart);
    });
  });

  describe('loadPersistedData trial backfill', () => {
    const mockGetItem = AsyncStorage.getItem as jest.Mock;

    afterEach(() => {
      mockGetItem.mockReset();
      mockGetItem.mockResolvedValue(null);
    });

    it('backfills trial for an upgraded user with no trial dates', async () => {
      mockGetItem.mockResolvedValueOnce(
        JSON.stringify({
          user: { user_id: 'u1', age_range: '25-34', onboarding_complete: true },
          subscription: {
            tier: 'free',
            is_active: false,
            expires_at: null,
            product_id: null,
            free_scans_used: 0,
            trial_start_date: null,
            trial_end_date: null,
          },
        }),
      );
      await useStore.getState().loadPersistedData();
      const sub = useStore.getState().subscription;
      expect(sub.trial_start_date).not.toBeNull();
      expect(sub.trial_end_date).not.toBeNull();
      expect(useStore.getState().canPerformScan()).toBe(true);
    });

    it('does NOT touch a paid user', async () => {
      mockGetItem.mockResolvedValueOnce(
        JSON.stringify({
          user: { user_id: 'u2', age_range: '25-34', onboarding_complete: true },
          subscription: {
            tier: 'premium',
            is_active: true,
            expires_at: '2099-01-01T00:00:00.000Z',
            product_id: 'glow_pro_monthly',
            free_scans_used: 0,
            trial_start_date: null,
            trial_end_date: null,
          },
        }),
      );
      await useStore.getState().loadPersistedData();
      const sub = useStore.getState().subscription;
      expect(sub.trial_start_date).toBeNull();
      expect(sub.is_active).toBe(true);
    });

    it('does NOT touch a user whose trial has already expired', async () => {
      mockGetItem.mockResolvedValueOnce(
        JSON.stringify({
          user: { user_id: 'u3', age_range: '25-34', onboarding_complete: true },
          subscription: {
            tier: 'free',
            is_active: false,
            expires_at: null,
            product_id: null,
            free_scans_used: 0,
            trial_start_date: '2020-01-01T00:00:00.000Z',
            trial_end_date: '2020-01-08T00:00:00.000Z',
          },
        }),
      );
      await useStore.getState().loadPersistedData();
      expect(useStore.getState().subscription.trial_end_date).toBe('2020-01-08T00:00:00.000Z');
      expect(useStore.getState().subscription.trial_start_date).toBe('2020-01-01T00:00:00.000Z');
    });
  });

  describe('consideringList cap', () => {
    // Mirrors CONSIDERING_MAX in useStore.ts — the persisted wishlist is capped
    // to the most-recent N entries to prevent AsyncStorage bloat, matching the
    // 365-day records-cap convention.
    const CAP = 100;

    const makeConsideringItem = (
      id: string,
      overrides: Partial<ConsideringItem> = {},
    ): ConsideringItem => ({
      id,
      name: `Product ${id}`,
      verdict: 'maybe',
      score: 50,
      result: {
        identified: true,
        product: { name: `Product ${id}`, brand: 'Acme', ingredients: [], image_url: null, source: 'test' },
        verdict: 'maybe',
        score: 50,
        headline: 'Worth a look',
        reasons: [],
        goalFit: { score: 50, beneficial: [], label: 'meh' },
        conflicts: [],
        redundancy: null,
        flags: [],
      },
      savedAt: 0,
      ...overrides,
    });

    beforeEach(() => {
      useStore.setState({ consideringList: [] });
    });

    it('caps at CAP on append, dropping the oldest and keeping the newest', () => {
      for (let i = 0; i < CAP + 5; i++) {
        useStore.getState().saveToConsidering(makeConsideringItem(`item-${i}`, { savedAt: i }));
      }
      const list = useStore.getState().consideringList;
      expect(list).toHaveLength(CAP);
      expect(list.find((c) => c.id === 'item-0')).toBeUndefined();
      expect(list.find((c) => c.id === `item-${CAP + 4}`)).toBeDefined();
    });

    it('updates an existing id in place without changing length or dropping others', () => {
      useStore.getState().saveToConsidering(makeConsideringItem('a', { score: 10 }));
      useStore.getState().saveToConsidering(makeConsideringItem('b', { score: 20 }));
      useStore.getState().saveToConsidering(makeConsideringItem('c', { score: 30 }));

      useStore.getState().saveToConsidering(makeConsideringItem('b', { score: 99 }));

      const list = useStore.getState().consideringList;
      expect(list).toHaveLength(3);
      expect(list.map((x) => x.id)).toEqual(['a', 'b', 'c']);
      expect(list.find((x) => x.id === 'b')?.score).toBe(99);
    });

    it('keeps all items when saving fewer than the cap', () => {
      for (let i = 0; i < 5; i++) {
        useStore.getState().saveToConsidering(makeConsideringItem(`u-${i}`));
      }
      expect(useStore.getState().consideringList).toHaveLength(5);
    });

    it('trims a previously-bloated persisted list to CAP on load, keeping the newest', async () => {
      const mockGetItem = AsyncStorage.getItem as jest.Mock;
      const bloated = Array.from({ length: CAP + 50 }, (_, i) =>
        makeConsideringItem(`p-${i}`, { savedAt: i }),
      );
      mockGetItem.mockResolvedValueOnce(
        JSON.stringify({
          user: { user_id: 'u1', age_range: '25-34', onboarding_complete: true },
          consideringList: bloated,
        }),
      );

      await useStore.getState().loadPersistedData();

      const list = useStore.getState().consideringList;
      expect(list).toHaveLength(CAP);
      expect(list.find((c) => c.id === 'p-0')).toBeUndefined();
      expect(list.find((c) => c.id === `p-${CAP + 49}`)).toBeDefined();

      mockGetItem.mockReset();
      mockGetItem.mockResolvedValue(null);
    });
  });
});
