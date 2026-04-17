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
  jest.resetModules();
  process.env.MCP_ENABLED = 'true';
  process.env.MCP_BASE_URL = 'https://api.glowlytics.ai';
  process.env.CLERK_ISSUER_URL = 'https://clerk.glowlytics.ai';
  process.env.CLERK_JWKS_URL = jwksUrl;

  const { mountMcp } = require('../../mcp/transport');
  const app = express();
  app.use(express.json());
  mountMcp(app);
  return app;
}

async function sign(sub = 'user_abc') {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer('https://clerk.glowlytics.ai')
    .setSubject(sub)
    .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
    .setIssuedAt()
    .sign(kp.privateKey);
}

beforeEach(() => {
  delete process.env.MCP_BETA_USER_IDS;
});

test('POST /mcp 401 without bearer token', async () => {
  const res = await request(buildApp()).post('/mcp').send({ jsonrpc: '2.0', method: 'initialize', id: 1 });
  expect(res.status).toBe(401);
});

test('POST /mcp 403 when user is not in beta allowlist', async () => {
  process.env.MCP_BETA_USER_IDS = 'user_allowed';
  const tok = await sign('user_blocked');
  const res = await request(buildApp())
    .post('/mcp')
    .set('Authorization', `Bearer ${tok}`)
    .set('Content-Type', 'application/json')
    .send({ jsonrpc: '2.0', method: 'initialize', id: 1 });
  expect(res.status).toBe(403);
  delete process.env.MCP_BETA_USER_IDS;
});

test('POST /mcp processes a valid initialize and returns 200 JSON-RPC', async () => {
  const tok = await sign('user_abc');
  const res = await request(buildApp())
    .post('/mcp')
    .set('Authorization', `Bearer ${tok}`)
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .send({
      jsonrpc: '2.0',
      method: 'initialize',
      id: 1,
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'jest-test', version: '0.0.1' },
      },
    });
  expect(res.status).toBe(200);
  // Body may be JSON or SSE-framed depending on transport; both should reference our server name.
  const body = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
  expect(body + (res.text || '')).toMatch(/glowlytics-mcp/);
});
