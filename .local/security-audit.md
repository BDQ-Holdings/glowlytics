# Glowlytics security audit — findings + fix contract

Recon (6 parallel auditors) complete. The codebase is already strongly hardened:
- **SQLi: none.** Every query parameterized; the one dynamic SET clause (PATCH /api/users) is whitelist + `/^[a-z_]+$/` guarded.
- **MCP: sound.** Tool userId comes from the verified-token closure, never args; OAuth redirect allowlist + PKCE; no IDOR.
- **Authn: solid.** Dev passthrough strictly `NODE_ENV==='development'`; no-JWKS 503s in prod; RS256 + issuer pinned; admin secret `timingSafeEqual`.
- **Secrets: NOT leaked via git.** `git ls-files`/`git log --all` confirm no `.env`/secret/log file is tracked or ever committed; `.gitignore` covers them. The real `.env` files (apps/landing/.env, apps/glowlytics/backend/.env) are on-disk dev creds only.

Below are the CODE-fixable findings. Each fix is TDD: write a security regression test that FAILS on the vuln and PASSES after the fix, implement the fix, keep existing behavior intact. Do NOT run global gates/lint/build — the lead runs the full suite + adversarial review after.

═══════════════════════════════════════════════════════════════════════
OWNER: BACKEND  (files: apps/glowlytics/backend/app.js, queries/uv.js, db-init.js, server.js, + __tests__/security-*.test.js)
═══════════════════════════════════════════════════════════════════════

B1 [MED] IDOR — /api/uv/lead has no scan-creator↔claimant binding (app.js:684-727, queries/uv.js upsertLead/getScan).
   Anyone who knows a scan_id (UUID, returned to the scanning client) can attach their email and pull the victim's UV report PDF; `upsertLead` re-points an existing lead's scan_id via COALESCE(EXCLUDED.scan_id,...).
   FIX (capability-token binding — FROZEN CONTRACT, coordinate with LANDING):
   - db-init.js: add migrationV6 → `ALTER TABLE uv_scans ADD COLUMN IF NOT EXISTS claim_token TEXT;` and apply in initSchema.
   - queries/uv.js: `insertScan` accepts + stores `claim_token`; `getScan` returns it; `upsertLead` MUST NOT re-point an existing lead's scan_id (drop the COALESCE overwrite — keep the original scan_id for an existing email); add `getLeadByScan(pool, scanId)` if helpful.
   - app.js POST /api/uv/analyze: generate `const claim_token = crypto.randomBytes(16).toString('hex')`, pass to insertScan, and RETURN it in the 200 body as `claim_token`.
   - app.js POST /api/uv/lead: read `claim_token` from body; load scan; if `scan.claim_token` is set and `claim_token !== scan.claim_token` → 403 `{error:'invalid claim token'}`; if the scan is already claimed by a DIFFERENT email → 409. Keep idempotent re-claim by the SAME email (returns existing report_token). Legacy scans with null claim_token: allow (back-comaptible) but log.
   - Net: only the client that ran the scan (holds claim_token) can claim its report; no re-pointing; no double-claim across emails.
   TESTS: claim with correct token → 200; wrong/absent token on a token-bearing scan → 403; second claim of same scan by a different email → 409; same-email re-claim → idempotent 200 same token; cannot re-point an existing lead to another scan_id.

B2 [MED] Error leak — SSE catch returns raw err.message in prod (app.js:~1427, POST /api/vision/generate-insights).
   FIX: when res.headersSent, write `data: ${JSON.stringify({ error: safeErrorMessage(err) })}` (not err.message). Non-streaming branch already uses safeErrorMessage.
   TEST: force a post-stream error in production mode → SSE error payload equals 'Internal server error', never the raw message.

B3 [LOW] authorizeUser fail-open shape (app.js:765-770) + stale comment (761-764).
   FIX: `if (!req.auth || req.auth.userId !== userId) { res.status(403)...; return false; }`; delete/replace the stale "req.auth === null in dev" comment.
   TEST: unit-call authorizeUser with req.auth undefined → returns false + 403 (fail closed).

B4 [LOW] convertUvLeadToCustomer trusts body.email when CLERK_SECRET_KEY unset (app.js:~1607-1635).
   FIX: only bind using the Clerk-verified primary email; if CLERK_SECRET_KEY is unset (cannot verify), do NOT fall back to req.body.email — skip the conversion (return). Remove the bodyEmail fallback for the binding.
   TEST: with CLERK_SECRET_KEY unset, POST /api/users with body.email matching a victim lead → does NOT markCustomer/convert (no cross-account binding).

B5 [LOW] Self-service entitlement escalation — PATCH /api/users/:id whitelist includes trial_start_date/trial_end_date (ALLOWED_USER_FIELDS ~220-238).
   FIX: remove `trial_start_date` and `trial_end_date` (and any subscription/entitlement field) from the client-writable whitelist. Keep benign UX fields (e.g. onboarding_complete) only if they are not entitlement gates — verify. Server/billing sets trial dates.
   TEST: PATCH /api/users/:id (self) with trial_end_date in body → field is ignored (not persisted); a benign whitelisted field still updates.

B6 [LOW] Unbounded image_base64 on public UV endpoints (app.js:~653,672 — /api/uv/screen, /api/uv/analyze).
   FIX: add the same size guard the vision routes use — if `typeof image_base64==='string' && image_base64.length > N` (use the vision route's constant, ~15MB) → 413. Place before processing.
   TEST: oversized image_base64 → 413 on both endpoints; normal size → still works.

B7 [LOW] unhandledRejection logs full reason object (server.js:33).
   FIX: `console.error('[server] Unhandled promise rejection (continuing):', reason?.message ?? reason)`.
   (No test needed; trivial — or a tiny unit asserting the handler stringifies message.)

═══════════════════════════════════════════════════════════════════════
OWNER: MCP  (files: apps/glowlytics/backend/mcp/auth.js, mcp/rate-limit.js, + mcp/__tests__)
═══════════════════════════════════════════════════════════════════════

M1 [LOW] auth.js (99-107): aud/resource binding effectively bypassed for any allowlisted client_id (proxy client auto-added). 
   FIX: enforce strict audience as the primary check — keep accepting when `aud/resource === ${baseUrl}/mcp`; treat the client_id allowlist as a NARROW, explicitly-documented escape hatch (add a code comment that allowlisted client_ids MUST be MCP-exclusive). Do not weaken existing passing tests; if both checks are OR'd today, keep behavior but document + ensure a token with a wrong aud AND a non-allowlisted client is rejected (it already is). Minimal, test-driven.
   TEST: token with correct aud → accepted; token with wrong aud and non-allowlisted client_id → rejected; (existing proxy-client behavior preserved).

M2 [LOW] rate-limit.js: unbounded `buckets` Map (memory growth / slow DoS).
   FIX: in sweep()/on access, delete buckets whose burst+minute arrays are both empty; keep per-user limiting intact.
   TEST: after a user's window fully expires and sweep runs, the bucket entry is evicted; active users keep their buckets + limits.

(M3 per-instance scope is a documented deployment note — no code change; mention in report.)

═══════════════════════════════════════════════════════════════════════
OWNER: LANDING  (files: apps/landing/app/page.tsx, apps/landing/.gitignore [new], apps/landing/wrangler.toml)
═══════════════════════════════════════════════════════════════════════

L1 [LOW] page.tsx (~97-99): JSON-LD uses raw JSON.stringify in dangerouslySetInnerHTML instead of the project's safeJsonLd().
   FIX: import safeJsonLd from lib/jsonld and use `dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}` (matches every other schema component).
   TEST: not required for a static literal; verify `tsc --noEmit` still clean (lead runs it). If trivial, add a unit asserting safeJsonLd escapes `</script>`.

L2 [DEFENSE] add apps/landing/.gitignore covering `.env`, `.env.*`, `*.log` (the landing app currently has NO local .gitignore — relies only on the root rule). Belt-and-suspenders so a future apps/landing/.env can't be committed.

L3 [MED — OPS] wrangler.toml RATE_LIMIT_KV binding commented out → rateLimited() fails OPEN in prod (waitlist/track abuse + D1 cost). This needs a provisioned CF KV namespace (infra), so leave a clear TODO comment block in wrangler.toml with the exact `wrangler kv:namespace create` step and note that write endpoints should fail closed once bound. Document in the report as the one finding requiring an infra action. Do NOT silently break signups by failing closed without a binding.

═══════════════════════════════════════════════════════════════════════
OWNER: MOBILE  (files: apps/glowlytics/src/services/secureStorage.ts + its test; remove apps/glowlytics/eas-build.log from disk)
═══════════════════════════════════════════════════════════════════════

MO1 [LOW] secureStorage.ts (38-63): AES-256-CTR provides confidentiality but NO integrity (undetected tamper).
   FIX: switch the at-rest blob to an authenticated scheme — AES-256-GCM (preferred) storing `v2:iv:tag:ciphertext`, OR append an HMAC-SHA256 over `v1:iv:ciphertext`. Keep the key in the OS keychain as today; keep backward-compatible read of existing `v1:` blobs (decrypt-old, re-encrypt-new) so users aren't logged out.
   TEST: round-trip encrypt→decrypt; a tampered ciphertext/tag is REJECTED (throws/returns null), not silently returned; legacy v1 blob still readable.

MO2 [LOW] delete the on-disk apps/glowlytics/eas-build.log (not git-tracked, but echoes the public client env block; tidy it). Confirm it's gone.

L4 [LANDING — REQUIRED, pairs with B1] Thread the UV claim_token through the landing scan client so the flow does NOT regress once the backend issues/enforces it.
   Files (LANDING owner): apps/landing/app/uv-scan/lib.ts, apps/landing/app/uv-scan/driver/DriverFlow.tsx.
   - lib.ts: add `claim_token: string` to `AnalyzeResponse`; `postLead(email, scanId, claimToken, source?)` sends `claim_token` in the body.
   - DriverFlow.tsx: capture `claim_token` from the analyze result into state, pass it to postLead in submitEmail.
   - Field name FROZEN: `claim_token`. Verify `cd apps/landing && npx tsc --noEmit` (lead reruns it).

═══════════════════════════════════════════════════════════════════════
NOT code-fixable (report only — operator actions):
- Rotate the dev credentials in apps/landing/.env (SerpAPI/Anthropic/OpenAI) and apps/glowlytics/backend/.env (CLERK_SECRET_KEY) before any sk_live swap. Confirmed NOT in git history.
- Provision CF KV for landing rate limiting (L3).
- MCP multi-instance rate limiting needs a shared store if scaled (M3).
═══════════════════════════════════════════════════════════════════════

RULES FOR ALL FIX AGENTS:
- TDD: failing security test first, then fix, then green. Put backend tests in __tests__/ matching the existing jest harness (mock pg/openai/rag like vision.test.js / uv-endpoints.test.js).
- Run ONLY your own new test file(s): `cd apps/glowlytics/backend && npx jest <file> --forceExit`. Do NOT run the full suite/lint/build.
- Touch ONLY your OWNER file set. Do NOT edit another owner's files. The UV claim_token field name is FROZEN as `claim_token` (BACKEND defines, LANDING consumes).
- Preserve all existing behavior/tests — these are security hardenings, not rewrites. Report exact changes + paste your jest summary.
