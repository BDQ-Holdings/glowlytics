const mockQuery = jest.fn();
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({ query: mockQuery, end: jest.fn() })),
}));

beforeEach(() => mockQuery.mockReset());

const { getCurrentRoutine } = require('../../queries/routine');

describe('getCurrentRoutine', () => {
  it('scopes to userId and excludes products with end_date set', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getCurrentRoutine('user_a');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/end_date IS NULL/i);
    expect(params).toContain('user_a');
  });

  it('splits products into am and pm by usage_schedule', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { user_product_id: 1, product_name: 'Vitamin C Serum', usage_schedule: 'AM' },
        { user_product_id: 2, product_name: 'Retinol', usage_schedule: 'PM' },
        { user_product_id: 3, product_name: 'Moisturizer', usage_schedule: 'AM/PM' },
      ],
    });
    const r = await getCurrentRoutine('user_a');
    const amNames = r.am.map((p) => p.product_name).sort();
    const pmNames = r.pm.map((p) => p.product_name).sort();
    expect(amNames).toEqual(['Moisturizer', 'Vitamin C Serum']);
    expect(pmNames).toEqual(['Moisturizer', 'Retinol']);
  });

  it('always returns conflicts as an array (empty for now)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await getCurrentRoutine('user_a');
    expect(Array.isArray(r.conflicts)).toBe(true);
    expect(r.conflicts).toEqual([]);
  });

  it('places products with unknown schedule in both am and pm', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ user_product_id: 1, product_name: 'Cleanser', usage_schedule: null }],
    });
    const r = await getCurrentRoutine('user_a');
    expect(r.am).toHaveLength(1);
    expect(r.pm).toHaveLength(1);
  });
});
