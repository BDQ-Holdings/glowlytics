import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockBack = jest.fn();
let mockParams: { key?: string | string[] } = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-linear-gradient', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return { LinearGradient: ({ children }: { children?: React.ReactNode }) => ReactLib.createElement(View, null, children) };
});

jest.mock('../../../src/components/glow/GlowIcons', () => ({
  GlowIcon: () => null,
  GlowSpark: () => null,
}));

jest.mock('../../../src/components/glow/GlowPrimitives', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Pass = ({ children }: { children?: React.ReactNode }) => ReactLib.createElement(View, null, children);
  return { BreathingGlow: Pass, FadeUp: Pass, GlowRing: Pass, SectionHead: Pass };
});

const mockState = {
  dailyRecords: [] as unknown[],
  modelOutputs: [] as unknown[],
  getLatestOutput: () => null,
};

jest.mock('../../../src/store/useStore', () => ({
  useStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

jest.mock('../../../src/services/skinInsights', () => ({
  buildOverallSkinInsight: () => null,
  getLatestDailyForOutput: () => null,
}));

const SignalDetailScreen = require('../[key]').default as React.ComponentType;
const { isValidSignalRouteKey } = require('../[key]') as {
  isValidSignalRouteKey: (key: unknown) => boolean;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe('isValidSignalRouteKey', () => {
  it('accepts every signal the detail page renders', () => {
    for (const key of ['hydration', 'elasticity', 'inflammation', 'sun_damage', 'structure']) {
      expect(isValidSignalRouteKey(key)).toBe(true);
    }
  });

  it('rejects unknown, empty, and non-string keys', () => {
    expect(isValidSignalRouteKey('bogus')).toBe(false);
    expect(isValidSignalRouteKey('')).toBe(false);
    expect(isValidSignalRouteKey(undefined)).toBe(false);
    expect(isValidSignalRouteKey(['sun_damage'])).toBe(false);
  });
});

describe('SignalDetailScreen param guard', () => {
  it('renders a graceful invalid state for an unknown key instead of crashing', () => {
    mockParams = { key: 'not_a_signal' };
    const { getByText, getByLabelText } = render(<SignalDetailScreen />);

    expect(getByText('Not a signal we track')).toBeTruthy();

    fireEvent.press(getByLabelText('Go back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('does not show the invalid state for a known key', () => {
    mockParams = { key: 'hydration' };
    const { queryByText } = render(<SignalDetailScreen />);

    expect(queryByText('Not a signal we track')).toBeNull();
  });

  it('normalizes array params and accepts a valid facet-keyed entry', () => {
    mockParams = { key: ['sun_damage'] };
    const { queryByText } = render(<SignalDetailScreen />);

    expect(queryByText('Not a signal we track')).toBeNull();
  });
});
