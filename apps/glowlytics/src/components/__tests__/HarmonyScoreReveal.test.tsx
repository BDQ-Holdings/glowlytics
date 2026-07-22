import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('react-native-reanimated', () => {
  const ReactLib = require('react');
  const { View, Text } = require('react-native');
  const Passthrough = ReactLib.forwardRef((props: { children?: unknown }, ref: unknown) =>
    ReactLib.createElement(View, { ...props, ref }, props.children));
  const chain = { duration: () => chain, delay: () => chain };
  return {
    __esModule: true,
    default: { View: Passthrough, Text: Passthrough },
    Easing: { inOut: (fn: unknown) => fn, ease: (t: unknown) => t },
    FadeInUp: chain, ZoomIn: chain,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withDelay: (_d: unknown, v: unknown) => v,
    withRepeat: (v: unknown) => v, withSequence: (v: unknown) => v, withTiming: (v: unknown) => v,
  };
});

const { HarmonyScoreReveal } = require('../HarmonyScoreReveal');

describe('HarmonyScoreReveal', () => {
  it('renders the interpreted driver block when driver is provided', () => {
    const { getByText } = render(
      <HarmonyScoreReveal
        score={34}
        driver={{ domain: 'midface', label: 'Midface balance', scoreText: '36/100',
          band: 'below', bandLabel: 'Below range',
          meaning: 'the middle third of your face is set back relative to the upper and lower thirds.' }}
      />,
    );
    expect(getByText('Midface balance')).toBeTruthy();
    expect(getByText(/middle third of your face is set back/)).toBeTruthy();
  });

  it('falls back to caption when no driver (backward-compat with scan/results)', () => {
    const { getByText, queryByText } = render(
      <HarmonyScoreReveal score={72} caption="Strongest opportunity: midface" />,
    );
    expect(getByText('Strongest opportunity: midface')).toBeTruthy();
    expect(queryByText('Midface balance')).toBeNull();
  });
});
