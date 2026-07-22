const posthog = require('../posthog');

describe('PostHog source lead identity promotion', () => {
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

  test('never promotes an unverified browser identity or email', () => {
    expect(
      posthog.accountAttributionProperties({ posthog_distinct_id: 'browser-1' }, true)
    ).not.toHaveProperty('$anon_distinct_id');
    expect(
      posthog.accountAttributionProperties({ posthog_distinct_id: 'lead@example.com' }, true)
    ).not.toHaveProperty('waitlist_source_identity');
  });

  test('accepts only canonical source-owned Railway lead identities', () => {
    const sourceIdentity = 'glowlytics:lead:railway:66fd1965-6388-4071-9e50-382223698678';
    expect(
      posthog.accountAttributionProperties({ source_identity: sourceIdentity }, true)
    ).toEqual(expect.objectContaining({ waitlist_source_identity: sourceIdentity }));
    expect(
      posthog.accountAttributionProperties({ source_identity: 'glowlytics:lead:railway_waitlist:66fd1965-6388-4071-9e50-382223698678' }, true)
    ).not.toHaveProperty('waitlist_source_identity');
  });

  test('aliases a validated source-owned lead ID to the canonical account before account_created', async () => {
    const userId = 'user-1';
    const distinctId = posthog.canonicalGlowlyticsUserId(userId);
    const sourceIdentity = 'glowlytics:lead:d1:41';
    const properties = {
      distinct_id: distinctId,
      ...posthog.accountAttributionProperties({ source_identity: sourceIdentity }, true),
    };
    const request = {
      userId,
      uuid: '11111111-1111-5111-8111-111111111111',
      timestamp: '2026-07-21T12:00:00.000Z',
      properties,
    };

    await posthog.captureAccountCreated(request);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.batch).toEqual([
      {
        uuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
        event: '$create_alias',
        timestamp: request.timestamp,
        properties: {
          distinct_id: distinctId,
          alias: sourceIdentity,
        },
      },
      {
        uuid: request.uuid,
        event: 'account_created',
        timestamp: request.timestamp,
        properties,
      },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/browser-1|lead@example\.com|\$anon_distinct_id/);
  });

  test('sends only account_created for a conclusively unmatched account', async () => {
    const userId = 'user-2';
    const properties = {
      distinct_id: posthog.canonicalGlowlyticsUserId(userId),
      ...posthog.accountAttributionProperties({}, false),
    };

    await posthog.captureAccountCreated({
      userId,
      uuid: '22222222-2222-5222-8222-222222222222',
      timestamp: '2026-07-21T12:01:00.000Z',
      properties,
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.batch).toHaveLength(1);
    expect(body.batch[0]).toEqual(expect.objectContaining({
      event: 'account_created',
      properties,
    }));
  });
  test('captures a deterministic forward Railway waitlist event under its source identity', async () => {
    const sourceIdentity = 'glowlytics:lead:railway:66fd1965-6388-4071-9e50-382223698678';
    const timestamp = '2026-07-21T12:02:00.000Z';

    await posthog.captureWaitlistSubmitted({
      sourceKey: 'railway_waitlist',
      sourceIdentity,
      timestamp,
      attribution: {
        acquisition_source: 'google',
        acquisition_medium: 'paid_search',
        attribution_quality: 'utm',
        form_placement: 'hero',
        utm_campaign: 'launch',
        utm_content: 'api_key=secret',
        posthog_session_id: '0198b6bc-c2f8-7b5d-9e18-6c98232a1024',
      },
    });
    await posthog.captureWaitlistSubmitted({
      sourceKey: 'railway_waitlist',
      sourceIdentity,
      timestamp,
      attribution: {
        acquisition_source: 'google',
        acquisition_medium: 'paid_search',
        attribution_quality: 'utm',
        form_placement: 'hero',
        utm_campaign: 'launch',
      },
    });

    const first = JSON.parse(global.fetch.mock.calls[0][1].body);
    const second = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(first.batch).toEqual([{
      uuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
      event: 'waitlist_submitted',
      timestamp,
      properties: expect.objectContaining({
        distinct_id: sourceIdentity,
        product: 'glowlytics',
        acquisition_source: 'google',
        acquisition_medium: 'paid_search',
        attribution_model: 'first_touch',
        attribution_quality: 'utm',
        historical_backfill: false,
        form_placement: 'hero',
        utm_campaign: 'launch',
        utm_content: null,
        $session_id: '0198b6bc-c2f8-7b5d-9e18-6c98232a1024',
      }),
    }]);
    expect(second.batch[0].uuid).toBe(first.batch[0].uuid);
    expect(JSON.stringify(first.batch[0].properties)).not.toMatch(/api_key|secret|@/);
    expect(first.batch[0].properties).not.toHaveProperty('posthog_session_id');
  });

  test('rejects a forward waitlist event without a validated source identity', async () => {
    await expect(posthog.captureWaitlistSubmitted({
      sourceKey: 'railway_uv_lead',
      sourceIdentity: 'browser-1',
      timestamp: '2026-07-21T12:02:00.000Z',
      attribution: {},
    })).rejects.toThrow(/source identity/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

});
