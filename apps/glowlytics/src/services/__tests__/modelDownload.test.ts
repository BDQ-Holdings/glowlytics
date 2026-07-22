// Tests for the on-demand ONNX model downloader. The models no longer ship in
// the IPA (they were ~62MB of the bundle) — ensureModel resolves a cached
// file by EXACT byte size or downloads it from a revision-pinned URL,
// single-flight per model. expo-file-system can't run under jest-expo, so it
// is mocked wholesale (same constraint noted in imageUpload.test.ts).
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file://doc/',
  getInfoAsync: jest.fn(),
  downloadAsync: jest.fn(),
  moveAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
}));

jest.mock('../analytics', () => ({
  trackEvent: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import { ensureModel, isModelCached, modelPath } from '../modelDownload';
import { trackEvent } from '../analytics';

const ACNE_BYTES = 44_745_921;
const DEST = 'file://doc/models/acne_detector.onnx';
const TMP = `${DEST}.tmp`;

const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const downloadAsync = FileSystem.downloadAsync as jest.Mock;
const moveAsync = FileSystem.moveAsync as jest.Mock;
const deleteAsync = FileSystem.deleteAsync as jest.Mock;
const makeDirectoryAsync = FileSystem.makeDirectoryAsync as jest.Mock;

/** Route getInfoAsync by uri: `sizes[uri]` = reported size, absent = not found. */
function stubFileSizes(sizes: Record<string, number>) {
  getInfoAsync.mockImplementation(async (uri: string) => {
    const size = sizes[uri];
    if (size === undefined) return { exists: false, uri, isDirectory: false };
    return { exists: true, uri, isDirectory: false, size };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  makeDirectoryAsync.mockResolvedValue(undefined);
  deleteAsync.mockResolvedValue(undefined);
  moveAsync.mockResolvedValue(undefined);
});

describe('modelPath', () => {
  it('resolves under the shared documentDirectory models cache', () => {
    expect(modelPath('acne_detector')).toBe(DEST);
  });
});

describe('ensureModel', () => {
  it('returns the cached file without downloading when the exact size matches', async () => {
    stubFileSizes({ [DEST]: ACNE_BYTES });

    const result = await ensureModel('acne_detector');

    expect(result).toBe(DEST);
    expect(downloadAsync).not.toHaveBeenCalled();
  });

  it('re-downloads when the cached file size mismatches', async () => {
    // Dest starts wrong-sized; the freshly downloaded tmp has the exact size.
    stubFileSizes({ [DEST]: 12_345, [TMP]: ACNE_BYTES });
    downloadAsync.mockResolvedValue({ status: 200, uri: TMP });

    const result = await ensureModel('acne_detector');

    expect(result).toBe(DEST);
    expect(downloadAsync).toHaveBeenCalledTimes(1);
    expect(moveAsync).toHaveBeenCalledWith({ from: TMP, to: DEST });
    expect(trackEvent).toHaveBeenCalledWith('model_download_completed', {
      model: 'acne_detector',
      bytes: ACNE_BYTES,
    });
  });

  it('deletes a wrong-sized download and returns null', async () => {
    stubFileSizes({ [TMP]: 999 }); // dest missing, tmp truncated
    downloadAsync.mockResolvedValue({ status: 200, uri: TMP });

    const result = await ensureModel('acne_detector');

    expect(result).toBeNull();
    expect(moveAsync).not.toHaveBeenCalled();
    expect(deleteAsync).toHaveBeenCalledWith(TMP, { idempotent: true });
    expect(trackEvent).toHaveBeenCalledWith(
      'model_download_failed',
      expect.objectContaining({ model: 'acne_detector' }),
    );
  });

  it('returns null on a non-200 download status', async () => {
    stubFileSizes({});
    downloadAsync.mockResolvedValue({ status: 404, uri: TMP });

    const result = await ensureModel('acne_detector');

    expect(result).toBeNull();
    expect(moveAsync).not.toHaveBeenCalled();
  });

  it('shares one download across concurrent callers (single-flight)', async () => {
    stubFileSizes({ [TMP]: ACNE_BYTES }); // dest missing until moved
    let releaseDownload: (value: { status: number; uri: string }) => void = () => {};
    downloadAsync.mockImplementation(
      () =>
        // Executor form required: Promise.withResolvers is unavailable on
        // this runtime baseline (Node 21 jest).
        new Promise<{ status: number; uri: string }>((resolve) => {
          releaseDownload = resolve;
        }),
    );

    const [a, b] = [ensureModel('acne_detector'), ensureModel('acne_detector')];
    // Deterministically flush microtasks so both callers pass the async cache
    // probe and reach the in-flight map — no wall-clock wait involved.
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    releaseDownload({ status: 200, uri: TMP });
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra).toBe(DEST);
    expect(rb).toBe(DEST);
    expect(downloadAsync).toHaveBeenCalledTimes(1);
  });

  it('times out a slow download for the caller without cancelling it', async () => {
    jest.useFakeTimers();
    try {
      stubFileSizes({});
      downloadAsync.mockImplementation(() => new Promise(() => {})); // never settles

      const pending = ensureModel('acne_detector', { timeoutMs: 10 });
      // Flush microtasks so the cache probe completes and the timeout is armed,
      // then advance the fake clock past it — no real wait.
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
      jest.advanceTimersByTime(11);

      await expect(pending).resolves.toBeNull();
      expect(downloadAsync).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('isModelCached', () => {
  it('is true only for an exact-size file', async () => {
    stubFileSizes({ [DEST]: ACNE_BYTES });
    await expect(isModelCached('acne_detector')).resolves.toBe(true);

    stubFileSizes({ [DEST]: ACNE_BYTES - 1 });
    await expect(isModelCached('acne_detector')).resolves.toBe(false);

    stubFileSizes({});
    await expect(isModelCached('acne_detector')).resolves.toBe(false);
  });
});
