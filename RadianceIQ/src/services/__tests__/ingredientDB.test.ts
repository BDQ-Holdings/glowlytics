import {
  matchIngredient,
  computeProductEffectiveness,
  generateProductBlurb,
  getUsageTips,
} from '../ingredientDB';
import type { ProductEntry } from '../../types';

const makeProduct = (
  name: string,
  ingredients: string[],
  schedule: 'AM' | 'PM' | 'both' = 'AM',
): ProductEntry => ({
  user_product_id: 'test-1',
  user_id: 'user-1',
  product_name: name,
  product_capture_method: 'search',
  ingredients_list: ingredients,
  usage_schedule: schedule,
  start_date: '2025-01-01',
});

describe('ingredientDB', () => {
  describe('matchIngredient', () => {
    it('matches canonical names', () => {
      const result = matchIngredient('Retinol');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Retinol');
    });

    it('matches aliases case-insensitively', () => {
      const result = matchIngredient('NIACINAMIDE');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Niacinamide');
    });

    it('matches partial/substring', () => {
      const result = matchIngredient('Glycolic Acid 10%');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Glycolic Acid');
    });

    it('returns null for unknown ingredients', () => {
      expect(matchIngredient('xyzqwerty')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(matchIngredient('')).toBeNull();
    });

    it('matches vitamin c variants', () => {
      const result = matchIngredient('L-Ascorbic Acid');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Vitamin C');
    });

    it('matches concerning ingredients', () => {
      const result = matchIngredient('Fragrance');
      expect(result).not.toBeNull();
      expect(result!.rating).toBe('potentially_concerning');
    });
  });

  describe('computeProductEffectiveness', () => {
    it('scores a strong acne product highly for acne goal', () => {
      const product = makeProduct('BHA Exfoliant', ['Salicylic Acid', 'Niacinamide', 'Green Tea Extract']);
      const result = computeProductEffectiveness(product, 'acne');
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.level).toMatch(/good|excellent/);
      expect(result.topContributors.length).toBeGreaterThan(0);
    });

    it('scores an SPF product highly for sun_damage goal', () => {
      const product = makeProduct('Anthelios SPF 50', ['Avobenzone', 'Homosalate', 'Niacinamide']);
      const result = computeProductEffectiveness(product, 'sun_damage');
      expect(result.score).toBeGreaterThanOrEqual(55);
    });

    it('penalizes concerning ingredients', () => {
      const withFragrance = makeProduct('Scented Moisturizer', ['Glycerin', 'Fragrance', 'SLS']);
      const without = makeProduct('Clean Moisturizer', ['Glycerin', 'Ceramides']);
      const scoreWith = computeProductEffectiveness(withFragrance, 'acne').score;
      const scoreWithout = computeProductEffectiveness(without, 'acne').score;
      expect(scoreWithout).toBeGreaterThan(scoreWith);
    });

    it('personalizes based on current signals', () => {
      const product = makeProduct('Hydrating Serum', ['Hyaluronic Acid', 'Ceramides']);
      const lowHydration = { structure: 70, hydration: 30, inflammation: 70, sunDamage: 70, elasticity: 70 };
      const highHydration = { structure: 70, hydration: 80, inflammation: 70, sunDamage: 70, elasticity: 70 };
      const scoreLow = computeProductEffectiveness(product, 'skin_age', lowHydration).score;
      const scoreHigh = computeProductEffectiveness(product, 'skin_age', highHydration).score;
      expect(scoreLow).toBeGreaterThanOrEqual(scoreHigh);
    });

    it('clamps score between 0 and 100', () => {
      const product = makeProduct('Empty Product', []);
      const result = computeProductEffectiveness(product, 'acne');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('returns correct level labels', () => {
      const product = makeProduct('Retinol Cream', ['Retinol', 'Hyaluronic Acid', 'Vitamin C', 'Ceramides']);
      const result = computeProductEffectiveness(product, 'skin_age');
      expect(['excellent', 'good', 'moderate', 'low']).toContain(result.level);
    });
  });

  describe('generateProductBlurb', () => {
    it('generates a non-empty blurb', () => {
      const product = makeProduct('Test Product', ['Niacinamide']);
      const effectiveness = computeProductEffectiveness(product, 'acne');
      const blurb = generateProductBlurb(product, effectiveness, 'acne');
      expect(blurb.length).toBeGreaterThan(20);
      expect(blurb).toContain('Test Product');
    });

    it('mentions goal context', () => {
      const product = makeProduct('SPF 50', ['Zinc Oxide']);
      const effectiveness = computeProductEffectiveness(product, 'sun_damage');
      const blurb = generateProductBlurb(product, effectiveness, 'sun_damage');
      expect(blurb.toLowerCase()).toContain('sun');
    });
  });

  describe('getUsageTips', () => {
    it('returns retinoid tip for retinoid products', () => {
      const product = makeProduct('Retinol', ['Retinol']);
      const effectiveness = computeProductEffectiveness(product, 'skin_age');
      const tips = getUsageTips(effectiveness.matchedIngredients);
      expect(tips.some((t) => t.toLowerCase().includes('night'))).toBe(true);
    });

    it('returns sunscreen tip for SPF products', () => {
      const product = makeProduct('SPF', ['Zinc Oxide']);
      const effectiveness = computeProductEffectiveness(product, 'sun_damage');
      const tips = getUsageTips(effectiveness.matchedIngredients);
      expect(tips.some((t) => t.toLowerCase().includes('reapply'))).toBe(true);
    });

    it('returns empty array for unknown ingredients', () => {
      const product = makeProduct('Unknown', ['xyzabc']);
      const effectiveness = computeProductEffectiveness(product, 'acne');
      const tips = getUsageTips(effectiveness.matchedIngredients);
      expect(tips).toEqual([]);
    });
  });

  describe('new ingredient profiles', () => {
    it('matches tranexamic acid', () => {
      const result = matchIngredient('Tranexamic Acid');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Tranexamic Acid');
      expect(result!.goalRelevance.sun_damage).toBeGreaterThan(0);
    });

    it('matches alpha-arbutin', () => {
      const result = matchIngredient('Alpha-Arbutin');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Alpha-Arbutin');
    });

    it('matches arbutin alias', () => {
      const result = matchIngredient('arbutin');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Alpha-Arbutin');
    });

    it('matches kojic acid', () => {
      const result = matchIngredient('Kojic Acid');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Kojic Acid');
    });

    it('matches snail mucin / snail secretion filtrate', () => {
      const result1 = matchIngredient('Snail Mucin');
      expect(result1).not.toBeNull();
      expect(result1!.canonicalName).toBe('Snail Mucin');

      const result2 = matchIngredient('Snail Secretion Filtrate');
      expect(result2).not.toBeNull();
      expect(result2!.canonicalName).toBe('Snail Mucin');
    });

    it('matches aloe vera variants', () => {
      const result = matchIngredient('Aloe Barbadensis Leaf Juice');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Aloe Vera');
    });

    it('matches caffeine', () => {
      const result = matchIngredient('Caffeine');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Caffeine');
    });

    it('matches shea butter', () => {
      const result = matchIngredient('Butyrospermum Parkii Butter');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Shea Butter');
    });

    it('matches urea', () => {
      const result = matchIngredient('Urea');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Urea');
    });

    it('matches mandelic acid', () => {
      const result = matchIngredient('Mandelic Acid');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Mandelic Acid');
      expect(result!.category).toBe('aha');
    });

    it('matches colloidal oatmeal', () => {
      const result = matchIngredient('Colloidal Oatmeal');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Colloidal Oatmeal');
    });

    it('matches camphor', () => {
      const result = matchIngredient('Camphor');
      expect(result).not.toBeNull();
      expect(result!.canonicalName).toBe('Camphor');
    });

    it('scores a Byoma product correctly with new ceramide + tranexamic matches', () => {
      const product = makeProduct('Byoma Brightening Serum', [
        'Niacinamide', 'Tranexamic Acid', 'Ceramide NP', 'Alpha-Arbutin', 'Ascorbyl Glucoside',
      ]);
      const result = computeProductEffectiveness(product, 'sun_damage');
      expect(result.score).toBeGreaterThanOrEqual(55);
      expect(result.matchedIngredients.length).toBeGreaterThanOrEqual(3);
    });
  });
});
