const { Pool } = require('pg');
const { poolSsl } = require('../db-ssl');
const { attachPoolErrorHandler } = require('../pg-resilience');

// Shared pool for callers that do not inject one (e.g. standalone use). The
// query helpers below take the pool as their FIRST argument so app.js can pass
// its own shared pool and tests can inject a fake { query } stub.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/glowlytics',
  ssl: poolSsl(),
});
attachPoolErrorHandler(pool, 'uv');

// Persist a completed UV scan. JSONB columns are JSON.stringify'd so the pg
// driver sends valid jsonb text rather than '[object Object]'.
async function insertScan(pool, scan) {
  const { rows } = await pool.query(
    `INSERT INTO uv_scans (id, overall, regions, asymmetry, heatmap, screener, source, ip_hash, claim_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      scan.id,
      JSON.stringify(scan.overall),
      JSON.stringify(scan.regions),
      JSON.stringify(scan.asymmetry),
      JSON.stringify(scan.heatmap),
      JSON.stringify(scan.screener),
      scan.source,
      scan.ip_hash,
      scan.claim_token ?? null,
    ]
  );
  return rows[0];
}

async function getScan(pool, id) {
  const { rows } = await pool.query(
    `SELECT * FROM uv_scans WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Mark a scan as claimed once its result has been emailed to a lead.
async function claimScan(pool, id) {
  const { rows } = await pool.query(
    `UPDATE uv_scans SET claimed = TRUE WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

// Idempotent on email: a repeat submission for the same email keeps its
// original report_token AND its original scan_id (both omitted from the UPDATE
// SET). Pinning scan_id is the B1 IDOR fix — an existing lead can never be
// re-pointed to a different scan, so report URLs stay stable and a known
// scan_id alone cannot hijack another email's lead. Only `source` is refreshed.
async function upsertLead(pool, { id, email, report_token, scan_id, source }) {
  const { rows } = await pool.query(
    `INSERT INTO uv_leads (id, email, report_token, scan_id, source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       source = COALESCE(EXCLUDED.source, uv_leads.source)
     RETURNING *`,
    [id, email, report_token, scan_id, source]
  );
  return rows[0];
}

async function getLeadByEmail(pool, email) {
  const { rows } = await pool.query(
    `SELECT * FROM uv_leads WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
}

async function getLeadByToken(pool, token) {
  const { rows } = await pool.query(
    `SELECT * FROM uv_leads WHERE report_token = $1`,
    [token]
  );
  return rows[0] || null;
}

// Promote a lead to customer on Clerk signup. Guards on status != 'customer'
// so the transition (and the Loops `became_customer` event it gates) fires at
// most once. Returns the updated row, or null when no eligible lead matched.
async function markCustomer(pool, { email, clerk_user_id }) {
  const { rows } = await pool.query(
    `UPDATE uv_leads
     SET status = 'customer', clerk_user_id = $2, converted_at = NOW()
     WHERE email = $1 AND status != 'customer'
     RETURNING *`,
    [email, clerk_user_id]
  );
  return rows[0] || null;
}

module.exports = {
  pool,
  insertScan,
  getScan,
  claimScan,
  upsertLead,
  getLeadByEmail,
  getLeadByToken,
  markCustomer,
};
