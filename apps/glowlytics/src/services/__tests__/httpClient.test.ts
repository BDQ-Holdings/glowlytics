// httpClient: a 401 from an authenticated request must force a token refresh
// that BYPASSES the provider's own cache. The provider now takes
// { skipCache?: boolean }; fetchToken(forceRefresh) must call it with
// { skipCache: forceRefresh } so the one-shot retry actually gets a fresh JWT.
import { setAuthTokenProvider, clearAuthTokenCache, httpJson } from '../httpClient';

type FakeResponse = {
  status: number;
  ok: boolean;
  headers: { get: (h: string) => string | null };
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

const makeResponse = (status: number, body?: unknown): FakeResponse => ({
  status,
  ok: status >= 200 && status < 300,
  headers: {
    get: (h: string) =>
      body !== undefined && h.toLowerCase() === 'content-type' ? 'application/json' : null,
  },
  json: async () => body,
  text: async () => (body !== undefined ? JSON.stringify(body) : ''),
});

describe('httpClient — 401 forced refresh bypasses provider cache', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
    clearAuthTokenCache();
  });

  it('on 401 retries once with a token requested using { skipCache: true }', async () => {
    clearAuthTokenCache();
    const provider = jest
      .fn()
      .mockResolvedValueOnce('stale-token') // initial (non-forced) fetch
      .mockResolvedValueOnce('fresh-token'); // forced refresh after 401
    setAuthTokenProvider(provider);

    const okBody = { ok: true };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(makeResponse(401)) // first attempt → unauthorized
      .mockResolvedValueOnce(makeResponse(200, okBody)); // retry succeeds
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await httpJson('https://api.example.com/thing');

    expect(result).toEqual(okBody);

    // Provider invoked twice: first not forced, second forced with skipCache:true.
    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls[0][0]).toEqual({ skipCache: false });
    expect(provider.mock.calls[1][0]).toEqual({ skipCache: true });

    // The retried request carried the refreshed bearer token, not the stale one.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstInit = fetchMock.mock.calls[0][1] as RequestInit;
    const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect((firstInit.headers as Record<string, string>)['Authorization']).toBe('Bearer stale-token');
    expect((secondInit.headers as Record<string, string>)['Authorization']).toBe('Bearer fresh-token');
  });

  it('single-flights a burst of concurrent authed requests into one token fetch', async () => {
    clearAuthTokenCache();
    // Provider resolves on the next microtask so both requests reach fetchToken
    // before it settles — the second must reuse the first's in-flight promise.
    const provider = jest.fn().mockImplementation(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('tok'), 5)),
    );
    setAuthTokenProvider(provider);

    const okBody = { ok: true };
    const fetchMock = jest.fn().mockResolvedValue(makeResponse(200, okBody));
    global.fetch = fetchMock as unknown as typeof fetch;

    const [a, b, c] = await Promise.all([
      httpJson('https://api.example.com/a'),
      httpJson('https://api.example.com/b'),
      httpJson('https://api.example.com/c'),
    ]);

    expect(a).toEqual(okBody);
    expect(b).toEqual(okBody);
    expect(c).toEqual(okBody);
    // All three requests collapsed to a single Clerk getToken() call.
    expect(provider).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
