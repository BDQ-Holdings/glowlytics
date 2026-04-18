jest.mock('../api', () => ({
  getAuthHeaders: jest.fn().mockResolvedValue({ Authorization: 'Bearer t' }),
}));
jest.mock('../../config/env', () => ({
  env: { API_BASE_URL: 'https://api.test' },
}));

import { listConnectedApps, revokeConnectedApp } from '../mcpClients';

const mockFetch = jest.fn();
(global as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => mockFetch.mockReset());

describe('listConnectedApps', () => {
  it('GETs /api/mcp/clients with auth headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { clientId: 'c1', clientName: 'Claude Desktop', scopes: ['openid'], connectedAt: '2026-04-15T00:00:00Z' },
      ],
    });
    const apps = await listConnectedApps();
    expect(mockFetch).toHaveBeenCalledWith('https://api.test/api/mcp/clients', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer t' }),
    }));
    expect(apps).toHaveLength(1);
    expect(apps[0].clientName).toBe('Claude Desktop');
  });

  it('throws when the server returns non-2xx', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(listConnectedApps()).rejects.toThrow(/failed_to_list_mcp_clients_500/);
  });
});

describe('revokeConnectedApp', () => {
  it('DELETEs /api/mcp/clients/:clientId with auth headers', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ revoked: true }) });
    await revokeConnectedApp('app_xyz');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.test/api/mcp/clients/app_xyz',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('url-encodes the clientId', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ revoked: true }) });
    await revokeConnectedApp('weird/id with spaces');
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('weird%2Fid%20with%20spaces');
  });

  it('throws when the server returns non-2xx', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    await expect(revokeConnectedApp('x')).rejects.toThrow(/failed_to_revoke_mcp_client_404/);
  });
});
