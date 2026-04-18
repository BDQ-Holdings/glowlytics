const { mcpConfig } = require('./config');

function mountWellKnown(app) {
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    const cfg = mcpConfig();
    res.json({
      resource: `${cfg.baseUrl}/mcp`,
      authorization_servers: [cfg.clerkIssuer],
      bearer_methods_supported: ['header'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    });
  });
}

module.exports = { mountWellKnown };
