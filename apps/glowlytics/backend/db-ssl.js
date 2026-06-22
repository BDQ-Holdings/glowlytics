/**
 * Centralized Postgres TLS (SSL) configuration (BC-002).
 *
 * Returns the `ssl` option object for `pg.Pool`:
 *   - DATABASE_URL unset                          -> undefined (local dev, no TLS)
 *   - DATABASE_CA_CERT set                        -> verify against the provided CA (secure)
 *   - DATABASE_SSL_REJECT_UNAUTHORIZED === 'true' -> verify against system CAs
 *   - otherwise                                   -> TLS without cert verification
 *                                                    (insecure; warns once)
 *
 * The insecure fallback preserves the current Railway behaviour (managed
 * Postgres presents a cert that the default trust store doesn't chain to)
 * without breaking the live deploy. Provision DATABASE_CA_CERT with the
 * provider CA — or set DATABASE_SSL_REJECT_UNAUTHORIZED=true when the system
 * trust store already covers the cert — to harden.
 */
let warned = false;

function poolSsl() {
  if (!process.env.DATABASE_URL) {
    return undefined;
  }
  if (process.env.DATABASE_CA_CERT) {
    return { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT };
  }
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true') {
    return { rejectUnauthorized: true };
  }
  if (!warned) {
    warned = true;
    console.warn('[SECURITY] DB TLS cert verification disabled; set DATABASE_CA_CERT to enable');
  }
  return { rejectUnauthorized: false };
}

module.exports = { poolSsl };
