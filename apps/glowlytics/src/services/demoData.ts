import type {
  DailyRecord,
  ModelOutput,
  ProductEntry,
  UserProfile,
  ScanProtocol,
  GamificationState,
  SignalScores,
  BoneStructureResult,
  BoneFinding,
  BoneDomain,
} from '../types';
import { recommendInterventions } from './boneInterventions';

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

const clampSignal = (v: number): number => Math.round(Math.max(0, Math.min(100, v)));

// Seeded PRNG (mulberry32) so demo score/signal values are byte-identical every
// run — screenshots, snapshot tests, and tester sessions never drift. A fresh
// generator is minted per createDemoHistory() call from a fixed seed, so two
// calls replay the same sequence. Dates still anchor to `new Date()` (daysAgo)
// so the demo always reads as "today".
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const DEMO_SEED = 0x5eed1e;

/**
 * Build a complete, believable facial-structure read for a demo scan. Attached
 * to the newest few demo outputs so testers land on fully-populated
 * FacialStructure / share StructureCard / bone-results surfaces instead of the
 * empty "take a face read" state — with no "estimated" badge, since these read
 * as real indexed ARKit captures.
 *
 * `offset` is days-back from today (0 = newest); harmony and domain scores
 * trend slightly up toward today. The shape matches `BoneStructureResult`
 * exactly, and interventions come from the real on-device lookup so the copy
 * is authentic rather than invented.
 */
const buildDemoBoneStructure = (offset: number, generatedAt: string): BoneStructureResult => {
  const step = offset; // 0 = newest → highest scores
  const domain_scores: Partial<Record<BoneDomain, number | null>> = {
    symmetry: 84 - step,
    periorbital: 76 - step,
    mandibular: 70 - step,
    midface: 62 - step, // lowest domain → dominant driver
    nose: 79 - step,
    brow: 77 - step,
  };
  const canthalScore = 74 - step;
  const gonialScore = 67 - step;
  const zygomaticScore = 62 - step;
  const scored_metrics: Record<string, number> = {
    facial_thirds: 80 - step,
    facial_index: 81 - step,
    canthal_tilt: canthalScore,
    gonial_angle: gonialScore,
    zygomatic_projection: zygomaticScore,
    chin_projection: 72 - step,
  };
  const metrics: BoneStructureResult['metrics'] = {
    facial_thirds: { value: 0.94, raw: { t1: 0.33, t2: 0.34, t3: 0.33 } },
    facial_index: { value: 1.58 },
    canthal_tilt: { value: 3.8 },
    gonial_angle: { value: 123 },
    zygomatic_projection: { value: 2.9 },
    chin_projection: { value: 1.2 },
  };
  // Only metrics below the "in range" bar surface as findings; these three sit
  // in the moderate band. Sorted worst-first to match the analyzer's output.
  const findings: BoneFinding[] = ([
    { findingCode: 'midface_flat', metric: 'zygomatic_projection', value: 2.9, score: zygomaticScore, severity: 'moderate' },
    { findingCode: 'gonial_angle_obtuse', metric: 'gonial_angle', value: 123, score: gonialScore, severity: 'moderate' },
    { findingCode: 'canthal_tilt_negative', metric: 'canthal_tilt', value: 3.8, score: canthalScore, severity: 'moderate' },
  ] satisfies BoneFinding[]).sort((a, b) => a.score - b.score);
  return {
    harmony: 73 - step,
    status: 'ok',
    domain_scores,
    scored_metrics,
    metrics,
    findings,
    interventions: recommendInterventions(findings),
    dominant_driver: 'midface',
    downsampled_mesh: null,
    source: 'arkit',
    sex: 'female',
    estimate: false,
    confidence: 'high',
    landmark_source: 'indexed',
    generated_at: generatedAt,
    latency_ms: 180,
    persisted: true,
  };
};

export const createDemoUser = (): UserProfile => ({
  user_id: 'demo_user_001',
  age_range: '25-34',
  sex: 'female',
  location_coarse: 'New York, NY',
  period_applicable: 'yes',
  period_last_start_date: daysAgo(8),
  cycle_length_days: 29,
  menstrual_status: 'regular',
  on_hormonal_birth_control: 'no',
  supplements: ['Vitamin D', 'Omega-3 / Fish Oil'],
  exercise_frequency: '3-4_weekly',
  shower_frequency: 'twice_daily',
  hand_washing_frequency: 'after_meals',
  smoker_status: false,
  drink_baseline_frequency: '1-2',
  wearable_connected: false,
  camera_permission_status: 'granted',
  health_connection: {
    status: 'not_requested',
    requested_types: [],
    granted_types: [],
    sync_skipped: true,
    availability_note: 'Demo mode uses simulated health context only.',
  },
  onboarding_complete: true,
});

export const createDemoProtocol = (): ScanProtocol => ({
  protocol_id: 'demo_protocol_001',
  user_id: 'demo_user_001',
  primary_goal: 'acne',
  scan_region: 'left_cheek',
  scan_frequency: 'daily',
  baseline_date: daysAgo(21),
});

export const createDemoProducts = (): ProductEntry[] => [
  {
    user_product_id: 'demo_prod_001',
    user_id: 'demo_user_001',
    product_name: 'CeraVe Foaming Facial Cleanser',
    product_capture_method: 'search',
    ingredients_list: ['Ceramides', 'Niacinamide', 'Hyaluronic Acid'],
    usage_schedule: 'both',
    start_date: daysAgo(21),
  },
  {
    user_product_id: 'demo_prod_002',
    user_id: 'demo_user_001',
    product_name: 'La Roche-Posay Anthelios SPF 50',
    product_capture_method: 'barcode',
    ingredients_list: ['Avobenzone', 'Homosalate', 'Octisalate', 'Niacinamide'],
    usage_schedule: 'AM',
    start_date: daysAgo(21),
  },
  {
    user_product_id: 'demo_prod_003',
    user_id: 'demo_user_001',
    product_name: 'The Ordinary Niacinamide 10%',
    product_capture_method: 'search',
    ingredients_list: ['Niacinamide', 'Zinc PCA'],
    usage_schedule: 'PM',
    start_date: daysAgo(21),
  },
  {
    user_product_id: 'demo_prod_004',
    user_id: 'demo_user_001',
    product_name: 'Differin Adapalene Gel',
    product_capture_method: 'search',
    ingredients_list: ['Adapalene 0.1%', 'Carbomer', 'Propylene Glycol'],
    usage_schedule: 'PM',
    start_date: daysAgo(10),
  },
];

export const createDemoHistory = (): { records: DailyRecord[]; outputs: ModelOutput[] } => {
  const records: DailyRecord[] = [];
  const outputs: ModelOutput[] = [];
  // Fresh generator per call → deterministic, reproducible sequence.
  const rng = mulberry32(DEMO_SEED);

  // 21 days of history for a 30-year-old female
  // Story arc: started with moderate acne, saw cycle-related bump around day 7-12,
  // introduced Differin at day 11, slight purge then improvement, overall downward trend
  const baseAcne = 62;
  const baseSunDamage = 32;
  const baseSkinAge = 38;

  for (let i = 21; i >= 0; i--) {
    const dailyId = `demo_daily_${i}`;
    const dayNumber = 21 - i; // 0 = first day, 21 = today

    // Cycle: period started 8 days ago, cycle length 29
    // So today is cycle day 8, day 0 was cycle day 29-13=16
    const cycleDay = ((29 - 8 - i) % 29 + 29) % 29 + 1;
    const isCycleWindow = cycleDay >= 24 || cycleDay <= 4;
    const isLutealPeak = cycleDay >= 20 && cycleDay <= 27;

    // Differin introduced at day 11 (10 days ago)
    const onDifferin = dayNumber >= 11;
    const differinPurge = onDifferin && dayNumber >= 12 && dayNumber <= 16;

    // Acne trajectory: gradual improvement with cycle bump and purge blip
    let acneShift = -dayNumber * 0.9; // overall downward trend
    if (isCycleWindow) acneShift += 6 + rng() * 4;
    if (isLutealPeak) acneShift += 3;
    if (differinPurge) acneShift += 5 + rng() * 3;
    if (onDifferin && !differinPurge) acneShift -= 2;

    // Sun damage: mostly flat, slight improvement with consistent sunscreen
    const usedSunscreen = i <= 2 ? true : rng() > 0.2; // more consistent recently
    let sunShift = -dayNumber * 0.15;
    if (!usedSunscreen) sunShift += 3;

    // Skin age: slow steady improvement from routine
    let ageShift = -dayNumber * 0.3;

    // Sleep and stress patterns
    const sleptWell = rng() > 0.25;
    const stressed = rng() > 0.65;
    if (!sleptWell) { acneShift += 2; ageShift += 1; }
    if (stressed) acneShift += 2;

    const acneScore = Math.round(Math.max(18, Math.min(82,
      baseAcne + acneShift + (rng() * 4 - 2))));
    const sunScore = Math.round(Math.max(12, Math.min(65,
      baseSunDamage + sunShift + (rng() * 3 - 1.5))));
    const ageScore = Math.round(Math.max(22, Math.min(55,
      baseSkinAge + ageShift + (rng() * 3 - 1.5))));

    const inflammationIndex = Math.max(10, Math.min(80, 42 + acneShift * 0.6 + (rng() * 10 - 5)));
    const pigmentationIndex = Math.max(10, Math.min(70, 28 + sunShift * 0.8 + (rng() * 8 - 4)));
    const textureIndex = Math.max(10, Math.min(70, 35 + ageShift * 0.7 + (rng() * 8 - 4)));

    // Derive the five skin signals ("higher = better") from the same per-day
    // scores that drive the arc, so the facet tiles mirror the acne/sun/skin-age
    // story: as those problem scores fall, calm/even/bounce/etc. rise.
    const signal_scores: SignalScores = {
      structure: clampSignal(88 - (ageScore - 22) * 0.6),
      hydration: clampSignal(100 - textureIndex),
      inflammation: clampSignal(100 - acneScore),
      sunDamage: clampSignal(100 - sunScore),
      elasticity: clampSignal(100 - ageScore),
    };

    records.push({
      daily_id: dailyId,
      user_id: 'demo_user_001',
      date: daysAgo(i),
      scanner_reading_id: `demo_scan_${i}`,
      scanner_indices: {
        inflammation_index: inflammationIndex,
        pigmentation_index: pigmentationIndex,
        texture_index: textureIndex,
      },
      scanner_quality_flag: rng() > 0.05 ? 'pass' : 'warn',
      scan_region: 'left_cheek',
      sunscreen_used: usedSunscreen,
      new_product_added: dayNumber === 11,
      period_status_confirmed: 'accurate',
      cycle_day_estimated: cycleDay,
      sleep_quality: sleptWell ? (rng() > 0.5 ? 'great' : 'ok') : 'poor',
      stress_level: stressed ? 'high' : (rng() > 0.5 ? 'med' : 'low'),
    });

    // Determine primary driver and action
    let primaryDriver: string;
    let action: string;
    let escalation = false;

    if (differinPurge) {
      primaryDriver = 'new product confounder';
      action = 'Adapalene purge is expected in weeks 2-4. Keep routine stable and avoid layering new actives.';
    } else if (isCycleWindow && acneScore > 50) {
      primaryDriver = 'cycle window';
      action = 'Likely cycle-related; keep routine stable and avoid adding new actives.';
    } else if (!usedSunscreen && sunScore > 35) {
      primaryDriver = 'low sunscreen adherence';
      action = 'Add sunscreen daily (AM) and reapply on high-exposure days.';
    } else if (!sleptWell && stressed) {
      primaryDriver = 'lifestyle factors';
      action = 'Sleep and stress both flagged. Focus on recovery tonight for better signal tomorrow.';
    } else if (acneScore < 40) {
      primaryDriver = 'routine adherence';
      action = 'Your routine is working. Acne signal is trending down. Stay consistent.';
    } else {
      primaryDriver = 'general tracking';
      action = 'Continue daily scans. The trend is building and will sharpen over the next week.';
    }

    // Check for rapid change (escalation)
    if (outputs.length > 0) {
      const prev = outputs[outputs.length - 1];
      if (Math.abs(acneScore - prev.acne_score) > 18) escalation = true;
    }

    const output: ModelOutput = {
      output_id: `demo_output_${i}`,
      daily_id: dailyId,
      acne_score: acneScore,
      sun_damage_score: sunScore,
      skin_age_score: ageScore,
      confidence: dayNumber < 5 ? 'low' : dayNumber < 10 ? 'med' : 'high',
      primary_driver: primaryDriver,
      recommended_action: action,
      escalation_flag: escalation,
      signal_scores,
    };
    // The three most recent scans also carry a full facial-structure read.
    if (i <= 2) {
      output.bone_structure = buildDemoBoneStructure(i, daysAgo(i) + 'T09:12:00.000Z');
    }
    outputs.push(output);
  }

  return { records, outputs };
};

export const createDemoGamification = (): GamificationState => {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 5);

  return {
    xp: 420,
    level: 'Enthusiast',
    badges: [
      {
        id: 'first_scan',
        name: 'First Steps',
        description: 'Complete your first scan',
        earned_at: daysAgo(21) + 'T09:00:00.000Z',
        xp_reward: 25,
      },
      {
        id: 'streak_7',
        name: 'Week Warrior',
        description: 'Maintain a 7-day scan streak',
        earned_at: daysAgo(14) + 'T09:00:00.000Z',
        xp_reward: 25,
      },
      {
        id: 'sunscreen_champion',
        name: 'Sun Shield',
        description: 'Use sunscreen 7 days in a row',
        earned_at: daysAgo(10) + 'T09:00:00.000Z',
        xp_reward: 25,
      },
      {
        id: 'sleep_warrior',
        name: 'Sleep Champion',
        description: 'Log great sleep 5 times',
        earned_at: daysAgo(7) + 'T09:00:00.000Z',
        xp_reward: 25,
      },
      {
        id: 'level_novice',
        name: 'Rising Star',
        description: 'Reach Novice level',
        earned_at: daysAgo(18) + 'T09:00:00.000Z',
        xp_reward: 25,
      },
      {
        id: 'level_enthusiast',
        name: 'Skin Enthusiast',
        description: 'Reach Enthusiast level',
        earned_at: daysAgo(5) + 'T09:00:00.000Z',
        xp_reward: 25,
      },
    ],
    weekly_challenges: [
      {
        id: 'demo_challenge_1',
        title: 'Scan Squad',
        description: 'Complete 3 scans this week',
        target: 3,
        progress: 2,
        xp_reward: 50,
        expires_at: expiresAt.toISOString(),
        completed: false,
      },
    ],
    personal_bests: {
      longest_streak: 12,
      lowest_acne: 28,
      highest_skin_score: 74,
      most_consistent_week: 6,
    },
  };
};

export const createDemoSeed = () => {
  const user = createDemoUser();
  const protocol = createDemoProtocol();
  const products = createDemoProducts();
  const { records, outputs } = createDemoHistory();
  const gamification = createDemoGamification();

  return { user, protocol, products, records, outputs, gamification };
};
