import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockCreateUser = jest.fn();
const mockSetOnboardingFlow = jest.fn();
const mockSetOnboardingFlowIndex = jest.fn();

let mockState: {
  user: { user_id?: string; age_range?: string } | null;
  onboardingFlow: string[];
  onboardingFlowIndex: number;
  createUser: jest.Mock;
  setOnboardingFlow: jest.Mock;
  setOnboardingFlowIndex: jest.Mock;
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/onboarding/welcome',
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ userId: 'clerk-user' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The bespoke cover renders a real SVG halo + monoline arrow icon. Stub the
// native SVG surface so the tree renders headlessly.
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
    RadialGradient: Stub,
    LinearGradient: Stub,
    Stop: Stub,
    G: Stub,
  };
});

// Entrance animations use reanimated; render final state synchronously.
jest.mock('react-native-reanimated', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Passthrough = ReactLib.forwardRef((props: { children?: unknown }, ref: unknown) =>
    ReactLib.createElement(View, { ...props, ref }, props.children),
  );
  return {
    __esModule: true,
    default: { View: Passthrough, ScrollView: Passthrough, Text: Passthrough },
    Easing: {
      out: (fn: unknown) => fn,
      cubic: (t: unknown) => t,
      inOut: (fn: unknown) => fn,
      ease: (t: unknown) => t,
      linear: (t: unknown) => t,
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

jest.mock('../../../src/services/analytics', () => ({
  trackEvent: jest.fn(),
}));

jest.mock('../../../src/store/useStore', () => {
  const useStore = (selector: (state: typeof mockState) => unknown) => selector(mockState);
  useStore.getState = () => mockState;
  return { useStore };
});

const Welcome = require('../welcome').default as React.ComponentType;

beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    user: null,
    onboardingFlow: [
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
    ],
    onboardingFlowIndex: 0,
    createUser: mockCreateUser,
    setOnboardingFlow: mockSetOnboardingFlow,
    setOnboardingFlowIndex: mockSetOnboardingFlowIndex,
  };
});

describe('Welcome onboarding entry', () => {
  it('does not recreate an existing profile when re-entering welcome', () => {
    mockState.user = { user_id: 'clerk-user', age_range: '25-34' };

    const { getByText } = render(<Welcome />);
    fireEvent.press(getByText('Begin'));

    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockSetOnboardingFlow).toHaveBeenCalledWith([
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
    ]);
    expect(mockSetOnboardingFlowIndex).toHaveBeenCalledWith(1);
    expect(mockPush).toHaveBeenCalledWith('/onboarding/how-it-works');
  });
});
