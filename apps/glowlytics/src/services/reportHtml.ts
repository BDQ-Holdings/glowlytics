export interface ReportHtmlData {
  timeRange: number;
  dateFrom: string;
  dateTo: string;
  ageRange: string;
  locationCoarse: string;
  scanRegion: string;
  totalScans: number;
  confidenceRate: number;
  acneAvg: number;
  acneDelta: number;
  acneScores: number[];
  sunAvg: number;
  sunDelta: number;
  sunScores: number[];
  ageAvg: number;
  ageDelta: number;
  ageScores: number[];
  photos: { date: string; base64: string }[];
  products: { name: string; ingredients: string; schedule: string; startDate: string }[];
  sunscreenRate: number;
  sunscreenDays: number;
  totalSunscreenDays: number;
  periodApplicable: boolean;
  cycleLengthDays?: number;
  hasSleepContext: boolean;
  generatedDate: string;
}

function sparklineSvg(data: number[], color: string, width: number, height: number): string {
  if (data.length < 2) {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="#ddd" stroke-width="2"/>
      <circle cx="${width * 0.68}" cy="${height / 2}" r="4" fill="${color}"/>
    </svg>`;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');

  const lastPoint = points.split(' ').pop()?.split(',') || ['0', '0'];

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <polyline points="${points}" fill="none" stroke="#ddd" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastPoint[0]}" cy="${lastPoint[1]}" r="4" fill="${color}"/>
  </svg>`;
}

function formatDelta(delta: number): string {
  if (delta > 0) return `<span style="color:#D14343">+${delta}</span>`;
  if (delta < 0) return `<span style="color:#34A77B">${delta}</span>`;
  return '<span style="color:#8E8E93">0</span>';
}

export function buildReportHtml(data: ReportHtmlData): string {
  const metricRow = (label: string, avg: number, delta: number, scores: number[], color: string) => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid #eee;">
      <div style="flex:1;">
        <div style="font-size:11px; color:#8E8E93; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:4px;">${label}</div>
        <div style="font-size:22px; font-weight:700; color:#1C1C1E;">${avg}<span style="font-size:13px; color:#8E8E93; font-weight:400;">/100</span></div>
      </div>
      <div style="flex:1; text-align:center;">
        ${sparklineSvg(scores, color, 160, 32)}
      </div>
      <div style="flex:0 0 60px; text-align:right; font-size:13px; font-weight:600;">
        ${formatDelta(delta)}
      </div>
    </div>`;

  const photosHtml = data.photos.length > 0
    ? data.photos.map((photo) => `
        <div style="display:inline-block; text-align:center; margin-right:16px;">
          <img src="data:image/jpeg;base64,${photo.base64}" style="width:120px; height:156px; object-fit:cover; border-radius:8px; border:1px solid #eee;"/>
          <div style="font-size:11px; color:#8E8E93; margin-top:6px;">${photo.date}</div>
        </div>`).join('')
    : '<p style="color:#8E8E93; font-size:13px;">No photos captured in this period.</p>';

  const productsHtml = data.products.length > 0
    ? data.products.map((product) => `
        <div style="padding:8px 0; border-bottom:1px solid #f0f0f0;">
          <div style="font-weight:600; font-size:14px; color:#1C1C1E;">${product.name}</div>
          <div style="font-size:12px; color:#48484A; margin-top:2px;">${product.ingredients} | ${product.schedule} | Since ${product.startDate}</div>
        </div>`).join('')
    : '<p style="color:#8E8E93; font-size:13px;">No products logged.</p>';

  const contextItems: string[] = [];
  contextItems.push(`Sunscreen adherence: ${data.sunscreenRate}% (${data.sunscreenDays}/${data.totalSunscreenDays} days)`);
  if (data.periodApplicable && data.cycleLengthDays) {
    contextItems.push(`Menstrual cycle: tracked (${data.cycleLengthDays} day cycle)`);
  }
  if (data.hasSleepContext) {
    contextItems.push('Sleep context: self-reported or device-supported');
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    @page { margin: 20mm 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1C1C1E; background: #fff; padding: 0; line-height: 1.5; }
    .page { max-width: 680px; margin: 0 auto; padding: 24px; }
    .header { border-bottom: 2px solid #3A9E8F; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 24px; font-weight: 700; color: #1C1C1E; margin-bottom: 4px; }
    .header p { font-size: 13px; color: #48484A; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 11px; font-weight: 600; color: #3A9E8F; text-transform: uppercase; letter-spacing: 1.1px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #eee; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
    .info-item { font-size: 13px; color: #48484A; }
    .info-label { font-weight: 600; color: #1C1C1E; }
    .disclaimer { background: #f8f8f6; border: 1px solid #eee; border-radius: 8px; padding: 14px; margin-top: 24px; }
    .disclaimer p { font-size: 11px; color: #8E8E93; line-height: 1.6; }
    .context-list { list-style: none; }
    .context-list li { font-size: 13px; color: #48484A; padding: 4px 0; }
    .context-list li::before { content: "\\2022"; color: #3A9E8F; font-weight: 700; margin-right: 8px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>Glowlytics Clinician Report</h1>
      <p>Trend summary for ${data.dateFrom} to ${data.dateTo} (${data.timeRange} days)</p>
    </div>

    <div class="section">
      <div class="section-title">Patient Summary</div>
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Age range:</span> ${data.ageRange}</div>
        <div class="info-item"><span class="info-label">Location:</span> ${data.locationCoarse}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Scan Protocol</div>
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Region:</span> ${data.scanRegion}</div>
        <div class="info-item"><span class="info-label">Cadence:</span> Daily</div>
        <div class="info-item"><span class="info-label">Scans completed:</span> ${data.totalScans} / ${data.timeRange}</div>
        <div class="info-item"><span class="info-label">Quality pass rate:</span> ${data.confidenceRate}%</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Trend Snapshot</div>
      ${metricRow('Acne', data.acneAvg, data.acneDelta, data.acneScores, '#D15A57')}
      ${metricRow('Sun Damage', data.sunAvg, data.sunDelta, data.sunScores, '#B88C3E')}
      ${metricRow('Skin Age', data.ageAvg, data.ageDelta, data.ageScores, '#4B7FCC')}
    </div>

    <div class="section">
      <div class="section-title">Representative Photos</div>
      ${photosHtml}
    </div>

    <div class="section">
      <div class="section-title">Products Used</div>
      ${productsHtml}
    </div>

    <div class="section">
      <div class="section-title">Context Overlay</div>
      <ul class="context-list">
        ${contextItems.map((item) => `<li>${item}</li>`).join('')}
      </ul>
    </div>

    <div class="disclaimer">
      <p>Non-diagnostic metrics for clinician interpretation only. Scores are generated by algorithmic analysis and should not replace clinical assessment. Generated by Glowlytics on ${data.generatedDate}.</p>
    </div>
  </div>
</body>
</html>`;
}
