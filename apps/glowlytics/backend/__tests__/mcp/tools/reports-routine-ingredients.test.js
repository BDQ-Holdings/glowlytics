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
  lookupIngredient: jest.fn(),
  searchIngredients: jest.fn(),
}));

const scans = require('../../../queries/scans');
const reports = require('../../../queries/reports');
const routine = require('../../../queries/routine');
const ingredients = require('../../../queries/ingredients');
const { buildMcpServer } = require('../../../mcp/server');

function call(server, name, args = {}) {
  const tool = server._registeredTools[name];
  if (!tool) throw new Error(`tool ${name} not registered`);
  return tool.handler(args, {});
}
const parseText = (r) => JSON.parse(r.content[0].text);

beforeEach(() => {
  scans.getLatestScan.mockReset();
  reports.getReportForScan.mockReset();
  routine.getCurrentRoutine.mockReset();
  ingredients.lookupIngredient.mockReset();
  ingredients.searchIngredients.mockReset();
});

describe('get_scan_report', () => {
  it('uses provided scanId without calling getLatestScan', async () => {
    reports.getReportForScan.mockResolvedValueOnce({ scanId: 'd1', narrative: 'ok', recommendations: [], citations: [] });
    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'get_scan_report', { scanId: 'd1' }));
    expect(scans.getLatestScan).not.toHaveBeenCalled();
    expect(reports.getReportForScan).toHaveBeenCalledWith('user_a', 'd1');
    expect(body.scanId).toBe('d1');
  });

  it('falls back to latest scan when scanId is omitted', async () => {
    scans.getLatestScan.mockResolvedValueOnce({ daily_id: 'latest_d', date: '2026-04-17' });
    reports.getReportForScan.mockResolvedValueOnce({ scanId: 'latest_d', narrative: 'x', recommendations: [], citations: [] });
    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'get_scan_report', {}));
    expect(scans.getLatestScan).toHaveBeenCalledWith('user_a');
    expect(reports.getReportForScan).toHaveBeenCalledWith('user_a', 'latest_d');
    expect(body.scanId).toBe('latest_d');
  });

  it('returns null body when user has no scans at all', async () => {
    scans.getLatestScan.mockResolvedValueOnce(null);
    const server = buildMcpServer({ userId: 'user_a' });
    expect(parseText(await call(server, 'get_scan_report', {}))).toBeNull();
    expect(reports.getReportForScan).not.toHaveBeenCalled();
  });
});

describe('get_current_routine', () => {
  it('projects product fields and always includes a conflicts array', async () => {
    routine.getCurrentRoutine.mockResolvedValueOnce({
      am: [{ user_product_id: 1, product_name: 'Vitamin C', usage_schedule: 'AM', start_date: '2026-04-01' }],
      pm: [],
      conflicts: [],
    });
    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'get_current_routine'));
    expect(body.am[0]).toEqual({ productId: 1, name: 'Vitamin C', schedule: 'AM', startDate: '2026-04-01' });
    expect(body.pm).toEqual([]);
    expect(Array.isArray(body.conflicts)).toBe(true);
  });
});

describe('lookup_ingredient + search_ingredients (Q3 — chunkId in citations)', () => {
  it('lookup returns evidence with chunkId on every item', async () => {
    ingredients.lookupIngredient.mockResolvedValueOnce({
      name: 'Niacinamide', aliases: [], function: '', concerns: [],
      evidence: [{ source: 'NIH', snippet: 's', chunkId: 'c_42' }],
    });
    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'lookup_ingredient', { name: 'niacinamide' }));
    expect(body.evidence[0].chunkId).toBe('c_42');
  });

  it('search returns each result with citations[].chunkId', async () => {
    ingredients.searchIngredients.mockResolvedValueOnce([
      { name: 'Vitamin C', function: '', summary: '', citations: [{ source: 'X', snippet: 's', chunkId: 'c_1' }] },
    ]);
    const server = buildMcpServer({ userId: 'user_a' });
    const body = parseText(await call(server, 'search_ingredients', { query: 'vitamin', limit: 5 }));
    expect(body[0].citations[0].chunkId).toBe('c_1');
  });

  it('search forwards limit', async () => {
    ingredients.searchIngredients.mockResolvedValueOnce([]);
    const server = buildMcpServer({ userId: 'user_a' });
    await call(server, 'search_ingredients', { query: 'x', limit: 7 });
    expect(ingredients.searchIngredients).toHaveBeenCalledWith('x', { limit: 7 });
  });
});
