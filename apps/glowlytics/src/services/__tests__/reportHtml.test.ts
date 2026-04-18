import { buildReportHtml, type ReportHtmlData } from '../reportHtml';

const baseData: ReportHtmlData = {
  timeRange: 14,
  dateFrom: '2026-03-02',
  dateTo: '2026-03-16',
  ageRange: '25-34',
  locationCoarse: 'New York, US',
  scanRegion: 'whole face',
  totalScans: 10,
  confidenceRate: 90,
  acneAvg: 42,
  acneDelta: -5,
  acneScores: [48, 45, 43, 40, 42],
  sunAvg: 35,
  sunDelta: 3,
  sunScores: [32, 33, 35, 36, 38],
  ageAvg: 28,
  ageDelta: 0,
  ageScores: [28, 29, 27, 28, 28],
  photos: [],
  products: [],
  sunscreenRate: 80,
  sunscreenDays: 8,
  totalSunscreenDays: 10,
  periodApplicable: false,
  hasSleepContext: false,
  generatedDate: '2026-03-16',
};

describe('buildReportHtml', () => {
  it('returns valid HTML with all section headings', () => {
    const html = buildReportHtml(baseData);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Patient Summary');
    expect(html).toContain('Scan Protocol');
    expect(html).toContain('Trend Snapshot');
    expect(html).toContain('Representative Photos');
    expect(html).toContain('Products Used');
    expect(html).toContain('Context Overlay');
  });

  it('includes patient summary data', () => {
    const html = buildReportHtml(baseData);
    expect(html).toContain('25-34');
    expect(html).toContain('New York, US');
  });

  it('includes scan protocol data', () => {
    const html = buildReportHtml(baseData);
    expect(html).toContain('whole face');
    expect(html).toContain('10 / 14');
    expect(html).toContain('90%');
  });

  it('includes date range in header', () => {
    const html = buildReportHtml(baseData);
    expect(html).toContain('2026-03-02');
    expect(html).toContain('2026-03-16');
    expect(html).toContain('14 days');
  });

  it('shows "No photos captured" when photos array is empty', () => {
    const html = buildReportHtml({ ...baseData, photos: [] });
    expect(html).toContain('No photos captured');
    expect(html).not.toContain('data:image/jpeg;base64,');
  });

  it('embeds photos as base64 data URIs', () => {
    const html = buildReportHtml({
      ...baseData,
      photos: [{ date: '2026-03-10', base64: 'abc123==' }],
    });
    expect(html).toContain('data:image/jpeg;base64,abc123==');
    expect(html).toContain('2026-03-10');
  });

  it('shows "No products logged" when products array is empty', () => {
    const html = buildReportHtml({ ...baseData, products: [] });
    expect(html).toContain('No products logged');
  });

  it('includes product details when products are present', () => {
    const html = buildReportHtml({
      ...baseData,
      products: [{ name: 'CeraVe Moisturizer', ingredients: 'Ceramides, Hyaluronic Acid', schedule: 'PM', startDate: '2026-02-01' }],
    });
    expect(html).toContain('CeraVe Moisturizer');
    expect(html).toContain('Ceramides, Hyaluronic Acid');
    expect(html).toContain('PM');
    expect(html).toContain('2026-02-01');
  });

  it('formats positive delta with + sign and error color', () => {
    const html = buildReportHtml({ ...baseData, sunDelta: 3 });
    expect(html).toContain('+3');
    expect(html).toContain('#D14343');
  });

  it('formats negative delta with success color', () => {
    const html = buildReportHtml({ ...baseData, acneDelta: -5 });
    expect(html).toContain('-5');
    expect(html).toContain('#34A77B');
  });

  it('formats zero delta', () => {
    const html = buildReportHtml({ ...baseData, ageDelta: 0 });
    expect(html).toContain('>0</span>');
  });

  it('generates sparkline SVGs with polyline for multiple data points', () => {
    const html = buildReportHtml(baseData);
    expect(html).toContain('<svg');
    expect(html).toContain('<polyline');
  });

  it('generates sparkline with flat line for single data point', () => {
    const html = buildReportHtml({
      ...baseData,
      acneScores: [42],
    });
    // Single point should produce a flat line (no polyline)
    expect(html).toContain('<svg');
    expect(html).toContain('<line');
  });

  it('handles all same values in sparkline without crashing', () => {
    const html = buildReportHtml({
      ...baseData,
      acneScores: [50, 50, 50, 50],
    });
    expect(html).toContain('<polyline');
  });

  it('includes sunscreen adherence in context', () => {
    const html = buildReportHtml(baseData);
    expect(html).toContain('Sunscreen adherence: 80%');
    expect(html).toContain('8/10 days');
  });

  it('includes menstrual context when applicable', () => {
    const html = buildReportHtml({
      ...baseData,
      periodApplicable: true,
      cycleLengthDays: 28,
    });
    expect(html).toContain('Menstrual cycle: tracked (28 day cycle)');
  });

  it('omits menstrual context when not applicable', () => {
    const html = buildReportHtml({ ...baseData, periodApplicable: false });
    expect(html).not.toContain('Menstrual cycle');
  });

  it('includes sleep context when present', () => {
    const html = buildReportHtml({ ...baseData, hasSleepContext: true });
    expect(html).toContain('Sleep context: self-reported or device-supported');
  });

  it('includes disclaimer with generated date', () => {
    const html = buildReportHtml(baseData);
    expect(html).toContain('Non-diagnostic metrics');
    expect(html).toContain('2026-03-16');
  });

  it('uses correct metric colors', () => {
    const html = buildReportHtml(baseData);
    expect(html).toContain('#D15A57'); // acne
    expect(html).toContain('#B88C3E'); // sun damage
    expect(html).toContain('#4B7FCC'); // skin age
  });
});
