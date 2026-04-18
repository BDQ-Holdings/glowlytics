import {
  lookupOpenBeautyFacts,
  lookupOpenFoodFacts,
  lookupUPCitemdb,
  lookupBarcode,
  searchProductsMultiSource,
  identifyProductPhoto,
} from '../productLookup';

// Mock the api module so backend calls don't interfere with direct API tests
jest.mock('../api', () => ({
  lookupBarcode: jest.fn(),
  searchProducts: jest.fn(),
  identifyProductPhoto: jest.fn(),
}));

import * as api from '../api';
const mockApiLookup = api.lookupBarcode as jest.MockedFunction<typeof api.lookupBarcode>;
const mockApiSearch = api.searchProducts as jest.MockedFunction<typeof api.searchProducts>;
const mockApiIdentify = api.identifyProductPhoto as jest.MockedFunction<typeof api.identifyProductPhoto>;

// Mock global fetch for direct API calls (OBF, OFF, UPC, DailyMed)
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
  mockApiLookup.mockReset();
  mockApiSearch.mockReset();
  mockApiIdentify.mockReset();
});

describe('lookupOpenBeautyFacts', () => {
  it('returns product when found', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        status: 1,
        product: {
          product_name: 'CeraVe Moisturizer',
          ingredients_text: 'Ceramides, Hyaluronic Acid, Niacinamide',
        },
      }),
    });

    const result = await lookupOpenBeautyFacts('123456789');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('CeraVe Moisturizer');
    expect(result!.ingredients).toEqual(['Ceramides', 'Hyaluronic Acid', 'Niacinamide']);
    expect(result!.source).toBe('Open Beauty Facts');
  });

  it('returns null when product not found', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ status: 0 }),
    });

    const result = await lookupOpenBeautyFacts('000000000');
    expect(result).toBeNull();
  });
});

describe('lookupOpenFoodFacts', () => {
  it('returns product when found', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        status: 1,
        product: {
          product_name: 'Some Food Product',
          ingredients_text: 'Water, Salt',
        },
      }),
    });

    const result = await lookupOpenFoodFacts('123456789');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Some Food Product');
    expect(result!.source).toBe('Open Food Facts');
  });
});

describe('lookupUPCitemdb', () => {
  it('returns product when found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ title: 'Neutrogena Hydro Boost' }],
      }),
    });

    const result = await lookupUPCitemdb('123456789');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Neutrogena Hydro Boost');
    expect(result!.source).toBe('UPCitemdb');
  });

  it('returns null when API returns error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const result = await lookupUPCitemdb('000000000');
    expect(result).toBeNull();
  });

  it('returns null when no items found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    const result = await lookupUPCitemdb('000000000');
    expect(result).toBeNull();
  });
});

describe('lookupBarcode (backend-first + waterfall)', () => {
  it('returns backend result when available', async () => {
    mockApiLookup.mockResolvedValueOnce({
      name: 'CeraVe Moisturizing Cream',
      brands: 'CeraVe',
      ingredients: 'Ceramides, Hyaluronic Acid',
      image_url: null,
      source: 'curated',
    });

    const result = await lookupBarcode('301871371160');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('CeraVe Moisturizing Cream');
    expect(result!.brand).toBe('CeraVe');
    expect(result!.ingredients).toEqual(['Ceramides', 'Hyaluronic Acid']);
    // Should not have called fetch (waterfall not reached)
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('falls back to waterfall when backend fails', async () => {
    mockApiLookup.mockRejectedValueOnce(new Error('API 404'));

    // First waterfall source (OBF) succeeds
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        status: 1,
        product: {
          product_name: 'Tretinoin Cream',
          ingredients_text: 'Tretinoin 0.025%',
        },
      }),
    });

    const result = await lookupBarcode('123456789');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Tretinoin Cream');
    expect(result!.source).toBe('Open Beauty Facts');
  });

  it('returns null when all sources fail', async () => {
    mockApiLookup.mockRejectedValueOnce(new Error('API error'));
    mockFetch.mockResolvedValueOnce({ json: async () => ({ status: 0 }) });
    mockFetch.mockResolvedValueOnce({ json: async () => ({ status: 0 }) });
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockFetch.mockResolvedValueOnce({ ok: false });

    const result = await lookupBarcode('000000000');
    expect(result).toBeNull();
  });

  it('handles network errors gracefully', async () => {
    mockApiLookup.mockRejectedValueOnce(new Error('Network error'));
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await lookupBarcode('123456789');
    expect(result).toBeNull();
  });
});

describe('searchProductsMultiSource', () => {
  it('returns parsed results from backend', async () => {
    mockApiSearch.mockResolvedValueOnce([
      { name: 'PanOxyl Acne Wash', brands: 'PanOxyl', ingredients: 'Benzoyl Peroxide, Water', image_url: null, source: 'curated' },
      { name: 'Another Product', brands: '', ingredients: '', image_url: null, source: 'Open Beauty Facts' },
    ]);

    const results = await searchProductsMultiSource('panoxyl');
    expect(results.length).toBe(2);
    expect(results[0].name).toBe('PanOxyl Acne Wash');
    expect(results[0].brand).toBe('PanOxyl');
    expect(results[0].ingredients).toEqual(['Benzoyl Peroxide', 'Water']);
  });

  it('falls back to OBF when backend is unreachable', async () => {
    mockApiSearch.mockRejectedValueOnce(new Error('Network error'));

    // OBF direct fallback
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        products: [
          { product_name: 'Some Product', ingredients_text: 'Water' },
        ],
      }),
    });

    const results = await searchProductsMultiSource('test');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Some Product');
  });

  it('handles empty backend results', async () => {
    mockApiSearch.mockResolvedValueOnce([]);

    const results = await searchProductsMultiSource('zzzzz');
    expect(results).toEqual([]);
  });
});

describe('identifyProductPhoto', () => {
  it('returns identified product from backend', async () => {
    mockApiIdentify.mockResolvedValueOnce({
      identified: true,
      name: 'CeraVe Moisturizer',
      brand: 'CeraVe',
      ingredients: ['Ceramides', 'Hyaluronic Acid'],
      confidence: 'high' as const,
      source: 'gpt4o_vision',
    });

    const result = await identifyProductPhoto('base64data');
    expect(result).not.toBeNull();
    expect(result!.identified).toBe(true);
    expect(result!.name).toBe('CeraVe Moisturizer');
    expect(result!.brand).toBe('CeraVe');
    expect(result!.confidence).toBe('high');
  });

  it('returns null when product not identified', async () => {
    mockApiIdentify.mockResolvedValueOnce({
      identified: false,
      name: '',
      brand: '',
      ingredients: [],
      confidence: 'low' as const,
      error: 'Could not identify',
    });

    const result = await identifyProductPhoto('base64data');
    expect(result).toBeNull();
  });

  it('returns null when backend call fails', async () => {
    mockApiIdentify.mockRejectedValueOnce(new Error('Network error'));

    const result = await identifyProductPhoto('base64data');
    expect(result).toBeNull();
  });
});
