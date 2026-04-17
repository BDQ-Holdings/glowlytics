const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');

const SERVER_INFO = {
  name: 'glowlytics-mcp',
  version: '0.1.0',
};

const TOOL_REGISTRARS = [];

function registerToolsWith(server, ctx) {
  for (const fn of TOOL_REGISTRARS) {
    fn(server, ctx);
  }
}

function addToolRegistrar(fn) {
  TOOL_REGISTRARS.push(fn);
}

function buildMcpServer({ userId }) {
  const server = new McpServer(SERVER_INFO, { capabilities: { tools: {} } });
  registerToolsWith(server, { userId });
  return server;
}

module.exports = { buildMcpServer, addToolRegistrar };
