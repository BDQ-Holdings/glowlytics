# Glowlytics MCP Server (User-Scoped) — Design

**Status:** Draft
**Date:** 2026-04-17
**Scope:** Personal-data MCP server for Glowlytics end users (Audience B). The partner / vision-as-a-service MCP (Audience C) is out of scope and will be specced separately.

## 1. Purpose

Give Glowlytics users a way to connect their account to any MCP-capable LLM client (Claude Desktop, claude.ai connectors, ChatGPT connectors, custom agents) and ask natural-language questions about their own skin-health data.

Representative prompts the server must serve well:

- "What's my latest skin score?"
- "How has my inflammation trended over the last 30 days?"
- "Compare my scan from March to my most recent one."
- "What's in my current PM routine, and are any of those ingredients in conflict?"
- "What did my last report recommend, and what's the evidence behind it?"
- "What does niacinamide do, and is it safe to stack with retinol?"

All access is read-only and user-scoped. No writes, no photos, no partner data.

## 2. Non-goals

- Writing or mutating user data (logging products, adding notes, triggering scans).
- Returning scan photos or any raw image bytes.
- Image-in / scores-out analysis for third parties (that is Audience C, separate spec).
- Admin / support access to other users' data.

## 3. Architecture

### 3.1 Placement

The MCP server lives inside the existing Express backend on Railway, not as a separate service.

```
backend/
  mcp/
    server.ts                   # MCP streamable-HTTP transport, mounted on /mcp
    oauth/
      authorization-server.ts   # /.well-known/oauth-authorization-server, /authorize, /token, DCR
      clerk-bridge.ts           # verifies Clerk session, issues MCP access tokens
    tools/
      scans.ts                  # get_latest_scan, get_scan_history, get_signal_trend, compare_scans
      reports.ts                # get_scan_report
      routine.ts                # get_current_routine
      ingredients.ts            # lookup_ingredient, search_ingredients
    middleware/
      auth.ts                   # Bearer token → { userId }
      rate-limit.ts             # per-user limits
    schemas.ts                  # Zod schemas for tool inputs + outputs
```

Rationale: one Railway service, one deploy pipeline, one Postgres pool, shared auth glue. If MCP load ever dominates, the tool handlers are already modular and can be lifted into a separate service without touching the data layer.

### 3.2 Transport

MCP Streamable HTTP (the current standard; SSE is deprecated). Public endpoint:

```
https://api.glowlytics.ai/mcp
```

### 3.3 OAuth 2.1 flow with Clerk as identity layer

1. MCP client fetches `https://api.glowlytics.ai/.well-known/oauth-protected-resource` and discovers the authorization server.
2. MCP client performs dynamic client registration (RFC 7591) against our AS.
3. User is redirected to `/authorize`. Our AS checks for an active Clerk session; if absent, routes through Clerk's hosted sign-in UI (same flow the mobile app uses).
4. After authentication, our AS shows a consent screen (`"Allow <client_name> to read your Glowlytics data?"`), then issues a short-lived access token (15 min) and refresh token, signed by our server, with claims `{ sub: userId, client_id, scope }`.
5. MCP client sends `Authorization: Bearer <token>` on every `/mcp` call. `middleware/auth.ts` verifies the signature and attaches `userId` to the request context.

Rationale:

- Our server issues MCP tokens, not Clerk session JWTs. MCP clients don't understand Clerk's session semantics; we need stable claims, per-client revocation, and explicit scopes.
- Clerk's role is narrowed to "did this person authenticate." Clerk's existing production config (`clerk.glowlytics.ai`) is reused; no new IdP.

**Implementation-phase verification:** Clerk's current offering includes a native "OAuth provider" feature. The first implementation task verifies whether the Glowlytics Clerk plan exposes it. If yes, we use Clerk's OAuth endpoints directly and `authorization-server.ts` becomes a thin wrapper around Clerk's token endpoint instead of a full AS. The tool surface, middleware, and client experience are unchanged either way.

## 4. Tool surface

Eight tools, all read-only. Inputs validated with Zod; JSON Schema published in the MCP tool manifest.

### 4.1 Scans

| Tool | Input | Output |
|------|-------|--------|
| `get_latest_scan` | none | `{ scanId, date, overallScore, signals: { structure, hydration, inflammation, sunDamage, elasticity }, streakDays }` |
| `get_scan_history` | `{ days?: number (default 30, max 90), limit?: number }` | `[{ scanId, date, overallScore, signals }]` |
| `get_signal_trend` | `{ signal: SignalName, period: '7d' \| '30d' \| '90d' }` | `{ series: [{ date, value }], delta, direction }` |
| `compare_scans` | `{ a: scanId \| ISO date, b: scanId \| ISO date }` | `{ overallDelta, signalDeltas: { ... }, a: ScanSummary, b: ScanSummary }` |

### 4.2 Reports

| Tool | Input | Output |
|------|-------|--------|
| `get_scan_report` | `{ scanId?: string }` (defaults to latest) | `{ scanId, narrative, recommendations: [...], citations: [{ source, snippet }] }` |

Reuses the existing RAG report generator. No re-ranking or re-generation unless missing.

### 4.3 Routine

| Tool | Input | Output |
|------|-------|--------|
| `get_current_routine` | none | `{ am: [Product], pm: [Product], conflicts: [IngredientConflict] }` |

Reuses the existing product-logging schema and ingredient conflict detector.

### 4.4 Ingredients (not user-scoped)

| Tool | Input | Output |
|------|-------|--------|
| `lookup_ingredient` | `{ name: string }` | `{ name, aliases, function, concerns, evidence: [{ source, snippet }] }` |
| `search_ingredients` | `{ query: string, limit?: number (default 10, max 25) }` | `[{ name, function, summary }]` |

Backed by `apps/glowlytics/src/constants/ingredients.ts` as the canonical list, with RAG lookups from the existing Pinecone index (80 chunks) for evidence snippets.

### 4.5 Output formatting

All tool results are returned as MCP structured content: a single `text` block containing a pretty-printed JSON body. Keys are stable and snake_case-compatible aliases are not added — LLM clients handle camelCase fine. Dates are ISO-8601 strings.

## 5. Data access

Tool handlers import existing query functions from `backend/` rather than writing new SQL:

- `get_latest_scan` / `get_scan_history` → existing scan query module
- `get_signal_trend` → new pure function `computeSignalTrend(userId, signal, period)` extracted from the mobile app's existing client-side trend logic so both surfaces share one source of truth
- `compare_scans` → new pure function over the existing scan query module
- `get_scan_report` → existing report generator
- `get_current_routine` → existing routine + conflict modules
- `lookup_ingredient` / `search_ingredients` → existing ingredients constants + existing Pinecone client

Where current logic is inline in an Express route rather than a pure function, it is extracted as part of this work. Extractions are narrowly scoped and covered by the same tests as the calling route.

### 5.1 User scoping

`req.userId` is populated by `middleware/auth.ts` from the Bearer token. Every user-scoped query function takes `userId` as its first positional argument. The query function signatures make `userId` required in TypeScript, so a tool handler cannot compile without passing it. There is no "admin" or "unscoped" code path.

## 6. Errors

Standard JSON-RPC / MCP error codes:

| Code | Meaning | When |
|------|---------|------|
| `-32001` | Unauthorized | Missing, invalid, or expired token |
| `-32002` | Rate limited | Per-user throttle exceeded |
| `-32602` | Invalid params | Zod validation failure |
| `-32603` | Internal error | Any unexpected server failure |

Error messages returned to clients are generic. Full details (stack, SQL error, upstream body) are written to server logs with `userId` and `tool` labels for debugging. No DB internals, no stack traces, no PII beyond `userId` are returned to the client.

## 7. Rate limiting

- 60 tool calls / minute per user
- 10 tool calls / second burst per user

Uses the same Redis-backed limiter the existing API uses. Limits are applied after auth, before tool dispatch, so an unauthenticated flood is stopped earlier by the existing API-wide limiter.

## 8. Observability

- Every tool call logs `{ userId, tool, durationMs, status }` at info level.
- Errors log at warn (client error) or error (server error).
- Existing metrics pipeline (same as REST API) picks these up; no new infra.

## 9. Testing

- **Unit tests** per tool, mocking the data layer. Verify user scoping (a call with `userId=A` never returns `userId=B` data), input validation, and output shape.
- **OAuth integration tests** covering discovery, dynamic client registration, authorize, token exchange, refresh, and revocation.
- **Protocol end-to-end test** per tool using the MCP SDK's test client against a running server bound to an ephemeral port.
- **Coverage target:** maintain existing backend coverage. Baseline is 151 tests across 7 suites; expect roughly +40 tests for this work.

## 10. Security & privacy

- No photos, no raw images, no biometric-class data are ever returned through MCP tools.
- User can revoke any MCP client from a Settings screen in the mobile app (lists active OAuth clients, allows per-client revoke). The Settings screen is part of this work.
- Tokens are signed with a key rotated independently of Clerk's keys. Refresh tokens are one-time-use and bound to `client_id`.
- Dynamic client registration accepts any client metadata but issues only `public` clients (no client secrets). All confidential-client behavior requires PKCE.
- Ingredient lookup is not user-scoped but is still rate-limited per user.

## 11. Rollout plan

1. Internal dogfooding: ship behind an `MCP_ENABLED` backend flag, enable for the developer Clerk user only.
2. Closed beta: enable for a hand-picked list of users (e.g., first 50 paid subscribers). Settings screen gains an "Experimental: connect Claude / ChatGPT" entry.
3. General availability: remove the flag, document the endpoint on the marketing site (`apps/landing`), consider submission to claude.ai's connector directory.

App Store submission is not affected — this is a backend-only feature with a Settings entry that only surfaces an external URL.

## 12. Open questions (to resolve in the implementation plan)

1. Does the Glowlytics Clerk plan expose the native OAuth provider feature? (Determines whether we build a full AS or a thin wrapper.)
2. Is there value in a `summarize_month` convenience tool that bundles `get_scan_history` + `get_current_routine` + top insights, or should we let the LLM compose from primitives? (Default: let the LLM compose; revisit after beta.)
3. Should ingredient results cite the exact Pinecone chunk IDs so clients can link back to sources on the website, or is snippet-only sufficient? (Default: snippet-only; add IDs if users ask.)
