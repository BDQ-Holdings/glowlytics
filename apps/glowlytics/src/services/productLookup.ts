import * as api from './api';
import { httpJson, isNetworkError } from './httpClient';
import { trackEvent } from './analytics';

// Third-party product DBs are best-effort waterfall — we never want a slow
// source to block the user. Cap each call at 6s with no retry; if it whiffs,
// the next source in the list picks up.
const THIRD_PARTY_TIMEOUT_MS = 6_000;

async function fetchThirdPartyJson<T>(url: string, source: string): Promise<T | null> {
  try {
    return await httpJson<T>(url, {
      method: 'GET',
      authenticated: false,
      timeoutMs: THIRD_PARTY_TIMEOUT_MS,
      retries: 0,
    });
  } catch (err) {
    trackEvent('product_lookup_source_failed', {
      source,
      reason: isNetworkError(err) ? 'network' : 'http',
      message: err instanceof Error ? err.message.slice(0, 160) : 'unknown',
    });
    return null;
  }
}

export interface ProductResult {
  name: string;
  brand?: string;
  ingredients: string[];
  source: string;
}

export interface SearchResult {
  name: string;
  brand?: string;
  ingredients: string[];
}

export interface PhotoIdentifyResult {
  identified: boolean;
  name: string;
  brand: string;
  ingredients: string[];
  confidence: 'low' | 'med' | 'high';
}

// ---- Individual lookup sources ----

/**
 * Parse ingredients from an Open Beauty Facts / Open Food Facts product payload.
 * Tries multiple fields in priority order. Previous code only looked at
 * ingredients_text, which silently dropped ingredients for products that had
 * structured data but no flat text field.
 */
function parseObfIngredients(p: any): string[] {
  // 1. Flat text field (most common on populated products)
  if (typeof p?.ingredients_text === 'string' && p.ingredients_text.trim().length > 0) {
    const parts = p.ingredients_text.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts;
  }
  // 2. Structured array (newer OBF entries)
  if (Array.isArray(p?.ingredients) && p.ingredients.length > 0) {
    const fromStructured = p.ingredients
      .map((i: any) => (typeof i?.text === 'string' ? i.text : (typeof i?.id === 'string' ? i.id.replace(/^en:/, '') : null)))
      .filter(Boolean) as string[];
    if (fromStructured.length > 0) return fromStructured;
  }
  // 3. Canonical hierarchy (fallback — loses order but keeps coverage)
  if (Array.isArray(p?.ingredients_hierarchy) && p.ingredients_hierarchy.length > 0) {
    return p.ingredients_hierarchy
      .map((s: string) => (typeof s === 'string' ? s.replace(/^en:/, '').trim() : ''))
      .filter(Boolean);
  }
  return [];
}

export async function lookupOpenBeautyFacts(barcode: string): Promise<ProductResult | null> {
  const data = await fetchThirdPartyJson<any>(
    `https://world.openbeautyfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
    'open_beauty_facts',
  );
  if (!data || data.status !== 1 || !data.product?.product_name) return null;
  const p = data.product;
  const ingredients = parseObfIngredients(p);
  if (ingredients.length === 0) {
    trackEvent('product_ingredients_empty', { source: 'open_beauty_facts', barcode });
  }
  return {
    name: p.product_name,
    ingredients,
    source: 'Open Beauty Facts',
  };
}

export async function lookupOpenFoodFacts(barcode: string): Promise<ProductResult | null> {
  const data = await fetchThirdPartyJson<any>(
    `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
    'open_food_facts',
  );
  if (!data || data.status !== 1 || !data.product?.product_name) return null;
  const p = data.product;
  const ingredients = parseObfIngredients(p);
  if (ingredients.length === 0) {
    trackEvent('product_ingredients_empty', { source: 'open_food_facts', barcode });
  }
  return {
    name: p.product_name,
    ingredients,
    source: 'Open Food Facts',
  };
}

export async function lookupUPCitemdb(barcode: string): Promise<ProductResult | null> {
  const data = await fetchThirdPartyJson<any>(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
    'upcitemdb',
  );
  if (!data?.items?.length || !data.items[0].title) return null;
  return {
    name: data.items[0].title,
    ingredients: [],
    source: 'UPCitemdb',
  };
}

export async function lookupNIHDailyMed(barcode: string): Promise<ProductResult | null> {
  // NIH DailyMed doesn't support barcode lookup directly, but we can try
  // UPC/NDC-based search via their API
  const data = await fetchThirdPartyJson<any>(
    `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?ndc=${encodeURIComponent(barcode)}`,
    'nih_dailymed',
  );
  if (!data?.data?.length) return null;
  const spl = data.data[0];
  return {
    name: spl.title || spl.spl_name || 'Unknown Product',
    ingredients: spl.active_ingredients
      ? spl.active_ingredients.map((i: { name: string }) => i.name)
      : [],
    source: 'NIH DailyMed',
  };
}

// ---- Text search ----

export async function searchOpenBeautyFacts(query: string): Promise<SearchResult[]> {
  const data = await fetchThirdPartyJson<any>(
    `https://world.openbeautyfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=10`,
    'open_beauty_facts_search',
  );
  if (!data?.products?.length) return [];
  return data.products
    .filter((p: any) => p.product_name)
    .map((p: any) => ({
      name: p.product_name,
      ingredients: parseObfIngredients(p),
    }));
}

// ---- Waterfall lookup ----

const lookupSources = [
  lookupOpenBeautyFacts,
  lookupOpenFoodFacts,
  lookupUPCitemdb,
  lookupNIHDailyMed,
];

export async function lookupBarcode(barcode: string): Promise<ProductResult | null> {
  // Try backend first (has curated DB + ingredient enrichment)
  try {
    const backendResult = await api.lookupBarcode(barcode);
    const ingredients = backendResult.ingredients
      ? backendResult.ingredients.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];
    return {
      name: backendResult.name,
      brand: backendResult.brands || undefined,
      ingredients,
      source: backendResult.source,
    };
  } catch {
    // Backend unreachable — fall back to client-side waterfall
  }

  for (const lookup of lookupSources) {
    try {
      const result = await lookup(barcode);
      if (result) return result;
    } catch {
      // Source failed, try next
    }
  }
  return null;
}

// ---- Multi-source search via backend ----


// ---------------------------------------------------------------------------
// Search result cache
// ---------------------------------------------------------------------------
// Quick win for "search feels slow": skip the network when we already have
// a recent result for the same trimmed/lowercased query. 60s TTL is short
// enough that a curated DB or external update lands within a session; the
// cap of 32 entries keeps memory bounded.
// ---------------------------------------------------------------------------
const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_CACHE_MAX = 32;
const searchCache = new Map<string, { at: number; results: SearchResult[] }>();

const cacheKey = (q: string) => q.trim().toLowerCase();

const readSearchCache = (q: string): SearchResult[] | null => {
  const entry = searchCache.get(cacheKey(q));
  if (!entry) return null;
  if (Date.now() - entry.at > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(cacheKey(q));
    return null;
  }
  return entry.results;
};

const writeSearchCache = (q: string, results: SearchResult[]): void => {
  if (results.length === 0) return; // Don't cache zero-result queries
  if (searchCache.size >= SEARCH_CACHE_MAX) {
    // FIFO eviction — drop the oldest insertion to bound memory.
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }
  searchCache.set(cacheKey(q), { at: Date.now(), results });
};

/** Test-only escape hatch. */
export const __clearProductSearchCache = () => searchCache.clear();

/**
 * Search products across sources. If the full query returns 0 results, falls back
 * to a first-word retry (usually just the brand name) — handles the case where
 * users type "cerave hydrating cleanser" but only the brand matches.
 *
 * Pass an `AbortSignal` to cancel a stale in-flight request when the caller's
 * input has moved on. Cancelled calls bypass the cache write.
 *
 * Logs zero-result queries for telemetry.
 */
export async function searchProductsMultiSource(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const cached = readSearchCache(query);
  if (cached) return cached;

  const runOnce = async (q: string): Promise<SearchResult[]> => {
    try {
      const results = await api.searchProducts(q, signal);
      return results.map((r) => ({
        name: r.name,
        brand: r.brands || undefined,
        ingredients: r.ingredients
          ? r.ingredients.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
      }));
    } catch (err) {
      // Caller cancelled — surface the cancellation up so the UI can ignore
      // the result rather than overwriting fresher input with a stale value.
      if (signal?.aborted) throw err;
      return searchOpenBeautyFacts(q);
    }
  };

  const trimmed = query.trim();
  const primary = await runOnce(trimmed);
  if (primary.length > 0) {
    writeSearchCache(trimmed, primary);
    return primary;
  }

  // Token-split fallback: try just the first word (usually the brand)
  const firstWord = trimmed.split(/\s+/)[0];
  if (firstWord && firstWord.length >= 2 && firstWord !== trimmed) {
    const fallback = await runOnce(firstWord);
    if (fallback.length > 0) {
      trackEvent('product_search_broadened', {
        original: trimmed,
        retry_with: firstWord,
        result_count: fallback.length,
      });
      writeSearchCache(trimmed, fallback);
      return fallback;
    }
  }

  // Still zero — log for observability
  trackEvent('product_search_zero_results', {
    query: trimmed,
    query_length: trimmed.length,
  });
  return [];
}

// ---- Photo-based product identification via backend ----

export async function identifyProductPhoto(imageBase64: string): Promise<PhotoIdentifyResult | null> {
  try {
    const result = await api.identifyProductPhoto(imageBase64);
    if (result.identified) {
      return {
        identified: true,
        name: result.name,
        brand: result.brand,
        ingredients: result.ingredients,
        confidence: result.confidence,
      };
    }
    return null;
  } catch {
    return null;
  }
}
