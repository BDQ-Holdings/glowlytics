import { generateDefaultIndices } from '../mockScanner';

describe('generateDefaultIndices', () => {
  it('returns valid index values without baseline', () => {
    const reading = generateDefaultIndices();
    expect(reading.inflammation_index).toBeGreaterThanOrEqual(0);
    expect(reading.inflammation_index).toBeLessThanOrEqual(100);
    expect(reading.pigmentation_index).toBeGreaterThanOrEqual(0);
    expect(reading.pigmentation_index).toBeLessThanOrEqual(100);
    expect(reading.texture_index).toBeGreaterThanOrEqual(0);
    expect(reading.texture_index).toBeLessThanOrEqual(100);
  });

  it('returns values within baseline variance range', () => {
    const baseline = {
      inflammation_index: 50,
      pigmentation_index: 40,
      texture_index: 45,
    };
    const reading = generateDefaultIndices(baseline);
    expect(reading.inflammation_index).toBeGreaterThanOrEqual(0);
    expect(reading.inflammation_index).toBeLessThanOrEqual(100);
    expect(reading.pigmentation_index).toBeGreaterThanOrEqual(0);
    expect(reading.pigmentation_index).toBeLessThanOrEqual(100);
    expect(reading.texture_index).toBeGreaterThanOrEqual(0);
    expect(reading.texture_index).toBeLessThanOrEqual(100);
  });

  it('daily readings cluster around baseline', () => {
    const baseline = {
      inflammation_index: 50,
      pigmentation_index: 40,
      texture_index: 45,
    };
    const readings = Array.from({ length: 20 }, () => generateDefaultIndices(baseline));
    const avgInflammation =
      readings.reduce((s, r) => s + r.inflammation_index, 0) / readings.length;
    expect(Math.abs(avgInflammation - baseline.inflammation_index)).toBeLessThan(12);
  });

  // ──────────── Seeded determinism ────────────

  it('produces identical results with same seed', () => {
    const baseline = { inflammation_index: 50, pigmentation_index: 40, texture_index: 45 };
    const r1 = generateDefaultIndices(baseline, 42);
    const r2 = generateDefaultIndices(baseline, 42);
    expect(r1.inflammation_index).toBe(r2.inflammation_index);
    expect(r1.pigmentation_index).toBe(r2.pigmentation_index);
    expect(r1.texture_index).toBe(r2.texture_index);
  });

  it('produces different results with different seeds', () => {
    const baseline = { inflammation_index: 50, pigmentation_index: 40, texture_index: 45 };
    const r1 = generateDefaultIndices(baseline, 1);
    const r2 = generateDefaultIndices(baseline, 999);
    const allEqual =
      r1.inflammation_index === r2.inflammation_index &&
      r1.pigmentation_index === r2.pigmentation_index &&
      r1.texture_index === r2.texture_index;
    expect(allEqual).toBe(false);
  });

  it('produces deterministic baseline readings with seed', () => {
    const r1 = generateDefaultIndices(undefined, 123);
    const r2 = generateDefaultIndices(undefined, 123);
    expect(r1.inflammation_index).toBe(r2.inflammation_index);
    expect(r1.pigmentation_index).toBe(r2.pigmentation_index);
    expect(r1.texture_index).toBe(r2.texture_index);
  });
});
