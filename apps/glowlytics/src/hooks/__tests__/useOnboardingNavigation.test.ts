import { renderHook } from '@testing-library/react-native';

// Route + navigation seam. The hook derives the CURRENT screen from the route
// (usePathname) rather than the stored positional index, so both must be mocked.
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSetOnboardingFlowIndex = jest.fn();

let mockPathname: string;
let mockState: {
  onboardingFlow: string[];
  onboardingFlowIndex: number;
  setOnboardingFlowIndex: jest.Mock;
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  usePathname: () => mockPathname,
}));

jest.mock('../../store/useStore', () => {
  const useStore = (selector: (state: typeof mockState) => unknown) => selector(mockState);
  useStore.getState = () => mockState;
  return { useStore };
});

import { useOnboardingNavigation } from '../useOnboardingNavigation';

// The current (post-upgrade) 13-item default flow.
const NEW_FLOW = [
  'welcome',
  'how-it-works',
  'name',
  'age-range',
  'sex',
  'skin-goal',
  'products',
  'privacy',
  'health-permission',
  'scan-reminder',
  'preview',
  'paywall',
  'done',
];

// A shorter flow shape persisted by a previous app version.
const OLD_FLOW = [
  'welcome',
  'age-range',
  'sex',
  'skin-goal',
  'health-permission',
  'scan-reminder',
  'preview',
  'paywall',
];

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/onboarding/welcome';
  mockState = {
    onboardingFlow: [...NEW_FLOW],
    onboardingFlowIndex: 0,
    setOnboardingFlowIndex: mockSetOnboardingFlowIndex,
  };
});

describe('useOnboardingNavigation — name-based navigation', () => {
  it('1. stale-flow upgrade: after a rebuild, advance() steps by NAME from the current route, not the stale persisted index', () => {
    // The caller (sex.tsx) has already rebuilt the store to the NEW flow, but the
    // persisted index (2) still points at the OLD flow's position for 'sex'.
    mockState.onboardingFlow = [...NEW_FLOW];
    mockState.onboardingFlowIndex = OLD_FLOW.indexOf('sex'); // 2
    mockPathname = '/onboarding/sex';

    const { result } = renderHook(() => useOnboardingNavigation());
    result.current.advance();

    expect(mockPush).toHaveBeenCalledWith('/onboarding/skin-goal');
    expect(mockPush).not.toHaveBeenCalledWith('/onboarding/age-range');
  });

  it('2. swipe-back drift: advance() uses the route, not the stored index, and writes indexOf(target)', () => {
    // User swiped back to age-range; the router popped but the stored index (4)
    // was never decremented.
    mockState.onboardingFlow = [...NEW_FLOW];
    mockState.onboardingFlowIndex = 4;
    mockPathname = '/onboarding/age-range';

    const { result } = renderHook(() => useOnboardingNavigation());
    result.current.advance();

    expect(mockPush).toHaveBeenCalledWith('/onboarding/sex');
    expect(mockSetOnboardingFlowIndex).toHaveBeenCalledWith(NEW_FLOW.indexOf('sex')); // 4
  });

  it('3. advance() at the flow end is a no-op regardless of the stored index', () => {
    mockState.onboardingFlow = [...NEW_FLOW];
    mockState.onboardingFlowIndex = 5; // stale/mid — old positional code would still advance
    mockPathname = '/onboarding/done';

    const { result } = renderHook(() => useOnboardingNavigation());
    result.current.advance();

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSetOnboardingFlowIndex).not.toHaveBeenCalled();
  });

  it('4a. goBack() at the flow start is a no-op even when the stored index drifted forward', () => {
    mockState.onboardingFlow = [...NEW_FLOW];
    mockState.onboardingFlowIndex = 3; // drifted
    mockPathname = '/onboarding/welcome'; // indexOf === 0

    const { result } = renderHook(() => useOnboardingNavigation());
    result.current.goBack();

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockSetOnboardingFlowIndex).not.toHaveBeenCalled();
  });

  it('4b. goBack() mid-flow calls router.back() once and writes indexOf(current) - 1', () => {
    mockState.onboardingFlow = [...NEW_FLOW];
    mockState.onboardingFlowIndex = 7; // drifted
    mockPathname = '/onboarding/sex'; // indexOf === 4

    const { result } = renderHook(() => useOnboardingNavigation());
    result.current.goBack();

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockSetOnboardingFlowIndex).toHaveBeenCalledWith(NEW_FLOW.indexOf('sex') - 1); // 3
  });

  it('5. derived onboardingFlowIndex equals flow.indexOf(currentRouteScreen) even when the stored index disagrees', () => {
    mockState.onboardingFlow = [...NEW_FLOW];
    mockState.onboardingFlowIndex = 99; // wildly wrong persisted value
    mockPathname = '/onboarding/skin-goal';

    const { result } = renderHook(() => useOnboardingNavigation());

    expect(result.current.onboardingFlowIndex).toBe(NEW_FLOW.indexOf('skin-goal')); // 5
  });

  it('6. self-heal: when the current route is NOT in the flow, advance() steps FORWARD from the stored index and never re-lands on an earlier screen', () => {
    // 'location' is a valid screen name but never part of the built flow — it
    // stands in for a renamed / removed screen persisted mid-run.
    mockState.onboardingFlow = [...NEW_FLOW];
    mockState.onboardingFlowIndex = 4; // last known progress
    mockPathname = '/onboarding/location';

    const { result } = renderHook(() => useOnboardingNavigation());
    result.current.advance();

    // Forward from the stored index (4 → 5), never back to welcome/how-it-works.
    expect(mockPush).toHaveBeenCalledWith('/onboarding/skin-goal');
    expect(mockPush).not.toHaveBeenCalledWith('/onboarding/welcome');
    expect(mockSetOnboardingFlowIndex).toHaveBeenCalledWith(5);
  });
});

describe('useOnboardingNavigation — double-tap + route-sync guards', () => {
  it('A1. two advance() calls on an unchanged route push exactly once', () => {
    mockState.onboardingFlow = [...NEW_FLOW];
    mockState.onboardingFlowIndex = 3;
    mockPathname = '/onboarding/age-range';

    const { result } = renderHook(() => useOnboardingNavigation());
    result.current.advance();
    result.current.advance();

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/onboarding/sex');
  });

  it('A2. advance() is re-armed after the route changes and pushes the next target', () => {
    mockState.onboardingFlow = [...NEW_FLOW];
    mockState.onboardingFlowIndex = 3;
    mockPathname = '/onboarding/age-range';

    const { result, rerender } = renderHook(() => useOnboardingNavigation());
    result.current.advance();
    expect(mockPush).toHaveBeenLastCalledWith('/onboarding/sex');

    // Router settled on the pushed route; the in-flight guard clears.
    mockPathname = '/onboarding/sex';
    rerender(undefined);

    result.current.advance();
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenLastCalledWith('/onboarding/skin-goal');
  });

  it('A3. two goBack() calls on an unchanged route pop exactly once', () => {
    mockState.onboardingFlow = [...NEW_FLOW];
    mockState.onboardingFlowIndex = 4;
    mockPathname = '/onboarding/sex';

    const { result } = renderHook(() => useOnboardingNavigation());
    result.current.goBack();
    result.current.goBack();

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('C. the route-sync effect heals the stored index on a route change, but never on first mount', () => {
    mockState.onboardingFlow = [...NEW_FLOW];
    mockState.onboardingFlowIndex = 7; // drifted, disagrees with the initial route
    mockPathname = '/onboarding/sex';

    const { rerender } = renderHook(() => useOnboardingNavigation());
    // Cold resume: AuthRedirector already routed to the stored index — the hook
    // must not rewrite it on mount.
    expect(mockSetOnboardingFlowIndex).not.toHaveBeenCalled();

    // iOS swipe-back pops to age-range without decrementing the stored index.
    mockPathname = '/onboarding/age-range';
    rerender(undefined);

    expect(mockSetOnboardingFlowIndex).toHaveBeenCalledWith(NEW_FLOW.indexOf('age-range')); // 3
  });
});
