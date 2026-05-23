import {
  buildLayer3FromDeterministic,
  buildInsightsFromDeterministic,
  SIGNAL_KEYS,
  SIGNAL_LABELS,
} from '../onDeviceInsightsFallback';
import type { DetectedLesion } from '../../types';

const makeLesion = (overrides: Partial<DetectedLesion>): DetectedLesion => ({
  class: 'acne',
  confidence: 0.5,
  bbox: [0.1, 0.1, 0.05, 0.05],
  zone: 'forehead',
  tier: 'confirmed',
  ...overrides,
});

describe('buildLayer3FromDeterministic', () => {
  it('clamps signal scores into 0-100 and produces legacy scalar scores', () => {
    const result = buildLayer3FromDeterministic({
      layer1Scores: { structure: 80, hydration: 70, inflammation: 90, sunDamage: 60, elasticity: 75 },
      layer2Overrides: { structure: 85, hydration: 72, sunDamage: 65, elasticity: 80 },
    });

    for (const k of SIGNAL_KEYS) {
      expect(result.signal_scores[k]).toBeGreaterThanOrEqual(0);
      expect(result.signal_scores[k]).toBeLessThanOrEqual(100);
    }
    // L2-overridden signals average with L1
    expect(result.signal_scores.structure).toBe(Math.round((80 + 85) / 2));
    // Inflammation has no L2, so it stays at L1
    expect(result.signal_scores.inflammation).toBe(90);
    // Legacy fields are inverses of signal scores
    expect(result.acne_score).toBe(100 - 90);
    expect(result.sun_damage_score).toBe(100 - result.signal_scores.sunDamage);
  });

  it('falls back to neutral 50 when no L1 input is provided', () => {
    const result = buildLayer3FromDeterministic({});
    for (const k of SIGNAL_KEYS) {
      expect(result.signal_scores[k]).toBe(50);
    }
  });

  it('synthesises a single acne condition from confirmed lesions', () => {
    const result = buildLayer3FromDeterministic({
      layer1Scores: { structure: 70, hydration: 70, inflammation: 70, sunDamage: 70, elasticity: 70 },
      lesions: [
        makeLesion({ zone: 'forehead' }),
        makeLesion({ zone: 'forehead' }),
        makeLesion({ zone: 'left_cheek' }),
      ],
    });
    expect(result.conditions).toHaveLength(1);
    const condition = result.conditions[0];
    expect(condition.name).toBe('acne');
    // Two forehead lesions → moderate severity on that zone
    const forehead = condition.zones.find((z) => z.region === 'forehead');
    expect(forehead?.severity).toBe('moderate');
  });

  it('produces a zone_severity entry for every facial region', () => {
    const result = buildLayer3FromDeterministic({});
    expect(Object.keys(result.zone_severity)).toEqual(
      expect.arrayContaining(['forehead', 'left_cheek', 'right_cheek', 'nose', 'chin', 'jaw']),
    );
  });

  it('picks the weakest signal as the primary driver', () => {
    const result = buildLayer3FromDeterministic({
      layer1Scores: { structure: 90, hydration: 30, inflammation: 95, sunDamage: 80, elasticity: 85 },
    });
    // Hydration is the lowest score → primary driver mentions moisture/barrier
    expect(result.primary_driver).toMatch(/moisture|barrier/i);
    expect(result.personalized_feedback).toContain(SIGNAL_LABELS.hydration);
  });
});

describe('buildInsightsFromDeterministic', () => {
  it('returns the full GeneratedInsights shape', () => {
    const result = buildInsightsFromDeterministic({
      signal_scores: { structure: 70, hydration: 65, inflammation: 80, sunDamage: 75, elasticity: 72 },
    });

    expect(typeof result.overall_summary).toBe('string');
    expect(result.overall_summary.length).toBeGreaterThan(0);
    expect(typeof result.overall_score_context).toBe('string');
    expect(Object.keys(result.signal_insights)).toEqual(
      expect.arrayContaining([...SIGNAL_KEYS]),
    );
    for (const k of SIGNAL_KEYS) {
      expect(result.signal_insights[k]).toEqual(
        expect.objectContaining({
          status: expect.stringContaining(SIGNAL_LABELS[k]),
          driver: expect.any(String),
          action: expect.any(String),
        }),
      );
    }
    expect(result.action_plan.length).toBe(3);
  });

  it('includes lesion-zone findings when confirmed lesions are present', () => {
    const result = buildInsightsFromDeterministic({
      signal_scores: { structure: 50, hydration: 50, inflammation: 50, sunDamage: 50, elasticity: 50 },
      lesions: [
        makeLesion({ zone: 'chin' }),
        makeLesion({ zone: 'chin' }),
      ],
    });
    expect(result.zone_findings.length).toBeGreaterThan(0);
    const chinFinding = result.zone_findings.find((z) => z.zone === 'chin');
    expect(chinFinding?.finding).toMatch(/active lesion/i);
  });

  it('uses the baseline-context message on the first scan', () => {
    const result = buildInsightsFromDeterministic({
      signal_scores: { structure: 60, hydration: 60, inflammation: 60, sunDamage: 60, elasticity: 60 },
      scan_count: 0,
    });
    expect(result.overall_score_context).toMatch(/baseline/i);
  });
});
