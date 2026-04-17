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
