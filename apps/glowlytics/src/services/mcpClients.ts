// src/services/mcpClients.ts
// List + revoke OAuth applications connected to the user via the Glowlytics MCP server.

import { httpJson } from './httpClient';
import { env } from '../config/env';

export interface McpClient {
  clientId: string;
  clientName: string | null;
  scopes: string[];
  connectedAt: string | null;
}

export const listConnectedApps = (): Promise<McpClient[]> =>
  httpJson<McpClient[]>(`${env.API_BASE_URL}/api/mcp/clients`);

export const revokeConnectedApp = async (clientId: string): Promise<void> => {
  await httpJson<unknown>(
    `${env.API_BASE_URL}/api/mcp/clients/${encodeURIComponent(clientId)}`,
    { method: 'DELETE' }
  );
};
