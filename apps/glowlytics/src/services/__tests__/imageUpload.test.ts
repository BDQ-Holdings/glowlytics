// Tests for `compressImageForUpload` — the bounded/compressed image-upload
// helper used by the shopping-advisor photo scan path. Modern phone photos are
// multi-MB; uploading the full-resolution base64 trips the backend's 10MB cap
// (POST /api/products/shopping-scan → 413 "Image too large") and is slow.
//
// The helper resizes+compresses via expo-image-manipulator, but that native
// module can't be loaded under jest-expo (same constraint noted in
// onDeviceImageFeatures.test.ts). So the helper takes injectable deps and these
// tests pass FAKES — the real native module is never touched here.
import {
  compressImageForUpload,
  type ManipulateResult,
  type ManipulateSaveOptions,
  type ResizeAction,
} from '../imageUpload';

const INPUT = 'file://input.jpg';

describe('compressImageForUpload', () => {
  it('resizes & compresses via the injected manipulator and returns its base64', async () => {
    const manipulate = jest.fn(
      async (
        _uri: string,
        _actions: ResizeAction[],
        _saveOpts: ManipulateSaveOptions,
      ): Promise<ManipulateResult> => ({ uri: 'file://tmp.jpg', base64: 'COMPRESSED' }),
    );
    const readRawBase64 = jest.fn(async (): Promise<string> => 'RAW');
    const deleteFile = jest.fn(async (): Promise<void> => {});

    const result = await compressImageForUpload(INPUT, undefined, {
      manipulate,
      readRawBase64,
      deleteFile,
    });

    expect(result).toBe('COMPRESSED');
    expect(manipulate).toHaveBeenCalledTimes(1);
    const [uriArg, actions, saveOpts] = manipulate.mock.calls[0];
    expect(uriArg).toBe(INPUT);
    expect(actions).toEqual([{ resize: { width: 1024 } }]);
    expect(saveOpts).toEqual({ format: 'jpeg', base64: true, compress: 0.8 });
    expect(readRawBase64).not.toHaveBeenCalled();
  });

  it('falls back to raw base64 when the manipulator throws (graceful, no throw)', async () => {
    const manipulate = jest.fn(
      async (
        _uri: string,
        _actions: ResizeAction[],
        _saveOpts: ManipulateSaveOptions,
      ): Promise<ManipulateResult> => {
        throw new Error('manipulation failed');
      },
    );
    const readRawBase64 = jest.fn(async (): Promise<string> => 'RAW');
    const deleteFile = jest.fn(async (): Promise<void> => {});

    await expect(
      compressImageForUpload(INPUT, undefined, { manipulate, readRawBase64, deleteFile }),
    ).resolves.toBe('RAW');
    expect(readRawBase64).toHaveBeenCalledWith(INPUT);
  });

  it('falls back to raw base64 when the manipulator returns no base64', async () => {
    const manipulate = jest.fn(
      async (
        _uri: string,
        _actions: ResizeAction[],
        _saveOpts: ManipulateSaveOptions,
      ): Promise<ManipulateResult> => ({ uri: 'file://tmp.jpg', base64: undefined }),
    );
    const readRawBase64 = jest.fn(async (): Promise<string> => 'RAW');
    const deleteFile = jest.fn(async (): Promise<void> => {});

    const result = await compressImageForUpload(INPUT, undefined, {
      manipulate,
      readRawBase64,
      deleteFile,
    });

    expect(result).toBe('RAW');
  });

  it('cleans up the temp file even when base64 is empty and it falls back to raw', async () => {
    const manipulate = jest.fn(
      async (
        _uri: string,
        _actions: ResizeAction[],
        _saveOpts: ManipulateSaveOptions,
      ): Promise<ManipulateResult> => ({ uri: 'file://tmp.jpg', base64: undefined }),
    );
    const readRawBase64 = jest.fn(async (): Promise<string> => 'RAW');
    const deleteFile = jest.fn(async (): Promise<void> => {});

    const result = await compressImageForUpload(INPUT, undefined, {
      manipulate,
      readRawBase64,
      deleteFile,
    });

    expect(result).toBe('RAW');
    expect(readRawBase64).toHaveBeenCalledWith(INPUT);
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(deleteFile).toHaveBeenCalledWith('file://tmp.jpg');
  });

  it('deletes the temp file when it differs from the input, but not when it matches', async () => {
    const readRawBase64 = jest.fn(async (): Promise<string> => 'RAW');

    // temp uri differs from input -> cleanup
    const deleteDiff = jest.fn(async (): Promise<void> => {});
    await compressImageForUpload(INPUT, undefined, {
      manipulate: jest.fn(
        async (): Promise<ManipulateResult> => ({ uri: 'file://tmp.jpg', base64: 'COMPRESSED' }),
      ),
      readRawBase64,
      deleteFile: deleteDiff,
    });
    expect(deleteDiff).toHaveBeenCalledTimes(1);
    expect(deleteDiff).toHaveBeenCalledWith('file://tmp.jpg');

    // temp uri === input uri -> no cleanup
    const deleteSame = jest.fn(async (): Promise<void> => {});
    await compressImageForUpload(INPUT, undefined, {
      manipulate: jest.fn(
        async (): Promise<ManipulateResult> => ({ uri: INPUT, base64: 'COMPRESSED' }),
      ),
      readRawBase64,
      deleteFile: deleteSame,
    });
    expect(deleteSame).not.toHaveBeenCalled();
  });

  it('forwards custom maxWidth and quality into the manipulator call', async () => {
    const manipulate = jest.fn(
      async (
        _uri: string,
        _actions: ResizeAction[],
        _saveOpts: ManipulateSaveOptions,
      ): Promise<ManipulateResult> => ({ uri: 'file://tmp.jpg', base64: 'COMPRESSED' }),
    );

    await compressImageForUpload(
      INPUT,
      { maxWidth: 640, quality: 0.6 },
      { manipulate, readRawBase64: jest.fn(async (): Promise<string> => 'RAW'), deleteFile: jest.fn(async (): Promise<void> => {}) },
    );

    const [, actions, saveOpts] = manipulate.mock.calls[0];
    expect(actions).toEqual([{ resize: { width: 640 } }]);
    expect(saveOpts).toEqual({ format: 'jpeg', base64: true, compress: 0.6 });
  });
});
