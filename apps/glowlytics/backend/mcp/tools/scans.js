const {
  getLatestScan,
  getScanHistory,
  computeSignalTrend,
  compareScans,
} = require('../../queries/scans');
const { asJsonText, projectScan } = require('../tool-helpers');
const schemas = require('../schemas');

function registerScanTools(server, { userId }) {
  server.registerTool(
    'get_latest_scan',
    {
      title: 'Get latest scan',
      description: "Return the user's most recent skin scan with overall score and per-signal scores.",
      inputSchema: schemas.empty,
    },
    async () => asJsonText(projectScan(await getLatestScan(userId)))
  );

  server.registerTool(
    'get_scan_history',
    {
      title: 'Get scan history',
      description: "Return a list of the user's recent skin scans, newest first.",
      inputSchema: schemas.getScanHistoryInput,
    },
    async ({ days, limit }) => {
      const rows = await getScanHistory(userId, { days, limit });
      return asJsonText(rows.map(projectScan));
    }
  );

  server.registerTool(
    'get_signal_trend',
    {
      title: 'Get signal trend',
      description: 'Return a time series and direction (up/down/flat) for one signal over a 7d, 30d, or 90d window.',
      inputSchema: schemas.getSignalTrendInput,
    },
    async ({ signal, period }) => asJsonText(await computeSignalTrend(userId, signal, period))
  );

  server.registerTool(
    'compare_scans',
    {
      title: 'Compare two scans',
      description: 'Compare per-signal scores between two of the user’s scans.',
      inputSchema: schemas.compareScansInput,
    },
    async ({ a, b }) => {
      const cmp = await compareScans(userId, { a, b });
      return asJsonText({
        a: projectScan(cmp.a),
        b: projectScan(cmp.b),
        signalDeltas: cmp.signalDeltas,
      });
    }
  );
}

module.exports = { registerScanTools };
