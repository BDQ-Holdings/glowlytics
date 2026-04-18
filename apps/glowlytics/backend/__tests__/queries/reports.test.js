const mockQuery = jest.fn();
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({ query: mockQuery, end: jest.fn() })),
}));

beforeEach(() => mockQuery.mockReset());

const { getReportForScan } = require('../../queries/reports');

describe('getReportForScan', () => {
  it('returns null when scan does not belong to user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await getReportForScan('user_a', 'scan_owned_by_b');
    expect(r).toBeNull();
  });

  it('joins model_outputs to daily_records and scopes to userId + scanId', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getReportForScan('user_a', 'd1');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/model_outputs/);
    expect(sql).toMatch(/daily_records/);
    expect(params).toEqual(expect.arrayContaining(['user_a', 'd1']));
  });

  it('returns shaped report when generated_insights is present', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          daily_id: 'd1',
          generated_insights: { narrative: 'Skin is improving.', highlights: ['hydration up'] },
          rag_recommendations: [
            { title: 'Use SPF 30 daily', rationale: 'UV exposure...', source: 'NIH 2023' },
          ],
        },
      ],
    });
    const r = await getReportForScan('user_a', 'd1');
    expect(r.scanId).toBe('d1');
    expect(r.narrative).toBe('Skin is improving.');
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0].title).toBe('Use SPF 30 daily');
    expect(r.citations).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'NIH 2023' })]));
  });

  it('returns empty arrays + null narrative when scan has no generated_insights yet', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ daily_id: 'd1', generated_insights: null, rag_recommendations: null }],
    });
    const r = await getReportForScan('user_a', 'd1');
    expect(r.scanId).toBe('d1');
    expect(r.narrative).toBeNull();
    expect(r.recommendations).toEqual([]);
    expect(r.citations).toEqual([]);
  });

  it('parses generated_insights when stored as JSON string', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          daily_id: 'd1',
          generated_insights: JSON.stringify({ narrative: 'Looks good.' }),
          rag_recommendations: JSON.stringify([{ title: 'X', rationale: 'Y', source: 'Z' }]),
        },
      ],
    });
    const r = await getReportForScan('user_a', 'd1');
    expect(r.narrative).toBe('Looks good.');
    expect(r.recommendations[0].source).toBe('Z');
  });
});
