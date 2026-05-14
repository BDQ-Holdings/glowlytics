/**
 * Interventions — finding → three-tier suggestion lookup
 */

process.env.NODE_ENV = 'development';

const {
  recommendInterventions,
  SUGGESTIONS,
  FINDING_TO_SUGGESTIONS,
  PROCEDURAL_DISCLAIMER,
} = require('../interventions');

const {
  FINDING_RULES,
} = require('../bone-structure-3d');

describe('SUGGESTIONS catalogue', () => {
  test('every suggestion declares a valid tier', () => {
    const tiers = new Set(['lifestyle', 'pharmacological', 'interventional']);
    for (const [id, s] of Object.entries(SUGGESTIONS)) {
      expect(tiers.has(s.tier)).toBe(true);
      expect(typeof s.title).toBe('string');
      expect(s.title.length).toBeGreaterThan(0);
      expect(typeof s.body).toBe('string');
      expect(s.body.length).toBeGreaterThan(20);
    }
  });

  test('every suggestion id referenced in FINDING_TO_SUGGESTIONS exists in catalogue', () => {
    for (const [code, tiers] of Object.entries(FINDING_TO_SUGGESTIONS)) {
      for (const [tier, ids] of Object.entries(tiers)) {
        for (const id of ids) {
          expect(SUGGESTIONS[id]).toBeDefined();
          // Tier in mapping must match the suggestion's declared tier
          expect(SUGGESTIONS[id].tier).toBe(tier);
        }
      }
    }
  });
});

describe('FINDING_TO_SUGGESTIONS coverage', () => {
  test('every finding code emitted by FINDING_RULES has a mapping', () => {
    const codes = new Set(FINDING_RULES.map((r) => r.code));
    for (const code of codes) {
      expect(FINDING_TO_SUGGESTIONS[code]).toBeDefined();
    }
  });

  test('no orphan mappings (each mapped code is actually emitted)', () => {
    const emitted = new Set(FINDING_RULES.map((r) => r.code));
    for (const code of Object.keys(FINDING_TO_SUGGESTIONS)) {
      expect(emitted.has(code)).toBe(true);
    }
  });

  test('procedural-relevant findings have at least one interventional option', () => {
    const proceduralFindings = [
      'canthal_tilt_negative',
      'scleral_show_inferior',
      'gonial_angle_obtuse',
      'chin_recessed',
      'midface_flat',
      'brow_low',
    ];
    for (const code of proceduralFindings) {
      expect(FINDING_TO_SUGGESTIONS[code].interventional.length).toBeGreaterThan(0);
    }
  });
});

describe('recommendInterventions', () => {
  test('empty findings → empty tiers + disclaimer', () => {
    const out = recommendInterventions([]);
    expect(out.lifestyle).toEqual([]);
    expect(out.pharmacological).toEqual([]);
    expect(out.interventional).toEqual([]);
    expect(out.procedural_disclaimer).toBe(PROCEDURAL_DISCLAIMER);
  });

  test('single finding produces deduplicated suggestions across tiers', () => {
    const out = recommendInterventions([{ findingCode: 'gonial_angle_obtuse', severity: 'moderate' }]);
    expect(out.lifestyle.length).toBeGreaterThan(0);
    expect(out.interventional.length).toBeGreaterThan(0);
    // Each suggestion has id, tier, title, body
    for (const s of [...out.lifestyle, ...out.pharmacological, ...out.interventional]) {
      expect(s.id).toBeDefined();
      expect(s.tier).toBeDefined();
      expect(s.title).toBeDefined();
      expect(s.body).toBeDefined();
    }
  });

  test('overlapping findings union without duplicating suggestions', () => {
    const out = recommendInterventions([
      { findingCode: 'canthal_tilt_negative', severity: 'marked' },
      { findingCode: 'scleral_show_inferior', severity: 'moderate' },
    ]);
    // Both findings recommend `elevated_sleep` (lifestyle) — should appear exactly once
    const elevated = out.lifestyle.filter((s) => s.id === 'elevated_sleep');
    expect(elevated).toHaveLength(1);
  });

  test('per-tier cap is enforced', () => {
    const allFindings = Object.keys(FINDING_TO_SUGGESTIONS).map((code) => ({ findingCode: code, severity: 'marked' }));
    const out = recommendInterventions(allFindings, { perTierCap: 3 });
    expect(out.lifestyle.length).toBeLessThanOrEqual(3);
    expect(out.pharmacological.length).toBeLessThanOrEqual(3);
    expect(out.interventional.length).toBeLessThanOrEqual(3);
  });

  test('unknown finding code is ignored without throwing', () => {
    const out = recommendInterventions([
      { findingCode: 'does_not_exist', severity: 'mild' },
      { findingCode: 'gonial_angle_obtuse', severity: 'moderate' },
    ]);
    expect(out.interventional.length).toBeGreaterThan(0);
  });

  test('procedural disclaimer is always returned', () => {
    const out = recommendInterventions([{ findingCode: 'chin_recessed' }]);
    expect(out.procedural_disclaimer).toContain('board-certified');
  });
});
