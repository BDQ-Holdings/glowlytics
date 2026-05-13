import { computeSignalHistory, deriveCompositeSignals } from '../skinInsights';
import type { DailyRecord, ModelOutput } from '../../types';

const makeRecord = (date: string, overrides?: Partial<DailyRecord>): DailyRecord => ({
  daily_id: `daily-${date}`,
  user_id: 'user-1',
  date,
  scanner_reading_id: `scan-${date}`,
  scanner_indices: {
    inflammation_index: 30,
    pigmentation_index: 25,
    texture_index: 35,
  },
  scanner_quality_flag: 'pass',
  scan_region: 'whole_face',
  sunscreen_used: true,
  new_product_added: false,
  ...overrides,
});

const makeOutput = (dailyId: string, overrides?: Partial<ModelOutput>): ModelOutput => ({
  output_id: `out-${dailyId}`,
  daily_id: dailyId,
  acne_score: 30,
  sun_damage_score: 25,
  skin_age_score: 35,
  confidence: 'high',
  recommended_action: 'Continue routine',
  escalation_flag: false,
  ...overrides,
});

const generateDates = (count: number): string[] => {
  const dates: string[] = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
};

describe('computeSignalHistory', () => {
  it('returns empty array for no records', () => {
    const result = computeSignalHistory('hydration', [], [], 14);
    expect(result).toEqual([]);
  });

  it('returns correct number of history points', () => {
    const dates = generateDates(7);
    const records = dates.map((d) => makeRecord(d));
    const outputs = records.map((r) => makeOutput(r.daily_id));
    const result = computeSignalHistory('hydration', records, outputs, 14);
    expect(result.length).toBe(7);
  });

  it('only includes records within the date range', () => {
    const oldDate = '2020-01-01';
    const recentDates = generateDates(3);
    const records = [makeRecord(oldDate), ...recentDates.map((d) => makeRecord(d))];
    const outputs = records.map((r) => makeOutput(r.daily_id));
    const result = computeSignalHistory('structure', records, outputs, 14);
    expect(result.length).toBe(3);
    expect(result.every((r) => r.date !== oldDate)).toBe(true);
  });

  it('returns sorted results by date', () => {
    const dates = generateDates(5);
    const records = dates.map((d) => makeRecord(d));
    const outputs = records.map((r) => makeOutput(r.daily_id));
    const result = computeSignalHistory('inflammation', records, outputs, 14);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].date >= result[i - 1].date).toBe(true);
    }
  });

  it('produces values between 0 and 100', () => {
    const dates = generateDates(10);
    const records = dates.map((d) => makeRecord(d));
    const outputs = records.map((r) => makeOutput(r.daily_id));
    const signals = ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'] as const;

    for (const signal of signals) {
      const result = computeSignalHistory(signal, records, outputs, 14);
      for (const point of result) {
        expect(point.value).toBeGreaterThanOrEqual(0);
        expect(point.value).toBeLessThanOrEqual(100);
      }
    }
  });

  it('reflects stress/sleep impact on hydration', () => {
    const dates = generateDates(2);
    const goodRecord = makeRecord(dates[0], { stress_level: 'low', sleep_quality: 'great' });
    const badRecord = makeRecord(dates[1], { stress_level: 'high', sleep_quality: 'poor' });
    const outputs = [makeOutput(goodRecord.daily_id), makeOutput(badRecord.daily_id)];
    const result = computeSignalHistory('hydration', [goodRecord, badRecord], outputs, 14);
    expect(result[0].value).toBeGreaterThan(result[1].value);
  });
});

describe('deriveCompositeSignals', () => {
  it('returns all five signals', () => {
    const signals = deriveCompositeSignals({
      acneRisk: 30,
      sunRisk: 25,
      ageRisk: 35,
      inflammationRisk: 30,
      pigmentationRisk: 25,
      textureRisk: 35,
    });
    expect(signals).toHaveProperty('structure');
    expect(signals).toHaveProperty('hydration');
    expect(signals).toHaveProperty('inflammation');
    expect(signals).toHaveProperty('sunDamage');
    expect(signals).toHaveProperty('elasticity');
  });

  it('clamps all values between 0 and 100', () => {
    const signals = deriveCompositeSignals({
      acneRisk: 100,
      sunRisk: 100,
      ageRisk: 100,
      inflammationRisk: 100,
      pigmentationRisk: 100,
      textureRisk: 100,
      stressLevel: 'high',
      sleepQuality: 'poor',
    });
    Object.values(signals).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });

  it('returns higher scores for lower risk inputs', () => {
    const lowRisk = deriveCompositeSignals({
      acneRisk: 10,
      sunRisk: 10,
      ageRisk: 10,
      inflammationRisk: 10,
      pigmentationRisk: 10,
      textureRisk: 10,
    });
    const highRisk = deriveCompositeSignals({
      acneRisk: 80,
      sunRisk: 80,
      ageRisk: 80,
      inflammationRisk: 80,
      pigmentationRisk: 80,
      textureRisk: 80,
    });
    expect(lowRisk.structure).toBeGreaterThan(highRisk.structure);
    expect(lowRisk.hydration).toBeGreaterThan(highRisk.hydration);
    expect(lowRisk.inflammation).toBeGreaterThan(highRisk.inflammation);
  });
});
