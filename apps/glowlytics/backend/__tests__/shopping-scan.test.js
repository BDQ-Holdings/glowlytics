/**
 * Unit tests for the PURE scan-while-shopping verdict module.
 * No DB, no network — every number is deterministic.
 */

const mod = require('../shopping-scan');
const {
  CATEGORY,
  categorizeIngredient,
  analyzeProduct,
  detectConflicts,
  detectRedundancy,
  goalFit,
  sensitivityFlags,
  computeVerdict,
} = mod;

const analyze = (name, ingredients) => analyzeProduct({ name, ingredients });

describe('CATEGORY map', () => {
  it('exposes the documented category constants', () => {
    expect(CATEGORY).toMatchObject({
      RETINOID: 'retinoid',
      AHA: 'aha',
      BHA: 'bha',
      VITAMIN_C: 'vitamin_c',
      NIACINAMIDE: 'niacinamide',
      BENZOYL_PEROXIDE: 'benzoyl_peroxide',
      AZELAIC: 'azelaic',
      SUNSCREEN: 'sunscreen_active',
      FRAGRANCE: 'fragrance',
      HUMECTANT: 'humectant',
      ANTIOXIDANT: 'antioxidant',
      PEPTIDE: 'peptide',
      SURFACTANT: 'surfactant',
      OTHER: 'other',
    });
  });
});

describe('categorizeIngredient', () => {
  const cases = [
    ['Retinol', 'retinoid'],
    ['Tretinoin', 'retinoid'],
    ['Retinaldehyde', 'retinoid'],
    ['Adapalene', 'retinoid'],
    ['Glycolic Acid', 'aha'],
    ['Lactic Acid', 'aha'],
    ['Mandelic Acid', 'aha'],
    ['Salicylic Acid', 'bha'],
    ['L-Ascorbic Acid', 'vitamin_c'],
    ['Vitamin C', 'vitamin_c'],
    ['Niacinamide', 'niacinamide'],
    ['Benzoyl Peroxide 10%', 'benzoyl_peroxide'],
    ['Azelaic Acid', 'azelaic'],
    ['Zinc Oxide', 'sunscreen_active'],
    ['Avobenzone', 'sunscreen_active'],
    ['Titanium Dioxide', 'sunscreen_active'],
    ['Fragrance', 'fragrance'],
    ['Parfum', 'fragrance'],
    ['Linalool', 'fragrance'],
    ['Glycerin', 'humectant'],
    ['Sodium Hyaluronate', 'humectant'],
    ['Panthenol', 'humectant'],
    ['Tocopherol', 'antioxidant'],
    ['Ferulic Acid', 'antioxidant'],
    ['Matrixyl', 'peptide'],
    ['Argireline', 'peptide'],
    ['Sodium Laureth Sulfate', 'surfactant'],
    ['Cocamidopropyl Betaine', 'surfactant'],
    ['Nicotinamide', 'niacinamide'],
    ['Betaine Salicylate', 'bha'],
    ['Salix Alba Bark Extract', 'bha'],
    ['Willow Bark Extract', 'bha'],
    ['Tetrahexyldecyl Ascorbate', 'vitamin_c'],
    ['Water', 'other'],
    ['Unobtanium', 'other'],
  ];

  it.each(cases)('categorizes %s -> %s', (raw, expected) => {
    expect(categorizeIngredient(raw)).toBe(expected);
  });

  it('normalizes case and whitespace', () => {
    expect(categorizeIngredient('  RETINOL  ')).toBe('retinoid');
  });

  it('returns other for empty / nullish input', () => {
    expect(categorizeIngredient('')).toBe('other');
    expect(categorizeIngredient(undefined)).toBe('other');
    expect(categorizeIngredient(null)).toBe('other');
  });

  it('treats the ascorbyl / ascorbic family as vitamin C', () => {
    expect(categorizeIngredient('Ascorbyl Glucoside')).toBe('vitamin_c');
    expect(categorizeIngredient('Ascorbic Acid')).toBe('vitamin_c');
  });
});

describe('analyzeProduct', () => {
  it('summarizes categories, actives, flags and inferred type', () => {
    const a = analyze('CeraVe Foaming Cleanser', ['Niacinamide', 'Glycerin', 'Fragrance', 'Zinc Oxide']);
    expect(a.categories).toEqual(expect.arrayContaining(['niacinamide', 'humectant', 'fragrance', 'sunscreen_active']));
    expect(a.actives).toEqual(expect.arrayContaining(['niacinamide', 'sunscreen_active']));
    expect(a.actives).not.toContain('humectant');
    expect(a.actives).not.toContain('fragrance');
    expect(a.hasFragrance).toBe(true);
    expect(a.hasSunscreen).toBe(true);
    expect(a.inferredType).toBe('cleanser');
  });

  it('handles empty ingredients without throwing', () => {
    const a = analyze('Mystery Product', []);
    expect(a.categories).toEqual([]);
    expect(a.actives).toEqual([]);
    expect(a.hasFragrance).toBe(false);
    expect(a.hasSunscreen).toBe(false);
    expect(a.inferredType).toBe('unknown');
  });

  it('handles unknown ingredients (all -> other)', () => {
    const a = analyze('X', ['Aqua', 'Unobtanium']);
    expect(a.actives).toEqual([]);
    expect(a.categories).toEqual(['other']);
  });

  it('infers type from actives when name is uninformative', () => {
    expect(analyze('Tretinoin PM', ['Tretinoin']).inferredType).toBe('treatment');
    expect(analyze('Vit C', ['Ascorbic Acid']).inferredType).toBe('serum');
    expect(analyze('Glycolic Toner', ['Glycolic Acid']).inferredType).toBe('toner');
    expect(analyze('Tretinoin Cream', ['Tretinoin']).inferredType).toBe('moisturizer');
  });
});

describe('detectConflicts', () => {
  it('flags second_retinoid (high)', () => {
    const conflicts = detectConflicts(analyze('X Serum', ['Retinol']), [analyze('Night Cream', ['Tretinoin'])]);
    const c = conflicts.find((x) => x.code === 'second_retinoid');
    expect(c).toBeTruthy();
    expect(c.severity).toBe('high');
    expect(c.withProduct).toBe('Night Cream');
  });

  it('flags exfoliant_stack (high) when acid meets a retinoid in the routine', () => {
    const conflicts = detectConflicts(analyze('AHA Toner', ['Glycolic Acid']), [analyze('Retinol PM', ['Retinol'])]);
    const c = conflicts.find((x) => x.code === 'exfoliant_stack');
    expect(c).toBeTruthy();
    expect(c.severity).toBe('high');
  });

  it('flags exfoliant_stack (high) when a retinoid meets an acid in the routine', () => {
    const conflicts = detectConflicts(analyze('Retinol PM', ['Retinol']), [analyze('AHA Toner', ['Glycolic Acid'])]);
    expect(conflicts.some((x) => x.code === 'exfoliant_stack' && x.severity === 'high')).toBe(true);
  });

  it('flags double_exfoliant (med)', () => {
    const conflicts = detectConflicts(analyze('BHA Serum', ['Salicylic Acid']), [analyze('AHA Pads', ['Lactic Acid'])]);
    const c = conflicts.find((x) => x.code === 'double_exfoliant');
    expect(c).toBeTruthy();
    expect(c.severity).toBe('med');
    expect(conflicts.some((x) => x.code === 'exfoliant_stack')).toBe(false);
  });

  it('flags bpo_retinoid (med) both directions', () => {
    const fwd = detectConflicts(analyze('BPO Wash', ['Benzoyl Peroxide 10%']), [analyze('Retinol Cream', ['Retinol'])]);
    expect(fwd.some((x) => x.code === 'bpo_retinoid' && x.severity === 'med')).toBe(true);
    const rev = detectConflicts(analyze('Retinol Cream', ['Retinol']), [analyze('BPO Wash', ['Benzoyl Peroxide 10%'])]);
    expect(rev.some((x) => x.code === 'bpo_retinoid' && x.severity === 'med')).toBe(true);
  });

  it('flags vitc_retinoid (low)', () => {
    const conflicts = detectConflicts(analyze('Vit C', ['Ascorbic Acid']), [analyze('Tret', ['Tretinoin'])]);
    const c = conflicts.find((x) => x.code === 'vitc_retinoid');
    expect(c).toBeTruthy();
    expect(c.severity).toBe('low');
  });

  it('returns no conflicts for an empty routine', () => {
    expect(detectConflicts(analyze('X Serum', ['Retinol']), [])).toEqual([]);
  });
  it('categorizes betaine salicylate as BHA and trips exfoliant_stack (high) over a retinoid routine', () => {
    const cand = analyze('Exfoliating Toner', ['Betaine Salicylate']);
    expect(cand.actives).toContain('bha');
    const conflicts = detectConflicts(cand, [analyze('Retinol PM', ['Retinol'])]);
    expect(conflicts.some((c) => c.code === 'exfoliant_stack' && c.severity === 'high')).toBe(true);
  });

});

describe('detectRedundancy', () => {
  it('detects a same-type product already owned', () => {
    const red = detectRedundancy(analyze('Gentle Cleanser', ['Cocamidopropyl Betaine']), [analyze('Foaming Face Wash', ['Cocamidopropyl Betaine'])]);
    expect(red).toEqual({ category: 'cleanser', withProduct: 'Foaming Face Wash' });
  });

  it('returns null when no type overlap', () => {
    expect(detectRedundancy(analyze('Gentle Cleanser', ['Cocamidopropyl Betaine']), [analyze('Retinol Serum', ['Retinol'])])).toBeNull();
  });

  it('returns null for unknown candidate type', () => {
    expect(detectRedundancy(analyze('X', []), [analyze('Y', [])])).toBeNull();
  });
});

describe('goalFit', () => {
  it('scores acne benefits', () => {
    const gf = goalFit(analyze('BHA', ['Salicylic Acid']), ['acne']);
    expect(gf.beneficial).toContain('bha');
    expect(gf.score).toBe(70);
    expect(gf.label).toBe('Good fit');
  });

  it('scores sun_damage benefits (multiple actives cap at 100)', () => {
    const gf = goalFit(analyze('SPF Serum', ['Zinc Oxide', 'Ascorbic Acid']), ['sun_damage']);
    expect(gf.beneficial).toEqual(expect.arrayContaining(['sunscreen_active', 'vitamin_c']));
    expect(gf.score).toBe(100);
    expect(gf.label).toBe('Excellent fit');
  });

  it('scores skin_age benefits', () => {
    const gf = goalFit(analyze('Retinol', ['Retinol']), ['skin_age']);
    expect(gf.beneficial).toContain('retinoid');
    expect(gf.score).toBe(70);
  });

  it('scores niacinamide for acne', () => {
    expect(goalFit(analyze('Niac', ['Niacinamide']), ['acne']).score).toBe(70);
  });

  it('returns 0 / No goal set when goals are empty', () => {
    const gf = goalFit(analyze('Retinol', ['Retinol']), []);
    expect(gf.score).toBe(0);
    expect(gf.beneficial).toEqual([]);
    expect(gf.label).toBe('No goal set');
  });

  it('returns 0 / Limited fit when goal set but product irrelevant', () => {
    const gf = goalFit(analyze('Plain', ['Glycerin']), ['acne']);
    expect(gf.score).toBe(0);
    expect(gf.label).toBe('Limited fit');
  });
});

describe('sensitivityFlags', () => {
  it('always flags fragrance when present', () => {
    const flags = sensitivityFlags(analyze('Cream', ['Glycerin', 'Parfum']), {});
    expect(flags.some((f) => f.code === 'fragrance')).toBe(true);
  });

  it('does not flag fragrance when absent', () => {
    const flags = sensitivityFlags(analyze('Cream', ['Glycerin']), {});
    expect(flags.some((f) => f.code === 'fragrance')).toBe(false);
  });

  it('notes a strong-irritant stack within one product', () => {
    const flags = sensitivityFlags(analyze('Combo', ['Retinol', 'Glycolic Acid']), {});
    expect(flags.some((f) => f.code === 'irritant_stack')).toBe(true);
  });
});

describe('computeVerdict', () => {
  it('returns buy for a strong goal match with no conflicts', () => {
    const r = computeVerdict({
      candidate: analyze('Vitamin C Serum', ['Ascorbic Acid', 'Ferulic Acid']),
      routine: [],
      goals: ['sun_damage'],
      profile: {},
    });
    expect(r.score).toBe(95);
    expect(r.verdict).toBe('buy');
    expect(r.goalFit.score).toBe(100);
    expect(Array.isArray(r.reasons)).toBe(true);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('returns maybe at the neutral baseline (no goal benefit, no conflicts)', () => {
    const r = computeVerdict({
      candidate: analyze('Plain Moisturizer', ['Glycerin']),
      routine: [],
      goals: ['acne'],
      profile: {},
    });
    expect(r.score).toBe(55);
    expect(r.verdict).toBe('maybe');
  });

  it('returns skip when a high conflict drives the score below 42', () => {
    const r = computeVerdict({
      candidate: analyze('Glycolic Toner', ['Glycolic Acid']),
      routine: [analyze('Tretinoin Cream', ['Tretinoin'])],
      goals: [],
      profile: {},
    });
    expect(r.conflicts.some((c) => c.code === 'exfoliant_stack')).toBe(true);
    expect(r.score).toBe(30);
    expect(r.verdict).toBe('skip');
  });

  it('caps a would-be buy at maybe when ANY high conflict is present', () => {
    const r = computeVerdict({
      candidate: analyze('Retinol Peptide Serum', ['Retinol', 'Matrixyl']),
      routine: [analyze('Tretinoin PM', ['Tretinoin'])],
      goals: ['skin_age'],
      profile: {},
    });
    expect(r.goalFit.score).toBe(100);
    expect(r.conflicts.some((c) => c.code === 'second_retinoid' && c.severity === 'high')).toBe(true);
    // 55 + 100*0.4 - 25 = 70 -> would be 'buy', but high conflict caps it.
    expect(r.score).toBe(70);
    expect(r.score).toBeGreaterThanOrEqual(68);
    expect(r.verdict).toBe('maybe');
  });

  it('applies the fragrance penalty (-6)', () => {
    const r = computeVerdict({
      candidate: analyze('Niacinamide Serum', ['Niacinamide', 'Fragrance']),
      routine: [],
      goals: ['acne'],
      profile: {},
    });
    expect(r.flags.some((f) => f.code === 'fragrance')).toBe(true);
    // 55 + 70*0.4 - 6 = 77
    expect(r.score).toBe(77);
    expect(r.verdict).toBe('buy');
  });

  it('clamps and stays valid with empty candidate / no goals / empty routine', () => {
    const r = computeVerdict({
      candidate: analyze('Mystery', []),
      routine: [],
      goals: [],
      profile: {},
    });
    expect(r.score).toBe(55);
    expect(r.verdict).toBe('maybe');
    expect(r.conflicts).toEqual([]);
    expect(r.redundancy).toBeNull();
    expect(typeof r.headline).toBe('string');
    expect(['buy', 'maybe', 'skip']).toContain(r.verdict);
  });

  it('includes a conflict reason in the reasons array', () => {
    const r = computeVerdict({
      candidate: analyze('Retinol', ['Retinol']),
      routine: [analyze('Night Cream', ['Tretinoin'])],
      goals: ['skin_age'],
      profile: {},
    });
    expect(r.reasons.some((reason) => reason.kind === 'conflict')).toBe(true);
  });
  it('penalizes a self-flagged irritant stack enough to lose a would-be buy', () => {
    // Control: one strong active + fragrance still scores a buy (55 + 70*0.4 - 6 = 77).
    const control = computeVerdict({
      candidate: analyze('Retinol Serum', ['Retinol', 'Fragrance']),
      routine: [],
      goals: ['acne'],
      profile: {},
    });
    expect(control.flags.some((f) => f.code === 'irritant_stack')).toBe(false);
    expect(control.verdict).toBe('buy');

    // A second strong active trips irritant_stack (med, -12): 77 - 12 = 65 -> maybe.
    const r = computeVerdict({
      candidate: analyze('Retinol + AHA Serum', ['Retinol', 'Glycolic Acid', 'Fragrance']),
      routine: [],
      goals: ['acne'],
      profile: {},
    });
    expect(r.flags.some((f) => f.code === 'irritant_stack' && f.severity === 'med')).toBe(true);
    expect(r.score).toBe(65);
    expect(r.verdict).not.toBe('buy');
  });

  it('caps a would-be buy at maybe when a high-severity flag is present (retinoid + pregnancy)', () => {
    const r = computeVerdict({
      candidate: analyze('Retinol Peptide Serum', ['Retinol', 'Matrixyl']),
      routine: [],
      goals: ['skin_age'],
      profile: { menstrual_status: 'pregnant' },
    });
    expect(r.flags.some((f) => f.code === 'retinoid_pregnancy' && f.severity === 'high')).toBe(true);
    expect(r.goalFit.score).toBe(100);
    // 55 + 100*0.4 - 25 (high flag) = 70 -> buy by score, but the high-flag cap forces maybe.
    expect(r.score).toBe(70);
    expect(r.score).toBeGreaterThanOrEqual(68);
    expect(r.verdict).toBe('maybe');
  });

});
