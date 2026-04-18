// Default indices generator (fallback when Vision API unavailable)
export interface ScannerReading {
  inflammation_index: number;
  pigmentation_index: number;
  texture_index: number;
}

/**
 * Mulberry32 -- a simple 32-bit seeded PRNG.
 *
 * Returns a function that produces the next pseudo-random float in [0, 1)
 * each time it is called. The sequence is fully deterministic for a given
 * seed, which makes scanner readings reproducible in tests.
 *
 * Reference: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 */
const mulberry32 = (seed: number): (() => number) => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Returns a random float between min and max, rounded to 2 decimal places.
 * Uses the provided `rand` function (seeded or Math.random).
 */
const randomBetween = (min: number, max: number, rand: () => number = Math.random) =>
  Math.round((rand() * (max - min) + min) * 100) / 100;

/**
 * Generate default scanner indices (fallback when Vision API is unavailable).
 *
 * @param baselineValues - If provided, daily readings vary slightly from this baseline.
 *                         If omitted, generates a fresh baseline reading.
 * @param seed           - Optional numeric seed for the PRNG. When provided, the
 *                         returned reading is fully deterministic (same seed + same
 *                         baseline = same output every time). When omitted, falls
 *                         back to Math.random() for non-deterministic behavior.
 */
export const generateDefaultIndices = (baselineValues?: ScannerReading, seed?: number): ScannerReading => {
  const rand = seed != null ? mulberry32(seed) : Math.random;

  if (baselineValues) {
    // Daily scan: small variation from baseline
    return {
      inflammation_index: Math.max(0, Math.min(100,
        baselineValues.inflammation_index + randomBetween(-8, 8, rand))),
      pigmentation_index: Math.max(0, Math.min(100,
        baselineValues.pigmentation_index + randomBetween(-5, 5, rand))),
      texture_index: Math.max(0, Math.min(100,
        baselineValues.texture_index + randomBetween(-6, 6, rand))),
    };
  }

  // Baseline scan: random initial values
  return {
    inflammation_index: randomBetween(20, 65, rand),
    pigmentation_index: randomBetween(15, 55, rand),
    texture_index: randomBetween(25, 60, rand),
  };
};
