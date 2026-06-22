/**
 * Protocol-level end-to-end test using the official MCP SDK client.
 *
 * Boots the real Express app on an ephemeral port with a stub JWKS server,
 * connects with the SDK's StreamableHTTPClientTransport carrying a Bearer
 * token signed by the stub, and exercises tools/list + tools/call.
 *
 * All query helpers are mocked so the test does not hit Postgres or Pinecone.
 */

jest.mock('pg', () => {
  const mockPool = { query: jest.fn(), end: jest.fn() };
  return { Pool: jest.fn(() => mockPool) };
});
jest.mock('openai', () => jest.fn().mockImplementation(() => ({})));

jest.mock('../../queries/scans', () => ({
  getLatestScan: jest.fn().mockResolvedValue({ daily_id: 'd1', date: '2026-04-17', acne_score: 80, signal_scores: { hydration: 70 } }),
  getScanHistory: jest.fn().mockResolvedValue([
    { daily_id: 'd1', date: '2026-04-17', acne_score: 80, signal_scores: { hydration: 70 } },
  ]),
  getScansInDateRange: jest.fn().mockResolvedValue([
    { daily_id: 'd1', date: '2026-04-17', signal_scores: { hydration: 70 } },
  ]),
  getScanById: jest.fn().mockResolvedValue({ daily_id: 'd1', signal_scores: {} }),
  computeSignalTrend: jest.fn().mockResolvedValue({ series: [], delta: 5, direction: 'up' }),
  compareScans: jest.fn().mockResolvedValue({
    a: { daily_id: 'a', date: '2026-03-01', signal_scores: { hydration: 50 } },
    b: { daily_id: 'b', date: '2026-04-17', signal_scores: { hydration: 70 } },
    signalDeltas: { hydration: 20 },
  }),
  SIGNAL_NAMES: ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'],
}));
jest.mock('../../queries/reports', () => ({
  getReportForScan: jest.fn().mockResolvedValue({ scanId: 'd1', narrative: 'ok', recommendations: [], citations: [] }),
}));
jest.mock('../../queries/routine', () => ({
  getCurrentRoutine: jest.fn().mockResolvedValue({ am: [], pm: [], conflicts: [] }),
}));
jest.mock('../../queries/bone-structure', () => ({
  getLatestBoneStructure: jest.fn().mockResolvedValue({
    daily_id: 'd1',
    date: '2026-04-17',
    bone_structure: { harmony: 78, domain_scores: {}, findings: [], interventions: { lifestyle: [], pharmacological: [], interventional: [] } },
  }),
  getBoneStructureForScan: jest.fn().mockResolvedValue(null),
  computeHarmonyTrend: jest.fn().mockResolvedValue({ series: [], delta: null, direction: 'flat' }),
}));
jest.mock('../../queries/ingredients', () => ({
  lookupIngredient: jest.fn().mockResolvedValue({
    name: 'Niacinamide', aliases: ['niacinamide'], function: '', concerns: [],
    evidence: [{ source: 'NIH', snippet: 's', chunkId: 'c_42' }],
  }),
  searchIngredients: jest.fn().mockResolvedValue([
    { name: 'Vitamin C', function: '', summary: '', citations: [{ source: 'X', snippet: 's', chunkId: 'c_1' }] },
  ]),
}));

const { generateKeyPair, exportJWK, SignJWT } = require('jose');
const express = require('express');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

let kp;
let jwksServer;
let appServer;
let token;

beforeAll(async () => {
  kp = await generateKeyPair('RS256');
  const jwk = await exportJWK(kp.publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  const jwksApp = express();
  jwksApp.get('/.well-known/jwks.json', (_q, r) => r.json({ keys: [jwk] }));
  jwksServer = jwksApp.listen(0);
  const jwksUrl = `http://localhost:${jwksServer.address().port}/.well-known/jwks.json`;

  process.env.MCP_ENABLED = 'true';
  process.env.MCP_BASE_URL = 'http://localhost';
  process.env.CLERK_ISSUER_URL = 'https://clerk.glowlytics.ai';
  process.env.CLERK_JWKS_URL = jwksUrl;
  process.env.MCP_DISABLE_RATE_LIMIT = '1';
  delete process.env.MCP_BETA_USER_IDS;
  // MCP-06: empty allowlist now denies unless GA is explicitly opted in.
  process.env.MCP_BETA_OPEN = 'true';

  jest.resetModules();
  const app = require('../../app');
  appServer = app.listen(0);

});

async function tokenFor(sub) {
  return new SignJWT({
    client_id: 'oauth_test_client',
    aud: `${process.env.MCP_BASE_URL}/mcp`,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer('https://clerk.glowlytics.ai')
    .setSubject(sub)
    .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
    .setIssuedAt()
    .sign(kp.privateKey);
}

afterAll(async () => {
  if (appServer) await new Promise((r) => appServer.close(r));
  if (jwksServer) jwksServer.close();
});

async function newClient(sub) {
  const t = await tokenFor(sub);
  const url = new URL(`http://localhost:${appServer.address().port}/mcp`);
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${t}` } },
  });
  const client = new Client({ name: 'jest-e2e', version: '0.0.1' }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

const EXPECTED_TOOLS = [
  'get_latest_scan',
  'get_scan_history',
  'get_signal_trend',
  'compare_scans',
  'get_scan_report',
  'get_current_routine',
  'lookup_ingredient',
  'search_ingredients',
  'summarize_month',
  'get_bone_structure',
  'get_harmony_trend',
];

test('initialize succeeds and lists all 11 tools', async () => {
  const { client, transport } = await newClient(`user_${Math.random().toString(36).slice(2)}`);
  try {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
  } finally {
    await transport.close();
  }
});

test('every tool can be invoked with minimal valid input and returns text content', async () => {
  const minimalArgs = {
    get_latest_scan: {},
    get_scan_history: {},
    get_signal_trend: { signal: 'hydration', period: '30d' },
    compare_scans: { a: 'd1', b: 'd2' },
    get_scan_report: {},
    get_current_routine: {},
    lookup_ingredient: { name: 'niacinamide' },
    search_ingredients: { query: 'vitamin' },
    summarize_month: {},
    get_bone_structure: {},
    get_harmony_trend: { period: '90d' },
  };

  const { client, transport } = await newClient(`user_${Math.random().toString(36).slice(2)}`);
  try {
    for (const name of EXPECTED_TOOLS) {
      const res = await client.callTool({ name, arguments: minimalArgs[name] });
      expect(res.content[0].type).toBe('text');
      expect(typeof res.content[0].text).toBe('string');
      expect(() => JSON.parse(res.content[0].text)).not.toThrow();
    }
  } finally {
    await transport.close();
  }
});

test('lookup_ingredient with invalid empty name surfaces a protocol error', async () => {
  const { client, transport } = await newClient(`user_${Math.random().toString(36).slice(2)}`);
  try {
    let caught = null;
    let result = null;
    try {
      result = await client.callTool({ name: 'lookup_ingredient', arguments: { name: '' } });
    } catch (err) {
      caught = err;
    }
    if (caught) {
      const code = caught.code ?? caught.error?.code;
      const msg = String(caught.message || '');
      expect(code === -32602 || /invalid|param|name/i.test(msg)).toBe(true);
    } else {
      // SDK surfaced as result.isError instead of throwing
      expect(result).not.toBeNull();
      expect(result.isError).toBe(true);
    }
  } finally {
    await transport.close();
  }
});
