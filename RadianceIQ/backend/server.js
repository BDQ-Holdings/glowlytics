const app = require('./app');
const { Pool } = require('pg');
const { initSchema } = require('./db-init');
const signalModels = require('./signal-models');

const PORT = process.env.PORT || 3001;

// Auto-initialize database tables on startup using shared schema from db-init.js
async function initDB() {
  if (!process.env.DATABASE_URL) {
    console.log('  [DB] No DATABASE_URL — skipping schema init');
    return;
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await initSchema(pool);
    console.log('  [DB] Schema initialized');
  } catch (err) {
    console.error('  [DB] Schema init error:', err.message);
  } finally {
    await pool.end();
  }
}

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Glowlytics API running on port ${PORT}`);
  if (!process.env.CLERK_ISSUER_URL) {
    console.log('  WARNING: CLERK_ISSUER_URL not set -- JWT verification disabled (dev mode)');
  }
  await initDB();
  await signalModels.initModels();
});
