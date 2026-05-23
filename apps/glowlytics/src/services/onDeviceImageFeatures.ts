/**
 * On-device Layer-1 deterministic image features.
 *
 * TypeScript port of `backend/image-processing.js`. Extracts biologically-grounded
 * features from facial photos using validated dermatology methods — no ML, no
 * native deps. Replaces the backend `sharp`-based decoder with
 * `expo-image-manipulator` (resize) + `jpeg-js` (decode to RGBA), mirroring the
 * preprocessing pipeline already used by `onDeviceSignalModels.ts`.
 *
 * Features extracted (matches backend output shape):
 *   - CIELAB a* erythema map (inflammation)
 *   - ITA (Individual Typology Angle) variance (sun damage)
 *   - Specular reflection analysis (hydration)
 *   - Gabor filter bank + LBP histograms (structure, hydration)
 *   - GLCM texture features (sun damage, structure)
 *   - Frangi-like wrinkle features (elasticity)
 */

import * as FileSystem from 'expo-file-system/legacy';

const TAG = '[ImageFeatures]';

// Match backend `extractFeatures`'s analysis width.
const ANALYSIS_WIDTH = 256;

// ---------------------------------------------------------------------------
// Shape definitions
// ---------------------------------------------------------------------------

export interface DeterministicFeatures {
  inflammation: {
    a_star_mean: number;
    a_star_std: number;
    r_ratio_mean: number;
  };
  sunDamage: {
    ita_mean: number;
    ita_std: number;
    ita_cv: number;
    spot_count: number;
  };
  hydration: {
    specular_ratio: number;
    specular_uniformity: number;
    lbp_entropy: number;
    lbp_uniformity: number;
  };
  structure: {
    glcm_contrast: number;
    glcm_dissimilarity: number;
    glcm_homogeneity: number;
    glcm_energy: number;
    pore_proxy: number;
  };
  elasticity: {
    wrinkle_index: number;
    forehead_glcm: {
      contrast: number;
      dissimilarity: number;
      homogeneity: number;
      energy: number;
    };
  };
  gabor_features: Float32Array;
  lbp_uniform_histogram: Float32Array;
  frangi_features: Float32Array;
  landmark_geometry: Float32Array;
  hydration_handcrafted: Float32Array;
  elasticity_handcrafted: Float32Array;
}

// ---------------------------------------------------------------------------
// Color-space helpers
// ---------------------------------------------------------------------------

export function srgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  let rLin = r / 255;
  let gLin = g / 255;
  let bLin = b / 255;
  rLin = rLin > 0.04045 ? Math.pow((rLin + 0.055) / 1.055, 2.4) : rLin / 12.92;
  gLin = gLin > 0.04045 ? Math.pow((gLin + 0.055) / 1.055, 2.4) : gLin / 12.92;
  bLin = bLin > 0.04045 ? Math.pow((bLin + 0.055) / 1.055, 2.4) : bLin / 12.92;

  let x = rLin * 0.4124564 + gLin * 0.3575761 + bLin * 0.1804375;
  let y = rLin * 0.2126729 + gLin * 0.7151522 + bLin * 0.0721750;
  let z = rLin * 0.0193339 + gLin * 0.1191920 + bLin * 0.9503041;

  x /= 0.95047;
  y /= 1.00000;
  z /= 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function computeITA(L: number, b: number): number {
  if (Math.abs(b) < 0.001) return 0;
  return Math.atan2(L - 50, b) * (180 / Math.PI);
}

export function stats(arr: ArrayLike<number>): { mean: number; std: number } {
  if (arr.length === 0) return { mean: 0, std: 0 };
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  const mean = sum / arr.length;
  let variance = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - mean;
    variance += d * d;
  }
  variance /= arr.length;
  return { mean, std: Math.sqrt(variance) };
}

// ---------------------------------------------------------------------------
// GLCM (Gray-Level Co-occurrence Matrix)
// ---------------------------------------------------------------------------

export function computeGLCM(
  grayPixels: ArrayLike<number>,
  width: number,
  height: number,
): { contrast: number; dissimilarity: number; homogeneity: number; energy: number } {
  const LEVELS = 16;
  const quantize = (v: number) => Math.min(LEVELS - 1, Math.floor((v / 256) * LEVELS));

  const matrix: Float32Array[] = Array.from({ length: LEVELS }, () => new Float32Array(LEVELS));
  let total = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = quantize(grayPixels[y * width + x]);
      const j = quantize(grayPixels[y * width + x + 1]);
      matrix[i][j]++;
      matrix[j][i]++;
      total += 2;
    }
  }

  if (total > 0) {
    for (let i = 0; i < LEVELS; i++) {
      for (let j = 0; j < LEVELS; j++) {
        matrix[i][j] /= total;
      }
    }
  }

  let contrast = 0, dissimilarity = 0, homogeneity = 0, energy = 0;
  for (let i = 0; i < LEVELS; i++) {
    for (let j = 0; j < LEVELS; j++) {
      const p = matrix[i][j];
      const diff = Math.abs(i - j);
      contrast += diff * diff * p;
      dissimilarity += diff * p;
      homogeneity += p / (1 + diff);
      energy += p * p;
    }
  }

  return { contrast, dissimilarity, homogeneity, energy };
}

// ---------------------------------------------------------------------------
// LBP (Local Binary Pattern) — simple 8-neighbor, radius 1
// ---------------------------------------------------------------------------

export function computeLBP(
  grayPixels: ArrayLike<number>,
  width: number,
  height: number,
): { entropy: number; uniformity: number } {
  const histogram = new Float32Array(256);
  let total = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = grayPixels[y * width + x];
      let pattern = 0;
      const neighbors = [
        grayPixels[(y - 1) * width + (x - 1)],
        grayPixels[(y - 1) * width + x],
        grayPixels[(y - 1) * width + (x + 1)],
        grayPixels[y * width + (x + 1)],
        grayPixels[(y + 1) * width + (x + 1)],
        grayPixels[(y + 1) * width + x],
        grayPixels[(y + 1) * width + (x - 1)],
        grayPixels[y * width + (x - 1)],
      ];
      for (let i = 0; i < 8; i++) {
        if (neighbors[i] >= center) pattern |= (1 << i);
      }
      histogram[pattern]++;
      total++;
    }
  }

  let entropy = 0;
  let uniformity = 0;
  if (total > 0) {
    for (let i = 0; i < 256; i++) {
      const p = histogram[i] / total;
      if (p > 0) entropy -= p * Math.log2(p);
      uniformity += p * p;
    }
  }

  return { entropy, uniformity };
}

// ---------------------------------------------------------------------------
// LBP — configurable radius/points, uniform-pattern bins
// ---------------------------------------------------------------------------

export function computeLBPUniform(
  grayPixels: ArrayLike<number>,
  width: number,
  height: number,
  radius = 2,
  nPoints = 16,
): Float32Array {
  // Clamp nPoints to prevent OOM on the lookup table.
  const points = Math.min(nPoints, 24);

  const offsets: Array<{ dx: number; dy: number }> = [];
  for (let p = 0; p < points; p++) {
    const angle = (2 * Math.PI * p) / points;
    offsets.push({ dx: radius * Math.cos(angle), dy: -radius * Math.sin(angle) });
  }

  function transitions(pattern: number): number {
    let count = 0;
    for (let i = 0; i < points; i++) {
      const bit1 = (pattern >> i) & 1;
      const bit2 = (pattern >> ((i + 1) % points)) & 1;
      if (bit1 !== bit2) count++;
    }
    return count;
  }

  function popcount(v: number): number {
    let c = 0;
    while (v) { c += v & 1; v >>= 1; }
    return c;
  }

  const nBins = points + 2;
  const patternToBin = new Int32Array(1 << points);
  for (let p = 0; p < (1 << points); p++) {
    patternToBin[p] = transitions(p) <= 2 ? popcount(p) : points + 1;
  }

  const histogram = new Float32Array(nBins);
  let total = 0;
  const margin = Math.ceil(radius);

  for (let y = margin; y < height - margin; y++) {
    for (let x = margin; x < width - margin; x++) {
      const center = grayPixels[y * width + x];
      let pattern = 0;

      for (let p = 0; p < points; p++) {
        const nx = x + offsets[p].dx;
        const ny = y + offsets[p].dy;
        const fx = Math.floor(nx);
        const fy = Math.floor(ny);
        const cx = Math.min(fx + 1, width - 1);
        const cy = Math.min(fy + 1, height - 1);
        const tx = nx - fx;
        const ty = ny - fy;

        const val =
          (1 - tx) * (1 - ty) * grayPixels[fy * width + fx] +
          tx * (1 - ty) * grayPixels[fy * width + cx] +
          (1 - tx) * ty * grayPixels[cy * width + fx] +
          tx * ty * grayPixels[cy * width + cx];

        if (val >= center) pattern |= (1 << p);
      }

      histogram[patternToBin[pattern]]++;
      total++;
    }
  }

  if (total > 0) {
    for (let i = 0; i < nBins; i++) histogram[i] /= total;
  }

  return histogram;
}

// ---------------------------------------------------------------------------
// Gabor filter bank — 4 orientations × 3 frequencies, mean+std per kernel
// ---------------------------------------------------------------------------

export function computeGaborFeatures(
  grayPixels: ArrayLike<number>,
  width: number,
  height: number,
): Float32Array {
  const orientations = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
  const frequencies = [0.1, 0.25, 0.4];
  const ksize = 31;
  const sigma = 4.0;
  const halfK = Math.floor(ksize / 2);
  const features = new Float32Array(24);

  const roiY0 = Math.round(height * 0.3);
  const roiY1 = Math.round(height * 0.7);
  const roiX0 = Math.round(width * 0.2);
  const roiX1 = Math.round(width * 0.8);

  let idx = 0;
  for (const theta of orientations) {
    for (const freq of frequencies) {
      const kernel = new Float32Array(ksize * ksize);
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const sigma2 = 2 * sigma * sigma;

      for (let ky = -halfK; ky <= halfK; ky++) {
        for (let kx = -halfK; kx <= halfK; kx++) {
          const xPrime = kx * cosT + ky * sinT;
          const yPrime = -kx * sinT + ky * cosT;
          const gaussian = Math.exp(-(xPrime * xPrime + yPrime * yPrime) / sigma2);
          kernel[(ky + halfK) * ksize + (kx + halfK)] = gaussian * Math.cos(2 * Math.PI * freq * xPrime);
        }
      }

      let sum = 0;
      let sumSq = 0;
      let count = 0;

      for (let y = roiY0; y < roiY1; y += 2) {
        for (let x = roiX0; x < roiX1; x += 2) {
          let response = 0;
          for (let ky = -halfK; ky <= halfK; ky += 2) {
            for (let kx = -halfK; kx <= halfK; kx += 2) {
              const py = y + ky;
              const px = x + kx;
              if (py >= 0 && py < height && px >= 0 && px < width) {
                response += grayPixels[py * width + px] * kernel[(ky + halfK) * ksize + (kx + halfK)];
              }
            }
          }
          sum += response;
          sumSq += response * response;
          count++;
        }
      }

      const mean = count > 0 ? sum / count : 0;
      const variance = count > 0 ? sumSq / count - mean * mean : 0;
      features[idx++] = mean;
      features[idx++] = Math.sqrt(Math.max(0, variance));
    }
  }

  return features;
}

// ---------------------------------------------------------------------------
// Frangi-like wrinkle features
// ---------------------------------------------------------------------------

export function computeFrangiFeatures(
  grayPixels: ArrayLike<number>,
  width: number,
  height: number,
): Float32Array {
  const features = new Float32Array(9);
  const scales = [1, 2, 3, 4];

  const rois = [
    { x0: Math.round(width * 0.15), y0: 0,                      x1: Math.round(width * 0.85), y1: Math.round(height * 0.25) },
    { x0: 0,                        y0: Math.round(height * 0.25), x1: Math.round(width * 0.25), y1: Math.round(height * 0.5) },
    { x0: Math.round(width * 0.75), y0: Math.round(height * 0.25), x1: width,                    y1: Math.round(height * 0.5) },
  ];

  for (let r = 0; r < rois.length; r++) {
    const roi = rois[r];
    const rw = roi.x1 - roi.x0;
    const rh = roi.y1 - roi.y0;
    if (rw < 4 || rh < 4) continue;

    let maxVesselness = 0;
    let vesselnessSum = 0;
    let wrinklePixels = 0;
    let roiPixels = 0;

    for (const scale of scales) {
      for (let y = roi.y0 + scale; y < roi.y1 - scale; y += 2) {
        for (let x = roi.x0 + scale; x < roi.x1 - scale; x += 2) {
          const c = grayPixels[y * width + x];
          const ixx = grayPixels[y * width + (x + scale)] + grayPixels[y * width + (x - scale)] - 2 * c;
          const iyy = grayPixels[(y + scale) * width + x] + grayPixels[(y - scale) * width + x] - 2 * c;
          const ixy = (
            grayPixels[(y + scale) * width + (x + scale)] +
            grayPixels[(y - scale) * width + (x - scale)] -
            grayPixels[(y + scale) * width + (x - scale)] -
            grayPixels[(y - scale) * width + (x + scale)]
          ) / 4;

          const trace = ixx + iyy;
          const det = ixx * iyy - ixy * ixy;
          const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
          const lambda1 = trace / 2 + disc;
          const lambda2 = trace / 2 - disc;

          const absL1 = Math.abs(lambda1);
          const absL2 = Math.abs(lambda2);
          if (absL2 < 0.001) continue;

          const Rb = absL1 / absL2;
          const S = Math.sqrt(absL1 * absL1 + absL2 * absL2);
          const vesselness = Math.exp(-Rb * Rb / 0.5) * (1 - Math.exp(-S * S / 200));

          if (vesselness > 0.05) wrinklePixels++;
          vesselnessSum += vesselness;
          if (vesselness > maxVesselness) maxVesselness = vesselness;
          roiPixels++;
        }
      }
    }

    const density = roiPixels > 0 ? wrinklePixels / roiPixels : 0;
    const intensity = roiPixels > 0 ? vesselnessSum / roiPixels : 0;
    features[r * 3] = density;
    features[r * 3 + 1] = intensity;
    features[r * 3 + 2] = maxVesselness;
  }

  return features;
}

export function computeLandmarkGeometry(): Float32Array {
  // Golden-ratio anthropometric proportions (matches backend constant).
  return new Float32Array([0.46, 0.36, 0.50, 0.33, 0.618]);
}

// ---------------------------------------------------------------------------
// Specular + spot helpers
// ---------------------------------------------------------------------------

export function analyzeSpecular(
  rgbPixels: ArrayLike<number>,
  width: number,
  height: number,
): { ratio: number; uniformity: number } {
  let specularCount = 0;
  const specularX: number[] = [];
  const specularY: number[] = [];
  const totalPixels = width * height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const r = rgbPixels[idx];
      const g = rgbPixels[idx + 1];
      const b = rgbPixels[idx + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      if (r > 200 && g > 200 && b > 200 && (maxC - minC) < 30) {
        specularCount++;
        specularX.push(x);
        specularY.push(y);
      }
    }
  }

  const ratio = specularCount / totalPixels;
  let uniformity = 0;
  if (specularX.length > 1) {
    const xStats = stats(specularX);
    const yStats = stats(specularY);
    uniformity = ((xStats.std / width) + (yStats.std / height)) / 2;
  }

  return { ratio, uniformity };
}

export function countSpots(
  values: ArrayLike<number>,
  width: number,
  height: number,
  threshold: number,
): number {
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian =
        -4 * values[idx] +
        values[(y - 1) * width + x] +
        values[(y + 1) * width + x] +
        values[y * width + (x - 1)] +
        values[y * width + (x + 1)];
      if (Math.abs(laplacian) > threshold) count++;
    }
  }
  // Approximate blob count (clusters of ~20 high-response pixels per spot)
  return Math.round(count / 20);
}

// ---------------------------------------------------------------------------
// Handcrafted feature assembly
// ---------------------------------------------------------------------------

export function buildHydrationFeatures(features: DeterministicFeatures): Float32Array {
  const result = new Float32Array(44);
  result.set(features.gabor_features, 0);          // 24
  result.set(features.lbp_uniform_histogram, 24);  // 18
  result[42] = features.hydration.specular_ratio;
  result[43] = features.hydration.specular_uniformity;
  return result;
}

export function buildElasticityFeatures(features: DeterministicFeatures): Float32Array {
  const result = new Float32Array(14);
  result.set(features.frangi_features, 0);     // 9
  result.set(features.landmark_geometry, 9);   // 5
  return result;
}

// ---------------------------------------------------------------------------
// Pixel acquisition — replaces backend's `sharp` pipeline
// ---------------------------------------------------------------------------

function base64ToUint8Array(base64: string): Uint8Array {
  const raw = globalThis.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Decode and resize a photo to a fixed analysis width, returning an RGB
 * pixel buffer in CHW byte order (matches backend output).
 *
 * `photoUri` accepts a `file://` URI from the camera flow. `expo-image-manipulator`
 * handles native decoding + resizing on the device GPU/ISP, then we decode
 * the 256-wide JPEG to raw bytes with `jpeg-js`.
 */
async function preparePixels(photoUri: string): Promise<{
  rgb: Uint8Array;
  width: number;
  height: number;
} | null> {
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');

    // 1. Probe dimensions to compute aspect-preserving target height.
    const probe = await manipulateAsync(photoUri, [], { format: SaveFormat.JPEG });
    const { width: srcW, height: srcH } = probe;
    if (probe.uri && probe.uri !== photoUri) {
      FileSystem.deleteAsync(probe.uri, { idempotent: true }).catch(() => {});
    }
    if (!srcW || !srcH) return null;

    const targetW = ANALYSIS_WIDTH;
    const targetH = Math.round((srcH / srcW) * targetW);

    // 2. Resize via native pipeline. Request base64 directly so we don't pay
    //    a second file-read.
    const processed = await manipulateAsync(
      photoUri,
      [{ resize: { width: targetW, height: targetH } }],
      { format: SaveFormat.JPEG, base64: true },
    );

    if (!processed.base64) return null;

    // 3. Decode 256-wide JPEG → RGBA via jpeg-js (already a dependency).
    const { decode: decodeJpeg } = await import('jpeg-js');
    const jpegBytes = base64ToUint8Array(processed.base64);
    const decoded = decodeJpeg(jpegBytes, { useTArray: true, formatAsRGBA: true });
    const rgba = decoded.data as unknown as Uint8Array;

    // 4. Pack to interleaved RGB (drop alpha) to match backend pixel layout.
    const total = targetW * targetH;
    const rgb = new Uint8Array(total * 3);
    for (let i = 0; i < total; i++) {
      rgb[i * 3] = rgba[i * 4];
      rgb[i * 3 + 1] = rgba[i * 4 + 1];
      rgb[i * 3 + 2] = rgba[i * 4 + 2];
    }

    if (processed.uri && processed.uri !== photoUri) {
      FileSystem.deleteAsync(processed.uri, { idempotent: true }).catch(() => {});
    }

    return { rgb, width: targetW, height: targetH };
  } catch (err) {
    if (__DEV__) console.warn(TAG, 'preparePixels failed:', (err as Error)?.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Top-level extraction
// ---------------------------------------------------------------------------

/**
 * Estimate features when pixel acquisition fails — mirrors the backend's
 * `estimateFeaturesFromBase64` (neutral defaults) so the pipeline still
 * produces a usable shape.
 */
function estimateFallbackFeatures(): DeterministicFeatures {
  const landmark_geometry = computeLandmarkGeometry();
  const result: DeterministicFeatures = {
    inflammation: { a_star_mean: 5, a_star_std: 1, r_ratio_mean: 0.35 },
    sunDamage:    { ita_mean: 30, ita_std: 8, ita_cv: 0.1, spot_count: 0 },
    hydration:    { specular_ratio: 0.02, specular_uniformity: 0.3, lbp_entropy: 5.5, lbp_uniformity: 0.05 },
    structure:    { glcm_contrast: 2, glcm_dissimilarity: 1, glcm_homogeneity: 0.5, glcm_energy: 0.1, pore_proxy: 2 },
    elasticity:   { wrinkle_index: 5, forehead_glcm: { contrast: 2, dissimilarity: 1, homogeneity: 0.5, energy: 0.1 } },
    gabor_features: new Float32Array(24),
    lbp_uniform_histogram: new Float32Array(18),
    frangi_features: new Float32Array(9),
    landmark_geometry,
    hydration_handcrafted: new Float32Array(44),
    elasticity_handcrafted: new Float32Array(14),
  };
  result.hydration_handcrafted = buildHydrationFeatures(result);
  result.elasticity_handcrafted = buildElasticityFeatures(result);
  return result;
}

/**
 * Extract all deterministic features from a photo on-device.
 *
 * Resolves to a fallback estimate when pixel decoding fails — never throws,
 * mirroring the backend behavior. The fallback shape keeps the downstream
 * `featuresToSignalScores` math stable so the pipeline still produces a
 * sensible scan result even on degraded inputs.
 */
export async function extractFeaturesFromUri(photoUri: string): Promise<DeterministicFeatures> {
  const pixels = await preparePixels(photoUri);
  if (!pixels) return estimateFallbackFeatures();
  return extractFeaturesFromRgb(pixels.rgb, pixels.width, pixels.height);
}

/**
 * Lower-level entry point — useful for tests that synthesise pixels directly
 * without going through `expo-image-manipulator`.
 */
export function extractFeaturesFromRgb(
  rgbData: ArrayLike<number>,
  width: number,
  height: number,
): DeterministicFeatures {
  const totalPixels = width * height;

  const L_values = new Float32Array(totalPixels);
  const a_values = new Float32Array(totalPixels);
  const b_values = new Float32Array(totalPixels);
  const gray_values = new Float32Array(totalPixels);
  const green_values = new Float32Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const r = rgbData[i * 3];
    const g = rgbData[i * 3 + 1];
    const b = rgbData[i * 3 + 2];
    const lab = srgbToLab(r, g, b);
    L_values[i] = lab.L;
    a_values[i] = lab.a;
    b_values[i] = lab.b;
    gray_values[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    green_values[i] = g;
  }

  // INFLAMMATION
  const aStats = stats(a_values);
  let rRatioSum = 0;
  for (let i = 0; i < totalPixels; i++) {
    const r = rgbData[i * 3];
    const g = rgbData[i * 3 + 1];
    const b = rgbData[i * 3 + 2];
    const total = r + g + b;
    rRatioSum += total > 0 ? r / total : 0;
  }
  const rRatioMean = rRatioSum / totalPixels;

  // SUN DAMAGE — ITA across all pixels
  const itaValues = new Float32Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    itaValues[i] = computeITA(L_values[i], b_values[i]);
  }
  const itaStats = stats(itaValues);
  const itaCV = itaStats.mean !== 0 ? itaStats.std / Math.abs(itaStats.mean) : 0;
  const spotCount = countSpots(b_values, width, height, 15);

  // HYDRATION
  const specular = analyzeSpecular(rgbData, width, height);

  const cheekStartY = Math.round(height * 0.3);
  const cheekEndY = Math.round(height * 0.7);
  const cheekStartX = Math.round(width * 0.2);
  const cheekEndX = Math.round(width * 0.8);
  const cheekWidth = cheekEndX - cheekStartX;
  const cheekHeight = cheekEndY - cheekStartY;

  const cheekGray = new Float32Array(cheekWidth * cheekHeight);
  for (let y = 0; y < cheekHeight; y++) {
    for (let x = 0; x < cheekWidth; x++) {
      cheekGray[y * cheekWidth + x] = gray_values[(y + cheekStartY) * width + (x + cheekStartX)];
    }
  }
  const lbp = computeLBP(cheekGray, cheekWidth, cheekHeight);

  // STRUCTURE — GLCM
  const glcm = computeGLCM(gray_values, width, height);

  const cheekGreen = new Float32Array(cheekWidth * cheekHeight);
  for (let y = 0; y < cheekHeight; y++) {
    for (let x = 0; x < cheekWidth; x++) {
      cheekGreen[y * cheekWidth + x] = green_values[(y + cheekStartY) * width + (x + cheekStartX)];
    }
  }
  const greenGLCM = computeGLCM(cheekGreen, cheekWidth, cheekHeight);
  const poreProxy = greenGLCM.contrast;

  // ELASTICITY — forehead wrinkle index
  const foreheadEndY = Math.round(height * 0.3);
  const foreheadHeight = foreheadEndY;

  const foreheadGray = new Float32Array(width * foreheadHeight);
  for (let y = 0; y < foreheadHeight; y++) {
    for (let x = 0; x < width; x++) {
      foreheadGray[y * width + x] = gray_values[y * width + x];
    }
  }
  let wrinkleEnergy = 0;
  for (let y = 1; y < foreheadHeight - 1; y++) {
    for (let x = 0; x < width; x++) {
      const vertGrad = Math.abs(foreheadGray[(y + 1) * width + x] - foreheadGray[(y - 1) * width + x]);
      wrinkleEnergy += vertGrad;
    }
  }
  const wrinkleIndex = wrinkleEnergy / (width * (foreheadHeight - 2));

  // Handcrafted feature vectors
  const gabor_features = computeGaborFeatures(gray_values, width, height);
  const lbp_uniform_histogram = computeLBPUniform(cheekGray, cheekWidth, cheekHeight, 2, 16);
  const frangi_features = computeFrangiFeatures(gray_values, width, height);
  const landmark_geometry = computeLandmarkGeometry();

  const result: DeterministicFeatures = {
    inflammation: {
      a_star_mean: aStats.mean,
      a_star_std: aStats.std,
      r_ratio_mean: rRatioMean,
    },
    sunDamage: {
      ita_mean: itaStats.mean,
      ita_std: itaStats.std,
      ita_cv: itaCV,
      spot_count: spotCount,
    },
    hydration: {
      specular_ratio: specular.ratio,
      specular_uniformity: specular.uniformity,
      lbp_entropy: lbp.entropy,
      lbp_uniformity: lbp.uniformity,
    },
    structure: {
      glcm_contrast: glcm.contrast,
      glcm_dissimilarity: glcm.dissimilarity,
      glcm_homogeneity: glcm.homogeneity,
      glcm_energy: glcm.energy,
      pore_proxy: poreProxy,
    },
    elasticity: {
      wrinkle_index: wrinkleIndex,
      forehead_glcm: computeGLCM(foreheadGray, width, foreheadHeight),
    },
    gabor_features,
    lbp_uniform_histogram,
    frangi_features,
    landmark_geometry,
    hydration_handcrafted: new Float32Array(0),
    elasticity_handcrafted: new Float32Array(0),
  };

  result.hydration_handcrafted = buildHydrationFeatures(result);
  result.elasticity_handcrafted = buildElasticityFeatures(result);

  return result;
}
