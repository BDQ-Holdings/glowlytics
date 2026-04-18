function mcpConfig() {
  const beta = (process.env.MCP_BETA_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    enabled: process.env.MCP_ENABLED === 'true',
    baseUrl: process.env.MCP_BASE_URL,
    clerkIssuer: process.env.CLERK_ISSUER_URL,
    betaUserIds: new Set(beta),
  };
}

module.exports = { mcpConfig };
