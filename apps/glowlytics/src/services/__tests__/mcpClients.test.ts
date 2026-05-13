jest.mock('../httpClient', () => ({
  httpJson: jest.fn(),
}));
jest.mock('../../config/env', () => ({
  env: { API_BASE_URL: 'https://api.test' },
}));

import { listConnectedApps, revokeConnectedApp } from '../mcpClients';
import { httpJson } from '../httpClient';

const mockHttpJson = httpJson as jest.MockedFunction<typeof httpJson>;

beforeEach(() => mockHttpJson.mockReset());

describe('listConnectedApps', () => {
  it('GETs /api/mcp/clients via httpJson (auth/retry/X-Request-ID handled centrally)', async () => {
    mockHttpJson.mockResolvedValueOnce([
      { clientId: 'c1', clientName: 'Claude Desktop', scopes: ['openid'], connectedAt: '2026-04-15T00:00:00Z' },
    ]);
    const apps = await listConnectedApps();
    expect(mockHttpJson).toHaveBeenCalledWith('https://api.test/api/mcp/clients');
    expect(apps).toHaveLength(1);
    expect(apps[0].clientName).toBe('Claude Desktop');
  });

  it('propagates errors from httpJson', async () => {
    mockHttpJson.mockRejectedValueOnce(new Error('http_500'));
    await expect(listConnectedApps()).rejects.toThrow(/http_500/);
  });
});

describe('revokeConnectedApp', () => {
  it('DELETEs /api/mcp/clients/:clientId via httpJson', async () => {
    mockHttpJson.mockResolvedValueOnce({ revoked: true });
    await revokeConnectedApp('app_xyz');
    expect(mockHttpJson).toHaveBeenCalledWith(
      'https://api.test/api/mcp/clients/app_xyz',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('url-encodes the clientId', async () => {
    mockHttpJson.mockResolvedValueOnce({ revoked: true });
    await revokeConnectedApp('weird/id with spaces');
    const url = mockHttpJson.mock.calls[0][0] as string;
    expect(url).toContain('weird%2Fid%20with%20spaces');
  });

  it('propagates errors from httpJson', async () => {
    mockHttpJson.mockRejectedValueOnce(new Error('http_404'));
    await expect(revokeConnectedApp('x')).rejects.toThrow(/http_404/);
  });
});
