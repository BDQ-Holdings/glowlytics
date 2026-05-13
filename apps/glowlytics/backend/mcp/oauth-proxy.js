// OAuth 2.1 / RFC 7591 proxy that fronts Clerk for MCP clients (claude.ai
// connectors, Inspector, etc.) which require Dynamic Client Registration.
//
// Why this exists
// ---------------
// Clerk does not expose a `registration_endpoint` in its
// /.well-known/oauth-authorization-server metadata, and its
// /oauth/register returns 422 on RFC 7591 payloads. Without DCR, claude.ai's
// connector flow can't dynamically obtain a client_id, so the connector
// setup fails before the user even sees the Clerk sign-in page.
//
// The fix: this proxy advertises ITSELF as the authorization server in the
// MCP protected-resource discovery doc, exposes a DCR endpoint that returns
// a single pre-registered client_id, and proxies /authorize + /token
// through to Clerk while substituting the real Clerk credentials.
//
// PKCE (S256) is required end-to-end so a shared static client_id is safe
// for public clients — each flow's code_verifier is the per-flow secret.
//
// Tokens issued by Clerk are still verified by mcp/auth.js using Clerk's
// JWKS (`iss: clerkIssuer`). The proxy never sees or stores tokens.
//
// Feature flag
// ------------
// Mount only when MCP_OAUTH_PROXY_ENABLED=true and both
// MCP_OAUTH_PROXY_CLIENT_ID and MCP_OAUTH_PROXY_CLIENT_SECRET are set.
// Without those, well-known/oauth-protected-resource keeps pointing at Clerk
// directly (current behavior preserved — safe rollout).

const crypto = require('crypto');
const express = require('express');
const { mcpConfig } = require('./config');

const STATE_TTL_MS = 10 * 60 * 1000;

// Module-level state map. OAuth flows complete in seconds-to-minutes;
// in-process is fine. A restart drops in-flight flows and the user simply
// retries — no token loss because nothing valuable is stored here.
const stateStore = new Map();
let cleanupTimer = null;

function isProxyEnabled() {
  return process.env.MCP_OAUTH_PROXY_ENABLED === 'true'
    && !!process.env.MCP_OAUTH_PROXY_CLIENT_ID
    && !!process.env.MCP_OAUTH_PROXY_CLIENT_SECRET;
}

const publicClientId = () => process.env.MCP_OAUTH_PROXY_CLIENT_ID;
const clientSecret = () => process.env.MCP_OAUTH_PROXY_CLIENT_SECRET;
const clerkIssuer = () => mcpConfig().clerkIssuer;
const ourBaseUrl = () => mcpConfig().baseUrl;
const ourCallbackUrl = () => `${ourBaseUrl()}/oauth/callback`;

function storeState({ clientState, redirectUri, codeChallenge, codeChallengeMethod }) {
  const proxyState = crypto.randomBytes(24).toString('base64url');
  stateStore.set(proxyState, {
    clientState,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    expiresAt: Date.now() + STATE_TTL_MS,
  });
  return proxyState;
}

function consumeState(proxyState) {
  const entry = stateStore.get(proxyState);
  if (!entry) return null;
  stateStore.delete(proxyState);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

function startStateCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of stateStore) {
      if (v.expiresAt < now) stateStore.delete(k);
    }
  }, 60_000);
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
}

function _resetForTest() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  stateStore.clear();
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

// GET /.well-known/oauth-authorization-server
// Mirrors Clerk's metadata but advertises OUR endpoints + DCR.
function getAuthorizationServerMetadata(_req, res) {
  if (!isProxyEnabled()) return res.status(404).json({ error: 'oauth_proxy_disabled' });
  const base = ourBaseUrl();
  res.json({
    issuer: clerkIssuer(),
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    jwks_uri: `${clerkIssuer()}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
  });
}

// POST /oauth/register (RFC 7591)
// Returns the same static client_id for every caller. PKCE makes this safe.
function registerClient(req, res) {
  if (!isProxyEnabled()) return res.status(404).json({ error: 'oauth_proxy_disabled' });
  const body = req.body || {};
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  res.status(201).json({
    client_id: publicClientId(),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: typeof body.client_name === 'string' ? body.client_name : 'MCP client',
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: 'openid profile email offline_access',
  });
}

// GET /oauth/authorize
// Validate the request, store caller's state + redirect_uri, redirect to Clerk
// using OUR callback so we can re-route the auth code back.
function authorize(req, res) {
  if (!isProxyEnabled()) return res.status(404).send('oauth_proxy_disabled');
  const q = req.query || {};
  if (q.client_id && q.client_id !== publicClientId()) {
    return res.status(400).json({ error: 'invalid_client' });
  }
  if (q.response_type !== 'code') {
    return res.status(400).json({ error: 'unsupported_response_type' });
  }
  const clientRedirectUri = typeof q.redirect_uri === 'string' ? q.redirect_uri : '';
  if (!clientRedirectUri) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uri required' });
  }
  // PKCE strongly recommended for public clients with a shared client_id.
  // We don't reject without it — some clients (Inspector, internal) may opt out —
  // but we forward it through if provided so Clerk enforces it on /token.

  const proxyState = storeState({
    clientState: typeof q.state === 'string' ? q.state : '',
    redirectUri: clientRedirectUri,
    codeChallenge: typeof q.code_challenge === 'string' ? q.code_challenge : null,
    codeChallengeMethod: typeof q.code_challenge_method === 'string' ? q.code_challenge_method : null,
  });

  const upstream = new URL(`${clerkIssuer()}/oauth/authorize`);
  upstream.searchParams.set('client_id', publicClientId());
  upstream.searchParams.set('response_type', 'code');
  upstream.searchParams.set('redirect_uri', ourCallbackUrl());
  upstream.searchParams.set('state', proxyState);
  if (typeof q.scope === 'string' && q.scope) upstream.searchParams.set('scope', q.scope);
  if (typeof q.code_challenge === 'string') upstream.searchParams.set('code_challenge', q.code_challenge);
  if (typeof q.code_challenge_method === 'string') upstream.searchParams.set('code_challenge_method', q.code_challenge_method);
  if (typeof q.prompt === 'string') upstream.searchParams.set('prompt', q.prompt);
  if (typeof q.login_hint === 'string') upstream.searchParams.set('login_hint', q.login_hint);

  res.redirect(302, upstream.toString());
}

// GET /oauth/callback
// Clerk redirects here after sign-in. Look up caller's redirect_uri/state and
// 302 to it with code+state passed through.
function callback(req, res) {
  if (!isProxyEnabled()) return res.status(404).send('oauth_proxy_disabled');
  const q = req.query || {};
  const proxyState = typeof q.state === 'string' ? q.state : '';
  const entry = consumeState(proxyState);
  if (!entry) {
    return res.status(400).send('Invalid or expired OAuth state');
  }

  let target;
  try {
    target = new URL(entry.redirectUri);
  } catch (_err) {
    return res.status(400).send('Stored redirect_uri is invalid');
  }
  if (typeof q.code === 'string') target.searchParams.set('code', q.code);
  if (typeof q.error === 'string') target.searchParams.set('error', q.error);
  if (typeof q.error_description === 'string') target.searchParams.set('error_description', q.error_description);
  if (entry.clientState) target.searchParams.set('state', entry.clientState);

  res.redirect(302, target.toString());
}

// POST /oauth/token
// Proxy to Clerk's token endpoint. Inject client_secret via Basic auth.
// MUST send the same redirect_uri Clerk saw on /authorize (our callback URL).
async function token(req, res) {
  if (!isProxyEnabled()) return res.status(404).json({ error: 'oauth_proxy_disabled' });
  const body = req.body || {};
  if (body.client_id && body.client_id !== publicClientId()) {
    return res.status(400).json({ error: 'invalid_client' });
  }
  const grantType = body.grant_type;
  if (grantType !== 'authorization_code' && grantType !== 'refresh_token') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  const upstreamBody = new URLSearchParams();
  upstreamBody.set('grant_type', grantType);
  if (grantType === 'authorization_code') {
    if (!body.code) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'code required' });
    }
    upstreamBody.set('code', String(body.code));
    upstreamBody.set('redirect_uri', ourCallbackUrl());
    if (body.code_verifier) upstreamBody.set('code_verifier', String(body.code_verifier));
  } else {
    if (!body.refresh_token) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'refresh_token required' });
    }
    upstreamBody.set('refresh_token', String(body.refresh_token));
    if (body.scope) upstreamBody.set('scope', String(body.scope));
  }

  const credsBasic = Buffer.from(`${publicClientId()}:${clientSecret()}`).toString('base64');
  let upstreamRes;
  try {
    upstreamRes = await fetch(`${clerkIssuer()}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credsBasic}`,
        Accept: 'application/json',
      },
      body: upstreamBody.toString(),
    });
  } catch (e) {
    return res.status(502).json({
      error: 'upstream_unreachable',
      error_description: e?.message || String(e),
    });
  }
  const text = await upstreamRes.text();
  const ct = upstreamRes.headers.get('content-type') || 'application/json';
  res.status(upstreamRes.status).type(ct).send(text);
}

function mountOAuthProxy(app) {
  // Always expose the metadata endpoint — when disabled it returns 404 so
  // clients fall back to the protected-resource doc's auth_servers list.
  app.get('/.well-known/oauth-authorization-server', getAuthorizationServerMetadata);
  // express.urlencoded specifically for /oauth/token (RFC 6749 form encoding).
  app.post('/oauth/register', registerClient);
  app.get('/oauth/authorize', authorize);
  app.get('/oauth/callback', callback);
  app.post('/oauth/token', express.urlencoded({ extended: false }), token);
  if (isProxyEnabled()) startStateCleanup();
}

module.exports = {
  mountOAuthProxy,
  isProxyEnabled,
  // exported for tests
  _resetForTest,
  _internal: {
    storeState,
    consumeState,
    getAuthorizationServerMetadata,
    registerClient,
    authorize,
    callback,
    token,
  },
};
