jest.mock('../../../queries/scans', () => ({
  getLatestScan: jest.fn(),
  getScanHistory: jest.fn(),
  computeSignalTrend: jest.fn(),
  compareScans: jest.fn(),
  getScanById: jest.fn(),
  SIGNAL_NAMES: ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'],
}));

const queries = require('../../../queries/scans');
const { buildMcpServer } = require('../../../mcp/server');

function call(server, name, args = {}) {
  const tool = server._registeredTools[name];
  if (!tool) throw new Error(`tool ${name} not registered`);
  return tool.handler(args, {});
}

function parseText(result) {
  return JSON.parse(result.content[0].text);
}

beforeEach(() => {
  queries.getLatestScan.mockReset();
  queries.getScanHistory.mockReset();
  queries.computeSignalTrend.mockReset();
  queries.compareScans.mockReset();
});

describe('get_latest_scan', () => {
  it('calls getLatestScan with the bound userId', async () => {
    queries.getLatestScan.mockResolvedValueOnce({
      daily_id: 'd1', date: '2026-04-17', acne_score: 78, signal_scores: { hydration: 70 },
    });
    const server = buildMcpServer({ userId: 'user_a' });
    const res = await call(server, 'get_latest_scan');
    expect(queries.getLatestScan).toHaveBeenCalledWith('user_a');
    const body = parseText(res);
    expect(body).toMatchObject({ scanId: 'd1', date: '2026-04-17', overallScore: 78 });
  });

  it('returns a JSON-encoded null when there are no scans', async () => {
    queries.getLatestScan.mockResolvedValueOnce(null);
    const server = buildMcpServer({ userId: 'user_a' });
    const res = await call(server, 'get_latest_scan');
    expect(parseText(res)).toBeNull();
  });
});

describe('get_scan_history', () => {
  it('passes clamped days/limit to getScanHistory', async () => {
    queries.getScanHistory.mockResolvedValueOnce([]);
    const server = buildMcpServer({ userId: 'user_a' });
    await call(server, 'get_scan_history', { days: 30, limit: 30 });
    expect(queries.getScanHistory).toHaveBeenCalledWith('user_a', { days: 30, limit: 30 });
  });

  it('projects each row to the public scan shape', async () => {
    queries.getScanHistory.mockResolvedValueOnce([
      { daily_id: 'd1', date: '2026-04-17', acne_score: 80, signal_scores: { hydration: 70 } },
    ]);
    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'get_scan_history', { days: 7, limit: 7 }));
    expect(body).toHaveLength(1);
    expect(body[0].scanId).toBe('d1');
  });
});

describe('get_signal_trend', () => {
  it('forwards signal + period to computeSignalTrend', async () => {
    queries.computeSignalTrend.mockResolvedValueOnce({ series: [], delta: null, direction: 'flat' });
    const server = buildMcpServer({ userId: 'user_a' });
    await call(server, 'get_signal_trend', { signal: 'hydration', period: '30d' });
    expect(queries.computeSignalTrend).toHaveBeenCalledWith('user_a', 'hydration', '30d');
  });
});

describe('compare_scans', () => {
  it('forwards scan IDs and reshapes scan rows in the response', async () => {
    queries.compareScans.mockResolvedValueOnce({
      a: { daily_id: 'a', date: '2026-03-01', acne_score: 60, signal_scores: { hydration: 50 } },
      b: { daily_id: 'b', date: '2026-04-17', acne_score: 80, signal_scores: { hydration: 70 } },
      signalDeltas: { hydration: 20 },
    });
    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'compare_scans', { a: 'a', b: 'b' }));
    expect(queries.compareScans).toHaveBeenCalledWith('user_a', { a: 'a', b: 'b' });
    expect(body.a.scanId).toBe('a');
    expect(body.b.scanId).toBe('b');
    expect(body.signalDeltas.hydration).toBe(20);
  });
});
