// src/services/httpClient.ts
//
// Hardened HTTP client for all backend (and 3rd-party) calls.
//
// Why a wrapper instead of bare fetch:
//  - Consistent timeouts with proper AbortController cleanup (no body-read leaks)
//  - Exponential backoff with jitter for retryable failures (5xx / 429 / network)
//  - Honors `Retry-After` headers (seconds or HTTP-date) so we don't hammer back
//  - Single Bearer-token cache (Clerk getToken is rate-limited, ~once/sec is fine)
//  - X-Request-ID header on every call so production failures can be traced
//  - Structured ApiError so callers can branch on .status without parsing strings
//  - 401 handling with one-shot forced refresh (in case a cached token expired)

import { _setProvider as _setInternalProvider } from './httpClientInternal';

let getAuthToken: (() => Promise<string | null>) | null = null;

/** Wire Clerk's session.getToken() at app boot. */
export const setAuthTokenProvider = (provider: () => Promise<string | null>) => {
  getAuthToken = provider;
  // Mirror to the internal shim so api.ts/getAuthHeaders can read the same source.
  _setInternalProvider(provider);
  // Invalidate any prior cached token when the provider changes (sign-out → sign-in).
  cachedToken = null;
  cachedTokenExpiresAt = 0;
};

// ---------------------------------------------------------------------------
// Token cache — Clerk getToken issues a JWT each call; rapid bursts can be
// throttled. We hold the last token for ~50s (well under the 60s JWT lifetime)
// so a tab-switch storm of API calls doesn't hammer the auth service.
// ---------------------------------------------------------------------------
let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;
const TOKEN_TTL_MS = 50_000;

const fetchToken = async (forceRefresh = false): Promise<string | null> => {
  if (!getAuthToken) return null;
  const now = Date.now();
  if (!forceRefresh && cachedToken && now < cachedTokenExpiresAt) {
    return cachedToken;
  }
  const token = await getAuthToken();
  cachedToken = token;
  cachedTokenExpiresAt = token ? now + TOKEN_TTL_MS : 0;
  return token;
};

/** Call after sign-out to drop the cached JWT immediately. */
export const clearAuthTokenCache = () => {
  cachedToken = null;
  cachedTokenExpiresAt = 0;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  /** HTTP status code, or 0 for network/timeout/abort. */
  status: number;
  /** Best-effort body text (truncated). */
  body?: string;
  /** X-Request-ID we sent — server logs should echo this. */
  requestId?: string;
  /** True when this came from AbortController (timeout or external cancel). */
  aborted: boolean;

  constructor(message: string, opts: { status: number; body?: string; requestId?: string; aborted?: boolean } = { status: 0 }) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.body = opts.body;
    this.requestId = opts.requestId;
    this.aborted = !!opts.aborted;
  }
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------
/** Statuses that are safe to retry — server-side hiccups + Apple's rate limit. */
const isRetryableStatus = (status: number) => status === 408 || status === 429 || (status >= 500 && status < 600);

/** Network/abort errors that warrant another attempt. */
const isRetryableError = (err: unknown): boolean => {
  if (err instanceof ApiError) return false; // we already inspected the status
  const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
  // Only the narrow signatures we know are transient — avoid retrying on
  // genuine programming errors that happen to mention "network" in their text.
  return /network request failed|fetch failed|aborted|timeout|connection reset|enotfound|etimedout/.test(msg);
};

/** Parse `Retry-After`. Supports seconds (numeric) and HTTP-date. */
const parseRetryAfter = (value: string | null): number | null => {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
};

/** Exponential backoff with jitter, capped at 8s. */
const backoffMs = (attempt: number): number => {
  const base = Math.min(8000, 250 * Math.pow(2, attempt - 1));
  const jitter = Math.random() * base * 0.25;
  return Math.round(base + jitter);
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Request ID — short, unique-enough for log correlation. Avoids pulling uuid
// into the auth path so cold-start latency stays low.
// ---------------------------------------------------------------------------
let requestSeq = 0;
const newRequestId = (): string => {
  const t = Date.now().toString(36);
  const seq = (++requestSeq).toString(36).padStart(4, '0');
  const rand = Math.random().toString(36).slice(2, 6);
  return `cli-${t}-${seq}-${rand}`;
};

// ---------------------------------------------------------------------------
// Request options
// ---------------------------------------------------------------------------
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON body — will be stringified and content-type set automatically. */
  body?: unknown;
  /** Extra headers to merge in (overwrites defaults if duplicate). */
  headers?: Record<string, string>;
  /** Total time budget per attempt, in ms. Default 15_000. */
  timeoutMs?: number;
  /** Max retry attempts after the first. Default: 2 (so 3 total attempts). */
  retries?: number;
  /** When false, skip Authorization header. Default: true. */
  authenticated?: boolean;
  /** Optional external AbortSignal (e.g. screen unmount) — composed with timeout. */
  signal?: AbortSignal;
  /** Optional override of the request id (mostly for tests). */
  requestId?: string;
}

// ---------------------------------------------------------------------------
// Compose two AbortSignals — when either fires, the returned signal aborts.
// React Native's runtime doesn't ship AbortSignal.any, so we polyfill.
// ---------------------------------------------------------------------------
const composeSignals = (a: AbortSignal, b?: AbortSignal | null): AbortSignal => {
  if (!b) return a;
  // Prefer the platform impl when available.
  const anyFn = (AbortSignal as any).any as ((s: AbortSignal[]) => AbortSignal) | undefined;
  if (typeof anyFn === 'function') return anyFn([a, b]);
  const ctrl = new AbortController();
  const onAbort = (reason: unknown) => ctrl.abort(reason);
  if (a.aborted) ctrl.abort((a as any).reason);
  else a.addEventListener('abort', () => onAbort((a as any).reason), { once: true });
  if (b.aborted) ctrl.abort((b as any).reason);
  else b.addEventListener('abort', () => onAbort((b as any).reason), { once: true });
  return ctrl.signal;
};

// ---------------------------------------------------------------------------
// Core request — used by api.ts, visionAPI.ts, productLookup.ts wrappers.
// ---------------------------------------------------------------------------
export async function httpJson<T = unknown>(url: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxAttempts = (opts.retries ?? 2) + 1;
  const authenticated = opts.authenticated !== false;
  const requestId = opts.requestId ?? newRequestId();

  let attempt = 0;
  let lastError: unknown = null;
  let forcedTokenRefresh = false;

  while (attempt < maxAttempts) {
    attempt++;
    const timeoutCtrl = new AbortController();
    const timer = setTimeout(() => timeoutCtrl.abort(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs);
    const signal = composeSignals(timeoutCtrl.signal, opts.signal);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        ...(opts.headers ?? {}),
      };

      if (authenticated) {
        const token = await fetchToken(forcedTokenRefresh);
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }

      const init: RequestInit = {
        method,
        headers,
        signal,
      };
      if (opts.body !== undefined && method !== 'GET') {
        init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
      }

      const res = await fetch(url, init);

      // 401 from our backend (or Clerk-fronted endpoint): if we haven't already
      // forced a refresh on this call, drop the cached token and retry once.
      if (res.status === 401 && authenticated && !forcedTokenRefresh && attempt < maxAttempts) {
        clearTimeout(timer);
        forcedTokenRefresh = true;
        clearAuthTokenCache();
        // No backoff — auth refresh is fast and the user is waiting.
        continue;
      }

      if (!res.ok) {
        // Read body once. Truncate to keep error messages bounded.
        let bodyText = '';
        try {
          bodyText = (await res.text()).slice(0, 500);
        } catch {
          // ignore — body unreadable
        }

        if (isRetryableStatus(res.status) && attempt < maxAttempts) {
          const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
          const wait = retryAfterMs ?? backoffMs(attempt);
          clearTimeout(timer);
          await sleep(wait);
          continue;
        }

        throw new ApiError(`API ${res.status}: ${bodyText || res.statusText || 'Request failed'}`, {
          status: res.status,
          body: bodyText,
          requestId,
        });
      }

      // 204 No Content — return undefined cast to T.
      if (res.status === 204) {
        clearTimeout(timer);
        return undefined as T;
      }

      // Some endpoints return non-JSON success bodies; let caller-typed T cover that.
      const ctype = res.headers.get('content-type') ?? '';
      if (ctype.includes('application/json')) {
        const json = (await res.json()) as T;
        clearTimeout(timer);
        return json;
      }
      const text = await res.text();
      clearTimeout(timer);
      return text as unknown as T;
    } catch (err) {
      clearTimeout(timer);

      const aborted = (err as any)?.name === 'AbortError' || timeoutCtrl.signal.aborted;
      if (aborted && opts.signal?.aborted) {
        // The caller cancelled — propagate immediately, no retry, wrap as ApiError(0).
        throw new ApiError('Request cancelled', { status: 0, requestId, aborted: true });
      }

      if (err instanceof ApiError) {
        // Already shaped — non-retryable status or final retry exhausted.
        lastError = err;
        // Only retry network-style ApiError(0) below; status-bearing ApiErrors stop here.
        if (err.status > 0) throw err;
      }

      if ((aborted || isRetryableError(err)) && attempt < maxAttempts) {
        lastError = err;
        await sleep(backoffMs(attempt));
        continue;
      }

      // Final failure. Normalise to ApiError so callers have a consistent surface.
      if (err instanceof ApiError) throw err;
      const msg = aborted
        ? `Request timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      throw new ApiError(msg, { status: 0, requestId, aborted });
    }
  }

  // Should be unreachable — the loop either returns or throws.
  if (lastError instanceof ApiError) throw lastError;
  throw new ApiError('Request failed after retries', { status: 0, requestId });
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------
export const isApiError = (err: unknown, status?: number): err is ApiError => {
  if (!(err instanceof ApiError)) return false;
  return status === undefined ? true : err.status === status;
};

/** True when the error came from a network/abort path, not the server. */
export const isNetworkError = (err: unknown): boolean => {
  if (err instanceof ApiError) return err.status === 0;
  return isRetryableError(err);
};
