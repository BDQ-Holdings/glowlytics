jest.mock('pg', () => {
  const mockPool = { query: jest.fn(), end: jest.fn() };
  return { Pool: jest.fn(() => mockPool) };
});
jest.mock('openai', () => jest.fn().mockImplementation(() => ({})));

const mockListGrants = jest.fn();
const mockRevokeGrant = jest.fn();
jest.mock('../../mcp/clerk-clients', () => ({
  listGrantsForUser: mockListGrants,
  revokeGrant: mockRevokeGrant,
}));

beforeEach(() => {
  jest.resetModules();
  process.env.MCP_ENABLED = 'true';
  process.env.MCP_BASE_URL = 'https://api.glowlytics.ai';
  // Auth fails closed whenever CLERK_ISSUER_URL is set (even in development),
  // so these route-handler tests must run issuer-less to use the dev
  // passthrough (req.auth = { userId: 'dev-user' }) instead of minting JWTs.
  // Set '' (not delete): app.js's dotenv would re-inject a developer's .env
  // CLERK_ISSUER_URL into a deleted slot on every fresh require.
  process.env.CLERK_ISSUER_URL = '';
  process.env.CLERK_SECRET_KEY = 'sk_test_fake';
  process.env.NODE_ENV = 'development'; // issuer-less dev passthrough for Supertest probes
  mockListGrants.mockReset();
  mockRevokeGrant.mockReset();
  jest.doMock('../../mcp/clerk-clients', () => ({
    listGrantsForUser: mockListGrants,
    revokeGrant: mockRevokeGrant,
  }));
});

const request = require('supertest');

function buildApp() {
  jest.resetModules();
  jest.doMock('../../mcp/clerk-clients', () => ({
    listGrantsForUser: mockListGrants,
    revokeGrant: mockRevokeGrant,
  }));
  return require('../../app');
}

// In dev mode the existing authMiddleware injects req.auth = { userId: 'dev-user' }
// when no Authorization header is present. The tests rely on that so they don't
// have to mint a real Clerk JWT.
const DEV_USER = 'dev-user';

describe('GET /api/mcp/clients', () => {
  it('returns connected MCP clients for the authenticated user', async () => {
    mockListGrants.mockResolvedValueOnce([
      { clientId: 'app_123', clientName: 'Claude Desktop', scopes: ['openid', 'profile'], connectedAt: '2026-04-15T00:00:00.000Z' },
    ]);
    const res = await request(buildApp()).get('/api/mcp/clients');
    expect(res.status).toBe(200);
    expect(mockListGrants).toHaveBeenCalledWith(DEV_USER);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].clientName).toBe('Claude Desktop');
  });

  it('returns empty array when user has no connected clients', async () => {
    mockListGrants.mockResolvedValueOnce([]);
    const res = await request(buildApp()).get('/api/mcp/clients');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on Clerk failure (no upstream details leaked)', async () => {
    mockListGrants.mockRejectedValueOnce(new Error('clerk down'));
    const res = await request(buildApp()).get('/api/mcp/clients');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/stack/i);
    expect(JSON.stringify(res.body)).not.toMatch(/clerk down/i);
  });
});

describe('DELETE /api/mcp/clients/:clientId', () => {
  it('forwards the clientId to revokeGrant scoped to the user', async () => {
    mockRevokeGrant.mockResolvedValueOnce({ revoked: true, clientId: 'app_xyz' });
    const res = await request(buildApp()).delete('/api/mcp/clients/app_xyz');
    expect(res.status).toBe(200);
    expect(mockRevokeGrant).toHaveBeenCalledWith(DEV_USER, 'app_xyz');
    expect(res.body.revoked).toBe(true);
  });

  it('omitting clientId hits no handler (404, treated as no-op)', async () => {
    const res = await request(buildApp()).delete('/api/mcp/clients/');
    expect([400, 404]).toContain(res.status);
  });
});
