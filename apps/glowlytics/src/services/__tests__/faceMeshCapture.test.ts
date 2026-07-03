jest.mock('../../../modules/expo-arkit-face', () => ({
  isSupported: jest.fn(),
  startTracking: jest.fn(),
  stopTracking: jest.fn(),
  captureFrame: jest.fn(),
}));

import * as arkitFace from '../../../modules/expo-arkit-face';
import { captureFaceMesh, isArkitAvailable } from '../faceMeshCapture';
import {
  buildCanonicalMesh,
  captureCanonicalMesh,
  deformCanonicalMesh,
} from '../canonicalFaceMesh';

const arkit = arkitFace as jest.Mocked<typeof arkitFace>;

beforeEach(() => {
  arkit.isSupported.mockReset();
  arkit.startTracking.mockReset().mockResolvedValue();
  arkit.stopTracking.mockReset().mockResolvedValue();
  arkit.captureFrame.mockReset();
});

describe('canonical face mesh', () => {
  test('buildCanonicalMesh has well-known landmarks at expected indices', () => {
    const m = buildCanonicalMesh();
    // pronasale at index 1 — midline (x=0), projects strongly forward in Z
    expect(m[1 * 3]).toBe(0);
    expect(m[1 * 3 + 2]).toBeGreaterThan(40);
    // pronasale Y sits between glabella and subnasale on the sagittal plane
    expect(m[1 * 3 + 1]).toBeLessThan(m[9 * 3 + 1]);  // < glabella.y
    expect(m[1 * 3 + 1]).toBeGreaterThan(m[2 * 3 + 1]); // > subnasale.y
    // Index 234 — lateral face point (MediaPipe topology): realistic head
    // half-width in mm, mirrored against 454 (sign is a topology convention,
    // not an anatomy label — assert magnitude + mirror instead of sign).
    expect(Math.abs(m[234 * 3])).toBeGreaterThan(55);
    expect(Math.abs(m[234 * 3])).toBeLessThan(95);
    expect(m[454 * 3]).toBeCloseTo(-m[234 * 3], 5);
    // menton at index 152 — chin tip, at the bottom of the face
    expect(m[152 * 3 + 1]).toBeLessThanOrEqual(-50);
  });

  test('canonical mesh is mirror-symmetric on the X axis', () => {
    const m = buildCanonicalMesh();
    // Picked pairs that the spec says must mirror
    const PAIRS: Array<[number, number]> = [
      [133, 362], [33, 263], [159, 386], [145, 374], [468, 473],
      [105, 334], [55, 285], [49, 279], [234, 454], [127, 356],
      [172, 397], [61, 291],
    ];
    for (const [l, r] of PAIRS) {
      expect(m[l * 3]).toBeCloseTo(-m[r * 3], 5);     // x mirrored
      expect(m[l * 3 + 1]).toBeCloseTo(m[r * 3 + 1], 5); // y matches
      expect(m[l * 3 + 2]).toBeCloseTo(m[r * 3 + 2], 5); // z matches
    }
  });

  test('captureCanonicalMesh wraps the mesh with source canonical', () => {
    const c = captureCanonicalMesh();
    expect(c.source).toBe('canonical');
    expect(c.vertices.length).toBeGreaterThan(0);
    expect(c.vertices.length % 3).toBe(0);
  });

  test('deformCanonicalMesh shifts vertices according to traits', () => {
    const c = captureCanonicalMesh();
    const widened = deformCanonicalMesh({ jawWidth: 1.0 });
    const baseGonionX = c.vertices[172 * 3];
    const widenedGonionX = widened.vertices[172 * 3];
    expect(Math.abs(widenedGonionX)).toBeGreaterThan(Math.abs(baseGonionX));
  });

  test('deformCanonicalMesh respects canthal tilt', () => {
    const tiltUp = deformCanonicalMesh({ canthalTilt: 1.0 });
    const tiltDown = deformCanonicalMesh({ canthalTilt: 0.0 });
    expect(tiltUp.vertices[33 * 3 + 1]).toBeGreaterThan(tiltDown.vertices[33 * 3 + 1]);
  });
});

describe('captureFaceMesh', () => {
  test('returns canonical mesh when ARKit not supported', async () => {
    arkit.isSupported.mockResolvedValue(false);
    const result = await captureFaceMesh();
    expect(result.isHighFidelity).toBe(false);
    expect(result.mode).toBe('canonical');
    expect(result.mesh.source).toBe('canonical');
    expect(arkit.startTracking).not.toHaveBeenCalled();
  });

  test('returns ARKit mesh when supported and frame is available', async () => {
    arkit.isSupported.mockResolvedValue(true);
    arkit.captureFrame.mockResolvedValue({
      vertices: [0, 0, 0, 1, 1, 1],
      indices: [],
      blendShapes: { jawOpen: 0.2 },
      timestamp: 1_700_000_000_000,
    });
    const result = await captureFaceMesh();
    expect(result.isHighFidelity).toBe(true);
    expect(result.mode).toBe('arkit');
    expect(result.mesh.source).toBe('arkit');
    expect(arkit.startTracking).toHaveBeenCalled();
    expect(arkit.stopTracking).toHaveBeenCalled();
  });

  test('falls back to canonical mesh if ARKit returns null repeatedly', async () => {
    arkit.isSupported.mockResolvedValue(true);
    arkit.captureFrame.mockResolvedValue(null);
    const result = await captureFaceMesh();
    expect(result.isHighFidelity).toBe(false);
    expect(result.mode).toBe('canonical');
  }, 10_000);

  test('passes traits through to canonical mesh deformation', async () => {
    arkit.isSupported.mockResolvedValue(false);
    const wide = await captureFaceMesh({ traits: { jawWidth: 1.0 } });
    const narrow = await captureFaceMesh({ traits: { jawWidth: 0.0 } });
    expect(Math.abs(wide.mesh.vertices[172 * 3])).toBeGreaterThan(Math.abs(narrow.mesh.vertices[172 * 3]));
  });
});

describe('isArkitAvailable', () => {
  test('returns the native module response', async () => {
    arkit.isSupported.mockResolvedValue(true);
    expect(await isArkitAvailable()).toBe(true);
    arkit.isSupported.mockResolvedValue(false);
    expect(await isArkitAvailable()).toBe(false);
  });
});
