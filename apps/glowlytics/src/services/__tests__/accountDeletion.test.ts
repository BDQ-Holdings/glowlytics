// The helper lazy-requires the store, so mock it before import to avoid
// pulling AsyncStorage/uuid transitively.
const mockResetAll = jest.fn(() => Promise.resolve());
jest.mock('../../store/useStore', () => ({
  useStore: { getState: () => ({ resetAll: mockResetAll }) },
}));

jest.mock('../api', () => ({
  deleteUser: jest.fn(() => Promise.resolve({ success: true })),
}));

jest.mock('../analytics', () => ({
  trackEvent: jest.fn(),
  resetAnalytics: jest.fn(),
}));

import { deleteAccountAndSignOut } from '../accountDeletion';
import * as api from '../api';
import { resetAnalytics, trackEvent } from '../analytics';

const mockedDeleteUser = api.deleteUser as jest.Mock;
const mockedTrackEvent = trackEvent as jest.Mock;
const mockedResetAnalytics = resetAnalytics as jest.Mock;

describe('deleteAccountAndSignOut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes the backend user, signs out, and wipes local state', async () => {
    const signOut = jest.fn(() => Promise.resolve());

    await deleteAccountAndSignOut({ userId: 'user_123', clerk: { signOut } });

    expect(mockedTrackEvent).toHaveBeenCalledWith('account_delete_requested');
    expect(mockedDeleteUser).toHaveBeenCalledWith('user_123');
    expect(signOut).toHaveBeenCalled();
    expect(mockedResetAnalytics).toHaveBeenCalled();
    expect(mockResetAll).toHaveBeenCalled();
    // Backend delete must precede the local wipe: a failed delete should
    // never leave the user signed out with data still on the server.
    expect(mockedDeleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      mockResetAll.mock.invocationCallOrder[0],
    );
  });

  it('propagates a backend delete failure without touching local state', async () => {
    mockedDeleteUser.mockRejectedValueOnce(new Error('server down'));
    const signOut = jest.fn(() => Promise.resolve());

    await expect(
      deleteAccountAndSignOut({ userId: 'user_123', clerk: { signOut } }),
    ).rejects.toThrow('server down');

    expect(signOut).not.toHaveBeenCalled();
    expect(mockedResetAnalytics).not.toHaveBeenCalled();
    expect(mockResetAll).not.toHaveBeenCalled();
  });

  it('treats Clerk sign-out as best-effort', async () => {
    const signOut = jest.fn(() => Promise.reject(new Error('clerk offline')));

    await expect(
      deleteAccountAndSignOut({ userId: 'user_123', clerk: { signOut } }),
    ).resolves.toBeUndefined();

    expect(mockedResetAnalytics).toHaveBeenCalled();
    expect(mockResetAll).toHaveBeenCalled();
  });

  it('works without a Clerk instance', async () => {
    await expect(
      deleteAccountAndSignOut({ userId: 'user_123', clerk: null }),
    ).resolves.toBeUndefined();

    expect(mockedDeleteUser).toHaveBeenCalledWith('user_123');
    expect(mockResetAll).toHaveBeenCalled();
  });
});
