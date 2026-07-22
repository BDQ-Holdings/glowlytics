/**
 * useTrueDepthSupported — TrueDepth / Face ID capability probe.
 *
 * The hook wraps `isArkitAvailable()` (which resolves `false` when the native
 * module is unlinked — Expo Go / Android / Jest). We drive it through a mock so
 * the test never touches the native module, and reset the module registry
 * between cases to clear the hook's module-level cache.
 *
 * `react` is pinned to a single instance (the mock below), so `resetModules`
 * refreshes only the hook's cache while the hook and the RNTL renderer keep
 * sharing one React copy — avoiding the "invalid hook call" / duplicate-React trap.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

// Pin `react` to a single instance. Memoized on `globalThis` (which survives
// `resetModules`) and captured lazily *inside* the factory, so React is set the
// first time it is required — before RNTL / react-test-renderer read React's
// internals — and returned unchanged on every later require, including after
// each `resetModules`. This keeps the hook and the RNTL renderer on one React
// copy, avoiding the "invalid hook call" / duplicate-React trap.
jest.mock('react', () => {
  const store = globalThis as { __pinnedReact?: unknown };
  if (!store.__pinnedReact) store.__pinnedReact = jest.requireActual('react');
  return store.__pinnedReact;
});

const mockIsArkitAvailable: jest.Mock<Promise<boolean>, []> = jest.fn();

jest.mock('../../services/faceMeshCapture', () => ({
  isArkitAvailable: () => mockIsArkitAvailable(),
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function loadHook(): () => boolean {
  const { useTrueDepthSupported } = require('../useTrueDepthSupported') as {
    useTrueDepthSupported: () => boolean;
  };
  return useTrueDepthSupported;
}

beforeEach(() => {
  jest.resetModules();
  mockIsArkitAvailable.mockReset();
});

describe('useTrueDepthSupported', () => {
  it('returns false on first render and flips to true once the probe resolves true', async () => {
    const probe = deferred<boolean>();
    mockIsArkitAvailable.mockReturnValue(probe.promise);
    const useTrueDepthSupported = loadHook();

    const { result } = renderHook(() => useTrueDepthSupported());
    // Cold cache → false synchronously, before the async probe settles.
    expect(result.current).toBe(false);

    probe.resolve(true);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('caches the result at module level so a second mount resolves synchronously without re-probing', async () => {
    mockIsArkitAvailable.mockResolvedValue(true);
    const useTrueDepthSupported = loadHook();

    const first = renderHook(() => useTrueDepthSupported());
    await waitFor(() => expect(first.result.current).toBe(true));
    expect(mockIsArkitAvailable).toHaveBeenCalledTimes(1);

    // Second mount reads the warm cache: true on the very first render, and
    // the native module is never probed again.
    const second = renderHook(() => useTrueDepthSupported());
    expect(second.result.current).toBe(true);
    expect(mockIsArkitAvailable).toHaveBeenCalledTimes(1);
  });

  it('stays false when the probe rejects', async () => {
    mockIsArkitAvailable.mockRejectedValue(new Error('native module unlinked'));
    const useTrueDepthSupported = loadHook();

    const { result } = renderHook(() => useTrueDepthSupported());
    expect(result.current).toBe(false);

    await waitFor(() => expect(mockIsArkitAvailable).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(result.current).toBe(false);
  });

  it('stays false when the probe resolves false (non-TrueDepth device)', async () => {
    mockIsArkitAvailable.mockResolvedValue(false);
    const useTrueDepthSupported = loadHook();

    const { result } = renderHook(() => useTrueDepthSupported());
    await waitFor(() => expect(mockIsArkitAvailable).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(result.current).toBe(false);
  });

  it('does not set state after unmount when the probe resolves late', async () => {
    const probe = deferred<boolean>();
    mockIsArkitAvailable.mockReturnValue(probe.promise);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const useTrueDepthSupported = loadHook();

    const { unmount } = renderHook(() => useTrueDepthSupported());
    unmount();

    await act(async () => {
      probe.resolve(true);
      await probe.promise;
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
