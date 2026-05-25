import type {
  Badge,
  BadgeId,
  LevelName,
  WeeklyChallenge,
  PersonalBests,
  GamificationState,
  DailyRecord,
  ModelOutput,
} from '../types';

// ---------------------------------------------------------------------------
// Level system
// ---------------------------------------------------------------------------

export const LEVEL_THRESHOLDS: { level: LevelName; xp: number }[] = [
  { level: 'Beginner', xp: 0 },
  { level: 'Novice', xp: 100 },
  { level: 'Enthusiast', xp: 500 },
  { level: 'Expert', xp: 1500 },
  { level: 'Master', xp: 3000 },
  { level: 'Skin Scientist', xp: 5000 },
];

export function getLevelForXP(xp: number): LevelName {
  let current: LevelName = 'Beginner';
  for (const threshold of LEVEL_THRESHOLDS) {
    if (xp >= threshold.xp) {
      current = threshold.level;
    }
  }
  return current;
}

export function getLevelProgress(xp: number): {
  current: LevelName;
  next: LevelName | null;
  progress: number;
  currentThreshold: number;
  nextThreshold: number | null;
} {
  let currentIdx = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i].xp) {
      currentIdx = i;
    }
  }

  const current = LEVEL_THRESHOLDS[currentIdx];
  const isMax = currentIdx === LEVEL_THRESHOLDS.length - 1;
  const next = isMax ? null : LEVEL_THRESHOLDS[currentIdx + 1];

  let progress = 1;
  if (next) {
    const range = next.xp - current.xp;
    progress = range > 0 ? (xp - current.xp) / range : 1;
  }

  return {
    current: current.level,
    next: next ? next.level : null,
    progress: Math.min(1, Math.max(0, progress)),
    currentThreshold: current.xp,
    nextThreshold: next ? next.xp : null,
  };
}

// ---------------------------------------------------------------------------
// XP awards
// ---------------------------------------------------------------------------

export const XP_AWARDS = {
  daily_scan: 10,
  streak_bonus_per_day: 5,
  challenge_completed: 50,
  badge_earned: 25,
  context_logged: 3,
};

export function getXPForScan(streakDays: number, contextItems: number): number {
  const base = XP_AWARDS.daily_scan;
  const streakBonus = Math.max(0, streakDays - 1) * XP_AWARDS.streak_bonus_per_day;
  const contextBonus = contextItems * XP_AWARDS.context_logged;
  return base + streakBonus + contextBonus;
}

// ---------------------------------------------------------------------------
// Badge definitions
// ---------------------------------------------------------------------------

export const BADGE_DEFINITIONS: Record<BadgeId, { name: string; description: string; xp_reward: number }> = {
  first_scan: { name: 'First Steps', description: 'Complete your first scan', xp_reward: 25 },
  streak_7: { name: 'Week Warrior', description: 'Maintain a 7-day scan streak', xp_reward: 25 },
  streak_30: { name: 'Monthly Master', description: 'Maintain a 30-day scan streak', xp_reward: 25 },
  streak_60: { name: 'Iron Consistency', description: 'Maintain a 60-day scan streak', xp_reward: 25 },
  sunscreen_champion: { name: 'Sun Shield', description: 'Use sunscreen 7 days in a row', xp_reward: 25 },
  perfect_week: { name: 'Perfect Week', description: 'Scan every day with full context for 7 days', xp_reward: 25 },
  sleep_warrior: { name: 'Sleep Champion', description: 'Log great sleep 5 times', xp_reward: 25 },
  product_expert: { name: 'Product Connoisseur', description: 'Add 5 products to your routine', xp_reward: 25 },
  early_bird: { name: 'Early Bird', description: 'Complete a scan before 8 AM', xp_reward: 25 },
  consistency_king: { name: 'Consistency King', description: 'Scan at the same time (plus or minus 1hr) for 7 days', xp_reward: 25 },
  level_novice: { name: 'Rising Star', description: 'Reach Novice level', xp_reward: 25 },
  level_enthusiast: { name: 'Skin Enthusiast', description: 'Reach Enthusiast level', xp_reward: 25 },
  level_expert: { name: 'Skin Expert', description: 'Reach Expert level', xp_reward: 25 },
  level_master: { name: 'Skin Master', description: 'Reach Master level', xp_reward: 25 },
  level_scientist: { name: 'Skin Scientist', description: 'Reach the highest level', xp_reward: 25 },
};

// ---------------------------------------------------------------------------
// Badge eligibility
// ---------------------------------------------------------------------------

export function checkBadgeEligibility(
  state: GamificationState,
  dailyRecords: DailyRecord[],
  _modelOutputs: ModelOutput[],
  products: { length: number },
  streak: number,
): BadgeId[] {
  const earnedIds = new Set(state.badges.map((b) => b.id));
  const newlyEligible: BadgeId[] = [];

  const check = (id: BadgeId, condition: boolean) => {
    if (!earnedIds.has(id) && condition) newlyEligible.push(id);
  };

  // Scan-based badges
  check('first_scan', dailyRecords.length >= 1);
  check('streak_7', streak >= 7);
  check('streak_30', streak >= 30);
  check('streak_60', streak >= 60);

  // Sunscreen champion: 7 consecutive records with sunscreen_used
  if (!earnedIds.has('sunscreen_champion') && dailyRecords.length >= 7) {
    const sorted = [...dailyRecords].sort((a, b) => b.date.localeCompare(a.date));
    const last7 = sorted.slice(0, 7);
    if (last7.every((r) => r.sunscreen_used)) {
      newlyEligible.push('sunscreen_champion');
    }
  }

  // Perfect week: 7 consecutive records with full context (sleep + stress logged)
  if (!earnedIds.has('perfect_week') && dailyRecords.length >= 7) {
    const sorted = [...dailyRecords].sort((a, b) => b.date.localeCompare(a.date));
    const last7 = sorted.slice(0, 7);
    if (last7.every((r) => r.sleep_quality && r.stress_level)) {
      newlyEligible.push('perfect_week');
    }
  }

  // Sleep warrior: 5 records with great sleep
  const greatSleepCount = dailyRecords.filter((r) => r.sleep_quality === 'great').length;
  check('sleep_warrior', greatSleepCount >= 5);

  // Product expert: 5 products
  check('product_expert', products.length >= 5);

  // Early bird: any scan recorded before 8 AM local time. Reads from the
  // `scanned_at` ISO timestamp set in `app/scan/analyzing.tsx` at scan
  // completion. The legacy code parsed `scanner_reading_id` for a `scan_<ms>`
  // suffix, but production IDs are UUIDs so the regex never matched and the
  // badge was effectively unobtainable. We fall back to the legacy regex so
  // historical records (and the gamification test fixtures) still work.
  if (!earnedIds.has('early_bird')) {
    const earnedEarly = dailyRecords.some((record) => {
      const iso = record.scanned_at;
      if (iso) {
        const t = new Date(iso).getTime();
        if (Number.isFinite(t)) {
          return new Date(t).getHours() < 8;
        }
      }
      const match = record.scanner_reading_id.match(/scan_(\d+)/);
      if (match) {
        const ts = parseInt(match[1], 10);
        if (!Number.isNaN(ts)) {
          return new Date(ts).getHours() < 8;
        }
      }
      return false;
    });
    if (earnedEarly) newlyEligible.push('early_bird');
  }

  // Consistency king: 7 consecutive scans at roughly the same time
  // Skip for now since we don't reliably track scan time

  // Level badges
  const level = getLevelForXP(state.xp);
  const levelOrder: LevelName[] = ['Beginner', 'Novice', 'Enthusiast', 'Expert', 'Master', 'Skin Scientist'];
  const levelIdx = levelOrder.indexOf(level);
  if (levelIdx >= 1) check('level_novice', true);
  if (levelIdx >= 2) check('level_enthusiast', true);
  if (levelIdx >= 3) check('level_expert', true);
  if (levelIdx >= 4) check('level_master', true);
  if (levelIdx >= 5) check('level_scientist', true);

  return newlyEligible;
}

// ---------------------------------------------------------------------------
// Weekly challenges
// ---------------------------------------------------------------------------

export const CHALLENGE_POOL: Omit<WeeklyChallenge, 'id' | 'progress' | 'expires_at' | 'completed'>[] = [
  { title: 'Sunscreen Streak', description: 'Use sunscreen every day this week', target: 7, xp_reward: 50 },
  { title: 'Sleep Logger', description: 'Log your sleep quality 5 days this week', target: 5, xp_reward: 50 },
  { title: 'Scan Squad', description: 'Complete 3 scans this week', target: 3, xp_reward: 50 },
  { title: 'Context King', description: 'Add context to every scan this week', target: 5, xp_reward: 50 },
  { title: 'Score Improver', description: 'Improve your overall score by 3 points', target: 3, xp_reward: 75 },
];

export function generateWeeklyChallenges(existing: WeeklyChallenge[]): WeeklyChallenge[] {
  const now = new Date();

  // Keep any challenges that haven't expired yet
  const active = existing.filter((c) => new Date(c.expires_at) > now && !c.completed);
  if (active.length >= 3) return active;

  // Pick new challenges from the pool that aren't already active
  const activeTitles = new Set(active.map((c) => c.title));
  const available = CHALLENGE_POOL.filter((c) => !activeTitles.has(c.title));

  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 7);
  const expiresStr = expiresAt.toISOString();

  const needed = 3 - active.length;
  const selected = available.slice(0, needed);

  const newChallenges: WeeklyChallenge[] = selected.map((c, i) => ({
    ...c,
    id: `challenge_${now.getTime()}_${i}`,
    progress: 0,
    expires_at: expiresStr,
    completed: false,
  }));

  return [...active, ...newChallenges];
}

// ---------------------------------------------------------------------------
// Personal bests
// ---------------------------------------------------------------------------

// Weighted overall score from the 5 signal channels. Keep in sync with
// `scoreFromSignals` in `services/skinInsights.ts` — both must produce the
// same number so the personal best displayed in Profile matches the daily
// score shown elsewhere.
function overallScoreFromSignals(signals: {
  structure: number;
  hydration: number;
  inflammation: number;
  sunDamage: number;
  elasticity: number;
}): number {
  return Math.round(
    signals.structure * 0.22 +
      signals.hydration * 0.18 +
      signals.inflammation * 0.20 +
      signals.sunDamage * 0.20 +
      signals.elasticity * 0.20,
  );
}

// Max unique scan days inside any rolling 7-day calendar window. The legacy
// implementation sliced by record count (`sorted.slice(i, i + 7)`), which
// undercounts when the user has multiple records on the same day or gaps
// between active days exceed the window. A calendar-window scan is O(n^2)
// but the data set is bounded so the cost is negligible.
function maxScanDaysInSevenDayWindow(dates: string[]): number {
  if (dates.length === 0) return 0;
  const uniqueSorted = Array.from(new Set(dates)).sort();
  const DAY_MS = 24 * 60 * 60 * 1000;
  let best = 0;
  for (let i = 0; i < uniqueSorted.length; i++) {
    const anchor = new Date(uniqueSorted[i]).getTime();
    if (!Number.isFinite(anchor)) continue;
    const cutoff = anchor + 6 * DAY_MS;
    let count = 0;
    for (let j = i; j < uniqueSorted.length; j++) {
      const t = new Date(uniqueSorted[j]).getTime();
      if (!Number.isFinite(t) || t > cutoff) break;
      count += 1;
    }
    if (count > best) best = count;
  }
  return best;
}

export function updatePersonalBests(
  current: PersonalBests,
  dailyRecords: DailyRecord[],
  modelOutputs: ModelOutput[],
  streak: number,
): PersonalBests {
  let longestStreak = Math.max(current.longest_streak, streak);
  let lowestAcne = current.lowest_acne;
  let highestSkinScore = current.highest_skin_score;
  let mostConsistentWeek = current.most_consistent_week;

  for (const output of modelOutputs) {
    if (output.acne_score < lowestAcne) {
      lowestAcne = output.acne_score;
    }

    // Prefer the 5-signal weighted score (matches what's shown on Today /
    // Story / Results screens). Fall back to the legacy 3-score average for
    // historical outputs that pre-date signal_scores.
    let skinScore: number;
    const s = output.signal_scores;
    if (
      s &&
      Number.isFinite(s.structure) && Number.isFinite(s.hydration) &&
      Number.isFinite(s.inflammation) && Number.isFinite(s.sunDamage) &&
      Number.isFinite(s.elasticity)
    ) {
      skinScore = overallScoreFromSignals(s);
    } else {
      skinScore = Math.round(
        ((100 - output.acne_score) + (100 - output.sun_damage_score) + (100 - output.skin_age_score)) / 3,
      );
    }
    if (skinScore > highestSkinScore) {
      highestSkinScore = skinScore;
    }
  }

  // Max unique scan-day count in any rolling 7-day calendar window.
  const dayCount = maxScanDaysInSevenDayWindow(dailyRecords.map((r) => r.date));
  if (dayCount > mostConsistentWeek) {
    mostConsistentWeek = dayCount;
  }

  return {
    longest_streak: longestStreak,
    lowest_acne: lowestAcne,
    highest_skin_score: highestSkinScore,
    most_consistent_week: mostConsistentWeek,
  };
}
