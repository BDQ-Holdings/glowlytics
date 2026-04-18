// src/services/api.ts
// Typed API client for Glowlytics backend with Clerk auth token injection

import type {
  UserProfile, ScanProtocol, ProductEntry, DailyRecord,
  ModelOutput, PrimaryGoal, ScanRegion,
} from '../types';

import { env } from '../config/env';

const API_BASE = env.API_BASE_URL;

let getAuthToken: (() => Promise<string | null>) | null = null;

/** Call once at app init to wire Clerk's getToken function */
export const setAuthTokenProvider = (provider: () => Promise<string | null>) => {
  getAuthToken = provider;
};

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (getAuthToken) {
    const token = await getAuthToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
  }
  return h;
};

const request = async <T>(path: string, options: RequestInit = {}, timeoutMs = 15_000): Promise<T> => {
  const h = await getAuthHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...h, ...options.headers as Record<string, string> },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => 'Unknown error');
      throw new Error(`API ${res.status}: ${body}`);
    }
    return res.json();
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`API timeout after ${timeoutMs}ms: ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

// ---- Users ----
export const createUser = (data: Partial<UserProfile>) =>
  request<UserProfile>('/api/users', { method: 'POST', body: JSON.stringify(data) });

export const getUser = (id: string) =>
  request<UserProfile>(`/api/users/${id}`);

export const updateUser = (id: string, data: Partial<UserProfile>) =>
  request<UserProfile>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// ---- Protocols ----
export const createProtocol = (data: { user_id: string; primary_goal: PrimaryGoal; scan_region: ScanRegion; baseline_date?: string }) =>
  request<ScanProtocol>('/api/protocols', { method: 'POST', body: JSON.stringify(data) });

export const getProtocol = (userId: string) =>
  request<ScanProtocol | null>(`/api/protocols/${userId}`);

// ---- Products ----
export const addProduct = (data: Omit<ProductEntry, 'user_product_id'>) =>
  request<ProductEntry>('/api/products', { method: 'POST', body: JSON.stringify(data) });

export const getProducts = (userId: string) =>
  request<ProductEntry[]>(`/api/products/${userId}`);

export const deleteProduct = (id: string) =>
  request<{ success: boolean }>(`/api/products/${id}`, { method: 'DELETE' });

// ---- Daily Records ----
export const addDailyRecord = (data: Omit<DailyRecord, 'daily_id'>) =>
  request<DailyRecord>('/api/daily-records', { method: 'POST', body: JSON.stringify(data) });

export const getDailyRecords = (userId: string, days = 30) =>
  request<DailyRecord[]>(`/api/daily-records/${userId}?days=${days}`);

// ---- Model Outputs ----
export const addModelOutput = (data: Omit<ModelOutput, 'output_id'>) =>
  request<ModelOutput>('/api/model-outputs', { method: 'POST', body: JSON.stringify(data) });

export const getModelOutputs = (userId: string, days = 30) =>
  request<ModelOutput[]>(`/api/model-outputs/${userId}?days=${days}`);

// ---- Reports ----
export const createReport = (data: { user_id: string; date_range: string; included_fields?: string[] }) =>
  request<{ report_id: string; report_uri: string }>('/api/reports', { method: 'POST', body: JSON.stringify(data) });

export const getReports = (userId: string) =>
  request<Array<{ report_id: string; date_range: string; report_uri: string; shared_at?: string }>>(`/api/reports/${userId}`);

// ---- Product Lookup ----
export const lookupBarcode = (barcode: string) =>
  request<{ name: string; brands: string; ingredients: string; image_url: string | null; source: string }>(`/api/products/lookup/${encodeURIComponent(barcode)}`);

export const searchProducts = (query: string) =>
  request<Array<{ name: string; brands: string; ingredients: string; image_url: string | null; source: string }>>(`/api/products/search?q=${encodeURIComponent(query)}`);

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
    body: JSON.stringify({ image_base64 }),
  }, 30_000);
