import {
  recommendInterventions,
  SUGGESTIONS,
  FINDING_TO_SUGGESTIONS,
  PROCEDURAL_DISCLAIMER,
} from '../boneInterventions';
import type { BoneFinding } from '../../types';

const mockFinding = (overrides: Partial<BoneFinding>): BoneFinding => ({
  findingCode: 'canthal_tilt_negative',
  metric: 'canthal_tilt',
  value: -5,
  score: 40,
  severity: 'moderate',
  ...overrides,
});

describe('recommendInterventions', () => {
  it('returns empty arrays + disclaimer when no findings supplied', () => {
    const bundle = recommendInterventions([]);
    expect(bundle.lifestyle).toEqual([]);
    expect(bundle.pharmacological).toEqual([]);
    expect(bundle.interventional).toEqual([]);
    expect(bundle.procedural_disclaimer).toBe(PROCEDURAL_DISCLAIMER);
  });

  it('returns the disclaimer even when no findings map to any suggestions', () => {
    const bundle = recommendInterventions([mockFinding({ findingCode: 'ipd_atypical' })]);
    expect(bundle.lifestyle).toEqual([]);
    expect(bundle.procedural_disclaimer).toMatch(/board-certified/i);
  });

  it('populates the lifestyle/pharma/interventional tiers from a single finding', () => {
    const bundle = recommendInterventions([mockFinding({ findingCode: 'canthal_tilt_negative' })]);
    expect(bundle.lifestyle.length).toBeGreaterThan(0);
    expect(bundle.pharmacological.length).toBeGreaterThan(0);
    expect(bundle.interventional.length).toBeGreaterThan(0);
    // Every emitted suggestion id resolves in the catalogue.
    for (const s of [...bundle.lifestyle, ...bundle.pharmacological, ...bundle.interventional]) {
      expect(SUGGESTIONS[s.id]).toBeDefined();
      expect(s.title).toBeDefined();
      expect(s.body).toBeDefined();
    }
  });

  it('deduplicates suggestions when two findings share them', () => {
    // canthal_tilt_negative + canthal_tilt_excess both map to lymphatic_massage
    // and lateral_canthopexy; the bundle should only list each once.
    const findings = [
      mockFinding({ findingCode: 'canthal_tilt_negative' }),
      mockFinding({ findingCode: 'canthal_tilt_excess' }),
    ];
    const bundle = recommendInterventions(findings);
    const lifestyleIds = bundle.lifestyle.map((s) => s.id);
    const interventionalIds = bundle.interventional.map((s) => s.id);
    expect(new Set(lifestyleIds).size).toBe(lifestyleIds.length);
    expect(new Set(interventionalIds).size).toBe(interventionalIds.length);
  });

  it('caps each tier at perTierCap entries', () => {
    // Stress test: pile up many distinct findings to exceed the default cap.
    const codes = [
      'canthal_tilt_negative', 'scleral_show_inferior', 'gonial_angle_obtuse',
      'midface_flat', 'chin_recessed', 'brow_low', 'asymmetry_elevated',
    ] as const;
    const findings = codes.map((c) => mockFinding({ findingCode: c }));
    const bundle = recommendInterventions(findings, { perTierCap: 3 });
    expect(bundle.lifestyle.length).toBeLessThanOrEqual(3);
    expect(bundle.pharmacological.length).toBeLessThanOrEqual(3);
    expect(bundle.interventional.length).toBeLessThanOrEqual(3);
  });

  it('every catalogued suggestion id referenced by FINDING_TO_SUGGESTIONS resolves', () => {
    for (const tierMap of Object.values(FINDING_TO_SUGGESTIONS)) {
      if (!tierMap) continue;
      for (const tier of ['lifestyle', 'pharmacological', 'interventional'] as const) {
        for (const id of tierMap[tier]) {
          expect(SUGGESTIONS[id]).toBeDefined();
          // Tier classification stays consistent with where it was referenced.
          expect(SUGGESTIONS[id].tier).toBe(tier);
        }
      }
    }
  });
});
