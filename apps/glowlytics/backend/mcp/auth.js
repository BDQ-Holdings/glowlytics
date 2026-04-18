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

async function requireMcpAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'missing_token' });

    const cfg = mcpConfig();
    const expectedResource = `${cfg.baseUrl}/mcp`;

    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: cfg.clerkIssuer,
    });
    if (!payload.sub) return res.status(401).json({ error: 'invalid_token' });

    // Reject anything that isn't an OAuth grant (Clerk session JWTs lack
    // client_id, so this filters out plain mobile session tokens).
    if (!payload.client_id || typeof payload.client_id !== 'string') {
      return res.status(401).json({ error: 'not_an_oauth_grant' });
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

    const allowedClients = (process.env.MCP_ALLOWED_CLIENT_IDS || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const clientAllowlisted =
      allowedClients.length > 0 && allowedClients.includes(payload.client_id);

    if (!audMatches && !clientAllowlisted) {
      return res.status(401).json({ error: 'token_not_for_mcp' });
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
    return res.status(401).json({ error: 'invalid_token' });
  }
}

function _resetJwksForTest() {
  jwks = null;
}

module.exports = { requireMcpAuth, _resetJwksForTest };
