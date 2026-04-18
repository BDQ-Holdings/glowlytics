// src/services/mcpClients.ts
// List + revoke OAuth applications connected to the user via the Glowlytics MCP server.

import { getAuthHeaders } from './api';
import { env } from '../config/env';

export interface McpClient {
  clientId: string;
  clientName: string | null;
  scopes: string[];
  connectedAt: string | null;
}

export const listConnectedApps = async (): Promise<McpClient[]> => {
  const headers = await getAuthHeaders();
  const res = await fetch(`${env.API_BASE_URL}/api/mcp/clients`, { headers });
  if (!res.ok) throw new Error(`failed_to_list_mcp_clients_${res.status}`);
  return res.json();
};

export const revokeConnectedApp = async (clientId: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${env.API_BASE_URL}/api/mcp/clients/${encodeURIComponent(clientId)}`,
    { method: 'DELETE', headers }
  );
  if (!res.ok) throw new Error(`failed_to_revoke_mcp_client_${res.status}`);
};
