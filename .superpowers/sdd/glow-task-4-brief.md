### Task 4: Railway UV Attribution Storage and Server-Confirmed `account_created`

**Files:**
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/package.json`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/db-init.js`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/queries/uv.js`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/posthog.js`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/app.js`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/server.js`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/uv-db.test.js`
- Modify: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/uv-endpoints.test.js`
- Create: `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/server-startup.test.js`

**Interfaces:**
- Consumes: verified Clerk `req.auth.userId`, verified Clerk primary email lookup, and explicit UV reconciliation result `matched`/`unmatched`/`unavailable` from `uvQueries.markCustomer` plus its surrounding Clerk/database lookup.
- Produces:
  - `canonicalGlowlyticsUserId(userId: string): string`
  - `accountCreatedUuid(userId: string): string`
  - `captureAccountCreated({ userId, uuid, timestamp, properties }: { userId: string; uuid: string; timestamp: string; properties: Record<string, unknown> }): Promise<void>`
  - `uvQueries.upsertLead(pool, lead)` accepts immutable attribution fields.
  - `uvQueries.findCustomerLead(pool, userId)` returns a lead already linked to that same Clerk user so a crash between `markCustomer` and delivery reservation cannot erase matched evidence.
  - `account_created` event properties include `product`, canonical attribution fields, `historical_backfill=false`, `waitlist_match`, and `waitlist_bypassed`.
  - Delivery state stored on each `user_profiles` row: `posthog_account_created_status` is one of `reconciliation_pending`, `pending_delivery`, `delivered`, or `historical_backfill_owned`; stable UUID/timestamp/properties/match fields are nullable until reconciliation is conclusive. A newly inserted post-cutover profile is durably `reconciliation_pending` even when Clerk or UV lookup is unavailable. Conclusive resolution atomically freezes the stable tuple and advances to `pending_delivery`; failed PostHog transport retries that frozen tuple.
  - Forward ownership starts at the scheduled boundary: `account_created` is emitted only when `user_profiles.created_at >= process.env.GLOWLYTICS_CUTOVER_AT`; older profiles are migrated to `historical_backfill_owned`. `waitlist_bypassed=true` is valid only after successful reconciliation returned `unmatched`, never after missing Clerk configuration, a transient lookup failure, or a Loops marketing failure. A bounded startup/interval worker retries both unresolved reconciliation and frozen delivery without relying on the client to repeat account creation.

- [ ] **Step 1: Add failing UV storage and delivery-metadata tests**

Extend `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/uv-db.test.js`:

```js
test('migrationV7 adds immutable PostHog attribution columns and retry-safe account delivery metadata', () => {
  const m = dbInit.migrationV7;
  expect(m).toContain('ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS posthog_distinct_id TEXT');
  expect(m).toContain('ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS acquisition_source TEXT');
  expect(m).toContain('ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS attribution_model TEXT');
  expect(m).toContain('ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS google_click_id_present BOOLEAN DEFAULT FALSE');
  expect(m).toContain('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_uuid UUID');
  expect(m).toContain('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_timestamp TIMESTAMPTZ');
  expect(m).toContain('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_sent_at TIMESTAMPTZ');
  expect(m).toContain("ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_status TEXT NOT NULL DEFAULT 'reconciliation_pending'");
  expect(m).toContain('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_properties JSONB');
  expect(m).toContain('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_waitlist_match BOOLEAN');
  expect(m).not.toContain('UPDATE user_profiles');
  expect(m).toContain('CREATE INDEX IF NOT EXISTS idx_user_profiles_posthog_account_created_pending');
  expect(typeof dbInit.markPreCutoverProfilesHistorical).toBe('function');
});

test('pre-cutover ownership marking is rerunnable and never consumes a forward reconciliation row', async () => {
  const pool = statefulProfilePool([
    { user_id: 'old', created_at: '2026-07-19T00:00:00Z', posthog_account_created_status: 'reconciliation_pending' },
    { user_id: 'forward', created_at: '2026-07-21T00:00:00Z', posthog_account_created_status: 'reconciliation_pending' },
  ]);
  await dbInit.markPreCutoverProfilesHistorical(pool, '2026-07-20T00:00:00Z');
  await dbInit.markPreCutoverProfilesHistorical(pool, '2026-07-20T00:00:00Z');
  expect(profileState(pool, 'old').posthog_account_created_status).toBe('historical_backfill_owned');
  expect(profileState(pool, 'forward').posthog_account_created_status).toBe('reconciliation_pending');
});

test('upsertLead stores first-touch fields on insert and does not overwrite them on duplicate email', async () => {
  const lead = {
    id: 'lead_1',
    email: 'a@b.com',
    report_token: 'tok_xyz',
    scan_id: 'scan_abc',
    source: 'uv-scan-web',
    posthog_distinct_id: 'browser-1',
    acquisition_source: 'google',
    acquisition_medium: 'paid_search',
    attribution_model: 'first_touch',
    attribution_quality: 'utm',
    utm_source: 'google',
    google_click_id_present: true,
    landing_path: '/uv-scan',
    referrer_host: 'www.google.com',
  };
  const pool = fakePool([{ id: 'lead_1' }]);

  await upsertLead(pool, lead);

  const sql = pool.query.mock.calls[0][0];
  expect(sql).toContain('posthog_distinct_id');
  expect(sql).not.toMatch(/SET[\s\S]*acquisition_source\s*=/);
  expect(pool.query.mock.calls[0][1]).toEqual(expect.arrayContaining(['browser-1', 'google', 'paid_search', 'first_touch', 'utm', true, '/uv-scan']));
});
```

- [ ] **Step 2: Add failing account-created endpoint tests for retry-safe delivery**

Extend `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/uv-endpoints.test.js`:

```js
jest.mock('../posthog', () => ({
  captureAccountCreated: jest.fn().mockResolvedValue(undefined),
  canonicalGlowlyticsUserId: (id) => `glowlytics:user:${id}`,
  accountCreatedUuid: (id) => `11111111-1111-5111-8111-${id.padStart(12, '0').slice(0, 12)}`,
}));
const posthog = require('../posthog');

test('POST /api/users emits server-confirmed account_created with stable UUID/timestamp and sanitized UV attribution', async () => {
  uvQueries.markCustomer.mockResolvedValue({
    email: 'lead@example.com',
    status: 'customer',
    acquisition_source: 'google',
    acquisition_medium: 'paid_search',
    attribution_model: 'first_touch',
    attribution_quality: 'utm',
    google_click_id_present: true,
    landing_path: '/uv-scan',
    referrer_host: 'www.google.com',
    utm_content: 'api_key=secret',
    utm_term: 'Bearer abc123',
  });

  const res = await request(app).post('/api/users').send(validBody);

  expect(res.status).toBe(201);
  expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'dev-user',
    uuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
    timestamp: expect.any(String),
    properties: expect.objectContaining({
      distinct_id: 'glowlytics:user:dev-user',
      acquisition_source: 'google',
      landing_path: '/uv-scan',
      waitlist_match: true,
      waitlist_bypassed: false,
    }),
  }));
  expect(JSON.stringify(posthog.captureAccountCreated.mock.calls[0][0])).not.toMatch(/lead@example\.com|api_key|Bearer|secret/);
  expect(pool.query.mock.calls.some(([sql]) => /posthog_account_created_sent_at\s*=\s*NOW\(\)/.test(sql))).toBe(true);
});

test('POST /api/users retries account_created with the same UUID/timestamp/properties after a failed capture', async () => {
  posthog.captureAccountCreated.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined);
  uvQueries.markCustomer
    .mockResolvedValueOnce({ acquisition_source: 'google', acquisition_medium: 'paid_search', attribution_model: 'first_touch', attribution_quality: 'utm', landing_path: '/uv-scan' })
    .mockResolvedValueOnce(null);

  const first = await request(app).post('/api/users').send(validBody);
  const second = await request(app).post('/api/users').send(validBody);

  expect(first.status).toBe(201);
  expect(second.status).toBe(409);
  expect(posthog.captureAccountCreated).toHaveBeenCalledTimes(2);
  expect(posthog.captureAccountCreated.mock.calls[1][0].uuid).toBe(posthog.captureAccountCreated.mock.calls[0][0].uuid);
  expect(posthog.captureAccountCreated.mock.calls[1][0].timestamp).toBe(posthog.captureAccountCreated.mock.calls[0][0].timestamp);
  expect(posthog.captureAccountCreated.mock.calls[1][0].properties).toEqual(posthog.captureAccountCreated.mock.calls[0][0].properties);
  const failedCallIndex = pool.query.mock.calls.findIndex(([sql]) => /posthog_account_created_sent_at\s*=\s*NOW\(\)/.test(sql));
  expect(failedCallIndex).toBeGreaterThan(posthog.captureAccountCreated.mock.invocationCallOrder[0]);
});

test('unavailable reconciliation stays durable and the bounded worker later resolves it without inventing bypass evidence', async () => {
  uvQueries.markCustomer
    .mockRejectedValueOnce(new Error('temporary Railway lookup failure'))
    .mockResolvedValueOnce(null);

  const first = await request(app).post('/api/users').send(validBody);
  expect(first.status).toBe(201);
  expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
  expect(profileState('dev-user')).toEqual(expect.objectContaining({
    posthog_account_created_status: 'reconciliation_pending',
    posthog_account_created_uuid: null,
    posthog_account_created_waitlist_match: null,
  }));

  await app._retryPendingAccountCreatedDeliveries({ limit: 1 });

  expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'dev-user',
    timestamp: profileCreatedAt.toISOString(),
    properties: expect.objectContaining({ waitlist_match: false, waitlist_bypassed: true }),
  }));
  expect(profileState('dev-user').posthog_account_created_status).toBe('delivered');
});

test('missing Clerk configuration remains reconciliation_pending for a later worker pass', async () => {
  delete process.env.CLERK_SECRET_KEY;
  const res = await request(app).post('/api/users').send(validBody);
  expect(res.status).toBe(201);
  expect(uvQueries.markCustomer).not.toHaveBeenCalled();
  expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
  expect(profileState('dev-user').posthog_account_created_status).toBe('reconciliation_pending');
});

test('Loops failure cannot turn a verified lead match into a bypass', async () => {
  uvQueries.markCustomer.mockResolvedValue({ acquisition_source: 'google', attribution_model: 'first_touch' });
  loops.sendEvent.mockRejectedValueOnce(new Error('Loops unavailable'));

  const res = await request(app).post('/api/users').send(validBody);

  expect(res.status).toBe(201);
  expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({ properties: expect.objectContaining({ waitlist_match: true, waitlist_bypassed: false }) }));
  expect(profileState('dev-user')).toEqual(expect.objectContaining({
    posthog_account_created_status: 'delivered',
    posthog_account_created_waitlist_match: true,
  }));
});

test('worker recovers a lead already linked before a crash without relabeling it unmatched', async () => {
  uvQueries.markCustomer.mockResolvedValue(null);
  uvQueries.findCustomerLead.mockResolvedValue({ clerk_user_id: 'dev-user', acquisition_source: 'google' });
  seedProfiles([{ user_id: 'dev-user', posthog_account_created_status: 'reconciliation_pending' }]);

  await app._retryPendingAccountCreatedDeliveries({ limit: 1 });

  expect(loops.sendEvent).not.toHaveBeenCalled();
  expect(posthog.captureAccountCreated).toHaveBeenCalledWith(expect.objectContaining({ properties: expect.objectContaining({ waitlist_match: true, waitlist_bypassed: false }) }));
});

test('retry worker is bounded and skips historical/delivered rows', async () => {
  seedProfiles([
    { user_id: 'pending-1', posthog_account_created_status: 'reconciliation_pending' },
    { user_id: 'pending-2', posthog_account_created_status: 'reconciliation_pending' },
    { user_id: 'old', posthog_account_created_status: 'historical_backfill_owned' },
    { user_id: 'done', posthog_account_created_status: 'delivered' },
  ]);

  await app._retryPendingAccountCreatedDeliveries({ limit: 1 });

  expect(uvQueries.markCustomer).toHaveBeenCalledTimes(1);
  expect(posthog.captureAccountCreated).toHaveBeenCalledTimes(1);
  expect(profileState('pending-2').posthog_account_created_status).toBe('reconciliation_pending');
});

test('profiles created before GLOWLYTICS_CUTOVER_AT do not emit forward account_created', async () => {
  process.env.GLOWLYTICS_CUTOVER_AT = '2999-01-01T00:00:00.000Z';
  pool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

  const res = await request(app).post('/api/users').send(validBody);

  expect(res.status).toBe(201);
  expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
});

test('POST /api/users fails before profile insert when GLOWLYTICS_CUTOVER_AT is missing or invalid', async () => {
  delete process.env.GLOWLYTICS_CUTOVER_AT;

  const res = await request(app).post('/api/users').send(validBody);

  expect(res.status).toBe(500);
  expect(res.body).toEqual({ error: 'cutover_not_configured' });
  expect(pool.query.mock.calls.some(([sql]) => /INSERT INTO user_profiles/.test(sql))).toBe(false);
  expect(posthog.captureAccountCreated).not.toHaveBeenCalled();
});
```

Create `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/__tests__/server-startup.test.js` with mocked `pg.Pool`, `db-init`, `app`, and `signal-models` dependencies and Jest fake timers so the scheduled retry interval cannot leak across tests. Export `startServer` from `server.js` and guard its production invocation with `require.main === module`, then prove behavior rather than source text:

```js
test('schema failure prevents the listener from accepting traffic', async () => {
  initSchema.mockRejectedValueOnce(new Error('migration failed'));
  await expect(startServer()).rejects.toThrow('migration failed');
  expect(app.listen).not.toHaveBeenCalled();
});

test('missing cutover configuration prevents the listener from accepting traffic', async () => {
  initSchema.mockResolvedValueOnce(undefined);
  delete process.env.GLOWLYTICS_CUTOVER_AT;

  await expect(startServer()).rejects.toThrow('GLOWLYTICS_CUTOVER_AT missing or invalid');

  expect(app.listen).not.toHaveBeenCalled();
});

test('successful startup initializes schema before listen and starts bounded account retry', async () => {
  process.env.GLOWLYTICS_CUTOVER_AT = '2026-07-22T12:00:00.000Z';
  initSchema.mockResolvedValueOnce(undefined);
  app.listen.mockReturnValue({ close: jest.fn() });
  app._retryPendingAccountCreatedDeliveries.mockResolvedValueOnce(undefined);

  await startServer();

  expect(initSchema.mock.invocationCallOrder[0]).toBeLessThan(app.listen.mock.invocationCallOrder[0]);
  expect(app._retryPendingAccountCreatedDeliveries).toHaveBeenCalledWith({ limit: 100 });
});
```

- [ ] **Step 3: Run backend tests to verify failure**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/server-startup.test.js --runInBand`

Expected: FAIL because `migrationV7`, UV attribution columns, retry-safe delivery metadata, scheduled-cutover account gating, and stable PostHog account delivery helpers do not exist.

- [ ] **Step 4: Add Railway migration V7**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/db-init.js`:

```js
const migrationV7 = `
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS posthog_distinct_id TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS acquisition_source TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS acquisition_medium TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS attribution_model TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS attribution_quality TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS utm_term TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS google_click_id_present BOOLEAN DEFAULT FALSE;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS referrer_host TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS landing_path TEXT;
ALTER TABLE uv_leads ADD COLUMN IF NOT EXISTS form_placement TEXT;

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_uuid UUID;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_timestamp TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_sent_at TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_status TEXT NOT NULL DEFAULT 'reconciliation_pending';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_properties JSONB;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_waitlist_match BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_uv_leads_posthog_distinct_id ON uv_leads(posthog_distinct_id);
CREATE INDEX IF NOT EXISTS idx_uv_leads_acquisition_source ON uv_leads(acquisition_source);
CREATE INDEX IF NOT EXISTS idx_user_profiles_posthog_account_created_pending
  ON user_profiles(posthog_account_created_status, created_at)
  WHERE posthog_account_created_status IN ('reconciliation_pending', 'pending_delivery');
`;
```
`migrationV7` is rerun by `initSchema`, so it must contain DDL/indexes only. Never put an unbounded `UPDATE user_profiles` in that string: a later restart would misclassify unresolved forward rows as historical.

Add a separately parameterized, idempotent ownership gate and keep both it and V7 fatal:

```js
async function markPreCutoverProfilesHistorical(externalPool, cutoverAt) {
  const cutoverMs = Date.parse(cutoverAt || '');
  if (!Number.isFinite(cutoverMs)) throw new Error('GLOWLYTICS_CUTOVER_AT missing or invalid');
  await externalPool.query(
    `UPDATE user_profiles
        SET posthog_account_created_sent_at = COALESCE(posthog_account_created_sent_at, NOW()),
            posthog_account_created_status = 'historical_backfill_owned'
      WHERE created_at < $1::timestamptz
        AND posthog_account_created_status = 'reconciliation_pending'
        AND posthog_account_created_uuid IS NULL`,
    [new Date(cutoverMs).toISOString()]
  );
}
```

Add `verifyPostHogAttributionSchema(pool)` in `db-init.js`. It must query `information_schema.columns` for every V7 column above plus existing `user_profiles.created_at` and `uv_leads.created_at`, throw on any missing column, and make deployment/cutover fail fast; do not log-and-continue or treat this verification as a warning. In `initSchema`, run these in order before the server accepts requests:

```js
await externalPool.query(migrationV7);
await verifyPostHogAttributionSchema(externalPool);
await markPreCutoverProfilesHistorical(externalPool, process.env.GLOWLYTICS_CUTOVER_AT);
```

Every profile with `created_at < GLOWLYTICS_CUTOVER_AT` is therefore historical-owned on every restart; every unresolved row at or after the boundary remains `reconciliation_pending`. Export the gate:

```js
module.exports = { schema, migrationV5, migrationV6, migrationV7, initSchema, markPreCutoverProfilesHistorical };
```

- [ ] **Step 5: Extend UV query storage without overwriting first-touch**

Modify `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/queries/uv.js`:

```js
async function upsertLead(pool, {
  id, email, report_token, scan_id, source,
  posthog_distinct_id, acquisition_source, acquisition_medium, attribution_model,
  attribution_quality, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
  google_click_id_present, referrer_host, landing_path, form_placement,
}) {
  const { rows } = await pool.query(
    `INSERT INTO uv_leads
       (id, email, report_token, scan_id, source, posthog_distinct_id,
        acquisition_source, acquisition_medium, attribution_model, attribution_quality,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        google_click_id_present, referrer_host, landing_path, form_placement)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     ON CONFLICT (email) DO UPDATE SET
       source = COALESCE(EXCLUDED.source, uv_leads.source)
     RETURNING *`,
    [id, email, report_token, scan_id, source, posthog_distinct_id || null,
     acquisition_source || null, acquisition_medium || null, attribution_model || null, attribution_quality || null,
     utm_source || null, utm_medium || null, utm_campaign || null, utm_term || null, utm_content || null,
     Boolean(google_click_id_present), referrer_host || null, landing_path || null, form_placement || null]
  );
  return rows[0];
}

async function findCustomerLead(pool, userId) {
  const { rows } = await pool.query(
    `SELECT *
       FROM uv_leads
      WHERE clerk_user_id = $1
      ORDER BY created_at, id
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

```
Add `findCustomerLead` to the existing `module.exports` object at the bottom of `queries/uv.js`; do not replace that object or drop its current exports.

- [ ] **Step 6: Add the backend PostHog forward-capture helper**

Create `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/posthog.js`:

```js
const crypto = require('crypto');

const UUID_NAMESPACE = '8f3138f3-b4e5-5af1-bd6f-25fb94a89a9f';

function deterministicUuidV5(name, namespace = UUID_NAMESPACE) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = crypto.createHash('sha1').update(ns).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalGlowlyticsUserId(userId) {
  return `glowlytics:user:${userId}`;
}

function accountCreatedUuid(userId) {
  return deterministicUuidV5(`glowlytics|forward|account_created|${userId}`);
}

const ACQUISITION_SOURCES = new Set(['instagram', 'tiktok', 'google', 'other_search', 'ai_search', 'direct', 'referral', 'unknown']);
const ATTRIBUTION_QUALITIES = new Set(['utm', 'referrer', 'unknown', 'backfilled']);
const SENSITIVE_VALUE_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|((api[_-]?key|api|secret|password|credential|bearer|access|refresh|id)?[_-]?token=?)|\b(api[_-]?key|secret|password|credential|bearer)\b|((gclid|gbraid|wbraid)=?)/i;
const marketing = (value, max = 256) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed && !SENSITIVE_VALUE_RE.test(trimmed) ? trimmed : null;
};
const enumOr = (set, value, fallback) => (typeof value === 'string' && set.has(value) ? value : fallback);
function normalizeHost(value) {
  const raw = marketing(value, 512);
  if (!raw) return null;
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase().slice(0, 256);
  } catch {
    return null;
  }
}
function normalizePath(value) {
  const raw = marketing(value, 512);
  if (!raw) return null;
  try {
    const parsed = raw.startsWith('/') ? new URL(`https://glowlytics.invalid${raw}`) : new URL(raw);
    return parsed.pathname.slice(0, 256);
  } catch {
    return raw.startsWith('/') ? raw.split(/[?#]/, 1)[0].slice(0, 256) : null;
  }
}

function accountAttributionProperties(attribution, waitlistMatch) {
  return {
    product: 'glowlytics',
    acquisition_source: enumOr(ACQUISITION_SOURCES, attribution?.acquisition_source, 'unknown'),
    acquisition_medium: marketing(attribution?.acquisition_medium, 64) || 'unknown',
    attribution_model: 'first_touch',
    attribution_quality: enumOr(ATTRIBUTION_QUALITIES, attribution?.attribution_quality, 'unknown'),
    historical_backfill: false,
    utm_source: marketing(attribution?.utm_source, 128)?.toLowerCase() || null,
    utm_medium: marketing(attribution?.utm_medium, 128)?.toLowerCase() || null,
    utm_campaign: marketing(attribution?.utm_campaign, 256),
    utm_term: marketing(attribution?.utm_term, 256),
    utm_content: marketing(attribution?.utm_content, 256),
    google_click_id_present: Boolean(attribution?.google_click_id_present),
    referrer_host: normalizeHost(attribution?.referrer_host),
    landing_path: normalizePath(attribution?.landing_path),
    form_placement: attribution?.form_placement || null,
    waitlist_match: Boolean(waitlistMatch),
    waitlist_bypassed: !waitlistMatch,
  };
}

async function captureAccountCreated({ userId, uuid, timestamp, properties }) {
  if (!properties || properties.distinct_id !== canonicalGlowlyticsUserId(userId)) {
    throw new Error('account_created properties must contain the canonical distinct_id');
  }
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) throw new Error('POSTHOG_API_KEY missing; account_created remains pending');
  const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
  const body = {
    api_key: apiKey,
    batch: [{
      uuid,
      event: 'account_created',
      timestamp,
      properties,
    }],
  };
  const res = await fetch(`${host.replace(/\/$/, '')}/batch/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`PostHog batch capture failed: ${res.status}`);
  return { ok: true };
}

module.exports = { deterministicUuidV5, canonicalGlowlyticsUserId, accountCreatedUuid, accountAttributionProperties, captureAccountCreated };
```

This helper emits only forward server-confirmed `account_created`; the dry-run historical importer in Task 5 remains separate and sendless. It does not add `sent_at`, and retries reuse the exact same `uuid`, `event`, `timestamp`, and `distinct_id`.

- [ ] **Step 7: Wire UV lead payloads and retry-safe account capture into `app.js`**

In `/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/app.js`, import:

```js
const posthog = require('./posthog');
```

Extend `/api/uv/lead` request parsing:

```js
const {
  email: rawEmail, scan_id, source, claim_token,
  posthog_distinct_id, acquisition_source, acquisition_medium, attribution_model,
  attribution_quality, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
  google_click_id_present, referrer_host, landing_path, form_placement,
} = req.body || {};
```

Validate the UV attribution payload before storage and before later PostHog reuse. Do not persist full referrer URLs, landing paths with query strings, arbitrary placement/source values, or sensitive UTM values:

```js
const FORM_PLACEMENT_ALIASES = new Map([['hero', 'hero'], ['footer', 'footer'], ['final-cta', 'footer'], ['blog-newsletter', 'footer'], ['modal', 'modal'], ['pricing', 'pricing'], ['mobile_onboarding', 'mobile_onboarding'], ['uv-scan-web', 'unknown'], ['unknown', 'unknown']]);
const ACQUISITION_SOURCES = new Set(['instagram', 'tiktok', 'google', 'other_search', 'ai_search', 'direct', 'referral', 'unknown']);
const ATTRIBUTION_QUALITIES = new Set(['utm', 'referrer', 'unknown', 'backfilled']);
const SENSITIVE_VALUE_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|((api[_-]?key|api|secret|password|credential|bearer|access|refresh|id)?[_-]?token=?)|\b(api[_-]?key|secret|password|credential|bearer)\b|((gclid|gbraid|wbraid)=?)/i;

function marketingField(value, max = 256) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed && !SENSITIVE_VALUE_RE.test(trimmed) ? trimmed : null;
}

function normalizeFormPlacement(value) {
  return typeof value === 'string' ? FORM_PLACEMENT_ALIASES.get(value) || 'unknown' : 'unknown';
}

function normalizeHost(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.includes('://') ? value : `https://${value}`);
    return parsed.hostname.toLowerCase().slice(0, 256) || null;
  } catch {
    return /^[a-z0-9.-]+$/i.test(value) && !value.includes('@') ? value.toLowerCase().slice(0, 256) : null;
  }
}

function normalizePath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = value.startsWith('/') ? new URL(value, 'https://glowlytics.ai') : new URL(value);
    return (parsed.pathname || '/').slice(0, 256);
  } catch {
    const path = value.split(/[?#]/, 1)[0];
    return path.startsWith('/') ? path.slice(0, 256) : null;
  }
}
```

Pass only normalized fields into `upsertLead`:

```js
const safeAcquisitionSource = ACQUISITION_SOURCES.has(acquisition_source) ? acquisition_source : 'unknown';
const safeAttributionQuality = ATTRIBUTION_QUALITIES.has(attribution_quality) ? attribution_quality : 'unknown';
const lead = await uvQueries.upsertLead(pool, {
  id: uuidv4(),
  email,
  report_token: uuidv4().replace(/-/g, ''),
  scan_id,
  source: source || 'uv-scan-web',
  posthog_distinct_id,
  acquisition_source: safeAcquisitionSource,
  acquisition_medium: marketingField(acquisition_medium, 64) || 'unknown',
  attribution_model: 'first_touch',
  attribution_quality: safeAttributionQuality,
  utm_source: marketingField(utm_source, 128)?.toLowerCase() || null,
  utm_medium: marketingField(utm_medium, 128)?.toLowerCase() || null,
  utm_campaign: marketingField(utm_campaign, 256),
  utm_term: marketingField(utm_term, 256),
  utm_content: marketingField(utm_content, 256),
  google_click_id_present: google_click_id_present === true,
  referrer_host: normalizeHost(referrer_host),
  landing_path: normalizePath(landing_path),
  form_placement: normalizeFormPlacement(form_placement),
});
```

Change `convertUvLeadToCustomer` to return an explicit reconciliation result. `matched` and `unmatched` are conclusive; `unavailable` means no delivery metadata may be reserved yet:

```js
async function convertUvLeadToCustomer(userId) {
  try {
    if (!process.env.CLERK_SECRET_KEY) {
      return { status: 'unavailable' };
    }
    const clerkApiBase = process.env.CLERK_API_BASE || 'https://api.clerk.com';
    const clerkRes = await fetch(`${clerkApiBase}/v1/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!clerkRes.ok) return { status: 'unavailable' };
    const data = await clerkRes.json();
    const rawEmail =
      data.email_addresses?.find((entry) => entry.id === data.primary_email_address_id)?.email_address ||
      data.email_addresses?.[0]?.email_address ||
      null;
    if (!rawEmail) return { status: 'unavailable' };
    const email = rawEmail.toLowerCase().trim();
    const transitionedLead = await uvQueries.markCustomer(pool, { email, clerk_user_id: userId });
    const row = transitionedLead || await uvQueries.findCustomerLead(pool, userId);
    if (row) {
      if (transitionedLead) {
        try {
          await loops.sendEvent(email, 'became_customer', {
            contactProperties: { clerkUserId: userId },
          });
        } catch (loopsErr) {
          log.warn('[uv] became_customer marketing event failed:', loopsErr?.message || loopsErr);
        }
      }
      return { status: 'matched', lead: row };
    }
    return { status: 'unmatched' };
  } catch (err) {
    log.warn('[uv] lead->customer conversion failed:', err?.message || err);
    return { status: 'unavailable' };
  }
}
```

Add retry-safe delivery helpers inside `app.js`. A new profile's migration default is already durable `reconciliation_pending`. Reconciliation never writes match/bypass evidence until it is conclusive. Reservation atomically freezes the original `created_at` timestamp, sanitized properties, match result, and deterministic UUID, then advances to `pending_delivery`. Transport retries load the frozen row; they never reclassify it.

```js
const RETRYABLE_ACCOUNT_STATUSES = ['reconciliation_pending', 'pending_delivery'];

async function loadAccountCreatedDelivery(userId) {
  const { rows } = await pool.query(
    `SELECT user_id, created_at,
            posthog_account_created_status AS status,
            posthog_account_created_uuid AS uuid,
            posthog_account_created_timestamp AS timestamp,
            posthog_account_created_properties AS properties,
            posthog_account_created_waitlist_match AS waitlist_match
       FROM user_profiles
      WHERE user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function markRuntimePreCutoverProfileHistorical(userId, cutoverAt) {
  await pool.query(
    `UPDATE user_profiles
        SET posthog_account_created_sent_at = COALESCE(posthog_account_created_sent_at, NOW()),
            posthog_account_created_status = 'historical_backfill_owned'
      WHERE user_id = $1
        AND created_at < $2::timestamptz
        AND posthog_account_created_status = 'reconciliation_pending'
        AND posthog_account_created_uuid IS NULL`,
    [userId, cutoverAt]
  );
}

async function reserveAccountCreatedDelivery(userId, attribution, matchStatus) {
  if (!['matched', 'unmatched'].includes(matchStatus)) {
    throw new Error('account_created delivery requires conclusive waitlist reconciliation');
  }
  const waitlistMatch = matchStatus === 'matched';
  const uuid = posthog.accountCreatedUuid(userId);
  const cutoverAt = process.env.GLOWLYTICS_CUTOVER_AT;
  if (!cutoverAt) throw new Error('GLOWLYTICS_CUTOVER_AT missing');
  const properties = {
    distinct_id: posthog.canonicalGlowlyticsUserId(userId),
    ...posthog.accountAttributionProperties(attribution, waitlistMatch),
  };
  const { rows } = await pool.query(
    `UPDATE user_profiles
        SET posthog_account_created_uuid = COALESCE(posthog_account_created_uuid, $2::uuid),
            posthog_account_created_timestamp = COALESCE(posthog_account_created_timestamp, created_at),
            posthog_account_created_properties = COALESCE(posthog_account_created_properties, $4::jsonb),
            posthog_account_created_waitlist_match = COALESCE(posthog_account_created_waitlist_match, $5::boolean),
            posthog_account_created_status = 'pending_delivery'
      WHERE user_id = $1
        AND created_at >= $3::timestamptz
        AND posthog_account_created_status IN ('reconciliation_pending', 'pending_delivery')
      RETURNING posthog_account_created_uuid AS uuid,
                posthog_account_created_timestamp AS timestamp,
                posthog_account_created_properties AS properties,
                posthog_account_created_waitlist_match AS waitlist_match,
                posthog_account_created_status AS status`,
    [userId, uuid, cutoverAt, JSON.stringify(properties), waitlistMatch]
  );
  return rows[0] || null;
}

async function markAccountCreatedSent(userId, uuid) {
  await pool.query(
    `UPDATE user_profiles
        SET posthog_account_created_sent_at = NOW(),
            posthog_account_created_status = 'delivered'
      WHERE user_id = $1
        AND posthog_account_created_uuid = $2::uuid
        AND posthog_account_created_status = 'pending_delivery'`,
    [userId, uuid]
  );
}

async function sendReservedAccountCreated(userId, delivery) {
  const timestamp = new Date(delivery.timestamp).toISOString();
  await posthog.captureAccountCreated({
    userId,
    uuid: delivery.uuid,
    timestamp,
    properties: delivery.properties,
  });
  await markAccountCreatedSent(userId, delivery.uuid);
}

async function reconcileAndDeliverAccountCreated(userId) {
  const current = await loadAccountCreatedDelivery(userId);
  if (!current || !RETRYABLE_ACCOUNT_STATUSES.includes(current.status)) return;
  const cutoverMs = Date.parse(process.env.GLOWLYTICS_CUTOVER_AT || '');
  if (!Number.isFinite(cutoverMs)) throw new Error('GLOWLYTICS_CUTOVER_AT missing or invalid');
  if (new Date(current.created_at).getTime() < cutoverMs) {
    await markRuntimePreCutoverProfileHistorical(userId, new Date(cutoverMs).toISOString());
    return;
  }
  if (current.status === 'pending_delivery') {
    await sendReservedAccountCreated(userId, current);
    return;
  }
  const reconciliation = await convertUvLeadToCustomer(userId);
  if (reconciliation.status === 'unavailable') return;
  const delivery = await reserveAccountCreatedDelivery(
    userId,
    reconciliation.status === 'matched' ? reconciliation.lead : undefined,
    reconciliation.status
  );
  if (delivery) await sendReservedAccountCreated(userId, delivery);
}

async function retryPendingAccountCreatedDeliveries({ limit = 100 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('invalid retry limit');
  const { rows } = await pool.query(
    `SELECT user_id
       FROM user_profiles
      WHERE posthog_account_created_status IN ('reconciliation_pending', 'pending_delivery')
      ORDER BY created_at, user_id
      LIMIT $1`,
    [limit]
  );
  for (const { user_id: userId } of rows) {
    try {
      await reconcileAndDeliverAccountCreated(userId);
    } catch (err) {
      log.warn('[posthog] pending account_created retry failed:', err?.message || err);
    }
  }
}

app._retryPendingAccountCreatedDeliveries = retryPendingAccountCreatedDeliveries;
```

Before `INSERT INTO user_profiles`, fail closed if the cutover config is missing or invalid so the row is not inserted into an unowned historical/forward gap:

```js
const cutoverMs = Date.parse(process.env.GLOWLYTICS_CUTOVER_AT || '');
if (!Number.isFinite(cutoverMs)) {
  return res.status(500).json({ error: 'cutover_not_configured' });
}
```

After `INSERT INTO user_profiles` succeeds, attempt immediate reconciliation. Returning `201` is safe even when this attempt is unavailable because the inserted row is already durable `reconciliation_pending` and the server worker owns retry:

```js
await reconcileAndDeliverAccountCreated(userId)
  .catch((err) => log.warn('[posthog] account_created attempt failed:', err?.message || err));
res.status(201).json(result.rows[0]);
```

In the duplicate `23505` branch, invoke the same state-machine entry point for a fast retry. This is an optimization, not the only retry path:

```js
const duplicateUserId = (req.auth && req.auth.userId) || null;
if (duplicateUserId) {
  await reconcileAndDeliverAccountCreated(duplicateUserId)
    .catch((err) => log.warn('[posthog] duplicate account_created retry failed:', err?.message || err));
}
return res.status(409).json({ error: 'User profile already exists' });
```

Modify `server.js` so migrations and `verifyPostHogAttributionSchema` finish and `GLOWLYTICS_CUTOVER_AT` is validated before `app.listen`; V7 or cutover failure must reject startup rather than use the existing log-and-continue path. After the listener is ready, trigger one bounded retry pass and schedule later passes without overlapping. The initial retry is asynchronous and may not block readiness on up to 100 Clerk lookups:

```js
async function initDB() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const migrationPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: poolSsl() });
  attachPoolErrorHandler(migrationPool, 'server-init');
  try {
    await initSchema(migrationPool);
  } finally {
    await migrationPool.end();
  }
}

async function startServer() {
  await initDB();
  const cutoverMs = Date.parse(process.env.GLOWLYTICS_CUTOVER_AT || '');
  if (!Number.isFinite(cutoverMs)) throw new Error('GLOWLYTICS_CUTOVER_AT missing or invalid');
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Glowlytics API running on port ${PORT}`);
  });
  let retryRunning = false;
  const runAccountRetry = async () => {
    if (retryRunning) return;
    retryRunning = true;
    try {
      await app._retryPendingAccountCreatedDeliveries({ limit: 100 });
    } finally {
      retryRunning = false;
    }
  };
  runAccountRetry().catch((err) => console.error('[posthog] initial retry worker failed:', err?.message || err));
  const retryTimer = setInterval(
    () => runAccountRetry().catch((err) => console.error('[posthog] retry worker failed:', err?.message || err)),
    60_000
  );
  retryTimer.unref();
  signalModels.initModels().catch((err) => console.error('[models] init failed:', err?.message || err));
  return server;
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[server] fatal startup failure:', err?.message || err);
    process.exitCode = 1;
  });
}
module.exports = { startServer };
```

- [ ] **Step 8: Run focused backend tests**

Run: `cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/server-startup.test.js --runInBand`

Expected: PASS. Confirm the tests prove UV attribution fields are stored immutably, old profiles are `historical_backfill_owned` and never emitted forward, profiles with `created_at < GLOWLYTICS_CUTOVER_AT` stay historical-owned, unavailable Clerk/UV reconciliation is durably `reconciliation_pending`, the bounded worker retries without client repetition, Loops failure cannot change a verified match, conclusive resolution freezes `pending_delivery`, failed PostHog transport retries the same `uuid`/`event`/original `timestamp`/`distinct_id`/properties tuple, `delivered` is terminal, `waitlist_match=true` appears only for a verified UV lead, and `waitlist_bypassed=true` appears only after conclusive `unmatched`.

- [ ] **Step 9: Commit**

```bash
cd /Users/mustafaboorenie/cornell-hackathon
git add apps/glowlytics/backend/package.json apps/glowlytics/backend/package-lock.json apps/glowlytics/backend/db-init.js apps/glowlytics/backend/queries/uv.js apps/glowlytics/backend/posthog.js apps/glowlytics/backend/app.js apps/glowlytics/backend/server.js apps/glowlytics/backend/__tests__/uv-db.test.js apps/glowlytics/backend/__tests__/uv-endpoints.test.js apps/glowlytics/backend/__tests__/server-startup.test.js
git commit -m "feat(glowlytics): emit server confirmed account creation"
```

---
