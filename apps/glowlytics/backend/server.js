const app = require('./app');
const { Pool } = require('pg');
const { initSchema } = require('./db-init');
const signalModels = require('./signal-models');
const { poolSsl } = require('./db-ssl');

const PORT = process.env.PORT || 3001;

// Auto-initialize database tables on startup using shared schema from db-init.js
async function initDB() {
  if (!process.env.DATABASE_URL) {
    console.log('  [DB] No DATABASE_URL — skipping schema init');
    return;
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: poolSsl(),
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

// A single unhandled rejection from a background task (a model load, a slow DB,
// a flaky outbound call) must NOT take the whole process down and 502 every
// endpoint. Log loudly (Railway surfaces it) but keep the API serving.
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled promise rejection (continuing):', reason);
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Glowlytics API running on port ${PORT}`);
  if (!process.env.CLERK_ISSUER_URL) {
    console.log('  WARNING: CLERK_ISSUER_URL not set -- JWT verification disabled (dev mode)');
  }
  // Best-effort startup: schema init + signal models are optional for core API
  // availability. A failure here (missing model artifacts on the deploy — the
  // postinstall download is best-effort — or a slow DB) must not crash the
  // server and 502 every request. Core auth/users/scans/products keep working.
  try {
    await initDB();
  } catch (err) {
    console.error('  [DB] init failed (continuing):', err?.message ?? err);
  }
  try {
    await signalModels.initModels();
  } catch (err) {
    console.error('  [models] init failed (continuing, signal features degraded):', err?.message ?? err);
  }
});
