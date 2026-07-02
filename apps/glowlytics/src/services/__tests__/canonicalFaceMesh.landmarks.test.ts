import { buildCanonicalMesh, FACE_LANDMARK_GROUPS } from '../canonicalFaceMesh';

function populatedCount(mesh: number[]): number {
  let n = 0;
  for (let i = 0; i * 3 < mesh.length; i++) {
    const o = i * 3;
    if (mesh[o] !== 0 || mesh[o + 1] !== 0 || mesh[o + 2] !== 0) n++;
  }
  return n;
}

describe('canonical mesh — fuller marquis-mask geometry', () => {
  test('populates meaningfully more landmark vertices than the old 32', () => {
    expect(populatedCount(buildCanonicalMesh())).toBeGreaterThanOrEqual(48);
  });

  test('exposes the five new landmark regions and each index is populated', () => {
    const mesh = buildCanonicalMesh();
    const groups: Array<keyof typeof FACE_LANDMARK_GROUPS> = [
      'midTemple', 'lipArch', 'lateralVermilion', 'mandibularBorder', 'submental',
    ];
    for (const g of groups) {
      const idxs = FACE_LANDMARK_GROUPS[g];
      expect(idxs.length).toBeGreaterThan(0);
      for (const idx of idxs) {
        const o = idx * 3;
        const set = mesh[o] !== 0 || mesh[o + 1] !== 0 || mesh[o + 2] !== 0;
        expect(set).toBe(true);
      }
    }
  });

  test('new mirror pairs are X-symmetric', () => {
    const m = buildCanonicalMesh();
    const PAIRS: Array<[number, number]> = [
      [21, 251], [54, 284], [37, 267], [40, 270], [91, 321], [149, 378], [176, 400], [171, 396],
    ];
    for (const [l, r] of PAIRS) {
      expect(m[l * 3]).toBeCloseTo(-m[r * 3], 5);
      expect(m[l * 3 + 1]).toBeCloseTo(m[r * 3 + 1], 5);
      expect(m[l * 3 + 2]).toBeCloseTo(m[r * 3 + 2], 5);
    }
  });
});
