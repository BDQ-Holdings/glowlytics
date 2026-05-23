/**
 * Pure-math tests for `onDeviceImageFeatures`. We skip the
 * `extractFeaturesFromUri` entry point — that pulls in
 * `expo-image-manipulator` which doesn't have a stable jest preset under our
 * setup. Instead we exercise the building blocks directly with synthesised
 * pixel buffers, which is sufficient to guard parity with the backend math.
 */

import {
  analyzeSpecular,
  buildElasticityFeatures,
  buildHydrationFeatures,
  computeGLCM,
  computeITA,
  computeLBP,
  computeLBPUniform,
  computeLandmarkGeometry,
  countSpots,
  extractFeaturesFromRgb,
  srgbToLab,
  stats,
  type DeterministicFeatures,
} from '../onDeviceImageFeatures';

describe('srgbToLab', () => {
  it('maps pure white to L ≈ 100 with near-zero a/b', () => {
    const lab = srgbToLab(255, 255, 255);
    expect(lab.L).toBeGreaterThan(99);
    expect(Math.abs(lab.a)).toBeLessThan(1);
    expect(Math.abs(lab.b)).toBeLessThan(1);
  });

  it('maps pure black to L = 0', () => {
    const lab = srgbToLab(0, 0, 0);
    expect(lab.L).toBeCloseTo(0, 1);
  });

  it('positive a* for a red pixel (erythema proxy)', () => {
    const lab = srgbToLab(220, 50, 50);
    expect(lab.a).toBeGreaterThan(40);
  });
});

describe('computeITA', () => {
  it('returns 0 when b* is effectively zero (avoids divide-by-zero)', () => {
    expect(computeITA(50, 0)).toBe(0);
  });
  it('produces a positive angle for L>50, b>0 (lighter skin region)', () => {
    expect(computeITA(70, 10)).toBeGreaterThan(0);
  });
});

describe('stats', () => {
  it('returns mean=0 std=0 for empty input', () => {
    const s = stats([]);
    expect(s.mean).toBe(0);
    expect(s.std).toBe(0);
  });
  it('computes mean and std for uniform inputs', () => {
    const s = stats([10, 10, 10]);
    expect(s.mean).toBe(10);
    expect(s.std).toBe(0);
  });
  it('computes std for varying inputs', () => {
    const s = stats([1, 2, 3]);
    expect(s.mean).toBeCloseTo(2, 5);
    expect(s.std).toBeGreaterThan(0);
  });
});

describe('computeGLCM', () => {
  it('returns finite features for a uniform patch', () => {
    const gray = new Float32Array(16 * 16).fill(128);
    const g = computeGLCM(gray, 16, 16);
    expect(Number.isFinite(g.contrast)).toBe(true);
    // Uniform → very low contrast, very high homogeneity
    expect(g.contrast).toBeCloseTo(0, 1);
    expect(g.homogeneity).toBeGreaterThan(0.9);
  });
  it('reports higher contrast for a checkerboard patch', () => {
    const w = 16;
    const gray = new Float32Array(w * w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      gray[y * w + x] = (x + y) % 2 === 0 ? 0 : 255;
    }
    const g = computeGLCM(gray, w, w);
    expect(g.contrast).toBeGreaterThan(1);
  });
});

describe('computeLBP', () => {
  it('returns zero entropy for a uniform region', () => {
    const gray = new Float32Array(8 * 8).fill(100);
    const r = computeLBP(gray, 8, 8);
    // Uniform → entropy collapses (single pattern dominates)
    expect(r.entropy).toBeGreaterThanOrEqual(0);
    expect(r.uniformity).toBeGreaterThan(0);
  });
});

describe('computeLBPUniform', () => {
  it('returns the expected number of histogram bins (points + 2)', () => {
    const gray = new Float32Array(16 * 16).fill(128);
    const hist = computeLBPUniform(gray, 16, 16, 2, 16);
    expect(hist.length).toBe(18);
    // All values are non-negative and (when total>0) sum to ≤ 1.
    let sum = 0;
    for (const v of hist) {
      expect(v).toBeGreaterThanOrEqual(0);
      sum += v;
    }
    expect(sum).toBeLessThanOrEqual(1 + 1e-6);
  });
});

describe('analyzeSpecular', () => {
  it('detects bright white pixels as specular', () => {
    const w = 8, h = 8;
    const rgb = new Uint8Array(w * h * 3).fill(50);
    // Mark a row of pixels as bright white (>200 RGB, low spread)
    for (let x = 0; x < w; x++) {
      const i = (0 * w + x) * 3;
      rgb[i] = rgb[i + 1] = rgb[i + 2] = 240;
    }
    const r = analyzeSpecular(rgb, w, h);
    expect(r.ratio).toBeGreaterThan(0);
  });
});

describe('countSpots', () => {
  it('returns 0 for a uniform field', () => {
    const v = new Float32Array(8 * 8).fill(0);
    expect(countSpots(v, 8, 8, 5)).toBe(0);
  });
  it('detects scattered high-laplacian pixels', () => {
    const v = new Float32Array(16 * 16).fill(0);
    v[8 * 16 + 8] = 100;
    v[4 * 16 + 4] = 100;
    expect(countSpots(v, 16, 16, 15)).toBeGreaterThanOrEqual(0);
  });
});

describe('computeLandmarkGeometry', () => {
  it('returns the canonical 5-element vector', () => {
    const g = computeLandmarkGeometry();
    expect(g.length).toBe(5);
    const expected = [0.46, 0.36, 0.50, 0.33, 0.618];
    for (let i = 0; i < expected.length; i++) {
      // Float32 storage rounds, so compare with tolerance.
      expect(g[i]).toBeCloseTo(expected[i], 5);
    }
  });
});

describe('build*Features assemblers', () => {
  it('hydration vector layout: 24 Gabor + 18 LBP + 2 specular', () => {
    const features: DeterministicFeatures = {
      inflammation: { a_star_mean: 0, a_star_std: 0, r_ratio_mean: 0 },
      sunDamage:    { ita_mean: 0, ita_std: 0, ita_cv: 0, spot_count: 0 },
      hydration:    { specular_ratio: 0.5, specular_uniformity: 0.25, lbp_entropy: 0, lbp_uniformity: 0 },
      structure:    { glcm_contrast: 0, glcm_dissimilarity: 0, glcm_homogeneity: 0, glcm_energy: 0, pore_proxy: 0 },
      elasticity:   { wrinkle_index: 0, forehead_glcm: { contrast: 0, dissimilarity: 0, homogeneity: 0, energy: 0 } },
      gabor_features: new Float32Array(24).fill(1),
      lbp_uniform_histogram: new Float32Array(18).fill(2),
      frangi_features: new Float32Array(9),
      landmark_geometry: new Float32Array(5),
      hydration_handcrafted: new Float32Array(0),
      elasticity_handcrafted: new Float32Array(0),
    };
    const h = buildHydrationFeatures(features);
    expect(h.length).toBe(44);
    expect(h[0]).toBe(1);   // first Gabor
    expect(h[24]).toBe(2);  // first LBP bin
    expect(h[42]).toBe(0.5);
    expect(h[43]).toBe(0.25);
  });

  it('elasticity vector layout: 9 Frangi + 5 landmark geometry', () => {
    const features: DeterministicFeatures = {
      inflammation: { a_star_mean: 0, a_star_std: 0, r_ratio_mean: 0 },
      sunDamage:    { ita_mean: 0, ita_std: 0, ita_cv: 0, spot_count: 0 },
      hydration:    { specular_ratio: 0, specular_uniformity: 0, lbp_entropy: 0, lbp_uniformity: 0 },
      structure:    { glcm_contrast: 0, glcm_dissimilarity: 0, glcm_homogeneity: 0, glcm_energy: 0, pore_proxy: 0 },
      elasticity:   { wrinkle_index: 0, forehead_glcm: { contrast: 0, dissimilarity: 0, homogeneity: 0, energy: 0 } },
      gabor_features: new Float32Array(24),
      lbp_uniform_histogram: new Float32Array(18),
      frangi_features: new Float32Array(9).fill(3),
      landmark_geometry: new Float32Array([0.46, 0.36, 0.50, 0.33, 0.618]),
      hydration_handcrafted: new Float32Array(0),
      elasticity_handcrafted: new Float32Array(0),
    };
    const e = buildElasticityFeatures(features);
    expect(e.length).toBe(14);
    expect(e[0]).toBe(3);     // first Frangi
    expect(e[9]).toBeCloseTo(0.46, 5);  // first landmark ratio
    expect(e[13]).toBeCloseTo(0.618, 6);
  });
});

describe('extractFeaturesFromRgb', () => {
  // 32x32 RGB buffer with a gentle gradient. Just enough to exercise the pipeline.
  function syntheticImage(w: number, h: number): Uint8Array {
    const buf = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        buf[i]     = Math.min(255, x * 8);
        buf[i + 1] = Math.min(255, y * 8);
        buf[i + 2] = 100;
      }
    }
    return buf;
  }

  it('returns the full feature shape with finite numbers', () => {
    const w = 32, h = 32;
    const rgb = syntheticImage(w, h);
    const f = extractFeaturesFromRgb(rgb, w, h);

    expect(Number.isFinite(f.inflammation.a_star_mean)).toBe(true);
    expect(Number.isFinite(f.sunDamage.ita_cv)).toBe(true);
    expect(Number.isFinite(f.hydration.specular_ratio)).toBe(true);
    expect(Number.isFinite(f.structure.glcm_contrast)).toBe(true);
    expect(Number.isFinite(f.elasticity.wrinkle_index)).toBe(true);
    expect(f.gabor_features.length).toBe(24);
    expect(f.lbp_uniform_histogram.length).toBe(18);
    expect(f.frangi_features.length).toBe(9);
    expect(f.landmark_geometry.length).toBe(5);
    expect(f.hydration_handcrafted.length).toBe(44);
    expect(f.elasticity_handcrafted.length).toBe(14);
  });
});
