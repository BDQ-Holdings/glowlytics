// At-rest encryption for the locally-persisted data blob (MOB-01).
//
// The Zustand store persists HIPAA-adjacent data (reproductive/cycle fields,
// HealthKit-derived metrics, skin/face model outputs) to AsyncStorage, which is
// plaintext on disk. We wrap that blob in AES-256-CTR. The symmetric key is
// generated once with a CSPRNG and kept in the OS keychain via expo-secure-store
// (iOS Keychain / Android Keystore) — never in AsyncStorage alongside the data.
//
// Payload format: `v1:<iv-hex>:<ciphertext-hex>`. The `v1:` tag lets `decryptJson`
// cheaply reject a legacy plaintext JSON blob (which starts with `{`) so the store
// can transparently migrate it on first load.
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import aesjs from 'aes-js';

const ENC_KEY_STORE = 'glowlytics_enc_key';
const PREFIX = 'v1';

let cachedKey: Uint8Array | null = null;

/** Lazily fetch (or first-time generate) the 256-bit key from the OS keychain. */
async function getKey(): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;
  const existing = await SecureStore.getItemAsync(ENC_KEY_STORE);
  if (existing) {
    const key = Uint8Array.from(aesjs.utils.hex.toBytes(existing));
    cachedKey = key;
    return key;
  }
  const fresh = await Crypto.getRandomBytesAsync(32); // 256-bit CSPRNG key
  await SecureStore.setItemAsync(ENC_KEY_STORE, aesjs.utils.hex.fromBytes(fresh));
  cachedKey = fresh;
  return fresh;
}

/** AES-256-CTR encrypt a JSON-serializable value. */
export async function encryptJson(value: unknown): Promise<string> {
  const key = await getKey();
  const iv = await Crypto.getRandomBytesAsync(16);
  const plaintext = aesjs.utils.utf8.toBytes(JSON.stringify(value));
  const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
  const ciphertext = ctr.encrypt(plaintext);
  return `${PREFIX}:${aesjs.utils.hex.fromBytes(iv)}:${aesjs.utils.hex.fromBytes(ciphertext)}`;
}

/**
 * Decrypt a payload produced by `encryptJson`. Throws if the input is not a
 * recognized encrypted payload (e.g. a legacy plaintext blob) — callers use that
 * signal to trigger a one-time plaintext→encrypted migration.
 */
export async function decryptJson(payload: string): Promise<unknown> {
  const parts = payload.split(':');
  if (parts.length !== 3 || parts[0] !== PREFIX || !parts[1] || !parts[2]) {
    throw new Error('secureStorage: unrecognized payload');
  }
  const key = await getKey();
  const iv = aesjs.utils.hex.toBytes(parts[1]);
  const ciphertext = aesjs.utils.hex.toBytes(parts[2]);
  const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
  const plaintext = ctr.decrypt(ciphertext);
  return JSON.parse(aesjs.utils.utf8.fromBytes(plaintext));
}
