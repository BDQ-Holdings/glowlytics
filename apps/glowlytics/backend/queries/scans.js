const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/glowlytics',
  ...(process.env.DATABASE_URL ? { ssl: { rejectUnauthorized: false } } : {}),
});

const MAX_RANGE = 90;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function getLatestScan(userId) {
  const { rows } = await pool.query(
    `SELECT mo.*, dr.date FROM model_outputs mo
     JOIN daily_records dr ON mo.daily_id = dr.daily_id
     WHERE dr.user_id = $1
     ORDER BY dr.date DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function getScanHistory(userId, { days = 30, limit = 30 } = {}) {
  const d = clamp(parseInt(days, 10) || 30, 1, MAX_RANGE);
  const l = clamp(parseInt(limit, 10) || 30, 1, MAX_RANGE);
  const { rows } = await pool.query(
    `SELECT mo.*, dr.date FROM model_outputs mo
     JOIN daily_records dr ON mo.daily_id = dr.daily_id
     WHERE dr.user_id = $1 AND dr.date >= CURRENT_DATE - $2::integer
     ORDER BY dr.date DESC
     LIMIT $3`,
    [userId, d, l]
  );
  return rows;
}

async function getScanById(userId, scanId) {
  const { rows } = await pool.query(
    `SELECT mo.*, dr.date FROM model_outputs mo
     JOIN daily_records dr ON mo.daily_id = dr.daily_id
     WHERE dr.user_id = $1 AND mo.daily_id = $2
     LIMIT 1`,
    [userId, scanId]
  );
  return rows[0] || null;
}

module.exports = { getLatestScan, getScanHistory, getScanById };
