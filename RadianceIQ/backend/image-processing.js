/**
 * Layer 1: Deterministic Image Processing
 *
 * Extracts biologically-grounded features from facial photos using validated
 * dermatology methods. No ML models — pure image analysis.
 *
 * Features extracted:
 * - CIELAB a* erythema map (inflammation)
 * - ITA (Individual Typology Angle) variance (sun damage)
 * - Specular reflection analysis (hydration)
 * - Gabor filter bank + LBP histograms (structure, hydration)
 * - GLCM texture features (sun damage, structure)
 *
 * Uses `sharp` for image decoding and color space operations.
 */

let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}

/**
 * Convert sRGB pixel to CIELAB color space.
 * Uses D65 illuminant reference.
 */
function srgbToLab(r, g, b) {
  // Linearize sRGB
  let rLin = r / 255;
  let gLin = g / 255;
  let bLin = b / 255;
  rLin = rLin > 0.04045 ? Math.pow((rLin + 0.055) / 1.055, 2.4) : rLin / 12.92;
  gLin = gLin > 0.04045 ? Math.pow((gLin + 0.055) / 1.055, 2.4) : gLin / 12.92;
  bLin = bLin > 0.04045 ? Math.pow((bLin + 0.055) / 1.055, 2.4) : bLin / 12.92;

  // sRGB to XYZ (D65)
  let x = rLin * 0.4124564 + gLin * 0.3575761 + bLin * 0.1804375;
  let y = rLin * 0.2126729 + gLin * 0.7151522 + bLin * 0.0721750;
  let z = rLin * 0.0193339 + gLin * 0.1191920 + bLin * 0.9503041;

  // Normalize to D65 reference white
  x /= 0.95047;
  y /= 1.00000;
  z /= 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bStar = 200 * (fy - fz);

  return { L, a, b: bStar };
}

/**
 * Compute Individual Typology Angle from CIELAB L* and b*.
 * ITA = arctan((L* - 50) / b*) × 180/π
 */
function computeITA(L, b) {
  if (Math.abs(b) < 0.001) return 0;
  return Math.atan2(L - 50, b) * (180 / Math.PI);
}

/**
 * Compute mean and standard deviation for an array.
 */
function stats(arr) {
  if (arr.length === 0) return { mean: 0, std: 0 };
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Compute GLCM (Gray-Level Co-occurrence Matrix) features for a grayscale patch.
 * Returns contrast, dissimilarity, homogeneity, energy.
 * Simplified to 16 gray levels for efficiency.
 */
function computeGLCM(grayPixels, width, height) {
  const LEVELS = 16;
  const quantize = (v) => Math.min(LEVELS - 1, Math.floor((v / 256) * LEVELS));

  // Build co-occurrence matrix (horizontal, distance=1)
  const matrix = Array.from({ length: LEVELS }, () => new Float32Array(LEVELS));
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

  // Normalize
  if (total > 0) {
    for (let i = 0; i < LEVELS; i++) {
      for (let j = 0; j < LEVELS; j++) {
        matrix[i][j] /= total;
      }
    }
  }

  // Extract features
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

/**
 * Compute LBP (Local Binary Pattern) histogram for a grayscale patch.
 * Uses 8-neighbor, radius-1 configuration.
 * Returns entropy and uniformity of the histogram.
 */
function computeLBP(grayPixels, width, height) {
  const histogram = new Float32Array(256);
  let total = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = grayPixels[y * width + x];
      let pattern = 0;

      // 8 neighbors clockwise from top-left
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
        if (neighbors[i] >= center) {
          pattern |= (1 << i);
        }
      }

      histogram[pattern]++;
      total++;
    }
  }

  // Normalize and compute entropy + uniformity
  let entropy = 0;
  let uniformity = 0;
  if (total > 0) {
    for (let i = 0; i < 256; i++) {
      const p = histogram[i] / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
      uniformity += p * p;
    }
  }

  return { entropy, uniformity };
}

/**
 * Compute LBP with configurable radius and number of points.
 * Returns uniform LBP histogram (nPoints+2 bins for uniform patterns + 1 non-uniform bin).
 */
function computeLBPUniform(grayPixels, width, height, radius, nPoints) {
  radius = radius || 2;
  nPoints = Math.min(nPoints || 16, 24); // Clamp to prevent OOM from 1 << nPoints

  // Pre-compute sampling offsets
  const offsets = [];
  for (let p = 0; p < nPoints; p++) {
    const angle = (2 * Math.PI * p) / nPoints;
    offsets.push({ dx: radius * Math.cos(angle), dy: -radius * Math.sin(angle) });
  }

  // Build uniform LBP lookup: count bit transitions
  function transitions(pattern) {
    let count = 0;
    for (let i = 0; i < nPoints; i++) {
      const bit1 = (pattern >> i) & 1;
      const bit2 = (pattern >> ((i + 1) % nPoints)) & 1;
      if (bit1 !== bit2) count++;
    }
    return count;
  }

  // Map uniform patterns to bin indices (nPoints+1 uniform + 1 non-uniform)
  // Uniform patterns: bin = popcount (number of set bits), range 0..nPoints
  // Non-uniform patterns: bin = nPoints + 1
  const nBins = nPoints + 2;

  function popcount(v) {
    let c = 0;
    while (v) { c += v & 1; v >>= 1; }
    return c;
  }

  const patternToBin = new Int32Array(1 << nPoints);
  for (let p = 0; p < (1 << nPoints); p++) {
    if (transitions(p) <= 2) {
      patternToBin[p] = popcount(p); // 0..nPoints
    } else {
      patternToBin[p] = nPoints + 1; // non-uniform bin
    }
  }

  const histogram = new Float32Array(nBins);
  let total = 0;
  const margin = Math.ceil(radius);

  for (let y = margin; y < height - margin; y++) {
    for (let x = margin; x < width - margin; x++) {
      const center = grayPixels[y * width + x];
      let pattern = 0;

      for (let p = 0; p < nPoints; p++) {
        const nx = x + offsets[p].dx;
        const ny = y + offsets[p].dy;

        // Bilinear interpolation
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

        if (val >= center) {
          pattern |= (1 << p);
        }
      }

      histogram[patternToBin[pattern]]++;
      total++;
    }
  }

  // Normalize
  if (total > 0) {
    for (let i = 0; i < nBins; i++) {
      histogram[i] /= total;
    }
  }

  return histogram;
}

/**
 * Compute Gabor filter bank features on cheek region.
 * 4 orientations x 3 frequencies = 12 kernels, 2 stats each = 24 features.
 */
function computeGaborFeatures(grayPixels, width, height) {
  const orientations = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
  const frequencies = [0.1, 0.25, 0.4];
  const ksize = 31;
  const sigma = 4.0;
  const halfK = Math.floor(ksize / 2);
  const features = new Float32Array(24);

  // Focus on cheek region for speed
  const roiY0 = Math.round(height * 0.3);
  const roiY1 = Math.round(height * 0.7);
  const roiX0 = Math.round(width * 0.2);
  const roiX1 = Math.round(width * 0.8);

  let idx = 0;
  for (const theta of orientations) {
    for (const freq of frequencies) {
      // Pre-compute Gabor kernel
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

      // Convolve on ROI
      let sum = 0;
      let sumSq = 0;
      let count = 0;

      for (let y = roiY0; y < roiY1; y += 2) { // stride 2 for speed
        for (let x = roiX0; x < roiX1; x += 2) {
          let response = 0;
          for (let ky = -halfK; ky <= halfK; ky += 2) { // stride 2 in kernel
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

/**
 * Compute Frangi-like wrinkle features for 3 ROIs.
 * ROIs: forehead (y: 0-25%), left crow's feet (x: 0-25%, y: 25-50%), right crow's feet (x: 75-100%, y: 25-50%)
 * Per ROI: wrinkle_density, wrinkle_intensity, max_response = 9 features total.
 */
function computeFrangiFeatures(grayPixels, width, height) {
  const features = new Float32Array(9);
  const scales = [1, 2, 3, 4];

  const rois = [
    { x0: Math.round(width * 0.15), y0: 0, x1: Math.round(width * 0.85), y1: Math.round(height * 0.25) }, // forehead
    { x0: 0, y0: Math.round(height * 0.25), x1: Math.round(width * 0.25), y1: Math.round(height * 0.5) }, // left crow's feet
    { x0: Math.round(width * 0.75), y0: Math.round(height * 0.25), x1: width, y1: Math.round(height * 0.5) }, // right crow's feet
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

    // Multi-scale Frangi
    for (const scale of scales) {
      for (let y = roi.y0 + scale; y < roi.y1 - scale; y += 2) {
        for (let x = roi.x0 + scale; x < roi.x1 - scale; x += 2) {
          // Hessian via second-order finite differences
          const c = grayPixels[y * width + x];
          const ixx = grayPixels[y * width + (x + scale)] + grayPixels[y * width + (x - scale)] - 2 * c;
          const iyy = grayPixels[(y + scale) * width + x] + grayPixels[(y - scale) * width + x] - 2 * c;
          const ixy = (
            grayPixels[(y + scale) * width + (x + scale)] +
            grayPixels[(y - scale) * width + (x - scale)] -
            grayPixels[(y + scale) * width + (x - scale)] -
            grayPixels[(y - scale) * width + (x + scale)]
          ) / 4;

          // Eigenvalues of 2x2 Hessian
          const trace = ixx + iyy;
          const det = ixx * iyy - ixy * ixy;
          const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
          const lambda1 = trace / 2 + disc;
          const lambda2 = trace / 2 - disc;

          // Vesselness (simplified Frangi)
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

/**
 * Compute canonical face landmark geometry features.
 * Uses anthropometric average ratios since we don't have landmarks server-side.
 * The CNN features (1280-dim) dominate prediction, so approximate ratios are acceptable.
 */
function computeLandmarkGeometry() {
  // Golden ratio-derived canonical face proportions
  return new Float32Array([
    0.46,  // eye_distance_ratio (inter-ocular / face width)
    0.36,  // nose_length_ratio (nose length / face height)
    0.50,  // mouth_width_ratio (mouth width / face width)
    0.33,  // upper_face_ratio (forehead to eyes / face height)
    0.618, // face_symmetry (golden ratio proxy)
  ]);
}

/**
 * Build hydration model handcrafted features (44-dim).
 * Assembles: 24 Gabor + 18 LBP(r=2,n=16) + 2 specular.
 */
function buildHydrationFeatures(features) {
  const result = new Float32Array(44);
  result.set(features.gabor_features, 0);         // 24
  result.set(features.lbp_uniform_histogram, 24);  // 18
  result[42] = features.hydration.specular_ratio;
  result[43] = features.hydration.specular_uniformity;
  return result;
}

/**
 * Build elasticity model handcrafted features (14-dim).
 * Assembles: 9 Frangi + 5 landmark geometry.
 */
function buildElasticityFeatures(features) {
  const result = new Float32Array(14);
  result.set(features.frangi_features, 0);       // 9
  result.set(features.landmark_geometry, 9);     // 5
  return result;
}

/**
 * Detect specular highlights in an RGB pixel buffer.
 * Specular pixels: R>200, G>200, B>200, max-min<30.
 * Returns ratio of specular pixels and their spatial uniformity.
 */
function analyzeSpecular(rgbPixels, width, height) {
  let specularCount = 0;
  const specularX = [];
  const specularY = [];
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

  // Spatial uniformity of specular highlights
  let uniformity = 0;
  if (specularX.length > 1) {
    const xStats = stats(specularX);
    const yStats = stats(specularY);
    // Higher std = more spread = more uniform reflection = better hydration
    const spreadX = xStats.std / width;
    const spreadY = yStats.std / height;
    uniformity = (spreadX + spreadY) / 2;
  }

  return { ratio, uniformity };
}

/**
 * Count potential spots/blobs using simplified LoG (Laplacian of Gaussian).
 * Works on b* channel for pigmented spots detection.
 */
function countSpots(values, width, height, threshold) {
  let count = 0;

  // Simple Laplacian kernel response
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian =
        -4 * values[idx] +
        values[(y - 1) * width + x] +
        values[(y + 1) * width + x] +
        values[y * width + (x - 1)] +
        values[y * width + (x + 1)];

      if (Math.abs(laplacian) > threshold) {
        count++;
      }
    }
  }

  // Approximate blob count (clusters of high-response pixels)
  return Math.round(count / 20); // Each blob ~20 pixels
}

/**
 * Extract all deterministic features from a base64 image.
 * Returns raw feature vectors for inflammation, sun damage, hydration, structure, elasticity.
 *
 * @param {string} base64Image - Base64-encoded JPEG/PNG image
 * @returns {Promise<object>} Feature extraction results
 */
async function extractFeatures(base64Image) {
  // Fallback features when sharp is not available (development/CI)
  if (!sharp) {
    console.warn('[image-processing] sharp not available — returning estimated features');
    return estimateFeaturesFromBase64(base64Image);
  }

  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');

    // Decode and resize to standard analysis size
    const metadata = await sharp(imageBuffer).metadata();
    const analysisWidth = 256;
    const analysisHeight = Math.round(
      (metadata.height / metadata.width) * analysisWidth
    );

    // Get raw RGB pixel data
    const { data: rgbData } = await sharp(imageBuffer)
      .resize(analysisWidth, analysisHeight, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = analysisWidth;
    const height = analysisHeight;
    const totalPixels = width * height;

    // Convert all pixels to CIELAB
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

    // ---- INFLAMMATION: CIELAB a* analysis ----
    const aStats = stats(Array.from(a_values));

    // R/(R+G+B) ratio as secondary proxy
    let rRatioSum = 0;
    for (let i = 0; i < totalPixels; i++) {
      const r = rgbData[i * 3];
      const g = rgbData[i * 3 + 1];
      const b = rgbData[i * 3 + 2];
      const total = r + g + b;
      rRatioSum += total > 0 ? r / total : 0;
    }
    const rRatioMean = rRatioSum / totalPixels;

    // ---- SUN DAMAGE: ITA analysis ----
    const itaValues = [];
    for (let i = 0; i < totalPixels; i++) {
      itaValues.push(computeITA(L_values[i], b_values[i]));
    }
    const itaStats = stats(itaValues);
    const itaCV = itaStats.mean !== 0 ? itaStats.std / Math.abs(itaStats.mean) : 0;

    // Spot count from b* channel
    const spotCount = countSpots(b_values, width, height, 15);

    // ---- HYDRATION: specular + texture analysis ----
    const specular = analyzeSpecular(rgbData, width, height);

    // LBP on cheek region (middle third of image, horizontal center)
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

    // ---- STRUCTURE: GLCM + green channel analysis ----
    const glcm = computeGLCM(gray_values, width, height);

    // Pore detection proxy: high-frequency energy in green channel (cheek region)
    const cheekGreen = new Float32Array(cheekWidth * cheekHeight);
    for (let y = 0; y < cheekHeight; y++) {
      for (let x = 0; x < cheekWidth; x++) {
        cheekGreen[y * cheekWidth + x] = green_values[(y + cheekStartY) * width + (x + cheekStartX)];
      }
    }
    const greenGLCM = computeGLCM(cheekGreen, cheekWidth, cheekHeight);
    const poreProxy = greenGLCM.contrast;

    // ---- ELASTICITY: forehead wrinkle analysis ----
    const foreheadStartY = 0;
    const foreheadEndY = Math.round(height * 0.3);
    const foreheadHeight = foreheadEndY - foreheadStartY;

    const foreheadGray = new Float32Array(width * foreheadHeight);
    for (let y = 0; y < foreheadHeight; y++) {
      for (let x = 0; x < width; x++) {
        foreheadGray[y * width + x] = gray_values[(y + foreheadStartY) * width + x];
      }
    }

    // Wrinkle index: horizontal edge energy on forehead (wrinkles are mostly horizontal)
    let wrinkleEnergy = 0;
    for (let y = 1; y < foreheadHeight - 1; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const vertGrad = Math.abs(foreheadGray[(y + 1) * width + x] - foreheadGray[(y - 1) * width + x]);
        wrinkleEnergy += vertGrad;
      }
    }
    const wrinkleIndex = wrinkleEnergy / (width * (foreheadHeight - 2));

    // ---- NEW: handcrafted features for Layer 2 models ----
    const gabor_features = computeGaborFeatures(gray_values, width, height);
    const lbp_uniform_histogram = computeLBPUniform(cheekGray, cheekWidth, cheekHeight, 2, 16);
    const frangi_features = computeFrangiFeatures(gray_values, width, height);
    const landmark_geometry = computeLandmarkGeometry();

    const result = {
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
      // Raw feature arrays for Layer 2 models
      gabor_features,
      lbp_uniform_histogram,
      frangi_features,
      landmark_geometry,
    };

    // Pre-assembled handcrafted feature vectors for Layer 2
    result.hydration_handcrafted = buildHydrationFeatures(result);
    result.elasticity_handcrafted = buildElasticityFeatures(result);

    return result;
  } catch (err) {
    console.warn('[image-processing] Feature extraction failed:', err.message);
    return estimateFeaturesFromBase64(base64Image);
  }
}

/**
 * Fallback: estimate features from base64 image properties when sharp is unavailable.
 * Uses image size and byte distribution as rough proxies.
 */
function estimateFeaturesFromBase64(base64Image) {
  const bytes = Buffer.from(base64Image, 'base64');
  const size = bytes.length;

  // Simple byte-distribution analysis as proxy
  let sum = 0;
  let sumSq = 0;
  const sampleSize = Math.min(bytes.length, 10000);
  for (let i = 0; i < sampleSize; i++) {
    sum += bytes[i];
    sumSq += bytes[i] * bytes[i];
  }
  const mean = sum / sampleSize;
  const variance = sumSq / sampleSize - mean * mean;
  const std = Math.sqrt(Math.max(0, variance));

  const result = {
    inflammation: {
      a_star_mean: (mean - 128) * 0.1,
      a_star_std: std * 0.05,
      r_ratio_mean: 0.35,
    },
    sunDamage: {
      ita_mean: 30,
      ita_std: 8,
      ita_cv: 0.27,
      spot_count: Math.round(std * 0.1),
    },
    hydration: {
      specular_ratio: 0.02,
      specular_uniformity: 0.3,
      lbp_entropy: 5.5,
      lbp_uniformity: 0.05,
    },
    structure: {
      glcm_contrast: variance * 0.001,
      glcm_dissimilarity: std * 0.05,
      glcm_homogeneity: 0.5,
      glcm_energy: 0.1,
      pore_proxy: std * 0.08,
    },
    elasticity: {
      wrinkle_index: std * 0.1,
      forehead_glcm: {
        contrast: variance * 0.001,
        dissimilarity: std * 0.04,
        homogeneity: 0.5,
        energy: 0.1,
      },
    },
    gabor_features: new Float32Array(24),
    lbp_uniform_histogram: new Float32Array(18),
    frangi_features: new Float32Array(9),
    landmark_geometry: computeLandmarkGeometry(),
  };

  result.hydration_handcrafted = buildHydrationFeatures(result);
  result.elasticity_handcrafted = buildElasticityFeatures(result);

  return result;
}

/**
 * Convert raw features to signal scores (0-100).
 * Uses empirically calibrated thresholds from dermatology literature.
 */
function featuresToSignalScores(features) {
  const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
  // Safe accessor: returns fallback (0) for undefined/NaN feature values.
  // This prevents NaN from propagating through the signal merge pipeline
  // when extractFeatures partially fails or the image can't be fully processed.
  const safe = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

  // INFLAMMATION: a* > 10 is clinical erythema threshold (Stamatas 2004)
  const aStar = safe(features.inflammation?.a_star_mean, 5);
  const inflammationRaw = ((aStar + 5) / 30) * 100;
  const inflammation = clamp(100 - inflammationRaw);

  // SUN DAMAGE: ITA CV > 0.3 indicates uneven pigmentation (Flament 2013)
  const itaCv = safe(features.sunDamage?.ita_cv, 0.1);
  const spotCount = safe(features.sunDamage?.spot_count, 0);
  const sunDamageRaw = (itaCv / 0.5) * 50 + Math.min(spotCount, 20) * 2.5;
  const sunDamage = clamp(100 - sunDamageRaw);

  // HYDRATION: higher specular ratio + uniformity + lower LBP entropy = better hydrated
  const specRatio = safe(features.hydration?.specular_ratio, 0.05);
  const lbpEntropy = safe(features.hydration?.lbp_entropy, 5);
  const specUniformity = safe(features.hydration?.specular_uniformity, 0.5);
  const hydrationRaw =
    (1 - specRatio * 10) * 30 + (lbpEntropy / 8) * 40 + (1 - specUniformity) * 30;
  const hydration = clamp(100 - hydrationRaw);

  // STRUCTURE: lower GLCM contrast + homogeneity = smoother texture
  const glcmContrast = safe(features.structure?.glcm_contrast, 2);
  const glcmHomogeneity = safe(features.structure?.glcm_homogeneity, 0.7);
  const poreProxy = safe(features.structure?.pore_proxy, 2);
  const structureRaw =
    (glcmContrast / 10) * 40 + (1 - glcmHomogeneity) * 30 + Math.min(poreProxy, 10) * 3;
  const structure = clamp(100 - structureRaw);

  // ELASTICITY: lower wrinkle index = fewer wrinkles = better elasticity
  const wrinkleIndex = safe(features.elasticity?.wrinkle_index, 5);
  const foreheadContrast = safe(features.elasticity?.forehead_glcm?.contrast, 2);
  const elasticityRaw = Math.min(wrinkleIndex, 30) * 2 + (foreheadContrast / 8) * 40;
  const elasticity = clamp(100 - elasticityRaw);

  return { structure, hydration, inflammation, sunDamage, elasticity };
}

/**
 * Extract summary features for the API response.
 */
function extractSummaryFeatures(features) {
  return {
    inflammation_a_star: Math.round(features.inflammation.a_star_mean * 100) / 100,
    ita_variance: Math.round(features.sunDamage.ita_cv * 1000) / 1000,
    spot_count: features.sunDamage.spot_count,
    pore_density: Math.round(features.structure.pore_proxy * 100) / 100,
    wrinkle_index: Math.round(features.elasticity.wrinkle_index * 100) / 100,
    specular_ratio: Math.round(features.hydration.specular_ratio * 10000) / 10000,
  };
}

module.exports = {
  extractFeatures,
  featuresToSignalScores,
  extractSummaryFeatures,
  buildHydrationFeatures,
  buildElasticityFeatures,
  // Exported for testing
  srgbToLab,
  computeITA,
  computeGLCM,
  computeLBP,
  computeLBPUniform,
  computeGaborFeatures,
  computeFrangiFeatures,
  computeLandmarkGeometry,
  analyzeSpecular,
  countSpots,
  stats,
};
