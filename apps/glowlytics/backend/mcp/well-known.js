const { mcpConfig } = require('./config');
const { isProxyEnabled } = require('./oauth-proxy');

function mountWellKnown(app) {
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    const cfg = mcpConfig();
    // When the OAuth proxy is enabled, point clients at OUR backend as the
    // authorization server. Our /.well-known/oauth-authorization-server then
    // exposes a registration_endpoint (which Clerk doesn't), making DCR-using
    // clients (claude.ai connector, MCP Inspector, etc.) work end-to-end.
    //
    // When disabled, fall back to advertising Clerk directly — preserves the
    // current behavior so this can ship safely behind the feature flag.
    const authServer = isProxyEnabled() ? cfg.baseUrl : cfg.clerkIssuer;
    res.json({
      resource: `${cfg.baseUrl}/mcp`,
      authorization_servers: [authServer],
      bearer_methods_supported: ['header'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    });
  });
}

module.exports = { mountWellKnown };
