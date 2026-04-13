import {
  categorizeProduct,
  sortByApplicationOrder,
  detectConflicts,
  generateAdjustments,
  CategorizedProduct,
  DetectedConflict,
  AdjustmentTip,
} from '../routineBuilder';
import { ProductEntry } from '../../types';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<ProductEntry> & { product_name: string }): ProductEntry {
  return {
    user_product_id: overrides.product_name.replace(/\s+/g, '_').toLowerCase(),
    user_id: 'user_test',
    product_capture_method: 'search',
    ingredients_list: [],
    usage_schedule: 'both',
    start_date: '2026-01-01',
    ...overrides,
  };
}

// ─── categorizeProduct ───────────────────────────────────────────────────────

describe('categorizeProduct', () => {
  it('categorizes an SPF product by ingredient', () => {
    const product = makeProduct({
      product_name: 'Daily Sunscreen',
      ingredients_list: ['Avobenzone', 'Zinc Oxide', 'Water'],
    });
    const result = categorizeProduct(product);
    expect(result.category).toBe('spf');
    expect(result.amOrder).toBe(5);
    expect(result.pmOrder).toBe(0);
    expect(result.timingLabel).toBe('last step');
  });

  it('categorizes retinol serum as serum_oil by ingredient', () => {
    const product = makeProduct({
      product_name: 'Night Renewal Serum',
      ingredients_list: ['Retinol', 'Squalane', 'Jojoba Oil'],
    });
    const result = categorizeProduct(product);
    expect(result.category).toBe('serum_oil');
  });

  it('SPF wins over moisturizer when product matches both', () => {
    // A product that contains both SPF and moisturizer patterns
    const product = makeProduct({
      product_name: 'SPF Moisturizer Lotion',
      ingredients_list: ['Avobenzone', 'Zinc Oxide', 'Ceramide', 'Dimethicone'],
    });
    const result = categorizeProduct(product);
    // SPF has priority 10, moisturizer has priority 4 — SPF should win
    expect(result.category).toBe('spf');
  });

  it('returns unknown for a product with no recognisable ingredients', () => {
    const product = makeProduct({
      product_name: 'Mystery Blend',
      ingredients_list: ['Water', 'Glycerin'],
    });
    const result = categorizeProduct(product);
    expect(result.category).toBe('unknown');
  });

  it('matches category from product name when ingredients list is empty', () => {
    const product = makeProduct({
      product_name: 'Gentle Face Cleanser',
      ingredients_list: [],
    });
    const result = categorizeProduct(product);
    expect(result.category).toBe('cleanser');
  });
});

// ─── sortByApplicationOrder ──────────────────────────────────────────────────

describe('sortByApplicationOrder', () => {
  it('sorts AM routine products in correct order: cleanser→toner→serum→moisturizer→SPF', () => {
    const cleanser = makeProduct({
      product_name: 'Gentle Face Wash',
      ingredients_list: ['Cocamidopropyl', 'Water'],
    });
    const spf = makeProduct({
      product_name: 'SPF 50 Sunscreen',
      ingredients_list: ['Avobenzone', 'Zinc Oxide'],
    });
    const moisturizer = makeProduct({
      product_name: 'Daily Moisturizer Cream',
      ingredients_list: ['Ceramide', 'Dimethicone'],
    });
    const serum = makeProduct({
      product_name: 'Vitamin C Serum',
      ingredients_list: ['Ascorbic Acid', 'Niacinamide'],
    });

    const sorted = sortByApplicationOrder([spf, moisturizer, serum, cleanser], 'AM');
    const categories = sorted.map((p) => p.category);

    expect(categories[0]).toBe('cleanser');   // amOrder 1
    expect(categories[1]).toBe('serum_water'); // amOrder 3
    expect(categories[2]).toBe('moisturizer'); // amOrder 4
    expect(categories[3]).toBe('spf');         // amOrder 5
  });

  it('places PM-only products (amOrder 0) at the end of AM sort', () => {
    const retinol = makeProduct({
      product_name: 'Retinol Night Oil',
      ingredients_list: ['Retinol', 'Squalane'],
    });
    const cleanser = makeProduct({
      product_name: 'Gentle Cleanser',
      ingredients_list: ['Sodium Lauryl Sulfate'],
    });

    const sorted = sortByApplicationOrder([retinol, cleanser], 'AM');
    // cleanser (amOrder 1) should come before retinol (amOrder 0 → pushed to end)
    expect(sorted[0].category).toBe('cleanser');
    expect(sorted[1].category).toBe('serum_oil');
  });

  it('returns empty array for empty input', () => {
    expect(sortByApplicationOrder([], 'AM')).toEqual([]);
  });
});

// ─── detectConflicts ─────────────────────────────────────────────────────────

describe('detectConflicts', () => {
  it('detects retinoid + AHA/BHA conflict', () => {
    const retinol = makeProduct({
      product_name: 'Retinol Serum',
      ingredients_list: ['Retinol'],
      user_product_id: 'retinol_serum',
    });
    const aha = makeProduct({
      product_name: 'Glycolic Acid Toner',
      ingredients_list: ['Glycolic Acid'],
      user_product_id: 'glycolic_toner',
    });

    const conflicts = detectConflicts([retinol, aha]);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);

    const conflict = conflicts.find(
      (c) =>
        (c.productA === 'Retinol Serum' && c.productB === 'Glycolic Acid Toner') ||
        (c.productA === 'Glycolic Acid Toner' && c.productB === 'Retinol Serum')
    );
    expect(conflict).toBeDefined();
    expect(conflict!.actionable).toBe(true);
    expect(conflict!.resolution).toContain('Alternate evenings');
  });

  it('returns no conflicts when products are safe together', () => {
    const cleanser = makeProduct({
      product_name: 'Gentle Cleanser',
      ingredients_list: ['Cocamidopropyl'],
    });
    const moisturizer = makeProduct({
      product_name: 'Daily Moisturizer',
      ingredients_list: ['Ceramide', 'Shea Butter'],
    });

    const conflicts = detectConflicts([cleanser, moisturizer]);
    expect(conflicts).toHaveLength(0);
  });

  it('skips retinoid + benzoyl peroxide conflict when adapalene is present', () => {
    // Adapalene is the exemptIngredient for the retinoid+benzoyl_peroxide rule
    const adapaleneGel = makeProduct({
      product_name: 'Adapalene Gel 0.1%',
      ingredients_list: ['Adapalene'],
      user_product_id: 'adapalene_gel',
    });
    const bpo = makeProduct({
      product_name: 'PanOxyl Benzoyl Peroxide Wash',
      ingredients_list: ['Benzoyl Peroxide'],
      user_product_id: 'bpo_wash',
    });

    const conflicts = detectConflicts([adapaleneGel, bpo]);
    // The retinoid+benzoyl_peroxide rule should be skipped because adapalene is present
    const retinoidBpoConflict = conflicts.find(
      (c) => c.message.includes('Benzoyl peroxide degrades tretinoin')
    );
    expect(retinoidBpoConflict).toBeUndefined();
  });

  it('deduplicates identical product pairs across multiple rules', () => {
    // Two identical calls with the same products should not produce duplicates
    const retinol = makeProduct({
      product_name: 'Retinol Cream',
      ingredients_list: ['Retinol'],
      user_product_id: 'retinol_cream',
    });
    const aha = makeProduct({
      product_name: 'AHA Toner',
      ingredients_list: ['Lactic Acid'],
      user_product_id: 'aha_toner',
    });

    const conflicts = detectConflicts([retinol, aha]);
    // Should only appear once even though both classA+classB and classB+classA could match
    const pairs = conflicts.map((c) => [c.productA, c.productB].sort().join('|||'));
    const uniquePairs = new Set(pairs);
    expect(pairs.length).toBe(uniquePairs.size);
  });

  it('returns empty array for a single product', () => {
    const product = makeProduct({
      product_name: 'Solo Product',
      ingredients_list: ['Retinol', 'Glycolic Acid'],
    });
    const conflicts = detectConflicts([product]);
    expect(conflicts).toHaveLength(0);
  });
});

// ─── generateAdjustments ─────────────────────────────────────────────────────

describe('generateAdjustments', () => {
  it('warns to pause retinoid when inflammation is high', () => {
    const retinol = makeProduct({
      product_name: 'Retinol Night Serum',
      ingredients_list: ['Retinol'],
    });
    const tips = generateAdjustments([retinol], { inflammation: 75 });

    const tip = tips.find((t) => t.signal === 'inflammation');
    expect(tip).toBeDefined();
    expect(tip!.color).toBe('warning');
    expect(tip!.text).toContain('Retinol Night Serum');
    expect(tip!.text).toContain('2 weeks');
  });

  it('does not warn about retinoid when inflammation is low', () => {
    const retinol = makeProduct({
      product_name: 'Retinol Serum',
      ingredients_list: ['Retinol'],
    });
    const tips = generateAdjustments([retinol], { inflammation: 30 });

    const tip = tips.find((t) => t.signal === 'inflammation');
    expect(tip).toBeUndefined();
  });

  it('suggests adding retinoid when structure is low and none present', () => {
    const cleanser = makeProduct({
      product_name: 'Gentle Cleanser',
      ingredients_list: ['Cocamidopropyl'],
    });
    const tips = generateAdjustments([cleanser], { structure: 30 });

    const tip = tips.find((t) => t.signal === 'structure');
    expect(tip).toBeDefined();
    expect(tip!.text).toContain('retinoid');
    expect(tip!.color).toBe('info');
  });

  it('gives patience tip for retinoid when structure is low and retinoid is present', () => {
    const retinol = makeProduct({
      product_name: 'Tretinoin 0.025%',
      ingredients_list: ['Tretinoin'],
    });
    const tips = generateAdjustments([retinol], { structure: 35 });

    const tip = tips.find((t) => t.signal === 'structure');
    expect(tip).toBeDefined();
    expect(tip!.text).toContain('8\u201312 weeks');
    expect(tip!.color).toBe('info');
  });

  it('does not suggest adding retinoid when user already has one', () => {
    const retinol = makeProduct({
      product_name: 'Retinol Cream',
      ingredients_list: ['Retinol'],
    });
    const tips = generateAdjustments([retinol], { structure: 30 });

    const addRetinoidTip = tips.find(
      (t) => t.signal === 'structure' && t.text.includes('A retinoid')
    );
    expect(addRetinoidTip).toBeUndefined();
  });

  it('suggests moving vitamin C to AM when sun damage is high and it is PM', () => {
    const vitC = makeProduct({
      product_name: 'Vitamin C Brightening Serum',
      ingredients_list: ['Ascorbic Acid'],
      usage_schedule: 'PM',
    });
    const tips = generateAdjustments([vitC], { sunDamage: 65 });

    const tip = tips.find((t) => t.signal === 'sunDamage');
    expect(tip).toBeDefined();
    expect(tip!.text).toContain('AM routine');
    expect(tip!.color).toBe('warning');
  });

  it('does not warn about vitamin C placement when it is already in AM', () => {
    const vitC = makeProduct({
      product_name: 'C-Serum',
      ingredients_list: ['Ascorbic Acid'],
      usage_schedule: 'AM',
    });
    const tips = generateAdjustments([vitC], { sunDamage: 65 });

    const tip = tips.find((t) => t.signal === 'sunDamage');
    expect(tip).toBeUndefined();
  });

  it('returns empty tips when all signals are healthy and products are well-matched', () => {
    const spf = makeProduct({
      product_name: 'Daily SPF 50',
      ingredients_list: ['Zinc Oxide', 'Avobenzone'],
      usage_schedule: 'AM',
    });
    const tips = generateAdjustments([spf], {
      inflammation: 20,
      hydration: 70,
      sunDamage: 30,
      structure: 70,
    });
    expect(tips).toHaveLength(0);
  });

  it('suggests HA serum when hydration is low and no HA product exists', () => {
    const cleanser = makeProduct({
      product_name: 'Face Wash',
      ingredients_list: ['Cocamidopropyl'],
    });
    const tips = generateAdjustments([cleanser], { hydration: 25 });

    const tip = tips.find((t) => t.signal === 'hydration');
    expect(tip).toBeDefined();
    expect(tip!.text).toContain('hyaluronic acid');
    expect(tip!.color).toBe('info');
  });
});
