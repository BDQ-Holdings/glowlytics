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
  getScanById,
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
