// Exercises the REAL AES-256-CTR implementation. Other suites get the passthrough
// manual mock (src/services/__mocks__/secureStorage.ts); here we bypass it with
// requireActual and stub only the native keychain + CSPRNG.
//
// NB: jest hoists jest.mock() above all imports/vars, so the factory closures may
// only reference variables prefixed with `mock` (jest's documented exception).
// We reset modules per test so the module-level key cache starts fresh each time.
import type * as SecureStorageModule from '../secureStorage';
import aesjs from 'aes-js';

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
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytesAsync: (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      mockSeed = (mockSeed * 1103515245 + 12345) & 0x7fffffff;
      out[i] = (mockSeed >> 8) & 0xff;
    }
    return Promise.resolve(out);
  },
  // Real SHA-256 so the module's HMAC-SHA256 integrity tag is genuinely verified.
  digest: (_alg: string, data: Uint8Array) => {
    const nodeCrypto = require('crypto');
    const buf = nodeCrypto.createHash('sha256').update(Buffer.from(data)).digest();
    return Promise.resolve(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );
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
    expect(cipher.startsWith('v2:')).toBe(true); // authenticated AES-256-CTR + HMAC
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

  it('rejects a v2 payload with a tampered ciphertext (no silent garbage)', async () => {
    const { encryptJson, decryptJson } = load();
    const cipher = await encryptJson({ secret: 'xyz', n: 7 });
    expect(cipher.startsWith('v2:')).toBe(true);
    const [v, iv, tag, ct] = cipher.split(':');
    const flippedCt = ct.slice(0, -1) + (ct.slice(-1) === '0' ? '1' : '0');
    await expect(decryptJson(`${v}:${iv}:${tag}:${flippedCt}`)).rejects.toThrow();
  });

  it('rejects a v2 payload with a tampered auth tag', async () => {
    const { encryptJson, decryptJson } = load();
    const cipher = await encryptJson({ secret: 'abc' });
    const [v, iv, tag, ct] = cipher.split(':');
    const flippedTag = tag.slice(0, -1) + (tag.slice(-1) === '0' ? '1' : '0');
    await expect(decryptJson(`${v}:${iv}:${flippedTag}:${ct}`)).rejects.toThrow();
  });

  it('rejects a well-formed legacy v1 blob (downgrade-proof)', async () => {
    const { encryptJson, decryptJson } = load();
    // Force key generation, then hand-craft a VALID v1 (CTR-only) blob with that key.
    await encryptJson({ seed: true });
    const keyHex = mockKeychain.get('glowlytics_enc_key')!;
    const key = Uint8Array.from(aesjs.utils.hex.toBytes(keyHex));
    const legacyValue = { user: { sex: 'female' }, legacy: true };
    const iv = new Uint8Array(16).fill(7);
    const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
    const ct = ctr.encrypt(aesjs.utils.utf8.toBytes(JSON.stringify(legacyValue)));
    const v1 = `v1:${aesjs.utils.hex.fromBytes(iv)}:${aesjs.utils.hex.fromBytes(ct)}`;
    // Even though the CTR ciphertext IS decryptable with the key, v1 is rejected on
    // read so an attacker with at-rest write access cannot downgrade a v2 blob to
    // unauthenticated v1 and bit-flip it past the HMAC.
    await expect(decryptJson(v1)).rejects.toThrow(/v1|integrity|rejected|unrecognized/i);
    // The same value stored as authenticated v2 still round-trips (migration path).
    await expect(decryptJson(await encryptJson(legacyValue))).resolves.toEqual(legacyValue);
  });
});
