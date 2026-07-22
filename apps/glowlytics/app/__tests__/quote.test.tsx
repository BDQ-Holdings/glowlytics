/**
 * Smoke test for the daily-quote screen's two behaviors that the dusk re-theme
 * MUST preserve byte-for-byte:
 *   - advance -> writes the seen date (markDailyQuoteSeen) AND exits to home
 *     (router.replace('/(tabs)/today'))
 *   - share  -> opens the native Share sheet with the quote + attribution
 *
 * reduceMotion is forced on so the exit hands off to home synchronously (the
 * reanimated mock never fires timing callbacks), keeping the assertions
 * deterministic without leaning on fake timers.
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Share } from 'react-native';
import { todaysQuote } from '../../src/data/dailyQuotes';

const mockReplace = jest.fn();
const mockMarkDailyQuoteSeen = jest.fn();
// Captures the `style` prop the screen hands to expo-status-bar so we can assert
// the light/dark glyph choice contrasts the resolved palette mode.
const mockStatusBar: { style?: string } = {};

let mockState: {
  markDailyQuoteSeen: jest.Mock;
  appearance: { reduceMotion: boolean; mode: 'light' | 'dark' | 'auto' };
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-status-bar', () => {
  const ReactLib = require('react');
  return {
    StatusBar: (props: { style?: string }) => {
      mockStatusBar.style = props.style;
      return ReactLib.createElement(ReactLib.Fragment, null);
    },
  };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));

// GlowIcon renders through react-native-svg; stub the native surface.
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Stub = ({ children }: { children?: unknown }) => ReactLib.createElement(View, null, children);
  return {
    __esModule: true,
    default: Stub,
    Svg: Stub,
    Circle: Stub,
    Path: Stub,
    Rect: Stub,
    Defs: Stub,
    LinearGradient: Stub,
    RadialGradient: Stub,
    Stop: Stub,
    G: Stub,
  };
});

// Entrance/exit animations use reanimated; render final state synchronously.
// withTiming ignores its completion callback, so the reduce-motion path (which
// navigates without awaiting a fade) is what makes advance observable here.
jest.mock('react-native-reanimated', () => {
  const ReactLib = require('react');
  const { View, Text } = require('react-native');
  const Passthrough = ReactLib.forwardRef((props: { children?: unknown }, ref: unknown) =>
    ReactLib.createElement(View, { ...props, ref }, props.children),
  );
  const TextPassthrough = ReactLib.forwardRef((props: { children?: unknown }, ref: unknown) =>
    ReactLib.createElement(Text, { ...props, ref }, props.children),
  );
  return {
    __esModule: true,
    default: {
      View: Passthrough,
      Text: TextPassthrough,
      createAnimatedComponent: (c: unknown) => c,
    },
    Easing: {
      out: (fn: unknown) => fn,
      in: (fn: unknown) => fn,
      cubic: (t: unknown) => t,
      bezier: () => (t: unknown) => t,
    },
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v,
    withSequence: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    withDelay: (_d: unknown, v: unknown) => v,
    cancelAnimation: jest.fn(),
    runOnJS: (fn: unknown) => fn,
  };
});

jest.mock('../../src/services/analytics', () => ({
  trackEvent: jest.fn(),
}));

jest.mock('../../src/store/useStore', () => {
  const useStore = (selector: (state: typeof mockState) => unknown) => selector(mockState);
  useStore.getState = () => mockState;
  return { useStore };
});

const DailyQuoteScreen = require('../quote').default as React.ComponentType;

beforeEach(() => {
  jest.clearAllMocks();
  mockStatusBar.style = undefined;
  mockState = {
    markDailyQuoteSeen: mockMarkDailyQuoteSeen,
    appearance: { reduceMotion: true, mode: 'light' },
  };
});

describe('Daily quote screen', () => {
  it('advance writes the seen date and exits to home', () => {
    const { getByLabelText } = render(<DailyQuoteScreen />);

    fireEvent.press(getByLabelText('Continue to home'));

    expect(mockMarkDailyQuoteSeen).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/today');
  });

  it('share opens the native sheet with the quote and attribution', () => {
    const shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const quote = todaysQuote();

    const { getByLabelText } = render(<DailyQuoteScreen />);
    fireEvent.press(getByLabelText('Share quote'));

    expect(shareSpy).toHaveBeenCalledWith({
      title: `${quote.author}`,
      message: `"${quote.text}"\n— ${quote.author}\n\nvia Glowlytics`,
    });
    // Advancing is NOT a side effect of sharing.
    expect(mockMarkDailyQuoteSeen).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    shareSpy.mockRestore();
  });

  it('status bar uses light glyphs when the palette resolves to dark', () => {
    mockState.appearance.mode = 'dark';
    render(<DailyQuoteScreen />);
    // Dark ground → light status-bar glyphs stay legible (was hardcoded 'dark').
    expect(mockStatusBar.style).toBe('light');
  });

  it('status bar uses dark glyphs when the palette resolves to light', () => {
    mockState.appearance.mode = 'light';
    render(<DailyQuoteScreen />);
    expect(mockStatusBar.style).toBe('dark');
  });
});
