import type * as EnvModule from '../env';

// env.ts runs its validation at module load (the HTTPS guard throws there), so each
// case must (re)load the module fresh under a controlled __DEV__ + API base URL.
type DevGlobal = typeof globalThis & { __DEV__?: boolean };

const withDev = (value: boolean, fn: () => void): void => {
  const g = globalThis as DevGlobal;
  const prev = g.__DEV__;
  g.__DEV__ = value;
  try {
    fn();
  } finally {
    g.__DEV__ = prev;
  }
};

const loadEnv = (apiBaseUrl: string): typeof EnvModule => {
  process.env.EXPO_PUBLIC_API_BASE_URL = apiBaseUrl;
  let captured: typeof EnvModule | undefined;
  jest.isolateModules(() => {
    captured = require('../env') as typeof EnvModule;
  });
  if (!captured) throw new Error('env module did not load');
  return captured;
};

describe('env API base URL — MOB-04 HTTPS enforcement', () => {
  const ORIGINAL_API = process.env.EXPO_PUBLIC_API_BASE_URL;
  const ORIGINAL_CLERK = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  beforeEach(() => {
    // A fake test Clerk key keeps the unrelated "missing key" branch quiet without
    // affecting the URL guard under test.
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_fake';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (ORIGINAL_API === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = ORIGINAL_API;
    if (ORIGINAL_CLERK === undefined) delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = ORIGINAL_CLERK;
  });

  it('throws in a production build when the API base URL is not https', () => {
    withDev(false, () => {
      expect(() => loadEnv('http://api.glowlytics.app')).toThrow(/https/i);
    });
  });

  it('throws in a production build for an http://localhost URL left in a release', () => {
    withDev(false, () => {
      expect(() => loadEnv('http://localhost:3001')).toThrow(/https/i);
    });
  });

  it('accepts an https URL in a production build', () => {
    withDev(false, () => {
      const env = loadEnv('https://api.glowlytics.app');
      expect(env.env.API_BASE_URL).toBe('https://api.glowlytics.app');
    });
  });

  it('keeps the local http://localhost dev workflow working (no throw in dev)', () => {
    withDev(true, () => {
      const env = loadEnv('http://localhost:3001');
      expect(env.env.API_BASE_URL).toBe('http://localhost:3001');
    });
  });
});
