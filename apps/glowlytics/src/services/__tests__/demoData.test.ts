import { createDemoHistory, createDemoSeed } from '../demoData';
import { FINDING_COPY } from '../../constants/boneStructure';
import type { BoneDomain, DailyRecord, ModelOutput } from '../../types';

const ALL_DOMAINS: readonly BoneDomain[] = [
  'symmetry',
  'periorbital',
  'mandibular',
  'midface',
  'nose',
  'brow',
];

const isFinite100 = (v: unknown): boolean =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

describe('createDemoHistory — facial structure + signal seeding', () => {
  it('emits 22 aligned daily records and model outputs', () => {
    const { records, outputs } = createDemoHistory();
    expect(records).toHaveLength(22);
    expect(outputs).toHaveLength(22);
    // Newest is last (oldest → newest), matching how DemoSeeder feeds the store.
    expect(outputs[outputs.length - 1].daily_id).toBe(records[records.length - 1].daily_id);
  });

  describe('(a) the newest output carries a complete BoneStructureResult', () => {
    const { outputs } = createDemoHistory();
    const newest = outputs[outputs.length - 1];
    const bone = newest.bone_structure;

    it('exists with an ok status and finite harmony', () => {
      expect(bone).toBeDefined();
      if (!bone) throw new Error('newest output has no bone_structure');
      expect(bone.status).toBe('ok');
      expect(typeof bone.harmony).toBe('number');
      expect(Number.isFinite(bone.harmony as number)).toBe(true);
    });

    it('scores all six domains within a believable range', () => {
      const ds = bone?.domain_scores ?? {};
      for (const d of ALL_DOMAINS) {
        expect(isFinite100(ds[d])).toBe(true);
      }
    });

    it('carries scored_metrics + metrics for the headline measurements', () => {
      if (!bone) throw new Error('no bone');
      for (const key of ['gonial_angle', 'zygomatic_projection', 'facial_index'] as const) {
        expect(Number.isFinite(bone.scored_metrics[key])).toBe(true);
        expect(Number.isFinite(bone.metrics[key]?.value)).toBe(true);
      }
      // facial_index drives the FACE RATIO cell; facial_thirds.raw drives the bar.
      expect(Number.isFinite(bone.metrics.facial_index.value)).toBe(true);
      const raw = bone.metrics.facial_thirds?.raw;
      expect(raw).toBeDefined();
      for (const t of ['t1', 't2', 't3'] as const) {
        expect(typeof raw?.[t]).toBe('number');
      }
    });

    it('has non-empty findings whose codes are all real FINDING_COPY keys', () => {
      if (!bone) throw new Error('no bone');
      expect(bone.findings.length).toBeGreaterThan(0);
      for (const f of bone.findings) {
        // Mirrors the UI: bone-results.tsx renders FINDING_COPY[f.findingCode].
        expect(FINDING_COPY[f.findingCode]).toBeDefined();
        expect(Number.isFinite(f.value)).toBe(true);
        expect(Number.isFinite(f.score)).toBe(true);
      }
      // Sorted worst-first, so the top finding matches the dominant driver.
      expect(bone.findings[0].score).toBeLessThanOrEqual(bone.findings[bone.findings.length - 1].score);
    });

    it('carries a full intervention bundle', () => {
      const iv = bone?.interventions;
      expect(iv).toBeDefined();
      if (!iv) throw new Error('no interventions');
      expect(Array.isArray(iv.lifestyle)).toBe(true);
      expect(Array.isArray(iv.pharmacological)).toBe(true);
      expect(Array.isArray(iv.interventional)).toBe(true);
      expect(iv.lifestyle.length).toBeGreaterThan(0);
      expect(typeof iv.procedural_disclaimer).toBe('string');
      expect(iv.procedural_disclaimer.length).toBeGreaterThan(0);
    });

    it('reads as a real (not estimated) indexed ARKit scan', () => {
      if (!bone) throw new Error('no bone');
      expect(bone.estimate).toBe(false);
      expect(bone.confidence).toBe('high');
      expect(bone.landmark_source).toBe('indexed');
      expect(bone.source).toBe('arkit');
      expect(ALL_DOMAINS).toContain(bone.dominant_driver);
      expect(typeof bone.generated_at).toBe('string');
    });
  });

  describe('(b) an earlier output also has finite harmony so delta-vs-previous works', () => {
    it('exposes at least two bone reads with finite harmony, trending up', () => {
      const { outputs } = createDemoHistory();
      const harmonies = outputs
        .map((o) => o.bone_structure?.harmony)
        .filter((h): h is number => typeof h === 'number' && Number.isFinite(h));
      expect(harmonies.length).toBeGreaterThanOrEqual(2);

      // Replicate bone-results' previous-bone walk from the newest output.
      const lastIdx = outputs.length - 1;
      let prev: number | null = null;
      for (let i = lastIdx - 1; i >= 0; i--) {
        const h = outputs[i].bone_structure?.harmony;
        if (typeof h === 'number' && Number.isFinite(h)) {
          prev = h;
          break;
        }
      }
      const newestHarmony = outputs[lastIdx].bone_structure?.harmony;
      expect(prev).not.toBeNull();
      expect(typeof newestHarmony).toBe('number');
      // Trending slightly up toward today.
      expect(newestHarmony as number).toBeGreaterThanOrEqual(prev as number);
    });
  });

  describe('(c) every output carries signal_scores that follow the skin arc', () => {
    it('populates all five signals in range on every output', () => {
      const { outputs } = createDemoHistory();
      for (const o of outputs) {
        const s = o.signal_scores;
        expect(s).toBeDefined();
        if (!s) throw new Error('missing signal_scores');
        for (const v of [s.structure, s.hydration, s.inflammation, s.sunDamage, s.elasticity]) {
          expect(isFinite100(v)).toBe(true);
        }
      }
    });

    it('derives calm/even/bounce signals directly from the day scores', () => {
      const { outputs } = createDemoHistory();
      for (const o of outputs) {
        const s = o.signal_scores;
        if (!s) throw new Error('missing signal_scores');
        expect(s.inflammation).toBe(100 - o.acne_score);
        expect(s.sunDamage).toBe(100 - o.sun_damage_score);
        expect(s.elasticity).toBe(100 - o.skin_age_score);
      }
    });

    it('trends upward over the window (skin improving)', () => {
      const { outputs } = createDemoHistory();
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const inflam = outputs.map((o) => o.signal_scores?.inflammation ?? 0);
      const firstFive = mean(inflam.slice(0, 5));
      const lastFive = mean(inflam.slice(-5));
      expect(lastFive).toBeGreaterThan(firstFive);
    });
  });

  it('createDemoSeed threads the enriched outputs through', () => {
    const seed = createDemoSeed();
    const newest = seed.outputs[seed.outputs.length - 1];
    expect(newest.bone_structure?.status).toBe('ok');
    expect(newest.bone_structure?.estimate).toBe(false);
    expect(newest.signal_scores).toBeDefined();
  });
});

// C-fix: demo data must be byte-identical across runs so screenshots, snapshot
// assertions, and tester sessions never drift. Values run through a seeded PRNG
// (mulberry32); only the date anchoring stays relative to `new Date()`.
describe('createDemoHistory — deterministic (seeded PRNG)', () => {
  const scoreSeq = (outputs: ModelOutput[]): number[][] =>
    outputs.map((o) => [o.acne_score, o.sun_damage_score, o.skin_age_score]);
  const indexSeq = (records: DailyRecord[]): DailyRecord['scanner_indices'][] =>
    records.map((r) => r.scanner_indices);

  it('produces identical score + scanner-index sequences across two calls', () => {
    const a = createDemoHistory();
    const b = createDemoHistory();
    expect(scoreSeq(a.outputs)).toEqual(scoreSeq(b.outputs));
    // scanner_indices are continuous floats — under Math.random these never
    // coincide run-to-run, so this pins true determinism, not lucky rounding.
    expect(indexSeq(a.records)).toEqual(indexSeq(b.records));
  });

  it('createDemoSeed yields identical score sequences run-to-run', () => {
    const a = createDemoSeed();
    const b = createDemoSeed();
    expect(scoreSeq(a.outputs)).toEqual(scoreSeq(b.outputs));
  });
});
