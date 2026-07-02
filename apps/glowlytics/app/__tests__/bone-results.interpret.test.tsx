import React from 'react';
import { render } from '@testing-library/react-native';
import type { BoneStructureResult } from '../../src/types';

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
jest.mock('expo-haptics', () => ({ selectionAsync: () => Promise.resolve() }));
jest.mock('expo-linear-gradient', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return { LinearGradient: (props: { children?: unknown }) => ReactLib.createElement(View, props, props.children) };
});
jest.mock('react-native-reanimated', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Passthrough = ReactLib.forwardRef((props: { children?: unknown }, ref: unknown) =>
    ReactLib.createElement(View, { ...props, ref }, props.children));
  const chain = { duration: () => chain, delay: () => chain, springify: () => chain };
  return {
    __esModule: true,
    default: { View: Passthrough, ScrollView: Passthrough, Text: Passthrough },
    FadeIn: chain, FadeInDown: chain, FadeInUp: chain, ZoomIn: chain,
    Easing: { inOut: (fn: unknown) => fn, ease: (t: unknown) => t, linear: (t: unknown) => t },
    useSharedValue: (v: unknown) => ({ value: v }), useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v, withSequence: (v: unknown) => v, withTiming: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v, runOnJS: (fn: unknown) => fn,
  };
});
jest.mock('../../src/components/Button', () => ({ Button: mockStub('Button') }));
jest.mock('../../src/components/DomainRadialChart', () => ({ DomainRadialChart: mockStub('DomainRadialChart') }));
jest.mock('../../src/components/Face3DViewer', () => ({ Face3DViewer: mockStub('Face3DViewer') }));
jest.mock('../../src/components/HarmonyIntroOverlay', () => ({ HarmonyIntroOverlay: mockStub('HarmonyIntroOverlay') }));
jest.mock('../../src/components/HarmonyScoreReveal', () => ({ HarmonyScoreReveal: mockStub('HarmonyScoreReveal') }));
jest.mock('../../src/components/InterventionDrawer', () => ({ InterventionDrawer: mockStub('InterventionDrawer') }));
jest.mock('../../src/components/StoryCarousel', () => ({ StoryPage: mockStub('StoryPage'), ProgressDots: mockStub('ProgressDots') }));
jest.mock('../../src/store/useStore', () => ({ useStore: jest.fn() }));

const BoneResults = require('../scan/bone-results').default as React.ComponentType;
import { useStore } from '../../src/store/useStore';

const bone: BoneStructureResult = {
  harmony: 34,
  status: 'ok',
  domain_scores: { symmetry: 72, periorbital: 61, mandibular: 44, midface: 36, nose: 68, brow: 58 },
  scored_metrics: { gonial_angle: 30, chin_projection: 40, zygomatic_projection: 33, facial_thirds: 71 },
  metrics: {
    gonial_angle: { value: 128 },
    chin_projection: { value: -2.4 },
    zygomatic_projection: { value: 3.1 },
    facial_thirds: { value: 0.94 },
  },
  findings: [
    { findingCode: 'midface_flat', metric: 'zygomatic_projection', value: 3.1, score: 33, severity: 'moderate' },
    { findingCode: 'chin_recessed', metric: 'chin_projection', value: -2.4, score: 40, severity: 'mild' },
  ],
  interventions: { lifestyle: [], pharmacological: [], interventional: [], procedural_disclaimer: 'x' },
  dominant_driver: 'midface',
  downsampled_mesh: null,
  source: 'mediapipe',
  sex: null,
  generated_at: new Date('2026-06-01').toISOString(),
};

const mockedUseStore = useStore as unknown as jest.Mock;
beforeEach(() => {
  mockedUseStore.mockReset();
  mockedUseStore.mockImplementation((sel: (s: { modelOutputs: unknown[] }) => unknown) =>
    sel({ modelOutputs: [{ daily_id: 'd1', bone_structure: bone }] }));
});

describe('BoneResults — interpretable readouts', () => {
  it('renders the interpreted midface readout instead of a bare number', () => {
    const { getByText, getAllByText, queryByText } = render(<BoneResults />);
    expect(getByText('Midface balance')).toBeTruthy();
    expect(getAllByText('36/100').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText(/middle third of your face is set back/i).length).toBeGreaterThanOrEqual(1);
    expect(getByText(/Your biggest opportunity right now is Midface balance/)).toBeTruthy();
    // no uninterpretable bare "36" node anywhere
    expect(queryByText('36')).toBeNull();
  });
});
