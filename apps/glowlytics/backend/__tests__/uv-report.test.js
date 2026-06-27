const { buildReportPdf } = require('../uv-report');

function isPdf(buf) {
  return Buffer.isBuffer(buf) && buf.slice(0, 5).toString() === '%PDF-';
}

const fullScan = {
  scan_id: 'scan_test_123',
  created_at: '2026-06-26T12:00:00.000Z',
  overall: { sunDamageScore: 72, severity: 'high', confidence: 0.81 },
  regions: [
    { id: 'forehead', label: 'Forehead', side: 'center', score: 64, intensity: 0.64, spotCount: 12 },
    { id: 'periorbital_left', label: 'Left eye area', side: 'left', score: 81, intensity: 0.81, spotCount: 7 },
    { id: 'periorbital_right', label: 'Right eye area', side: 'right', score: 55, intensity: 0.55, spotCount: 4 },
    { id: 'cheek_left', label: 'Left cheek', side: 'left', score: 77, intensity: 0.77, spotCount: 9 },
    { id: 'cheek_right', label: 'Right cheek', side: 'right', score: 49, intensity: 0.49, spotCount: 3 },
    { id: 'nose', label: 'Nose', side: 'center', score: 33, intensity: 0.33, spotCount: 2 },
    { id: 'perioral_chin', label: 'Mouth & chin', side: 'center', score: 28, intensity: 0.28, spotCount: 1 },
  ],
  asymmetry: {
    score: 41,
    dominantSide: 'left',
    leftMean: 0.71,
    rightMean: 0.5,
    perRegionDelta: [{ pair: 'cheek', delta: 0.28 }],
  },
  heatmap: (() => {
    const cols = 12;
    const rows = 16;
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // left-leaning gradient for a deterministic, visually sensible map
        cells.push(Math.round((c / (cols - 1)) * 1000) / 1000);
      }
    }
    return { cols, rows, bounds: { x: 0.2, y: 0.15, w: 0.6, h: 0.7 }, cells };
  })(),
  screener: { ok: true, canProceed: true, confidence: 0.81, checks: [] },
};

const lead = { email: 'jane@example.com', report_token: 'tok_abc' };

describe('uv-report buildReportPdf', () => {
  it('renders a full scan fixture to a valid, non-trivial PDF Buffer', async () => {
    const buf = await buildReportPdf(fullScan, lead);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('personalizes with the lead email without throwing when email present', async () => {
    const buf = await buildReportPdf(fullScan, lead);
    expect(isPdf(buf)).toBe(true);
  });

  it('renders a minimal scan with no regions/heatmap to a valid PDF (no throw)', async () => {
    const minimal = { overall: { sunDamageScore: 0, severity: 'low', confidence: 0 } };
    const buf = await buildReportPdf(minimal, {});
    expect(isPdf(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('renders a heatmap with a few cells without throwing', async () => {
    const scan = {
      overall: { sunDamageScore: 50, severity: 'moderate', confidence: 0.5 },
      heatmap: { cols: 2, rows: 2, cells: [0.1, 0.4, 0.7, 1.0] },
    };
    const buf = await buildReportPdf(scan, {});
    expect(isPdf(buf)).toBe(true);
  });

  it('does not throw on a completely empty scan / missing lead', async () => {
    const buf = await buildReportPdf({}, undefined);
    expect(isPdf(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('survives malformed fields (wrong types, out-of-range, partial rows)', async () => {
    const scan = {
      overall: { sunDamageScore: 9999, severity: 42, confidence: 'nope' },
      regions: [{ id: 'forehead' }, null, { score: 'x', spotCount: -3, intensity: 5 }],
      asymmetry: { score: 'big', dominantSide: 999 },
      heatmap: { cols: '3', rows: 2, cells: ['a', 0.5, null, 1, 0.2, 2] },
    };
    const buf = await buildReportPdf(scan, { email: 12345 });
    expect(isPdf(buf)).toBe(true);
  });

  it('handles a balanced asymmetry result', async () => {
    const scan = {
      overall: { sunDamageScore: 20, severity: 'low', confidence: 0.6 },
      asymmetry: { score: 3, dominantSide: 'balanced', leftMean: 0.2, rightMean: 0.21 },
    };
    const buf = await buildReportPdf(scan, {});
    expect(isPdf(buf)).toBe(true);
  });
});
