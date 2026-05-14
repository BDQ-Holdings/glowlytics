const { z } = require('zod');
const { asJsonText } = require('../tool-helpers');
const {
  getLatestBoneStructure,
  getBoneStructureForScan,
  computeHarmonyTrend,
} = require('../../queries/bone-structure');

function projectBoneStructure(row) {
  if (!row || !row.bone_structure) return null;
  const bs = typeof row.bone_structure === 'string' ? JSON.parse(row.bone_structure) : row.bone_structure;
  return {
    scanId: row.daily_id,
    date: row.date,
    harmony: bs.harmony,
    domainScores: bs.domain_scores,
    dominantDriver: bs.dominant_driver,
    sex: bs.sex,
    source: bs.source,
    findings: bs.findings,
    // Suggestion titles flattened per tier so the model can quote them
    // verbatim without traversing the nested interventions structure.
    suggestions: {
      lifestyle: (bs.interventions?.lifestyle || []).map((s) => s.title),
      pharmacological: (bs.interventions?.pharmacological || []).map((s) => s.title),
      interventional: (bs.interventions?.interventional || []).map((s) => s.title),
    },
  };
}

const getBoneStructureInput = {
  scanId: z.string().min(1).optional().describe('Scan ID (defaults to latest scan with bone-structure data).'),
};

const getHarmonyTrendInput = {
  period: z.enum(['30d', '90d', '180d', '365d']).describe('Time window for the trend.'),
};

function registerBoneStructureTools(server, { userId }) {
  server.registerTool(
    'get_bone_structure',
    {
      title: 'Get bone structure',
      description: "Return the user's facial bone-structure analysis (Harmony score, per-domain scores, findings, intervention suggestions across lifestyle/pharmacological/interventional tiers) for one scan. Defaults to the latest scan with bone-structure data.",
      inputSchema: getBoneStructureInput,
    },
    async ({ scanId } = {}) => {
      const row = scanId
        ? await getBoneStructureForScan(userId, scanId)
        : await getLatestBoneStructure(userId);
      return asJsonText(projectBoneStructure(row));
    }
  );

  server.registerTool(
    'get_harmony_trend',
    {
      title: 'Get Harmony trend',
      description: 'Return a time series and direction (up/down/flat) of the Harmony composite bone-structure score over 30/90/180/365 days.',
      inputSchema: getHarmonyTrendInput,
    },
    async ({ period }) => asJsonText(await computeHarmonyTrend(userId, period))
  );
}

module.exports = {
  registerBoneStructureTools,
  projectBoneStructure,
};
