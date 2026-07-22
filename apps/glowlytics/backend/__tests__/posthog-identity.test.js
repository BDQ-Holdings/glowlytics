const posthog = require('../posthog');

describe('PostHog anonymous lead identity promotion', () => {
  const realFetch = global.fetch;
  const realApiKey = process.env.POSTHOG_API_KEY;
  const realHost = process.env.POSTHOG_HOST;

  beforeEach(() => {
    process.env.POSTHOG_API_KEY = 'phc_test';
    process.env.POSTHOG_HOST = 'https://us.i.posthog.com';
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    global.fetch = realFetch;
    if (realApiKey === undefined) delete process.env.POSTHOG_API_KEY;
    else process.env.POSTHOG_API_KEY = realApiKey;
    if (realHost === undefined) delete process.env.POSTHOG_HOST;
    else process.env.POSTHOG_HOST = realHost;
  });

  test('freezes the matched browser distinct ID but omits unsafe or unmatched IDs', () => {
    expect(
      posthog.accountAttributionProperties({ posthog_distinct_id: 'browser-1' }, true)
    ).toEqual(expect.objectContaining({ $anon_distinct_id: 'browser-1' }));

    expect(
      posthog.accountAttributionProperties({ posthog_distinct_id: 'browser-1' }, false)
    ).not.toHaveProperty('$anon_distinct_id');

    expect(
      posthog.accountAttributionProperties({ posthog_distinct_id: 'lead@example.com' }, true)
    ).not.toHaveProperty('$anon_distinct_id');
  });

  test('batches a deterministic identify before account_created and keeps the business event clean', async () => {
    const userId = 'user-1';
    const distinctId = posthog.canonicalGlowlyticsUserId(userId);
    const properties = {
      distinct_id: distinctId,
      ...posthog.accountAttributionProperties({ posthog_distinct_id: 'browser-1' }, true),
    };
    const request = {
      userId,
      uuid: '11111111-1111-5111-8111-111111111111',
      timestamp: '2026-07-21T12:00:00.000Z',
      properties,
    };

    await posthog.captureAccountCreated(request);
    await posthog.captureAccountCreated(request);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    const secondBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(firstBody.batch).toHaveLength(2);
    expect(firstBody.batch[0]).toEqual({
      uuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
      event: '$identify',
      timestamp: request.timestamp,
      properties: {
        distinct_id: distinctId,
        $anon_distinct_id: 'browser-1',
      },
    });
    expect(firstBody.batch[1]).toEqual({
      uuid: request.uuid,
      event: 'account_created',
      timestamp: request.timestamp,
      properties: expect.not.objectContaining({ $anon_distinct_id: expect.anything() }),
    });
    expect(secondBody.batch[0].uuid).toBe(firstBody.batch[0].uuid);
    expect(JSON.stringify(firstBody)).not.toMatch(/lead@example\.com/);
  });
});
