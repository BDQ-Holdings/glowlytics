import * as api from './api';
import { trackEvent } from './analytics';

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
  const res = await fetch(
    `https://world.openbeautyfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`
  );
  const data = await res.json();
  if (data.status === 1 && data.product?.product_name) {
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
  return null;
}

export async function lookupOpenFoodFacts(barcode: string): Promise<ProductResult | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`
  );
  const data = await res.json();
  if (data.status === 1 && data.product?.product_name) {
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
  return null;
}

export async function lookupUPCitemdb(barcode: string): Promise<ProductResult | null> {
  const res = await fetch(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (data.items && data.items.length > 0 && data.items[0].title) {
    return {
      name: data.items[0].title,
      ingredients: [],
      source: 'UPCitemdb',
    };
  }
  return null;
}

export async function lookupNIHDailyMed(barcode: string): Promise<ProductResult | null> {
  // NIH DailyMed doesn't support barcode lookup directly, but we can try
  // UPC/NDC-based search via their API
  const res = await fetch(
    `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?ndc=${encodeURIComponent(barcode)}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (data.data && data.data.length > 0) {
    const spl = data.data[0];
    return {
      name: spl.title || spl.spl_name || 'Unknown Product',
      ingredients: spl.active_ingredients
        ? spl.active_ingredients.map((i: { name: string }) => i.name)
        : [],
      source: 'NIH DailyMed',
    };
  }
  return null;
}

// ---- Text search ----

export async function searchOpenBeautyFacts(query: string): Promise<SearchResult[]> {
  const res = await fetch(
    `https://world.openbeautyfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=10`
  );
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.products || data.products.length === 0) return [];
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

/**
 * Search products across sources. If the full query returns 0 results, falls back
 * to a first-word retry (usually just the brand name) — handles the case where
 * users type "cerave hydrating cleanser" but only the brand matches.
 * Logs zero-result queries for telemetry.
 */
export async function searchProductsMultiSource(query: string): Promise<SearchResult[]> {
  const runOnce = async (q: string): Promise<SearchResult[]> => {
    try {
      const results = await api.searchProducts(q);
      return results.map((r) => ({
        name: r.name,
        brand: r.brands || undefined,
        ingredients: r.ingredients
          ? r.ingredients.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
      }));
    } catch {
      return searchOpenBeautyFacts(q);
    }
  };

  const trimmed = query.trim();
  const primary = await runOnce(trimmed);
  if (primary.length > 0) return primary;

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
