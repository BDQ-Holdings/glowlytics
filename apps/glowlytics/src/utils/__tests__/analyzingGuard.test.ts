import { isAnalyzingPipelineStale, shouldArmHydrationBail } from '../analyzingGuard';

describe('isAnalyzingPipelineStale', () => {
  it('allows the continuation while mounted and not aborted', () => {
    expect(isAnalyzingPipelineStale(true, false)).toBe(false);
  });

  it('blocks the continuation after the screen unmounts (user navigated away)', () => {
    // This is the teleport guard: a late API resolution must NOT navigate
    // /scan/results once the screen is gone.
    expect(isAnalyzingPipelineStale(false, false)).toBe(true);
  });

  it('blocks the continuation after the 45s hard-timeout abort', () => {
    // Still mounted (error screen showing) but aborted — late resolution must
    // not hijack the user off the error screen into results.
    expect(isAnalyzingPipelineStale(true, true)).toBe(true);
  });

  it('blocks when both unmounted and aborted', () => {
    expect(isAnalyzingPipelineStale(false, true)).toBe(true);
  });
});

describe('shouldArmHydrationBail', () => {
  it('does NOT arm once the pipeline has started', () => {
    expect(shouldArmHydrationBail(true, true, true)).toBe(false);
    // Even mid-start with missing data, a started pipeline owns the lifecycle.
    expect(shouldArmHydrationBail(true, false, false)).toBe(false);
  });

  it('does NOT arm when both user and protocol are present (normal path)', () => {
    expect(shouldArmHydrationBail(false, true, true)).toBe(false);
  });

  it('arms when the user has not hydrated', () => {
    expect(shouldArmHydrationBail(false, false, false)).toBe(true);
    expect(shouldArmHydrationBail(false, false, true)).toBe(true);
  });

  it('arms when the user is present but protocol is null (the infinite-spinner bug)', () => {
    // The regression that stranded signed-in users with a null protocol.
    expect(shouldArmHydrationBail(false, true, false)).toBe(true);
  });
});
