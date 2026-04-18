jest.mock('pg', () => {
  const mockPool = { query: jest.fn(), end: jest.fn() };
  return { Pool: jest.fn(() => mockPool) };
});
jest.mock('openai', () => jest.fn().mockImplementation(() => ({})));

describe('GET /.well-known/oauth-protected-resource', () => {
  let app;
  let request;

  beforeAll(() => {
    process.env.MCP_ENABLED = 'true';
    process.env.MCP_BASE_URL = 'https://api.glowlytics.ai';
    process.env.CLERK_ISSUER_URL = 'https://clerk.glowlytics.ai';
    jest.resetModules();
    request = require('supertest');
    app = require('../../app');
  });

  it('advertises Clerk as the authorization server', async () => {
    const res = await request(app).get('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(res.body.resource).toBe('https://api.glowlytics.ai/mcp');
    expect(res.body.authorization_servers).toEqual(['https://clerk.glowlytics.ai']);
    expect(res.body.bearer_methods_supported).toContain('header');
    expect(res.body.scopes_supported).toEqual(
      expect.arrayContaining(['openid', 'profile', 'email', 'offline_access'])
    );
  });

  it('is reachable without authentication', async () => {
    const res = await request(app)
      .get('/.well-known/oauth-protected-resource')
      .set('Authorization', '');
    expect(res.status).toBe(200);
  });
});

