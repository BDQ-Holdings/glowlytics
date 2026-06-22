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

// MCP-06: warn at most once per process when MCP is reachable but the beta
// allowlist is empty and MCP_BETA_OPEN is not set — i.e. no user can pass.
let betaLockedWarned = false;
function warnBetaLocked() {
  if (betaLockedWarned) return;
  betaLockedWarned = true;
  console.warn(
    '[mcp] MCP is enabled but MCP_BETA_USER_IDS is empty and MCP_BETA_OPEN is not set — ' +
      'all requests are denied (beta_only). Set MCP_BETA_OPEN=true for GA or populate MCP_BETA_USER_IDS.',
  );
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
      algorithms: ['RS256'], // MCP-03: pin the signature alg (alg-confusion / "none" hardening)
      clockTolerance: 30, // tolerate ~30s clock skew (60s session JWTs) — avoid spurious 401s
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
    if (beta.size === 0) {
      // MCP-06: an empty/unset allowlist no longer implicitly means GA. Allow
      // all ONLY when the operator opts in with MCP_BETA_OPEN=true; otherwise
      // fail closed (no users permitted) and warn once that MCP is locked.
      if (process.env.MCP_BETA_OPEN !== 'true') {
        warnBetaLocked();
        return res.status(403).json({ error: 'beta_only' });
      }
    } else if (!beta.has(payload.sub)) {
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
