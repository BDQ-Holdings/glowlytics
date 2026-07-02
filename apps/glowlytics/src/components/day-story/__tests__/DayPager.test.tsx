import React from 'react';
import { render } from '@testing-library/react-native';
import { DayPager } from '../DayPager';

// expo-linear-gradient → passthrough View that preserves testID so the
// strip's gradient element is findable. `props` is already typed with an
// optional `children`, so we read it directly (no inline cast-access).
jest.mock('expo-linear-gradient', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: (props: { children?: unknown }) =>
      ReactLib.createElement(View, props, props.children ?? null),
  };
});

// Reanimated — DayPager uses useSharedValue/useAnimatedStyle + interpolate +
// Extrapolation + Animated.View (via FadePage).
jest.mock('react-native-reanimated', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Passthrough = ReactLib.forwardRef((props: { children?: unknown }, ref: unknown) =>
    ReactLib.createElement(View, { ...props, ref }, props.children),
  );
  return {
    __esModule: true,
    default: { View: Passthrough, ScrollView: Passthrough, Text: Passthrough },
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    interpolate: () => 1,
    Extrapolation: { CLAMP: 'clamp' },
  };
});

// Keep the pager light: the strip's siblings are irrelevant to this test.
jest.mock('../CalendarStrip', () => ({ CalendarStrip: () => null }));
jest.mock('../DayPage', () => ({ DayPage: () => null }));

jest.mock('../../../store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const mockState = { dailyRecords: [] as unknown[], modelOutputs: [] as unknown[] };

describe('DayPager — header seam gradient', () => {
  it('renders a gradient fill behind the calendar strip', () => {
    const { getByTestId } = render(
      <DayPager onScan={jest.fn()} onOpenRitual={jest.fn()} onShare={jest.fn()} />,
    );

    expect(getByTestId('strip-gradient')).toBeTruthy();
  });
});
