const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { requireMcpAuth } = require('./auth');
const { mcpRateLimit } = require('./rate-limit');
const { buildMcpServer } = require('./server');

async function mcpHandler(req, res) {
  const transport = new StreamableHTTPServerTransport({});
  const server = buildMcpServer({ userId: req.userId });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
        id: null,
      });
    }
  }
}

function mountMcp(app) {
  app.post('/mcp', requireMcpAuth, mcpRateLimit, mcpHandler);
  app.get('/mcp', requireMcpAuth, mcpRateLimit, mcpHandler);
  app.delete('/mcp', requireMcpAuth, mcpRateLimit, mcpHandler);
}

module.exports = { mountMcp };
