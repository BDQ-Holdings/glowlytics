const { z } = require('zod');

const SIGNALS = ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'];

const empty = {};

const getScanHistoryInput = {
  days: z.number().int().min(1).max(90).default(30).describe('Days of history to include (1–90).'),
  limit: z.number().int().min(1).max(90).default(30).describe('Maximum scans to return (1–90).'),
};

const getSignalTrendInput = {
  signal: z.enum(SIGNALS).describe('Signal name (structure, hydration, inflammation, sunDamage, elasticity).'),
  period: z.enum(['7d', '30d', '90d']).describe('Time window.'),
};

const compareScansInput = {
  a: z.string().min(1).describe('Scan ID for the first scan.'),
  b: z.string().min(1).describe('Scan ID for the second scan.'),
};

const getScanReportInput = {
  scanId: z.string().min(1).optional().describe('Scan ID (defaults to latest).'),
};

const lookupIngredientInput = {
  name: z.string().min(1).max(100).describe('Ingredient name (e.g., niacinamide).'),
};

const searchIngredientsInput = {
  query: z.string().min(1).describe('Free-text search query.'),
  limit: z.number().int().min(1).max(25).default(10).describe('Maximum results to return.'),
};

const summarizeMonthInput = {
  month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Month in YYYY-MM. Defaults to current month.'),
};

module.exports = {
  SIGNALS,
  empty,
  getScanHistoryInput,
  getSignalTrendInput,
  compareScansInput,
  getScanReportInput,
  lookupIngredientInput,
  searchIngredientsInput,
  summarizeMonthInput,
};
