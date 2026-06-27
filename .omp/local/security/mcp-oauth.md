# MCP Server + OAuth DCR Proxy — Security Audit

Surface: `apps/glowlytics/backend/mcp/` (auth, oauth-proxy, well-known, config,
clerk-clients, rate-limit, transport, schemas, server, tool-helpers, errors,
logger, tools/*) + mount wiring in `apps/glowlytics/backend/app.js`.
Reviewer: SecMcpOauth. Date: 2026-06-17. AUDIT ONLY — no code changed.

## Direct answers to required questions

(a) **JWT audience/azp enforced? algorithms pinned?**
 - Audience: PARTIALLY. `requireMcpAuth` does NOT pass `audience` to `jwtVerify`
   (auth.js:46-48). It instead does a manual check (auth.js:60-83): accept if
   `aud`/`resource` contains `${baseUrl}/mcp` **OR** `client_id` is in
   `allowedClientIds`. Because the proxy never sends an RFC 8707 `resource`
   param to Clerk on `/authorize` (oauth-proxy.js:164-176), Clerk tokens will
   generally NOT carry the MCP `aud`/`resource`, so the effective control is the
   **client_id allowlist**, which auto-includes `MCP_OAUTH_PROXY_CLIENT_ID`
   (config.js:11). See MCP-04.
 - azp: NOT checked by name. Clerk OAuth access tokens identify the client via
   `client_id`; the code checks `payload.client_id` against the allowlist
   (auth.js:55-58, 80), which is the functional equivalent of an `azp` check.
 - Algorithms: NOT pinned. `jwtVerify(token, getJwks(), { issuer })` omits
   `algorithms: ['RS256']` (auth.js:46-48). See MCP-03.

(b) **redirect_uri validated against an allowlist (open-redirect)?**
 - NO. `authorize()` accepts any non-empty `redirect_uri` string and stores it
   verbatim (oauth-proxy.js:148-160); `callback()` 302-redirects to that stored
   value (oauth-proxy.js:190-201) with the Clerk auth `code` attached. There is
   no per-client redirect_uri registration/allowlist anywhere (DCR
   `registerClient` echoes `redirect_uris` but persists nothing,
   oauth-proxy.js:120-133). See MCP-01 (the headline finding).

(c) **OAuth state CSRF/replay-protected?**
 - YES, for the proxy<->Clerk leg. `proxyState` is 24 random bytes
   (oauth-proxy.js:54-56), single-use (deleted on consume, oauth-proxy.js:66-72),
   TTL 10 min. The caller's own `state` is preserved and returned. State
   handling itself is sound; the weakness is redirect_uri (MCP-01), not state.

(d) **All MCP tools user-scoped from token, not args?**
 - YES — confirmed end-to-end. `req.userId = payload.sub` (auth.js:84) ->
   `buildMcpServer({ userId })` (transport.js:9, server.js:27-33) -> each tool
   closes over `userId` and passes it to query functions. Every SQL query is
   parameterized and filtered `WHERE dr.user_id = $1` (queries/scans.js,
   reports.js, bone-structure.js, routine.js). User-supplied scan IDs (`a`,`b`,
   `scanId`) are always paired with `userId` (e.g. `getScanById(userId, a)`,
   `getReportForScan(userId, scanId)`), so there is **no IDOR / cross-user
   leak** and **no SQL injection**. Ingredient tools are a global knowledge base
   (no user data) and correctly take no userId. This is a clean PASS.

(e) **Does the proxy leak client_secret?**
 - NO. `registerClient` returns only the public `client_id` (oauth-proxy.js:123-132).
   Metadata exposes no secret (oauth-proxy.js:99-117). `token()` uses the secret
   only to build an upstream `Authorization: Basic` header to Clerk and does not
   echo it back; it pipes through Clerk's token response unchanged
   (oauth-proxy.js:226-249). No secret is logged.

Re-verification of prior **SBP-001** (JWT audience): the prior finding targeted
`backend/app.js:128` (the legacy session middleware, out of scope here). For the
NEW `mcp/auth.js` verifier it is **PARTIALLY-FIXED**: an explicit
audience/resource-or-client_id gate now exists (was absent), but `algorithms`
are still not pinned and audience binding degrades to the client_id allowlist
(MCP-03, MCP-04).

---

## Findings

### [MCP-01] OAuth proxy does not validate redirect_uri against an allowlist (open redirect + authorization-code / access-token theft)
- Severity: High
- Location: `apps/glowlytics/backend/mcp/oauth-proxy.js:148-160` (store, unvalidated), `oauth-proxy.js:190-201` (redirect to it), `oauth-proxy.js:120-133` (DCR persists no redirect_uris)
- Evidence:
  - `const clientRedirectUri = typeof q.redirect_uri === 'string' ? q.redirect_uri : '';` then `storeState({ ... redirectUri: clientRedirectUri, ... })` with no allowlist check.
  - In `callback()`: `target = new URL(entry.redirectUri); ... target.searchParams.set('code', q.code); ... res.redirect(302, target.toString());`
- Impact: An attacker can craft `/oauth/authorize?client_id=<static>&response_type=code&redirect_uri=https://attacker.example/cb` (PKCE optional, MCP-02), phish a victim to it; after the victim authenticates at Clerk the proxy 302s the victim's browser to the attacker with a live Clerk authorization `code` for the victim's account. The attacker redeems it at `/oauth/token` and obtains the victim's MCP access token, gaining read access to that user's sensitive skin/face/bone-structure health data. (Also a generic open redirect off a trusted backend domain.)
- Fix: Validate `redirect_uri` against a configured allowlist of exact, https (or known loopback) URIs in `authorize()` BEFORE `storeState`, and re-assert membership in `callback()` before redirecting. Persist/enforce the `redirect_uris` supplied at DCR per issued client_id rather than echoing them. Reject on mismatch with `invalid_request`.
- False-positive note: Exploit requires `MCP_OAUTH_PROXY_ENABLED=true` and a phishing click. Severity approaches Critical given health-data exposure and full account-scoped token theft.

### [MCP-02] PKCE not enforced for the shared static public client_id
- Severity: Medium
- Location: `apps/glowlytics/backend/mcp/oauth-proxy.js:152-163`
- Evidence: comment `// We don't reject without it` — `code_challenge` is only forwarded if present (`if (typeof q.code_challenge === 'string') upstream.searchParams.set(...)`), never required. Metadata advertises `code_challenge_methods_supported: ['S256']` (oauth-proxy.js:109) and DCR claims `token_endpoint_auth_method: 'none'`, implying PKCE is the only protection.
- Impact: The design's stated safety ("PKCE (S256) is required end-to-end so a shared static client_id is safe") is not actually enforced. Combined with MCP-01, an attacker needs no code_verifier at all to redeem an intercepted code. Even standalone, a leaked authorization code is replayable without proof of possession.
- Fix: Require `code_challenge` + `code_challenge_method=S256` in `authorize()` (reject otherwise), and require `code_verifier` for `grant_type=authorization_code` in `token()`.
- False-positive note: If Clerk itself mandates PKCE for this OAuth client, upstream enforcement reduces (but does not eliminate, see MCP-01 attacker-chosen-verifier) the impact.

### [MCP-03] JWT verification does not pin algorithms (alg-confusion / "none" hardening)
- Severity: Low
- Location: `apps/glowlytics/backend/mcp/auth.js:46-48`
- Evidence: `const { payload } = await jwtVerify(token, getJwks(), { issuer: cfg.clerkIssuer });` — no `algorithms: ['RS256']`.
- Impact: Defense-in-depth gap; the verifier does not explicitly constrain the accepted signature algorithm to the expected RS256.
- Fix: `jwtVerify(token, getJwks(), { issuer: cfg.clerkIssuer, algorithms: ['RS256'] })`.
- False-positive note: Real-world exploitability is low: `jose`'s `createRemoteJWKSet` resolves keys by `kid` and key type, so an RSA JWK cannot be coerced into HS256, and `jose` rejects `alg:none` in `jwtVerify`. Still recommended per RFC 9068 / MCP guidance.

### [MCP-04] Audience binding degrades to client_id allowlist because no RFC 8707 resource is requested
- Severity: Medium
- Location: `apps/glowlytics/backend/mcp/auth.js:60-83`; `apps/glowlytics/backend/mcp/config.js:7-11`; `apps/glowlytics/backend/mcp/oauth-proxy.js:164-176`
- Evidence: gate is `if (!audMatches && !clientAllowlisted) return 401`. `clientAllowlisted` auto-trusts `MCP_OAUTH_PROXY_CLIENT_ID` (config.js:11). `authorize()` forwards scope/PKCE/prompt to Clerk but never sets a `resource` param, so Clerk tokens lack `aud=${baseUrl}/mcp`, making `audMatches` effectively false and the client_id allowlist the sole control.
- Impact: Any Clerk OAuth access token minted for the SAME OAuth client (proxy client_id) — even one obtained for a different API/resource on the tenant — passes the MCP gate. Isolation depends entirely on that OAuth client being dedicated to MCP. `azp` is not independently asserted.
- Fix: Set `resource=${baseUrl}/mcp` (RFC 8707) on the upstream `/authorize` (and `/token`) request and require `audMatches` (treat the client_id allowlist as an additional constraint, not a substitute). Optionally validate `azp`/`client_id` explicitly.
- False-positive note: Acceptable if the OAuth client is provably single-purpose for MCP; fragile over time.

### [MCP-05] Rate limiter is per-process in-memory (horizontal-scale bypass) with an env kill-switch
- Severity: Low
- Location: `apps/glowlytics/backend/mcp/rate-limit.js:6,17-19`
- Evidence: `const buckets = new Map();` (module-local); `if (process.env.MCP_DISABLE_RATE_LIMIT === '1') return next();`
- Impact: On multi-instance deployments the per-user limit applies per instance, so effective throughput scales with replica count, weakening abuse/cost protection; `MCP_DISABLE_RATE_LIMIT=1` fully disables it. Key derivation (`req.userId`) and ordering (after `requireMcpAuth`) are otherwise correct — unauthenticated callers are rejected before consuming budget.
- Fix: Back the limiter with a shared store (e.g. Redis) for multi-instance correctness; ensure `MCP_DISABLE_RATE_LIMIT` cannot be set in production.
- False-positive note: Not an issue on a single Railway instance; flagged as defense-in-depth.

### [MCP-06] Beta allowlist fails open when MCP_BETA_USER_IDS is empty
- Severity: Low
- Location: `apps/glowlytics/backend/mcp/auth.js:81-82`; `apps/glowlytics/backend/mcp/config.js:2-6,18`
- Evidence: `const beta = cfg.betaUserIds; if (beta.size > 0 && !beta.has(payload.sub)) return res.status(403)...` — when the set is empty the gate is skipped entirely.
- Impact: With `MCP_ENABLED=true` and an empty `MCP_BETA_USER_IDS`, every authenticated Clerk OAuth user (subject to MCP-04's client gate) can call all MCP tools and read health data — there is no closed-beta restriction by default.
- Fix: If a closed beta is intended, fail closed on an empty/unset allowlist (deny unless explicitly listed), or require an explicit `MCP_BETA_OPEN=true` to allow all.
- False-positive note: May be intentional ("allowlist optional"); documented so the operator chooses deliberately.

---

## Positive assurances (verified, no finding)
- Tool user-scoping & SQL safety: PASS (see answer (d)).
- client_secret confidentiality: PASS (see answer (e)).
- Proxy state opacity / single-use / TTL: PASS (see answer (c)).
- Feature-flag gating: `/mcp`, well-known, and proxy mount only when `MCP_ENABLED==='true'` (app.js:659-665); proxy endpoints 404 unless `MCP_OAUTH_PROXY_ENABLED==='true'` + both client creds set (oauth-proxy.js:42-46). Fail-closed on mount.
- Bearer extraction (auth.js:39-43) and `WWW-Authenticate` 401 metadata (auth.js:20-34) are correct.

## Severity tally
High: 1 (MCP-01) | Medium: 2 (MCP-02, MCP-04) | Low: 3 (MCP-03, MCP-05, MCP-06) | Total: 6
