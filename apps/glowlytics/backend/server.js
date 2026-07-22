const app = require('./app');
const { Pool } = require('pg');
const { initSchema } = require('./db-init');
const signalModels = require('./signal-models');
const { poolSsl } = require('./db-ssl');
const { attachPoolErrorHandler } = require('./pg-resilience');

const PORT = process.env.PORT || 3001;

async function initDB() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const migrationPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: poolSsl(),
  });
  attachPoolErrorHandler(migrationPool, 'server-init');
  try {
    await initSchema(migrationPool);
  } finally {
    await migrationPool.end();
  }
}

// A single unhandled rejection from a background task (a model load, a slow DB,
// a flaky outbound call) must NOT take the whole process down and 502 every
// endpoint. Log loudly (Railway surfaces it) but keep the API serving.
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled promise rejection (continuing):', reason?.message ?? reason);
});

// Same intent as the unhandledRejection guard above, for synchronous throws
// escaping to the top level (a background timer callback, an event emitter).
// Log loudly and keep serving rather than letting one stray throw 502 the API.
process.on('uncaughtException', (e) => {
  console.error('[server] uncaughtException (continuing):', e?.message ?? e);
});

async function startServer() {
  await initDB();
  const cutoverMs = Date.parse(process.env.GLOWLYTICS_CUTOVER_AT || '');
  if (!Number.isFinite(cutoverMs)) throw new Error('GLOWLYTICS_CUTOVER_AT missing or invalid');
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Glowlytics API running on port ${PORT}`);
    if (!process.env.CLERK_ISSUER_URL) {
      console.log('  WARNING: CLERK_ISSUER_URL not set -- JWT verification disabled (dev mode)');
    }
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
  if (retryTimer && typeof retryTimer.unref === 'function') retryTimer.unref();
  if (server && typeof server.close === 'function') {
    const originalClose = server.close.bind(server);
    server.close = (...args) => {
      clearInterval(retryTimer);
      return originalClose(...args);
    };
  }
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
