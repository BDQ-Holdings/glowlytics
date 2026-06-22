import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import OAuthNativeCallback from '../oauth-native-callback';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

// Mutable auth state so each test controls what Clerk reports.
let mockAuth: { isLoaded: boolean; isSignedIn: boolean } = {
  isLoaded: true,
  isSignedIn: false,
};

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => mockAuth,
}));

describe('OAuthNativeCallback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReplace.mockClear();
    mockAuth = { isLoaded: true, isSignedIn: false };
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('initially shows the "Finishing sign-in" spinner', () => {
    const { getByText, queryByText } = render(<OAuthNativeCallback />);
    expect(getByText(/Finishing sign-in/i)).toBeTruthy();
    // No recovery affordance before the timeout elapses.
    expect(queryByText(/Back to sign in/i)).toBeNull();
  });

  it('after the timeout with isSignedIn=false shows recovery and routes to sign-in', () => {
    const { getByText, queryByText } = render(<OAuthNativeCallback />);

    act(() => {
      jest.advanceTimersByTime(8000);
    });

    // Spinner replaced by the recovery state.
    expect(queryByText(/Finishing sign-in/i)).toBeNull();
    const cta = getByText(/Back to sign in/i);
    expect(cta).toBeTruthy();

    fireEvent.press(cta);
    expect(mockReplace).toHaveBeenCalledWith('/auth/sign-in');
  });

  it('keeps the spinner (no recovery) when the session activates', () => {
    mockAuth = { isLoaded: true, isSignedIn: true };
    const { getByText, queryByText } = render(<OAuthNativeCallback />);

    act(() => {
      jest.advanceTimersByTime(8000);
    });

    expect(getByText(/Finishing sign-in/i)).toBeTruthy();
    expect(queryByText(/Back to sign in/i)).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
