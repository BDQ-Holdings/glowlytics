/**
 * Identity-isolation tests for the auth-transition lifecycle.
 *
 * Locks in three behaviours that keep one account's session from bleeding into
 * the next on a shared device:
 *   (a) resetAll (the single sign-out cleanup chokepoint) drops the cached JWT,
 *       sync outbox, analytics identity, and RevenueCat entitlement.
 *   (b) authHydrating is true only while hydrateForUser awaits the backend.
 *   (c) a hydrate whose backend result lands *after* a newer account switch
 *       does NOT clobber the new account's data (the stale-hydrate race).
 */
import { useStore } from '../useStore';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
// Passthrough manual mock so persistData stays plaintext + offline.
jest.mock('../../services/secureStorage');
jest.mock('uuid', () => ({ v4: () => `test-id-${Math.random().toString(36).slice(2)}` }));
jest.mock('react-native-get-random-values', () => {});
jest.mock('react-native-purchases', () => ({ LOG_LEVEL: { ERROR: 0 } }));
jest.mock('react-native-purchases-ui', () => ({ PAYWALL_RESULT: {} }));

// api is fully mocked so resetAll's clearAuthTokenCache and hydrateForUser's
// fetches are observable jest.fns.
jest.mock('../../services/api', () => ({
  getUser: jest.fn(() => Promise.resolve(null)),
  getProtocol: jest.fn(() => Promise.resolve(null)),
  getProducts: jest.fn(() => Promise.resolve([])),
  getDailyRecords: jest.fn(() => Promise.resolve([])),
  getModelOutputs: jest.fn(() => Promise.resolve([])),
  createUser: jest.fn(() => Promise.resolve({})),
  updateUser: jest.fn(() => Promise.resolve({})),
  clearAuthTokenCache: jest.fn(),
}));

// Spread the real modules so the store's other imports (enqueueSync, trackEvent,
// defaultSubscription, startTrial, canScan) keep working; override only the
// sign-out cleanup helpers so we can assert resetAll fires them.
jest.mock('../../services/syncOutbox', () => ({
  ...jest.requireActual('../../services/syncOutbox'),
  resetSyncOutbox: jest.fn(),
}));
jest.mock('../../services/analytics', () => ({
  ...jest.requireActual('../../services/analytics'),
  resetAnalytics: jest.fn(),
}));
jest.mock('../../services/subscription', () => ({
  ...jest.requireActual('../../services/subscription'),
  logOutRevenueCat: jest.fn(() => Promise.resolve()),
}));

const api = require('../../services/api');
const { resetSyncOutbox } = require('../../services/syncOutbox');
const { resetAnalytics } = require('../../services/analytics');
const { logOutRevenueCat } = require('../../services/subscription');

/** A controllable promise so a hydrate can be held in-flight on demand. */
const deferred = () => {
  let resolve: (value: unknown) => void = () => {};
  const promise = new Promise<unknown>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

beforeEach(() => {
  jest.clearAllMocks();
  useStore.setState({
    authedUserId: null,
    authHydrating: false,
    user: null,
    protocol: null,
    products: [],
    dailyRecords: [],
    modelOutputs: [],
  });
});

describe('resetAll — sign-out cleanup chokepoint', () => {
  it('drops the JWT cache, sync outbox, analytics identity, and RevenueCat session', async () => {
    await useStore.getState().resetAll();

    expect(api.clearAuthTokenCache).toHaveBeenCalledTimes(1);
    expect(resetSyncOutbox).toHaveBeenCalledTimes(1);
    expect(resetAnalytics).toHaveBeenCalledTimes(1);
    expect(logOutRevenueCat).toHaveBeenCalledTimes(1);
  });

  it('still clears state and leaves authHydrating false even if a cleanup helper throws', async () => {
    api.clearAuthTokenCache.mockImplementationOnce(() => {
      throw new Error('token cache boom');
    });
    useStore.setState({ authedUserId: 'user_A', authHydrating: true });

    await expect(useStore.getState().resetAll()).resolves.toBeUndefined();

    // One throwing helper must not block the others or the state reset.
    expect(resetSyncOutbox).toHaveBeenCalledTimes(1);
    expect(resetAnalytics).toHaveBeenCalledTimes(1);
    expect(logOutRevenueCat).toHaveBeenCalledTimes(1);
    expect(useStore.getState().authedUserId).toBeNull();
    expect(useStore.getState().authHydrating).toBe(false);
  });
});

describe('hydrateForUser — authHydrating lifecycle', () => {
  it('is true while the backend call is in flight and false once it settles', async () => {
    const gate = deferred();
    api.getProducts.mockReturnValueOnce(gate.promise);

    expect(useStore.getState().authHydrating).toBe(false);

    const inFlight = useStore.getState().hydrateForUser('user_X');
    expect(useStore.getState().authHydrating).toBe(true);

    gate.resolve([]);
    await inFlight;
    expect(useStore.getState().authHydrating).toBe(false);
  });

  it('resets authHydrating to false even when the backend call rejects', async () => {
    api.getUser.mockImplementationOnce(() => Promise.reject(new Error('network down')));

    await useStore.getState().hydrateForUser('user_X');

    expect(useStore.getState().authHydrating).toBe(false);
  });
});

describe('hydrateForUser — stale-hydrate identity guard', () => {
  it('does not clobber a newer account when an older hydrate resolves late', async () => {
    // Account A's hydrate hangs on getProducts until we release it.
    const gate = deferred();
    api.getUser.mockResolvedValueOnce({ user_id: 'user_A', onboarding_complete: true });
    api.getProducts.mockReturnValueOnce(gate.promise);

    // Bind to A, then start the (soon-to-be-stale) hydrate.
    useStore.setState({ authedUserId: 'user_A' });
    const staleHydrate = useStore.getState().hydrateForUser('user_A');

    // A newer sign-in to B wins while A's backend call is still in flight.
    useStore.setState({ authedUserId: 'user_B' });

    // A's data finally arrives — too late; B already owns the store.
    gate.resolve([{ user_product_id: 'pA', user_id: 'user_A' }]);
    await staleHydrate;

    const s = useStore.getState();
    expect(s.authedUserId).toBe('user_B'); // B must NOT be reverted to A
    expect(s.user).toBeNull(); // A's fetched profile did NOT land
    expect(s.products).toEqual([]); // A's fetched products did NOT land
    expect(s.authHydrating).toBe(false);
  });

  it('still applies the hydrate when the same account is bound throughout', async () => {
    api.getUser.mockResolvedValueOnce({ user_id: 'user_C', onboarding_complete: true });
    api.getProducts.mockResolvedValueOnce([{ user_product_id: 'pC', user_id: 'user_C' }]);

    useStore.setState({ authedUserId: 'user_C' });
    await useStore.getState().hydrateForUser('user_C');

    const s = useStore.getState();
    expect(s.authedUserId).toBe('user_C');
    expect(s.user?.user_id).toBe('user_C');
    expect(s.products).toEqual([{ user_product_id: 'pC', user_id: 'user_C' }]);
  });
});
