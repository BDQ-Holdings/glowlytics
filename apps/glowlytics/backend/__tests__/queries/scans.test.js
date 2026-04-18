const mockQuery = jest.fn();
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({ query: mockQuery, end: jest.fn() })),
}));

beforeEach(() => {
  mockQuery.mockReset();
});

const {
  getLatestScan,
  getScanHistory,
  getScansInDateRange,
  getScanById,
  computeSignalTrend,
  compareScans,
  SIGNAL_NAMES,
} = require('../../queries/scans');

describe('getLatestScan', () => {
  it('scopes to userId and limits to 1 row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ daily_id: 'd1', date: '2026-04-17', signal_scores: { hydration: 70 } }] });
    await getLatestScan('user_a');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/LIMIT 1/i);
    expect(params).toContain('user_a');
  });

  it('returns null when user has no scans', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await getLatestScan('user_a');
    expect(r).toBeNull();
  });

  it('returns the row when present', async () => {
    const row = { daily_id: 'd1', date: '2026-04-17', acne_score: 80 };
    mockQuery.mockResolvedValueOnce({ rows: [row] });
    const r = await getLatestScan('user_a');
    expect(r).toEqual(row);
  });
});

describe('getScanHistory', () => {
  it('clamps days and limit to 90', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getScanHistory('user_a', { days: 999, limit: 999 });
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toContain(90);
  });

  it('uses defaults (days=30, limit=30) when not provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getScanHistory('user_a');
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toContain(30);
  });

  it('passes userId as a query parameter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getScanHistory('user_a', { days: 7, limit: 5 });
    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe('user_a');
  });

  it('returns the rows from the pool', async () => {
    const rows = [{ daily_id: 'd1', date: '2026-04-10' }, { daily_id: 'd2', date: '2026-04-11' }];
    mockQuery.mockResolvedValueOnce({ rows });
    const r = await getScanHistory('user_a');
    expect(r).toEqual(rows);
  });
});

describe('getScanById', () => {
  it('returns null when scan belongs to another user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await getScanById('user_a', 'scan_owned_by_b');
    expect(r).toBeNull();
  });

  it('scopes to both userId and scanId', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getScanById('user_a', 'd1');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/user_id/i);
    expect(params).toEqual(expect.arrayContaining(['user_a', 'd1']));
  });

  it('returns the row when present and owned by user', async () => {
    const row = { daily_id: 'd1', date: '2026-04-17' };
    mockQuery.mockResolvedValueOnce({ rows: [row] });
    const r = await getScanById('user_a', 'd1');
    expect(r).toEqual(row);
  });
});

describe('getScansInDateRange', () => {
  it('queries inclusive of start and end date for the user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getScansInDateRange('user_a', '2026-01-01', '2026-01-31');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/dr\.date >= \$2/);
    expect(sql).toMatch(/dr\.date <= \$3/);
    expect(params).toEqual(['user_a', '2026-01-01', '2026-01-31', 200]);
  });

  it('clamps limit to 1000', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getScansInDateRange('user_a', '2026-01-01', '2026-01-31', { limit: 9999 });
    const [, params] = mockQuery.mock.calls[0];
    expect(params[3]).toBe(1000);
  });

  it('returns rows from the pool', async () => {
    const rows = [{ daily_id: 'd1', date: '2026-01-15' }];
    mockQuery.mockResolvedValueOnce({ rows });
    const r = await getScansInDateRange('user_a', '2026-01-01', '2026-01-31');
    expect(r).toEqual(rows);
  });
});

describe('SIGNAL_NAMES', () => {
  it('contains the five canonical signals from the mobile app', () => {
    expect(SIGNAL_NAMES).toEqual(
      expect.arrayContaining(['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'])
    );
  });
});

describe('computeSignalTrend', () => {
  it('returns series, delta, and direction=up when value rises', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { date: '2026-03-18', signal_scores: { hydration: 60 } },
        { date: '2026-04-17', signal_scores: { hydration: 75 } },
      ],
    });
    const t = await computeSignalTrend('user_a', 'hydration', '30d');
    expect(t.series).toHaveLength(2);
    expect(t.series[0]).toEqual({ date: '2026-03-18', value: 60 });
    expect(t.series[1]).toEqual({ date: '2026-04-17', value: 75 });
    expect(t.delta).toBe(15);
    expect(t.direction).toBe('up');
  });

  it('returns direction=down when value drops', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { date: '2026-03-18', signal_scores: { inflammation: 60 } },
        { date: '2026-04-17', signal_scores: { inflammation: 40 } },
      ],
    });
    const t = await computeSignalTrend('user_a', 'inflammation', '30d');
    expect(t.delta).toBe(-20);
    expect(t.direction).toBe('down');
  });

  it('returns direction=flat for movements within ±1', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { date: '2026-03-18', signal_scores: { hydration: 70 } },
        { date: '2026-04-17', signal_scores: { hydration: 70 } },
      ],
    });
    const t = await computeSignalTrend('user_a', 'hydration', '7d');
    expect(t.direction).toBe('flat');
  });

  it('rejects unknown signal names', async () => {
    await expect(computeSignalTrend('user_a', 'wrinkles', '30d')).rejects.toThrow(/signal/i);
  });

  it('rejects unknown periods', async () => {
    await expect(computeSignalTrend('user_a', 'hydration', '14d')).rejects.toThrow(/period/i);
  });

  it('returns empty series and null delta when no scans in window', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const t = await computeSignalTrend('user_a', 'hydration', '30d');
    expect(t.series).toEqual([]);
    expect(t.delta).toBeNull();
    expect(t.direction).toBe('flat');
  });
});

describe('compareScans', () => {
  it('returns signalDeltas keyed by signal name', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ daily_id: 'a', date: '2026-03-01', signal_scores: { hydration: 50, inflammation: 40 } }] })
      .mockResolvedValueOnce({ rows: [{ daily_id: 'b', date: '2026-04-17', signal_scores: { hydration: 70, inflammation: 30 } }] });
    const c = await compareScans('user_a', { a: 'a', b: 'b' });
    expect(c.signalDeltas.hydration).toBe(20);
    expect(c.signalDeltas.inflammation).toBe(-10);
  });

  it('throws when either scan is missing or not owned by user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ daily_id: 'a', signal_scores: {} }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(compareScans('user_a', { a: 'a', b: 'missing' })).rejects.toThrow(/not found/i);
  });
});

