// Exercises the REAL AES-256-CTR implementation. Other suites get the passthrough
// manual mock (src/services/__mocks__/secureStorage.ts); here we bypass it with
// requireActual and stub only the native keychain + CSPRNG.
//
// NB: jest hoists jest.mock() above all imports/vars, so the factory closures may
// only reference variables prefixed with `mock` (jest's documented exception).
// We reset modules per test so the module-level key cache starts fresh each time.
import type * as SecureStorageModule from '../secureStorage';

const mockKeychain = new Map<string, string>();
// Deterministic-but-varying byte source: distinct on each call so successive
// encrypts get different IVs (and the first call yields a stable key).
let mockSeed = 0x12345;

jest.mock('expo-secure-store', () => ({
  getItemAsync: (k: string) => Promise.resolve(mockKeychain.get(k) ?? null),
  setItemAsync: (k: string, v: string) => {
    mockKeychain.set(k, v);
    return Promise.resolve();
  },
}));

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      mockSeed = (mockSeed * 1103515245 + 12345) & 0x7fffffff;
      out[i] = (mockSeed >> 8) & 0xff;
    }
    return Promise.resolve(out);
  },
}));

const load = () => jest.requireActual('../secureStorage') as typeof SecureStorageModule;

describe('secureStorage AES layer', () => {
  beforeEach(() => {
    jest.resetModules();
    mockKeychain.clear();
    mockSeed = 0x12345;
  });

  it('round-trips a JSON value through encrypt/decrypt', async () => {
    const { encryptJson, decryptJson } = load();
    const value = {
      user: { sex: 'female', menstrual_status: 'regular' },
      modelOutputs: [{ daily_id: 'd1', scores: { hydration: 72 } }],
      n: 42,
      flag: true,
    };
    const cipher = await encryptJson(value);
    expect(cipher.startsWith('v1:')).toBe(true);
    expect(cipher).not.toContain('menstrual_status'); // not plaintext
    await expect(decryptJson(cipher)).resolves.toEqual(value);
  });

  it('produces a different ciphertext each time (random IV)', async () => {
    const { encryptJson, decryptJson } = load();
    const a = await encryptJson({ x: 1 });
    const b = await encryptJson({ x: 1 });
    expect(a).not.toBe(b);
    await expect(decryptJson(a)).resolves.toEqual({ x: 1 });
    await expect(decryptJson(b)).resolves.toEqual({ x: 1 });
  });

  it('persists the key to the keychain and reuses it', async () => {
    const { encryptJson } = load();
    await encryptJson({ x: 1 });
    expect(mockKeychain.has('glowlytics_enc_key')).toBe(true);
    const keyAfterFirst = mockKeychain.get('glowlytics_enc_key');
    await encryptJson({ y: 2 });
    expect(mockKeychain.get('glowlytics_enc_key')).toBe(keyAfterFirst);
  });

  it('throws on a legacy plaintext blob so callers can migrate', async () => {
    const { decryptJson } = load();
    await expect(decryptJson('{"user":{"sex":"male"}}')).rejects.toThrow();
    await expect(decryptJson('v1:deadbeef')).rejects.toThrow();
  });
});
