import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { TokenCache } from '@clerk/clerk-expo';
import { env } from './env';

/**
 * Decode a JWT payload without verifying signature.
 * Used only for lightweight issuer host checks to avoid cross-instance token reuse.
 */
type JwtPayload = {
  iss?: string;
};

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    if (typeof globalThis.atob !== 'function') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null; // Not a JWT — let Clerk handle it
    // base64url → standard base64
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    const decoded = JSON.parse(globalThis.atob(payload));
    if (!decoded || typeof decoded !== 'object') return null;
    return decoded as JwtPayload;
  } catch {
    return null;
  }
}

function isTokenForCurrentInstance(token: string): boolean {
  const expectedHost = env.CLERK_INSTANCE_HOST;
  if (!expectedHost || expectedHost === 'unknown') return true;
  const payload = decodeJwtPayload(token);
  const issuer = payload?.iss;
  if (typeof issuer !== 'string' || issuer.length === 0) return true;
  return issuer.includes(expectedHost);
}

const scopeTokenKey = (key: string) => `clerk:${env.CLERK_INSTANCE_HOST}:${key}`;

const createTokenCache = (): TokenCache => {
  return {
    getToken: async (key: string) => {
      try {
        if (Platform.OS === 'web') return null;

        const scopedKey = scopeTokenKey(key);
        const scopedToken = await SecureStore.getItemAsync(scopedKey);
        if (scopedToken) {
          if (!isTokenForCurrentInstance(scopedToken)) {
            SecureStore.deleteItemAsync(scopedKey).catch(() => {});
            if (__DEV__) console.warn(`[TokenCache] Dropped scoped token with mismatched issuer for ${scopedKey}`);
            return null;
          }
          // Do not proactively clear by exp here.
          // Clerk should decide whether to refresh/reuse cached tokens.
          // Eager expiry pruning can cause unnecessary re-auth on app relaunch.
          return scopedToken;
        }

        // Legacy key (before host scoping). Migrate only if issuer matches current Clerk host.
        const legacyToken = await SecureStore.getItemAsync(key);
        if (!legacyToken) return null;

        if (!isTokenForCurrentInstance(legacyToken)) {
          SecureStore.deleteItemAsync(key).catch(() => {});
          if (__DEV__) console.warn(`[TokenCache] Dropped legacy token with mismatched issuer for ${key}`);
          return null;
        }

        await SecureStore.setItemAsync(scopedKey, legacyToken);
        SecureStore.deleteItemAsync(key).catch(() => {});
        if (__DEV__) console.log(`[TokenCache] Migrated legacy token to scoped key: ${scopedKey}`);
        return legacyToken;
      } catch {
        return null;
      }
    },
    saveToken: async (key: string, token: string) => {
      try {
        if (Platform.OS === 'web') return;
        await SecureStore.setItemAsync(scopeTokenKey(key), token);
      } catch {
        // silently fail on save errors
      }
    },
    clearToken: (key: string) => {
      try {
        if (Platform.OS === 'web') return;
        SecureStore.deleteItemAsync(scopeTokenKey(key));
        SecureStore.deleteItemAsync(key);
      } catch {
        // silently fail on clear errors
      }
    },
  };
};

export const tokenCache = createTokenCache();
