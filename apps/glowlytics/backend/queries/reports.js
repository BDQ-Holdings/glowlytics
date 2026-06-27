const { Pool } = require('pg');
const { poolSsl } = require('../db-ssl');
const { attachPoolErrorHandler } = require('../pg-resilience');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/glowlytics',
  ssl: poolSsl(),
});
attachPoolErrorHandler(pool, 'reports');

function parseMaybeJson(v) {
  if (v == null) return null;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

async function getReportForScan(userId, scanId) {
  const { rows } = await pool.query(
    `SELECT mo.daily_id, mo.generated_insights, mo.rag_recommendations
     FROM model_outputs mo
     JOIN daily_records dr ON mo.daily_id = dr.daily_id
     WHERE dr.user_id = $1 AND mo.daily_id = $2
     LIMIT 1`,
    [userId, scanId]
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  const insights = parseMaybeJson(row.generated_insights);
  const recommendations = parseMaybeJson(row.rag_recommendations) || [];
  const citations = recommendations
    .filter((r) => r && r.source)
    .map((r) => ({ source: r.source, snippet: r.snippet || r.rationale || null }));

  return {
    scanId: row.daily_id,
    narrative: insights ? insights.narrative || null : null,
    recommendations,
    citations,
  };
}

module.exports = { getReportForScan };
