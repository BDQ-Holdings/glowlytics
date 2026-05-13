interface EnvConfig {
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_INSTANCE_HOST: string;
  CLERK_KEY_ENV: 'live' | 'test' | 'unknown';
  API_BASE_URL: string;
  REVENUECAT_API_KEY: string;
  POSTHOG_API_KEY: string;
  ENABLE_APPLE_OAUTH: boolean;
  ENABLE_GOOGLE_OAUTH: boolean;
}

const resolvedApiUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const resolvedClerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value == null || value.trim().length === 0) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
};

const decodeClerkHost = (pk: string): string => {
  try {
    const encoded = pk.split('_').slice(2).join('_');
    if (typeof globalThis.atob !== 'function') return 'unknown';
    return globalThis.atob(encoded).replace(/\$$/, '') || 'unknown';
  } catch {
    return 'unknown';
  }
};

const resolvedClerkHost = decodeClerkHost(resolvedClerkKey);
const resolvedClerkEnv: 'live' | 'test' | 'unknown' = resolvedClerkKey.startsWith('pk_live_')
  ? 'live'
  : resolvedClerkKey.startsWith('pk_test_')
    ? 'test'
    : 'unknown';

// Warn if production build is accidentally pointed at localhost
if (!__DEV__ && resolvedApiUrl.includes('localhost')) {
  console.error('[ENV] API_BASE_URL points to localhost in a production build — API calls will fail');
}

if (!resolvedClerkKey) {
  console.error('[ENV] EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is missing — auth will fail.');
} else if (__DEV__ && resolvedClerkKey.startsWith('pk_live_')) {
  console.warn('[ENV] Running a dev build with a LIVE Clerk key. If OAuth is configured only on your test Clerk instance, Apple/Google sign-in will fail.');
}
if (__DEV__ && resolvedClerkKey) {
  console.log(`[ENV] Clerk key loaded (${resolvedClerkEnv}) → ${resolvedClerkHost}`);
}

export const env: EnvConfig = {
  CLERK_PUBLISHABLE_KEY: resolvedClerkKey,
  CLERK_INSTANCE_HOST: resolvedClerkHost,
  CLERK_KEY_ENV: resolvedClerkEnv,
  API_BASE_URL: resolvedApiUrl,
  REVENUECAT_API_KEY:
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '',
  POSTHOG_API_KEY:
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '',
  // Defaults true: rendering is also gated on Clerk's supportedFirstFactors at runtime,
  // so an unset env var won't surface a button the Clerk instance doesn't actually support.
  // Apple Guideline 4.8 requires Sign in with Apple whenever a third-party sign-in is offered.
  ENABLE_APPLE_OAUTH: parseBooleanEnv(process.env.EXPO_PUBLIC_ENABLE_APPLE_OAUTH, true),
  ENABLE_GOOGLE_OAUTH: parseBooleanEnv(process.env.EXPO_PUBLIC_ENABLE_GOOGLE_OAUTH, true),
};
