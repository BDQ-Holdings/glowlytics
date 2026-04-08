import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../useStore';
import { localDateStr } from '../../utils/localDate';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

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

  describe('createUser auto-trial', () => {
    it('starts a 7-day trial when createUser runs without an existing trial', () => {
      useStore.getState().createUser({ age_range: '25-34' });
      const sub = useStore.getState().subscription;
      expect(sub.trial_start_date).not.toBeNull();
      expect(sub.trial_end_date).not.toBeNull();
      const start = new Date(sub.trial_start_date!).getTime();
      const end = new Date(sub.trial_end_date!).getTime();
      const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
      expect(days).toBe(7);
    });

    it('canPerformScan returns true immediately after createUser', () => {
      useStore.getState().createUser({ age_range: '25-34' });
      expect(useStore.getState().canPerformScan()).toBe(true);
    });

    it('does not overwrite an existing trial when createUser runs again', () => {
      useStore.getState().createUser({ age_range: '25-34' });
      const firstStart = useStore.getState().subscription.trial_start_date;
      useStore.getState().createUser({ age_range: '25-34' });
      expect(useStore.getState().subscription.trial_start_date).toBe(firstStart);
    });
  });
});
