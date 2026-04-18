import type { DailyRecord, ModelOutput, ProductEntry, UserProfile, ScanProtocol, GamificationState } from '../types';

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
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
    if (isCycleWindow) acneShift += 6 + Math.random() * 4;
    if (isLutealPeak) acneShift += 3;
    if (differinPurge) acneShift += 5 + Math.random() * 3;
    if (onDifferin && !differinPurge) acneShift -= 2;

    // Sun damage: mostly flat, slight improvement with consistent sunscreen
    const usedSunscreen = i <= 2 ? true : Math.random() > 0.2; // more consistent recently
    let sunShift = -dayNumber * 0.15;
    if (!usedSunscreen) sunShift += 3;

    // Skin age: slow steady improvement from routine
    let ageShift = -dayNumber * 0.3;

    // Sleep and stress patterns
    const sleptWell = Math.random() > 0.25;
    const stressed = Math.random() > 0.65;
    if (!sleptWell) { acneShift += 2; ageShift += 1; }
    if (stressed) acneShift += 2;

    const acneScore = Math.round(Math.max(18, Math.min(82,
      baseAcne + acneShift + (Math.random() * 4 - 2))));
    const sunScore = Math.round(Math.max(12, Math.min(65,
      baseSunDamage + sunShift + (Math.random() * 3 - 1.5))));
    const ageScore = Math.round(Math.max(22, Math.min(55,
      baseSkinAge + ageShift + (Math.random() * 3 - 1.5))));

    records.push({
      daily_id: dailyId,
      user_id: 'demo_user_001',
      date: daysAgo(i),
      scanner_reading_id: `demo_scan_${i}`,
      scanner_indices: {
        inflammation_index: Math.max(10, Math.min(80, 42 + acneShift * 0.6 + (Math.random() * 10 - 5))),
        pigmentation_index: Math.max(10, Math.min(70, 28 + sunShift * 0.8 + (Math.random() * 8 - 4))),
        texture_index: Math.max(10, Math.min(70, 35 + ageShift * 0.7 + (Math.random() * 8 - 4))),
      },
      scanner_quality_flag: Math.random() > 0.05 ? 'pass' : 'warn',
      scan_region: 'left_cheek',
      sunscreen_used: usedSunscreen,
      new_product_added: dayNumber === 11,
      period_status_confirmed: 'accurate',
      cycle_day_estimated: cycleDay,
      sleep_quality: sleptWell ? (Math.random() > 0.5 ? 'great' : 'ok') : 'poor',
      stress_level: stressed ? 'high' : (Math.random() > 0.5 ? 'med' : 'low'),
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
      action = 'Your routine is working. Acne signal is trending down — stay consistent.';
    } else {
      primaryDriver = 'general tracking';
      action = 'Continue daily scans. The trend is building and will sharpen over the next week.';
    }

    // Check for rapid change (escalation)
    if (outputs.length > 0) {
      const prev = outputs[outputs.length - 1];
      if (Math.abs(acneScore - prev.acne_score) > 18) escalation = true;
    }

    outputs.push({
      output_id: `demo_output_${i}`,
      daily_id: dailyId,
      acne_score: acneScore,
      sun_damage_score: sunScore,
      skin_age_score: ageScore,
      confidence: dayNumber < 5 ? 'low' : dayNumber < 10 ? 'med' : 'high',
      primary_driver: primaryDriver,
      recommended_action: action,
      escalation_flag: escalation,
    });
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
