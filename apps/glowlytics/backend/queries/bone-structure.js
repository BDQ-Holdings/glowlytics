/**
 * Bone-structure persistence queries — kept separate from the MCP tool so
 * tests can mock at module boundary (same convention as queries/scans.js).
 */
const { Pool } = require('pg');
const { poolSsl } = require('../db-ssl');
const { attachPoolErrorHandler } = require('../pg-resilience');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/glowlytics',
  ssl: poolSsl(),
});
attachPoolErrorHandler(pool, 'bone-structure');

const FLAT_BAND = 1;
const PERIOD_DAYS = { '30d': 30, '90d': 90, '180d': 180, '365d': 365 };

async function getLatestBoneStructure(userId) {
  const { rows } = await pool.query(
    `SELECT mo.daily_id, mo.bone_structure, dr.date FROM model_outputs mo
     JOIN daily_records dr ON mo.daily_id = dr.daily_id
     WHERE dr.user_id = $1 AND mo.bone_structure IS NOT NULL
     ORDER BY dr.date DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function getBoneStructureForScan(userId, scanId) {
  const { rows } = await pool.query(
    `SELECT mo.daily_id, mo.bone_structure, dr.date FROM model_outputs mo
     JOIN daily_records dr ON mo.daily_id = dr.daily_id
     WHERE dr.user_id = $1 AND mo.daily_id = $2
     LIMIT 1`,
    [userId, scanId]
  );
  return rows[0] || null;
}

async function computeHarmonyTrend(userId, period) {
  const days = PERIOD_DAYS[period];
  if (!days) throw new Error(`Unknown period: ${period}`);

  const { rows } = await pool.query(
    `SELECT dr.date, mo.bone_structure FROM model_outputs mo
     JOIN daily_records dr ON mo.daily_id = dr.daily_id
     WHERE dr.user_id = $1
       AND dr.date >= CURRENT_DATE - $2::integer
       AND mo.bone_structure IS NOT NULL
     ORDER BY dr.date ASC`,
    [userId, days]
  );

  const series = rows
    .map((r) => {
      const bs = typeof r.bone_structure === 'string' ? JSON.parse(r.bone_structure) : r.bone_structure;
      return { date: r.date, value: bs?.harmony };
    })
    .filter((p) => Number.isFinite(p.value));

  if (series.length === 0) return { series: [], delta: null, direction: 'flat' };

  const delta = series[series.length - 1].value - series[0].value;
  const direction = delta > FLAT_BAND ? 'up' : delta < -FLAT_BAND ? 'down' : 'flat';
  return { series, delta, direction };
}

module.exports = {
  getLatestBoneStructure,
  getBoneStructureForScan,
  computeHarmonyTrend,
};
