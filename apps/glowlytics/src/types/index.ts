export type PrimaryGoal = 'acne' | 'sun_damage' | 'skin_age';
export type PeriodApplicable = 'yes' | 'no' | 'prefer_not';
export type ScanRegion = 'forehead' | 'left_cheek' | 'right_cheek' | 'jawline' | 'whole_face' | 'crows_feet' | 'under_eye' | 'temple';
export type QualityFlag = 'pass' | 'warn' | 'fail';
export type Confidence = 'low' | 'med' | 'high';
export type SleepQuality = 'poor' | 'ok' | 'great';
export type StressLevel = 'low' | 'med' | 'high';
export type UsageSchedule = 'AM' | 'PM' | 'both';
export type CaptureMethod = 'barcode' | 'photo' | 'search';
export type PermissionStatus = 'not_requested' | 'granted' | 'denied' | 'blocked' | 'unavailable';
export type HealthSource = 'apple_health' | 'health_connect';
export type HealthDataType =
  | 'sleep'
  | 'resting_heart_rate'
  | 'heart_rate_variability'
  | 'steps'
  | 'mindful_minutes'
  | 'menstrual_flow';

// ---------------------------------------------------------------------------
// Appearance preferences (Settings → Appearance)
// ---------------------------------------------------------------------------

/**
 * Palette identifier from `GlowPalettes`. `auto` ties to system-time so dusk
 * morphs into rose at sunrise / sunset on capable devices.
 */
export type AppearancePaletteId = 'dusk' | 'meadow' | 'rose' | 'auto';

/** App-wide colour-scheme override. `auto` defers to OS. */
export type AppearanceMode = 'light' | 'dark' | 'auto';

/**
 * Alternate iOS app icon. `og-dusk` is the bundle's primary icon (no native
 * swap needed). The other six map to the names in
 * `app.json > plugins > expo-alternate-app-icons`.
 */
export type AppearanceIconKey =
  | 'og-dusk'
  | 'og-sunset'
  | 'og-meadow'
  | 'og-rose'
  | 'og-plum'
  | 'lowercase-g'
  | 'cursive-g';

export interface AppearancePreferences {
  /** Glow palette identifier — drives the cream/plum/rose theme. */
  palette: AppearancePaletteId;
  /** Light / dark / system. */
  mode: AppearanceMode;
  /**
   * Body-text scale factor (0–1 slider position). Resolved to a multiplier
   * via `appearanceTextScaleFactor(textSize)` so the slider math stays in
   * one place.
   */
  textSize: number;
  /** Render accent text in DancingScript italics (the brand's flourish). */
  serifItalics: boolean;
  /** Soften / disable non-essential animations. */
  reduceMotion: boolean;
  /** Currently active iOS app icon. */
  icon: AppearanceIconKey;
}

// Onboarding profile types
export type BiologicalSex = 'male' | 'female' | 'other' | 'prefer_not';
export type MenstrualStatus = 'regular' | 'irregular' | 'no' | 'prefer_not';
export type ExerciseFrequency = 'rarely' | '1-2_weekly' | '3-4_weekly' | '5+_weekly';
export type ShowerFrequency = 'once_daily' | 'twice_daily' | '3+_daily' | 'every_other' | 'less';
export type HandWashingFrequency = 'rarely' | 'few_daily' | 'after_meals' | 'very_frequent';
export type BirthControlType = 'pill' | 'iud' | 'patch' | 'ring' | 'injection' | 'implant';

export type OnboardingScreenName =
  | 'welcome' | 'age-range' | 'sex' | 'location' | 'skin-goal'
  | 'products' | 'menstrual' | 'cycle-details' | 'supplements' | 'exercise'
  | 'shower-frequency' | 'hand-washing' | 'scan-reminder'
  | 'camera-permission' | 'health-permission' | 'ready' | 'preview' | 'paywall';

export interface HealthConnectionState {
  status: PermissionStatus;
  source?: HealthSource;
  requested_types: HealthDataType[];
  granted_types: HealthDataType[];
  sync_skipped: boolean;
  last_checked_at?: string;
  last_synced_at?: string;
  availability_note?: string;
  cycle_detected?: boolean;
}

export interface UserProfile {
  user_id: string;
  age_range: string;
  sex?: BiologicalSex;
  location_coarse: string;
  period_applicable: PeriodApplicable;
  period_last_start_date?: string;
  cycle_length_days: number;
  menstrual_status?: MenstrualStatus;
  on_hormonal_birth_control?: 'yes' | 'no' | 'prefer_not';
  birth_control_type?: BirthControlType;
  supplements?: string[];
  exercise_frequency?: ExerciseFrequency;
  shower_frequency?: ShowerFrequency;
  hand_washing_frequency?: HandWashingFrequency;
  smoker_status?: boolean;
  drink_baseline_frequency?: string;
  wearable_connected: boolean;
  wearable_source?: string;
  camera_permission_status: PermissionStatus;
  health_connection: HealthConnectionState;
  skin_goals?: PrimaryGoal[];
  onboarding_complete: boolean;
}

export interface ScanProtocol {
  protocol_id: string;
  user_id: string;
  primary_goal: PrimaryGoal;
  scan_region: ScanRegion;
  scan_frequency: string;
  baseline_date: string;
}

export interface ProductEntry {
  user_product_id: string;
  user_id: string;
  product_name: string;
  product_capture_method: CaptureMethod;
  ingredients_list: string[];
  usage_schedule: UsageSchedule;
  start_date: string;
  end_date?: string;
  notes?: string;
  brand?: string;
}

export interface DailyRecord {
  daily_id: string;
  user_id: string;
  date: string;
  scanner_reading_id: string;
  scanner_indices: {
    inflammation_index: number;
    pigmentation_index: number;
    texture_index: number;
  };
  scanner_quality_flag: QualityFlag;
  scan_region: ScanRegion;
  photo_uri?: string;
  photo_quality_flag?: QualityFlag;
  sunscreen_used: boolean;
  new_product_added: boolean;
  period_status_confirmed?: 'accurate' | 'not_accurate';
  cycle_day_estimated?: number;
  sleep_quality?: SleepQuality;
  stress_level?: StressLevel;
  drinks_yesterday?: string;
  /**
   * ISO timestamp of when the scan was completed (set by analyzing.tsx).
   * Local-only: the backend silently ignores unknown columns. Used by
   * gamification (early_bird badge, scan-time consistency analyses).
   */
  scanned_at?: string;
}

export interface ModelOutput {
  output_id: string;
  daily_id: string;
  acne_score: number;
  sun_damage_score: number;
  skin_age_score: number;
  confidence: Confidence;
  primary_driver?: string;
  recommended_action: string;
  escalation_flag: boolean;
  conditions?: DetectedCondition[];
  rag_recommendations?: RagRecommendation[];
  personalized_feedback?: string;
  signal_scores?: SignalScores;
  signal_features?: SignalFeatures;
  lesions?: DetectedLesion[];
  signal_confidence?: SignalConfidence;
  zone_severity?: ZoneSeverity;
  generated_insights?: GeneratedInsights;
  bone_structure?: BoneStructureResult;
}

// ---------------------------------------------------------------------------
// Bone-structure / Harmony types
// ---------------------------------------------------------------------------

export type BoneMeshSource = 'arkit' | 'mediapipe';

export type BoneDomain = 'symmetry' | 'periorbital' | 'mandibular' | 'midface' | 'nose' | 'brow';

export type BoneFindingSeverity = 'mild' | 'moderate' | 'marked';

export type BoneFindingCode =
  | 'canthal_tilt_negative' | 'canthal_tilt_excess'
  | 'scleral_show_inferior' | 'palpebral_fissure_narrow' | 'ipd_atypical'
  | 'gonial_angle_obtuse' | 'gonial_angle_acute'
  | 'lower_face_wide' | 'lower_face_narrow'
  | 'chin_recessed' | 'chin_excess'
  | 'bitemporal_narrow' | 'bitemporal_wide' | 'midface_flat'
  | 'alar_wide' | 'nasolabial_acute' | 'nasolabial_obtuse'
  | 'brow_low' | 'brow_high' | 'brow_apex_misplaced'
  | 'thirds_uneven' | 'fifths_uneven' | 'asymmetry_elevated';

export interface BoneFinding {
  findingCode: BoneFindingCode;
  metric: string;
  value: number;
  score: number;
  severity: BoneFindingSeverity;
}

export type BoneInterventionTier = 'lifestyle' | 'pharmacological' | 'interventional';

export interface BoneIntervention {
  id: string;
  tier: BoneInterventionTier;
  title: string;
  body: string;
}

export interface InterventionBundle {
  lifestyle: BoneIntervention[];
  pharmacological: BoneIntervention[];
  interventional: BoneIntervention[];
  procedural_disclaimer: string;
}

export interface CapturedFaceMesh {
  vertices: number[];          // flat xyz triples
  indices?: number[];          // optional triangle indices
  normals?: number[];          // flat xyz triples, optional
  blendShapes?: Record<string, number>;
  source: BoneMeshSource;
  capturedAt: string;
}

export interface BoneStructureResult {
  harmony: number | null;
  status: 'ok' | 'no_face' | 'insufficient';
  domain_scores: Partial<Record<BoneDomain, number | null>>;
  scored_metrics: Record<string, number>;
  metrics: Record<string, { value: number; raw?: Record<string, unknown> }>;
  findings: BoneFinding[];
  interventions: InterventionBundle;
  dominant_driver: BoneDomain | null;
  downsampled_mesh?: { vertices: number[]; source: BoneMeshSource } | null;
  source: BoneMeshSource;
  sex: 'male' | 'female' | null;
  generated_at: string;
  latency_ms?: number;
  /**
   * True when the server wrote `bone_structure` to the model_outputs row.
   * False when the related row hasn't synced yet — the client should queue
   * a retry through syncOutbox so MCP queries eventually see this scan.
   */
  persisted?: boolean;
}

export interface ScanResult {
  daily: DailyRecord;
  output: ModelOutput;
}

// Condition detection
export type ConditionName = 'acne' | 'hyperpigmentation' | 'fine_lines' | 'rosacea' |
  'dehydration' | 'sun_spots' | 'texture_irregularity' | 'dark_circles' | 'enlarged_pores';

export type FacialRegion = 'forehead' | 'left_cheek' | 'right_cheek' | 'nose' | 'chin' | 'jaw' | 'under_eye' | 'temple';

export type ConditionSeverity = 'mild' | 'moderate' | 'severe';

export interface ConditionZone {
  region: FacialRegion;
  severity: ConditionSeverity;
}

export interface DetectedCondition {
  name: ConditionName;
  severity: ConditionSeverity;
  zones: ConditionZone[];
  description: string;
}

export interface RagRecommendation {
  text: string;
  category: string;
  relevance: number;
  signal?: string;
  evidence_level?: 'A' | 'B' | 'C';
  source_citation?: string;
}

// Subscription
export type SubscriptionTier = 'free' | 'premium';

export interface SubscriptionState {
  tier: SubscriptionTier;
  is_active: boolean;
  expires_at: string | null;
  product_id: string | null;
  free_scans_used: number;
  trial_start_date: string | null;
  trial_end_date: string | null;
}

// Notification settings
export interface NotificationSettings {
  notifications_enabled: boolean;
  notification_time: string | null; // HH:MM format
}

export interface PatternNotificationsState {
  first_pattern_unlock_sent: boolean;
}

// Gamification
export type BadgeId = 'first_scan' | 'streak_7' | 'streak_30' | 'streak_60' |
  'sunscreen_champion' | 'perfect_week' | 'sleep_warrior' | 'product_expert' |
  'early_bird' | 'consistency_king' |
  'level_novice' | 'level_enthusiast' | 'level_expert' | 'level_master' | 'level_scientist';

export type LevelName = 'Beginner' | 'Novice' | 'Enthusiast' | 'Expert' | 'Master' | 'Skin Scientist';

export interface Badge {
  id: BadgeId;
  name: string;
  description: string;
  earned_at?: string;
  xp_reward: number;
}

export interface WeeklyChallenge {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  xp_reward: number;
  expires_at: string;
  completed: boolean;
}

export interface PersonalBests {
  longest_streak: number;
  lowest_acne: number;
  highest_skin_score: number;
  most_consistent_week: number;
}

export interface GamificationState {
  xp: number;
  level: LevelName;
  badges: Badge[];
  weekly_challenges: WeeklyChallenge[];
  personal_bests: PersonalBests;
}

// Signal-specific analysis types
export type SignalName = 'structure' | 'hydration' | 'inflammation' | 'sunDamage' | 'elasticity';

export interface SignalScores {
  structure: number;
  hydration: number;
  inflammation: number;
  sunDamage: number;
  elasticity: number;
}

export interface SignalFeatures {
  inflammation_a_star?: number;
  ita_variance?: number;
  spot_count?: number;
  pore_density?: number;
  wrinkle_index?: number;
  specular_ratio?: number;
}

export type LesionClass = 'acne' | 'comedone' | 'papule' | 'pustule' | 'nodule' | 'macule' | 'patch';

export type LesionTier = 'confirmed' | 'possible';

export interface DetectedLesion {
  class: LesionClass;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height] normalized 0-1
  zone: FacialRegion;
  tier?: LesionTier;
  trackId?: string;
}

export type SignalConfidenceLevel = 'low' | 'med' | 'high';

export interface SignalConfidence {
  structure: SignalConfidenceLevel;
  hydration: SignalConfidenceLevel;
  inflammation: SignalConfidenceLevel;
  sunDamage: SignalConfidenceLevel;
  elasticity: SignalConfidenceLevel;
}

// Zone severity from GPT-4o analysis
export interface ZoneSeverityEntry {
  dominant_signal: string;
  severity: number;
}

export type ZoneSeverity = Record<string, ZoneSeverityEntry>;

// Generated insights from Stage 2 streaming
export interface SignalInsight {
  status: string;
  driver: string;
  action: string;
}

export interface ZoneFinding {
  zone: string;
  finding: string;
  recommendation: string;
}

export interface ProductGuidance {
  stop: string;
  consider: string;
  continue: string;
}

export interface GeneratedInsights {
  overall_summary: string;
  overall_score_context: string;
  signal_insights: Record<string, SignalInsight>;
  zone_findings: ZoneFinding[];
  product_guidance: ProductGuidance;
  action_plan: string[];
}

// ─── Pattern Engine types ───────────────────────────────────────────────
// Correlation-based insight feature. See docs/superpowers/specs/2026-04-07-pattern-engine-design.md

export interface HealthDailyRecord {
  health_daily_id: string;
  user_id: string;
  date: string;                          // YYYY-MM-DD, via localDateStr()
  source: 'apple_health' | 'health_connect' | 'manual';
  // Sleep
  sleep_total_minutes: number | null;
  sleep_deep_minutes: number | null;
  sleep_rem_minutes: number | null;
  // Cardiovascular
  hrv_sdnn_ms: number | null;
  resting_hr_bpm: number | null;
  // Activity
  steps: number | null;
  mindful_minutes: number | null;
  // Menstrual (HKCategoryTypeIdentifierMenstrualFlow)
  menstrual_flow: 'none' | 'light' | 'medium' | 'heavy' | 'unspecified' | null;
  // Derived cycle day (1-based, from detected period starts within last 90 days)
  cycle_day_estimated: number | null;
  // Sync metadata
  synced_at: string;
  partial: boolean;
}

export interface HealthSyncStatus {
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  in_progress: boolean;
}

export type PatternConfidence = 'strong' | 'moderate' | 'emerging' | 'watching';

// Pattern signals map to the 5 keys of SignalScores plus 'overall' (derived mean).
// 'acne' is not a separate signal in this codebase — inflammation is the clinical proxy.
export type PatternSignal =
  | 'overall'
  | 'structure'
  | 'inflammation'
  | 'hydration'
  | 'sunDamage'
  | 'elasticity';

export type PatternType =
  | 'cycle_signal_phase'
  | 'health_signal_lag'
  | 'lifestyle_signal_corr'
  | 'product_trajectory'
  | 'outlier_day';

export interface PatternChartPoint {
  date: string;
  signalValue: number;                   // 0-100
  driverValue: number | null;
  driverLabel: string;
}

export interface Pattern {
  id: string;
  type: PatternType;
  signal: PatternSignal;
  driver: string;                        // e.g. 'hrv_sdnn_ms', 'cycle_day'
  driverLabel: string;                   // human label for UI
  confidence: PatternConfidence;
  correlationCoefficient: number;        // -1.0 to 1.0; internal
  sampleSize: number;                    // n of paired data points
  lagDays: number;                       // 0 = same day; positive = driver leads
  insightText: string;                   // headline ≤80 chars
  detailText: string;                    // prose ≤200 chars
  chartData: PatternChartPoint[];
  detectedAt: string;                    // ISO
  firstSeenAt: string;                   // ISO
  isPredicted: boolean;                  // true for cold-start placeholder
  requiresHealthKit?: boolean;
  unlocksAtDay?: number;                 // for predicted patterns only
}

export type FirstLookInsightDriver =
  | 'asymmetry'
  | 'age_gap'
  | 'hot_zone'
  | 'lesion_count'
  | 'cycle_setup'
  | 'positive_percentile';

export interface FirstLookInsight {
  headline: string;                      // ≤80 chars
  detail: string;                        // ≤200 chars
  driver: FirstLookInsightDriver;
}

// ---------------------------------------------------------------------------
// Shopping Advisor (scan-while-shopping) — see .local/advisor-frontend-contract.md
// Mirrors the LOCKED POST /api/products/shopping-scan response shape exactly.
// ---------------------------------------------------------------------------

/** API verdict. Design label map: buy='Fits you', maybe='Worth a look', skip='Not for you'. */
export type ShoppingVerdict = 'buy' | 'maybe' | 'skip';

export type ShoppingReasonKind = 'goal' | 'conflict' | 'redundancy' | 'flag' | 'neutral';
export type ShoppingReasonTone = 'good' | 'warn' | 'bad';
export type ShoppingSeverity = 'high' | 'med' | 'low';

export interface ShoppingReason {
  kind: ShoppingReasonKind;
  tone: ShoppingReasonTone;
  text: string;
}

export interface ShoppingConflict {
  code: string;
  severity: ShoppingSeverity;
  message: string;
  withProduct?: string;
}

export interface ShoppingRedundancy {
  category: string;
  withProduct: string;
}

export interface ShoppingFlag {
  code: string;
  severity: string;
  message: string;
}

export interface ShoppingGoalFit {
  /** 0..100 */
  score: number;
  beneficial: string[];
  label: string;
}

export interface ShoppingProduct {
  name: string;
  brand: string;
  ingredients: string[];
  image_url: string | null;
  source: string;
}

/**
 * A successful, identified shopping-scan verdict. The endpoint also returns the
 * unidentified sentinel `{ identified: false }` (no other fields populated), so
 * callers MUST guard on `identified` before reading the rest. `shoppingScan`
 * types its return as this shape; the orchestrator narrows on `identified`.
 */
export interface ShoppingScanResult {
  identified: boolean;
  product: ShoppingProduct;
  verdict: ShoppingVerdict;
  /** 0..100 int */
  score: number;
  headline: string;
  reasons: ShoppingReason[];
  goalFit: ShoppingGoalFit;
  conflicts: ShoppingConflict[];
  redundancy: ShoppingRedundancy | null;
  flags: ShoppingFlag[];
  /** true when the shelf/routine couldn't be loaded, so conflicts/redundancy may be incomplete */
  partial?: boolean;
}

/** Request body for POST /api/products/shopping-scan. */
export interface ShoppingScanInput {
  barcode?: string;
  image_base64?: string;
  name?: string;
  ingredients?: string[];
}

/**
 * A product scanned + kept this session. Doubles as the persisted "considering"
 * wishlist row (advise-only — no cart). `id` is stable per product identity so
 * re-scanning the same item dedupes across the session and the saved list.
 */
export interface ConsideringItem {
  id: string;
  name: string;
  brand?: string;
  verdict: ShoppingVerdict;
  score: number;
  result: ShoppingScanResult;
  savedAt: number;
}
