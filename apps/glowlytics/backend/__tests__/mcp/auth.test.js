const { generateKeyPair, exportJWK, SignJWT } = require('jose');
const express = require('express');
const request = require('supertest');

let kp;
let jwk;
let jwksServer;
let jwksUrl;

beforeAll(async () => {
  kp = await generateKeyPair('RS256');
  jwk = await exportJWK(kp.publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  const jwksApp = express();
  jwksApp.get('/.well-known/jwks.json', (_q, r) => r.json({ keys: [jwk] }));
  jwksServer = jwksApp.listen(0);
  jwksUrl = `http://localhost:${jwksServer.address().port}/.well-known/jwks.json`;
});

afterAll(() => {
  if (jwksServer) jwksServer.close();
});

function buildApp() {
  const { requireMcpAuth } = require('../../mcp/auth');
  const app = express();
  app.get('/protected', requireMcpAuth, (req, res) => res.json({ userId: req.userId }));
  return app;
}

async function sign({
  sub = 'user_abc',
  iss = 'https://clerk.glowlytics.ai',
  exp = Math.floor(Date.now() / 1000) + 60,
} = {}) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(iss)
    .setSubject(sub)
    .setExpirationTime(exp)
    .setIssuedAt()
    .sign(kp.privateKey);
}

beforeEach(() => {
  jest.resetModules();
  process.env.MCP_ENABLED = 'true';
  process.env.MCP_BASE_URL = 'https://api.glowlytics.ai';
  process.env.CLERK_ISSUER_URL = 'https://clerk.glowlytics.ai';
  process.env.CLERK_JWKS_URL = jwksUrl;
  delete process.env.MCP_BETA_USER_IDS;
});

test('rejects missing Authorization header', async () => {
  const res = await request(buildApp()).get('/protected');
  expect(res.status).toBe(401);
});

test('rejects malformed token', async () => {
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', 'Bearer not.a.jwt');
  expect(res.status).toBe(401);
});

test('rejects token with wrong issuer', async () => {
  const tok = await sign({ iss: 'https://evil.example' });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(401);
});

test('rejects expired token', async () => {
  const tok = await sign({ exp: Math.floor(Date.now() / 1000) - 10 });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(401);
});

test('accepts valid token and attaches userId', async () => {
  const tok = await sign({ sub: 'user_abc' });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
  expect(res.body.userId).toBe('user_abc');
});

test('rejects user not in MCP_BETA_USER_IDS when set', async () => {
  process.env.MCP_BETA_USER_IDS = 'user_allowed';
  const tok = await sign({ sub: 'user_blocked' });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(403);
  expect(res.body.error).toBe('beta_only');
});

test('accepts user in MCP_BETA_USER_IDS', async () => {
  process.env.MCP_BETA_USER_IDS = 'user_allowed';
  const tok = await sign({ sub: 'user_allowed' });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
});

test('allows any authenticated user when MCP_BETA_USER_IDS is empty (GA)', async () => {
  delete process.env.MCP_BETA_USER_IDS;
  const tok = await sign({ sub: 'user_anyone' });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
});
