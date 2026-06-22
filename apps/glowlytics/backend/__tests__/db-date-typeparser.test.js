/**
 * FI-015: Postgres DATE columns (OID 1082) must come back as plain
 * 'YYYY-MM-DD' strings, not JS Date objects.
 *
 * Without a custom type parser, pg parses a DATE into a Date object that
 * JSON-serializes to an ISO midnight timestamp (e.g. '2026-06-20T00:00:00.000Z',
 * and worse, TZ-shifted to a *different day*). The mobile client keys daily
 * records by plain 'YYYY-MM-DD' strings (localDateStr), so those values never
 * match — breaking streaks, "scanned today", and day-story record attachment.
 *
 * Requiring db-init must register a process-wide DATE parser that returns the
 * raw string, while leaving TIMESTAMP/TIMESTAMPTZ (OIDs 1114/1184) untouched.
 */

const { types } = require('pg');

// Side effect: requiring db-init registers the global DATE type parser on the
// shared pg-types registry (before its Pool is created). Creating the Pool does
// not open a connection, so this is safe in a unit test with no live DB.
require('../db-init');

const DATE_OID = 1082;
const TIMESTAMP_OID = 1114;
const TIMESTAMPTZ_OID = 1184;

describe('pg DATE (OID 1082) type parser (FI-015)', () => {
  test('returns the raw YYYY-MM-DD string instead of a Date', () => {
    const parse = types.getTypeParser(DATE_OID);
    const out = parse('2026-06-20');
    expect(typeof out).toBe('string');
    expect(out).toBe('2026-06-20');
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('does not coerce DATE values into ISO midnight / TZ-shifted timestamps', () => {
    const parse = types.getTypeParser(DATE_OID);
    // The pre-fix default produced a Date -> ISO string with a 'T..:..:..'
    // component (and could even land on the previous calendar day). Guard
    // against any regression to that behaviour.
    const out = parse('2026-01-01');
    expect(out).toBe('2026-01-01');
    expect(out).not.toMatch(/T\d{2}:\d{2}:\d{2}/);
  });

  test('leaves TIMESTAMP (1114) and TIMESTAMPTZ (1184) parsers untouched', () => {
    // Default pg parsers for these OIDs return JS Date objects; the DATE fix
    // must not touch them.
    expect(types.getTypeParser(TIMESTAMP_OID)('2026-06-20 12:34:56')).toBeInstanceOf(Date);
    expect(types.getTypeParser(TIMESTAMPTZ_OID)('2026-06-20 12:34:56+00')).toBeInstanceOf(Date);
  });
});
