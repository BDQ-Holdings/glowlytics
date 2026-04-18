/**
 * Thin wrapper around Clerk's Backend API for managing the OAuth applications
 * that a user has connected (granted MCP access to).
 *
 * Note on endpoint paths: Clerk's Backend API exposes user OAuth grants under
 * a few related paths depending on the connection direction (sign-in providers
 * vs apps-that-use-Clerk-as-IdP). The exact path for "list apps that have
 * access to this user as IdP" is configurable via CLERK_USER_GRANTS_PATH so
 * the wrapper can be pointed at the right endpoint without code changes once
 * verified in the Clerk dashboard. Default mirrors the common public-API
 * convention.
 */

const CLERK_API_BASE = process.env.CLERK_API_BASE || 'https://api.clerk.com';
const GRANTS_PATH = process.env.CLERK_USER_GRANTS_PATH || '/v1/users/{userId}/oauth_access_tokens';

function authHeaders() {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error('CLERK_SECRET_KEY not configured');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function projectGrant(g) {
  return {
    clientId: g.client_id || g.clientId || g.id,
    clientName: g.client_name || g.application_name || g.name || null,
    scopes: g.scopes || [],
    connectedAt: g.created_at ? new Date(g.created_at).toISOString() : null,
  };
}

async function listGrantsForUser(userId, fetchImpl = fetch) {
  const url = `${CLERK_API_BASE}${GRANTS_PATH.replace('{userId}', encodeURIComponent(userId))}`;
  const res = await fetchImpl(url, { method: 'GET', headers: authHeaders() });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Clerk grants list failed: ${res.status}`);
  const body = await res.json();
  const items = Array.isArray(body) ? body : body.data || [];
  return items.map(projectGrant);
}

async function revokeGrant(userId, clientId, fetchImpl = fetch) {
  const url = `${CLERK_API_BASE}${GRANTS_PATH.replace('{userId}', encodeURIComponent(userId))}/${encodeURIComponent(clientId)}`;
  const res = await fetchImpl(url, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok && res.status !== 404) throw new Error(`Clerk grant revoke failed: ${res.status}`);
  return { revoked: true, clientId };
}

module.exports = { listGrantsForUser, revokeGrant, projectGrant };
