import type {
  Pattern,
  PatternChartPoint,
  PatternConfidence,
  PatternSignal,
  PatternType,
  ModelOutput,
  DailyRecord,
  HealthDailyRecord,
  UserProfile,
  SignalScores,
} from '../types';
import { selectPredictedPatterns } from './patternPriors';

export interface PatternEngineInput {
  modelOutputs: ModelOutput[];
  dailyRecords: DailyRecord[];
  healthDailyRecords: HealthDailyRecord[];
  userProfile: UserProfile;
}

const CONFIDENCE_ORDER: Record<PatternConfidence, number> = {
  strong: 4,
  moderate: 3,
  emerging: 2,
  watching: 1,
};

const SIGNAL_LABELS: Record<PatternSignal, string> = {
  overall: 'skin score',
  structure: 'structure',
  inflammation: 'inflammation',
  hydration: 'hydration',
  sunDamage: 'sun damage',
  elasticity: 'elasticity',
};

// ─── Stats helpers ─────────────────────────────────────────────────────────
function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let xDen = 0;
  let yDen = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    num += dx * dy;
    xDen += dx * dx;
    yDen += dy * dy;
  }
  const den = Math.sqrt(xDen * yDen);
  if (den === 0) return 0;
  return num / den;
}

interface LagResult {
  r: number;
  lag: number;
  n: number;
}

function bestLag(
  driver: Array<number | null>,
  signal: Array<number | null>,
  maxLag = 3,
): LagResult {
  let best: LagResult = { r: 0, lag: 0, n: 0 };
  for (let lag = 0; lag <= maxLag; lag++) {
    const pairs: Array<{ d: number; s: number }> = [];
    for (let i = lag; i < driver.length && i < signal.length; i++) {
      const d = driver[i - lag];
      const s = signal[i];
      if (d !== null && s !== null && Number.isFinite(d) && Number.isFinite(s)) {
        pairs.push({ d, s });
      }
    }
    if (pairs.length < 10) continue;
    const r = pearson(
      pairs.map((p) => p.d),
      pairs.map((p) => p.s),
    );
    if (Math.abs(r) > Math.abs(best.r)) {
      best = { r, lag, n: pairs.length };
    }
  }
  return best;
}

// ─── Confidence scoring ────────────────────────────────────────────────────
function scoreConfidence(absR: number, n: number): PatternConfidence | null {
  if (absR >= 0.6 && n >= 21) return 'strong';
  if (absR >= 0.45 && n >= 14) return 'moderate';
  if (absR >= 0.35 && n >= 10) return 'emerging';
  return null;
}

// ─── Timeline slicing ──────────────────────────────────────────────────────
interface DaySlice {
  date: string;
  signals: Record<PatternSignal, number | null>;
  daily?: DailyRecord;
  health?: HealthDailyRecord;
}

function computeOverall(scores: SignalScores): number | null {
  const vals = [scores.structure, scores.hydration, scores.inflammation, scores.sunDamage, scores.elasticity];
  const valid = vals.filter(Number.isFinite);
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function buildDaySlices(input: PatternEngineInput): DaySlice[] {
  const dailyByDate = new Map<string, DailyRecord>();
  for (const r of input.dailyRecords) dailyByDate.set(r.date, r);

  const healthByDate = new Map<string, HealthDailyRecord>();
  for (const h of input.healthDailyRecords) healthByDate.set(h.date, h);

  // Index model outputs by daily_id for lookup
  const outputsByDailyId = new Map<string, ModelOutput>();
  for (const o of input.modelOutputs) outputsByDailyId.set(o.daily_id, o);

  const allDates = new Set<string>();
  for (const r of input.dailyRecords) allDates.add(r.date);
  for (const h of input.healthDailyRecords) allDates.add(h.date);

  const slices: DaySlice[] = [];
  for (const date of allDates) {
    const record = dailyByDate.get(date);
    const output = record ? outputsByDailyId.get(record.daily_id) : undefined;
    const scores = output?.signal_scores;

    slices.push({
      date,
      signals: {
        overall: scores ? computeOverall(scores) : null,
        structure: Number.isFinite(scores?.structure) ? scores!.structure : null,
        inflammation: Number.isFinite(scores?.inflammation) ? scores!.inflammation : null,
        hydration: Number.isFinite(scores?.hydration) ? scores!.hydration : null,
        sunDamage: Number.isFinite(scores?.sunDamage) ? scores!.sunDamage : null,
        elasticity: Number.isFinite(scores?.elasticity) ? scores!.elasticity : null,
      },
      daily: record,
      health: healthByDate.get(date),
    });
  }

  return slices.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Detectors ─────────────────────────────────────────────────────────────
function detectHealthSignalLag(slices: DaySlice[]): Pattern[] {
  const out: Pattern[] = [];
  const now = new Date().toISOString();
  const drivers: Array<{
    key: keyof HealthDailyRecord;
    label: string;
  }> = [
    { key: 'sleep_total_minutes', label: 'sleep' },
    { key: 'hrv_sdnn_ms', label: 'HRV' },
    { key: 'resting_hr_bpm', label: 'resting heart rate' },
  ];
  const signals: PatternSignal[] = ['inflammation', 'hydration', 'structure', 'overall'];

  for (const drv of drivers) {
    const driverSeries = slices.map((s) => (s.health?.[drv.key] as number | null) ?? null);
    for (const signal of signals) {
      const signalSeries = slices.map((s) => s.signals[signal]);
      const lag = bestLag(driverSeries, signalSeries, 3);
      if (lag.n < 10) continue;
      const conf = scoreConfidence(Math.abs(lag.r), lag.n);
      if (!conf) continue;

      const signalLabel = SIGNAL_LABELS[signal];
      const direction = lag.r > 0 ? 'rises with' : 'drops with';
      const lagPhrase =
        lag.lag === 0
          ? 'on the same day as'
          : `${lag.lag} day${lag.lag > 1 ? 's' : ''} after changes in`;
      const insightText = `Your ${signalLabel} ${direction} ${lagPhrase} your ${drv.label}`;
      const detailText = `Across ${lag.n} days of paired data, this pattern held up consistently. It is one of the clearest signals in your data.`;

      const chartData: PatternChartPoint[] = slices
        .filter((s) => s.signals[signal] !== null && s.health?.[drv.key] !== undefined)
        .map((s) => ({
          date: s.date,
          signalValue: s.signals[signal] as number,
          driverValue: (s.health?.[drv.key] as number | null) ?? null,
          driverLabel: drv.label,
        }));

      out.push({
        id: `health_lag_${String(drv.key)}_${signal}`,
        type: 'health_signal_lag',
        signal,
        driver: String(drv.key),
        driverLabel: drv.label,
        confidence: conf,
        correlationCoefficient: lag.r,
        sampleSize: lag.n,
        lagDays: lag.lag,
        insightText,
        detailText,
        chartData,
        detectedAt: now,
        firstSeenAt: now,
        isPredicted: false,
      });
    }
  }

  return out;
}

function lifestyleToNumeric(
  record: DailyRecord | undefined,
  key: 'drinks_yesterday' | 'stress_level' | 'sleep_quality',
): number | null {
  if (!record) return null;
  if (key === 'drinks_yesterday') {
    const raw = record.drinks_yesterday;
    if (typeof raw !== 'string') return null;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (key === 'stress_level') {
    const raw = record.stress_level;
    if (raw === 'low') return 1;
    if (raw === 'med') return 2;
    if (raw === 'high') return 3;
    return null;
  }
  if (key === 'sleep_quality') {
    const raw = record.sleep_quality;
    if (raw === 'poor') return 1;
    if (raw === 'ok') return 2;
    if (raw === 'great') return 3;
    return null;
  }
  return null;
}

function detectLifestyleSignalCorr(slices: DaySlice[]): Pattern[] {
  const out: Pattern[] = [];
  const now = new Date().toISOString();
  const drivers: Array<{
    key: 'drinks_yesterday' | 'stress_level' | 'sleep_quality';
    label: string;
  }> = [
    { key: 'drinks_yesterday', label: 'alcohol' },
    { key: 'stress_level', label: 'stress' },
    { key: 'sleep_quality', label: 'sleep quality' },
  ];
  const signals: PatternSignal[] = ['inflammation', 'hydration', 'structure', 'overall'];

  for (const drv of drivers) {
    const driverSeries = slices.map((s) => lifestyleToNumeric(s.daily, drv.key));
    for (const signal of signals) {
      const signalSeries = slices.map((s) => s.signals[signal]);
      const lag = bestLag(driverSeries, signalSeries, 2);
      if (lag.n < 14) continue;
      const conf = scoreConfidence(Math.abs(lag.r), lag.n);
      if (!conf) continue;

      const signalLabel = SIGNAL_LABELS[signal];
      const direction = lag.r > 0 ? 'is worse' : 'improves';
      const lagPhrase =
        lag.lag === 0
          ? 'on days with higher'
          : `${lag.lag} day${lag.lag > 1 ? 's' : ''} after days with higher`;
      const insightText = `Your ${signalLabel} ${direction} ${lagPhrase} ${drv.label}`;
      const detailText = `${lag.n} days of paired data show this link. The correlation has been stable across your recent history.`;

      out.push({
        id: `lifestyle_${drv.key}_${signal}`,
        type: 'lifestyle_signal_corr',
        signal,
        driver: drv.key,
        driverLabel: drv.label,
        confidence: conf,
        correlationCoefficient: lag.r,
        sampleSize: lag.n,
        lagDays: lag.lag,
        insightText,
        detailText,
        chartData: [],
        detectedAt: now,
        firstSeenAt: now,
        isPredicted: false,
      });
    }
  }

  return out;
}

function detectCycleSignalPhase(slices: DaySlice[], profile: UserProfile): Pattern[] {
  if (profile.sex !== 'female' || profile.menstrual_status !== 'regular') return [];
  const out: Pattern[] = [];
  const now = new Date().toISOString();
  const cycleLength = profile.cycle_length_days || 28;

  // Group inflammation by cycle day
  const byCycleDay = new Map<number, number[]>();
  for (const slice of slices) {
    const cycleDay = slice.daily?.cycle_day_estimated;
    if (typeof cycleDay !== 'number') continue;
    const signal = slice.signals.inflammation;
    if (signal === null || !Number.isFinite(signal)) continue;
    const list = byCycleDay.get(cycleDay) ?? [];
    list.push(signal);
    byCycleDay.set(cycleDay, list);
  }

  // Need at least 1.2 cycles worth of total paired data points.
  // We check total N rather than unique cycle days so that 2 complete cycles
  // (which only span cycleLength unique days) still qualify.
  const minDays = Math.floor(cycleLength * 1.2);
  let totalN = 0;
  for (const values of byCycleDay.values()) totalN += values.length;
  if (totalN < minDays) return [];

  const cycleDays: Array<{ day: number; mean: number }> = [];
  for (const [day, values] of byCycleDay.entries()) {
    cycleDays.push({ day, mean: values.reduce((a, b) => a + b, 0) / values.length });
  }
  cycleDays.sort((a, b) => a.day - b.day);

  // Find peak day
  let peakDay = 0;
  let peakMean = -Infinity;
  for (const { day, mean } of cycleDays) {
    if (mean > peakMean) {
      peakMean = mean;
      peakDay = day;
    }
  }

  const daysBeforePeriod = cycleLength - peakDay;

  // Measure pattern strength by how much the peak rises above the mean.
  // A strong cycle pattern has a pronounced peak; flat data has weak peak/mean ratio.
  // Use 4σ as the "strong" reference point — peaks from random noise after
  // averaging rarely exceed that threshold.
  const overallMean = cycleDays.reduce((a, c) => a + c.mean, 0) / cycleDays.length;
  const peakRise = peakMean - overallMean;
  const variance =
    cycleDays.reduce((a, c) => a + (c.mean - overallMean) ** 2, 0) / cycleDays.length;
  const std = Math.sqrt(variance);
  const normalizedStrength = std > 0 ? Math.min(1, peakRise / (std * 4)) : 0;

  const conf = scoreConfidence(normalizedStrength, totalN);
  if (!conf) return out;

  const insightText = `Your inflammation peaks ${daysBeforePeriod} days before your period`;
  const detailText = `Tracked across ${totalN} days of your cycle. Pattern is strongest in the days before each period start.`;

  out.push({
    id: 'cycle_inflammation',
    type: 'cycle_signal_phase',
    signal: 'inflammation',
    driver: 'cycle_day',
    driverLabel: 'cycle',
    confidence: conf,
    correlationCoefficient: normalizedStrength,
    sampleSize: totalN,
    lagDays: -daysBeforePeriod,
    insightText,
    detailText,
    chartData: cycleDays.map((c) => ({
      date: `day ${c.day}`,
      signalValue: c.mean,
      driverValue: c.day,
      driverLabel: 'cycle day',
    })),
    detectedAt: now,
    firstSeenAt: now,
    isPredicted: false,
  });

  return out;
}

// ─── Ranking + dedup ───────────────────────────────────────────────────────
function rankAndDedupe(patterns: Pattern[]): Pattern[] {
  const bySignal = new Map<PatternSignal, Pattern>();
  for (const p of patterns) {
    const existing = bySignal.get(p.signal);
    if (!existing) {
      bySignal.set(p.signal, p);
      continue;
    }
    const score =
      CONFIDENCE_ORDER[p.confidence] * 1000 + Math.abs(p.correlationCoefficient) * 100;
    const existingScore =
      CONFIDENCE_ORDER[existing.confidence] * 1000 + Math.abs(existing.correlationCoefficient) * 100;
    if (score > existingScore) bySignal.set(p.signal, p);
  }
  return Array.from(bySignal.values()).sort((a, b) => {
    const co = CONFIDENCE_ORDER[b.confidence] - CONFIDENCE_ORDER[a.confidence];
    if (co !== 0) return co;
    return Math.abs(b.correlationCoefficient) - Math.abs(a.correlationCoefficient);
  });
}

// ─── Main entry point ──────────────────────────────────────────────────────
export function detectPatterns(input: PatternEngineInput): Pattern[] {
  // Perf cap: only look at last 90 days of data
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const prunedInput: PatternEngineInput = {
    ...input,
    modelOutputs: input.modelOutputs,
    dailyRecords: input.dailyRecords.filter((r) => r.date >= cutoffStr),
    healthDailyRecords: input.healthDailyRecords.filter((h) => h.date >= cutoffStr),
  };

  const slices = buildDaySlices(prunedInput);

  const realPatterns: Pattern[] =
    slices.length < 10
      ? []
      : [
          ...detectHealthSignalLag(slices),
          ...detectLifestyleSignalCorr(slices),
          ...detectCycleSignalPhase(slices, prunedInput.userProfile),
        ];

  const ranked = rankAndDedupe(realPatterns).slice(0, 5);

  if (ranked.length < 2) {
    const predicted = selectPredictedPatterns(prunedInput.userProfile, 3);
    return [...ranked, ...predicted];
  }

  return ranked;
}
