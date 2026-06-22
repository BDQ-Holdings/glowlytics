/**
 * Rules-of-hooks regression for the skin-results story carousel.
 *
 * Bug: the `pages` useMemo and `getItemLayout` useCallback sat AFTER the
 * `if (!latestOutput) return <empty/>` early return. When the store hydrated a
 * scan result while the screen was mounted, the empty → populated transition
 * reached extra hooks and React threw "Rendered more hooks than during the
 * previous render", tripping the AppErrorBoundary. Every hook is now hoisted
 * above the early return, so the hook count is constant across renders.
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

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
}));

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

jest.mock('../../src/services/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('../../src/services/skinInsights', () => ({
  buildOverallSkinInsight: () => ({ score: 80, statusLabel: 'Clear', actionStatement: 'Keep going' }),
  getLatestDailyForOutput: () => null,
}));
jest.mock('../../src/services/skinAnalysis', () => ({ getExplanation: () => 'Your skin analysis is ready.' }));
jest.mock('../../src/services/canonicalFaceMesh', () => ({ buildCanonicalMesh: () => [] }));

// Heavy children stubbed so the test exercises only the screen's hook ordering.
jest.mock('../../src/components/ActionCard', () => ({ ActionCard: mockStub('ActionCard') }));
jest.mock('../../src/components/Button', () => ({ Button: mockStub('Button') }));
jest.mock('../../src/components/ClinicalSourcesCard', () => ({ ClinicalSourcesCard: mockStub('ClinicalSourcesCard') }));
jest.mock('../../src/components/Face3DViewer', () => ({ Face3DViewer: mockStub('Face3DViewer') }));
jest.mock('../../src/components/HarmonyScoreReveal', () => ({ HarmonyScoreReveal: mockStub('HarmonyScoreReveal') }));
jest.mock('../../src/components/InterventionDrawer', () => ({ InterventionDrawer: mockStub('InterventionDrawer') }));
jest.mock('../../src/components/AnimatedFillBar', () => ({ AnimatedFillBar: mockStub('AnimatedFillBar') }));
jest.mock('../../src/store/useStore', () => ({ useStore: jest.fn() }));

// Loaded via require so the component jest.mock factories (which reference the
// mock-prefixed mockStub) resolve it only after mockStub is initialized.
const Results = require('../scan/results').default as React.ComponentType;
import { useStore } from '../../src/store/useStore';

interface SkinOutput {
  output_id: string;
  acne_score: number;
  sun_damage_score: number;
  skin_age_score: number;
}

const skinOutput = (id = 'o1'): SkinOutput => ({
  output_id: id,
  acne_score: 50,
  sun_damage_score: 50,
  skin_age_score: 50,
});

interface MockState {
  modelOutputs: SkinOutput[];
  dailyRecords: unknown[];
}

// Single boundary cast: the real useStore is a zustand selector hook; we only
// drive its modelOutputs / dailyRecords selectors here. (rule: no `any`.)
const mockedUseStore = useStore as unknown as jest.Mock;

let mockState: MockState = { modelOutputs: [], dailyRecords: [] };

beforeEach(() => {
  mockState = { modelOutputs: [], dailyRecords: [] };
  mockedUseStore.mockReset();
  mockedUseStore.mockImplementation((selector: (s: MockState) => unknown) => selector(mockState));
});

describe('Results — rules of hooks across empty → populated', () => {
  it('renders the empty state without throwing', () => {
    const { getByText } = render(<Results />);
    expect(getByText('Results appear after your first scan')).toBeTruthy();
  });

  it('survives an empty → populated transition in the same mounted instance', () => {
    const { rerender, getByText, queryByText } = render(<Results />);
    expect(getByText('Results appear after your first scan')).toBeTruthy();

    // A scan result hydrates into the store while the screen is mounted.
    mockState = { modelOutputs: [skinOutput()], dailyRecords: [] };
    expect(() => rerender(<Results />)).not.toThrow();

    // Empty state gone; the populated carousel (with its disclaimer bar) shows.
    expect(queryByText('Results appear after your first scan')).toBeNull();
    expect(getByText(/Consult a dermatologist/)).toBeTruthy();
  });
});
