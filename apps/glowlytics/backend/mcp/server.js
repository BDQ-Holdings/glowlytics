const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { registerScanTools } = require('./tools/scans');
const { registerReportTools } = require('./tools/reports');
const { registerRoutineTools } = require('./tools/routine');
const { registerIngredientTools } = require('./tools/ingredients');
const { registerSummaryTool } = require('./tools/summary');
const { registerBoneStructureTools } = require('./tools/bone-structure');

const SERVER_INFO = {
  name: 'glowlytics-mcp',
  version: '0.1.0',
};

const TOOL_REGISTRARS = [
  registerScanTools,
  registerReportTools,
  registerRoutineTools,
  registerIngredientTools,
  registerSummaryTool,
  registerBoneStructureTools,
];

function addToolRegistrar(fn) {
  TOOL_REGISTRARS.push(fn);
}

function buildMcpServer({ userId }) {
  const server = new McpServer(SERVER_INFO, { capabilities: { tools: {} } });
  for (const fn of TOOL_REGISTRARS) {
    fn(server, { userId });
  }
  return server;
}

module.exports = { buildMcpServer, addToolRegistrar };
