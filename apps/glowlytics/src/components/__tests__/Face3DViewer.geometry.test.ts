import {
  bucketFrontFacingTriangles,
  normalizeMeshToTargetRadius,
  projectVertex,
  revealedVertexIndices,
  type Vec3,
} from '../Face3DViewer';
import { buildCanonicalMesh } from '../../services/canonicalFaceMesh';

function projectedExtents(vertices: number[], size = 320): { width: number; height: number } {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i * 3 + 2 < vertices.length; i++) {
    const o = i * 3;
    const v: Vec3 = { x: vertices[o], y: vertices[o + 1], z: vertices[o + 2] };
    if (v.x === 0 && v.y === 0 && v.z === 0) continue;
    points.push(projectVertex(v, 0, 0, 220, 45, size));
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

describe('Face3DViewer geometry helpers', () => {
  test('auto-fit projects metre-scale and millimetre-scale meshes to the same extents', () => {
    const mm = buildCanonicalMesh();
    const metres = mm.map((v) => v / 1000);

    const mmFit = normalizeMeshToTargetRadius(mm, 78).vertices;
    const metreFit = normalizeMeshToTargetRadius(metres, 78).vertices;

    const a = projectedExtents(mmFit);
    const b = projectedExtents(metreFit);

    expect(a.width).toBeGreaterThan(100);
    expect(a.width).toBeCloseTo(b.width, 5);
    expect(a.height).toBeCloseTo(b.height, 5);
  });

  test('projected backface culling keeps only the visible half of a closed sphere-like mesh', () => {
    const octahedron = [
      0, 1, 0,
      1, 0, 0,
      0, -1, 0,
      -1, 0, 0,
      0, 0, 1,
      0, 0, -1,
    ];
    const triangles: ReadonlyArray<readonly [number, number, number]> = [
      [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4],
      [1, 0, 5], [2, 1, 5], [3, 2, 5], [0, 3, 5],
    ];

    const shaded = bucketFrontFacingTriangles({
      vertices: octahedron,
      triangles,
      yaw: 0,
      pitch: 0,
      distance: 8,
      fov: 45,
      size: 200,
      bucketCount: 6,
    });

    expect(shaded.frontFaceCount).toBe(4);
  });

  test('bucketed triangle paths never exceed the configured luminance bucket count', () => {
    const shaded = bucketFrontFacingTriangles({
      vertices: normalizeMeshToTargetRadius(buildCanonicalMesh(), 78).vertices,
      triangles: [[173, 155, 133], [246, 33, 7], [382, 398, 362], [263, 466, 249]],
      yaw: 0.2,
      pitch: -0.1,
      distance: 220,
      fov: 45,
      size: 320,
      bucketCount: 3,
    });

    expect(shaded.runs.length).toBeLessThanOrEqual(3);
  });

  test('half reveal exposes balanced left and right landmark dots', () => {
    const mesh = buildCanonicalMesh();
    const leftRightPairs: Array<[number, number]> = [
      [133, 362], [33, 263], [159, 386], [145, 374], [105, 334], [55, 285],
      [49, 279], [234, 454], [127, 356], [172, 397], [61, 291], [21, 251],
      [54, 284], [37, 267], [40, 270], [91, 321], [149, 378], [176, 400],
      [171, 396],
    ];

    const revealed = revealedVertexIndices(mesh, 0.5);
    let left = 0;
    let right = 0;
    for (const [a, b] of leftRightPairs) {
      if (revealed.has(a)) left++;
      if (revealed.has(b)) right++;
    }

    expect(left).toBe(right);
  });
});
