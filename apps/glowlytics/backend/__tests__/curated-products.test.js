const {
  searchCuratedProducts,
  lookupCuratedBarcode,
  enrichIngredients,
  CURATED_PRODUCTS,
} = require('../curated-products');

describe('curated-products', () => {
  describe('CURATED_PRODUCTS', () => {
    it('contains 80+ products', () => {
      expect(CURATED_PRODUCTS.length).toBeGreaterThanOrEqual(80);
    });

    it('every product has name, brand, and ingredients', () => {
      for (const p of CURATED_PRODUCTS) {
        expect(p.name).toBeTruthy();
        expect(p.brand).toBeTruthy();
        expect(Array.isArray(p.ingredients)).toBe(true);
        expect(p.ingredients.length).toBeGreaterThan(0);
      }
    });
  });

  describe('searchCuratedProducts', () => {
    it('finds PanOxyl products', () => {
      const results = searchCuratedProducts('panoxyl');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].brand).toBe('PanOxyl');
    });

    it('finds Byoma products', () => {
      const results = searchCuratedProducts('byoma');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].brand).toBe('Byoma');
    });

    it('finds Carmex products', () => {
      const results = searchCuratedProducts('carmex');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].brand).toBe('Carmex');
    });

    it('finds CeraVe Foaming Cleanser by partial name', () => {
      const results = searchCuratedProducts('cerave foaming');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain('CeraVe');
    });

    it('is case-insensitive', () => {
      const lower = searchCuratedProducts('the ordinary');
      const upper = searchCuratedProducts('THE ORDINARY');
      expect(lower.length).toBe(upper.length);
    });

    it('returns empty for queries shorter than 2 chars', () => {
      expect(searchCuratedProducts('a')).toEqual([]);
      expect(searchCuratedProducts('')).toEqual([]);
    });

    it('returns empty for non-matching queries', () => {
      expect(searchCuratedProducts('zzzznonexistent')).toEqual([]);
    });

    it('ranks exact brand matches higher', () => {
      const results = searchCuratedProducts('CeraVe');
      expect(results.length).toBeGreaterThan(0);
      // All results should be CeraVe brand
      for (const r of results) {
        expect(r.brand).toBe('CeraVe');
      }
    });
  });

  describe('lookupCuratedBarcode', () => {
    it('finds product by known barcode', () => {
      const result = lookupCuratedBarcode('301871371054');
      expect(result).not.toBeNull();
      expect(result.name).toContain('CeraVe');
    });

    it('returns null for unknown barcode', () => {
      expect(lookupCuratedBarcode('0000000000000')).toBeNull();
    });

    it('returns null for empty/null barcode', () => {
      expect(lookupCuratedBarcode('')).toBeNull();
      expect(lookupCuratedBarcode(null)).toBeNull();
    });
  });

  describe('enrichIngredients', () => {
    it('enriches empty ingredients from curated DB', () => {
      const enriched = enrichIngredients('CeraVe Foaming Facial Cleanser', []);
      expect(enriched.length).toBeGreaterThan(0);
      expect(enriched).toContain('Niacinamide');
    });

    it('enriches short ingredient lists', () => {
      const enriched = enrichIngredients('CeraVe Moisturizing Cream', ['Water']);
      expect(enriched.length).toBeGreaterThan(1);
    });

    it('keeps existing list if already has 3+ ingredients', () => {
      const existing = ['Water', 'Glycerin', 'Niacinamide', 'Ceramides'];
      const enriched = enrichIngredients('CeraVe Something', existing);
      expect(enriched).toEqual(existing);
    });

    it('returns empty array for unknown product with no ingredients', () => {
      const enriched = enrichIngredients('Unknown Brand XYZ Product', []);
      expect(enriched).toEqual([]);
    });

    it('handles null/undefined productName', () => {
      expect(enrichIngredients(null, [])).toEqual([]);
      expect(enrichIngredients(undefined, [])).toEqual([]);
    });
  });
});
