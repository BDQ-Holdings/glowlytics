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

  return {
    enabled: process.env.MCP_ENABLED === 'true',
    baseUrl: process.env.MCP_BASE_URL,
    clerkIssuer: process.env.CLERK_ISSUER_URL,
    betaUserIds: new Set(beta),
    allowedClientIds: new Set(explicit),
  };
}

module.exports = { mcpConfig };
