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
    // pronasale at index 1 → x=0, y=-10, z=22
    expect(m[1 * 3]).toBe(0);
    expect(m[1 * 3 + 1]).toBe(-10);
    expect(m[1 * 3 + 2]).toBe(22);
    // zygion_L at index 234 → x=45
    expect(m[234 * 3]).toBe(45);
  });

  test('captureCanonicalMesh wraps the mesh with source mediapipe', () => {
    const c = captureCanonicalMesh();
    expect(c.source).toBe('mediapipe');
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
    expect(result.mesh.source).toBe('mediapipe');
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
