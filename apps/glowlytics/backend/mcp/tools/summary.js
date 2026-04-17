const {
  getScanHistory,
  computeSignalTrend,
  SIGNAL_NAMES,
} = require('../../queries/scans');
const { getReportForScan } = require('../../queries/reports');
const { getCurrentRoutine } = require('../../queries/routine');
const { asJsonText } = require('../tool-helpers');
const schemas = require('../schemas');

function currentMonth(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function daysInMonth(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function rowMonth(row) {
  const d = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
  return d.slice(0, 7);
}

function averageSignals(rows) {
  const sums = {};
  const counts = {};
  for (const row of rows) {
    const s = row.signal_scores || {};
    for (const name of SIGNAL_NAMES) {
      if (typeof s[name] === 'number') {
        sums[name] = (sums[name] || 0) + s[name];
        counts[name] = (counts[name] || 0) + 1;
      }
    }
  }
  const out = {};
  for (const name of SIGNAL_NAMES) {
    if (counts[name]) out[name] = Math.round((sums[name] / counts[name]) * 10) / 10;
  }
  return out;
}

function topRecForReport(report) {
  if (!report || !Array.isArray(report.recommendations) || report.recommendations.length === 0) return null;
  const r = report.recommendations[0];
  return {
    title: r.title || r.name || 'Recommendation',
    rationale: r.rationale || r.snippet || null,
    scanId: report.scanId,
  };
}

function registerSummaryTool(server, { userId }) {
  server.registerTool(
    'summarize_month',
    {
      title: 'Summarize a month',
      description: "Compose scans, trends, current routine, and top recommendations for a calendar month (defaults to current).",
      inputSchema: schemas.summarizeMonthInput,
    },
    async ({ month } = {}) => {
      const target = month || currentMonth();
      const days = daysInMonth(target);
      const all = await getScanHistory(userId, { days: 90, limit: 90 });
      const inMonth = all.filter((r) => rowMonth(r) === target);

      const scanCount = inMonth.length;
      const latestOverall = scanCount > 0
        ? (inMonth[0].acne_score ?? inMonth[0].skin_age_score ?? null)
        : null;
      const signalAverages = scanCount > 0 ? averageSignals(inMonth) : {};

      let signalTrends = null;
      if (scanCount > 0) {
        signalTrends = {};
        for (const name of SIGNAL_NAMES) {
          try {
            const t = await computeSignalTrend(userId, name, '30d');
            signalTrends[name] = { delta: t.delta, direction: t.direction };
          } catch {
            // Skip signals that have no data; never fabricate.
          }
        }
      }

      const currentRoutine = await getCurrentRoutine(userId);

      const topRecommendations = [];
      for (const row of inMonth.slice(0, 3)) {
        const report = await getReportForScan(userId, row.daily_id);
        const rec = topRecForReport(report);
        if (rec) topRecommendations.push(rec);
      }

      return asJsonText({
        month: target,
        windowDays: days,
        scanCount,
        latestOverall,
        signalAverages,
        signalTrends,
        currentRoutine: {
          am: currentRoutine.am.map((p) => ({ name: p.product_name, schedule: p.usage_schedule || null })),
          pm: currentRoutine.pm.map((p) => ({ name: p.product_name, schedule: p.usage_schedule || null })),
          conflicts: currentRoutine.conflicts,
        },
        topRecommendations,
      });
    }
  );
}

module.exports = { registerSummaryTool };
