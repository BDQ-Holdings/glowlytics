# Glowlytics — Security Audit Report

**Date:** 2026-06-17
**Scope:** Full monorepo `~/cornell-hackathon` — Expo/React Native mobile client, Express/PostgreSQL backend, MCP server + OAuth DCR proxy, Next.js/Cloudflare landing site, SEO pipeline, CI, secrets & supply chain.
**Method:** Five parallel read-only reviewers (one per surface), each finding anchored to `path:line` with quoted evidence; the highest-severity findings were independently re-verified by the lead against source. No code was changed.
**Supersedes:** the 2026-04-13 report (which covered only the old `RadianceIQ/` mobile app + backend). A re-verification of those prior findings (SBP-001..008) is in §7.

> Per-surface evidence files (full detail): `mcp/oauth-proxy` findings at `.omp/local/security/mcp-oauth.md`; backend/mobile/landing/secrets at `local://security/{backend-core,mobile-client,landing,secrets-supplychain}.md`.

---

## 1. Executive summary

No committed server secrets, no SQL injection in any runtime path, and no remote code execution in the production request path. Tooling that handles the crown jewels is mostly sound: **all MCP tools are correctly user-scoped from the verified token (no IDOR), all backend SQL is parameterized, and auth tokens on the device live in the OS keychain (expo-secure-store), not AsyncStorage.**

The real risk is concentrated in three places:

1. **An OAuth authorization-code interception path** in the MCP OAuth proxy (`redirect_uri` is never validated against an allowlist) that can lead to **account takeover of a user's health data** when the proxy is enabled. *(MCP-01, High)*
2. **Unauthenticated and unbounded access to paid GPT-4o endpoints** on the backend, protected only by an in-memory per-IP limiter that is itself broken behind the Railway proxy — straightforward cost-exhaustion / availability abuse. *(BC-001 High, BC-004 + BC-006 Medium)*
3. **Sensitive health/biometric data handled below its stated protection level** — HIPAA-adjacent profile/cycle/health data and face photos persisted unencrypted on device, while the in-app privacy UI claims "Encrypted at rest" and "your face never leaves your phone." This is both a data-at-rest weakness and an FTC/App-Store deceptive-claims exposure. *(MOB-01/02/03, Medium)*

A committed demo-review credential (`test@test.com` / `AppleTest123!`) that — per `CLAUDE.md` — is deliberately configured with MFA off + Bypass-Client-Trust, ties #2 together: anyone with repo read access has a working login to the authenticated, paid API (§6 correlated chains).

### Finding counts (consolidated)

| Severity | Count | IDs |
|---|---|---|
| Critical | 0 | — |
| **High** | **2** | MCP-01, BC-001 |
| **Medium** | **19** | BC-002, BC-003, BC-004, BC-005, BC-006, MCP-02, MCP-04, MOB-01, MOB-02, MOB-03, LND-01, LND-02, LND-03, LND-06, SC-1, SC-2, SC-3, SC-4, SC-6\* |
| Low | 15 | BC-007, BC-008, MCP-03, MCP-05, MCP-06, MOB-04, MOB-05, MOB-06, LND-04, LND-05, LND-07, LND-08, LND-09, SC-5, SC-7 |
| Informational | 1 | LND-10 |

\* SC-6 (committed demo credentials) was rated Low by the surface reviewer; the lead raises it to Medium because the credential is live and the account is intentionally hardening-disabled (see §6).

---

## 2. High severity

### [MCP-01] OAuth proxy does not validate `redirect_uri` → authorization-code theft / account takeover
- **Severity:** High (approaches Critical given health-data exposure)
- **Location:** `apps/glowlytics/backend/mcp/oauth-proxy.js:148-160` (stores caller `redirect_uri` unvalidated), `:190-201` (302s to it with the Clerk `code`), `:120-133` (DCR persists no registered redirect URIs)
- **Evidence:** `authorize()` does `const clientRedirectUri = typeof q.redirect_uri === 'string' ? q.redirect_uri : ''` → `storeState({ redirectUri: clientRedirectUri })` with no allowlist; `callback()` then `target = new URL(entry.redirectUri); target.searchParams.set('code', q.code); res.redirect(302, target.toString())`.
- **Impact:** An attacker crafts `/oauth/authorize?client_id=<static>&response_type=code&redirect_uri=https://attacker.example/cb`, phishes a victim; after the victim signs in at Clerk the proxy redirects the victim's browser to the attacker with a live authorization `code` for the victim's account. With PKCE optional (MCP-02) and `token_endpoint_auth_method: 'none'`, the attacker redeems it for the victim's MCP access token and reads that user's skin/face/bone-structure health data. PKCE does **not** mitigate this — the attacker controls the whole authorize request, so redirect_uri allowlisting is the required control.
- **Fix:** Validate `redirect_uri` against a configured exact-match allowlist (https or known-loopback) in `authorize()` *before* `storeState`, and re-assert it in `callback()` before redirecting. Persist the `redirect_uris` supplied at DCR per `client_id` and enforce them. Reject mismatches with `invalid_request`.
- **Gating:** Requires `MCP_OAUTH_PROXY_ENABLED=true` (CLAUDE.md indicates this is set in production).

### [BC-001] Public unauthenticated endpoint triggers paid GPT-4o vision calls (cost-amplification)
- **Severity:** High
- **Location:** `apps/glowlytics/backend/app.js:539` (route registered **before** `app.use(authMiddleware)` at `:669`); OpenAI call at `:552-560`
- **Evidence:** `app.post('/api/products/identify-photo', photoRateLimit, …)` → `openai.chat.completions.create({ model: 'gpt-4o', … })`. (`/api/vision/detect-lesions` at `:276` is likewise pre-auth but runs ONNX/CPU, not paid OpenAI.)
- **Impact:** Any unauthenticated client can drive paid GPT-4o inference. The only control is an in-memory per-IP limiter (5/10s) that is bypassable by IP rotation **and currently broken** because `trust proxy` is unset (BC-006), so attacker-controlled spend and degraded availability are realistic.
- **Fix:** Move the route below `app.use(authMiddleware)` or gate with a signed short-lived token / CAPTCHA; add per-user daily quotas + an upstream OpenAI budget circuit-breaker.
- **Prior:** SBP-002 — STILL PRESENT.

---

## 3. Medium severity

**Backend (`apps/glowlytics/backend/app.js` unless noted)**
- **[BC-002] DB TLS verification disabled** — `ssl: { rejectUnauthorized: false }` at `app.js:41`, `server.js:16`, `db-init.js:5`, and `queries/{scans,bone-structure,routine,reports}.js`. Accepts any cert → MITM of HIPAA-adjacent DB traffic. Set `rejectUnauthorized: true` + provider CA; gate insecure TLS behind a dev-only flag. *(SBP-003 still present, now duplicated ×7.)*
- **[BC-003] CORS fails open** — `app.js:28-32`: `cors(undefined)` reflects any Origin when `CORS_ORIGINS` is unset. Fail closed (throw at startup) in production. *(SBP-005 still present. Bearer auth, no cookies → limited to token-bearing reads, hence Medium.)*
- **[BC-004] Authenticated GPT-4o streaming endpoint has no rate limiter** — `app.js:1166` `/api/vision/generate-insights` streams `gpt-4o` (`max_tokens:1500`) with no limiter, unlike its siblings that use `analyzeRateLimit`. One abusive/compromised account → unbounded spend. Apply a per-user quota. *(New.)*
- **[BC-005] JWT not pinned to audience/azp/algorithm** — `app.js:132` `jwt.verify(token, getKey, { issuer })` only. A same-issuer token for a different audience is accepted. Add `audience`, validate `azp`, pin `algorithms:['RS256']`. *(SBP-001 partial — RS256→HS256 confusion is **not** exploitable: `jsonwebtoken@9.0.3` forces RSA for a PEM key; residual risk is the missing audience binding.)*
- **[BC-006] Per-IP rate limiters ineffective behind Railway proxy + in-memory** — no `app.set('trust proxy', …)`, so `req.ip` is the proxy; all public traffic collapses into one shared bucket (an abuser can exhaust the global quota for everyone) and limits are per-process `Map`s that reset on restart. This is the control behind BC-001/BC-004, so its failure compounds them. Set `trust proxy` + move to a shared (Redis) store with per-user cost quotas. *(SBP-008 worsened.)*

**MCP / OAuth (`apps/glowlytics/backend/mcp/`)**
- **[MCP-02] PKCE not enforced for the shared static `client_id`** — `oauth-proxy.js:152-163` forwards `code_challenge` only if present, never requires it, despite the design comment claiming "PKCE is required end-to-end." Require `code_challenge=S256` in `authorize()` and `code_verifier` in `token()`. Amplifies MCP-01.
- **[MCP-04] Audience binding degrades to a client_id allowlist** — `auth.js:60-83`: because `authorize()` never sends an RFC 8707 `resource` param (`oauth-proxy.js:164-176`), Clerk tokens lack `aud=…/mcp`, so the sole effective control is the client_id allowlist (which auto-trusts `MCP_OAUTH_PROXY_CLIENT_ID`). Any token for that OAuth client passes. Send `resource=${baseUrl}/mcp` and require `audMatches`.

**Mobile (`apps/glowlytics/`)**
- **[MOB-01] Health/profile data persisted unencrypted in AsyncStorage** — `src/store/useStore.ts:1081`: the `glowlytics_data` blob holds biological sex, menstrual status/flow, cycle length, birth-control type, HRV/sleep/HR (HealthKit), skin/acne/sun-damage scores, lesions, cycle↔skin patterns, and `photo_uri`s — all cleartext, readable on a jailbroken/rooted device or unencrypted backup. Encrypt the sensitive subset (SQLCipher, or AES with a key in expo-secure-store). *(SBP-006 still present.)*
- **[MOB-02] Face photos stored as plaintext JPEG on device** — `app/scan/analyzing.tsx:279-290`, `app/scan/camera.tsx:48-55`: kept up to 90 days under `documentDirectory/scan_photos/`. Encrypt at rest / no-backup path; ensure deletion wipes them.
- **[MOB-03] Privacy UI overstates protection (potential FTC / App-Store deceptive claims)** — `app/settings/privacy.tsx:42` "Face photos … Encrypted at rest" (they are plaintext; "124 MB" is hardcoded); `:33-35` "Your face never leaves your phone." / "We see numbers, not pictures." (photos are uploaded to `/api/vision/*` and `/api/products/identify-photo` and on to OpenAI); `:69` "App lock: Face ID" (no `expo-local-authentication` exists; sharing toggles are inert `useState`); `app/scan/method.tsx:126` and `app/privacy-policy.tsx:362` ("secure local storage") repeat the claims. Reword to match reality or implement the controls.

**Landing (`apps/landing/`)**
- **[LND-01] JSON-LD `</script>` breakout XSS** — `components/ArticleSchema.tsx:31-34` (and `FAQSchema`/`Breadcrumbs`/`HowToSchema`) inject `JSON.stringify(schema)` into `dangerouslySetInnerHTML`; `JSON.stringify` doesn't escape `<`/`/`, and the fields are LLM-generated. A `</script>…` value (reachable via indirect prompt injection from scraped SERP content) yields stored XSS, invisible to the article-body review. Escape `<`→`\u003c` (and U+2028/2029).
- **[LND-02] Unsanitized MDX compilation (stored XSS + build-time RCE)** — `lib/mdx.ts:6-16` compiles article bodies via `next-mdx-remote` with no `rehype-sanitize`; `scripts/seo-engine/src/write.ts:246-263` writes raw LLM output. MDX evaluates `{expressions}` and raw HTML/JSX; with `output:"export"`, a malicious expression runs at `next build` with `process.env` (provider keys) in scope. Add `rehype-sanitize` and treat AI output as untrusted.
- **[LND-03] No abuse controls on public POST endpoints** — `functions/api/waitlist.ts`, `track.ts`: unauthenticated `*`-CORS POSTs do an unconditional D1 write with no rate limit/CAPTCHA/Turnstile (track's only defense is a spoofable UA regex). Add Cloudflare rate limiting + Turnstile + per-IP/day cap.
- **[LND-06] SSRF in the SEO extractor** — `scripts/seo-engine/src/lib/extractor.ts:20-30` fetches SERP organic-result URLs and follows redirects with no scheme/private-IP guard, feeding up to 15 KB into the LLM dossier. A ranking/attacker URL can 30x-redirect to `169.254.169.254`/`localhost` in CI. Restrict to https, block private/link-local ranges, `redirect:"manual"` + re-validate.

**Secrets / supply chain / CI**
- **[SC-1] No lockfile for the deployed backend/mobile workspaces** — only the monorepo-root `package-lock.json` exists; Railway (`rootDirectory=apps/glowlytics/backend`) and EAS run `npm install` (not `npm ci`), resolving caret ranges at build time → every deploy can pull an unreviewed/compromised dependency version. CI `cache-dependency-path`s point at lockfiles that don't exist. Commit lockfiles in each deployed root + use `npm ci`.
- **[SC-2] postinstall model download from a moving HuggingFace ref, no checksum** — `backend/scripts/download-models.sh:9,26` pulls ONNX from `…/resolve/main` with only a byte-size floor → a compromised HF repo / force-updated `main` silently loads a tampered model into the inference path. Pin to an immutable HF commit + verify SHA-256. *(Note: the startup downloader `signal-models.js` GH_BASE is already commit-pinned `18966b9` — that path is fine.)*
- **[SC-3] Third-party GitHub Actions pinned to mutable tags** — `expo/expo-github-action@v8` (`deploy-mobile.yml:86,125`, `preview-mobile.yml:52`), `peter-evans/*@v3/v4`. The submit job runs the expo action with Apple/Google store-signing secrets + `EXPO_TOKEN` in scope → a re-pointed tag = store-account takeover. Pin to 40-char SHAs + Dependabot.
- **[SC-4] No `permissions:` block in any workflow** — `ci.yml`, `deploy-backend.yml`, `deploy-mobile.yml`, `preview-mobile.yml` inherit the repo/org default `GITHUB_TOKEN`; if that default is "read and write," the PR-triggered `preview-mobile.yml` (which builds untrusted PR code) gets a write token. Add top-level `permissions: { contents: read }` + minimal per-job grants.
- **[SC-6] Committed demo-review credentials** *(raised to Medium — see §6)* — `apps/glowlytics/app-store-metadata.json:29-32`: `"email":"test@test.com","password":"AppleTest123!"` is git-tracked, and per CLAUDE.md the account has MFA off + Bypass-Client-Trust. Anyone with repo access can log in to the authenticated, paid API. Keep review creds in App Store Connect notes only; rotate; rate-limit the demo account so it cannot incur spend.

---

## 4. Low severity

| ID | Title | Location |
|---|---|---|
| BC-007 | No `helmet()` / `x-powered-by` enabled | `app.js:32-33` |
| BC-008 | Error/stack leakage if `NODE_ENV≠production`; 20 MB global JSON body limit | `app.js:155-160`, `:33` |
| MCP-03 | JWT `algorithms` not pinned to `['RS256']` (jose mitigates in practice) | `mcp/auth.js:46-48` |
| MCP-05 | Rate limiter per-process in-memory + `MCP_DISABLE_RATE_LIMIT` kill-switch | `mcp/rate-limit.js:6,17` |
| MCP-06 | Beta allowlist fails open when `MCP_BETA_USER_IDS` is empty | `mcp/auth.js:81-82` |
| MOB-04 | No HTTPS-scheme enforcement for prod API base URL (only logs on `localhost`) | `src/config/env.ts:37-38` |
| MOB-05 | `test@test.com` DemoSeeder ships in prod (not an auth bypass; runs post-auth) | `app/_layout.tsx:86-120` |
| MOB-06 | `ACCESS_FINE_LOCATION` overreach (feature needs coarse only) | `app.json:36-38` |
| LND-04 | Waitlist email-enumeration oracle via `alreadyOnList` | `functions/api/waitlist.ts:79-81` |
| LND-05 | Public unauthenticated total-signup-count leak | `functions/api/waitlist.ts:96-107` |
| LND-07 | Non-parameterized SQL (operator CLI) run against **prod** D1 | `scripts/seo-engine/src/report.ts:201-203` |
| LND-08 | Hardcoded fallback `TRACK_SALT` weakens visitor-hash anonymization | `functions/api/track.ts:111` |
| LND-09 | Preview route can publish unreviewed drafts when `ENABLE_CONTENT_PREVIEW=1` | `app/preview/[type]/[slug]/page.tsx:16-26` |
| SC-5 | PR-triggered preview runs lifecycle scripts with `EXPO_TOKEN` (no `--ignore-scripts`) | `preview-mobile.yml:48-55` |
| SC-7 | `@railway/cli` installed unpinned at deploy time | `deploy-backend.yml:47` |

---

## 5. Informational

- **[LND-10]** `apps/landing/.env` holds live-looking SerpAPI / Anthropic (`sk-ant-…`) / OpenAI (`sk-proj-…`) keys. **Verified gitignored and NOT tracked** — not a committed-secret finding. Reported only so the keys are confirmed managed/rotated (treat as live if the workstation/CI was ever shared).

---

## 6. Cross-surface correlated risk chains

1. **Committed creds → authenticated cost-abuse.** SC-6 (working `test@test.com`/`AppleTest123!`, MFA off, Bypass-Client-Trust per CLAUDE.md) + BC-004 (unrated `/api/vision/generate-insights` GPT-4o stream) + BC-006 (broken rate limiting) = anyone with repo read access can sign in and drive unbounded paid GPT-4o spend. Fixing BC-001 alone (auth on the public route) does **not** close this — also fix BC-004 (per-user quota) and SC-6 (creds out of repo + demo account spend-capped).
2. **Prompt injection → XSS/RCE → secret exfiltration on the landing build.** LND-06 (SSRF/scraped content) feeds the writer prompt; LND-02 (unsanitized MDX) lets a surviving `{expression}` execute at `next build` with the LND-10 provider keys in `process.env`; LND-09 (preview flag) and LND-01 (head-only JSON-LD XSS) widen the blast radius past human review. Sanitizing AI output (LND-02) is the highest-leverage single fix here.
3. **OAuth proxy takeover.** MCP-01 (no redirect_uri allowlist) + MCP-02 (PKCE optional) + MCP-04 (audience degraded to client_id) compound: redirect_uri allowlisting + mandatory PKCE + RFC 8707 `resource` together restore the intended "static client_id is safe" guarantee.

---

## 7. Prior report (2026-04-13) re-verification

| Prior | Topic | Status (2026-06-17) | Now tracked as |
|---|---|---|---|
| SBP-001 | JWT no audience/azp | **Partial** — legacy backend still unpinned; MCP path added an aud/client gate | BC-005, MCP-03/04 |
| SBP-002 | Public endpoint → paid OpenAI | **Still present** | BC-001 |
| SBP-003 | DB TLS `rejectUnauthorized:false` | **Still present** (now ×7 files) | BC-002 |
| SBP-004 | Client non-HTTPS base URL | **Still present** (recalibrated Low; app can't downgrade at runtime) | MOB-04 |
| SBP-005 | CORS fail-open | **Still present** | BC-003 |
| SBP-006 | AsyncStorage at-rest | **Still present** (broadened to face photos + false privacy copy) | MOB-01/02/03 |
| SBP-007 | No helmet / headers | **Still present** | BC-007 |
| SBP-008 | In-memory rate limiting | **Still present + worsened** (no `trust proxy`) | BC-006 |

None of the prior findings were fully remediated; the most material regression is SBP-008 → BC-006 (the limiter is now effectively a single shared global bucket behind the proxy).

---

## 8. Verified-OK (positive assurances)

- **SQL injection:** none. Every backend query (`queries/*`, inline `pool.query`, the whitelisted dynamic `PATCH /api/users/:id` SET clause) and both runtime Cloudflare D1 functions use bound parameters.
- **MCP tool authorization:** clean. Every tool derives `userId` from the verified token (`payload.sub`), pairs user-supplied scan IDs with `userId` in `WHERE user_id = $1` — no IDOR, no cross-user leak.
- **Client-supplied userId trust:** fixed — write routes use `req.auth.userId`, reads gate via `authorizeUser()`, ownership of `daily_id` is verified before persist.
- **Auth token storage (mobile):** secure — Clerk tokens in expo-secure-store (Keychain/Keystore); httpClient cache is in-memory and cleared on sign-out; no token/PII logged outside `__DEV__`.
- **Committed secrets:** none. Only `*.env.example` and publishable client keys (`pk_*`, RevenueCat `appl_*` SDK key, PostHog `phc_*`) are tracked; `.gitignore` covers `.env`/keys.
- **Admin secret:** `crypto.timingSafeEqual` with length guard. **OAuth state:** 24 random bytes, single-use, 10-min TTL. **client_secret:** never returned or logged by the proxy. **Command injection / SSRF in backend:** none (no shell-out; fixed SDK hosts). **No WebView/clipboard/unsafe deep-link** in the mobile app.

---

## 9. Recommended remediation order

1. **MCP-01** — add `redirect_uri` allowlist + re-assert on callback (account-takeover path). Pair with **MCP-02** (require PKCE) and **MCP-04** (RFC 8707 `resource`).
2. **BC-001 + BC-004 + BC-006** — auth/quota the paid GPT-4o routes and fix `trust proxy`; **SC-6** — pull demo creds from the repo and cap the demo account (closes the cost-abuse chain end-to-end).
3. **MOB-01/02/03** — encrypt health/face data at rest and correct the privacy claims (data-protection + legal exposure).
4. **LND-02 (+ LND-01, LND-06, LND-09)** — sanitize AI-generated content before MDX compile / JSON-LD injection (XSS + build-time RCE chain).
5. **BC-002, BC-003, BC-005** — DB TLS verification, CORS fail-closed, JWT audience pinning.
6. **SC-1/2/3/4** — lockfiles + `npm ci`, immutable model pin + checksum, SHA-pin actions, least-privilege `permissions:`.
7. Remaining Low/hardening items (helmet, body-limit scoping, LND-03 abuse controls, enumeration/count leaks, salt, etc.).

---

*Per-surface detail with full evidence snippets: `.omp/local/security/mcp-oauth.md`, `local://security/backend-core.md`, `local://security/mobile-client.md`, `local://security/landing.md`, `local://security/secrets-supplychain.md`.*
