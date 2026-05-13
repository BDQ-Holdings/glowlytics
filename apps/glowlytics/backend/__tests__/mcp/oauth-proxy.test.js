jest.mock('pg', () => {
  const mockPool = { query: jest.fn(), end: jest.fn() };
  return { Pool: jest.fn(() => mockPool) };
});
jest.mock('openai', () => jest.fn().mockImplementation(() => ({})));

const PROXY_CLIENT_ID = 'mcpc_glowlytics_test';
const PROXY_CLIENT_SECRET = 'super_secret_test_value';
const BASE_URL = 'https://api.glowlytics.ai';
const CLERK_ISSUER = 'https://clerk.glowlytics.ai';

function setEnv({ proxyEnabled = true } = {}) {
  process.env.MCP_ENABLED = 'true';
  process.env.MCP_BASE_URL = BASE_URL;
  process.env.CLERK_ISSUER_URL = CLERK_ISSUER;
  if (proxyEnabled) {
    process.env.MCP_OAUTH_PROXY_ENABLED = 'true';
    process.env.MCP_OAUTH_PROXY_CLIENT_ID = PROXY_CLIENT_ID;
    process.env.MCP_OAUTH_PROXY_CLIENT_SECRET = PROXY_CLIENT_SECRET;
  } else {
    delete process.env.MCP_OAUTH_PROXY_ENABLED;
    delete process.env.MCP_OAUTH_PROXY_CLIENT_ID;
    delete process.env.MCP_OAUTH_PROXY_CLIENT_SECRET;
  }
}

function loadApp() {
  jest.resetModules();
  const request = require('supertest');
  const app = require('../../app');
  return { app, request };
}

describe('OAuth proxy — feature-flagged behavior', () => {
  afterEach(() => {
    try { require('../../mcp/oauth-proxy')._resetForTest(); } catch (_e) {}
  });

  it('protected-resource doc advertises Clerk when proxy is OFF (rollout-safe)', async () => {
    setEnv({ proxyEnabled: false });
    const { app, request } = loadApp();
    const res = await request(app).get('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(res.body.authorization_servers).toEqual([CLERK_ISSUER]);
  });

  it('authorization-server metadata returns 404 when proxy is OFF', async () => {
    setEnv({ proxyEnabled: false });
    const { app, request } = loadApp();
    const res = await request(app).get('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(404);
  });

  it('register returns 404 when proxy is OFF', async () => {
    setEnv({ proxyEnabled: false });
    const { app, request } = loadApp();
    const res = await request(app).post('/oauth/register').send({});
    expect(res.status).toBe(404);
  });

  it('protected-resource doc advertises OUR backend when proxy is ON', async () => {
    setEnv({ proxyEnabled: true });
    const { app, request } = loadApp();
    const res = await request(app).get('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(res.body.authorization_servers).toEqual([BASE_URL]);
    expect(res.body.resource).toBe(`${BASE_URL}/mcp`);
  });

  it('authorization-server metadata is well-formed and includes registration_endpoint', async () => {
    setEnv({ proxyEnabled: true });
    const { app, request } = loadApp();
    const res = await request(app).get('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    expect(res.body.issuer).toBe(CLERK_ISSUER);
    expect(res.body.authorization_endpoint).toBe(`${BASE_URL}/oauth/authorize`);
    expect(res.body.token_endpoint).toBe(`${BASE_URL}/oauth/token`);
    expect(res.body.registration_endpoint).toBe(`${BASE_URL}/oauth/register`);
    expect(res.body.jwks_uri).toBe(`${CLERK_ISSUER}/.well-known/jwks.json`);
    expect(res.body.code_challenge_methods_supported).toContain('S256');
    expect(res.body.grant_types_supported).toEqual(
      expect.arrayContaining(['authorization_code', 'refresh_token']),
    );
  });
});

describe('OAuth proxy — DCR (POST /oauth/register)', () => {
  beforeEach(() => setEnv({ proxyEnabled: true }));
  afterEach(() => {
    try { require('../../mcp/oauth-proxy')._resetForTest(); } catch (_e) {}
  });

  it('returns the static client_id and echoes redirect_uris', async () => {
    const { app, request } = loadApp();
    const res = await request(app).post('/oauth/register').send({
      client_name: 'claude.ai connector',
      redirect_uris: ['https://claude.ai/api/mcp/auth/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
    });
    expect(res.status).toBe(201);
    expect(res.body.client_id).toBe(PROXY_CLIENT_ID);
    expect(res.body.redirect_uris).toEqual(['https://claude.ai/api/mcp/auth/callback']);
    expect(res.body.token_endpoint_auth_method).toBe('none');
  });

  it('returns the same client_id for every caller (static)', async () => {
    const { app, request } = loadApp();
    const a = await request(app).post('/oauth/register').send({ client_name: 'A' });
    const b = await request(app).post('/oauth/register').send({ client_name: 'B' });
    expect(a.body.client_id).toBe(b.body.client_id);
  });
});

describe('OAuth proxy — /oauth/authorize', () => {
  beforeEach(() => setEnv({ proxyEnabled: true }));
  afterEach(() => {
    try { require('../../mcp/oauth-proxy')._resetForTest(); } catch (_e) {}
  });

  it('redirects to Clerk with our callback URL and rewritten client_id', async () => {
    const { app, request } = loadApp();
    const res = await request(app).get('/oauth/authorize')
      .query({
        response_type: 'code',
        client_id: PROXY_CLIENT_ID,
        redirect_uri: 'https://claude.ai/api/mcp/cb',
        state: 'caller-state-123',
        scope: 'openid profile email offline_access',
        code_challenge: 'abc123',
        code_challenge_method: 'S256',
      });
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.location);
    expect(loc.origin).toBe(CLERK_ISSUER);
    expect(loc.pathname).toBe('/oauth/authorize');
    expect(loc.searchParams.get('client_id')).toBe(PROXY_CLIENT_ID);
    expect(loc.searchParams.get('redirect_uri')).toBe(`${BASE_URL}/oauth/callback`);
    expect(loc.searchParams.get('response_type')).toBe('code');
    expect(loc.searchParams.get('code_challenge')).toBe('abc123');
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256');
    expect(loc.searchParams.get('scope')).toBe('openid profile email offline_access');
    // Caller's state must NOT leak to Clerk; we use our own opaque state.
    expect(loc.searchParams.get('state')).not.toBe('caller-state-123');
    expect(loc.searchParams.get('state')).toBeTruthy();
  });

  it('rejects non-matching client_id', async () => {
    const { app, request } = loadApp();
    const res = await request(app).get('/oauth/authorize')
      .query({ response_type: 'code', client_id: 'someone-else', redirect_uri: 'https://x' });
    expect(res.status).toBe(400);
  });

  it('rejects missing redirect_uri', async () => {
    const { app, request } = loadApp();
    const res = await request(app).get('/oauth/authorize').query({ response_type: 'code' });
    expect(res.status).toBe(400);
  });

  it('rejects unsupported response_type', async () => {
    const { app, request } = loadApp();
    const res = await request(app).get('/oauth/authorize')
      .query({ response_type: 'token', redirect_uri: 'https://x' });
    expect(res.status).toBe(400);
  });
});

describe('OAuth proxy — /oauth/callback round-trip with /authorize', () => {
  beforeEach(() => setEnv({ proxyEnabled: true }));
  afterEach(() => {
    try { require('../../mcp/oauth-proxy')._resetForTest(); } catch (_e) {}
  });

  it('redirects back to caller with code and original state', async () => {
    const { app, request } = loadApp();
    // First /authorize to create a state entry
    const auth = await request(app).get('/oauth/authorize').query({
      response_type: 'code',
      client_id: PROXY_CLIENT_ID,
      redirect_uri: 'https://claude.ai/api/mcp/cb',
      state: 'caller-state-xyz',
    });
    const upstreamLoc = new URL(auth.headers.location);
    const proxyState = upstreamLoc.searchParams.get('state');

    const cb = await request(app).get('/oauth/callback').query({
      code: 'auth-code-from-clerk',
      state: proxyState,
    });
    expect(cb.status).toBe(302);
    const back = new URL(cb.headers.location);
    expect(back.origin + back.pathname).toBe('https://claude.ai/api/mcp/cb');
    expect(back.searchParams.get('code')).toBe('auth-code-from-clerk');
    expect(back.searchParams.get('state')).toBe('caller-state-xyz');
  });

  it('rejects invalid or already-consumed state', async () => {
    const { app, request } = loadApp();
    const cb = await request(app).get('/oauth/callback').query({ code: 'x', state: 'never-issued' });
    expect(cb.status).toBe(400);
  });

  it('forwards Clerk errors back to caller', async () => {
    const { app, request } = loadApp();
    const auth = await request(app).get('/oauth/authorize').query({
      response_type: 'code',
      redirect_uri: 'https://claude.ai/api/mcp/cb',
      state: 's',
    });
    const proxyState = new URL(auth.headers.location).searchParams.get('state');
    const cb = await request(app).get('/oauth/callback').query({
      error: 'access_denied',
      error_description: 'User declined',
      state: proxyState,
    });
    expect(cb.status).toBe(302);
    const back = new URL(cb.headers.location);
    expect(back.searchParams.get('error')).toBe('access_denied');
    expect(back.searchParams.get('error_description')).toBe('User declined');
  });
});

describe('OAuth proxy — /oauth/token', () => {
  beforeEach(() => {
    setEnv({ proxyEnabled: true });
    global.fetch = jest.fn();
  });
  afterEach(() => {
    try { require('../../mcp/oauth-proxy')._resetForTest(); } catch (_e) {}
    delete global.fetch;
  });

  function mockClerkTokenResponse({ status = 200, body, contentType = 'application/json' } = {}) {
    global.fetch.mockResolvedValueOnce({
      status,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) },
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    });
  }

  it('proxies authorization_code grant to Clerk with Basic auth and our callback URL', async () => {
    mockClerkTokenResponse({
      body: {
        access_token: 'AT.from.clerk',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'RT.from.clerk',
        id_token: 'eyJ.id.token',
      },
    });
    const { app, request } = loadApp();
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: 'auth-code-xyz',
        redirect_uri: 'https://claude.ai/cb',
        code_verifier: 'verifier-xyz',
        client_id: PROXY_CLIENT_ID,
      });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBe('AT.from.clerk');
    expect(res.body.refresh_token).toBe('RT.from.clerk');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = global.fetch.mock.calls[0];
    expect(calledUrl).toBe(`${CLERK_ISSUER}/oauth/token`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toMatch(/^Basic /);
    const decoded = Buffer.from(init.headers.Authorization.slice('Basic '.length), 'base64').toString();
    expect(decoded).toBe(`${PROXY_CLIENT_ID}:${PROXY_CLIENT_SECRET}`);
    const params = new URLSearchParams(init.body);
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code')).toBe('auth-code-xyz');
    // redirect_uri sent to Clerk MUST be our callback (matches what was used at /authorize)
    expect(params.get('redirect_uri')).toBe(`${BASE_URL}/oauth/callback`);
    expect(params.get('code_verifier')).toBe('verifier-xyz');
  });

  it('proxies refresh_token grant to Clerk', async () => {
    mockClerkTokenResponse({
      body: { access_token: 'AT2', token_type: 'Bearer', expires_in: 3600 },
    });
    const { app, request } = loadApp();
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', refresh_token: 'RT.old' });

    expect(res.status).toBe(200);
    const [, init] = global.fetch.mock.calls[0];
    const params = new URLSearchParams(init.body);
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('refresh_token')).toBe('RT.old');
  });

  it('forwards Clerk error responses verbatim', async () => {
    mockClerkTokenResponse({
      status: 400,
      body: { error: 'invalid_grant', error_description: 'Code expired' },
    });
    const { app, request } = loadApp();
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code: 'expired' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('returns 502 when Clerk is unreachable', async () => {
    global.fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const { app, request } = loadApp();
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code: 'x' });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('upstream_unreachable');
  });

  it('rejects unsupported grant types', async () => {
    const { app, request } = loadApp();
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'password', username: 'a', password: 'b' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported_grant_type');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects mismatched client_id', async () => {
    const { app, request } = loadApp();
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: 'x',
        client_id: 'wrong',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_client');
  });
});

describe('Auth allowlist — proxy client_id auto-included', () => {
  it('mcpConfig.allowedClientIds includes the proxy client_id when set', () => {
    setEnv({ proxyEnabled: true });
    process.env.MCP_ALLOWED_CLIENT_IDS = 'app_legacy_one,app_legacy_two';
    jest.resetModules();
    const { mcpConfig } = require('../../mcp/config');
    const cfg = mcpConfig();
    expect(cfg.allowedClientIds.has(PROXY_CLIENT_ID)).toBe(true);
    expect(cfg.allowedClientIds.has('app_legacy_one')).toBe(true);
    expect(cfg.allowedClientIds.has('app_legacy_two')).toBe(true);
    delete process.env.MCP_ALLOWED_CLIENT_IDS;
  });
});
