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

    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: mcpConfig().clerkIssuer,
    });
    if (!payload.sub) return res.status(401).json({ error: 'invalid_token' });

    // Require an OAuth-grant marker (client_id). Clerk session JWTs do not
    // carry client_id, so this rejects mobile session tokens that would
    // otherwise pass signature/issuer checks. Optionally restrict to a
    // configured allowlist of MCP OAuth client IDs.
    if (!payload.client_id || typeof payload.client_id !== 'string') {
      return res.status(401).json({ error: 'not_an_oauth_grant' });
    }
    const allowed = (process.env.MCP_ALLOWED_CLIENT_IDS || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(payload.client_id)) {
      return res.status(403).json({ error: 'client_not_allowed' });
    }

    req.mcpClientId = payload.client_id;
    const beta = mcpConfig().betaUserIds;
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
