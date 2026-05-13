import {
  ProductCategory,
  CATEGORY_DEFS,
  INGREDIENT_CLASS_PATTERNS,
  CONFLICT_RULES,
  IngredientClass,
} from '../constants/ingredients';
import { ProductEntry } from '../types';

// ─── Exported Interfaces ────────────────────────────────────────────────────

export interface CategorizedProduct {
  product: ProductEntry;
  category: ProductCategory;
  amOrder: number;
  pmOrder: number;
  timingLabel: string;
  score?: number;
  topContributor?: string;
}

export interface DetectedConflict {
  productA: string;
  productB: string;
  message: string;
  resolution: string;
  actionable: boolean;
}

export interface AdjustmentTip {
  text: string;
  signal: string;
  color: 'success' | 'warning' | 'info';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Return true if any ingredient/name text matches a given pattern (case-insensitive substring). */
function matchesAny(texts: string[], patterns: string[]): boolean {
  if (!texts || texts.length === 0) return false;
  const lower = texts.filter(Boolean).map((t) => t.toLowerCase());
  return patterns.some((p) => lower.some((t) => t.includes(p.toLowerCase())));
}

/** Return true if a product's ingredients list contains a specific ingredient string. */
function hasIngredient(product: ProductEntry, ingredient: string): boolean {
  if (!product.ingredients_list) return false;
  const lw = ingredient.toLowerCase();
  return product.ingredients_list.filter(Boolean).some((i) => i.toLowerCase().includes(lw));
}

/** Truncate a product name for display in tips (max 30 chars). */
function shortName(name: string): string {
  return name.length > 30 ? name.slice(0, 27) + '...' : name;
}

/** Return true if a product's ingredients or name matches the given IngredientClass patterns. */
function productMatchesClass(product: ProductEntry, cls: IngredientClass): boolean {
  const texts = [product.product_name, ...(product.ingredients_list || [])];
  return matchesAny(texts, INGREDIENT_CLASS_PATTERNS[cls]);
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Categorize a product by matching its name + ingredients against CATEGORY_DEFS.
 * The highest-priority matching category wins. Falls back to 'unknown'.
 */
export function categorizeProduct(product: ProductEntry): CategorizedProduct {
  const texts = [product.product_name, ...(product.ingredients_list || [])];

  let bestDef: typeof CATEGORY_DEFS[number] | undefined;
  let highestPriority = -1;

  for (const def of CATEGORY_DEFS) {
    if (matchesAny(texts, def.patterns)) {
      if (def.priority > highestPriority) {
        highestPriority = def.priority;
        bestDef = def;
      }
    }
  }

  if (!bestDef) {
    // Fallback: create a synthetic unknown entry
    return {
      product,
      category: 'unknown',
      amOrder: 99,
      pmOrder: 99,
      timingLabel: '',
    };
  }

  return {
    product,
    category: bestDef.category,
    amOrder: bestDef.amOrder,
    pmOrder: bestDef.pmOrder,
    timingLabel: bestDef.timingLabel,
  };
}

/**
 * Categorize all products and sort them by application order for the given schedule.
 * Products with order 0 (not used in that schedule) are placed last.
 */
export function sortByApplicationOrder(
  products: ProductEntry[],
  schedule: 'AM' | 'PM'
): CategorizedProduct[] {
  const categorized = products.map(categorizeProduct);

  return categorized.sort((a, b) => {
    const orderA = schedule === 'AM' ? a.amOrder : a.pmOrder;
    const orderB = schedule === 'AM' ? b.amOrder : b.pmOrder;

    // 0 means "not applicable" — sort to the end
    const effectiveA = orderA === 0 ? Number.MAX_SAFE_INTEGER : orderA;
    const effectiveB = orderB === 0 ? Number.MAX_SAFE_INTEGER : orderB;

    return effectiveA - effectiveB;
  });
}

/**
 * Detect ingredient conflicts across the product list.
 * For each CONFLICT_RULE, find all product pairs where one contains classA ingredients
 * and another contains classB ingredients. Deduplicates by sorted product-name pair.
 */
export function detectConflicts(products: ProductEntry[]): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  // Track seen pairs to deduplicate
  const seenPairs = new Set<string>();

  for (const rule of CONFLICT_RULES) {
    const classAProducts = products.filter((p) => productMatchesClass(p, rule.classA));
    const classBProducts = products.filter((p) => productMatchesClass(p, rule.classB));

    for (const pA of classAProducts) {
      for (const pB of classBProducts) {
        // Skip self-matches (same product matches both classes)
        if (pA.user_product_id === pB.user_product_id) continue;

        // Check exempt ingredient: if either product contains the exempt ingredient, skip
        if (rule.exemptIngredient) {
          const aHasExempt = hasIngredient(pA, rule.exemptIngredient);
          const bHasExempt = hasIngredient(pB, rule.exemptIngredient);
          if (aHasExempt || bHasExempt) continue;
        }

        // Dedup by sorted pair of product names
        const pairKey = [pA.user_product_id, pB.user_product_id].sort().join('|||');
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        conflicts.push({
          productA: pA.product_name,
          productB: pB.product_name,
          message: rule.message,
          resolution: rule.resolution,
          actionable: rule.actionable,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Generate personalised adjustment tips based on signal scores and the user's
 * current product roster.
 */
export function generateAdjustments(
  products: ProductEntry[],
  signals: { structure?: number; hydration?: number; inflammation?: number; sunDamage?: number; elasticity?: number }
): AdjustmentTip[] {
  const tips: AdjustmentTip[] = [];

  const inflammation = signals.inflammation ?? 0;
  const hydration = signals.hydration ?? 0;
  const sunDamage = signals.sunDamage ?? 0;
  const structure = signals.structure ?? 0;

  // Find products containing specific ingredient classes
  const retinoidProduct = products.find((p) => productMatchesClass(p, 'retinoid'));
  const haProduct = products.find((p) =>
    matchesAny([p.product_name, ...(p.ingredients_list || [])], ['hyaluronic acid'])
  );
  const vitCProduct = products.find((p) => productMatchesClass(p, 'vitamin_c'));

  // ── Inflammation > 60 + has retinoid → warn to pause
  if (inflammation > 60 && retinoidProduct) {
    tips.push({
      text: `Your inflammation is elevated \u2014 consider pausing ${shortName(retinoidProduct.product_name)} for 2 weeks`,
      signal: 'inflammation',
      color: 'warning',
    });
  }

  // ── Hydration < 40 + has HA → suggest application tip
  if (hydration < 40 && haProduct) {
    tips.push({
      text: `Apply ${shortName(haProduct.product_name)} to damp skin for better absorption`,
      signal: 'hydration',
      color: 'info',
    });
  }

  // ── Hydration < 40 + no HA → suggest adding one
  if (hydration < 40 && !haProduct) {
    tips.push({
      text: 'A hyaluronic acid serum could help',
      signal: 'hydration',
      color: 'info',
    });
  }

  // ── Sun damage > 50 + has vitamin C not in AM → suggest moving
  if (sunDamage > 50 && vitCProduct) {
    const schedule = vitCProduct.usage_schedule;
    if (schedule === 'PM') {
      tips.push({
        text: `Move ${shortName(vitCProduct.product_name)} to your AM routine`,
        signal: 'sunDamage',
        color: 'warning',
      });
    }
  }

  // ── Structure < 40 + has retinoid → patience tip
  if (structure < 40 && retinoidProduct) {
    tips.push({
      text: `Give ${shortName(retinoidProduct.product_name)} 8\u201312 weeks for full effect`,
      signal: 'structure',
      color: 'info',
    });
  }

  // ── Structure < 40 + no retinoid → suggest adding one
  if (structure < 40 && !retinoidProduct) {
    tips.push({
      text: 'A retinoid in your PM routine could improve structure',
      signal: 'structure',
      color: 'info',
    });
  }

  return tips;
}
