import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { TokenCache } from '@clerk/clerk-expo';
import { env } from './env';

/**
 * Peek at the `exp` claim in a JWT without verifying the signature.
 * Returns true if the token expired more than 60s ago (clearly stale).
 * Tokens that are fresh or unparseable return false → let Clerk handle them.
 *
 * This eliminates the FAPI network round-trip Clerk would make to validate
 * an obviously expired token, saving 1-3s on cold start for returning users
 * whose session has lapsed.
 */
type JwtPayload = {
  exp?: number;
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

function isJwtExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  // Only short-circuit if expired by more than 60s (safe buffer for clock skew)
  return payload.exp * 1000 < Date.now() - 60_000;
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
          if (isJwtExpired(scopedToken)) {
            // Clear stale token so Clerk skips network validation entirely
            SecureStore.deleteItemAsync(scopedKey).catch(() => {});
            if (__DEV__) console.log('[TokenCache] Cleared expired token for key:', scopedKey);
            return null;
          }
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

        if (isJwtExpired(legacyToken)) {
          SecureStore.deleteItemAsync(key).catch(() => {});
          if (__DEV__) console.log('[TokenCache] Cleared expired legacy token for key:', key);
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
