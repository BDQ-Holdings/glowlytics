/**
 * Signal Processing Pipeline Tests
 *
 * Tests the 3-layer vision pipeline:
 *   Layer 1: Deterministic image processing (image-processing.js)
 *   Layer 2: Custom CV model inference (signal-models.js)
 *   Layer 3: GPT-4o fine-tuned model (existing, mocked)
 *
 * Unit tests cover the pure functions exported by image-processing.js and
 * signal-models.js. Integration tests verify the merged response shape
 * returned by POST /api/vision/analyze.
 *
 * External dependencies (openai, pg, rag, image-processing, signal-models)
 * are mocked before requiring app so no real API calls or DB connections occur.
 */

process.env.NODE_ENV = 'development';

// ---- Direct imports for unit tests (no mocking needed) ----

const {
  srgbToLab,
  computeITA,
  stats,
  computeGLCM,
  computeLBP,
  analyzeSpecular,
  featuresToSignalScores,
} = require('../image-processing');

const {
  bboxToZone,
  mergeSignalScores,
  LESION_CLASSES,
  computeIoU,
  nms,
} = require('../signal-models');

const {
  computeGaborFeatures,
  computeLBPUniform,
  computeFrangiFeatures,
  computeLandmarkGeometry,
  buildHydrationFeatures,
  buildElasticityFeatures,
} = require('../image-processing');

// =====================================================================
// UNIT TESTS: image-processing.js
// =====================================================================

describe('image-processing.js', () => {
  // ---- srgbToLab ----

  describe('srgbToLab', () => {
    test('pure white (255,255,255) maps to L~100, a~0, b~0', () => {
      const { L, a, b } = srgbToLab(255, 255, 255);
      expect(L).toBeCloseTo(100, 0);
      expect(a).toBeCloseTo(0, 0);
      expect(b).toBeCloseTo(0, 0);
    });

    test('pure black (0,0,0) maps to L~0, a~0, b~0', () => {
      const { L, a, b } = srgbToLab(0, 0, 0);
      expect(L).toBeCloseTo(0, 0);
      expect(a).toBeCloseTo(0, 0);
      expect(b).toBeCloseTo(0, 0);
    });

    test('pure red (255,0,0) has positive a* (green-red axis)', () => {
      const { L, a, b } = srgbToLab(255, 0, 0);
      expect(a).toBeGreaterThan(0);
      // Red in CIELAB has L roughly around 53
      expect(L).toBeGreaterThan(40);
      expect(L).toBeLessThan(65);
    });

    test('pure green (0,255,0) has negative a* (green-red axis)', () => {
      const { a } = srgbToLab(0, 255, 0);
      expect(a).toBeLessThan(0);
    });

    test('pure blue (0,0,255) has negative b* (blue-yellow axis)', () => {
      const { b } = srgbToLab(0, 0, 255);
      expect(b).toBeLessThan(0);
    });

    test('pure yellow (255,255,0) has positive b* (blue-yellow axis)', () => {
      const { b } = srgbToLab(255, 255, 0);
      expect(b).toBeGreaterThan(0);
    });

    test('mid gray (128,128,128) has L close to 54, a~0, b~0', () => {
      const { L, a, b } = srgbToLab(128, 128, 128);
      // Mid gray in CIELAB has L around 53-54
      expect(L).toBeGreaterThan(50);
      expect(L).toBeLessThan(57);
      expect(Math.abs(a)).toBeLessThan(1);
      expect(Math.abs(b)).toBeLessThan(1);
    });
  });

  // ---- computeITA ----

  describe('computeITA', () => {
    test('ITA = arctan((L - 50) / b) * 180/pi for known values', () => {
      // L=70, b=20 => ITA = arctan(20/20) * 180/pi = 45 degrees
      const ita = computeITA(70, 20);
      expect(ita).toBeCloseTo(45, 1);
    });

    test('L=50, b=10 => ITA = arctan(0/10) = 0 degrees', () => {
      const ita = computeITA(50, 10);
      expect(ita).toBeCloseTo(0, 1);
    });

    test('b near zero returns 0 (guarded)', () => {
      const ita = computeITA(70, 0.0001);
      expect(ita).toBe(0);
    });

    test('high L, low b produces large positive ITA (light skin)', () => {
      const ita = computeITA(90, 5);
      // arctan(40/5) = arctan(8) ~ 83 degrees
      expect(ita).toBeGreaterThan(80);
    });

    test('low L, high b produces negative or small ITA (dark skin)', () => {
      const ita = computeITA(30, 25);
      // arctan(-20/25) = arctan(-0.8) ~ -38.7 degrees
      expect(ita).toBeLessThan(0);
    });
  });

  // ---- stats ----

  describe('stats', () => {
    test('empty array returns mean=0, std=0', () => {
      const result = stats([]);
      expect(result.mean).toBe(0);
      expect(result.std).toBe(0);
    });

    test('single element array has std=0', () => {
      const result = stats([42]);
      expect(result.mean).toBe(42);
      expect(result.std).toBe(0);
    });

    test('known array [2,4,4,4,5,5,7,9] has mean=5, std=2', () => {
      const result = stats([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(result.mean).toBe(5);
      expect(result.std).toBe(2);
    });

    test('all identical values have std=0', () => {
      const result = stats([7, 7, 7, 7, 7]);
      expect(result.mean).toBe(7);
      expect(result.std).toBe(0);
    });

    test('[0, 10] has mean=5 and std=5', () => {
      const result = stats([0, 10]);
      expect(result.mean).toBe(5);
      expect(result.std).toBe(5);
    });
  });

  // ---- computeGLCM ----

  describe('computeGLCM', () => {
    test('constant gray image has zero contrast and zero dissimilarity', () => {
      // 4x4 image where all pixels are the same gray level
      const width = 4;
      const height = 4;
      const pixels = new Float32Array(width * height).fill(128);

      const { contrast, dissimilarity, homogeneity, energy } = computeGLCM(pixels, width, height);

      expect(contrast).toBe(0);
      expect(dissimilarity).toBe(0);
      // All co-occurrences on diagonal => homogeneity should be 1
      expect(homogeneity).toBeCloseTo(1, 5);
      // For a constant image quantized to 16 levels, all mass is on one cell
      expect(energy).toBeGreaterThan(0);
    });

    test('alternating pixel image has non-zero contrast', () => {
      // Checkerboard: alternating 0 and 255 values
      const width = 4;
      const height = 4;
      const pixels = new Float32Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixels[y * width + x] = (x + y) % 2 === 0 ? 0 : 255;
        }
      }

      const { contrast, dissimilarity } = computeGLCM(pixels, width, height);

      expect(contrast).toBeGreaterThan(0);
      expect(dissimilarity).toBeGreaterThan(0);
    });

    test('GLCM returns all four named properties', () => {
      const width = 3;
      const height = 3;
      const pixels = new Float32Array([10, 20, 30, 40, 50, 60, 70, 80, 90]);

      const result = computeGLCM(pixels, width, height);

      expect(result).toHaveProperty('contrast');
      expect(result).toHaveProperty('dissimilarity');
      expect(result).toHaveProperty('homogeneity');
      expect(result).toHaveProperty('energy');
    });
  });

  // ---- computeLBP ----

  describe('computeLBP', () => {
    test('constant image produces low entropy (all neighbors equal center)', () => {
      // 5x5 constant image — inner 3x3 region is processed
      const width = 5;
      const height = 5;
      const pixels = new Float32Array(width * height).fill(100);

      const { entropy, uniformity } = computeLBP(pixels, width, height);

      // All neighbors >= center => pattern=0xFF for every pixel => entropy = 0 (single bin)
      expect(entropy).toBeCloseTo(0, 5);
      // All probability mass in one bin => uniformity = 1
      expect(uniformity).toBeCloseTo(1, 5);
    });

    test('varied image produces higher entropy than constant image', () => {
      const width = 6;
      const height = 6;
      // Gradient image
      const pixels = new Float32Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          pixels[y * width + x] = (x * 40 + y * 30) % 256;
        }
      }

      const { entropy: variedEntropy } = computeLBP(pixels, width, height);

      // Constant image baseline
      const constPixels = new Float32Array(width * height).fill(100);
      const { entropy: constEntropy } = computeLBP(constPixels, width, height);

      expect(variedEntropy).toBeGreaterThan(constEntropy);
    });

    test('LBP returns entropy and uniformity properties', () => {
      const width = 4;
      const height = 4;
      const pixels = new Float32Array(width * height).fill(50);

      const result = computeLBP(pixels, width, height);

      expect(result).toHaveProperty('entropy');
      expect(result).toHaveProperty('uniformity');
      expect(typeof result.entropy).toBe('number');
      expect(typeof result.uniformity).toBe('number');
    });
  });

  // ---- analyzeSpecular ----

  describe('analyzeSpecular', () => {
    test('all-white image has high specular ratio', () => {
      // 4x4 all white RGB image (every pixel R=G=B=255 => max-min=0, all >200)
      const width = 4;
      const height = 4;
      const pixels = new Uint8Array(width * height * 3).fill(255);

      const { ratio } = analyzeSpecular(pixels, width, height);

      // Every pixel qualifies as specular
      expect(ratio).toBeCloseTo(1.0, 5);
    });

    test('all-black image has zero specular ratio', () => {
      const width = 4;
      const height = 4;
      const pixels = new Uint8Array(width * height * 3).fill(0);

      const { ratio, uniformity } = analyzeSpecular(pixels, width, height);

      expect(ratio).toBe(0);
      expect(uniformity).toBe(0);
    });

    test('mixed image: only bright pixels count as specular', () => {
      const width = 4;
      const height = 2;
      const pixels = new Uint8Array(width * height * 3);

      // Top row: all white (specular)
      for (let x = 0; x < width; x++) {
        const idx = x * 3;
        pixels[idx] = 255;
        pixels[idx + 1] = 255;
        pixels[idx + 2] = 255;
      }
      // Bottom row: all dark (not specular)
      for (let x = 0; x < width; x++) {
        const idx = (width + x) * 3;
        pixels[idx] = 50;
        pixels[idx + 1] = 50;
        pixels[idx + 2] = 50;
      }

      const { ratio } = analyzeSpecular(pixels, width, height);

      // Half the pixels are specular
      expect(ratio).toBeCloseTo(0.5, 5);
    });

    test('high-saturation bright pixel is not specular (max-min >= 30)', () => {
      const width = 1;
      const height = 1;
      // R=255, G=210, B=210 => max-min=45 > 30, so NOT specular
      const pixels = new Uint8Array([255, 210, 210]);

      const { ratio } = analyzeSpecular(pixels, width, height);

      expect(ratio).toBe(0);
    });
  });

  // ---- featuresToSignalScores ----

  describe('featuresToSignalScores', () => {
    const baseFeatures = {
      inflammation: { a_star_mean: 5, a_star_std: 3, r_ratio_mean: 0.35 },
      sunDamage: { ita_mean: 30, ita_std: 8, ita_cv: 0.2, spot_count: 3 },
      hydration: { specular_ratio: 0.03, specular_uniformity: 0.3, lbp_entropy: 5, lbp_uniformity: 0.06 },
      structure: { glcm_contrast: 2, glcm_dissimilarity: 1, glcm_homogeneity: 0.6, glcm_energy: 0.1, pore_proxy: 2 },
      elasticity: { wrinkle_index: 8, forehead_glcm: { contrast: 1.5, dissimilarity: 0.8, homogeneity: 0.5, energy: 0.1 } },
    };

    test('returns all 5 signal keys', () => {
      const scores = featuresToSignalScores(baseFeatures);

      expect(scores).toHaveProperty('structure');
      expect(scores).toHaveProperty('hydration');
      expect(scores).toHaveProperty('inflammation');
      expect(scores).toHaveProperty('sunDamage');
      expect(scores).toHaveProperty('elasticity');
    });

    test('all scores are integers in [0, 100]', () => {
      const scores = featuresToSignalScores(baseFeatures);

      for (const key of ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity']) {
        expect(Number.isInteger(scores[key])).toBe(true);
        expect(scores[key]).toBeGreaterThanOrEqual(0);
        expect(scores[key]).toBeLessThanOrEqual(100);
      }
    });

    test('high a_star_mean (erythema) produces lower inflammation score', () => {
      const inflamed = {
        ...baseFeatures,
        inflammation: { a_star_mean: 20, a_star_std: 5, r_ratio_mean: 0.42 },
      };
      const healthy = {
        ...baseFeatures,
        inflammation: { a_star_mean: -2, a_star_std: 1, r_ratio_mean: 0.32 },
      };

      const inflamedScores = featuresToSignalScores(inflamed);
      const healthyScores = featuresToSignalScores(healthy);

      // Higher a* = more erythema = worse inflammation score (lower health)
      expect(inflamedScores.inflammation).toBeLessThan(healthyScores.inflammation);
    });

    test('high ita_cv and spot_count produce lower sunDamage score', () => {
      const damaged = {
        ...baseFeatures,
        sunDamage: { ita_mean: 30, ita_std: 15, ita_cv: 0.5, spot_count: 20 },
      };
      const clear = {
        ...baseFeatures,
        sunDamage: { ita_mean: 30, ita_std: 2, ita_cv: 0.05, spot_count: 0 },
      };

      const damagedScores = featuresToSignalScores(damaged);
      const clearScores = featuresToSignalScores(clear);

      expect(damagedScores.sunDamage).toBeLessThan(clearScores.sunDamage);
    });

    test('high wrinkle_index produces lower elasticity score', () => {
      const wrinkled = {
        ...baseFeatures,
        elasticity: { wrinkle_index: 28, forehead_glcm: { contrast: 6, dissimilarity: 3, homogeneity: 0.3, energy: 0.05 } },
      };
      const smooth = {
        ...baseFeatures,
        elasticity: { wrinkle_index: 2, forehead_glcm: { contrast: 0.5, dissimilarity: 0.3, homogeneity: 0.8, energy: 0.3 } },
      };

      const wrinkledScores = featuresToSignalScores(wrinkled);
      const smoothScores = featuresToSignalScores(smooth);

      expect(wrinkledScores.elasticity).toBeLessThan(smoothScores.elasticity);
    });
  });
});

// =====================================================================
// UNIT TESTS: new image-processing features (Gabor, LBP-uniform, Frangi)
// =====================================================================

describe('image-processing.js (new features)', () => {
  describe('computeGaborFeatures', () => {
    test('returns Float32Array of length 24', () => {
      const width = 32;
      const height = 32;
      const pixels = new Float32Array(width * height).fill(128);
      const result = computeGaborFeatures(pixels, width, height);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(24);
    });

    test('non-constant image produces non-zero std features', () => {
      const width = 64;
      const height = 64;
      const pixels = new Float32Array(width * height);
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = (i * 7) % 256;
      }
      const result = computeGaborFeatures(pixels, width, height);
      // At least some std features (odd indices) should be non-zero
      let hasNonZero = false;
      for (let i = 1; i < 24; i += 2) {
        if (result[i] > 0) hasNonZero = true;
      }
      expect(hasNonZero).toBe(true);
    });
  });

  describe('computeLBPUniform', () => {
    test('returns Float32Array of length 18 for r=2, n=16', () => {
      const width = 16;
      const height = 16;
      const pixels = new Float32Array(width * height).fill(100);
      const result = computeLBPUniform(pixels, width, height, 2, 16);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(18);
    });

    test('histogram sums to approximately 1 (normalized)', () => {
      const width = 20;
      const height = 20;
      const pixels = new Float32Array(width * height);
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = (i * 13) % 256;
      }
      const result = computeLBPUniform(pixels, width, height, 2, 16);
      let sum = 0;
      for (let i = 0; i < result.length; i++) sum += result[i];
      expect(sum).toBeCloseTo(1.0, 2);
    });
  });

  describe('computeFrangiFeatures', () => {
    test('returns Float32Array of length 9', () => {
      const width = 32;
      const height = 32;
      const pixels = new Float32Array(width * height).fill(128);
      const result = computeFrangiFeatures(pixels, width, height);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(9);
    });
  });

  describe('computeLandmarkGeometry', () => {
    test('returns Float32Array of length 5', () => {
      const result = computeLandmarkGeometry();
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(5);
    });

    test('all values are between 0 and 1', () => {
      const result = computeLandmarkGeometry();
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBeGreaterThanOrEqual(0);
        expect(result[i]).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('buildHydrationFeatures', () => {
    test('returns Float32Array of length 44', () => {
      const features = {
        gabor_features: new Float32Array(24),
        lbp_uniform_histogram: new Float32Array(18),
        hydration: { specular_ratio: 0.02, specular_uniformity: 0.3 },
      };
      const result = buildHydrationFeatures(features);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(44);
    });
  });

  describe('buildElasticityFeatures', () => {
    test('returns Float32Array of length 14', () => {
      const features = {
        frangi_features: new Float32Array(9),
        landmark_geometry: new Float32Array(5),
      };
      const result = buildElasticityFeatures(features);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(14);
    });
  });
});

// =====================================================================
// UNIT TESTS: signal-models.js
// =====================================================================

describe('signal-models.js', () => {
  // ---- bboxToZone ----

  describe('bboxToZone', () => {
    test('(0.5, 0.1) maps to forehead (top center)', () => {
      expect(bboxToZone(0.5, 0.1)).toBe('forehead');
    });

    test('(0.2, 0.5) maps to left_cheek', () => {
      expect(bboxToZone(0.2, 0.5)).toBe('left_cheek');
    });

    test('(0.8, 0.5) maps to right_cheek', () => {
      expect(bboxToZone(0.8, 0.5)).toBe('right_cheek');
    });

    test('(0.5, 0.7) maps to chin', () => {
      expect(bboxToZone(0.5, 0.7)).toBe('chin');
    });

    test('(0.5, 0.35) maps to nose (mid center between cheek boundaries)', () => {
      expect(bboxToZone(0.5, 0.35)).toBe('nose');
    });

    test('(0.5, 0.9) maps to jaw (bottom of face)', () => {
      expect(bboxToZone(0.5, 0.9)).toBe('jaw');
    });

    test('(0.1, 0.3) maps to left_cheek (left, mid-upper)', () => {
      expect(bboxToZone(0.1, 0.3)).toBe('left_cheek');
    });

    test('(0.9, 0.3) maps to right_cheek (right, mid-upper)', () => {
      expect(bboxToZone(0.9, 0.3)).toBe('right_cheek');
    });
  });

  // ---- LESION_CLASSES ----

  describe('LESION_CLASSES', () => {
    test('is an array', () => {
      expect(Array.isArray(LESION_CLASSES)).toBe(true);
    });

    test('contains the acne class for v2 single-class detector', () => {
      expect(LESION_CLASSES).toContain('acne');
    });

    test('has exactly 1 class (v2 single-class detector)', () => {
      expect(LESION_CLASSES).toHaveLength(1);
    });
  });

  // ---- computeIoU ----

  describe('computeIoU', () => {
    test('identical boxes return 1.0', () => {
      expect(computeIoU([0.1, 0.1, 0.3, 0.3], [0.1, 0.1, 0.3, 0.3])).toBeCloseTo(1.0, 5);
    });

    test('non-overlapping boxes return 0.0', () => {
      expect(computeIoU([0, 0, 0.1, 0.1], [0.5, 0.5, 0.1, 0.1])).toBe(0);
    });

    test('partial overlap returns value between 0 and 1', () => {
      const iou = computeIoU([0, 0, 0.4, 0.4], [0.2, 0.2, 0.4, 0.4]);
      expect(iou).toBeGreaterThan(0);
      expect(iou).toBeLessThan(1);
    });

    test('box fully inside another has correct IoU', () => {
      // Inner box: [0.1, 0.1, 0.1, 0.1] area = 0.01
      // Outer box: [0, 0, 0.5, 0.5] area = 0.25
      // Intersection = 0.01, Union = 0.25
      const iou = computeIoU([0, 0, 0.5, 0.5], [0.1, 0.1, 0.1, 0.1]);
      expect(iou).toBeCloseTo(0.01 / 0.25, 4);
    });

    test('zero-area box returns 0', () => {
      expect(computeIoU([0, 0, 0, 0], [0, 0, 0.1, 0.1])).toBe(0);
    });
  });

  // ---- nms ----

  describe('nms', () => {
    test('keeps all boxes when no overlap', () => {
      const boxes = [[0, 0, 0.1, 0.1], [0.5, 0.5, 0.1, 0.1], [0.9, 0.9, 0.1, 0.1]];
      const scores = [0.9, 0.8, 0.7];
      const kept = nms(boxes, scores, 0.45);
      expect(kept).toHaveLength(3);
    });

    test('suppresses overlapping lower-confidence box', () => {
      const boxes = [[0.1, 0.1, 0.3, 0.3], [0.12, 0.12, 0.3, 0.3]];
      const scores = [0.9, 0.7];
      const kept = nms(boxes, scores, 0.45);
      expect(kept).toHaveLength(1);
      expect(kept[0]).toBe(0); // higher-confidence box kept
    });

    test('returns empty for empty input', () => {
      expect(nms([], [], 0.45)).toHaveLength(0);
    });

    test('single box is always kept', () => {
      const kept = nms([[0.1, 0.1, 0.2, 0.2]], [0.5], 0.45);
      expect(kept).toEqual([0]);
    });

    test('preserves order by confidence (highest first)', () => {
      const boxes = [
        [0, 0, 0.1, 0.1],
        [0.5, 0.5, 0.1, 0.1],
        [0.9, 0, 0.1, 0.1],
      ];
      const scores = [0.3, 0.9, 0.6];
      const kept = nms(boxes, scores, 0.45);
      // Should return indices sorted by descending score
      expect(kept[0]).toBe(1);
    });
  });

  // ---- mergeSignalScores ----

  describe('mergeSignalScores', () => {
    const layer1Scores = {
      structure: 70,
      hydration: 65,
      inflammation: 80,
      sunDamage: 75,
      elasticity: 60,
    };

    const layer2NoOverrides = {
      signalOverrides: { structure: null, hydration: null, sunDamage: null, elasticity: null },
      lesions: [],
      signalConfidence: {
        structure: 'med', hydration: 'med', inflammation: 'med',
        sunDamage: 'med', elasticity: 'med',
      },
    };

    const layer3Scores = {
      structure: 50,
      hydration: 55,
      inflammation: 60,
      sunDamage: 65,
      elasticity: 40,
    };

    test('Layer 2 overrides have highest weight in uncertainty-weighted merge', () => {
      const layer2WithOverrides = {
        signalOverrides: { structure: 85, hydration: null, sunDamage: null, elasticity: 92 },
        lesions: [],
        signalConfidence: {
          structure: 'high', hydration: 'med', inflammation: 'med',
          sunDamage: 'med', elasticity: 'high',
        },
      };

      const merged = mergeSignalScores(layer1Scores, layer2WithOverrides, layer3Scores);

      // With L2 override: merged = (0.5*L1 + 0.9*L2 + 0.6*L3) / (0.5+0.9+0.6)
      // Structure: (0.5*70 + 0.9*85 + 0.6*50) / 2.0 = (35+76.5+30)/2.0 = 71 (rounded)
      expect(merged.structure).toBe(71);
      // Elasticity: (0.5*60 + 0.9*92 + 0.6*40) / 2.0 = (30+82.8+24)/2.0 = 68 (rounded)
      expect(merged.elasticity).toBe(68);
      // Hydration has no override (beta_L2=0), so only L1+L3
      // (0.5*65 + 0.6*55) / 1.1 = (32.5+33)/1.1 = 60 (rounded)
      expect(merged.hydration).toBe(60);
    });

    test('sunDamage L2 override uses BETA_L2_LOADED.sunDamage = 0.85', () => {
      const layer2WithSunDamage = {
        signalOverrides: { structure: null, hydration: null, sunDamage: 80, elasticity: null },
        lesions: [],
        signalConfidence: {
          structure: 'med', hydration: 'med', inflammation: 'med',
          sunDamage: 'high', elasticity: 'med',
        },
      };

      const merged = mergeSignalScores(layer1Scores, layer2WithSunDamage, layer3Scores);

      // sunDamage: (0.8*75 + 0.85*80 + 0.6*65) / (0.8+0.85+0.6) = (60+68+39)/2.25 = 74 (rounded)
      expect(merged.sunDamage).toBe(74);
    });

    test('without overrides, uses L1+L3 uncertainty-weighted merge', () => {
      const merged = mergeSignalScores(layer1Scores, layer2NoOverrides, layer3Scores);

      // No L2 overrides → beta_L2=0 for all
      // Structure: (0.5*70 + 0.6*50) / (0.5+0.6) = (35+30)/1.1 = 59 (rounded)
      expect(merged.structure).toBe(59);
      // Hydration: (0.5*65 + 0.6*55) / 1.1 = (32.5+33)/1.1 = 60 (rounded)
      expect(merged.hydration).toBe(60);
      // Inflammation: (0.8*80 + 0.6*60) / 1.4 = (64+36)/1.4 = 71 (rounded)
      expect(merged.inflammation).toBe(71);
      // SunDamage: (0.8*75 + 0.6*65) / 1.4 = (60+39)/1.4 = 71 (rounded)
      expect(merged.sunDamage).toBe(71);
      // Elasticity: (0.5*60 + 0.6*40) / 1.1 = (30+24)/1.1 = 49 (rounded)
      expect(merged.elasticity).toBe(49);
    });

    test('all merged scores are clamped to 0-100 integers', () => {
      const merged = mergeSignalScores(layer1Scores, layer2NoOverrides, layer3Scores);

      for (const key of ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity']) {
        expect(Number.isInteger(merged[key])).toBe(true);
        expect(merged[key]).toBeGreaterThanOrEqual(0);
        expect(merged[key]).toBeLessThanOrEqual(100);
      }
    });

    test('null Layer 3 scores fall back to Layer 1 values', () => {
      const merged = mergeSignalScores(layer1Scores, layer2NoOverrides, null);

      // When Layer 3 is null, L3 defaults to L1 value in the formula
      // merged = (beta_L1 * L1 + beta_L3 * L1) / (beta_L1 + beta_L3) = L1
      expect(merged.structure).toBe(70);
      expect(merged.hydration).toBe(65);
      expect(merged.inflammation).toBe(80);
      expect(merged.sunDamage).toBe(75);
      expect(merged.elasticity).toBe(60);
    });

    test('returns all 5 signal keys', () => {
      const merged = mergeSignalScores(layer1Scores, layer2NoOverrides, layer3Scores);

      expect(merged).toHaveProperty('structure');
      expect(merged).toHaveProperty('hydration');
      expect(merged).toHaveProperty('inflammation');
      expect(merged).toHaveProperty('sunDamage');
      expect(merged).toHaveProperty('elasticity');
      expect(Object.keys(merged)).toHaveLength(5);
    });
  });
});

// =====================================================================
// INTEGRATION TESTS: POST /api/vision/analyze (signal fields in response)
// =====================================================================

describe('POST /api/vision/analyze (signal pipeline integration)', () => {
  // ---- Module mocks for integration tests (must be before require) ----

  const mockCreate = jest.fn();

  jest.mock('openai', () => {
    return jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));
  });

  jest.mock('pg', () => {
    const mockPool = { query: jest.fn() };
    return { Pool: jest.fn(() => mockPool) };
  });

  jest.mock('../rag', () => ({
    seedGuidelines: jest.fn(),
    queryGuidelines: jest.fn().mockResolvedValue([]),
    queryGuidelinesMulti: jest.fn().mockResolvedValue([]),
  }));

  // Mock image-processing to return deterministic features
  const mockExtractFeatures = jest.fn();
  const mockFeaturesToSignalScores = jest.fn();
  const mockExtractSummaryFeatures = jest.fn();

  jest.mock('../image-processing', () => ({
    extractFeatures: mockExtractFeatures,
    featuresToSignalScores: mockFeaturesToSignalScores,
    extractSummaryFeatures: mockExtractSummaryFeatures,
    srgbToLab: jest.fn(),
    computeITA: jest.fn(),
    computeGLCM: jest.fn(),
    computeLBP: jest.fn(),
    analyzeSpecular: jest.fn(),
    countSpots: jest.fn(),
    stats: jest.fn(),
  }));

  // Mock signal-models to return deterministic results
  const mockRunAllModels = jest.fn();
  const mockMergeSignalScores = jest.fn();

  const mockRunAcneDetector = jest.fn();

  const mockApplyLesionFeedback = jest.fn((scores) => scores);

  jest.mock('../signal-models', () => ({
    initModels: jest.fn().mockResolvedValue({ loaded: [] }),
    runAllModels: mockRunAllModels,
    runAcneDetector: mockRunAcneDetector,
    runSkinSignalsModel: jest.fn(),
    mergeSignalScores: mockMergeSignalScores,
    applyLesionFeedback: mockApplyLesionFeedback,
    bboxToZone: jest.fn(),
    LESION_CLASSES: ['acne'],
    prepareImageTensorV2: jest.fn(),
    prepareDetectorTensor: jest.fn(),
    computeIoU: jest.fn(),
    nms: jest.fn(),
  }));

  const request = require('supertest');
  const app = require('../app');

  const VALID_BODY = {
    image_base64: 'dGVzdGltYWdlZGF0YQ==',
    context: {
      primary_goal: 'acne tracking',
      scan_region: 'full face',
      sunscreen_used: true,
      sleep_quality: 'good',
      stress_level: 'low',
      scan_count: 5,
    },
  };

  const MOCK_FEATURES = {
    inflammation: { a_star_mean: 5, a_star_std: 3, r_ratio_mean: 0.35 },
    sunDamage: { ita_mean: 30, ita_std: 8, ita_cv: 0.2, spot_count: 3 },
    hydration: { specular_ratio: 0.03, specular_uniformity: 0.3, lbp_entropy: 5, lbp_uniformity: 0.06 },
    structure: { glcm_contrast: 2, glcm_dissimilarity: 1, glcm_homogeneity: 0.6, glcm_energy: 0.1, pore_proxy: 2 },
    elasticity: { wrinkle_index: 8, forehead_glcm: { contrast: 1.5, dissimilarity: 0.8, homogeneity: 0.5, energy: 0.1 } },
  };

  const MOCK_LAYER1_SCORES = { structure: 72, hydration: 65, inflammation: 78, sunDamage: 73, elasticity: 61 };

  const MOCK_LAYER2_RESULTS = {
    signalOverrides: { structure: null, hydration: null, sunDamage: null, elasticity: null },
    lesions: [],
    signalConfidence: {
      structure: 'med', hydration: 'med', inflammation: 'med',
      sunDamage: 'med', elasticity: 'med',
    },
  };

  const MOCK_SUMMARY_FEATURES = {
    inflammation_a_star: 5.0,
    ita_variance: 0.2,
    spot_count: 3,
    pore_density: 2.0,
    wrinkle_index: 8.0,
    specular_ratio: 0.03,
  };

  const MOCK_MERGED_SCORES = { structure: 65, hydration: 62, inflammation: 74, sunDamage: 70, elasticity: 55 };

  function mockGPTResponse(jsonObj) {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(jsonObj) } }],
    });
  }

  function setupLayer1And2Mocks() {
    mockExtractFeatures.mockResolvedValueOnce(MOCK_FEATURES);
    mockFeaturesToSignalScores.mockReturnValueOnce(MOCK_LAYER1_SCORES);
    mockRunAllModels.mockResolvedValueOnce(MOCK_LAYER2_RESULTS);
    mockExtractSummaryFeatures.mockReturnValueOnce(MOCK_SUMMARY_FEATURES);
    mockMergeSignalScores.mockReturnValueOnce(MOCK_MERGED_SCORES);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PINECONE_API_KEY;
  });

  test('response includes signal_scores, signal_features, lesions, and signal_confidence', async () => {
    setupLayer1And2Mocks();
    mockGPTResponse({
      acne_score: 25,
      sun_damage_score: 10,
      skin_age_score: 40,
      confidence: 'high',
      primary_driver: 'acne',
      recommended_action: 'Continue retinoid use.',
    });

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    // New signal fields present
    expect(res.body).toHaveProperty('signal_scores');
    expect(res.body).toHaveProperty('signal_features');
    expect(res.body).toHaveProperty('lesions');
    expect(res.body).toHaveProperty('signal_confidence');

    // Verify structure of signal_scores
    expect(res.body.signal_scores).toEqual(MOCK_MERGED_SCORES);

    // Verify signal_features
    expect(res.body.signal_features).toEqual(MOCK_SUMMARY_FEATURES);

    // Verify lesions is an array
    expect(Array.isArray(res.body.lesions)).toBe(true);

    // Verify signal_confidence
    expect(res.body.signal_confidence).toEqual(MOCK_LAYER2_RESULTS.signalConfidence);
  });

  test('backward compatibility: existing fields (acne_score, etc.) are still present', async () => {
    setupLayer1And2Mocks();
    mockGPTResponse({
      acne_score: 30,
      sun_damage_score: 15,
      skin_age_score: 20,
      confidence: 'med',
      primary_driver: 'sun_damage',
      recommended_action: 'Apply SPF daily.',
      personalized_feedback: 'Your skin looks good overall.',
    });

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    // Original fields still present and correct
    expect(res.body.acne_score).toBe(30);
    expect(res.body.sun_damage_score).toBe(15);
    expect(res.body.skin_age_score).toBe(20);
    expect(res.body.confidence).toBe('med');
    expect(res.body.primary_driver).toBe('sun_damage');
    expect(res.body.recommended_action).toBe('Apply SPF daily.');
    expect(res.body.personalized_feedback).toBe('Your skin looks good overall.');
    expect(res.body.conditions).toEqual([]);
    expect(res.body.rag_recommendations).toEqual([]);
  });

  test('Layer 1/2 failure gracefully falls back to Layer 3 only', async () => {
    // Layer 1 fails
    mockExtractFeatures.mockRejectedValueOnce(new Error('sharp not available'));
    // mergeSignalScores should NOT be called in this path

    mockGPTResponse({
      acne_score: 40,
      sun_damage_score: 20,
      skin_age_score: 30,
      confidence: 'high',
      primary_driver: 'acne',
      recommended_action: 'See a dermatologist.',
    });

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    // Should still return signal_scores derived from Layer 3
    expect(res.body).toHaveProperty('signal_scores');
    expect(res.body.signal_scores).toHaveProperty('structure');
    expect(res.body.signal_scores).toHaveProperty('hydration');
    expect(res.body.signal_scores).toHaveProperty('inflammation');
    expect(res.body.signal_scores).toHaveProperty('sunDamage');
    expect(res.body.signal_scores).toHaveProperty('elasticity');

    // All signal scores should be valid 0-100 integers
    for (const key of Object.keys(res.body.signal_scores)) {
      expect(res.body.signal_scores[key]).toBeGreaterThanOrEqual(0);
      expect(res.body.signal_scores[key]).toBeLessThanOrEqual(100);
    }

    // signal_features should be empty object, lesions empty array
    expect(res.body.signal_features).toEqual({});
    expect(res.body.lesions).toEqual([]);

    // signal_confidence should all be 'low' in Layer 3 only mode
    for (const key of Object.keys(res.body.signal_confidence)) {
      expect(res.body.signal_confidence[key]).toBe('low');
    }

    // mergeSignalScores was not called
    expect(mockMergeSignalScores).not.toHaveBeenCalled();
  });

  test('lesions array is passed through from Layer 2 results', async () => {
    const lesionsData = [
      { class: 'acne', confidence: 0.87, bbox: [0.3, 0.4, 0.05, 0.05], zone: 'left_cheek' },
      { class: 'acne', confidence: 0.72, bbox: [0.5, 0.1, 0.03, 0.03], zone: 'forehead' },
    ];

    mockExtractFeatures.mockResolvedValueOnce(MOCK_FEATURES);
    mockFeaturesToSignalScores.mockReturnValueOnce(MOCK_LAYER1_SCORES);
    mockRunAllModels.mockResolvedValueOnce({
      ...MOCK_LAYER2_RESULTS,
      lesions: lesionsData,
    });
    mockExtractSummaryFeatures.mockReturnValueOnce(MOCK_SUMMARY_FEATURES);
    mockMergeSignalScores.mockReturnValueOnce(MOCK_MERGED_SCORES);

    mockGPTResponse({
      acne_score: 35,
      sun_damage_score: 10,
      skin_age_score: 20,
      confidence: 'high',
      primary_driver: 'acne',
      recommended_action: 'Spot treat breakouts.',
    });

    const res = await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    expect(res.body.lesions).toEqual(lesionsData);
    expect(res.body.lesions).toHaveLength(2);
    expect(res.body.lesions[0].class).toBe('acne');
    expect(res.body.lesions[1].zone).toBe('forehead');
  });

  test('mergeSignalScores is called with correct layer arguments', async () => {
    setupLayer1And2Mocks();
    mockGPTResponse({
      acne_score: 50,
      sun_damage_score: 30,
      skin_age_score: 25,
      confidence: 'high',
      primary_driver: 'acne',
      recommended_action: 'Use benzoyl peroxide.',
    });

    await request(app)
      .post('/api/vision/analyze')
      .send(VALID_BODY)
      .expect(200);

    // mergeSignalScores should have been called with Layer 1 scores, Layer 2 results, and Layer 3 derived scores
    expect(mockMergeSignalScores).toHaveBeenCalledTimes(1);
    const [l1, l2, l3] = mockMergeSignalScores.mock.calls[0];
    expect(l1).toEqual(MOCK_LAYER1_SCORES);
    expect(l2).toEqual(MOCK_LAYER2_RESULTS);
    // Layer 3 scores are derived from GPT-4o proxy scores
    expect(l3).toHaveProperty('structure');
    expect(l3).toHaveProperty('hydration');
    expect(l3).toHaveProperty('inflammation');
    expect(l3).toHaveProperty('sunDamage');
    expect(l3).toHaveProperty('elasticity');
  });

  // ---- POST /api/vision/detect-lesions (fast endpoint) ----

  test('detect-lesions returns lesions array and latency_ms', async () => {
    const mockLesions = [
      { class: 'acne', confidence: 0.85, bbox: [0.3, 0.4, 0.05, 0.05], zone: 'left_cheek' },
    ];
    mockRunAcneDetector.mockResolvedValueOnce(mockLesions);

    const res = await request(app)
      .post('/api/vision/detect-lesions')
      .send({ image_base64: 'dGVzdA==' })
      .expect(200);

    expect(res.body).toHaveProperty('lesions');
    expect(res.body).toHaveProperty('latency_ms');
    expect(Array.isArray(res.body.lesions)).toBe(true);
    expect(typeof res.body.latency_ms).toBe('number');
  });

  test('detect-lesions returns empty lesions on error (graceful)', async () => {
    mockRunAcneDetector.mockRejectedValueOnce(new Error('model failed'));

    const res = await request(app)
      .post('/api/vision/detect-lesions')
      .send({ image_base64: 'dGVzdA==' })
      .expect(200);

    expect(res.body.lesions).toEqual([]);
  });

  test('detect-lesions returns 400 when image_base64 missing', async () => {
    const res = await request(app)
      .post('/api/vision/detect-lesions')
      .send({})
      .expect(400);

    expect(res.body.error).toBe('image_base64 is required');
  });

  test('detect-lesions does not require authentication', async () => {
    mockRunAcneDetector.mockResolvedValueOnce([]);

    const res = await request(app)
      .post('/api/vision/detect-lesions')
      .send({ image_base64: 'dGVzdA==' })
      .expect(200);

    expect(res.body).toHaveProperty('lesions');
  });
});
