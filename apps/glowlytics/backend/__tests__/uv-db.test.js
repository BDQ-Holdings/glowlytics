// pg is mocked so requiring db-init.js / queries/uv.js does not open a real
// connection. db-init.js destructures `types` and calls types.setTypeParser at
// require time, so the mock must provide it alongside Pool.
const mockQuery = jest.fn();
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({ query: mockQuery, end: jest.fn() })),
  types: { setTypeParser: jest.fn() },
}));

const dbInit = require('../db-init');
const {
  insertScan,
  getScan,
  claimScan,
  upsertLead,
  getLeadByEmail,
  getLeadByToken,
  markCustomer,
  findCustomerLead,
} = require('../queries/uv');

// A fresh fake pool whose query resolves to the given rows.
function fakePool(rows = []) {
  return { query: jest.fn().mockResolvedValue({ rows }) };
}

function statefulProfilePool(rows = []) {
  const profiles = new Map(rows.map((row) => [row.user_id, { ...row }]));
  return {
    profiles,
    query: jest.fn(async (sql, params = []) => {
      if (/UPDATE user_profiles/.test(sql) && /created_at </.test(sql)) {
        const cutoff = Date.parse(params[0]);
        let rowCount = 0;
        for (const row of profiles.values()) {
          if (
            Date.parse(row.created_at) < cutoff &&
            row.posthog_account_created_status === 'reconciliation_pending' &&
            row.posthog_account_created_uuid == null
          ) {
            row.posthog_account_created_sent_at = row.posthog_account_created_sent_at || new Date().toISOString();
            row.posthog_account_created_status = 'historical_backfill_owned';
            rowCount += 1;
          }
        }
        return { rows: [], rowCount };
      }
      return { rows: [] };
    }),
  };
}

function profileState(pool, userId) {
  return pool.profiles.get(userId);
}

describe('db-init migrationV5 (structural)', () => {
  test('exports schema (string) and initSchema (function)', () => {
    expect(typeof dbInit.schema).toBe('string');
    expect(typeof dbInit.initSchema).toBe('function');
  });

  test('exports migrationV5 as a string', () => {
    expect(typeof dbInit.migrationV5).toBe('string');
  });

  test('migrationV5 creates uv_scans with the contracted columns', () => {
    const m = dbInit.migrationV5;
    expect(m).toContain('CREATE TABLE IF NOT EXISTS uv_scans');
    expect(m).toContain('id TEXT PRIMARY KEY');
    expect(m).toContain('created_at TIMESTAMPTZ DEFAULT NOW()');
    expect(m).toContain('overall JSONB');
    expect(m).toContain('regions JSONB');
    expect(m).toContain('asymmetry JSONB');
    expect(m).toContain('heatmap JSONB');
    expect(m).toContain('screener JSONB');
    expect(m).toContain('ip_hash TEXT');
    expect(m).toContain('claimed BOOLEAN DEFAULT FALSE');
  });

  test('migrationV5 creates uv_leads with the contracted columns + FK', () => {
    const m = dbInit.migrationV5;
    expect(m).toContain('CREATE TABLE IF NOT EXISTS uv_leads');
    expect(m).toContain('email TEXT UNIQUE');
    expect(m).toContain('report_token TEXT UNIQUE');
    expect(m).toContain('scan_id TEXT REFERENCES uv_scans(id)');
    expect(m).toContain("status TEXT DEFAULT 'lead'");
    expect(m).toContain('clerk_user_id TEXT');
    expect(m).toContain('loops_synced BOOLEAN DEFAULT FALSE');
    expect(m).toContain('converted_at TIMESTAMPTZ');
  });

  test('migrationV5 is idempotent and indexes uv_leads(email) + (report_token)', () => {
    const m = dbInit.migrationV5;
    expect(m).toContain('CREATE INDEX IF NOT EXISTS idx_uv_leads_email ON uv_leads(email)');
    expect(m).toContain('CREATE INDEX IF NOT EXISTS idx_uv_leads_report_token ON uv_leads(report_token)');
    // Every DDL statement must be guarded so re-running the migration is safe.
    expect(m).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(m).not.toMatch(/CREATE INDEX (?!IF NOT EXISTS)/);
  });

  test('initSchema applies UV attribution migration and cutover gate against the provided pool', async () => {
    const schemaRows = [
      ...['created_at', 'posthog_distinct_id', 'acquisition_source', 'acquisition_medium', 'attribution_model', 'attribution_quality', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'google_click_id_present', 'referrer_host', 'landing_path', 'form_placement']
        .map((column_name) => ({ table_name: 'uv_leads', column_name })),
      ...['created_at', 'posthog_account_created_uuid', 'posthog_account_created_timestamp', 'posthog_account_created_sent_at', 'posthog_account_created_status', 'posthog_account_created_properties', 'posthog_account_created_waitlist_match', 'posthog_account_created_delivery_claimed_at', 'posthog_account_created_retry_after']
        .map((column_name) => ({ table_name: 'user_profiles', column_name })),
    ];
    const pool = {
      query: jest.fn(async (sql) => (/information_schema\.columns/.test(sql)
        ? { rows: schemaRows }
        : { rows: [], rowCount: 0 })),
    };
    const previousCutover = process.env.GLOWLYTICS_CUTOVER_AT;
    process.env.GLOWLYTICS_CUTOVER_AT = '2026-07-20T00:00:00.000Z';
    await dbInit.initSchema(pool);
    if (previousCutover === undefined) delete process.env.GLOWLYTICS_CUTOVER_AT;
    else process.env.GLOWLYTICS_CUTOVER_AT = previousCutover;
    const ran = pool.query.mock.calls.map((c) => c[0]);
    expect(ran).toContain(dbInit.migrationV5);
    expect(ran).toContain(dbInit.migrationV7);
    expect(ran).toContain(dbInit.migrationV8);
    expect(ran.some((sql) => /information_schema\.columns/.test(sql))).toBe(true);
    expect(ran.some((sql) => /historical_backfill_owned/.test(sql))).toBe(true);
  });

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
    expect(m).toContain('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_delivery_claimed_at TIMESTAMPTZ');
    expect(m).toContain('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS posthog_account_created_retry_after TIMESTAMPTZ');
    expect(m).not.toContain('UPDATE user_profiles');
    expect(m).toContain('CREATE INDEX IF NOT EXISTS idx_user_profiles_posthog_account_created_pending');
    expect(typeof dbInit.markPreCutoverProfilesHistorical).toBe('function');
  });

  test('migrationV8 scrubs retired browser identities and their index', () => {
    expect(dbInit.migrationV8).toContain('DROP INDEX IF EXISTS idx_uv_leads_posthog_distinct_id');
    expect(dbInit.migrationV8).toContain('SET posthog_distinct_id = NULL');
    expect(dbInit.migrationV8).toContain('WHERE posthog_distinct_id IS NOT NULL');
  });

  test('pre-cutover ownership marking is rerunnable and never consumes a forward reconciliation row', async () => {
    const pool = statefulProfilePool([
      { user_id: 'old', created_at: '2026-07-19T00:00:00Z', posthog_account_created_status: 'reconciliation_pending' },
      { user_id: 'exact', created_at: '2026-07-20T00:00:00Z', posthog_account_created_status: 'reconciliation_pending' },
      { user_id: 'forward', created_at: '2026-07-21T00:00:00Z', posthog_account_created_status: 'reconciliation_pending' },
    ]);
    await dbInit.markPreCutoverProfilesHistorical(pool, '2026-07-20T00:00:00Z');
    await dbInit.markPreCutoverProfilesHistorical(pool, '2026-07-20T00:00:00Z');
    expect(profileState(pool, 'old').posthog_account_created_status).toBe('historical_backfill_owned');
    expect(profileState(pool, 'forward').posthog_account_created_status).toBe('reconciliation_pending');
    expect(profileState(pool, 'exact').posthog_account_created_status).toBe('reconciliation_pending');
    expect(pool.query.mock.calls[0][0]).toContain("AT TIME ZONE 'UTC'");
  });
});

describe('insertScan', () => {
  const scan = {
    id: 'scan_abc',
    overall: { sunDamageScore: 72, severity: 'high', confidence: 0.8 },
    regions: [{ id: 'forehead', score: 50 }],
    asymmetry: { score: 30, dominantSide: 'left' },
    heatmap: { cols: 4, rows: 4, cells: [0.1, 0.2] },
    screener: { ok: true, canProceed: true },
    source: 'landing',
    ip_hash: 'deadbeef',
  };

  test('inserts into uv_scans and JSON.stringifies the JSONB columns', async () => {
    const row = { id: 'scan_abc', claimed: false };
    const pool = fakePool([row]);
    const out = await insertScan(pool, scan);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO uv_scans'),
      expect.arrayContaining([
        'scan_abc',
        JSON.stringify(scan.overall),
        JSON.stringify(scan.regions),
        JSON.stringify(scan.asymmetry),
        JSON.stringify(scan.heatmap),
        JSON.stringify(scan.screener),
        'landing',
        'deadbeef',
      ])
    );
    expect(pool.query.mock.calls[0][0]).toContain('RETURNING *');
    expect(out).toBe(row);
  });
});

describe('getScan', () => {
  test('selects by id and returns the row', async () => {
    const row = { id: 'scan_abc' };
    const pool = fakePool([row]);
    const out = await getScan(pool, 'scan_abc');

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM uv_scans'),
      expect.arrayContaining(['scan_abc'])
    );
    expect(pool.query.mock.calls[0][0]).toContain('WHERE id = $1');
    expect(out).toBe(row);
  });

  test('returns null when not found', async () => {
    const pool = fakePool([]);
    expect(await getScan(pool, 'missing')).toBeNull();
  });
});

describe('claimScan', () => {
  test('sets claimed = TRUE for the scan id and returns the row', async () => {
    const row = { id: 'scan_abc', claimed: true };
    const pool = fakePool([row]);
    const out = await claimScan(pool, 'scan_abc');

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE uv_scans'),
      expect.arrayContaining(['scan_abc'])
    );
    expect(pool.query.mock.calls[0][0]).toContain('claimed = TRUE');
    expect(out).toBe(row);
  });

  test('returns null when no scan matched', async () => {
    const pool = fakePool([]);
    expect(await claimScan(pool, 'missing')).toBeNull();
  });
});

describe('upsertLead', () => {
  const lead = {
    id: 'lead_1',
    email: 'a@b.com',
    report_token: 'tok_xyz',
    scan_id: 'scan_abc',
    source: 'landing',
  };

  test('inserts into uv_leads with ON CONFLICT(email) and returns the row', async () => {
    const row = { id: 'lead_1', email: 'a@b.com', report_token: 'tok_xyz' };
    const pool = fakePool([row]);
    const out = await upsertLead(pool, lead);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO uv_leads'),
      expect.arrayContaining(['lead_1', 'a@b.com', 'tok_xyz', 'scan_abc', 'landing'])
    );
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT (email) DO UPDATE');
    expect(sql).toContain('RETURNING *');
    // Idempotent: must NOT overwrite an existing report_token on conflict.
    expect(sql).not.toMatch(/SET[\s\S]*report_token\s*=/);
    expect(out).toBe(row);
    expect(out.report_token).toBe('tok_xyz');
  });

  test('upsertLead stores first-touch fields without browser identity and does not overwrite them on duplicate email', async () => {
    const attributedLead = {
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

    await upsertLead(pool, attributedLead);

    const sql = pool.query.mock.calls[0][0];
    expect(sql).not.toContain('posthog_distinct_id');
    expect(sql).not.toMatch(/SET[\s\S]*acquisition_source\s*=/);
    expect(pool.query.mock.calls[0][1]).toEqual(expect.arrayContaining(['google', 'paid_search', 'first_touch', 'utm', true, '/uv-scan']));
    expect(pool.query.mock.calls[0][1]).not.toContain('browser-1');
  });
});

describe('getLeadByEmail / getLeadByToken', () => {
  test('getLeadByEmail selects by email', async () => {
    const row = { id: 'lead_1', email: 'a@b.com' };
    const pool = fakePool([row]);
    const out = await getLeadByEmail(pool, 'a@b.com');

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM uv_leads'),
      expect.arrayContaining(['a@b.com'])
    );
    expect(pool.query.mock.calls[0][0]).toContain('WHERE email = $1');
    expect(out).toBe(row);
  });

  test('getLeadByEmail returns null when absent', async () => {
    const pool = fakePool([]);
    expect(await getLeadByEmail(pool, 'nobody@b.com')).toBeNull();
  });

  test('getLeadByToken selects by report_token', async () => {
    const row = { id: 'lead_1', report_token: 'tok_xyz' };
    const pool = fakePool([row]);
    const out = await getLeadByToken(pool, 'tok_xyz');

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM uv_leads'),
      expect.arrayContaining(['tok_xyz'])
    );
    expect(pool.query.mock.calls[0][0]).toContain('WHERE report_token = $1');
    expect(out).toBe(row);
  });

  test('getLeadByToken returns null when absent', async () => {
    const pool = fakePool([]);
    expect(await getLeadByToken(pool, 'nope')).toBeNull();
  });
});

describe('findCustomerLead', () => {
  test('selects the earliest lead already linked to the Clerk user', async () => {
    const row = { id: 'lead_1', clerk_user_id: 'user_2x' };
    const pool = fakePool([row]);
    const out = await findCustomerLead(pool, 'user_2x');

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT *'),
      expect.arrayContaining(['user_2x'])
    );
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('WHERE clerk_user_id = $1');
    expect(sql).toContain('ORDER BY created_at, id');
    expect(out).toBe(row);
  });
});

describe('markCustomer', () => {
  test('promotes to customer, guarding on status != customer, and returns the row', async () => {
    const row = { id: 'lead_1', status: 'customer', clerk_user_id: 'user_2x' };
    const pool = fakePool([row]);
    const out = await markCustomer(pool, { email: 'a@b.com', clerk_user_id: 'user_2x' });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE uv_leads'),
      expect.arrayContaining(['a@b.com', 'user_2x'])
    );
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain("status = 'customer'");
    expect(sql).toContain('converted_at = NOW()');
    expect(sql).toContain("status != 'customer'");
    expect(out).toBe(row);
  });

  test('returns null when no eligible lead matched (already a customer / unknown email)', async () => {
    const pool = fakePool([]);
    expect(await markCustomer(pool, { email: 'a@b.com', clerk_user_id: 'user_2x' })).toBeNull();
  });
});
