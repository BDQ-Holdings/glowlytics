jest.mock('../../../queries/scans', () => ({
  getLatestScan: jest.fn(),
  getScanHistory: jest.fn(),
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
  scans.getScanHistory.mockReset();
  scans.computeSignalTrend.mockReset();
  reports.getReportForScan.mockReset();
  routine.getCurrentRoutine.mockReset();
});

describe('summarize_month', () => {
  it('defaults month to current YYYY-MM (UTC)', async () => {
    scans.getScanHistory.mockResolvedValueOnce([]);
    routine.getCurrentRoutine.mockResolvedValueOnce({ am: [], pm: [], conflicts: [] });
    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'summarize_month', {}));
    const now = new Date();
    const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(body.month).toBe(expected);
  });

  it('returns scanCount=0 and signalTrends=null when no scans in month (does not fabricate)', async () => {
    scans.getScanHistory.mockResolvedValueOnce([]);
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

  it('aggregates signalAverages from in-month scans only', async () => {
    scans.getScanHistory.mockResolvedValueOnce([
      { daily_id: 'a', date: '2026-04-17', acne_score: 80, signal_scores: { hydration: 60, inflammation: 40 } },
      { daily_id: 'b', date: '2026-04-10', acne_score: 70, signal_scores: { hydration: 80, inflammation: 30 } },
      { daily_id: 'c', date: '2026-03-30', acne_score: 50, signal_scores: { hydration: 100 } }, // out of month
    ]);
    scans.computeSignalTrend.mockResolvedValue({ delta: 5, direction: 'up' });
    reports.getReportForScan.mockResolvedValue(null);
    routine.getCurrentRoutine.mockResolvedValueOnce({ am: [], pm: [], conflicts: [] });

    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'summarize_month', { month: '2026-04' }));
    expect(body.scanCount).toBe(2);
    expect(body.signalAverages.hydration).toBe(70); // (60+80)/2
    expect(body.signalAverages.inflammation).toBe(35); // (40+30)/2
    expect(body.latestOverall).toBe(80);
  });

  it('queries up to 3 reports for top recommendations and skips empties', async () => {
    scans.getScanHistory.mockResolvedValueOnce([
      { daily_id: 'a', date: '2026-04-17', signal_scores: {} },
      { daily_id: 'b', date: '2026-04-10', signal_scores: {} },
      { daily_id: 'c', date: '2026-04-05', signal_scores: {} },
      { daily_id: 'd', date: '2026-04-01', signal_scores: {} }, // beyond top 3
    ]);
    scans.computeSignalTrend.mockResolvedValue({ delta: 0, direction: 'flat' });
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
