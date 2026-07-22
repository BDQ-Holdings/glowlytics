/**
 * One shared pg Pool for the whole backend (app routes + query modules).
 *
 * Previously app.js and queries/scans.js each constructed their own Pool, so a
 * single process held two independent connection sets against Railway
 * Postgres's connection cap. This module owns the one pool and callers
 * `require('./db-pool').getPool()` it.
 *
 * Construction is lazy so `require('./db-pool')` stays side-effect-free
 * (db-init, unit tests). `require('pg')` happens inside the getter for the
 * same reason the old per-module pools worked under test: jest's
 * `jest.mock('pg')` intercepts this exact require, so route tests keep
 * receiving their mock pool.
 */
const { poolSsl } = require('./db-ssl');
const { attachPoolErrorHandler } = require('./pg-resilience');

let pool = null;

function getPool() {
  if (!pool) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/glowlytics',
      ssl: poolSsl(),
      max: parseInt(process.env.PG_POOL_MAX || '10', 10),
      // Fail fast when the DB is unreachable instead of queueing checkouts
      // forever (every request handler awaits this pool).
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      // Server-side per-statement cap: no query in this API legitimately runs
      // 15s; a wedged one must not hold a pooled connection hostage.
      statement_timeout: 15000,
    });
    attachPoolErrorHandler(pool, 'shared');
  }
  return pool;
}

module.exports = { getPool };
