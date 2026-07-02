import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { TouchableOpacity, Text } from 'react-native';

const mockPush = jest.fn();
const mockCreateUser = jest.fn();
const mockSetOnboardingFlow = jest.fn();
const mockSetOnboardingFlowIndex = jest.fn();

let mockState: {
  user: { user_id?: string; age_range?: string } | null;
  createUser: jest.Mock;
  setOnboardingFlow: jest.Mock;
  setOnboardingFlowIndex: jest.Mock;
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ userId: 'clerk-user' }),
}));

jest.mock('../../../src/services/analytics', () => ({
  trackEvent: jest.fn(),
}));

jest.mock('../../../src/components/OnboardingTransition', () => {
  const ReactLib = require('react');
  const { TouchableOpacity: MockTouchableOpacity, Text: MockText } = require('react-native');
  return {
    OnboardingTransition: ({ primaryLabel, primaryOnPress }: { primaryLabel: string; primaryOnPress: () => void }) => (
      ReactLib.createElement(
        MockTouchableOpacity,
        { accessibilityRole: 'button', onPress: primaryOnPress },
        ReactLib.createElement(MockText, null, primaryLabel),
      )
    ),
  };
});

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
    createUser: mockCreateUser,
    setOnboardingFlow: mockSetOnboardingFlow,
    setOnboardingFlowIndex: mockSetOnboardingFlowIndex,
  };
});

describe('Welcome onboarding entry', () => {
  it('does not recreate an existing profile when re-entering welcome', () => {
    mockState.user = { user_id: 'clerk-user', age_range: '25-34' };

    const { getByText } = render(<Welcome />);
    fireEvent.press(getByText("Let's go"));

    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockSetOnboardingFlow).toHaveBeenCalledWith([
      'welcome',
      'age-range',
      'sex',
      'skin-goal',
      'health-permission',
      'scan-reminder',
      'preview',
      'paywall',
    ]);
    expect(mockSetOnboardingFlowIndex).toHaveBeenCalledWith(1);
    expect(mockPush).toHaveBeenCalledWith('/onboarding/age-range');
  });
});
