function asJsonText(payload) {
  return {
    content: [
      { type: 'text', text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function projectScan(row) {
  if (!row) return null;
  return {
    scanId: row.daily_id,
    date: row.date,
    overallScore: row.acne_score ?? row.skin_age_score ?? null,
    signals: row.signal_scores || {},
  };
}

module.exports = { asJsonText, projectScan };
