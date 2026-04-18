const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/glowlytics',
  ...(process.env.DATABASE_URL ? { ssl: { rejectUnauthorized: false } } : {}),
});

function scheduleIncludes(usage, slot) {
  if (!usage) return true;
  const u = String(usage).toUpperCase();
  if (u === 'BOTH') return true;
  return u.includes(slot);
}

async function getCurrentRoutine(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM product_catalog
     WHERE user_id = $1 AND end_date IS NULL
     ORDER BY start_date`,
    [userId]
  );

  const am = rows.filter((p) => scheduleIncludes(p.usage_schedule, 'AM'));
  const pm = rows.filter((p) => scheduleIncludes(p.usage_schedule, 'PM'));

  return { am, pm, conflicts: [] };
}

module.exports = { getCurrentRoutine };
