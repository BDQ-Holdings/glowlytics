// src/services/api.ts
//
// Typed Glowlytics backend client. Thin wrapper around httpClient — every
// endpoint here inherits its retry/backoff/timeout/auth-refresh behaviour.

import type {
  UserProfile, ScanProtocol, ProductEntry, DailyRecord,
  ModelOutput, PrimaryGoal, ScanRegion,
} from '../types';

import { env } from '../config/env';
import {
  httpJson,
  setAuthTokenProvider as _setAuthTokenProvider,
  clearAuthTokenCache,
  ApiError,
  isApiError,
  type RequestOptions,
} from './httpClient';

const API_BASE = env.API_BASE_URL;

/** Re-exported so the existing setup site (app/_layout.tsx) keeps working. */
export const setAuthTokenProvider = _setAuthTokenProvider;
export { clearAuthTokenCache, ApiError, isApiError };

/**
 * Backwards-compat helper for the previous string-prefix check.
 * Prefer `isApiError(err, status)` for new code.
 */
export const isApiStatus = (err: unknown, status: number): boolean => {
  if (isApiError(err, status)) return true;
  // Old call sites threw plain `Error('API 409: ...')` — keep that path working.
  return err instanceof Error && err.message.startsWith(`API ${status}:`);
};

/**
 * Returns the headers we'd send today. Kept for callers that build their
 * own fetch (e.g. the SSE stream in visionAPI). New code should call
 * httpJson directly instead.
 */
export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  // Lazy-import the cached fetcher from httpClient to avoid duplicating the cache.
  // We intentionally re-call httpClient's path via a minimal helper:
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Use the cached token transparently by calling httpJson — but that's overkill
  // for header retrieval. Instead, expose a tiny helper that mirrors the cache.
  const token = await _peekAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// We don't want to duplicate the cache state here, so call into httpClient via
// a shared module-private helper. Re-export from httpClient when it's needed.
import { _peekAuthToken } from './httpClientInternal';

const request = <T>(path: string, opts: RequestOptions = {}): Promise<T> =>
  httpJson<T>(`${API_BASE}${path}`, opts);

// ---- Users ----
export const createUser = (data: Partial<UserProfile>) =>
  request<UserProfile>('/api/users', { method: 'POST', body: data });

export const getUser = (id: string) =>
  request<UserProfile>(`/api/users/${id}`);

export const updateUser = (id: string, data: Partial<UserProfile>) =>
  request<UserProfile>(`/api/users/${id}`, { method: 'PATCH', body: data });

export const deleteUser = (id: string) =>
  request<{ success: boolean; message?: string }>(`/api/users/${id}`, { method: 'DELETE' });

// ---- Protocols ----
export const createProtocol = (data: { user_id: string; primary_goal: PrimaryGoal; scan_region: ScanRegion; baseline_date?: string }) =>
  request<ScanProtocol>('/api/protocols', { method: 'POST', body: data });

export const getProtocol = (userId: string) =>
  request<ScanProtocol | null>(`/api/protocols/${userId}`);

// ---- Products ----
export const addProduct = (data: Omit<ProductEntry, 'user_product_id'>) =>
  request<ProductEntry>('/api/products', { method: 'POST', body: data });

export const getProducts = (userId: string) =>
  request<ProductEntry[]>(`/api/products/${userId}`);

export const deleteProduct = (id: string) =>
  request<{ success: boolean }>(`/api/products/${id}`, { method: 'DELETE' });

// ---- Daily Records ----
export const addDailyRecord = (data: Omit<DailyRecord, 'daily_id'>) =>
  request<DailyRecord>('/api/daily-records', { method: 'POST', body: data });

export const getDailyRecords = (userId: string, days = 30) =>
  request<DailyRecord[]>(`/api/daily-records/${userId}?days=${days}`);

// ---- Model Outputs ----
export const addModelOutput = (data: Omit<ModelOutput, 'output_id'>) =>
  request<ModelOutput>('/api/model-outputs', { method: 'POST', body: data });

export const getModelOutputs = (userId: string, days = 30) =>
  request<ModelOutput[]>(`/api/model-outputs/${userId}?days=${days}`);

// ---- Reports ----
export const createReport = (data: { user_id: string; date_range: string; included_fields?: string[] }) =>
  request<{ report_id: string; report_uri: string }>('/api/reports', { method: 'POST', body: data });

export const getReports = (userId: string) =>
  request<Array<{ report_id: string; date_range: string; report_uri: string; shared_at?: string }>>(`/api/reports/${userId}`);

// ---- Product Lookup ----
//
// These call our backend (which hits a curated DB + 3rd party APIs). They're
// idempotent reads, so retry is safe. The longer 30s timeout on photo identify
// covers GPT-4 vision latency.
export const lookupBarcode = (barcode: string) =>
  request<{ name: string; brands: string; ingredients: string; image_url: string | null; source: string }>(
    `/api/products/lookup/${encodeURIComponent(barcode)}`,
  );

export const searchProducts = (query: string, signal?: AbortSignal) =>
  request<Array<{ name: string; brands: string; ingredients: string; image_url: string | null; source: string }>>(
    `/api/products/search?q=${encodeURIComponent(query)}`,
    {
      signal,
      // Search is interactive — keep total ceiling well under our default
      // backend SLO (2s external + ~200ms overhead) and skip retries; the
      // user is faster than our backoff.
      timeoutMs: 6_000,
      retries: 0,
    },
  );

export interface PhotoIdentifyResult {
  identified: boolean;
  name: string;
  brand: string;
  ingredients: string[];
  confidence: 'low' | 'med' | 'high';
  source?: string;
  error?: string;
}

export const identifyProductPhoto = (image_base64: string) =>
  request<PhotoIdentifyResult>('/api/products/identify-photo', {
    method: 'POST',
    body: { image_base64 },
    timeoutMs: 30_000,
    // Photo identify is expensive (vision model). One retry at most so we
    // don't double-charge OpenAI on transient hiccups.
    retries: 1,
  });
