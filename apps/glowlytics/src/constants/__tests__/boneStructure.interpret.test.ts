import {
  interpretDomainScore,
  interpretMetricScore,
  buildDriverReadout,
  resolveLabelCollisions,
  BONE_METRICS,
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

  test('buildDriverReadout interprets the dominant driver, null when none', () => {
    const r = buildDriverReadout({ dominant_driver: 'midface', domain_scores: { midface: 36 } });
    expect(r).not.toBeNull();
    expect(r?.label).toBe('Midface balance');
    expect(r?.meaning).toMatch(/middle third/i);
    expect(buildDriverReadout({ dominant_driver: null, domain_scores: {} })).toBeNull();
  });
});

describe('resolveLabelCollisions', () => {
  test('separates two labels stacked at the same position', () => {
    const out = resolveLabelCollisions(
      [
        { x: 100, y: 50, width: 60, height: 12 },
        { x: 100, y: 50, width: 60, height: 12 },
      ],
      2,
    );
    const [a, b] = out;
    const overlapY = a.y < b.y + b.height && b.y < a.y + a.height;
    const overlapX = Math.abs(a.x - b.x) * 2 < a.width + b.width;
    expect(overlapX && overlapY).toBe(false);
    expect(out).toHaveLength(2);
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
