/**
 * Unit tests for poolSsl() — Postgres TLS option selection (BC-002).
 */

const ORIGINAL_ENV = { ...process.env };

// Re-require in isolation so the module-level warn-once guard resets per test.
function freshPoolSsl() {
  let mod;
  jest.isolateModules(() => {
    mod = require('../db-ssl');
  });
  return mod.poolSsl;
}

beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_CA_CERT;
  delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
});

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('poolSsl', () => {
  test('returns undefined when DATABASE_URL is unset (local dev, no TLS)', () => {
    const poolSsl = freshPoolSsl();
    expect(poolSsl()).toBeUndefined();
  });

  test('verifies against the provided CA when DATABASE_CA_CERT is set', () => {
    process.env.DATABASE_URL = 'postgres://u:p@host:5432/db';
    process.env.DATABASE_CA_CERT = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----';
    const poolSsl = freshPoolSsl();
    expect(poolSsl()).toEqual({
      rejectUnauthorized: true,
      ca: process.env.DATABASE_CA_CERT,
    });
  });

  test('verifies against system CAs when DATABASE_SSL_REJECT_UNAUTHORIZED=true and no CA is given', () => {
    process.env.DATABASE_URL = 'postgres://u:p@host:5432/db';
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = 'true';
    const poolSsl = freshPoolSsl();
    expect(poolSsl()).toEqual({ rejectUnauthorized: true });
  });

  test('falls back to insecure TLS and warns exactly once when no CA / flag is provided', () => {
    process.env.DATABASE_URL = 'postgres://u:p@host:5432/db';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const poolSsl = freshPoolSsl();
    expect(poolSsl()).toEqual({ rejectUnauthorized: false });
    expect(poolSsl()).toEqual({ rejectUnauthorized: false });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[SECURITY] DB TLS cert verification disabled; set DATABASE_CA_CERT to enable',
    );
    warnSpy.mockRestore();
  });

  test('prefers CA verification over the reject-unauthorized flag when both are set', () => {
    process.env.DATABASE_URL = 'postgres://u:p@host:5432/db';
    process.env.DATABASE_CA_CERT = 'ca-pem';
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = 'true';
    const poolSsl = freshPoolSsl();
    expect(poolSsl()).toEqual({ rejectUnauthorized: true, ca: 'ca-pem' });
  });
});
