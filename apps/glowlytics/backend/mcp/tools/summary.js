const { getScansInDateRange, SIGNAL_NAMES } = require('../../queries/scans');
const { getReportForScan } = require('../../queries/reports');
const { getCurrentRoutine } = require('../../queries/routine');
const { asJsonText, computeOverallFromSignals } = require('../tool-helpers');
const schemas = require('../schemas');

const FLAT_BAND = 1;

function currentMonth(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function daysInMonth(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthBounds(yyyymm) {
  const days = daysInMonth(yyyymm);
  return {
    start: `${yyyymm}-01`,
    end: `${yyyymm}-${String(days).padStart(2, '0')}`,
    days,
  };
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

// Trend over the requested calendar month, derived from the in-month rows the
// caller already fetched. Anchored to the month, not CURRENT_DATE — so a
// summary for a past month does not mix in the trailing-30d window.
// Rows arrive newest-first; first = most recent in-month, last = earliest.
function trendForSignal(rowsNewestFirst, signal) {
  const values = rowsNewestFirst
    .map((r) => (r.signal_scores ? r.signal_scores[signal] : undefined))
    .filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  const latest = values[0];
  const earliest = values[values.length - 1];
  const delta = latest - earliest;
  let direction = 'flat';
  if (delta > FLAT_BAND) direction = 'up';
  else if (delta < -FLAT_BAND) direction = 'down';
  return { delta, direction };
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
      const { start, end, days } = monthBounds(target);
      // Calendar-anchored query so months outside the trailing 90-day window
      // (e.g. summarize_month({ month: '2026-01' }) requested in April) still
      // return complete month data instead of being silently truncated.
      const inMonth = await getScansInDateRange(userId, start, end, { limit: 200 });

      const scanCount = inMonth.length;
      const latestOverall = scanCount > 0
        ? computeOverallFromSignals(inMonth[0].signal_scores)
        : null;
      const signalAverages = scanCount > 0 ? averageSignals(inMonth) : {};

      // Trends are computed from the same in-month rows so a summary of e.g.
      // March 2026, requested in April, does not mix in April data.
      let signalTrends = null;
      if (scanCount > 0) {
        signalTrends = {};
        for (const name of SIGNAL_NAMES) {
          const t = trendForSignal(inMonth, name);
          if (t) signalTrends[name] = t;
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
