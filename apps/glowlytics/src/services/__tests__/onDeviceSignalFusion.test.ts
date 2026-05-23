import {
  applyLesionFeedback,
  bboxToZone,
  extractSummaryFeatures,
  featuresToSignalScores,
  mergeSignalScores,
  DEFAULT_SIGNAL_CONFIDENCE,
  type Layer2Results,
} from '../onDeviceSignalFusion';
import type { DetectedLesion, SignalScores } from '../../types';
import type { DeterministicFeatures } from '../onDeviceImageFeatures';

const baseFeatures = (overrides: Partial<DeterministicFeatures> = {}): DeterministicFeatures => ({
  inflammation: { a_star_mean: 5, a_star_std: 1, r_ratio_mean: 0.35 },
  sunDamage:    { ita_mean: 30, ita_std: 8, ita_cv: 0.1, spot_count: 0 },
  hydration:    { specular_ratio: 0.05, specular_uniformity: 0.5, lbp_entropy: 5, lbp_uniformity: 0.05 },
  structure:    { glcm_contrast: 2, glcm_dissimilarity: 1, glcm_homogeneity: 0.7, glcm_energy: 0.1, pore_proxy: 2 },
  elasticity:   { wrinkle_index: 5, forehead_glcm: { contrast: 2, dissimilarity: 1, homogeneity: 0.5, energy: 0.1 } },
  gabor_features: new Float32Array(24),
  lbp_uniform_histogram: new Float32Array(18),
  frangi_features: new Float32Array(9),
  landmark_geometry: new Float32Array(5),
  hydration_handcrafted: new Float32Array(44),
  elasticity_handcrafted: new Float32Array(14),
  ...overrides,
});

describe('featuresToSignalScores', () => {
  it('clamps every signal into 0-100', () => {
    const scores = featuresToSignalScores(baseFeatures());
    for (const k of Object.keys(scores) as Array<keyof SignalScores>) {
      expect(scores[k]).toBeGreaterThanOrEqual(0);
      expect(scores[k]).toBeLessThanOrEqual(100);
    }
  });

  it('a high a* mean (erythema) drives inflammation score down', () => {
    const low = featuresToSignalScores(baseFeatures({ inflammation: { a_star_mean: 0, a_star_std: 1, r_ratio_mean: 0.3 } }));
    const high = featuresToSignalScores(baseFeatures({ inflammation: { a_star_mean: 20, a_star_std: 1, r_ratio_mean: 0.3 } }));
    expect(high.inflammation).toBeLessThan(low.inflammation);
  });

  it('a high ITA CV (pigmentation variance) drives sunDamage score down', () => {
    const low = featuresToSignalScores(baseFeatures({ sunDamage: { ita_mean: 30, ita_std: 1, ita_cv: 0.0, spot_count: 0 } }));
    const high = featuresToSignalScores(baseFeatures({ sunDamage: { ita_mean: 30, ita_std: 1, ita_cv: 0.4, spot_count: 10 } }));
    expect(high.sunDamage).toBeLessThan(low.sunDamage);
  });

  it('a high wrinkle index drives elasticity score down', () => {
    const low = featuresToSignalScores(baseFeatures({
      elasticity: { wrinkle_index: 0, forehead_glcm: { contrast: 0, dissimilarity: 0, homogeneity: 1, energy: 0 } },
    }));
    const high = featuresToSignalScores(baseFeatures({
      elasticity: { wrinkle_index: 20, forehead_glcm: { contrast: 5, dissimilarity: 1, homogeneity: 0.4, energy: 0.05 } },
    }));
    expect(high.elasticity).toBeLessThan(low.elasticity);
  });
});

describe('extractSummaryFeatures', () => {
  it('rounds to a stable precision', () => {
    const summary = extractSummaryFeatures(baseFeatures());
    expect(summary.inflammation_a_star).toBe(5);
    expect(summary.spot_count).toBe(0);
    expect(typeof summary.specular_ratio).toBe('number');
  });
});

describe('bboxToZone', () => {
  it('maps top of face to forehead', () => {
    expect(bboxToZone(0.5, 0.1)).toBe('forehead');
  });
  it('maps lateral midface to a cheek', () => {
    expect(bboxToZone(0.2, 0.4)).toBe('left_cheek');
    expect(bboxToZone(0.8, 0.4)).toBe('right_cheek');
  });
  it('maps the centre of the face to the nose', () => {
    expect(bboxToZone(0.5, 0.4)).toBe('nose');
  });
  it('maps the chin and jaw bands correctly', () => {
    expect(bboxToZone(0.5, 0.7)).toBe('chin');
    expect(bboxToZone(0.5, 0.9)).toBe('jaw');
  });
});

describe('mergeSignalScores', () => {
  const l1: SignalScores = { structure: 60, hydration: 50, inflammation: 70, sunDamage: 80, elasticity: 55 };
  const baseL2: Layer2Results = {
    signalOverrides: {},
    lesions: [],
    signalConfidence: DEFAULT_SIGNAL_CONFIDENCE,
  };

  it('passes L1 through unchanged when no L2 and no L3 are available', () => {
    const merged = mergeSignalScores(l1, baseL2, null);
    expect(merged.structure).toBe(60);
    expect(merged.hydration).toBe(50);
    expect(merged.inflammation).toBe(70);
    expect(merged.sunDamage).toBe(80);
    expect(merged.elasticity).toBe(55);
  });

  it('shifts toward L2 when an override is present (L2 has the highest β)', () => {
    const l2: Layer2Results = {
      signalOverrides: { structure: 90 },
      lesions: [],
      signalConfidence: DEFAULT_SIGNAL_CONFIDENCE,
    };
    const merged = mergeSignalScores(l1, l2, null);
    // β_L1=0.5, β_L2=0.9. With L3 absent → (0.5*60 + 0.9*90)/1.4 = 79.3
    expect(merged.structure).toBeGreaterThan(60);
    expect(merged.structure).toBeLessThan(91);
  });

  it('treats inflammation as L1-only even with an L2 override (no L2 model exists for it)', () => {
    const l2: Layer2Results = {
      signalOverrides: { structure: 90 },
      lesions: [],
      signalConfidence: DEFAULT_SIGNAL_CONFIDENCE,
    };
    const merged = mergeSignalScores(l1, l2, null);
    // β_L2 for inflammation is 0 → merged inflammation should remain at L1
    expect(merged.inflammation).toBe(70);
  });

  it('blends in L3 when provided', () => {
    const l3: SignalScores = { structure: 100, hydration: 100, inflammation: 100, sunDamage: 100, elasticity: 100 };
    const merged = mergeSignalScores(l1, baseL2, l3);
    // L3 weights at 0.6 alongside L1 0.5 → ~ (0.5*60 + 0.6*100)/1.1 ≈ 81.8
    expect(merged.structure).toBeGreaterThan(l1.structure);
    expect(merged.structure).toBeLessThan(100);
  });
});

describe('applyLesionFeedback', () => {
  const baseScores: SignalScores = { structure: 70, hydration: 70, inflammation: 70, sunDamage: 70, elasticity: 70 };

  it('returns a copy with no mutation when there are no lesions', () => {
    const result = applyLesionFeedback(baseScores, []);
    expect(result).toEqual(baseScores);
    expect(result).not.toBe(baseScores);
  });

  it('penalises inflammation and structure when confirmed lesions present', () => {
    const lesions: DetectedLesion[] = [
      { class: 'acne', confidence: 0.9, bbox: [0, 0, 0, 0], zone: 'chin', tier: 'confirmed' },
      { class: 'acne', confidence: 0.8, bbox: [0, 0, 0, 0], zone: 'forehead', tier: 'confirmed' },
    ];
    const result = applyLesionFeedback(baseScores, lesions);
    expect(result.inflammation).toBeLessThan(70);
    expect(result.structure).toBeLessThan(70);
    expect(result.hydration).toBe(70); // unchanged
    expect(result.sunDamage).toBe(70);
    expect(result.elasticity).toBe(70);
  });

  it('ignores possible-tier lesions', () => {
    const lesions: DetectedLesion[] = [
      { class: 'acne', confidence: 0.5, bbox: [0, 0, 0, 0], zone: 'chin', tier: 'possible' },
    ];
    const result = applyLesionFeedback(baseScores, lesions);
    expect(result).toEqual(baseScores);
  });

  it('caps the inflammation/structure penalty at 25', () => {
    const lesions: DetectedLesion[] = Array.from({ length: 20 }, () => ({
      class: 'acne',
      confidence: 1.0,
      bbox: [0, 0, 0, 0] as [number, number, number, number],
      zone: 'chin' as const,
      tier: 'confirmed' as const,
    }));
    const result = applyLesionFeedback(baseScores, lesions);
    expect(70 - result.inflammation).toBeLessThanOrEqual(25);
    expect(70 - result.structure).toBeLessThanOrEqual(25);
  });
});
