// Built-in default redirect_uri allowlist for known-good MCP connector
// callbacks. Used when MCP_OAUTH_PROXY_REDIRECT_URIS is not configured.
// Loopback (http://localhost:* / http://127.0.0.1:*) is always accepted
// separately per OAuth 2.1 native-app guidance — see isAllowedRedirectUri
// in oauth-proxy.js — so the MCP Inspector keeps working on any local port.
const DEFAULT_MCP_REDIRECT_URIS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
];

function mcpConfig() {
  const beta = (process.env.MCP_BETA_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Allowed client_ids = explicit env var + the OAuth proxy's static client_id
  // (when configured). The proxy's client_id is auto-added so operators don't
  // have to keep MCP_ALLOWED_CLIENT_IDS in sync with MCP_OAUTH_PROXY_CLIENT_ID.
  const explicit = (process.env.MCP_ALLOWED_CLIENT_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (process.env.MCP_OAUTH_PROXY_CLIENT_ID) explicit.push(process.env.MCP_OAUTH_PROXY_CLIENT_ID);

  // redirect_uri allowlist for the OAuth proxy (MCP-01). Exact-match Set; an
  // empty/unset MCP_OAUTH_PROXY_REDIRECT_URIS falls back to the built-in
  // known-good connector callbacks above.
  const redirectUris = (process.env.MCP_OAUTH_PROXY_REDIRECT_URIS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  return {
    enabled: process.env.MCP_ENABLED === 'true',
    baseUrl: process.env.MCP_BASE_URL,
    clerkIssuer: process.env.CLERK_ISSUER_URL,
    betaUserIds: new Set(beta),
    allowedClientIds: new Set(explicit),
    allowedRedirectUris: new Set(redirectUris.length ? redirectUris : DEFAULT_MCP_REDIRECT_URIS),
  };
}

module.exports = { mcpConfig, DEFAULT_MCP_REDIRECT_URIS };
