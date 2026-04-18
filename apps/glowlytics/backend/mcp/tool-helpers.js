const SIGNAL_NAMES = ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'];

function asJsonText(payload) {
  return {
    content: [
      { type: 'text', text: JSON.stringify(payload, null, 2) },
    ],
  };
}

// Mirrors apps/glowlytics/src/services/patternEngine.ts computeOverall —
// arithmetic mean of the five composite signal scores, ignoring missing values.
function computeOverallFromSignals(signalScores) {
  if (!signalScores || typeof signalScores !== 'object') return null;
  const values = SIGNAL_NAMES
    .map((k) => signalScores[k])
    .filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function projectScan(row) {
  if (!row) return null;
  return {
    scanId: row.daily_id,
    date: row.date,
    overallScore: computeOverallFromSignals(row.signal_scores),
    signals: row.signal_scores || {},
  };
}

module.exports = { asJsonText, projectScan, computeOverallFromSignals, SIGNAL_NAMES };
