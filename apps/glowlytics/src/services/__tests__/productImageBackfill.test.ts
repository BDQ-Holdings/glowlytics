import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../../store/useStore';
import type { ProductEntry, UserProfile } from '../../types';
import { backfillProductImages } from '../productImageBackfill';
import { lookupProductImage } from '../productLookup';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../secureStorage');

jest.mock('../notifications', () => ({
  scheduleDailyReminder: jest.fn(() => Promise.resolve()),
  cancelDailyReminder: jest.fn(() => Promise.resolve()),
  scheduleRitualReminder: jest.fn(() => Promise.resolve()),
  cancelRitualReminder: jest.fn(() => Promise.resolve()),
  cancelAllAppNotifications: jest.fn(() => Promise.resolve()),
}));

jest.mock('uuid', () => ({
  v4: () => `test-id-${Date.now()}-${Math.random().toString(36).slice(2)}`,
}));

jest.mock('react-native-get-random-values', () => ({}));

jest.mock('react-native-purchases', () => ({
  LOG_LEVEL: { ERROR: 0 },
}));

jest.mock('react-native-purchases-ui', () => ({
  PAYWALL_RESULT: {},
}));

jest.mock('../api', () => ({
  lookupBarcode: jest.fn(),
  searchProducts: jest.fn(),
  identifyProductPhoto: jest.fn(),
  clearAuthTokenCache: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const setItemMock = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

interface MockResponseOptions {
  ok?: boolean;
  status?: number;
  contentType?: string;
  json?: unknown;
  text?: string;
}

const mockResponse = (opts: MockResponseOptions) => ({
  ok: opts.ok ?? true,
  status: opts.status ?? (opts.ok === false ? 500 : 200),
  statusText: opts.ok === false ? 'Error' : 'OK',
  headers: {
    get: (name: string) => (name.toLowerCase() === 'content-type' ? (opts.contentType ?? 'application/json') : null),
  },
  json: async () => opts.json,
  text: async () => (typeof opts.text === 'string' ? opts.text : JSON.stringify(opts.json ?? '')),
});

const product = (overrides: Partial<ProductEntry>): ProductEntry => ({
  user_product_id: overrides.user_product_id ?? 'prod_1',
  user_id: overrides.user_id ?? 'user_1',
  product_name: overrides.product_name ?? 'CeraVe Moisturizing Cream',
  brand: overrides.brand,
  product_capture_method: overrides.product_capture_method ?? 'barcode',
  ingredients_list: overrides.ingredients_list ?? ['Ceramides'],
  usage_schedule: overrides.usage_schedule ?? 'AM',
  start_date: overrides.start_date ?? '2026-03-01',
  end_date: overrides.end_date,
  notes: overrides.notes,
  image_url: overrides.image_url ?? null,
});

const resetStore = (products: ProductEntry[]) => {
  useStore.setState({
    user: { user_id: 'user_1', onboarding_complete: true } as UserProfile,
    products,
    dailyRecords: [],
    modelOutputs: [],
    protocol: null,
  });
};

const flushPersist = async () => {
  jest.advanceTimersByTime(50);
  await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  mockFetch.mockReset();
  setItemMock.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('backfillProductImages', () => {
  it('patches null-image barcode and search products with resolved Open Beauty Facts images', async () => {
    resetStore([
      product({ user_product_id: 'barcode_hit', product_name: 'CeraVe Moisturizing Cream', brand: 'CeraVe', product_capture_method: 'barcode' }),
      product({ user_product_id: 'search_hit', product_name: 'PanOxyl Acne Foaming Wash', brand: 'PanOxyl', product_capture_method: 'search' }),
    ]);
    mockFetch
      .mockResolvedValueOnce(mockResponse({
        json: { products: [{ product_name: 'CeraVe Moisturizing Cream', brands: 'CeraVe', image_front_url: 'https://img.example/cerave.jpg' }] },
      }))
      .mockResolvedValueOnce(mockResponse({
        json: { products: [{ product_name: 'PanOxyl Acne Foaming Wash', brands: 'PanOxyl', image_url: 'https://img.example/panoxyl.jpg' }] },
      }));

    await backfillProductImages();
    await flushPersist();

    expect(useStore.getState().products.map((p) => [p.user_product_id, p.image_url])).toEqual([
      ['barcode_hit', 'https://img.example/cerave.jpg'],
      ['search_hit', 'https://img.example/panoxyl.jpg'],
    ]);
    expect(setItemMock).toHaveBeenCalled();
  });

  it('leaves photo-captured and already-imaged products untouched', async () => {
    resetStore([
      product({ user_product_id: 'photo_skip', product_name: 'Hand-typed serum', product_capture_method: 'photo', image_url: null }),
      product({ user_product_id: 'imaged_skip', product_name: 'CeraVe Cleanser', product_capture_method: 'search', image_url: 'https://img.example/existing.jpg' }),
    ]);

    await backfillProductImages();
    await flushPersist();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(useStore.getState().products.map((p) => [p.user_product_id, p.image_url])).toEqual([
      ['photo_skip', null],
      ['imaged_skip', 'https://img.example/existing.jpg'],
    ]);
    expect(setItemMock).not.toHaveBeenCalled();
  });

  it('does not patch null lookups and does not retry an attempted product in the same session', async () => {
    resetStore([
      product({ user_product_id: 'miss_once', product_name: 'CeraVe Moisturizing Cream', brand: 'CeraVe', product_capture_method: 'barcode' }),
    ]);
    mockFetch.mockResolvedValueOnce(mockResponse({ json: { products: [] } }));

    await backfillProductImages();
    await backfillProductImages();
    await flushPersist();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(useStore.getState().products[0].image_url).toBeNull();
    expect(setItemMock).not.toHaveBeenCalled();
  });
});

describe('lookupProductImage', () => {
  it('rejects a wrong-brand Open Beauty Facts candidate even when the product name overlaps', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      json: {
        products: [
          { product_name: 'Moisturizing Cream', brands: 'Vanicream', image_front_url: 'https://img.example/wrong.jpg' },
        ],
      },
    }));

    await expect(lookupProductImage('CeraVe Moisturizing Cream', 'CeraVe')).resolves.toBeNull();
  });
});
