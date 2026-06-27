/**
 * Loops client tests — loops.js
 *
 * Loops is a best-effort marketing side effect: callers fire it from user-facing
 * flows (lead capture, signup) and must never be broken by it. These tests pin
 * the gate (no key = no-op), the request shape, and the error-swallowing
 * contract. global.fetch is mocked so no real network calls happen; env is
 * set/unset per test since loops.js reads it at call time.
 */

const loops = require('../loops');

describe('loops client', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    delete process.env.LOOPS_API_KEY;
    process.env.LOOPS_API_BASE = 'https://loops.test/api/v1';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
    delete process.env.LOOPS_API_KEY;
    delete process.env.LOOPS_API_BASE;
  });

  // (1) disabled -> no-op
  test('disabled (no LOOPS_API_KEY) returns skipped and never calls fetch', async () => {
    expect(loops.loopsEnabled()).toBe(false);

    const sent = await loops.sendEvent('user@example.com', 'uv_report_requested');
    const updated = await loops.updateContact('user@example.com', { firstName: 'Sam' });

    expect(sent).toEqual({ skipped: true });
    expect(updated).toEqual({ skipped: true });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // (2) enabled sendEvent -> correct URL, header, body
  test('enabled sendEvent posts to events/send with Bearer header and full body', async () => {
    process.env.LOOPS_API_KEY = 'test-key';
    global.fetch.mockResolvedValue({ ok: true, status: 200 });

    const res = await loops.sendEvent('user@example.com', 'uv_report_requested', {
      eventProperties: { reportToken: 'tok_123' },
      contactProperties: { source: 'uv-scan', uvSeverity: 'high', uvSunDamageScore: 72 },
    });

    expect(res).toEqual({ ok: true, status: 200 });
    expect(loops.loopsEnabled()).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://loops.test/api/v1/events/send');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer test-key');
    expect(opts.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(opts.body);
    expect(body.email).toBe('user@example.com');
    expect(body.eventName).toBe('uv_report_requested');
    expect(body.eventProperties).toEqual({ reportToken: 'tok_123' });
    expect(body.contactProperties).toEqual({
      source: 'uv-scan',
      uvSeverity: 'high',
      uvSunDamageScore: 72,
    });
  });

  test('sendEvent omits undefined optional property bags', async () => {
    process.env.LOOPS_API_KEY = 'test-key';
    global.fetch.mockResolvedValue({ ok: true, status: 200 });

    await loops.sendEvent('user@example.com', 'became_customer');

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual({ email: 'user@example.com', eventName: 'became_customer' });
    expect('eventProperties' in body).toBe(false);
    expect('contactProperties' in body).toBe(false);
  });

  // (3) updateContact body shape
  test('updateContact posts to contacts/update with { email, ...props }', async () => {
    process.env.LOOPS_API_KEY = 'test-key';
    global.fetch.mockResolvedValue({ ok: true, status: 200 });

    const res = await loops.updateContact('user@example.com', {
      firstName: 'Sam',
      uvSeverity: 'moderate',
    });

    expect(res).toEqual({ ok: true, status: 200 });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://loops.test/api/v1/contacts/update');
    expect(opts.headers.Authorization).toBe('Bearer test-key');

    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      email: 'user@example.com',
      firstName: 'Sam',
      uvSeverity: 'moderate',
    });
  });

  // (4) fetch rejects -> swallowed, not thrown
  test('network error is swallowed and returned as ok:false', async () => {
    process.env.LOOPS_API_KEY = 'test-key';
    global.fetch.mockRejectedValue(new Error('network down'));

    const res = await loops.sendEvent('user@example.com', 'uv_report_requested');

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/network down/);
  });

  // (5) non-2xx -> ok:false with status
  test('non-2xx response returns ok:false with the status code', async () => {
    process.env.LOOPS_API_KEY = 'test-key';
    global.fetch.mockResolvedValue({ ok: false, status: 429 });

    const res = await loops.sendEvent('user@example.com', 'uv_report_requested');

    expect(res.ok).toBe(false);
    expect(res.status).toBe(429);
  });

  // (6) invalid email -> ok:false, no fetch
  test('invalid email returns ok:false without calling fetch', async () => {
    process.env.LOOPS_API_KEY = 'test-key';

    const noAt = await loops.sendEvent('not-an-email', 'uv_report_requested');
    const empty = await loops.sendEvent('', 'uv_report_requested');
    const nullEmail = await loops.updateContact(null, { firstName: 'Sam' });

    expect(noAt).toEqual({ ok: false, error: 'invalid email' });
    expect(empty.ok).toBe(false);
    expect(nullEmail.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('default base URL is used when LOOPS_API_BASE is unset', async () => {
    process.env.LOOPS_API_KEY = 'test-key';
    delete process.env.LOOPS_API_BASE;
    global.fetch.mockResolvedValue({ ok: true, status: 200 });

    await loops.sendEvent('user@example.com', 'uv_report_requested');

    expect(global.fetch.mock.calls[0][0]).toBe('https://app.loops.so/api/v1/events/send');
  });
});
