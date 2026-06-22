/**
 * Rules-of-hooks regression for the bone-structure story carousel.
 *
 * Bug: the `pages` useMemo sat AFTER the `if (!bone) return <empty/>` early
 * return. When an async attachBoneStructure populated the store while the
 * screen was mounted, the empty → populated transition reached an extra hook
 * and React threw "Rendered more hooks than during the previous render",
 * tripping the AppErrorBoundary (glitch / recovery card). Every hook is now
 * hoisted above the early return, so the hook count is constant across renders.
 *
 * This mounts the screen empty, then re-renders the SAME instance with a
 * populated store and asserts the transition does not throw.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

// `mock`-prefixed so babel-plugin-jest-hoist allows it inside jest.mock factories.
const mockStub = (name: string) => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Component = (props: { children?: unknown }) =>
    ReactLib.createElement(View, { testID: name }, props.children ?? null);
  Component.displayName = name;
  return Component;
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-linear-gradient', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return { LinearGradient: (props: { children?: unknown }) => ReactLib.createElement(View, props, props.children) };
});

jest.mock('react-native-reanimated', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Passthrough = ReactLib.forwardRef((props: { children?: unknown }, ref: unknown) =>
    ReactLib.createElement(View, { ...props, ref }, props.children),
  );
  const chain = { duration: () => chain, delay: () => chain, springify: () => chain };
  return {
    __esModule: true,
    default: { View: Passthrough, ScrollView: Passthrough, Text: Passthrough },
    FadeIn: chain,
    FadeInDown: chain,
    FadeInUp: chain,
    ZoomIn: chain,
    Easing: { inOut: (fn: unknown) => fn, ease: (t: unknown) => t, linear: (t: unknown) => t },
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v,
    withSequence: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v,
    runOnJS: (fn: unknown) => fn,
  };
});

// Heavy children stubbed so the test exercises only the screen's hook ordering,
// not native GL / svg / gesture deps.
jest.mock('../../src/components/Button', () => ({ Button: mockStub('Button') }));
jest.mock('../../src/components/DomainHistoryStrip', () => ({ DomainHistoryStrip: mockStub('DomainHistoryStrip') }));
jest.mock('../../src/components/DomainRadialChart', () => ({ DomainRadialChart: mockStub('DomainRadialChart') }));
jest.mock('../../src/components/Face3DViewer', () => ({ Face3DViewer: mockStub('Face3DViewer') }));
jest.mock('../../src/components/HarmonyIntroOverlay', () => ({ HarmonyIntroOverlay: mockStub('HarmonyIntroOverlay') }));
jest.mock('../../src/components/HarmonyScoreReveal', () => ({ HarmonyScoreReveal: mockStub('HarmonyScoreReveal') }));
jest.mock('../../src/components/InterventionDrawer', () => ({ InterventionDrawer: mockStub('InterventionDrawer') }));
jest.mock('../../src/components/StoryCarousel', () => ({
  StoryPage: mockStub('StoryPage'),
  ProgressDots: mockStub('ProgressDots'),
}));
jest.mock('../../src/services/canonicalFaceMesh', () => ({ buildCanonicalMesh: () => [] }));
jest.mock('../../src/store/useStore', () => ({ useStore: jest.fn() }));

// Loaded via require so the component jest.mock factories (which reference the
// mock-prefixed mockStub) resolve it only after mockStub is initialized.
const BoneResults = require('../scan/bone-results').default as React.ComponentType;
import { useStore } from '../../src/store/useStore';

interface BoneOutput {
  daily_id: string;
  bone_structure?: { harmony: number };
}

const boneOutput = (harmony: number, id = 'd1'): BoneOutput => ({
  daily_id: id,
  bone_structure: { harmony },
});

// Single boundary cast: the real useStore is a zustand selector hook; we only
// drive its modelOutputs selector here. (rule: no `any`.)
const mockedUseStore = useStore as unknown as jest.Mock;

let mockState: { modelOutputs: BoneOutput[] } = { modelOutputs: [] };

beforeEach(() => {
  mockState = { modelOutputs: [] };
  mockedUseStore.mockReset();
  mockedUseStore.mockImplementation((selector: (s: typeof mockState) => unknown) => selector(mockState));
});

describe('BoneResults — rules of hooks across empty → populated', () => {
  it('renders the empty state without throwing', () => {
    const { getByText } = render(<BoneResults />);
    expect(getByText('Your facial architecture, waiting')).toBeTruthy();
  });

  it('survives an empty → populated transition in the same mounted instance', () => {
    const { rerender, getByText, queryByText } = render(<BoneResults />);
    expect(getByText('Your facial architecture, waiting')).toBeTruthy();

    // Async attachBoneStructure arrives while the screen is mounted.
    mockState = { modelOutputs: [boneOutput(78)] };
    expect(() => rerender(<BoneResults />)).not.toThrow();

    // Empty state gone; the populated carousel (with its disclaimer bar) shows.
    expect(queryByText('Your facial architecture, waiting')).toBeNull();
    expect(getByText(/For informational purposes only/)).toBeTruthy();
  });
});
