# Glowlytics MCP Server (User-Scoped) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only, user-scoped MCP server inside the existing Glowlytics Express backend so MCP-capable LLM clients (Claude Desktop, claude.ai, ChatGPT connectors, custom agents) can query a user's own skin-health data after they OAuth in.

**Architecture:** Mounts at `https://api.glowlytics.ai/mcp` using the MCP TypeScript SDK's Streamable HTTP transport. Auth is a **thin wrapper over Clerk's native OAuth IdP** — we do not run our own authorization server. We expose `/.well-known/oauth-protected-resource` (RFC 9728) pointing at Clerk's already-live `/.well-known/openid-configuration`; clients perform PKCE + (Clerk-supported) Dynamic Client Registration directly against Clerk; our backend only verifies the resulting Bearer JWT against Clerk's JWKS. Tool handlers call extracted query helpers that take `userId` as a required first argument so cross-user leakage is a compile/lint error, not a runtime check.

**Tech Stack:**
- `@modelcontextprotocol/sdk` (server + Streamable HTTP transport)
- `jose` (JWKS verification of Clerk JWTs)
- `zod` (tool input/output schemas; works fine in JS)
- Existing: Express 4, `pg`, Pinecone client, Jest 29 + Supertest 7

**Verified prerequisites (resolved 2026-04-17):**
- Clerk's prod instance `https://clerk.glowlytics.ai/.well-known/openid-configuration` returns full OIDC discovery: `/oauth/{authorize,token,token/revoke,token_info,userinfo}`, JWKS at `/.well-known/jwks.json`, PKCE `S256`, public clients (`token_endpoint_auth_methods_supported` includes `"none"`), refresh tokens (`offline_access` scope), grant types `authorization_code` + `refresh_token`. Clerk docs confirm Dynamic Client Registration (RFC 7591) is supported via a public API endpoint configurable in the Dashboard.
- **No custom authorization server required.** Implementation is "advertise + verify" only.

**Open questions resolved (no longer deferred):**
- Q2 → **`summarize_month` tool is included** (Task 25). Server-side composition lets us cap token usage and reuse one cached SQL pass.
- Q3 → **Pinecone chunk IDs are returned in ingredient citations** (Tasks 23–24). Citation shape is `{ source, snippet, chunkId, url? }` so future landing-page deep-links (`glowlytics.ai/research/<chunkId>`) work without re-shaping responses.

---

## File Structure

**New files (all under `apps/glowlytics/backend/`):**

| Path | Responsibility |
|------|----------------|
| `mcp/server.js` | Builds the MCP `Server` instance and registers tool handlers |
| `mcp/transport.js` | Mounts Streamable HTTP transport on `/mcp` |
| `mcp/auth.js` | Bearer middleware: verify Clerk JWT via JWKS, attach `req.userId` |
| `mcp/well-known.js` | `/.well-known/oauth-protected-resource` route (RFC 9728) |
| `mcp/rate-limit.js` | Per-user 60/min + 10/sec burst limiter (reuses existing limiter store) |
| `mcp/errors.js` | Maps internal errors → MCP / JSON-RPC codes; redacts payloads |
| `mcp/logger.js` | `{ userId, tool, durationMs, status }` structured logging |
| `mcp/tools/scans.js` | `get_latest_scan`, `get_scan_history`, `get_signal_trend`, `compare_scans` |
| `mcp/tools/reports.js` | `get_scan_report` |
| `mcp/tools/routine.js` | `get_current_routine` |
| `mcp/tools/ingredients.js` | `lookup_ingredient`, `search_ingredients` (with chunk IDs) |
| `mcp/tools/summary.js` | `summarize_month` |
| `mcp/schemas.js` | Zod schemas for tool inputs/outputs |
| `queries/scans.js` | Pure query helpers extracted from `app.js` — `getLatestScan(userId)`, `getScanHistory(userId, days, limit)`, `getScanById(userId, scanId)`, `computeSignalTrend(userId, signal, period)`, `compareScans(userId, a, b)` |
| `queries/reports.js` | `getReportForScan(userId, scanId)` (generates if missing via existing RAG path) |
| `queries/routine.js` | `getCurrentRoutine(userId)` + ingredient conflict detector |
| `queries/ingredients.js` | `lookupIngredient(name)`, `searchIngredients(query, limit)` — both attach Pinecone `chunkId` to evidence |
| `__tests__/mcp/auth.test.js` | Bearer/JWKS verification tests |
| `__tests__/mcp/well-known.test.js` | Discovery doc shape |
| `__tests__/mcp/scoping.test.js` | Cross-user scoping (User A token never returns User B data — covers all 9 tools) |
| `__tests__/mcp/tools/*.test.js` | One file per tool, mocking the data layer |
| `__tests__/mcp/protocol-e2e.test.js` | MCP SDK test client against an ephemeral-port server |
| `__tests__/queries/*.test.js` | One file per extracted query helper |

**Modified files:**

| Path | Change |
|------|--------|
| `apps/glowlytics/backend/package.json` | Add `@modelcontextprotocol/sdk`, `jose`, `zod` |
| `apps/glowlytics/backend/app.js` | Import `mcp/transport`; register only when `process.env.MCP_ENABLED === 'true'`. Replace inline scan/report/routine SQL inside the existing routes with calls to the new `queries/*` helpers (no behavior change). |
| `apps/glowlytics/backend/.env.example` | Add `MCP_ENABLED`, `MCP_BETA_USER_IDS`, `MCP_BASE_URL` |
| `apps/glowlytics/src/screens/Settings*` (or nearest existing settings file) | Add "Connected apps (Beta)" section that lists user's Clerk OAuth grants and supports per-client revoke |
| `apps/glowlytics/src/services/clerk.ts` (or nearest) | Add `listMcpClients()` / `revokeMcpClient(clientId)` calling new backend endpoints |

---

## Conventions for every task

- **TDD strictly.** Every task: write failing test → run red → implement → run green → commit.
- **Commit cadence:** one commit per task. Commit message format: `feat(mcp): <task name>` or `refactor(queries): <task name>`.
- **Run targeted tests during development:** `cd apps/glowlytics/backend && npx jest <pattern> --runInBand`. Run the full suite (`npm test`) before the final commit of each milestone.
- **Coverage:** the existing baseline is 151 tests across 7 suites. This plan adds ~55 tests across ~12 new suites.
- **No untested code path.** If a branch exists, write the test first.

---

# Milestone 0 — Foundations

## Task 1: Add MCP dependencies

**Files:**
- Modify: `apps/glowlytics/backend/package.json`

- [ ] **Step 1: Install packages**

```bash
cd apps/glowlytics/backend
npm install @modelcontextprotocol/sdk@latest jose@^5 zod@^3
```

- [ ] **Step 2: Verify imports work**

```bash
node -e "require('@modelcontextprotocol/sdk/server/index.js'); require('jose'); require('zod'); console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(mcp): add MCP SDK, jose, zod deps"
```

## Task 2: Add env scaffolding and feature flag

**Files:**
- Modify: `apps/glowlytics/backend/.env.example`
- Create: `apps/glowlytics/backend/mcp/config.js`

- [ ] **Step 1: Write failing test**

Create `__tests__/mcp/config.test.js`:

```js
const { mcpConfig } = require('../../mcp/config');

describe('mcpConfig', () => {
  beforeEach(() => { jest.resetModules(); });

  it('disables MCP by default', () => {
    delete process.env.MCP_ENABLED;
    const { mcpConfig } = require('../../mcp/config');
    expect(mcpConfig().enabled).toBe(false);
  });

  it('enables MCP when MCP_ENABLED=true', () => {
    process.env.MCP_ENABLED = 'true';
    process.env.MCP_BASE_URL = 'https://api.glowlytics.ai';
    process.env.CLERK_ISSUER_URL = 'https://clerk.glowlytics.ai';
    const { mcpConfig } = require('../../mcp/config');
    expect(mcpConfig().enabled).toBe(true);
    expect(mcpConfig().baseUrl).toBe('https://api.glowlytics.ai');
    expect(mcpConfig().clerkIssuer).toBe('https://clerk.glowlytics.ai');
  });

  it('parses MCP_BETA_USER_IDS as a Set', () => {
    process.env.MCP_ENABLED = 'true';
    process.env.MCP_BASE_URL = 'https://api.glowlytics.ai';
    process.env.CLERK_ISSUER_URL = 'https://clerk.glowlytics.ai';
    process.env.MCP_BETA_USER_IDS = 'user_abc, user_def';
    const { mcpConfig } = require('../../mcp/config');
    const ids = mcpConfig().betaUserIds;
    expect(ids.has('user_abc')).toBe(true);
    expect(ids.has('user_def')).toBe(true);
  });
});
```

- [ ] **Step 2: Run red**

```bash
cd apps/glowlytics/backend && npx jest mcp/config.test.js
```

Expected: FAIL (`Cannot find module '../../mcp/config'`).

- [ ] **Step 3: Implement `mcp/config.js`**

```js
function mcpConfig() {
  const enabled = process.env.MCP_ENABLED === 'true';
  const beta = (process.env.MCP_BETA_USER_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  return {
    enabled,
    baseUrl: process.env.MCP_BASE_URL,
    clerkIssuer: process.env.CLERK_ISSUER_URL,
    betaUserIds: new Set(beta),
  };
}
module.exports = { mcpConfig };
```

- [ ] **Step 4: Append to `.env.example`**

```bash
# MCP server (Audience B — user-scoped, read-only)
MCP_ENABLED=false
MCP_BASE_URL=https://api.glowlytics.ai
MCP_BETA_USER_IDS=
```

- [ ] **Step 5: Run green**

```bash
npx jest mcp/config.test.js
```

Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add mcp/config.js __tests__/mcp/config.test.js .env.example
git commit -m "feat(mcp): config module + MCP_ENABLED feature flag"
```

---

# Milestone 1 — OAuth wiring (thin wrapper over Clerk)

## Task 3: `/.well-known/oauth-protected-resource` route

**Files:**
- Create: `apps/glowlytics/backend/mcp/well-known.js`
- Create: `apps/glowlytics/backend/__tests__/mcp/well-known.test.js`
- Modify: `apps/glowlytics/backend/app.js` (mount route when MCP enabled)

- [ ] **Step 1: Write failing test**

```js
process.env.MCP_ENABLED = 'true';
process.env.MCP_BASE_URL = 'https://api.glowlytics.ai';
process.env.CLERK_ISSUER_URL = 'https://clerk.glowlytics.ai';
const request = require('supertest');
const app = require('../../app');

describe('GET /.well-known/oauth-protected-resource', () => {
  it('advertises Clerk as the authorization server', async () => {
    const res = await request(app).get('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(res.body.resource).toBe('https://api.glowlytics.ai/mcp');
    expect(res.body.authorization_servers).toEqual(['https://clerk.glowlytics.ai']);
    expect(res.body.bearer_methods_supported).toContain('header');
    expect(res.body.scopes_supported).toContain('openid');
    expect(res.body.scopes_supported).toContain('profile');
  });

  it('is reachable without authentication', async () => {
    const res = await request(app)
      .get('/.well-known/oauth-protected-resource')
      .set('Authorization', '');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run red.** Expected: 404 or module-missing.

- [ ] **Step 3: Implement `mcp/well-known.js`**

```js
const { mcpConfig } = require('./config');

function mountWellKnown(app) {
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    const cfg = mcpConfig();
    res.json({
      resource: `${cfg.baseUrl}/mcp`,
      authorization_servers: [cfg.clerkIssuer],
      bearer_methods_supported: ['header'],
      scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    });
  });
}
module.exports = { mountWellKnown };
```

- [ ] **Step 4: Wire into `app.js`** (near the bottom, before `module.exports = app`):

```js
const { mcpConfig } = require('./mcp/config');
if (mcpConfig().enabled) {
  require('./mcp/well-known').mountWellKnown(app);
}
```

- [ ] **Step 5: Run green.** Expected: 2 PASS.

- [ ] **Step 6: Commit**

```bash
git add mcp/well-known.js __tests__/mcp/well-known.test.js app.js
git commit -m "feat(mcp): publish /.well-known/oauth-protected-resource"
```

## Task 4: JWKS-backed Bearer auth middleware

**Files:**
- Create: `apps/glowlytics/backend/mcp/auth.js`
- Create: `apps/glowlytics/backend/__tests__/mcp/auth.test.js`

- [ ] **Step 1: Write failing test** — sign a JWT with a local key, expose its JWK as the "Clerk" JWKS, verify middleware accepts it and attaches `req.userId`. Reject missing token, bad signature, wrong issuer, expired token.

```js
const { generateKeyPair, exportJWK, SignJWT } = require('jose');
const express = require('express');
const request = require('supertest');

let kp, jwk, server, jwksUrl;

beforeAll(async () => {
  kp = await generateKeyPair('RS256');
  jwk = await exportJWK(kp.publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  const jwksApp = express();
  jwksApp.get('/.well-known/jwks.json', (_q, r) => r.json({ keys: [jwk] }));
  server = jwksApp.listen(0);
  jwksUrl = `http://localhost:${server.address().port}/.well-known/jwks.json`;
});
afterAll(() => server.close());

function buildApp() {
  const { requireMcpAuth } = require('../../mcp/auth');
  const app = express();
  app.get('/protected', requireMcpAuth, (req, res) => res.json({ userId: req.userId }));
  return app;
}

async function sign({ sub = 'user_abc', iss = 'https://clerk.glowlytics.ai', exp = Math.floor(Date.now()/1000) + 60 } = {}) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(iss).setSubject(sub).setExpirationTime(exp).setIssuedAt()
    .sign(kp.privateKey);
}

beforeEach(() => {
  jest.resetModules();
  process.env.MCP_ENABLED = 'true';
  process.env.MCP_BASE_URL = 'https://api.glowlytics.ai';
  process.env.CLERK_ISSUER_URL = 'https://clerk.glowlytics.ai';
  process.env.CLERK_JWKS_URL = jwksUrl;
});

test('rejects missing Authorization header', async () => {
  const res = await request(buildApp()).get('/protected');
  expect(res.status).toBe(401);
});

test('rejects malformed token', async () => {
  const res = await request(buildApp()).get('/protected').set('Authorization', 'Bearer not.a.jwt');
  expect(res.status).toBe(401);
});

test('rejects token with wrong issuer', async () => {
  const tok = await sign({ iss: 'https://evil.example' });
  const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(401);
});

test('rejects expired token', async () => {
  const tok = await sign({ exp: Math.floor(Date.now()/1000) - 10 });
  const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(401);
});

test('accepts valid token and attaches userId', async () => {
  const tok = await sign({ sub: 'user_abc' });
  const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
  expect(res.body.userId).toBe('user_abc');
});
```

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement `mcp/auth.js`**

```js
const { createRemoteJWKSet, jwtVerify } = require('jose');
const { mcpConfig } = require('./config');

let jwks;
function getJwks() {
  if (jwks) return jwks;
  const url = process.env.CLERK_JWKS_URL || `${mcpConfig().clerkIssuer}/.well-known/jwks.json`;
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
    next();
  } catch (_err) {
    res.status(401).json({ error: 'invalid_token' });
  }
}

module.exports = { requireMcpAuth, _resetJwksForTest: () => { jwks = null; } };
```

- [ ] **Step 4: Run green.** Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/auth.js __tests__/mcp/auth.test.js
git commit -m "feat(mcp): JWKS-backed Bearer auth middleware"
```

## Task 5: Beta gate

**Files:**
- Modify: `apps/glowlytics/backend/mcp/auth.js`
- Modify: `apps/glowlytics/backend/__tests__/mcp/auth.test.js`

- [ ] **Step 1: Add failing test**

```js
test('rejects user not in MCP_BETA_USER_IDS when set', async () => {
  process.env.MCP_BETA_USER_IDS = 'user_allowed';
  const tok = await sign({ sub: 'user_blocked' });
  const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(403);
});

test('accepts user in MCP_BETA_USER_IDS', async () => {
  process.env.MCP_BETA_USER_IDS = 'user_allowed';
  const tok = await sign({ sub: 'user_allowed' });
  const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
});

test('allows any user when MCP_BETA_USER_IDS is empty (GA)', async () => {
  delete process.env.MCP_BETA_USER_IDS;
  const tok = await sign({ sub: 'user_anyone' });
  const res = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${tok}`);
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Add gate to middleware** — after `req.userId = payload.sub;`:

```js
const beta = mcpConfig().betaUserIds;
if (beta.size > 0 && !beta.has(req.userId)) {
  return res.status(403).json({ error: 'beta_only' });
}
```

- [ ] **Step 4: Run green and commit.**

```bash
git add mcp/auth.js __tests__/mcp/auth.test.js
git commit -m "feat(mcp): beta allowlist gate"
```

---

# Milestone 2 — Query extraction (DRY: tools and existing routes share one module)

The existing `app.js` mixes SQL into the route handlers. We extract the four data domains into pure helpers that take `userId` as a required first argument. Each route is then refactored to call the helper. Behavior is unchanged; tests exist on both sides.

## Task 6: Extract `queries/scans.js` — `getLatestScan`, `getScanHistory`, `getScanById`

**Files:**
- Create: `apps/glowlytics/backend/queries/scans.js`
- Create: `apps/glowlytics/backend/__tests__/queries/scans.test.js`
- Modify: `apps/glowlytics/backend/app.js` (replace the SQL inside `GET /api/model-outputs/:userId` with `getScanHistory`)

- [ ] **Step 1: Write failing tests** with a mocked pool that records SQL + params. Verify `userId` is always in the parameter list, that `getLatestScan` returns the most recent row, that `getScanHistory(userId, days, limit)` clamps `days` to ≤90 and `limit` to ≤90, and that `getScanById(userId, scanId)` returns null when the scan belongs to another user.

```js
const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));

beforeEach(() => mockQuery.mockReset());

const { getLatestScan, getScanHistory, getScanById } = require('../../queries/scans');

test('getLatestScan scopes to userId and limits to 1', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [{ daily_id: 'd1', date: '2026-04-17', signal_scores: {} }] });
  await getLatestScan('user_a');
  const [, params] = mockQuery.mock.calls[0];
  expect(params).toContain('user_a');
  expect(mockQuery.mock.calls[0][0]).toMatch(/LIMIT 1/i);
});

test('getScanHistory clamps days and limit', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  await getScanHistory('user_a', { days: 999, limit: 999 });
  const [, params] = mockQuery.mock.calls[0];
  expect(params).toContain(90);
});

test('getScanById returns null for other-user scan', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [] });
  const r = await getScanById('user_a', 'scan_owned_by_b');
  expect(r).toBeNull();
});
```

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement `queries/scans.js`** — single `pool` import, three functions, all parameterised. Shape matches `model_outputs JOIN daily_records` (see `apps/glowlytics/backend/app.js:1361-1377` for the source query). Each function returns plain objects shaped `{ scanId, date, overallScore, signals, ... }`.

- [ ] **Step 4: Refactor `GET /api/model-outputs/:userId`** to call `getScanHistory`. Run the existing `__tests__/integration.test.js` to confirm no regression.

- [ ] **Step 5: Run all targeted tests green and commit.**

```bash
git add queries/scans.js __tests__/queries/scans.test.js app.js
git commit -m "refactor(queries): extract scan queries; reuse in /api/model-outputs"
```

## Task 7: Extract `queries/scans.js` — `computeSignalTrend`, `compareScans`

**Files:**
- Modify: `apps/glowlytics/backend/queries/scans.js`
- Modify: `apps/glowlytics/backend/__tests__/queries/scans.test.js`

- [ ] **Step 1: Write failing tests**

```js
test('computeSignalTrend returns series, delta, direction for 30d', async () => {
  mockQuery.mockResolvedValueOnce({ rows: [
    { date: '2026-03-18', signal_scores: { hydration: 60 } },
    { date: '2026-04-17', signal_scores: { hydration: 75 } },
  ]});
  const t = await computeSignalTrend('user_a', 'hydration', '30d');
  expect(t.series.length).toBe(2);
  expect(t.delta).toBe(15);
  expect(t.direction).toBe('up');
});

test('computeSignalTrend rejects unknown signal', async () => {
  await expect(computeSignalTrend('user_a', 'wrinkles', '30d')).rejects.toThrow();
});

test('compareScans returns signalDeltas keyed by signal name', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ daily_id: 'a', date: '2026-03-01', signal_scores: { hydration: 50, inflammation: 40 } }] })
    .mockResolvedValueOnce({ rows: [{ daily_id: 'b', date: '2026-04-17', signal_scores: { hydration: 70, inflammation: 30 } }] });
  const c = await compareScans('user_a', { a: 'a', b: 'b' });
  expect(c.signalDeltas.hydration).toBe(20);
  expect(c.signalDeltas.inflammation).toBe(-10);
});
```

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement** both functions. `computeSignalTrend` uses the date-range WHERE clause from Task 6; `direction` is `'up' | 'down' | 'flat'` based on `Math.sign(delta)` with a flat band of ±1 point. Valid signal names imported from `apps/glowlytics/src/constants/signals.ts` — duplicate the list as a JS constant in `queries/scans.js` (small enum, low duplication cost).

- [ ] **Step 4: Run green and commit.**

## Task 8: Extract `queries/reports.js`

**Files:**
- Create: `apps/glowlytics/backend/queries/reports.js`
- Create: `apps/glowlytics/backend/__tests__/queries/reports.test.js`
- Modify: `apps/glowlytics/backend/app.js` (`GET /api/reports/:userId` calls helper)

- [ ] **Step 1: Failing test:** `getReportForScan(userId, scanId)` returns the existing report row for `(userId, scanId)`; if no row exists, calls the existing RAG insight generator (mock it) and persists. Verifies user scoping.

- [ ] **Step 2: Implement** by copying the SQL from `app.js:1380-1410` into a helper. The "generate if missing" branch reuses the existing `buildInsightPrompt` / RAG path already in `app.js` — extract that into the helper too if it's not already callable from outside the route.

- [ ] **Step 3: Run green and commit.**

## Task 9: Extract `queries/routine.js`

**Files:**
- Create: `apps/glowlytics/backend/queries/routine.js`
- Create: `apps/glowlytics/backend/__tests__/queries/routine.test.js`
- Modify: `apps/glowlytics/backend/app.js`

- [ ] **Step 1: Failing test:** `getCurrentRoutine(userId)` returns `{ am: Product[], pm: Product[], conflicts: IngredientConflict[] }`. Verifies products are split by `usage_schedule` and that the conflict detector is invoked. Mock the conflict detector's input and assert it receives every product's ingredients merged.

- [ ] **Step 2: Implement** by copying the products query from `app.js:1217-1228` and importing the existing conflict detector (find via `grep -rn "conflict" apps/glowlytics/backend apps/glowlytics/src`).

- [ ] **Step 3: Run green and commit.**

## Task 10: Extract `queries/ingredients.js` with Pinecone chunk IDs (Q3)

**Files:**
- Create: `apps/glowlytics/backend/queries/ingredients.js`
- Create: `apps/glowlytics/backend/__tests__/queries/ingredients.test.js`

- [ ] **Step 1: Failing test:**

```js
const mockPinecone = { query: jest.fn() };
jest.mock('../../rag', () => ({ pineconeClient: () => mockPinecone, INDEX: 'glowlytics-research' }));

test('lookupIngredient returns canonical entry plus citations with chunkId', async () => {
  mockPinecone.query.mockResolvedValueOnce({ matches: [
    { id: 'chunk_42', metadata: { source: 'NIH 2023', snippet: 'Niacinamide reduces sebum...', url: 'https://pubmed/...'}, score: 0.91 },
  ]});
  const r = await lookupIngredient('niacinamide');
  expect(r.name).toBe('Niacinamide');
  expect(r.evidence[0]).toEqual({
    source: 'NIH 2023', snippet: expect.any(String), chunkId: 'chunk_42', url: 'https://pubmed/...',
  });
});

test('searchIngredients clamps limit to 25', async () => {
  // …
});
```

- [ ] **Step 2: Implement.** Canonical names come from `apps/glowlytics/src/constants/ingredients.ts` — re-export it (or maintain a JS twin) in `queries/ingredients.js`. For each lookup, query Pinecone for top-K (K=3 for `lookupIngredient`, K=1 per result for `searchIngredients`). For every match, return `{ source, snippet, chunkId: match.id, url: match.metadata?.url }`. **The `chunkId` field is the load-bearing addition for Q3** — it lets future landing-page work deep-link to `glowlytics.ai/research/<chunkId>` without breaking the response shape.

- [ ] **Step 3: Run green and commit.**

---

# Milestone 3 — MCP transport, dispatch, and rate limiting

## Task 11: Per-user rate limiter

**Files:**
- Create: `apps/glowlytics/backend/mcp/rate-limit.js`
- Create: `apps/glowlytics/backend/__tests__/mcp/rate-limit.test.js`

- [ ] **Step 1: Failing test:** in-memory limiter (matches existing limiter style — `grep "rateLimit" app.js` to confirm). Window is rolling 60s for 60 calls and rolling 1s for 10 calls per `req.userId`. Returns 429 with body `{ error: 'rate_limited', retryAfter: <seconds> }`.

- [ ] **Step 2: Implement** with a `Map<userId, { burst: number[], minute: number[] }>` of timestamps; sweep on each call. Mirror the existing limiter's structure for consistency.

- [ ] **Step 3: Run green and commit.**

## Task 12: MCP server skeleton + Streamable HTTP transport

**Files:**
- Create: `apps/glowlytics/backend/mcp/server.js`
- Create: `apps/glowlytics/backend/mcp/transport.js`
- Create: `apps/glowlytics/backend/mcp/errors.js`
- Create: `apps/glowlytics/backend/__tests__/mcp/transport.test.js`

- [ ] **Step 1: Failing test:** `POST /mcp` with a valid Bearer returns a JSON-RPC `initialize` response listing zero tools (none registered yet); without a token returns 401; with a beta-blocked user returns 403; over the rate limit returns 429.

- [ ] **Step 2: Implement `mcp/server.js`** — exports `buildMcpServer({ userId })` that constructs a fresh `Server` instance scoped to one user. Tool handlers (registered in later tasks) close over `userId`.

- [ ] **Step 3: Implement `mcp/transport.js`** — exports `mountMcp(app)` which:
  1. Adds `requireMcpAuth`, then per-user `mcpRateLimit`, then a request handler that constructs a `StreamableHTTPServerTransport` per request and connects a fresh `buildMcpServer({ userId: req.userId })` to it. Mount at `/mcp`.
  2. Logs every request via `mcp/logger.js` (next task).

- [ ] **Step 4: Implement `mcp/errors.js`** — translation table from internal errors to MCP / JSON-RPC codes:
  | Internal | Code | Message to client |
  |----------|------|-------------------|
  | `ZodError` | `-32602` | `Invalid params` |
  | `RateLimitError` | `-32002` | `Rate limit exceeded` |
  | `UnauthorizedError` | `-32001` | `Unauthorized` |
  | anything else | `-32603` | `Internal error` |
  Logs the full error server-side with `userId` + `tool` labels; never returns details to the client.

- [ ] **Step 5: Wire into `app.js`** — extend the `if (mcpConfig().enabled)` block:

```js
if (mcpConfig().enabled) {
  require('./mcp/well-known').mountWellKnown(app);
  require('./mcp/transport').mountMcp(app);
}
```

- [ ] **Step 6: Run green and commit.**

## Task 13: Structured logger

**Files:**
- Create: `apps/glowlytics/backend/mcp/logger.js`
- Create: `apps/glowlytics/backend/__tests__/mcp/logger.test.js`

- [ ] **Step 1: Failing test:** `logToolCall({ userId, tool, durationMs, status })` writes JSON line at `info` for `status='ok'`, at `warn` for client errors (`-32001/-32002/-32602`), at `error` for `-32603`. Capture via spying on `console.log/warn/error`.

- [ ] **Step 2: Implement.** No new logging library — mirror the existing `console.*` pattern used in `server.js`.

- [ ] **Step 3: Wire** the logger into `mcp/transport.js` middleware (request start time, response status).

- [ ] **Step 4: Run green and commit.**

---

# Milestone 4 — Tools

Each tool task follows the same TDD pattern: define the Zod input schema in `mcp/schemas.js`, write a unit test that mocks the corresponding `queries/*` helper, register the tool with `buildMcpServer`, run red→green, commit. Output for every tool is a single MCP `text` content block whose value is `JSON.stringify(payload, null, 2)` (per spec §4.5).

## Task 14: `get_latest_scan`

**Files:**
- Modify: `apps/glowlytics/backend/mcp/schemas.js`
- Create: `apps/glowlytics/backend/mcp/tools/scans.js`
- Modify: `apps/glowlytics/backend/mcp/server.js` (register tool)
- Create: `apps/glowlytics/backend/__tests__/mcp/tools/get-latest-scan.test.js`

- [ ] **Step 1: Failing test** — calls the tool through `buildMcpServer({ userId: 'user_a' })`, asserts `getLatestScan('user_a')` was called, asserts response shape `{ scanId, date, overallScore, signals, streakDays }`.

- [ ] **Step 2: Implement.** `inputSchema = z.object({}).strict()`. Handler: `await getLatestScan(userId)` → format → wrap in MCP content.

- [ ] **Step 3: Register in `server.js`.**

- [ ] **Step 4: Run green and commit.**

## Task 15: `get_scan_history`

Same pattern. Input: `{ days?: number().int().min(1).max(90).default(30), limit?: number().int().min(1).max(90).default(30) }`. Test asserts clamp + scoping.

## Task 16: `get_signal_trend`

Input: `{ signal: z.enum([...SIGNAL_NAMES]), period: z.enum(['7d','30d','90d']) }`. Test that an invalid signal returns `-32602` and never reaches the DB layer.

## Task 17: `compare_scans`

Input: `{ a: z.string(), b: z.string() }` where each is either a scan UUID or an ISO date. Test both cases plus the cross-user safety case (scan owned by another user → `-32602` with generic message).

## Task 18: `get_scan_report`

Input: `{ scanId?: z.string().optional() }`. If omitted, defaults to latest. Test the "generate if missing" path — assert RAG generator is called only when no row exists.

## Task 19: `get_current_routine`

Input: `z.object({}).strict()`. Output: `{ am, pm, conflicts }`. Test: includes the conflict array even when empty.

## Task 20: `lookup_ingredient` — citations include `chunkId` (Q3)

Input: `{ name: z.string().min(1).max(100) }`. Output:

```json
{
  "name": "Niacinamide",
  "aliases": ["Vitamin B3", "Nicotinamide"],
  "function": "barrier-supporting humectant",
  "concerns": [],
  "evidence": [
    { "source": "NIH 2023", "snippet": "...", "chunkId": "chunk_42", "url": "https://pubmed/..." }
  ]
}
```

Test must assert `chunkId` is present on every evidence item — this is the Q3 contract. A snapshot test on the JSON shape is acceptable.

## Task 21: `search_ingredients` — citations include `chunkId` (Q3)

Input: `{ query: z.string().min(1), limit?: z.number().int().min(1).max(25).default(10) }`. Each result item is `{ name, function, summary, citations: [{ source, snippet, chunkId, url? }] }`. Same `chunkId` assertion as Task 20.

## Task 22: `summarize_month` (Q2)

**Files:**
- Create: `apps/glowlytics/backend/mcp/tools/summary.js`
- Create: `apps/glowlytics/backend/__tests__/mcp/tools/summarize-month.test.js`

- [ ] **Step 1: Failing test** asserts the tool composes existing primitives in one call and returns:

```json
{
  "month": "2026-04",
  "scanCount": 14,
  "latestOverall": 78,
  "signalAverages": { "hydration": 72, "inflammation": 41, ... },
  "signalTrends": { "hydration": { "delta": 8, "direction": "up" }, ... },
  "currentRoutine": { "am": [...], "pm": [...], "conflicts": [...] },
  "topRecommendations": [
    { "title": "...", "rationale": "...", "scanId": "..." }
  ]
}
```

Test must also verify:
- `month` defaults to current calendar month in `Intl.DateTimeFormat('en-US', { timeZone: 'UTC' })` `YYYY-MM` form.
- When the user has zero scans in the month, `scanCount === 0` and `signalTrends === null` (do not fabricate).
- `topRecommendations` pulls from at most the latest 3 reports' top-rated recommendation each — does not call the RAG generator (read-only over existing reports).

- [ ] **Step 2: Implement.** Input schema:

```js
const summarizeMonthInput = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
}).strict();
```

Composition:

1. `getScanHistory(userId, { days: daysInMonth, limit: 90 })` filtered to the target month.
2. Reduce signals over the filtered set to compute `signalAverages` (arithmetic mean, ignore null/undefined).
3. For each signal, call `computeSignalTrend(userId, signal, '30d')` once; collect into `signalTrends`. Skip if `scanCount === 0`.
4. `getCurrentRoutine(userId)` for the routine snapshot.
5. Pull the latest 3 reports for the user, take each report's top recommendation, attach the source `scanId`.

Rationale baked into the test: this is a single server-side composition — clients pay for one tool call instead of five round trips, and we control the token budget.

- [ ] **Step 3: Run green and commit.**

```bash
git add mcp/tools/summary.js __tests__/mcp/tools/summarize-month.test.js mcp/server.js mcp/schemas.js
git commit -m "feat(mcp): summarize_month tool composes scans/trends/routine/reports"
```

---

# Milestone 5 — Cross-cutting tests

## Task 23: User-scoping cross-test (one suite, all 9 tools)

**Files:**
- Create: `apps/glowlytics/backend/__tests__/mcp/scoping.test.js`

- [ ] **Step 1:** Spin up an in-memory Postgres double (or mock the `pool`) seeded with two users' worth of data. For each tool, build an MCP server scoped to user A, invoke the tool with parameters that *would* match user B's data if scoping were absent (e.g., `compare_scans` with `b = <user_b_scan_id>`), assert the response either contains zero user-B identifiers or is a `-32602` error. Loop over all 9 tools.

- [ ] **Step 2: Run green and commit.**

## Task 24: Protocol end-to-end test using MCP SDK client

**Files:**
- Create: `apps/glowlytics/backend/__tests__/mcp/protocol-e2e.test.js`

- [ ] **Step 1:** Boot the Express app on an ephemeral port with `MCP_ENABLED=true` and a stub JWKS server (reuse Task 4's setup). Use `@modelcontextprotocol/sdk` client + `StreamableHTTPClientTransport` to:
  1. `initialize` — assert server returns the expected `serverInfo` and `tools/list` returns 9 tools.
  2. Call each tool with a minimal valid input — assert no protocol-level error.
  3. Call `lookup_ingredient` with name `""` — assert `-32602`.

- [ ] **Step 2: Run green and commit.**

---

# Milestone 6 — Mobile Settings: revoke connected MCP clients

Per spec §10: users can revoke any MCP client from a Settings screen.

## Task 25: Backend endpoints proxying Clerk's connected-clients API

**Files:**
- Modify: `apps/glowlytics/backend/app.js`
- Create: `apps/glowlytics/backend/__tests__/mcp/clients-endpoints.test.js`

- [ ] **Step 1: Failing test:** `GET /api/mcp/clients` (Clerk-session-authed, not MCP-authed) returns the user's connected OAuth applications; `DELETE /api/mcp/clients/:clientId` revokes one. Mock the Clerk Backend SDK call.

- [ ] **Step 2: Implement** using `@clerk/backend` SDK (already a dependency via `@clerk/clerk-expo` parent). The Clerk endpoint to list a user's OAuth grants is `GET /v1/users/:user_id/oauth_access_tokens` (paginated); revoke is `DELETE /v1/oauth_applications/:client_id/access_tokens` scoped to user. Confirm the exact endpoints during implementation by hitting `https://api.clerk.com/v1/openapi.json` with the project's `CLERK_SECRET_KEY`; if the shape differs, adjust the helper accordingly (the route shape stays stable for the mobile client).

- [ ] **Step 3: Run green and commit.**

## Task 26: Mobile Settings screen — Connected apps section

**Files:**
- Modify: nearest existing settings screen under `apps/glowlytics/app/(tabs)/profile.tsx` or `apps/glowlytics/app/settings*` (locate with `find apps/glowlytics/app -iname "*setting*" -o -iname "*profile*"`)
- Create: `apps/glowlytics/src/services/mcpClients.ts`
- Create: `apps/glowlytics/__tests__/services/mcpClients.test.ts`

- [ ] **Step 1: Failing test** for `mcpClients.ts` — `listConnectedApps()` calls `GET /api/mcp/clients`; `revokeConnectedApp(clientId)` calls `DELETE /api/mcp/clients/:clientId`. Mock `fetch`.

- [ ] **Step 2: Implement** the service.

- [ ] **Step 3: Add UI section** "Connected apps (Beta)" listing each app's name + connected-at timestamp with a per-row Revoke button. Use existing list components and `theme.ts` colors (no new design tokens). Show empty state "No apps connected — link Glowlytics to Claude or ChatGPT to ask about your skin data."

- [ ] **Step 4: Snapshot test** the empty state and a populated state.

- [ ] **Step 5: Commit.**

---

# Milestone 7 — Rollout

## Task 27: Internal dogfooding flag

- [ ] **Step 1:** In Railway, set `MCP_ENABLED=true` and `MCP_BETA_USER_IDS=<your Clerk user ID>` for the staging environment only.
- [ ] **Step 2:** Connect Claude Desktop using the public discovery URL `https://api-staging.glowlytics.ai/.well-known/oauth-protected-resource`. Verify all 9 tools work end-to-end with real data.
- [ ] **Step 3:** File any bugs found; do not promote to production until all are closed.

## Task 28: Closed beta

- [ ] **Step 1:** Curate first-50-paid-subscribers list (Clerk user IDs) into `MCP_BETA_USER_IDS` on production Railway.
- [ ] **Step 2:** Send a one-time email/in-app message with setup instructions linking to a `apps/landing` connector page (out of scope for this plan but tracked separately).

## Task 29: General availability

- [ ] **Step 1:** Clear `MCP_BETA_USER_IDS`. Keep `MCP_ENABLED=true`.
- [ ] **Step 2:** Submit `https://api.glowlytics.ai/mcp` to claude.ai's connector directory.

App Store submission is unaffected — backend-only change with one Settings entry that surfaces an external URL (no new app review concerns under 5.1.1).

---

# Self-review checklist (run before declaring this plan complete)

| Spec section | Tasks |
|--------------|-------|
| §3.1 Placement (in-Express, modular) | Tasks 12, 14–22 (file structure preserves modularity for future split) |
| §3.2 Streamable HTTP transport at `/mcp` | Task 12 |
| §3.3 OAuth — thin wrapper over Clerk | Tasks 3, 4 (decision settled by 2026-04-17 verification, header) |
| §4 Tool surface (8 tools) | Tasks 14–21 |
| §5 Data access via extracted helpers | Tasks 6–10 |
| §5.1 User scoping required | Task 23 (cross-tool scoping suite) |
| §6 Error mapping | Task 12 (errors.js) |
| §7 Rate limiting | Task 11 |
| §8 Observability | Task 13 |
| §9 Testing | Tasks 4, 23, 24, plus per-tool tests in 14–22 |
| §10 Settings revoke screen | Tasks 25, 26 |
| §11 Rollout | Tasks 27–29 |
| §12 Open Q1 (Clerk OAuth provider) | Verified in plan header — thin wrapper |
| §12 Open Q2 (`summarize_month`) | **Task 22 (no longer deferred)** |
| §12 Open Q3 (Pinecone chunk IDs) | **Tasks 10, 20, 21 (no longer deferred)** |
