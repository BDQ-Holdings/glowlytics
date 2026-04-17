const { getReportForScan } = require('../../queries/reports');
const { getLatestScan } = require('../../queries/scans');
const { asJsonText } = require('../tool-helpers');
const schemas = require('../schemas');

function registerReportTools(server, { userId }) {
  server.registerTool(
    'get_scan_report',
    {
      title: 'Get scan report',
      description: 'Return the narrative + recommendations + citations for a scan. Defaults to the latest scan.',
      inputSchema: schemas.getScanReportInput,
    },
    async ({ scanId } = {}) => {
      let id = scanId;
      if (!id) {
        const latest = await getLatestScan(userId);
        if (!latest) return asJsonText(null);
        id = latest.daily_id;
      }
      const report = await getReportForScan(userId, id);
      return asJsonText(report);
    }
  );
}

module.exports = { registerReportTools };
