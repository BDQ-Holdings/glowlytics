import {
  getLevelForXP,
  getLevelProgress,
  getXPForScan,
  checkBadgeEligibility,
  generateWeeklyChallenges,
  updatePersonalBests,
  BADGE_DEFINITIONS,
  LEVEL_THRESHOLDS,
  XP_AWARDS,
} from '../gamification';
import type { GamificationState, DailyRecord, ModelOutput, BadgeId } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeGamificationState = (overrides?: Partial<GamificationState>): GamificationState => ({
  xp: 0,
  level: 'Beginner',
  badges: [],
  weekly_challenges: [],
  personal_bests: {
    longest_streak: 0,
    lowest_acne: 100,
    highest_skin_score: 0,
    most_consistent_week: 0,
  },
  ...overrides,
});

const makeDailyRecord = (overrides?: Partial<DailyRecord>): DailyRecord => ({
  daily_id: `daily_${Date.now()}_${Math.random()}`,
  user_id: 'test-user',
  date: new Date().toISOString().split('T')[0],
  scanner_reading_id: `scan_${Date.now()}`,
  scanner_indices: {
    inflammation_index: 40,
    pigmentation_index: 30,
    texture_index: 35,
  },
  scanner_quality_flag: 'pass',
  scan_region: 'left_cheek',
  sunscreen_used: true,
  new_product_added: false,
  ...overrides,
});

const makeModelOutput = (overrides?: Partial<ModelOutput>): ModelOutput => ({
  output_id: `output_${Date.now()}_${Math.random()}`,
  daily_id: 'daily_1',
  acne_score: 40,
  sun_damage_score: 30,
  skin_age_score: 35,
  confidence: 'med',
  recommended_action: 'Continue routine.',
  escalation_flag: false,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('gamification service', () => {
  // ---- getLevelForXP ----

  describe('getLevelForXP', () => {
    it('returns Beginner for 0 XP', () => {
      expect(getLevelForXP(0)).toBe('Beginner');
    });

    it('returns Novice for 100 XP', () => {
      expect(getLevelForXP(100)).toBe('Novice');
    });

    it('returns Enthusiast for 500 XP', () => {
      expect(getLevelForXP(500)).toBe('Enthusiast');
    });

    it('returns Expert for 1500 XP', () => {
      expect(getLevelForXP(1500)).toBe('Expert');
    });

    it('returns Master for 3000 XP', () => {
      expect(getLevelForXP(3000)).toBe('Master');
    });

    it('returns Skin Scientist for 5000 XP', () => {
      expect(getLevelForXP(5000)).toBe('Skin Scientist');
    });

    it('returns correct level for values between thresholds', () => {
      expect(getLevelForXP(99)).toBe('Beginner');
      expect(getLevelForXP(499)).toBe('Novice');
      expect(getLevelForXP(1499)).toBe('Enthusiast');
      expect(getLevelForXP(2999)).toBe('Expert');
      expect(getLevelForXP(4999)).toBe('Master');
      expect(getLevelForXP(10000)).toBe('Skin Scientist');
    });
  });

  // ---- getLevelProgress ----

  describe('getLevelProgress', () => {
    it('returns 0 progress at the start of Beginner', () => {
      const result = getLevelProgress(0);
      expect(result.current).toBe('Beginner');
      expect(result.next).toBe('Novice');
      expect(result.progress).toBe(0);
      expect(result.currentThreshold).toBe(0);
      expect(result.nextThreshold).toBe(100);
    });

    it('returns 50% progress halfway to Novice', () => {
      const result = getLevelProgress(50);
      expect(result.current).toBe('Beginner');
      expect(result.progress).toBeCloseTo(0.5);
    });

    it('returns null next and full progress at max level', () => {
      const result = getLevelProgress(5000);
      expect(result.current).toBe('Skin Scientist');
      expect(result.next).toBeNull();
      expect(result.progress).toBe(1);
      expect(result.nextThreshold).toBeNull();
    });
  });

  // ---- getXPForScan ----

  describe('getXPForScan', () => {
    it('returns base 10 XP for first scan with no context', () => {
      expect(getXPForScan(1, 0)).toBe(10);
    });

    it('adds streak bonus for days beyond the first', () => {
      // streak 3: base 10 + (3-1)*5 = 10 + 10 = 20
      expect(getXPForScan(3, 0)).toBe(20);
    });

    it('adds context bonus per item', () => {
      // streak 1, 3 context items: 10 + 0 + 3*3 = 19
      expect(getXPForScan(1, 3)).toBe(19);
    });

    it('combines streak and context bonuses', () => {
      // streak 5, 2 context items: 10 + (5-1)*5 + 2*3 = 10 + 20 + 6 = 36
      expect(getXPForScan(5, 2)).toBe(36);
    });
  });

  // ---- checkBadgeEligibility ----

  describe('checkBadgeEligibility', () => {
    it('awards first_scan badge after 1 record', () => {
      const state = makeGamificationState();
      const records = [makeDailyRecord()];
      const result = checkBadgeEligibility(state, records, [], { length: 0 }, 1);
      expect(result).toContain('first_scan');
    });

    it('awards streak_7 badge when streak is 7', () => {
      const state = makeGamificationState();
      const records = Array.from({ length: 7 }, (_, i) => makeDailyRecord({ daily_id: `d${i}` }));
      const result = checkBadgeEligibility(state, records, [], { length: 0 }, 7);
      expect(result).toContain('streak_7');
    });

    it('does not re-award already earned badges', () => {
      const state = makeGamificationState({
        badges: [
          {
            id: 'first_scan',
            name: 'First Steps',
            description: 'test',
            earned_at: new Date().toISOString(),
            xp_reward: 25,
          },
        ],
      });
      const records = [makeDailyRecord()];
      const result = checkBadgeEligibility(state, records, [], { length: 0 }, 1);
      expect(result).not.toContain('first_scan');
    });

    it('awards sleep_warrior after 5 great sleep records', () => {
      const state = makeGamificationState();
      const records = Array.from({ length: 5 }, (_, i) =>
        makeDailyRecord({ daily_id: `d${i}`, sleep_quality: 'great' })
      );
      const result = checkBadgeEligibility(state, records, [], { length: 0 }, 1);
      expect(result).toContain('sleep_warrior');
    });

    it('awards product_expert when 5 products exist', () => {
      const state = makeGamificationState();
      const records = [makeDailyRecord()];
      const result = checkBadgeEligibility(state, records, [], { length: 5 }, 1);
      expect(result).toContain('product_expert');
    });
  });

  // ---- generateWeeklyChallenges ----

  describe('generateWeeklyChallenges', () => {
    it('returns challenges with future expiration dates', () => {
      const challenges = generateWeeklyChallenges([]);
      expect(challenges.length).toBeGreaterThan(0);
      const now = new Date();
      for (const c of challenges) {
        expect(new Date(c.expires_at).getTime()).toBeGreaterThan(now.getTime());
      }
    });

    it('returns at most 3 challenges', () => {
      const challenges = generateWeeklyChallenges([]);
      expect(challenges.length).toBeLessThanOrEqual(3);
    });
  });

  // ---- updatePersonalBests ----

  describe('updatePersonalBests', () => {
    it('updates longest_streak when streak exceeds current best', () => {
      const current = { longest_streak: 5, lowest_acne: 100, highest_skin_score: 0, most_consistent_week: 0 };
      const result = updatePersonalBests(current, [], [], 10);
      expect(result.longest_streak).toBe(10);
    });

    it('updates lowest_acne when a lower acne score exists', () => {
      const current = { longest_streak: 0, lowest_acne: 50, highest_skin_score: 0, most_consistent_week: 0 };
      const outputs = [makeModelOutput({ acne_score: 25 })];
      const result = updatePersonalBests(current, [], outputs, 0);
      expect(result.lowest_acne).toBe(25);
    });

    it('does not decrease longest_streak', () => {
      const current = { longest_streak: 15, lowest_acne: 100, highest_skin_score: 0, most_consistent_week: 0 };
      const result = updatePersonalBests(current, [], [], 5);
      expect(result.longest_streak).toBe(15);
    });
  });

  // ---- Structural tests ----

  describe('BADGE_DEFINITIONS', () => {
    it('has all 15 badges defined', () => {
      const ids = Object.keys(BADGE_DEFINITIONS);
      expect(ids.length).toBe(15);
    });

    it('each badge has name, description, and xp_reward', () => {
      for (const [id, def] of Object.entries(BADGE_DEFINITIONS)) {
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(typeof def.xp_reward).toBe('number');
        expect(def.xp_reward).toBeGreaterThan(0);
      }
    });
  });

  describe('LEVEL_THRESHOLDS', () => {
    it('has 6 levels defined', () => {
      expect(LEVEL_THRESHOLDS.length).toBe(6);
    });

    it('levels are in ascending XP order', () => {
      for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
        expect(LEVEL_THRESHOLDS[i].xp).toBeGreaterThan(LEVEL_THRESHOLDS[i - 1].xp);
      }
    });
  });

  // ---- early_bird (scanned_at and legacy fallback) ----

  describe('early_bird badge', () => {
    const earlyMorning = (hour: number): string => {
      const d = new Date();
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };

    it('awards early_bird from the scanned_at ISO timestamp when before 8 AM', () => {
      const state = makeGamificationState();
      const records = [
        makeDailyRecord({
          // Force a UUID so the legacy regex cannot satisfy the badge —
          // proves the win came from scanned_at, not the fallback.
          scanner_reading_id: 'a07f1234-1111-4222-8333-444455556666',
          scanned_at: earlyMorning(6),
        }),
      ];
      const result = checkBadgeEligibility(state, records, [], { length: 0 }, 1);
      expect(result).toContain('early_bird');
    });

    it('does not award early_bird when scanned_at is after 8 AM and no legacy timestamp is present', () => {
      const state = makeGamificationState();
      const records = [
        makeDailyRecord({
          scanner_reading_id: 'a07f1234-1111-4222-8333-444455556666',
          scanned_at: earlyMorning(10),
        }),
      ];
      const result = checkBadgeEligibility(state, records, [], { length: 0 }, 1);
      expect(result).not.toContain('early_bird');
    });

    it('falls back to the legacy scan_<ms> regex for historical records', () => {
      const sixAm = new Date();
      sixAm.setHours(6, 0, 0, 0);
      const state = makeGamificationState();
      const records = [
        makeDailyRecord({
          scanner_reading_id: `scan_${sixAm.getTime()}`,
          scanned_at: undefined,
        }),
      ];
      const result = checkBadgeEligibility(state, records, [], { length: 0 }, 1);
      expect(result).toContain('early_bird');
    });
  });

  // ---- highest_skin_score uses the 5-signal weighted formula ----

  describe('updatePersonalBests highest_skin_score', () => {
    const base = { longest_streak: 0, lowest_acne: 100, highest_skin_score: 0, most_consistent_week: 0 };

    it('uses the 5-signal weighted score when signal_scores is present', () => {
      const outputs = [
        makeModelOutput({
          // Legacy fallback would give: ((100-90)+(100-90)+(100-90))/3 = 10
          acne_score: 90,
          sun_damage_score: 90,
          skin_age_score: 90,
          // 5-signal weighted: 80*0.22 + 80*0.18 + 80*0.20 + 80*0.20 + 80*0.20 = 80
          signal_scores: {
            structure: 80, hydration: 80, inflammation: 80, sunDamage: 80, elasticity: 80,
          },
        }),
      ];
      const result = updatePersonalBests(base, [], outputs, 0);
      expect(result.highest_skin_score).toBe(80);
    });

    it('falls back to the legacy 3-score average when signal_scores is missing', () => {
      const outputs = [
        makeModelOutput({ acne_score: 20, sun_damage_score: 20, skin_age_score: 20 }),
      ];
      const result = updatePersonalBests(base, [], outputs, 0);
      // ((100-20) + (100-20) + (100-20)) / 3 = 80
      expect(result.highest_skin_score).toBe(80);
    });

    it('does not regress when a later output has a lower score', () => {
      const outputs = [
        makeModelOutput({
          signal_scores: { structure: 90, hydration: 90, inflammation: 90, sunDamage: 90, elasticity: 90 },
        }),
        makeModelOutput({
          signal_scores: { structure: 50, hydration: 50, inflammation: 50, sunDamage: 50, elasticity: 50 },
        }),
      ];
      const result = updatePersonalBests(base, [], outputs, 0);
      expect(result.highest_skin_score).toBe(90);
    });
  });

  // ---- most_consistent_week uses calendar-window math ----

  describe('updatePersonalBests most_consistent_week', () => {
    const base = { longest_streak: 0, lowest_acne: 100, highest_skin_score: 0, most_consistent_week: 0 };

    it('counts unique scan days in the densest 7-day calendar window', () => {
      // 5 scans on consecutive days, then a 10-day gap, then 3 more scans.
      const dates = [
        '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05',
        '2026-04-15', '2026-04-16', '2026-04-17',
      ];
      const records = dates.map((d, i) => makeDailyRecord({ daily_id: `d${i}`, date: d }));
      const result = updatePersonalBests(base, records, [], 0);
      expect(result.most_consistent_week).toBe(5);
    });

    it('deduplicates multiple records on the same date', () => {
      const records = [
        makeDailyRecord({ daily_id: 'a', date: '2026-04-01' }),
        makeDailyRecord({ daily_id: 'b', date: '2026-04-01' }),
        makeDailyRecord({ daily_id: 'c', date: '2026-04-01' }),
      ];
      const result = updatePersonalBests(base, records, [], 0);
      expect(result.most_consistent_week).toBe(1);
    });

    it('finds a perfect 7-day streak even when the records list spans a long history', () => {
      const dates = [
        '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05', '2026-04-06', '2026-04-07',
        '2026-05-01', '2026-05-15',
      ];
      const records = dates.map((d, i) => makeDailyRecord({ daily_id: `d${i}`, date: d }));
      const result = updatePersonalBests(base, records, [], 0);
      expect(result.most_consistent_week).toBe(7);
    });

    it('returns 0 when no records exist', () => {
      const result = updatePersonalBests(base, [], [], 0);
      expect(result.most_consistent_week).toBe(0);
    });
  });
});
