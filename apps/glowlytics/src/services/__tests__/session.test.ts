const mockResetAll = jest.fn(() => Promise.resolve());
jest.mock('../../store/useStore', () => ({
  useStore: { getState: () => ({ resetAll: mockResetAll }) },
}));

jest.mock('../analytics', () => ({
  trackEvent: jest.fn(),
  resetAnalytics: jest.fn(),
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));

import { Alert } from 'react-native';
import { confirmSignOut } from '../session';
import { resetAnalytics, trackEvent } from '../analytics';

const mockedAlert = Alert.alert as jest.Mock;
const mockedTrackEvent = trackEvent as jest.Mock;
const mockedResetAnalytics = resetAnalytics as jest.Mock;

const pressSignOut = async () => {
  const buttons = mockedAlert.mock.calls[0][2];
  const signOutButton = buttons.find((button: { text?: string }) => button.text === 'Sign out');
  await signOutButton.onPress();
};

describe('confirmSignOut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResetAll.mockResolvedValue(undefined);
  });

  it('shows a destructive confirmation before signing out', () => {
    confirmSignOut({ signOut: jest.fn(() => Promise.resolve()) });

    expect(mockedAlert).toHaveBeenCalledWith(
      'Sign out',
      'Are you sure you want to sign out?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Sign out', style: 'destructive' }),
      ]),
    );
  });

  it('tracks sign out, resets analytics, invokes Clerk, and wipes local state after confirmation', async () => {
    const signOut = jest.fn(() => Promise.resolve());
    confirmSignOut({ signOut });

    await pressSignOut();

    expect(mockedTrackEvent).toHaveBeenCalledWith('auth_sign_out');
    expect(mockedResetAnalytics).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
    expect(mockResetAll).toHaveBeenCalled();
    expect(mockedTrackEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mockedResetAnalytics.mock.invocationCallOrder[0],
    );
    expect(mockedResetAnalytics.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(
      mockResetAll.mock.invocationCallOrder[0],
    );
  });

  it('wipes local state even when Clerk sign-out fails', async () => {
    const signOut = jest.fn(() => Promise.reject(new Error('clerk offline')));
    confirmSignOut({ signOut });

    await pressSignOut();

    expect(mockedResetAnalytics).toHaveBeenCalled();
    expect(mockResetAll).toHaveBeenCalled();
    expect(mockedAlert).toHaveBeenCalledTimes(1);
  });

  it('alerts when the local wipe fails', async () => {
    mockResetAll.mockRejectedValueOnce(new Error('storage unavailable'));
    confirmSignOut({ signOut: jest.fn(() => Promise.resolve()) });

    await pressSignOut();

    expect(mockedAlert).toHaveBeenLastCalledWith('Sign out failed', 'Please try again.');
  });
});
