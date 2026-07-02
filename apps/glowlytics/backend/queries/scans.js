// Shared process-wide pool (see ../db-pool.js) — this module previously built
// its own Pool, doubling idle connections against Railway Postgres.
const pool = require('../db-pool').getPool();

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

// Inclusive on both ends. startDate/endDate are 'YYYY-MM-DD' strings.
// Used by tools that need calendar-anchored windows (e.g. summarize_month for
// arbitrary past months) where the trailing-N-days `days` cap of getScanHistory
// would silently truncate older months.
async function getScansInDateRange(userId, startDate, endDate, { limit = 200 } = {}) {
  const l = clamp(parseInt(limit, 10) || 200, 1, 1000);
  const { rows } = await pool.query(
    `SELECT mo.*, dr.date FROM model_outputs mo
     JOIN daily_records dr ON mo.daily_id = dr.daily_id
     WHERE dr.user_id = $1
       AND dr.date >= $2::date
       AND dr.date <= $3::date
     ORDER BY dr.date DESC
     LIMIT $4`,
    [userId, startDate, endDate, l]
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

const SIGNAL_NAMES = ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'];
const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const FLAT_BAND = 1;

async function computeSignalTrend(userId, signal, period) {
  if (!SIGNAL_NAMES.includes(signal)) {
    throw new Error(`Unknown signal: ${signal}`);
  }
  const days = PERIOD_DAYS[period];
  if (!days) {
    throw new Error(`Unknown period: ${period}`);
  }

  const { rows } = await pool.query(
    `SELECT dr.date, mo.signal_scores FROM model_outputs mo
     JOIN daily_records dr ON mo.daily_id = dr.daily_id
     WHERE dr.user_id = $1 AND dr.date >= CURRENT_DATE - $2::integer
     ORDER BY dr.date ASC`,
    [userId, days]
  );

  const series = rows
    .map((r) => ({ date: r.date, value: r.signal_scores ? r.signal_scores[signal] : undefined }))
    .filter((p) => typeof p.value === 'number');

  if (series.length === 0) {
    return { series: [], delta: null, direction: 'flat' };
  }

  const delta = series[series.length - 1].value - series[0].value;
  let direction = 'flat';
  if (delta > FLAT_BAND) direction = 'up';
  else if (delta < -FLAT_BAND) direction = 'down';

  return { series, delta, direction };
}

async function compareScans(userId, { a, b }) {
  const [scanA, scanB] = await Promise.all([
    getScanById(userId, a),
    getScanById(userId, b),
  ]);
  if (!scanA || !scanB) {
    throw new Error('One or both scans not found for this user');
  }

  const sA = scanA.signal_scores || {};
  const sB = scanB.signal_scores || {};
  const signalDeltas = {};
  for (const name of SIGNAL_NAMES) {
    if (typeof sA[name] === 'number' && typeof sB[name] === 'number') {
      signalDeltas[name] = sB[name] - sA[name];
    }
  }
  return { a: scanA, b: scanB, signalDeltas };
}

module.exports = {
  getLatestScan,
  getScanHistory,
  getScansInDateRange,
  getScanById,
  computeSignalTrend,
  compareScans,
  SIGNAL_NAMES,
};
