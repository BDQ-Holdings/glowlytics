#!/usr/bin/env node
// One-shot helper to mint an OAuth access token from Clerk for the Glowlytics MCP server.
// Runs the auth_code + PKCE flow, opens the browser, catches the redirect, exchanges
// code for token, prints the export line.
//
// Required env vars:
//   CLERK_OAUTH_CLIENT_ID      e.g. XszcYauNAWSpoz98 (or pass as --client-id)
//   CLERK_OAUTH_CLIENT_SECRET  the secret Clerk gave you (or pass as --client-secret)
//
// Usage:
//   node scripts/mcp-token.mjs
//   CLERK_OAUTH_CLIENT_ID=... CLERK_OAUTH_CLIENT_SECRET=... node scripts/mcp-token.mjs

import http from 'node:http';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';

const CLERK_ISSUER = process.env.CLERK_ISSUER_URL || 'https://clerk.glowlytics.ai';
const REDIRECT_PORT = Number(process.env.MCP_TOKEN_PORT || 8765);
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = 'openid profile email offline_access';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [[m[1], m[2]]] : [];
  })
);
const clientId = args['client-id'] || process.env.CLERK_OAUTH_CLIENT_ID;
const clientSecret = args['client-secret'] || process.env.CLERK_OAUTH_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Missing CLERK_OAUTH_CLIENT_ID or CLERK_OAUTH_CLIENT_SECRET (env or --flag).');
  process.exit(1);
}

function b64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

const codeVerifier = b64url(crypto.randomBytes(32));
const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());
const state = b64url(crypto.randomBytes(16));

const authorizeUrl = new URL(`${CLERK_ISSUER}/oauth/authorize`);
authorizeUrl.searchParams.set('response_type', 'code');
authorizeUrl.searchParams.set('client_id', clientId);
authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authorizeUrl.searchParams.set('scope', SCOPES);
authorizeUrl.searchParams.set('code_challenge', codeChallenge);
authorizeUrl.searchParams.set('code_challenge_method', 'S256');
authorizeUrl.searchParams.set('state', state);

console.error('Opening browser to authorize…');
console.error(`If it doesn't open, paste this URL manually:\n${authorizeUrl.toString()}\n`);

const opener = process.platform === 'darwin' ? 'open'
  : process.platform === 'win32' ? 'start ""'
  : 'xdg-open';
exec(`${opener} "${authorizeUrl.toString()}"`);

const result = await new Promise((resolve, reject) => {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
    if (url.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');
    const err = url.searchParams.get('error');
    if (err) {
      res.writeHead(400, { 'content-type': 'text/html' }).end(`<h1>OAuth error: ${err}</h1>`);
      server.close();
      reject(new Error(`OAuth error: ${err}`));
      return;
    }
    if (!code) {
      res.writeHead(400, { 'content-type': 'text/html' }).end('<h1>No code in redirect.</h1>');
      server.close();
      reject(new Error('No code'));
      return;
    }
    if (returnedState !== state) {
      res.writeHead(400, { 'content-type': 'text/html' }).end('<h1>State mismatch — possible CSRF.</h1>');
      server.close();
      reject(new Error('state mismatch'));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' }).end(
      '<h1>Authorized.</h1><p>You can close this tab and return to your terminal.</p>'
    );
    server.close();
    resolve({ code });
  });
  server.listen(REDIRECT_PORT, '127.0.0.1');
  setTimeout(() => {
    server.close();
    reject(new Error('Timed out waiting for redirect (5 min).'));
  }, 5 * 60 * 1000);
});

console.error('Got code, exchanging for token…');

const tokenResp = await fetch(`${CLERK_ISSUER}/oauth/token`, {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: result.code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  }).toString(),
});

if (!tokenResp.ok) {
  console.error(`Token exchange failed: ${tokenResp.status}`);
  console.error(await tokenResp.text());
  process.exit(1);
}

const body = await tokenResp.json();
if (!body.access_token) {
  console.error('Token response missing access_token:');
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.error(`\nGot access_token (expires in ${body.expires_in || '?'}s).\n`);
console.log(`export MCP_BEARER_TOKEN='${body.access_token}'`);
if (body.refresh_token) {
  console.error(`(refresh_token also returned — useful for renewing later)`);
  console.error(`export MCP_REFRESH_TOKEN='${body.refresh_token}'`);
}
