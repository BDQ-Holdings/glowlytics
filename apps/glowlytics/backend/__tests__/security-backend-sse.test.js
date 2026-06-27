/**
 * Security hardening regression test — BACKEND B2 (SSE error leak).
 *
 * POST /api/vision/generate-insights streams via SSE. When an error is thrown
 * AFTER the headers have flushed (mid-stream), the catch block writes an SSE
 * error frame. Before the fix it wrote the raw err.message; in production that
 * leaks internal detail. The fix routes it through safeErrorMessage(), which
 * returns 'Internal server error' in production.
 *
 * This runs with NODE_ENV=production (so safeErrorMessage redacts) and therefore
 * must satisfy authMiddleware: jsonwebtoken is mocked to accept any Bearer token,
 * and CLERK_ISSUER_URL is set so app.js builds a (never-queried) JWKS client and
 * takes the verify branch. no-llm-fallback is partially mocked so isLLMDisabled()
 * is false and we reach the streaming path.
 */

process.env.NODE_ENV = 'production';
process.env.CLERK_ISSUER_URL = 'https://clerk.glowlytics.test';
process.env.CORS_ORIGINS = 'https://app.glowlytics.test'; // app.js fails closed in prod without it

// Accept any Bearer token -> synthetic verified user, so the protected route runs.
jest.mock('jsonwebtoken', () => ({
  verify: (_token, _getKey, _opts, cb) => cb(null, { sub: 'dev-user', sid: 'sess1' }),
}));

const mockCreate = jest.fn();
jest.mock('openai', () => jest.fn().mockImplementation(() => ({
  chat: { completions: { create: (...args) => mockCreate(...args) } },
})));

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: (...args) => mockQuery(...args) })) }));

jest.mock('../rag', () => ({
  seedGuidelines: jest.fn(),
  queryGuidelines: jest.fn().mockResolvedValue([]),
  queryGuidelinesMulti: jest.fn().mockResolvedValue([]),
}));

// Keep the real fallback module but force the LLM streaming path to be taken.
jest.mock('../no-llm-fallback', () => {
  const actual = jest.requireActual('../no-llm-fallback');
  return { ...actual, isLLMDisabled: () => false };
});

const request = require('supertest');
const app = require('../app');

beforeEach(() => {
  jest.clearAllMocks();
  if (app._resetRateLimiters) app._resetRateLimiters();
});

test('B2 — post-stream error returns a redacted SSE frame in production', async () => {
  // create() resolves to an async iterable: yield one chunk (flushes headers),
  // then throw -> the catch runs with res.headersSent === true.
  mockCreate.mockResolvedValue({
    async *[Symbol.asyncIterator]() {
      yield { choices: [{ delta: { content: 'partial ' } }] };
      throw new Error('SECRET upstream connection string leaked here');
    },
  });

  const res = await request(app)
    .post('/api/vision/generate-insights')
    .set('Authorization', 'Bearer faketoken')
    .send({ signal_scores: { structure: 50, hydration: 60 } });

  // Headers were flushed before the error, so the stream returns 200.
  expect(res.status).toBe(200);
  expect(res.text).toContain('data: {"error":"Internal server error"}');
  expect(res.text).not.toContain('SECRET upstream connection string leaked here');
});
