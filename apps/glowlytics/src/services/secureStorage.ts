// At-rest encryption for the locally-persisted data blob (MOB-01).
//
// The Zustand store persists HIPAA-adjacent data (reproductive/cycle fields,
// HealthKit-derived metrics, skin/face model outputs) to AsyncStorage, which is
// plaintext on disk. The symmetric key is generated once with a CSPRNG and kept
// in the OS keychain via expo-secure-store (iOS Keychain / Android Keystore) —
// never in AsyncStorage alongside the data.
//
// Authenticated-encryption scheme (MO1):
//   New writes use `v2:<iv-hex>:<tag-hex>:<ciphertext-hex>` — AES-256-CTR for
//   confidentiality, with an HMAC-SHA256 tag over `v2:<iv>:<ciphertext>`
//   (Encrypt-then-MAC) so any tamper to the IV, tag, or ciphertext — or a
//   downgrade of the version label — is detected and rejected on read.
//
//   AES-256-GCM would be the one-shot AEAD of choice, but neither aes-js (CTR/
//   CBC/CFB/OFB/ECB only) nor expo-crypto (digest + CSPRNG only) exposes GCM in
//   this RN runtime, so we compose CTR + HMAC-SHA256 — the standard
//   Encrypt-then-MAC construction — which gives the same integrity guarantee.
//
//   Legacy `v1:` blobs (AES-256-CTR, NO integrity) are REJECTED on read, not
//   decrypted: accepting them would let an attacker with at-rest write access
//   downgrade a v2 blob to v1 and exploit CTR malleability to defeat the MAC.
//   A v1 (or plaintext) blob is treated as absent, so the store re-seeds from
//   defaults and persists a fresh v2 payload on the next write. (v1 only ever
//   existed pre-MO1, so there is no production v1 data to migrate.)
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import aesjs from 'aes-js';

const ENC_KEY_STORE = 'glowlytics_enc_key';
const PREFIX = 'v2'; // authenticated: AES-256-CTR + HMAC-SHA256 (Encrypt-then-MAC)
const LEGACY_PREFIX = 'v1'; // read-only back-compat: AES-256-CTR, no integrity
const SHA256_BLOCK_BYTES = 64;

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

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  // bytes is always ArrayBuffer-backed at runtime; narrow for TS5.7 Uint8Array<ArrayBufferLike>.
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>);
  return new Uint8Array(digest);
}

/**
 * HMAC-SHA256(key, data), built over expo-crypto's SHA-256 digest because the
 * RN crypto layer (aes-js + expo-crypto) exposes no HMAC primitive. Standard
 * construction: H((K0 ^ opad) || H((K0 ^ ipad) || data)).
 */
async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  let k = key;
  if (k.length > SHA256_BLOCK_BYTES) k = await sha256(k);
  const k0 = new Uint8Array(SHA256_BLOCK_BYTES); // zero-padded to the block size
  k0.set(k);
  const ipad = new Uint8Array(SHA256_BLOCK_BYTES);
  const opad = new Uint8Array(SHA256_BLOCK_BYTES);
  for (let i = 0; i < SHA256_BLOCK_BYTES; i++) {
    ipad[i] = k0[i] ^ 0x36;
    opad[i] = k0[i] ^ 0x5c;
  }
  const inner = await sha256(concatBytes(ipad, data));
  return sha256(concatBytes(opad, inner));
}

/** Constant-time byte comparison; avoids early-exit timing leaks on the tag. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Authentication input for Encrypt-then-MAC: binds version, IV, and ciphertext. */
function macInput(ivHex: string, ciphertextHex: string): Uint8Array {
  return aesjs.utils.utf8.toBytes(`${PREFIX}:${ivHex}:${ciphertextHex}`);
}

/** AES-256-CTR encrypt + HMAC-SHA256 authenticate a JSON-serializable value. */
export async function encryptJson(value: unknown): Promise<string> {
  const key = await getKey();
  const iv = await Crypto.getRandomBytesAsync(16);
  const plaintext = aesjs.utils.utf8.toBytes(JSON.stringify(value));
  const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
  const ciphertext = ctr.encrypt(plaintext);
  const ivHex = aesjs.utils.hex.fromBytes(iv);
  const ciphertextHex = aesjs.utils.hex.fromBytes(ciphertext);
  const tag = await hmacSha256(key, macInput(ivHex, ciphertextHex));
  return `${PREFIX}:${ivHex}:${aesjs.utils.hex.fromBytes(tag)}:${ciphertextHex}`;
}

/**
 * Decrypt a payload produced by `encryptJson`. v2 payloads are integrity-checked
 * before decryption — a tampered IV, tag, or ciphertext is REJECTED (throws),
 * never silently returned as garbage. Legacy v1 (unauthenticated CTR) blobs are
 * REJECTED (throws), not decrypted — accepting them would reopen a downgrade
 * attack on the v2 integrity guarantee. Any unrecognized/plaintext blob also
 * throws; callers treat a throw as "no stored value" and re-seed the store
 * (which then persists a fresh authenticated v2 payload).
 */
export async function decryptJson(payload: string): Promise<unknown> {
  const parts = payload.split(':');
  const version = parts[0];
  const key = await getKey();

  if (version === PREFIX) {
    if (parts.length !== 4 || !parts[1] || !parts[2] || !parts[3]) {
      throw new Error('secureStorage: unrecognized payload');
    }
    const [, ivHex, tagHex, ciphertextHex] = parts;
    let provided: Uint8Array;
    try {
      provided = Uint8Array.from(aesjs.utils.hex.toBytes(tagHex));
    } catch {
      throw new Error('secureStorage: integrity check failed');
    }
    const expected = await hmacSha256(key, macInput(ivHex, ciphertextHex));
    if (!timingSafeEqual(expected, provided)) {
      throw new Error('secureStorage: integrity check failed');
    }
    const iv = aesjs.utils.hex.toBytes(ivHex);
    const ciphertext = aesjs.utils.hex.toBytes(ciphertextHex);
    const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
    const plaintext = ctr.decrypt(ciphertext);
    return JSON.parse(aesjs.utils.utf8.fromBytes(plaintext));
  }

  // Legacy v1 (AES-256-CTR, NO integrity) is intentionally REJECTED. Accepting
  // it would let an attacker with at-rest write access relabel a v2 blob as v1
  // and bit-flip the malleable CTR ciphertext to bypass the HMAC (a downgrade
  // attack). A v1 blob is treated as absent → the store re-seeds and persists a
  // fresh authenticated v2 payload on the next write.
  if (version === LEGACY_PREFIX) {
    throw new Error('secureStorage: legacy v1 payload rejected (no integrity)');
  }

  throw new Error('secureStorage: unrecognized payload');
}
