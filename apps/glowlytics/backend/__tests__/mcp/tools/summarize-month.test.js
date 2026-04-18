jest.mock('../../../queries/scans', () => ({
  getLatestScan: jest.fn(),
  getScanHistory: jest.fn(),
  getScansInDateRange: jest.fn(),
  computeSignalTrend: jest.fn(),
  compareScans: jest.fn(),
  getScanById: jest.fn(),
  SIGNAL_NAMES: ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'],
}));
jest.mock('../../../queries/reports', () => ({ getReportForScan: jest.fn() }));
jest.mock('../../../queries/routine', () => ({ getCurrentRoutine: jest.fn() }));
jest.mock('../../../queries/ingredients', () => ({
  lookupIngredient: jest.fn(), searchIngredients: jest.fn(),
}));

const scans = require('../../../queries/scans');
const reports = require('../../../queries/reports');
const routine = require('../../../queries/routine');
const { buildMcpServer } = require('../../../mcp/server');

function call(server, name, args = {}) {
  return server._registeredTools[name].handler(args, {});
}
const parseText = (r) => JSON.parse(r.content[0].text);

beforeEach(() => {
  scans.getScansInDateRange.mockReset();
  scans.computeSignalTrend.mockReset();
  reports.getReportForScan.mockReset();
  routine.getCurrentRoutine.mockReset();
});

describe('summarize_month', () => {
  it('defaults month to current YYYY-MM (UTC)', async () => {
    scans.getScansInDateRange.mockResolvedValueOnce([]);
    routine.getCurrentRoutine.mockResolvedValueOnce({ am: [], pm: [], conflicts: [] });
    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'summarize_month', {}));
    const now = new Date();
    const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(body.month).toBe(expected);
  });

  it('returns scanCount=0 and signalTrends=null when no scans in month (does not fabricate)', async () => {
    scans.getScansInDateRange.mockResolvedValueOnce([]);
    routine.getCurrentRoutine.mockResolvedValueOnce({ am: [], pm: [], conflicts: [] });
    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'summarize_month', { month: '2026-01' }));
    expect(body.scanCount).toBe(0);
    expect(body.latestOverall).toBeNull();
    expect(body.signalTrends).toBeNull();
    expect(body.signalAverages).toEqual({});
    expect(scans.computeSignalTrend).not.toHaveBeenCalled();
    expect(reports.getReportForScan).not.toHaveBeenCalled();
  });

  it('queries the calendar month bounds (not trailing 90 days)', async () => {
    scans.getScansInDateRange.mockResolvedValueOnce([]);
    routine.getCurrentRoutine.mockResolvedValueOnce({ am: [], pm: [], conflicts: [] });
    const server = buildMcpServer({ userId: 'user_a' });
    await call(server, 'summarize_month', { month: '2026-01' });
    expect(scans.getScansInDateRange).toHaveBeenCalledWith(
      'user_a',
      '2026-01-01',
      '2026-01-31',
      expect.any(Object)
    );
  });

  it('aggregates signalAverages and latestOverall from the rows the SQL helper returns', async () => {
    // The SQL helper is responsible for date-filtering; the tool trusts it.
    scans.getScansInDateRange.mockResolvedValueOnce([
      { daily_id: 'a', date: '2026-04-17', signal_scores: { structure: 80, hydration: 60, inflammation: 70, sunDamage: 50, elasticity: 90 } },
      { daily_id: 'b', date: '2026-04-10', signal_scores: { structure: 60, hydration: 80, inflammation: 30, sunDamage: 70, elasticity: 60 } },
    ]);
    reports.getReportForScan.mockResolvedValue(null);
    routine.getCurrentRoutine.mockResolvedValueOnce({ am: [], pm: [], conflicts: [] });

    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'summarize_month', { month: '2026-04' }));
    expect(body.scanCount).toBe(2);
    expect(body.signalAverages.hydration).toBe(70); // (60+80)/2
    expect(body.signalAverages.inflammation).toBe(50); // (70+30)/2
    expect(body.latestOverall).toBe(70); // mean of 80/60/70/50/90
  });

  it('signalTrends are derived from the returned rows, not from CURRENT_DATE - 30d', async () => {
    scans.getScansInDateRange.mockResolvedValueOnce([
      { daily_id: 'a', date: '2026-03-31', signal_scores: { hydration: 80 } },
      { daily_id: 'b', date: '2026-03-01', signal_scores: { hydration: 50 } },
    ]);
    reports.getReportForScan.mockResolvedValue(null);
    routine.getCurrentRoutine.mockResolvedValueOnce({ am: [], pm: [], conflicts: [] });

    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'summarize_month', { month: '2026-03' }));
    expect(body.signalTrends.hydration).toEqual({ delta: 30, direction: 'up' });
    expect(scans.computeSignalTrend).not.toHaveBeenCalled();
  });

  it('queries up to 3 reports for top recommendations and skips empties', async () => {
    scans.getScansInDateRange.mockResolvedValueOnce([
      { daily_id: 'a', date: '2026-04-17', signal_scores: {} },
      { daily_id: 'b', date: '2026-04-10', signal_scores: {} },
      { daily_id: 'c', date: '2026-04-05', signal_scores: {} },
      { daily_id: 'd', date: '2026-04-01', signal_scores: {} },
    ]);
    reports.getReportForScan
      .mockResolvedValueOnce({ scanId: 'a', recommendations: [{ title: 'SPF', rationale: 'UV' }], citations: [] })
      .mockResolvedValueOnce({ scanId: 'b', recommendations: [], citations: [] })
      .mockResolvedValueOnce({ scanId: 'c', recommendations: [{ title: 'Niacinamide', rationale: 'Barrier' }], citations: [] });
    routine.getCurrentRoutine.mockResolvedValueOnce({ am: [], pm: [], conflicts: [] });

    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'summarize_month', { month: '2026-04' }));
    expect(reports.getReportForScan).toHaveBeenCalledTimes(3);
    expect(body.topRecommendations).toHaveLength(2);
    expect(body.topRecommendations[0]).toEqual({ title: 'SPF', rationale: 'UV', scanId: 'a' });
  });
});
