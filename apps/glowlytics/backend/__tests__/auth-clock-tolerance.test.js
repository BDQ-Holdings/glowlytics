/**
 * app.js authMiddleware — Clerk session-JWT clock tolerance.
 *
 * Clerk session JWTs live only ~60s. With zero clock tolerance, minor
 * device/server clock skew (or sitting on the iat/nbf boundary) made
 * jwt.verify throw, surfacing as spurious 401 "Invalid token" responses
 * and logging the user out mid-session. authMiddleware now passes
 * clockTolerance: 30 to jwt.verify.
 *
 * These tests exercise the REAL jsonwebtoken verification path: the project's
 * shared jwks-rsa mock can't return a usable key, so we replace only the
 * getKey callback with a static RSA public key and let jsonwebtoken's actual
 * verify logic run (so exp/nbf/clockTolerance checks are genuine, not faked).
 */

const crypto = require('crypto');
const request = require('supertest');

// Real RSA keypair (RS256 requires >= 2048-bit). mock-prefixed so the
// jest.mock factory below may reference it.
const { publicKey: mockPublicKey, privateKey: mockPrivateKey } =
  crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

// Keep jsonwebtoken's real verify logic, but feed it the static public key in
// place of authMiddleware's jwks-rsa getKey callback (which the shared mock
// can't satisfy). This proves the clockTolerance option actually governs
// acceptance/rejection through the real library.
jest.mock('jsonwebtoken', () => {
  const actual = jest.requireActual('jsonwebtoken');
  return {
    ...actual,
    verify: (token, _key, options, callback) =>
      actual.verify(token, mockPublicKey, options, callback),
  };
});

// External services mocked at module level (mirrors integration.test.js).
jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
    embeddings: { create: jest.fn() },
  })),
);

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));

jest.mock('../rag', () => ({
  seedGuidelines: jest.fn(),
  queryGuidelines: jest.fn(),
  queryGuidelinesMulti: jest.fn().mockResolvedValue([]),
}));

const ISSUER = 'https://clerk.glowlytics.test';
const USER_ID = 'user_clocktest';

let app;
let jwt;

beforeAll(() => {
  // Force real verification (not the dev/passthrough branch) and give app.js a
  // CLERK_ISSUER_URL so the jwks-rsa client is constructed.
  process.env.NODE_ENV = 'test';
  process.env.CLERK_ISSUER_URL = ISSUER;
  delete process.env.CLERK_AUDIENCE;

  jwt = require('jsonwebtoken'); // .sign is the real impl (spread above)
  app = require('../app');
});

beforeEach(() => {
  delete process.env.CLERK_AUDIENCE;
  // A matching row so a *passing* auth yields 200 (distinct from 401/403).
  mockQuery.mockResolvedValue({ rows: [{ user_id: USER_ID }] });
});

function sign({ exp, nbf, aud } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: USER_ID,
    sid: 'sess_1',
    iss: ISSUER,
    exp: exp == null ? now + 60 : exp,
  };
  if (nbf != null) payload.nbf = nbf;
  if (aud != null) payload.aud = aud;
  return jwt.sign(payload, mockPrivateKey, { algorithm: 'RS256' });
}

function get(token) {
  const req = request(app).get(`/api/users/${USER_ID}`);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

test('rejects a request with no token in real-verify mode', async () => {
  const res = await get();
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('Authentication required');
});

test('accepts a session JWT expired within the 30s clock-tolerance window', async () => {
  // 15s past expiry — a realistic minor-skew case that previously 401'd.
  const now = Math.floor(Date.now() / 1000);
  const res = await get(sign({ exp: now - 15 }));
  expect(res.status).toBe(200);
  expect(res.body.user_id).toBe(USER_ID);
});

test('accepts a session JWT whose nbf is slightly in the future (within tolerance)', async () => {
  const now = Math.floor(Date.now() / 1000);
  const res = await get(sign({ nbf: now + 15 }));
  expect(res.status).toBe(200);
  expect(res.body.user_id).toBe(USER_ID);
});

test('still rejects a grossly-expired session JWT (beyond tolerance) with 401 Invalid token', async () => {
  const now = Math.floor(Date.now() / 1000);
  const res = await get(sign({ exp: now - 120 }));
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('Invalid token');
});

describe('optional audience branch is preserved', () => {
  test('accepts a token whose aud matches CLERK_AUDIENCE', async () => {
    process.env.CLERK_AUDIENCE = 'glowlytics-api';
    const res = await get(sign({ aud: 'glowlytics-api' }));
    expect(res.status).toBe(200);
  });

  test('rejects a token whose aud does not match CLERK_AUDIENCE', async () => {
    process.env.CLERK_AUDIENCE = 'glowlytics-api';
    const res = await get(sign({ aud: 'some-other-api' }));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });
});
