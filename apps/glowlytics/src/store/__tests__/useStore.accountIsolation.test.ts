/**
 * Regression tests for cross-account data bleed.
 *
 * Bug: on a single device, signing into account B after account A showed A's
 * data under B, because reconcileAuthUserId() re-stamped the previous account's
 * persisted data onto the newly-authenticated identity. These tests lock in the
 * fix: a switch to a *different* authenticated account wipes local state and
 * hydrates B's own data, while the legitimate "claim anonymous onboarding data"
 * path still works.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../useStore';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('uuid', () => ({ v4: () => `test-id-${Math.random().toString(36).slice(2)}` }));
jest.mock('react-native-get-random-values', () => {});
jest.mock('react-native-purchases', () => ({ LOG_LEVEL: { ERROR: 0 } }));
jest.mock('react-native-purchases-ui', () => ({ PAYWALL_RESULT: {} }));

jest.mock('../../services/api', () => ({
  getUser: jest.fn(() => Promise.resolve(null)),
  getProtocol: jest.fn(() => Promise.resolve(null)),
  getProducts: jest.fn(() => Promise.resolve([])),
  getDailyRecords: jest.fn(() => Promise.resolve([])),
  getModelOutputs: jest.fn(() => Promise.resolve([])),
  createUser: jest.fn(() => Promise.resolve({})),
  updateUser: jest.fn(() => Promise.resolve({})),
}));

const api = require('../../services/api');

const userFixture = (id: string) => ({ user_id: id, onboarding_complete: true }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  useStore.setState({
    authedUserId: null,
    user: null,
    protocol: null,
    products: [],
    dailyRecords: [],
    modelOutputs: [],
  } as any);
});

describe('reconcileAuthUserId — account isolation', () => {
  it('does NOT adopt the previous account’s data when switching accounts (the bug)', async () => {
    useStore.setState({
      authedUserId: 'user_A',
      user: userFixture('user_A'),
      products: [{ user_product_id: 'p1', user_id: 'user_A' }] as any,
      dailyRecords: [{ daily_id: 'd1', user_id: 'user_A', date: '2026-06-01' }] as any,
      modelOutputs: [{ output_id: 'o1', daily_id: 'd1' }] as any,
    } as any);

    await useStore.getState().reconcileAuthUserId('user_B');

    const s = useStore.getState();
    expect(s.authedUserId).toBe('user_B');
    // A's data must be gone, NOT re-stamped onto B.
    expect(s.products).toEqual([]);
    expect(s.dailyRecords).toEqual([]);
    expect(s.modelOutputs).toEqual([]);
    expect(s.user).toBeNull(); // backend mock returns no profile for B
  });

  it('hydrates the switched-in account’s OWN data from the backend', async () => {
    api.getUser.mockResolvedValueOnce({ user_id: 'user_B', onboarding_complete: true });
    api.getProducts.mockResolvedValueOnce([{ user_product_id: 'pB', user_id: 'user_B' }]);

    useStore.setState({
      authedUserId: 'user_A',
      user: userFixture('user_A'),
      products: [{ user_product_id: 'p1', user_id: 'user_A' }] as any,
    } as any);

    await useStore.getState().reconcileAuthUserId('user_B');

    const s = useStore.getState();
    expect(api.getProducts).toHaveBeenCalledWith('user_B');
    expect(s.user?.user_id).toBe('user_B');
    expect(s.products).toEqual([{ user_product_id: 'pB', user_id: 'user_B' }]);
  });

  it('still claims anonymous onboarding data on first sign-in (no regression)', async () => {
    useStore.setState({
      authedUserId: null,
      user: userFixture('local-anon'),
      products: [{ user_product_id: 'p1', user_id: 'local-anon' }] as any,
    } as any);

    await useStore.getState().reconcileAuthUserId('user_B');

    const s = useStore.getState();
    expect(s.authedUserId).toBe('user_B');
    expect(s.user?.user_id).toBe('user_B'); // re-stamped to the real id
    expect(s.products[0].user_id).toBe('user_B');
    // Must NOT wipe a brand-new user's just-entered data via hydrate.
    expect(api.getProducts).not.toHaveBeenCalled();
  });

  it('treats a lost authedUserId over a real account as a switch, not a claim (pre-upgrade migration hole)', async () => {
    api.getUser.mockResolvedValueOnce({ user_id: 'user_B', onboarding_complete: true });
    api.getProducts.mockResolvedValueOnce([{ user_product_id: 'pB', user_id: 'user_B' }]);
    // Upgraded/shared device: account A's real Clerk data persisted, but the
    // old build left authedUserId === null. User B now signs in.
    useStore.setState({
      authedUserId: null,
      user: userFixture('user_A'),
      products: [{ user_product_id: 'p1', user_id: 'user_A' }] as any,
    } as any);

    await useStore.getState().reconcileAuthUserId('user_B');

    const s = useStore.getState();
    expect(s.authedUserId).toBe('user_B');
    // A's data is wiped and B's own data hydrated — NOT A's re-stamped/synced onto B.
    expect(api.getProducts).toHaveBeenCalledWith('user_B');
    expect(s.user?.user_id).toBe('user_B');
    expect(s.products).toEqual([{ user_product_id: 'pB', user_id: 'user_B' }]);
    expect(api.createUser).not.toHaveBeenCalled();
  });

  it('is a no-op when already bound to the same account', async () => {
    const userObj = userFixture('user_B');
    useStore.setState({ authedUserId: 'user_B', user: userObj } as any);

    await useStore.getState().reconcileAuthUserId('user_B');

    expect(useStore.getState().user).toBe(userObj); // untouched reference
    expect(api.getUser).not.toHaveBeenCalled();
  });

  it('hydrates a returning user on a fresh install (no local user)', async () => {
    api.getUser.mockResolvedValueOnce({ user_id: 'user_C', onboarding_complete: true });
    api.getModelOutputs.mockResolvedValueOnce([{ output_id: 'oC', daily_id: 'dC' }]);

    useStore.setState({ authedUserId: null, user: null } as any);

    await useStore.getState().reconcileAuthUserId('user_C');

    const s = useStore.getState();
    expect(s.authedUserId).toBe('user_C');
    expect(s.user?.user_id).toBe('user_C');
    expect(s.modelOutputs).toEqual([{ output_id: 'oC', daily_id: 'dC' }]);
  });
});

describe('resetAll clears the bound identity', () => {
  it('nulls authedUserId so the next sign-in cannot inherit stale data', async () => {
    useStore.setState({ authedUserId: 'user_A', user: userFixture('user_A') } as any);
    await useStore.getState().resetAll();
    expect(useStore.getState().authedUserId).toBeNull();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('glowlytics_data');
  });
});

describe('hydrateForUser — partial-failure resilience', () => {
  it('preserves existing protocol/products/records/scans when their fetch fails', async () => {
    const existingProtocol = { protocol_id: 'p1' } as any;
    const existingProducts = [{ user_product_id: 'prod1', user_id: 'user_A' }] as any;
    const existingRecords = [{ daily_id: 'd1' }] as any;
    const existingOutputs = [{ output_id: 'o1', daily_id: 'd1' }] as any;
    useStore.setState({
      authedUserId: 'user_A',
      user: userFixture('user_A'),
      protocol: existingProtocol,
      products: existingProducts,
      dailyRecords: existingRecords,
      modelOutputs: existingOutputs,
    } as any);

    // getUser succeeds; the four data fetches fail (transient network blip).
    api.getUser.mockResolvedValueOnce({ user_id: 'user_A', onboarding_complete: true });
    api.getProtocol.mockRejectedValueOnce(new Error('network'));
    api.getProducts.mockRejectedValueOnce(new Error('network'));
    api.getDailyRecords.mockRejectedValueOnce(new Error('network'));
    api.getModelOutputs.mockRejectedValueOnce(new Error('network'));

    await useStore.getState().hydrateForUser('user_A');

    const s = useStore.getState();
    // Signed-in user keeps all their data — a flaky hydrate must not wipe it.
    expect(s.protocol).toBe(existingProtocol);
    expect(s.products).toBe(existingProducts);
    expect(s.dailyRecords).toBe(existingRecords);
    expect(s.modelOutputs).toBe(existingOutputs);
    expect(s.authHydrating).toBe(false);
  });

  it('overwrites with empty when the fetch SUCCEEDS but returns empty', async () => {
    useStore.setState({
      authedUserId: 'user_A',
      user: userFixture('user_A'),
      products: [{ user_product_id: 'old', user_id: 'user_A' }] as any,
    } as any);

    api.getUser.mockResolvedValueOnce({ user_id: 'user_A', onboarding_complete: true });
    api.getProtocol.mockResolvedValueOnce(null);
    api.getProducts.mockResolvedValueOnce([]); // genuine empty (user deleted all)
    api.getDailyRecords.mockResolvedValueOnce([]);
    api.getModelOutputs.mockResolvedValueOnce([]);

    await useStore.getState().hydrateForUser('user_A');

    expect(useStore.getState().products).toEqual([]);
  });

  it('orders hydrated model outputs newest-LAST despite a newest-first backend (#14)', async () => {
    useStore.setState({ authedUserId: 'user_A', user: userFixture('user_A') });
    // GET /api/model-outputs returns ORDER BY date DESC (newest first); each row
    // carries the joined `date`. The store/UI treat [last] as the latest scan.
    api.getUser.mockResolvedValueOnce({ user_id: 'user_A', onboarding_complete: true });
    api.getModelOutputs.mockResolvedValueOnce([
      { output_id: 'o3', daily_id: 'd3', date: '2026-06-20' },
      { output_id: 'o2', daily_id: 'd2', date: '2026-06-19' },
      { output_id: 'o1', daily_id: 'd1', date: '2026-06-18' },
    ]);

    await useStore.getState().hydrateForUser('user_A');

    const outs = useStore.getState().modelOutputs;
    expect(outs.map((o) => o.output_id)).toEqual(['o1', 'o2', 'o3']); // oldest → newest
    expect(outs[outs.length - 1].output_id).toBe('o3'); // latest is last
  });
});
