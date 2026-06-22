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

const MCP_AUD = 'https://api.glowlytics.ai/mcp';

async function sign({
  sub = 'user_abc',
  iss = 'https://clerk.glowlytics.ai',
  exp = Math.floor(Date.now() / 1000) + 60,
  clientId = 'oauth_client_default',
  aud = MCP_AUD, // by default mint a token "for" the MCP resource
  extraClaims = {},
} = {}) {
  const claims = { ...extraClaims };
  if (clientId !== null) claims.client_id = clientId;
  if (aud !== null) claims.aud = aud;
  return new SignJWT(claims)
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
  delete process.env.MCP_ALLOWED_CLIENT_IDS;
  // MCP-06: default GA-open so the audience/client-gate tests below aren't
  // blocked by the new fail-closed closed-beta default. Beta-specific tests
  // override MCP_BETA_USER_IDS / MCP_BETA_OPEN as needed.
  process.env.MCP_BETA_OPEN = 'true';
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

test('rejects token expired well beyond the clock-tolerance window', async () => {
  const tok = await sign({ exp: Math.floor(Date.now() / 1000) - 120 });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(401);
});

test('accepts a token expired within the 30s clock-tolerance window (skew)', async () => {
  // 15s past expiry: a realistic minor clock-skew case that previously 401'd.
  const tok = await sign({ exp: Math.floor(Date.now() / 1000) - 15 });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
  expect(res.body.userId).toBe('user_abc');
});

test('accepts a token whose nbf is slightly in the future (within tolerance)', async () => {
  const now = Math.floor(Date.now() / 1000);
  const tok = await sign({ extraClaims: { nbf: now + 15 } });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
  expect(res.body.userId).toBe('user_abc');
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

test('rejects token without client_id (Clerk session token)', async () => {
  const tok = await sign({ clientId: null }); // mimics a session JWT
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('not_an_oauth_grant');
});

test('rejects OAuth grant minted for a different resource (aud mismatch, no allowlist)', async () => {
  const tok = await sign({ aud: 'https://api.glowlytics.ai/internal' });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('token_not_for_mcp');
});

test('rejects OAuth grant with no aud claim and no allowlist match', async () => {
  const tok = await sign({ aud: null });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('token_not_for_mcp');
});

test('accepts token with matching aud claim (RFC 9068 / 8707 path)', async () => {
  const tok = await sign({ aud: 'https://api.glowlytics.ai/mcp' });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
});

test('accepts token with matching aud array', async () => {
  const tok = await sign({ aud: ['https://other', 'https://api.glowlytics.ai/mcp'] });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
});

test('accepts token via resource claim when aud is absent', async () => {
  const tok = await sign({ aud: null, extraClaims: { resource: 'https://api.glowlytics.ai/mcp' } });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
});

test('rejects OAuth grant whose client_id is not in MCP_ALLOWED_CLIENT_IDS (and aud mismatches)', async () => {
  process.env.MCP_ALLOWED_CLIENT_IDS = 'oauth_known_a,oauth_known_b';
  const tok = await sign({ clientId: 'oauth_unknown', aud: 'https://other' });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('token_not_for_mcp');
});

test('accepts OAuth grant via allowlist fallback when aud is absent', async () => {
  process.env.MCP_ALLOWED_CLIENT_IDS = 'oauth_known_a,oauth_known_b';
  const tok = await sign({ sub: 'user_abc', clientId: 'oauth_known_a', aud: null });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
});

test('allows any authenticated user when MCP_BETA_USER_IDS empty and MCP_BETA_OPEN=true (GA)', async () => {
  delete process.env.MCP_BETA_USER_IDS;
  process.env.MCP_BETA_OPEN = 'true';
  const tok = await sign({ sub: 'user_anyone' });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
});

test('fails closed when MCP_BETA_USER_IDS empty and MCP_BETA_OPEN unset (MCP-06)', async () => {
  delete process.env.MCP_BETA_USER_IDS;
  delete process.env.MCP_BETA_OPEN;
  const tok = await sign({ sub: 'user_anyone' });
  const res = await request(buildApp())
    .get('/protected')
    .set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(403);
  expect(res.body.error).toBe('beta_only');
});
