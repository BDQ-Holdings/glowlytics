/**
 * Cross-tool user-scoping suite.
 *
 * For every tool, build the MCP server bound to user_a and invoke the tool
 * with arguments that reference user_b's resources (where applicable).
 * The contract: every query-helper call MUST receive userId='user_a' as the
 * first argument. Tool args are not allowed to override the bound user.
 *
 * The helpers themselves are tested elsewhere for the "user_a cannot read
 * user_b's row" behavior — this suite tests the tool-layer guarantee.
 */

jest.mock('../../queries/scans', () => ({
  getLatestScan: jest.fn(),
  getScanHistory: jest.fn(),
  computeSignalTrend: jest.fn(),
  compareScans: jest.fn(),
  getScanById: jest.fn(),
  SIGNAL_NAMES: ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'],
}));
jest.mock('../../queries/reports', () => ({ getReportForScan: jest.fn() }));
jest.mock('../../queries/routine', () => ({ getCurrentRoutine: jest.fn() }));
jest.mock('../../queries/ingredients', () => ({
  lookupIngredient: jest.fn(),
  searchIngredients: jest.fn(),
}));

const scans = require('../../queries/scans');
const reports = require('../../queries/reports');
const routine = require('../../queries/routine');
const ingredients = require('../../queries/ingredients');
const { buildMcpServer } = require('../../mcp/server');

function call(server, name, args = {}) {
  const tool = server._registeredTools[name];
  if (!tool) throw new Error(`tool ${name} not registered`);
  return tool.handler(args, {});
}

const USER_A = 'user_a';
const USER_B = 'user_b';
const B_SCAN_ID = 'scan_owned_by_b';
const B_ANOTHER = 'scan_b_two';

beforeEach(() => {
  for (const m of Object.values({ ...scans, ...reports, ...routine, ...ingredients })) {
    if (typeof m === 'function' && m.mockReset) m.mockReset();
  }
  scans.getLatestScan.mockResolvedValue(null);
  scans.getScanHistory.mockResolvedValue([]);
  scans.computeSignalTrend.mockResolvedValue({ series: [], delta: null, direction: 'flat' });
  scans.compareScans.mockResolvedValue({ a: { daily_id: B_SCAN_ID, signal_scores: {} }, b: { daily_id: B_ANOTHER, signal_scores: {} }, signalDeltas: {} });
  reports.getReportForScan.mockResolvedValue(null);
  routine.getCurrentRoutine.mockResolvedValue({ am: [], pm: [], conflicts: [] });
  ingredients.lookupIngredient.mockResolvedValue({ name: 'x', aliases: [], function: '', concerns: [], evidence: [] });
  ingredients.searchIngredients.mockResolvedValue([]);
});

function expectFirstArgIsUserA(spy) {
  for (const callArgs of spy.mock.calls) {
    expect(callArgs[0]).toBe(USER_A);
    expect(callArgs[0]).not.toBe(USER_B);
  }
}

describe('user_a session can never invoke a query helper as user_b', () => {
  test('get_latest_scan', async () => {
    const server = buildMcpServer({ userId: USER_A });
    await call(server, 'get_latest_scan');
    expectFirstArgIsUserA(scans.getLatestScan);
  });

  test('get_scan_history', async () => {
    const server = buildMcpServer({ userId: USER_A });
    await call(server, 'get_scan_history', { days: 30, limit: 30 });
    expectFirstArgIsUserA(scans.getScanHistory);
  });

  test('get_signal_trend', async () => {
    const server = buildMcpServer({ userId: USER_A });
    await call(server, 'get_signal_trend', { signal: 'hydration', period: '30d' });
    expectFirstArgIsUserA(scans.computeSignalTrend);
  });

  test('compare_scans — user_a cannot reference user_b scan IDs to read foreign data', async () => {
    const server = buildMcpServer({ userId: USER_A });
    await call(server, 'compare_scans', { a: B_SCAN_ID, b: B_ANOTHER });
    expectFirstArgIsUserA(scans.compareScans);
    // The args dict (2nd positional) carries the IDs but the userId must always be user_a.
  });

  test('get_scan_report — explicit scanId belonging to user_b', async () => {
    const server = buildMcpServer({ userId: USER_A });
    await call(server, 'get_scan_report', { scanId: B_SCAN_ID });
    expectFirstArgIsUserA(reports.getReportForScan);
  });

  test('get_scan_report — defaulting to latest still binds to user_a', async () => {
    const server = buildMcpServer({ userId: USER_A });
    await call(server, 'get_scan_report', {});
    expectFirstArgIsUserA(scans.getLatestScan);
  });

  test('get_current_routine', async () => {
    const server = buildMcpServer({ userId: USER_A });
    await call(server, 'get_current_routine');
    expectFirstArgIsUserA(routine.getCurrentRoutine);
  });

  test('summarize_month', async () => {
    scans.getScanHistory.mockResolvedValueOnce([
      { daily_id: 'a', date: '2026-04-17', signal_scores: { hydration: 70 } },
    ]);
    scans.computeSignalTrend.mockResolvedValue({ series: [], delta: 5, direction: 'up' });
    reports.getReportForScan.mockResolvedValue(null);
    const server = buildMcpServer({ userId: USER_A });
    await call(server, 'summarize_month', { month: '2026-04' });
    expectFirstArgIsUserA(scans.getScanHistory);
    expectFirstArgIsUserA(scans.computeSignalTrend);
    expectFirstArgIsUserA(reports.getReportForScan);
    expectFirstArgIsUserA(routine.getCurrentRoutine);
  });

  test('lookup_ingredient — not user-scoped (intentional, shared knowledge base)', async () => {
    const server = buildMcpServer({ userId: USER_A });
    await call(server, 'lookup_ingredient', { name: 'niacinamide' });
    // No userId in the helper signature; assertion is that it does not receive user_b either.
    for (const callArgs of ingredients.lookupIngredient.mock.calls) {
      expect(callArgs).not.toContain(USER_B);
    }
  });

  test('search_ingredients — not user-scoped', async () => {
    const server = buildMcpServer({ userId: USER_A });
    await call(server, 'search_ingredients', { query: 'vitamin', limit: 5 });
    for (const callArgs of ingredients.searchIngredients.mock.calls) {
      expect(callArgs).not.toContain(USER_B);
    }
  });
});

describe('user_b session is fully isolated', () => {
  test('user_b binding never leaks user_a IDs into helper calls', async () => {
    const server = buildMcpServer({ userId: USER_B });
    await call(server, 'get_latest_scan');
    await call(server, 'get_scan_history', { days: 7, limit: 7 });
    for (const callArgs of scans.getLatestScan.mock.calls.concat(scans.getScanHistory.mock.calls)) {
      expect(callArgs[0]).toBe(USER_B);
      expect(callArgs[0]).not.toBe(USER_A);
    }
  });
});
