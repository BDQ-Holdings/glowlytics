/**
 * Day-story data model.
 *
 * Transforms the user's real `dailyRecords` + `modelOutputs` into the 14-day
 * timeline the redesigned Today view paginates through. Each entry is a
 * single calendar day. Days with no scan are still represented so the
 * calendar strip doesn't develop gaps.
 *
 * Score derivation matches `scoreFromSignals` in `services/skinInsights.ts`
 * so the number shown on a day's hero is identical to the composite used
 * elsewhere in the app.
 */

import type { DailyRecord, ModelOutput } from '../../types';
import { localDateStr } from '../../utils/localDate';

export interface DayEntry {
  /** ISO YYYY-MM-DD calendar date. */
  date: string;
  /** Display label for the day-of-week: "Mon", "Tue", … */
  day: string;
  /** Display label for the day-of-month: "23". */
  d: number;
  /** Three-letter month: "Apr", "May", … */
  m: string;
  /** Full weekday name: "Wednesday". */
  weekday: string;
  /** True for today (used to gate the scan CTA + label). */
  isToday: boolean;
  /** True when the user actually scanned that day. */
  hasScan: boolean;
  /** Composite glow score (0–100) — null when no scan exists for the day. */
  score: number | null;
  /** Delta vs the prior scan in the timeline (null when no priors). */
  delta: number | null;
  /** One-line summary derived from the model output's narrative. */
  summary: string;
  /** Secondary contextual line (driver / recommendation). */
  note: string;
  /** Index of the underlying ModelOutput (for back-references). */
  outputIndex: number | null;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function scoreFromSignals(s: ModelOutput['signal_scores'] | undefined): number | null {
  if (!s) return null;
  const vals = [s.structure, s.hydration, s.inflammation, s.sunDamage, s.elasticity];
  if (!vals.every((v) => Number.isFinite(v))) return null;
  // Same weights as `services/skinInsights.ts:scoreFromSignals`.
  return Math.round(
    s.structure * 0.22 +
      s.hydration * 0.18 +
      s.inflammation * 0.20 +
      s.sunDamage * 0.20 +
      s.elasticity * 0.20,
  );
}

function legacyScore(o: ModelOutput | undefined): number | null {
  if (!o) return null;
  if (!Number.isFinite(o.acne_score) || !Number.isFinite(o.sun_damage_score) || !Number.isFinite(o.skin_age_score)) {
    return null;
  }
  return Math.round(((100 - o.acne_score) + (100 - o.sun_damage_score) + (100 - o.skin_age_score)) / 3);
}

/**
 * Build the rolling 14-day window ending today. Always 14 entries; days
 * without a scan render as empty-state cards.
 */
export function buildDayTimeline(
  dailyRecords: DailyRecord[],
  modelOutputs: ModelOutput[],
  windowDays = 14,
  now: Date = new Date(),
): DayEntry[] {
  // Index dailies by date for O(1) lookup.
  const recordByDate = new Map<string, DailyRecord>();
  for (const r of dailyRecords) recordByDate.set(r.date, r);

  const outputByDailyId = new Map<string, { o: ModelOutput; i: number }>();
  modelOutputs.forEach((o, i) => outputByDailyId.set(o.daily_id, { o, i }));

  const todayStr = localDateStr(now);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const entries: DayEntry[] = [];
  let prevScore: number | null = null;

  for (let offset = windowDays - 1; offset >= 0; offset--) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - offset);
    const iso = localDateStr(d);

    const record = recordByDate.get(iso);
    const lookup = record ? outputByDailyId.get(record.daily_id) : undefined;
    const output = lookup?.o;
    const score = output ? (scoreFromSignals(output.signal_scores) ?? legacyScore(output)) : null;

    const delta = score != null && prevScore != null ? score - prevScore : null;

    const summary = output?.personalized_feedback?.split('. ')[0]?.replace(/\.$/, '')
      || output?.recommended_action
      || (record ? 'No insight generated yet.' : 'A quiet day. Skin does its best work off-camera.');

    const note = output?.recommended_action
      || (record ? 'Pull up the scan to see the full read.' : 'Take a check-in to read your skin.');

    entries.push({
      date: iso,
      day: WEEKDAY_SHORT[d.getDay()],
      d: d.getDate(),
      m: MONTH_SHORT[d.getMonth()],
      weekday: WEEKDAY_LONG[d.getDay()],
      isToday: iso === todayStr,
      hasScan: Boolean(record && output),
      score,
      delta,
      summary,
      note,
      outputIndex: lookup ? lookup.i : null,
    });

    if (score != null) prevScore = score;
  }

  return entries;
}

/** Index of the "today" entry — always the last item in the timeline. */
export const TODAY_INDEX = (entries: DayEntry[]) => entries.length - 1;

/**
 * Per-day facet values derived from the day's ModelOutput. When the day has
 * no scan, all four facets resolve to null (the consumer renders an em-dash).
 */
export interface DayFacets {
  hydrated: number | null;
  calm: number | null;
  even: number | null;
  firm: number | null;
}

export function facetsForDay(entry: DayEntry, modelOutputs: ModelOutput[]): DayFacets {
  if (entry.outputIndex == null) {
    return { hydrated: null, calm: null, even: null, firm: null };
  }
  const s = modelOutputs[entry.outputIndex]?.signal_scores;
  if (!s) return { hydrated: null, calm: null, even: null, firm: null };
  return {
    hydrated: Number.isFinite(s.hydration) ? Math.round(s.hydration) : null,
    calm:     Number.isFinite(s.inflammation) ? Math.round(s.inflammation) : null,
    even:     Number.isFinite(s.sunDamage) ? Math.round(s.sunDamage) : null,
    firm:     Number.isFinite(s.structure) ? Math.round(s.structure) : null,
  };
}

/**
 * Headline copy: one short italic phrase from the day's summary. We strip
 * trailing punctuation and cap to ~6 words so it lands as a single line.
 */
export function headlineForDay(entry: DayEntry): string {
  const words = entry.summary.split(/\s+/);
  if (words.length <= 6) return entry.summary.replace(/[.!]$/, '');
  return words.slice(0, 6).join(' ').replace(/[.!]$/, '') + '…';
}

/**
 * Verbal flavour for the headline — pulled from the actual score band so
 * the day-tile feels human ("radiant", "steady", "tender") instead of
 * repeating the raw note.
 */
export function moodAdjective(score: number | null): string {
  if (score == null) return 'patient';
  if (score >= 85) return 'radiant';
  if (score >= 75) return 'well-rested';
  if (score >= 60) return 'steady';
  if (score >= 45) return 'a little tired';
  return 'asking for care';
}
