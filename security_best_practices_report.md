# Security Best Practices Review Report

Date: 2026-04-13  
Reviewer: Codex (`security-best-practices` workflow)

## Executive Summary

I reviewed the active app surfaces in this repository with a security focus:
- `RadianceIQ/backend` (Node.js + Express API)
- `RadianceIQ/src` and `RadianceIQ/app` (React Native / Expo client)

No obvious SQL injection or direct remote code execution paths were found in the reviewed code.  
The highest-risk issues are around auth boundary validation, public cost-amplifying endpoints, and transport hardening.

Finding counts:
- High: 4
- Medium: 3
- Low: 1

---

## High Severity

### [SBP-001] JWT validation does not enforce audience / authorized party constraints
- Severity: High
- Rule ID: `EXPRESS-AUTH-CLAIMS-001`
- Location:
  - `RadianceIQ/backend/app.js:128`
- Evidence:
  - `jwt.verify(token, getKey, { issuer: CLERK_ISSUER_URL }, ...)`
- Impact: A valid token from the same issuer but intended for a different audience/client can be accepted, weakening tenant/app isolation.
- Fix:
  - Enforce expected audience and/or authorized party claims during verification.
  - Restrict accepted algorithms explicitly (for example `algorithms: ['RS256']`).
  - Example direction: include `audience: process.env.CLERK_AUDIENCE` and validate `azp` if Clerk setup requires it.
- Mitigation (if immediate fix is delayed):
  - Gate sensitive routes with additional server-side ownership checks (already partially present) and strict per-user anomaly monitoring.
- False positive notes:
  - Risk is reduced if this Clerk issuer is guaranteed to serve only this single backend, but this is fragile over time and should still be pinned.

### [SBP-002] Public unauthenticated endpoint can trigger paid OpenAI vision calls
- Severity: High
- Rule ID: `EXPRESS-ABUSE-COST-001`
- Location:
  - `RadianceIQ/backend/app.js:501`
  - `RadianceIQ/backend/app.js:515`
  - `RadianceIQ/backend/app.js:619`
- Evidence:
  - `/api/products/identify-photo` is defined before `app.use(authMiddleware)`.
  - Endpoint executes `openai.chat.completions.create(...)`.
- Impact: Attackers can automate requests to burn API budget and degrade availability (cost-exhaustion abuse).
- Fix:
  - Require auth for this route, or require a signed short-lived token/CAPTCHA for unauthenticated access.
  - Add robust distributed rate limiting (Redis-backed) and daily per-user/IP quotas.
  - Add upstream budget circuit-breakers and alerting.
- Mitigation:
  - Temporarily lower allowed request rates and fail closed when budget thresholds are hit.

### [SBP-003] Database TLS certificate verification is disabled
- Severity: High
- Rule ID: `EXPRESS-TRANSPORT-DBTLS-001`
- Location:
  - `RadianceIQ/backend/app.js:37`
  - `RadianceIQ/backend/server.js:16`
  - `RadianceIQ/backend/db-init.js:5`
- Evidence:
  - `ssl: { rejectUnauthorized: false }`
- Impact: Disabling certificate verification permits man-in-the-middle interception/modification of database traffic.
- Fix:
  - Set `rejectUnauthorized: true` in production.
  - Provide trusted CA/cert config from deployment platform.
  - Allow insecure DB TLS only in local development with explicit env gating.
- Mitigation:
  - Restrict DB network path tightly (private network only) until certificate validation is enforced.

### [SBP-004] Production client can be configured to use non-HTTPS backend URLs
- Severity: High
- Rule ID: `REACT-TRANSPORT-HTTPS-001`
- Location:
  - `RadianceIQ/src/config/env.ts:10`
  - `RadianceIQ/src/config/env.ts:31`
  - `RadianceIQ/src/services/api.ts:24`
- Evidence:
  - `API_BASE_URL` defaults to `http://localhost:3001`.
  - Production guard checks only for `localhost`, not non-HTTPS schemes.
  - `Authorization: Bearer ...` is attached in API calls.
- Impact: If `EXPO_PUBLIC_API_BASE_URL` is accidentally set to `http://...` outside localhost, auth tokens can traverse in cleartext.
- Fix:
  - Enforce `https://` for non-dev builds (except optional local simulator exceptions).
  - Fail startup hard if a production build has non-HTTPS API base URL.
  - Consider certificate pinning for mobile if threat model requires it.
- Mitigation:
  - Add CI/CD config validation that rejects non-HTTPS API base URLs for release builds.

---

## Medium Severity

### [SBP-005] CORS is fail-open when `CORS_ORIGINS` is unset
- Severity: Medium
- Rule ID: `EXPRESS-CORS-001`
- Location:
  - `RadianceIQ/backend/app.js:25`
  - `RadianceIQ/backend/app.js:28`
- Evidence:
  - Comment and behavior indicate `undefined = allow all`.
  - `app.use(cors(ALLOWED_ORIGINS ? { origin: ALLOWED_ORIGINS } : undefined));`
- Impact: Production misconfiguration can unintentionally allow browser-origin requests from any site.
- Fix:
  - Fail closed in production if `CORS_ORIGINS` is missing.
  - Parse/trim/validate allowed origins explicitly.
  - Set explicit methods/headers and preflight behavior.
- Mitigation:
  - Enforce env presence checks in deployment pipeline.

### [SBP-006] Sensitive health/profile data is persisted in AsyncStorage (unencrypted) while privacy text labels it “secure”
- Severity: Medium
- Rule ID: `REACT-DATA-AT-REST-001`
- Location:
  - `RadianceIQ/src/store/useStore.ts:899`
  - `RadianceIQ/src/store/useStore.ts:900`
  - `RadianceIQ/src/store/useStore.ts:901`
  - `RadianceIQ/src/store/useStore.ts:902`
  - `RadianceIQ/src/store/useStore.ts:906`
  - `RadianceIQ/app/privacy-policy.tsx:333`
- Evidence:
  - Full `glowlytics_data` payload (including user profile, daily records, model outputs) is written to AsyncStorage.
  - Privacy copy states this is “secure local storage (AsyncStorage)”.
- Impact: Health-related data can be exposed on compromised/jailbroken devices or unencrypted backups; policy wording may overstate protection.
- Fix:
  - Store sensitive fields in encrypted storage (or encrypted database layer).
  - Minimize and redact locally persisted medical/behavioral fields.
  - Update privacy-policy wording to accurately reflect technical controls.
- Mitigation:
  - Add data retention limits and local wipe controls tied to sign-out/account deletion.

### [SBP-007] Missing baseline HTTP hardening middleware in app code
- Severity: Medium
- Rule ID: `EXPRESS-HEADERS-001`
- Location:
  - `RadianceIQ/backend/app.js:24`
  - `RadianceIQ/backend/app.js:29`
- Evidence:
  - Middleware stack includes CORS and JSON parser but no visible `helmet()` and no `app.disable('x-powered-by')`.
- Impact: Reduced defense-in-depth (fingerprinting, clickjacking/header protections rely on external infra).
- Fix:
  - Add `helmet()` early in middleware stack.
  - Disable `x-powered-by`.
  - Set explicit security headers compatible with API responses.
- False positive notes:
  - Edge proxy/CDN may inject headers, but that protection is not visible in app code and should be verified.

---

## Low Severity

### [SBP-008] In-memory rate limiting is easy to bypass in distributed deployments
- Severity: Low
- Rule ID: `EXPRESS-RATELIMIT-ROBUSTNESS-001`
- Location:
  - `RadianceIQ/backend/app.js:214`
  - `RadianceIQ/backend/app.js:237`
  - `RadianceIQ/backend/app.js:253`
  - `RadianceIQ/backend/app.js:486`
- Evidence:
  - Rate limiters use process-local `Map` state keyed by IP/user.
- Impact: Limits reset on restart and do not coordinate across multiple instances; abuse resistance degrades at scale.
- Fix:
  - Move to a centralized store (Redis) with standard middleware (`rate-limit` + store adapter).
  - Add route-specific cost-based quotas (especially AI-heavy endpoints).

---

## Recommended Remediation Order

1. Fix `SBP-002` and `SBP-001` first (abuse and auth boundary risk).
2. Fix `SBP-003` and `SBP-004` next (transport and token confidentiality).
3. Fix `SBP-005` through `SBP-008` for stronger baseline hardening and compliance correctness.

