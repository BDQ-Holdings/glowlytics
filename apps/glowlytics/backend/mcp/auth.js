const { createRemoteJWKSet, jwtVerify } = require('jose');
const { mcpConfig } = require('./config');

let jwks;

function getJwks() {
  if (jwks) return jwks;
  const url =
    process.env.CLERK_JWKS_URL ||
    `${mcpConfig().clerkIssuer}/.well-known/jwks.json`;
  jwks = createRemoteJWKSet(new URL(url), { cooldownDuration: 30_000 });
  return jwks;
}

// RFC 9728 / MCP spec: a 401 from a protected MCP resource MUST include a
// WWW-Authenticate header pointing at the resource metadata so OAuth clients
// (Claude.ai's connector, Inspector, etc.) can rediscover the auth server
// after a registration is dropped or token expires. Without this header, the
// claude.ai connector reconnect surfaces "Couldn't reach the MCP server".
function buildWwwAuthenticate(error, description, baseUrl) {
  const parts = ['Bearer realm="mcp"'];
  if (error) parts.push(`error="${error}"`);
  if (description) parts.push(`error_description="${description.replace(/"/g, '\\"')}"`);
  if (baseUrl) {
    parts.push(`resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`);
  }
  return parts.join(', ');
}

function send401(res, baseUrl, error, description) {
  res.set('WWW-Authenticate', buildWwwAuthenticate(error, description, baseUrl));
  return res.status(401).json({ error });
}

async function requireMcpAuth(req, res, next) {
  const cfg = mcpConfig();
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return send401(res, cfg.baseUrl, 'missing_token', 'Bearer token required');
    }

    const expectedResource = `${cfg.baseUrl}/mcp`;

    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: cfg.clerkIssuer,
    });
    if (!payload.sub) {
      return send401(res, cfg.baseUrl, 'invalid_token', 'Token has no subject');
    }

    // Reject anything that isn't an OAuth grant (Clerk session JWTs lack
    // client_id, so this filters out plain mobile session tokens).
    if (!payload.client_id || typeof payload.client_id !== 'string') {
      return send401(res, cfg.baseUrl, 'not_an_oauth_grant', 'Token is not an OAuth access token');
    }

    // Prove the token was minted FOR this MCP resource. Two acceptable signals:
    //   1) RFC 9068 / RFC 8707: aud (or resource) claim matches the MCP URL.
    //   2) Operator pre-registered the OAuth client_id in MCP_ALLOWED_CLIENT_IDS.
    // At least one must hold; otherwise a Clerk OAuth token issued for any
    // other API on the same tenant would bypass the gate.
    const audValues = Array.isArray(payload.aud)
      ? payload.aud
      : payload.aud
        ? [payload.aud]
        : [];
    const resourceValues = Array.isArray(payload.resource)
      ? payload.resource
      : payload.resource
        ? [payload.resource]
        : [];
    const audMatches =
      audValues.includes(expectedResource) || resourceValues.includes(expectedResource);

    const clientAllowlisted = cfg.allowedClientIds && cfg.allowedClientIds.has(payload.client_id);

    if (!audMatches && !clientAllowlisted) {
      return send401(res, cfg.baseUrl, 'token_not_for_mcp', 'Token audience does not match this MCP resource');
    }

    req.mcpClientId = payload.client_id;
    const beta = cfg.betaUserIds;
    if (beta.size > 0 && !beta.has(payload.sub)) {
      return res.status(403).json({ error: 'beta_only' });
    }

    req.userId = payload.sub;
    req.tokenClaims = payload;
    return next();
  } catch (_err) {
    return send401(res, cfg.baseUrl, 'invalid_token', 'Token verification failed');
  }
}

function _resetJwksForTest() {
  jwks = null;
}

module.exports = { requireMcpAuth, _resetJwksForTest };
