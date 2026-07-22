import {
  interpretDomainScore,
  interpretMetricScore,
  buildDriverReadout,
  resolveLabelCollisions,
  BONE_METRICS,
  FINDING_COPY,
  MEASUREMENT_LINES,
  MEASUREMENT_ANGLES,
  MEASUREMENT_OVERLAY_NOTES,
  METRIC_INTERPRETATION,
  formatMetricValue,
  type BoneMetricKey,
} from '../boneStructure';

describe('score interpretation', () => {
  test('midface 36 reads as below range with a plain-language meaning', () => {
    const r = interpretDomainScore('midface', 36);
    expect(r.band).toBe('below');
    expect(r.bandLabel).toBe('Below range');
    expect(r.label).toBe('Midface balance');
    expect(r.scoreText).toBe('36/100');
    expect(r.meaning).toMatch(/middle third of your face is set back/i);
  });

  test('a strong domain score reads as in-range', () => {
    const r = interpretDomainScore('symmetry', 88);
    expect(r.band).toBe('ideal');
    expect(r.bandLabel).toBe('In range');
  });

  test('a null domain score reads as pending, not a fake number', () => {
    const r = interpretDomainScore('midface', null);
    expect(r.scoreText).toBe('—');
    expect(r.bandLabel).toBe('Pending');
  });

  test('every metric produces a band and a non-empty meaning', () => {
    for (const m of BONE_METRICS) {
      const low = interpretMetricScore(m.key, 30);
      const high = interpretMetricScore(m.key, 90);
      expect(low.band).toBe('below');
      expect(high.band).toBe('ideal');
      expect(low.meaning.length).toBeGreaterThan(0);
      expect(high.meaning.length).toBeGreaterThan(0);
    }
  });

  test('new anthropometry metrics have display metadata, interpretation, and finding copy', () => {
    const requiredMetrics: BoneMetricKey[] = ['facial_index', 'mouth_nose_ratio', 'lip_ratio'];
    for (const key of requiredMetrics) {
      expect(BONE_METRICS.find((m) => m.key === key)).toBeTruthy();
      expect(METRIC_INTERPRETATION[key]?.below).toEqual(expect.any(String));
      expect(METRIC_INTERPRETATION[key]?.inRange).toEqual(expect.any(String));
    }

    for (const code of ['face_long', 'face_short', 'mouth_narrow', 'mouth_wide', 'lip_ratio_high', 'lip_ratio_low'] as const) {
      expect(FINDING_COPY[code]?.title).toEqual(expect.any(String));
      expect(FINDING_COPY[code]?.description).toEqual(expect.any(String));
    }
  });

  test('projection and lid metrics format as ratios, not fabricated millimetres', () => {
    expect(formatMetricValue('chin_projection', 0.1234)).toBe('0.12');
    expect(formatMetricValue('zygomatic_projection', 0.0678)).toBe('0.07');
    expect(formatMetricValue('scleral_show', 0.0456)).toBe('0.05');
    expect(formatMetricValue('gonial_angle', 128.44)).toBe('128.4°');
  });

  test('every metric has a measurement overlay or an explicit non-line reason', () => {
    const lineKeys = MEASUREMENT_LINES.map((line) => line.metricKey);
    const angleKeys = MEASUREMENT_ANGLES.map((angle) => angle.metricKey);

    for (const metric of BONE_METRICS) {
      expect(
        lineKeys.includes(metric.key) ||
        angleKeys.includes(metric.key) ||
        Boolean(MEASUREMENT_OVERLAY_NOTES[metric.key]),
      ).toBe(true);
    }
    expect(MEASUREMENT_OVERLAY_NOTES.fluctuating_asymmetry).toMatch(/paired/i);
  });

  test('buildDriverReadout interprets the dominant driver, null when none', () => {
    const r = buildDriverReadout({ dominant_driver: 'midface', domain_scores: { midface: 36 } });
    expect(r).not.toBeNull();
    expect(r?.label).toBe('Midface balance');
    expect(r?.meaning).toMatch(/middle third/i);
    expect(buildDriverReadout({ dominant_driver: null, domain_scores: {} })).toBeNull();
  });
});

describe('resolveLabelCollisions', () => {
  test('separates two labels stacked at the same position with at least the default 4px gap', () => {
    const out = resolveLabelCollisions(
      [
        { x: 100, y: 50, width: 60, height: 12 },
        { x: 100, y: 50, width: 60, height: 12 },
        { x: 100, y: 55, width: 60, height: 12 },
      ],
    );
    for (let i = 1; i < out.length; i++) {
      expect(out[i].y - (out[i - 1].y + out[i - 1].height)).toBeGreaterThanOrEqual(4);
    }
    expect(out).toHaveLength(3);
  });

  test('leaves already-separated labels in place', () => {
    const out = resolveLabelCollisions([
      { x: 100, y: 10, width: 40, height: 12 },
      { x: 100, y: 60, width: 40, height: 12 },
    ]);
    expect(out[0].y).toBe(10);
    expect(out[1].y).toBe(60);
  });

  test('does not move horizontally-clear labels', () => {
    const out = resolveLabelCollisions([
      { x: 20, y: 50, width: 30, height: 12 },
      { x: 200, y: 50, width: 30, height: 12 },
    ]);
    expect(out[1].y).toBe(50);
  });
});
