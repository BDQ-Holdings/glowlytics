import {
  buildCanonicalMesh,
  CANONICAL_LANDMARKS,
  CANONICAL_OUTLINE_EDGES,
  CANONICAL_TRIANGLES,
} from '../canonicalFaceMesh';

function populatedCount(mesh: number[]): number {
  let n = 0;
  for (let i = 0; i * 3 < mesh.length; i++) {
    const o = i * 3;
    if (mesh[o] !== 0 || mesh[o + 1] !== 0 || mesh[o + 2] !== 0) n++;
  }
  return n;
}

function vertexIsPopulated(mesh: number[], idx: number): boolean {
  const o = idx * 3;
  return mesh[o] !== 0 || mesh[o + 1] !== 0 || mesh[o + 2] !== 0;
}

describe('canonical mesh — MediaPipe canonical human geometry', () => {
  test('populates the real 468-landmark face plus synthesized iris centers', () => {
    expect(populatedCount(buildCanonicalMesh())).toBeGreaterThanOrEqual(468);
  });

  test('exposes every named landmark on a non-zero vertex slot', () => {
    const mesh = buildCanonicalMesh();
    for (const [name, idx] of Object.entries(CANONICAL_LANDMARKS)) {
      expect(name.length).toBeGreaterThan(0);
      expect(vertexIsPopulated(mesh, idx)).toBe(true);
    }
  });

  test('keeps named left/right landmarks X-mirrored', () => {
    const m = buildCanonicalMesh();
    const PAIRS: Array<[number, number]> = [
      [133, 362], [33, 263], [159, 386], [145, 374], [468, 473],
      [105, 334], [55, 285], [49, 279], [234, 454], [127, 356],
      [172, 397], [61, 291], [21, 251], [54, 284], [37, 267],
      [40, 270], [91, 321], [149, 378], [176, 400], [171, 396],
    ];
    for (const [l, r] of PAIRS) {
      expect(m[l * 3]).toBeCloseTo(-m[r * 3], 1);
      expect(m[l * 3 + 1]).toBeCloseTo(m[r * 3 + 1], 1);
      expect(m[l * 3 + 2]).toBeCloseTo(m[r * 3 + 2], 1);
    }
  });

  test('outline edges reference populated vertices and contain no duplicate entries', () => {
    const mesh = buildCanonicalMesh();
    const seen = new Set<string>();
    for (const [a, b] of CANONICAL_OUTLINE_EDGES) {
      expect(vertexIsPopulated(mesh, a)).toBe(true);
      expect(vertexIsPopulated(mesh, b)).toBe(true);
      const key = `${a}:${b}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test('real triangle topology has consistent directed-edge winding', () => {
    const seenDirectedEdges = new Set<string>();
    for (const [a, b, c] of CANONICAL_TRIANGLES) {
      for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
        const key = `${u}:${v}`;
        expect(seenDirectedEdges.has(key)).toBe(false);
        seenDirectedEdges.add(key);
      }
    }
  });
});
