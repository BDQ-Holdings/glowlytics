// src/services/httpClientInternal.ts
//
// Tiny shim that lets api.ts (and visionAPI's SSE path) read the cached auth
// token without re-implementing the cache. Kept in a separate module so
// httpClient.ts can stay focused on the request lifecycle.
//
// The cache lives inside httpClient.ts but is private to that module. We expose
// the same fetcher here, sharing nothing — `_peekAuthToken` is a pure call into
// the same token provider hook. It's fine to call it back-to-back with httpJson
// because Clerk's getToken is itself cached for ~50s by the SDK.

let getAuthToken: (() => Promise<string | null>) | null = null;

/** Mirror of httpClient.setAuthTokenProvider — both are wired at the same time. */
export const _setProvider = (provider: () => Promise<string | null>) => {
  getAuthToken = provider;
};

/** Returns the current Bearer token (Clerk JWT), or null when signed out. */
export const _peekAuthToken = async (): Promise<string | null> => {
  if (!getAuthToken) return null;
  return getAuthToken();
};
