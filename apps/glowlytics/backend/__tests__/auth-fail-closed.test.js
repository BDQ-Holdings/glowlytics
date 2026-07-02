/**
 * Fail-closed auth: when CLERK_ISSUER_URL is configured, the JWT is ALWAYS
 * verified — NODE_ENV=development no longer admits anonymous callers as
 * 'dev-user'. The dev passthrough exists only for issuer-less local setups.
 *
 * Mirrors the mocking harness of security-backend.test.js so requiring ../app
 * never opens a real connection. jwks-rsa resolves to the repo manual mock,
 * whose getSigningKey always errors — so any Bearer token fails verification
 * here, which is exactly what these tests want.
 */

process.env.NODE_ENV = 'development';
process.env.CLERK_ISSUER_URL = 'https://clerk.glowlytics.test';

const mockQuery = jest.fn();
jest.mock('pg', () => {
  const mockPool = { query: (...args) => mockQuery(...args) };
  return { Pool: jest.fn(() => mockPool) };
});

jest.mock('openai', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../rag', () => ({
  seedGuidelines: jest.fn(),
  queryGuidelines: jest.fn().mockResolvedValue([]),
  queryGuidelinesMulti: jest.fn().mockResolvedValue([]),
}));

const request = require('supertest');
const app = require('../app');

afterAll(() => {
  // jest runs with maxWorkers=1, so process.env is shared across test files —
  // don't leak the issuer into files that rely on the issuer-less passthrough.
  delete process.env.CLERK_ISSUER_URL;
});

describe('auth fails closed when CLERK_ISSUER_URL is set (even in development)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('unauthenticated request → 401, not dev-user passthrough', async () => {
    const res = await request(app).get('/api/users/dev-user');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
    expect(mockQuery).not.toHaveBeenCalled(); // rejected before any handler ran
  });

  test('garbage Bearer token → 401 Invalid token, never a synthetic user', async () => {
    const res = await request(app)
      .get('/api/users/dev-user')
      .set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
