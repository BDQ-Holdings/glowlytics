import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import type {
  UserProfile, ScanProtocol, ProductEntry, DailyRecord,
  ModelOutput, PrimaryGoal, ScanRegion, HealthConnectionState,
  GamificationState, Badge, WeeklyChallenge, LevelName,
  OnboardingScreenName, SubscriptionState, NotificationSettings,
  DetectedLesion, HealthDailyRecord, HealthSyncStatus, Pattern, FirstLookInsight,
  PatternNotificationsState, ConsideringItem,
  AppearancePreferences,
} from '../types';
import { DEFAULT_APPEARANCE, applyAppIcon } from '../services/appearance';
import { defaultSubscription, canScan as canScanPure, startTrial as computeTrial, logOutRevenueCat } from '../services/subscription';
import * as api from '../services/api';
import { enqueueSync, resetSyncOutbox } from '../services/syncOutbox';
import { buildOnboardingFlow } from '../services/onboardingFlow';
import { localDateStr } from '../utils/localDate';
import { activeProducts } from '../services/ritual';
import { detectPatterns } from '../services/patternEngine';
import { trackEvent, resetAnalytics } from '../services/analytics';
import { encryptJson, decryptJson } from '../services/secureStorage';
import { pullLastNDays } from '../services/healthSync';
import {
  cancelAllAppNotifications,
  cancelDailyReminder,
  cancelRitualReminder,
  migrateLegacyNotifications,
  scheduleDailyReminder,
  scheduleRitualReminder,
} from '../services/notifications';
import {
  getLevelForXP,
  getXPForScan,
  checkBadgeEligibility,
  BADGE_DEFINITIONS,
  updatePersonalBests as computePersonalBests,
  generateWeeklyChallenges as generateChallenges,
} from '../services/gamification';

interface AppState {
  // User
  user: UserProfile | null;
  protocol: ScanProtocol | null;
  products: ProductEntry[];
  dailyRecords: DailyRecord[];
  modelOutputs: ModelOutput[];

  // The Clerk user id the local data is currently bound to. null = anonymous /
  // unclaimed onboarding data. Used to detect a switch to a *different* account
  // so we never adopt the previous account's data — see reconcileAuthUserId.
  authedUserId: string | null;

  // Runtime-only flag: true while hydrateForUser awaits the backend. Lets the UI
  // hold gating decisions until the signed-in user's data lands. NOT persisted.
  authHydrating: boolean;

  // Onboarding state
  onboardingStep: number;
  onboardingFlow: OnboardingScreenName[];
  onboardingFlowIndex: number;

  // Pending scan result (processing→analyzing handoff)
  pendingScanResult: Partial<ModelOutput> | null;
  pendingPhotoBase64: string | null;
  pendingLesions: DetectedLesion[] | null;

  // Gamification
  gamification: GamificationState;

  // Subscription
  subscription: SubscriptionState;

  // Notifications
  notificationSettings: NotificationSettings;

  // Health data + patterns
  healthDailyRecords: HealthDailyRecord[];
  healthSyncStatus: HealthSyncStatus;
  patterns: Pattern[];
  firstLookInsight: FirstLookInsight | null;

  // Pattern notification tracking
  patternNotifications: PatternNotificationsState;

  // Ritual: keyed by local YYYY-MM-DD → stepId → true (only stores positives).
  // stepId is either `product:<user_product_id>:am|pm` or `habit:<slug>` — see
  // `services/ritual.ts`.
  ritualCompletions: Record<string, Record<string, boolean>>;

  // Advise-only "considering" wishlist for the Shopping Advisor. Persisted like
  // other slices. Items the user saved while scanning in-store — never a cart.
  consideringList: ConsideringItem[];

  // Appearance preferences (Settings → Appearance). Stored verbatim;
  // side-effects (icon swap, font scale, motion gating) live in callers.
  appearance: AppearancePreferences;

  // Cross-component camera intent. The tab-bar's camera FAB on the Shelf tab
  // increments this counter; the ShelfTab listens and pops its AddProductSheet.
  // Counter (not boolean) so a second press while the sheet is open still
  // triggers a fresh open.
  openAddProductTrigger: number;

  // Daily quote gating — set to YYYY-MM-DD when the user dismisses the
  // morning quote screen. The DailyQuoteRouter in app/_layout.tsx checks
  // this against today's local date and shows /quote when stale.
  dailyQuoteSeenDate: string | null;

  // Preferred first name from onboarding. Client-side only — used for reveal
  // copy and notification previews, never synced to the backend profile.
  preferredName: string | null;

  // Explicit permission for sending personal scan data to third-party AI.
  aiProcessingConsentGranted: boolean;

  // Actions
  setOnboardingStep: (step: number) => void;
  setOnboardingFlow: (flow: OnboardingScreenName[]) => void;
  setOnboardingFlowIndex: (index: number) => void;
  setPreferredName: (name: string | null) => void;
  reconcileAuthUserId: (authUserId: string) => Promise<void>;
  hydrateForUser: (authUserId: string) => Promise<void>;
  createUser: (data: Partial<UserProfile>) => void;
  updateUser: (data: Partial<UserProfile>) => void;
  updateHealthConnection: (data: Partial<HealthConnectionState>) => void;
  setProtocol: (goal: PrimaryGoal, region: ScanRegion) => void;
  addProduct: (
    product: Omit<ProductEntry, 'user_product_id' | 'user_id'>,
    options?: { allowDuplicate?: boolean },
  ) => { status: 'added'; product: ProductEntry } | { status: 'duplicate'; duplicate: ProductEntry } | { status: 'ignored' };
  removeProduct: (id: string) => void;
  addDailyRecord: (record: Omit<DailyRecord, 'daily_id' | 'user_id'>) => DailyRecord;
  addModelOutput: (output: Omit<ModelOutput, 'output_id'>) => void;
  attachBoneStructure: (dailyId: string, bone: NonNullable<ModelOutput['bone_structure']>) => void;
  setPendingScanResult: (result: Partial<ModelOutput> | null) => void;
  clearPendingScanResult: () => void;
  setPendingPhotoBase64: (base64: string | null) => void;
  clearPendingPhotoBase64: () => void;
  setPendingLesions: (lesions: DetectedLesion[] | null) => void;
  getStreak: () => number;
  getLatestOutput: () => ModelOutput | null;
  getOutputHistory: (days: number) => ModelOutput[];
  loadPersistedData: () => Promise<void>;
  persistData: () => Promise<void>;
  resetAll: () => Promise<void>;
  awardXP: (amount: number) => void;
  checkAndAwardBadges: () => void;
  updatePersonalBests: () => void;
  generateWeeklyChallenges: () => void;
  setSubscription: (sub: SubscriptionState) => void;
  incrementFreeScansUsed: () => void;
  canPerformScan: () => boolean;
  startTrial: () => void;
  setNotificationTime: (time: string | null) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setDailyReminder: (enabled: boolean, time?: string) => Promise<void>;
  setRitualReminder: (section: 'am' | 'pm', enabled: boolean, time?: string) => Promise<void>;
  addHealthDailyRecord: (record: HealthDailyRecord) => void;
  upsertHealthDailyRecord: (date: string, record: HealthDailyRecord) => void;
  syncHealthData: () => Promise<{ added: number; errors: string[] }>;
  syncHealthDataInitial: () => Promise<{ added: number; errors: string[] }>;
  setPatterns: (patterns: Pattern[]) => void;
  setFirstLookInsight: (insight: FirstLookInsight | null) => void;
  runPatternDetection: () => void;
  setFirstUnlockNotifSent: (sent: boolean) => void;
  toggleRitualStep: (stepId: string, dateStr?: string) => void;
  saveToConsidering: (item: ConsideringItem) => void;
  removeFromConsidering: (id: string) => void;
  setAppearance: (patch: Partial<AppearancePreferences>) => Promise<void>;
  resetAppearance: () => Promise<void>;
  requestAddProduct: () => void;
  setAiProcessingConsentGranted: (granted: boolean) => void;
  markDailyQuoteSeen: () => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Cap the persisted considering list to the most-recent N entries to prevent
// AsyncStorage bloat (mirrors the 365-day records cap). The full-list screen
// also renders every entry, so an unbounded wishlist would degrade both.
const CONSIDERING_MAX = 100;

const randomHex = (length: number) =>
  Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');

const generateId = () => {
  try {
    const id = uuidv4();
    if (UUID_RE.test(id)) return id;
  } catch {
    // fall through
  }
  // UUID-safe fallback for native/runtime edge cases
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-a${randomHex(3)}-${randomHex(12)}`;
};

const defaultHealthConnection = (): HealthConnectionState => ({
  status: 'not_requested',
  requested_types: [],
  granted_types: [],
  sync_skipped: false,
});

const defaultGamification = (): GamificationState => ({
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
});

// Re-export getLevelForXP from gamification service as local alias
const levelForXP = getLevelForXP;

const normalizeUser = (user?: Partial<UserProfile> | null): UserProfile | null => {
  if (!user) return null;

  return {
    user_id: user.user_id || generateId(),
    age_range: user.age_range || '',
    sex: user.sex,
    location_coarse: user.location_coarse || '',
    period_applicable: user.period_applicable || 'prefer_not',
    period_last_start_date: user.period_last_start_date,
    cycle_length_days: user.cycle_length_days || 28,
    menstrual_status: user.menstrual_status,
    on_hormonal_birth_control: user.on_hormonal_birth_control,
    birth_control_type: user.birth_control_type,
    supplements: user.supplements,
    exercise_frequency: user.exercise_frequency,
    shower_frequency: user.shower_frequency,
    hand_washing_frequency: user.hand_washing_frequency,
    smoker_status: user.smoker_status,
    drink_baseline_frequency: user.drink_baseline_frequency,
    wearable_connected: user.wearable_connected || false,
    wearable_source: user.wearable_source,
    camera_permission_status: user.camera_permission_status || 'not_requested',
    health_connection: {
      ...defaultHealthConnection(),
      ...user.health_connection,
      requested_types: user.health_connection?.requested_types || [],
      granted_types: user.health_connection?.granted_types || [],
      sync_skipped: user.health_connection?.sync_skipped || false,
    },
    onboarding_complete: user.onboarding_complete || false,
  };
};

const isApiStatus = (err: unknown, status: number) =>
  err instanceof Error && err.message.startsWith(`API ${status}:`);

const messageFromUnknown = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

type BackendTrialPatch = Partial<UserProfile> & {
  trial_start_date?: string | null;
  trial_end_date?: string | null;
};

type PersistedAppState = Partial<
  Pick<
    AppState,
    | 'user'
    | 'authedUserId'
    | 'protocol'
    | 'products'
    | 'dailyRecords'
    | 'modelOutputs'
    | 'gamification'
    | 'subscription'
    | 'notificationSettings'
    | 'onboardingFlow'
    | 'onboardingFlowIndex'
    | 'healthDailyRecords'
    | 'healthSyncStatus'
    | 'patterns'
    | 'firstLookInsight'
    | 'patternNotifications'
    | 'ritualCompletions'
    | 'consideringList'
    | 'appearance'
    | 'dailyQuoteSeenDate'
    | 'preferredName'
    | 'aiProcessingConsentGranted'
  >
> & {
  // Version stamp of the persisted snapshot; absent on legacy (v1) blobs.
  schemaVersion?: number;
};

const asPersistedAppState = (value: unknown): PersistedAppState | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as PersistedAppState;
};

// Version of the persisted-snapshot schema. v1 is the implicit legacy shape
// (blobs written before versioning carry no schemaVersion field). Bump this
// and add a step in migratePersisted whenever the persisted shape changes.
// v3: notificationSettings gained AM/PM ritual reminder fields AND scheduling
// moved to per-identifier cancels — loadPersistedData runs a one-time
// cancel-all + reschedule for blobs older than v3 (side effect lives there
// because migratePersisted is pure/sync).
const SCHEMA_VERSION = 3;

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notifications_enabled: false,
  notification_time: null,
  ritual_am_enabled: false,
  ritual_am_time: null,
  ritual_pm_enabled: false,
  ritual_pm_time: null,
};

const normalizeNotificationSettings = (
  settings?: Partial<NotificationSettings> | null,
): NotificationSettings => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  ...(settings ?? {}),
});

const parseReminderTime = (time: string): { hour: number; minute: number } => {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid reminder time: ${time}`);
  }
  return { hour, minute };
};

const normalizeProductText = (value?: string | null) =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const productDuplicateKey = (product: Pick<ProductEntry, 'product_name' | 'brand'>) =>
  `${normalizeProductText(product.brand)}::${normalizeProductText(product.product_name)}`;

// removeProduct soft-deletes locally (sets end_date) while the backend hard-
// deletes, so a wholesale hydrate would erase ended products and degrade every
// historical ritual to a "Previously used product" placeholder. Keep local
// ended rows the server no longer knows about, carry a local end_date onto rows
// the server still returns, and reattach a local image_url when the server row
// lacks one: product_catalog historically had no image_url column, so a signed-
// in round-trip strips it and the shelf thumbnails vanish on the next launch.
// Belt-and-suspenders alongside the backend column fix — always map over the
// server rows (even with no ended rows) so active products keep their image.
const mergeEndedProducts = (server: ProductEntry[], local: ProductEntry[]): ProductEntry[] => {
  const localById = new Map(local.map((p) => [p.user_product_id, p]));
  const serverIds = new Set(server.map((p) => p.user_product_id));
  const merged = server.map((p) => {
    const localMatch = localById.get(p.user_product_id);
    if (!localMatch) return p;
    const carriedEndDate = localMatch.end_date ?? p.end_date;
    const carriedImageUrl = p.image_url ?? localMatch.image_url;
    if (carriedEndDate === p.end_date && carriedImageUrl === p.image_url) return p;
    return { ...p, end_date: carriedEndDate, image_url: carriedImageUrl };
  });
  const localEnded = local.filter((p) => p.end_date);
  return [...merged, ...localEnded.filter((p) => !serverIds.has(p.user_product_id))];
};

// Migration seam for persisted snapshots: every load routes through here with
// the version the blob was written at (legacy blobs count as v1). Stepwise
// upgrades slot in as the shape evolves, e.g.:
//   if (fromVersion < 3) parsed = reshapeV2toV3(parsed);
// All shapes through v2 are identical (v2 only introduced the version stamp),
// and unknown/future versions pass through untouched -- loadPersistedData's
// per-field defaults keep rehydration tolerant either way.
const migratePersisted = (
  parsed: PersistedAppState,
  fromVersion: number,
): PersistedAppState => {
  if (fromVersion < SCHEMA_VERSION) return parsed;
  return parsed;
};

const toBackendUserProfilePayload = (user: UserProfile): Partial<UserProfile> => ({
  ...user,
  age_range: user.age_range && user.age_range.trim().length > 0 ? user.age_range : '25-34',
  location_coarse:
    user.location_coarse && user.location_coarse.trim().length > 0
      ? user.location_coarse
      : 'Unknown',
});

const toApiDailyRecordPayload = (record: DailyRecord): Omit<DailyRecord, 'daily_id'> => ({
  ...record,
  // Backends expect UUID in scanner_reading_id; sanitize legacy/non-UUID local IDs.
  scanner_reading_id: UUID_RE.test(record.scanner_reading_id)
    ? record.scanner_reading_id
    : generateId(),
});

/**
 * Fire-and-forget backend sync — never blocks the UI.
 *
 * Routes through syncOutbox so transient failures (offline, 5xx, 429) get
 * retried with exponential backoff instead of being lost. Caller can pass
 * `isTerminalError` to short-circuit retries for semantically-OK errors
 * (e.g. 409 conflict means "already saved").
 */
const syncToBackend = (
  label: string,
  fn: () => Promise<unknown>,
  isTerminalError?: (err: unknown) => boolean,
) => {
  enqueueSync({ label, run: fn, isTerminalError });
};

/** Debounced persist — collapses rapid successive calls into one AsyncStorage write */
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedPersist = (persistFn: () => Promise<void>) => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistFn();
  }, 50);
};

export const useStore = create<AppState>((set, get) => ({
  user: null,
  authedUserId: null,
  authHydrating: false,
  protocol: null,
  products: [],
  dailyRecords: [],
  modelOutputs: [],
  onboardingStep: 0,
  onboardingFlow: buildOnboardingFlow(),
  onboardingFlowIndex: 0,
  pendingScanResult: null,
  pendingPhotoBase64: null,
  pendingLesions: null,
  gamification: defaultGamification(),
  subscription: defaultSubscription(),
  notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
  healthDailyRecords: [],
  healthSyncStatus: {
    last_sync_at: null,
    last_success_at: null,
    last_error: null,
    in_progress: false,
  },
  patterns: [],
  firstLookInsight: null,
  patternNotifications: { first_pattern_unlock_sent: false },
  ritualCompletions: {},
  consideringList: [],

  appearance: { ...DEFAULT_APPEARANCE },
  openAddProductTrigger: 0,
  dailyQuoteSeenDate: null,
  preferredName: null,
  aiProcessingConsentGranted: false,


  setOnboardingStep: (step) => set({ onboardingStep: step }),
  setOnboardingFlow: (flow) => set({ onboardingFlow: flow }),
  setOnboardingFlowIndex: (index) => set({ onboardingFlowIndex: index }),
  setPreferredName: (name) => {
    set({ preferredName: name });
    debouncedPersist(() => get().persistData());
  },
  reconcileAuthUserId: async (authUserId) => {
    if (!authUserId) return;
    const state = get();
    const { authedUserId, user } = state;

    // Already bound to this identity — nothing to do.
    if (authedUserId === authUserId) return;

    // Switching to a DIFFERENT already-authenticated account on this device.
    // NEVER adopt the previous account's data (that was the cross-account bleed
    // bug). Wipe local state, then load this user's own data from the backend.
    if (authedUserId && authedUserId !== authUserId) {
      await get().resetAll();
      set({ authedUserId: authUserId });
      await get().hydrateForUser(authUserId);
      return;
    }

    // authedUserId is null → local data (if any) is an anonymous onboarding
    // session not yet tied to a real account.
    if (user) {
      // Pre-upgrade migration hole: builds <=#120 persisted `authedUserId` as
      // null even for a real signed-in account. If the local `user_id` is already
      // a Clerk id (`user_…`) that differs from the identity now signing in, this
      // is a DIFFERENT account on a shared/upgraded device — treat it as a switch
      // (wipe + hydrate), never claim, so we never stamp or sync the previous
      // user's profile/products/records onto this account. Anonymous onboarding
      // ids come from generateId() (uuid) and never carry the `user_` prefix, so
      // a genuine first sign-in still falls through to the claim path below.
      if (user.user_id?.startsWith('user_') && user.user_id !== authUserId) {
        await get().resetAll();
        set({ authedUserId: authUserId });
        await get().hydrateForUser(authUserId);
        return;
      }
      // Claim it for this identity. A brand-new user's just-entered onboarding
      // data is the source of truth here, so do NOT hydrate-replace it.
      const migratedUser = normalizeUser({ ...user, user_id: authUserId });
      if (!migratedUser) return;
      set({
        user: migratedUser,
        authedUserId: authUserId,
        protocol: state.protocol ? { ...state.protocol, user_id: authUserId } : null,
        products: state.products.map((p) => ({ ...p, user_id: authUserId })),
        dailyRecords: state.dailyRecords.map((r) => ({ ...r, user_id: authUserId })),
      });
      debouncedPersist(() => get().persistData());
      syncToBackend('reconcile user id', async () => {
        try {
          await api.createUser(toBackendUserProfilePayload(migratedUser));
        } catch (err) {
          if (isApiStatus(err, 409)) return;
          throw err;
        }
      });
      return;
    }

    // No local user at all → returning user / fresh install. Pull their data.
    set({ authedUserId: authUserId });
    await get().hydrateForUser(authUserId);
  },

  hydrateForUser: async (authUserId) => {
    if (!authUserId) return;
    set({ authHydrating: true });
    try {
      // `undefined` is the per-call FAILURE sentinel (a successful fetch returns
      // the value or an empty array). This lets the merge below distinguish
      // "fetch failed → keep what we have" from "fetch succeeded but empty →
      // overwrite", so a transient network blip during hydrate never wipes a
      // signed-in user's protocol / products / records / scans out of the store.
      const [profile, protocol, products, dailyRecords, modelOutputs] = await Promise.all([
        api.getUser(authUserId).catch(() => null),
        api.getProtocol(authUserId).catch(() => undefined),
        api.getProducts(authUserId).catch(() => undefined),
        api.getDailyRecords(authUserId, 365).catch(() => undefined),
        api.getModelOutputs(authUserId, 365).catch(() => undefined),
      ]);
      // Identity race guard: a newer sign-in to a DIFFERENT account may have won
      // while we awaited the backend. If the store has since bound to another
      // (non-null) account, this result is stale — abort so we never clobber the
      // new account's data with the previous user's.
      if (get().authedUserId !== authUserId && get().authedUserId !== null) return;
      set({
        authedUserId: authUserId,
        user: profile ? normalizeUser(profile) : get().user,
        protocol: protocol !== undefined ? protocol : get().protocol,
        products: Array.isArray(products) ? mergeEndedProducts(products, get().products) : get().products,
        dailyRecords: Array.isArray(dailyRecords) ? dailyRecords : get().dailyRecords,
        // #14: GET /api/model-outputs returns newest-FIRST (ORDER BY date DESC),
        // but the store + UI treat modelOutputs[last] as the latest scan (matching
        // addModelOutput's append). Order newest-LAST by the joined `date` so a
        // post-reinstall hydrate doesn't surface the OLDEST scan as current
        // (inverting Today/Profile/Harmony + the profile "glow gained" sign).
        modelOutputs: Array.isArray(modelOutputs)
          ? [...modelOutputs].sort((a, b) => {
              const da = (a as ModelOutput & { date?: string }).date ?? '';
              const db = (b as ModelOutput & { date?: string }).date ?? '';
              return da < db ? -1 : da > db ? 1 : 0;
            })
          : get().modelOutputs,
      });
      debouncedPersist(() => get().persistData());
    } catch (e) {
      if (__DEV__) console.warn('[Store] hydrateForUser failed', e);
    } finally {
      set({ authHydrating: false });
    }
  },

  createUser: (data) => {
    const user = normalizeUser({
      user_id: data.user_id || generateId(),
      age_range: data.age_range || '',
      location_coarse: data.location_coarse || '',
      period_applicable: data.period_applicable || 'prefer_not',
      period_last_start_date: data.period_last_start_date,
      cycle_length_days: data.cycle_length_days || 28,
      smoker_status: data.smoker_status,
      drink_baseline_frequency: data.drink_baseline_frequency,
      wearable_connected: data.wearable_connected || false,
      wearable_source: data.wearable_source,
      camera_permission_status: data.camera_permission_status || 'not_requested',
      health_connection: data.health_connection || defaultHealthConnection(),
      onboarding_complete: data.onboarding_complete || false,
    });
    set({ user });
    debouncedPersist(() => get().persistData());
    if (user) {
      syncToBackend('create user profile', async () => {
        try {
          await api.createUser(toBackendUserProfilePayload(user));
        } catch (err) {
          if (isApiStatus(err, 409)) return;
          throw err;
        }
      });
    }
  },

  updateUser: (data) => {
    const current = get().user;
    if (!current) return;
    const updated = normalizeUser({
      ...current,
      ...data,
      health_connection: {
        ...current.health_connection,
        ...data.health_connection,
      },
    });
    set({ user: updated });
    debouncedPersist(() => get().persistData());
    if (!updated) return;
    const payload = { ...data } as Partial<UserProfile> & { user_id?: string };
    delete payload.user_id;
    if (Object.keys(payload).length === 0) return;

    syncToBackend('update user profile', async () => {
      try {
        await api.updateUser(updated.user_id, payload);
      } catch (err) {
        if (isApiStatus(err, 404)) {
          await api.createUser(toBackendUserProfilePayload(updated));
          await api.updateUser(updated.user_id, payload);
          return;
        }
        throw err;
      }
    });
  },

  updateHealthConnection: (data) => {
    const current = get().user;
    if (!current) return;

    const health_connection = {
      ...current.health_connection,
      ...data,
      requested_types: data.requested_types || current.health_connection.requested_types,
      granted_types: data.granted_types || current.health_connection.granted_types,
    };

    const updated = normalizeUser({
      ...current,
      wearable_connected: health_connection.status === 'granted',
      wearable_source:
        health_connection.status === 'granted'
          ? health_connection.source === 'apple_health'
            ? 'Apple Health'
            : 'Health Connect'
          : current.wearable_source,
      health_connection,
    });

    set({ user: updated });
    debouncedPersist(() => get().persistData());
  },

  setProtocol: (goal, region) => {
    const user = get().user;
    if (!user) return;
    const protocol: ScanProtocol = {
      protocol_id: generateId(),
      user_id: user.user_id,
      primary_goal: goal,
      scan_region: region,
      scan_frequency: 'daily',
      baseline_date: localDateStr(),
    };
    set({ protocol });
    debouncedPersist(() => get().persistData());
    syncToBackend('create protocol', () => api.createProtocol({
      user_id: user.user_id,
      primary_goal: goal,
      scan_region: region,
      baseline_date: protocol.baseline_date,
    }));
  },

  addProduct: (product, options) => {
    const user = get().user;
    if (!user) return { status: 'ignored' };
    if (!options?.allowDuplicate) {
      const key = productDuplicateKey(product);
      // Only the CURRENT shelf counts for duplicates — re-adding something the
      // user removed (even earlier today) is a legitimate add, not a duplicate.
      const duplicate = activeProducts(get().products).find(
        (p) => productDuplicateKey(p) === key,
      );
      if (duplicate) return { status: 'duplicate', duplicate };
    }
    const entry: ProductEntry = {
      ...product,
      user_product_id: generateId(),
      user_id: user.user_id,
    };
    set((s) => ({ products: [...s.products, entry] }));
    debouncedPersist(() => get().persistData());
    syncToBackend('add product', () => api.addProduct(entry));
    return { status: 'added', product: entry };
  },

  removeProduct: (id) => {
    const endDate = localDateStr();
    set((s) => ({
      products: s.products.map((p) =>
        p.user_product_id === id ? { ...p, end_date: p.end_date ?? endDate } : p,
      ),
    }));
    debouncedPersist(() => get().persistData());
    syncToBackend('remove product', () => api.deleteProduct(id));
  },

  addDailyRecord: (record) => {
    const user = get().user;
    if (!user) throw new Error('addDailyRecord called without a signed-in user');
    const entry: DailyRecord = {
      ...record,
      daily_id: generateId(),
      user_id: user.user_id,
    };
    set((s) => ({ dailyRecords: [...s.dailyRecords, entry] }));
    debouncedPersist(() => get().persistData());
    syncToBackend('add daily record', async () => {
      const synced = await api.addDailyRecord(toApiDailyRecordPayload(entry));
      if (synced.daily_id && synced.daily_id !== entry.daily_id) {
        set((s) => ({
          dailyRecords: s.dailyRecords.map((r) =>
            r.daily_id === entry.daily_id ? { ...r, daily_id: synced.daily_id } : r
          ),
          modelOutputs: s.modelOutputs.map((o) =>
            o.daily_id === entry.daily_id ? { ...o, daily_id: synced.daily_id } : o
          ),
        }));
        debouncedPersist(() => get().persistData());
      }
    });

    // Calculate context items logged for XP bonus
    let contextItems = 0;
    if (record.sleep_quality) contextItems++;
    if (record.stress_level) contextItems++;
    if (record.drinks_yesterday) contextItems++;

    const streak = get().getStreak();
    const xp = getXPForScan(streak, contextItems);
    get().awardXP(xp);
    get().checkAndAwardBadges();
    return entry;
  },

  addModelOutput: (output) => {
    const entry: ModelOutput = {
      ...output,
      output_id: generateId(),
    };
    set((s) => ({ modelOutputs: [...s.modelOutputs, entry] }));
    debouncedPersist(() => get().persistData());
    syncToBackend('add model output', async () => {
      let backendDailyId = entry.daily_id;
      const localRecord = get().dailyRecords.find((r) => r.daily_id === entry.daily_id);
      if (localRecord) {
        const syncedDaily = await api.addDailyRecord(toApiDailyRecordPayload(localRecord));
        if (syncedDaily.daily_id) {
          backendDailyId = syncedDaily.daily_id;
          if (backendDailyId !== localRecord.daily_id) {
            set((s) => ({
              dailyRecords: s.dailyRecords.map((r) =>
                r.daily_id === localRecord.daily_id ? { ...r, daily_id: backendDailyId } : r
              ),
              modelOutputs: s.modelOutputs.map((o) =>
                o.daily_id === localRecord.daily_id ? { ...o, daily_id: backendDailyId } : o
              ),
            }));
            debouncedPersist(() => get().persistData());
          }
        }
      }
      await api.addModelOutput({ ...entry, daily_id: backendDailyId });
    });
    get().updatePersonalBests();
  },

  attachBoneStructure: (dailyId, bone) => {
    set((s) => ({
      modelOutputs: s.modelOutputs.map((o) =>
        o.daily_id === dailyId ? { ...o, bone_structure: bone } : o,
      ),
    }));
    debouncedPersist(() => get().persistData());
  },

  addHealthDailyRecord: (record) => {
    set((s) => ({ healthDailyRecords: [...s.healthDailyRecords, record] }));
    debouncedPersist(() => get().persistData());
  },

  upsertHealthDailyRecord: (date, record) => {
    set((s) => {
      const existing = s.healthDailyRecords.findIndex((r) => r.date === date);
      if (existing >= 0) {
        const prev = s.healthDailyRecords[existing];
        // Field-level merge (#13): a transient HealthKit failure returns an
        // all-null record for the day; wholesale-replacing would permanently
        // destroy that day's good data. Keep the prior value wherever the
        // incoming metric is null/undefined (0 and '' are valid and kept).
        const merged: HealthDailyRecord = {
          ...prev,
          sleep_total_minutes: record.sleep_total_minutes ?? prev.sleep_total_minutes,
          sleep_deep_minutes: record.sleep_deep_minutes ?? prev.sleep_deep_minutes,
          sleep_rem_minutes: record.sleep_rem_minutes ?? prev.sleep_rem_minutes,
          hrv_sdnn_ms: record.hrv_sdnn_ms ?? prev.hrv_sdnn_ms,
          resting_hr_bpm: record.resting_hr_bpm ?? prev.resting_hr_bpm,
          steps: record.steps ?? prev.steps,
          mindful_minutes: record.mindful_minutes ?? prev.mindful_minutes,
          menstrual_flow: record.menstrual_flow ?? prev.menstrual_flow,
          cycle_day_estimated: record.cycle_day_estimated ?? prev.cycle_day_estimated,
          synced_at: record.synced_at,
        };
        merged.partial =
          merged.sleep_total_minutes === null &&
          merged.hrv_sdnn_ms === null &&
          merged.resting_hr_bpm === null;
        const next = [...s.healthDailyRecords];
        next[existing] = merged;
        return { healthDailyRecords: next };
      }
      return { healthDailyRecords: [...s.healthDailyRecords, record] };
    });
    debouncedPersist(() => get().persistData());
  },

  syncHealthData: async () => {
    const user = get().user;
    if (!user) return { added: 0, errors: ['no_user'] };
    // Reentrancy guard: foreground listener + post-scan can fire close together.
    // The in_progress flag becomes a real mutex by reading it here.
    if (get().healthSyncStatus.in_progress) {
      return { added: 0, errors: ['already_in_progress'] };
    }
    set((s) => ({ healthSyncStatus: { ...s.healthSyncStatus, in_progress: true } }));
    try {
      const { records, errors } = await pullLastNDays(2, user.user_id);
      for (const r of records) {
        get().upsertHealthDailyRecord(r.date, r);
      }
      set((s) => ({
        healthSyncStatus: {
          ...s.healthSyncStatus,
          in_progress: false,
          last_sync_at: new Date().toISOString(),
          last_success_at:
            records.length > 0 ? new Date().toISOString() : s.healthSyncStatus.last_success_at,
          last_error: errors.length > 0 ? errors[0] : null,
        },
      }));
      // Trigger pattern re-detection after a successful sync
      get().runPatternDetection();
      return { added: records.length, errors };
    } catch (e: unknown) {
      const message = messageFromUnknown(e);
      set((s) => ({
        healthSyncStatus: {
          ...s.healthSyncStatus,
          in_progress: false,
          last_sync_at: new Date().toISOString(),
          last_error: message,
        },
      }));
      return { added: 0, errors: [message] };
    }
  },

  syncHealthDataInitial: async () => {
    const user = get().user;
    if (!user) return { added: 0, errors: ['no_user'] };
    set((s) => ({ healthSyncStatus: { ...s.healthSyncStatus, in_progress: true } }));
    try {
      const { records, errors } = await pullLastNDays(14, user.user_id);
      for (const r of records) {
        get().upsertHealthDailyRecord(r.date, r);
      }
      set((s) => ({
        healthSyncStatus: {
          ...s.healthSyncStatus,
          in_progress: false,
          last_sync_at: new Date().toISOString(),
          last_success_at:
            records.length > 0 ? new Date().toISOString() : s.healthSyncStatus.last_success_at,
          last_error: errors.length > 0 ? errors[0] : null,
        },
      }));
      get().runPatternDetection();
      return { added: records.length, errors };
    } catch (e: unknown) {
      const message = messageFromUnknown(e);
      set((s) => ({
        healthSyncStatus: {
          ...s.healthSyncStatus,
          in_progress: false,
          last_sync_at: new Date().toISOString(),
          last_error: message,
        },
      }));
      return { added: 0, errors: [message] };
    }
  },

  setPatterns: (patterns) => {
    set({ patterns });
    debouncedPersist(() => get().persistData());
  },

  setFirstLookInsight: (insight) => {
    set({ firstLookInsight: insight });
    debouncedPersist(() => get().persistData());
  },

  setFirstUnlockNotifSent: (sent) => {
    set((s) => ({ patternNotifications: { ...s.patternNotifications, first_pattern_unlock_sent: sent } }));
    debouncedPersist(() => get().persistData());
  },

  toggleRitualStep: (stepId, dateStr) => {
    const date = dateStr ?? localDateStr(new Date());
    set((s) => {
      const dayMap = s.ritualCompletions[date] ?? {};
      const next: Record<string, boolean> = { ...dayMap };
      if (next[stepId]) {
        delete next[stepId];
      } else {
        next[stepId] = true;
      }
      const updated = { ...s.ritualCompletions };
      if (Object.keys(next).length === 0) {
        delete updated[date];
      } else {
        updated[date] = next;
      }
      return { ritualCompletions: updated };
    });
    debouncedPersist(() => get().persistData());
  },

  saveToConsidering: (item) => {
    set((s) => {
      const existing = s.consideringList.findIndex((c) => c.id === item.id);
      if (existing >= 0) {
        const next = [...s.consideringList];
        next[existing] = item;
        return { consideringList: next };
      }
      // Appended items are newest; cap to the most-recent CONSIDERING_MAX,
      // dropping the oldest. (The in-place update branch above never grows the
      // list, so it needs no cap.)
      return { consideringList: [...s.consideringList, item].slice(-CONSIDERING_MAX) };
    });
    debouncedPersist(() => get().persistData());
  },

  removeFromConsidering: (id) => {
    set((s) => ({ consideringList: s.consideringList.filter((c) => c.id !== id) }));
    debouncedPersist(() => get().persistData());
  },

  setAppearance: async (patch) => {
    const prev = get().appearance;
    const next = { ...prev, ...patch };
    set({ appearance: next });
    debouncedPersist(() => get().persistData());

    // Native icon swap is the only side-effect that has to talk to the OS.
    // We do it AFTER persisting the optimistic state — that way a transient
    // failure (unsupported device, user-cancelled iOS alert) leaves the
    // store reflecting reality once we revert. Resolves to `false` when the
    // module/device can't fulfil the request; we revert the stored value
    // and let the UI re-render against the previous icon.
    if (patch.icon && patch.icon !== prev.icon) {
      const ok = await applyAppIcon(patch.icon);
      if (!ok) {
        set({ appearance: { ...get().appearance, icon: prev.icon } });
        debouncedPersist(() => get().persistData());
      }
    }
  },

  resetAppearance: async () => {
    const prev = get().appearance;
    set({ appearance: { ...DEFAULT_APPEARANCE } });
    debouncedPersist(() => get().persistData());
    if (prev.icon !== DEFAULT_APPEARANCE.icon) {
      const ok = await applyAppIcon(DEFAULT_APPEARANCE.icon);
      if (!ok) {
        set({ appearance: { ...get().appearance, icon: prev.icon } });
        debouncedPersist(() => get().persistData());
      }
    }
  },

  // Bump the cross-component counter so the Shelf tab opens its
  // AddProductSheet. Used by the tab-bar camera FAB when on the Shelf tab.
  requestAddProduct: () => {
    set((s) => ({ openAddProductTrigger: s.openAddProductTrigger + 1 }));
  },

  setAiProcessingConsentGranted: (granted) => {
    set({ aiProcessingConsentGranted: granted });
    debouncedPersist(() => get().persistData());
  },

  markDailyQuoteSeen: () => {
    set({ dailyQuoteSeenDate: localDateStr(new Date()) });
    debouncedPersist(() => get().persistData());
  },

  runPatternDetection: () => {
    const state = get();
    if (!state.user) return;
    try {
      const previous = state.patterns;
      const next = detectPatterns({
        modelOutputs: state.modelOutputs,
        dailyRecords: state.dailyRecords,
        healthDailyRecords: state.healthDailyRecords,
        userProfile: state.user,
      });
      set({ patterns: next });
      debouncedPersist(() => get().persistData());
      // Fire pattern_first_seen for newly detected real patterns
      const prevIds = new Set(previous.filter((p) => !p.isPredicted).map((p) => p.id));
      for (const p of next) {
        if (!p.isPredicted && !prevIds.has(p.id)) {
          trackEvent('pattern_first_seen', {
            pattern_type: p.type,
            confidence: p.confidence,
            data_days_at_detection: state.dailyRecords.length,
          });
        }
      }
      // Fire one-time unlock notification if appropriate.
      // Dynamic require to keep expo-notifications out of Jest.
      try {
        const { maybeSendFirstPatternUnlockNotification } =
          require('../services/patternNotifications');
        maybeSendFirstPatternUnlockNotification(
          previous,
          next,
          state.patternNotifications.first_pattern_unlock_sent,
        ).then((sent: boolean) => {
          if (sent) get().setFirstUnlockNotifSent(true);
        });
      } catch {
        // patternNotifications module failed to load — non-fatal
      }
    } catch (e: unknown) {
      console.warn('[patternEngine] detection failed:', messageFromUnknown(e));
    }
  },

  setPendingScanResult: (result) => set({ pendingScanResult: result }),
  clearPendingScanResult: () => set({ pendingScanResult: null }),
  setPendingPhotoBase64: (base64) => set({ pendingPhotoBase64: base64 }),
  clearPendingPhotoBase64: () => set({ pendingPhotoBase64: null }),
  setPendingLesions: (lesions) => set({ pendingLesions: lesions }),

  getStreak: () => {
    const records = get().dailyRecords;
    if (records.length === 0) return 0;
    const dateSet = new Set(records.map((r) => r.date));
    const today = new Date();
    // Grace for "not scanned yet today": a streak earned through yesterday is
    // still alive in the morning before today's scan. Start the walk at today,
    // but if today isn't logged yet, start at yesterday — so the flame only
    // breaks on a real gap (no today AND no yesterday), not every morning.
    const startOffset = dateSet.has(localDateStr(today)) ? 0 : 1;
    let streak = 0;
    let i = startOffset;
    while (true) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - i);
      if (!dateSet.has(localDateStr(expected))) break;
      streak++;
      i++;
    }
    return streak;
  },

  getLatestOutput: () => {
    const outputs = get().modelOutputs;
    if (outputs.length === 0) return null;
    return outputs[outputs.length - 1];
  },

  getOutputHistory: (days) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = localDateStr(cutoff);
    const records = get().dailyRecords.filter((r) => r.date >= cutoffStr);
    const dailyIds = new Set(records.map((r) => r.daily_id));
    return get().modelOutputs.filter((o) => dailyIds.has(o.daily_id));
  },

  awardXP: (amount) => {
    set((s) => {
      const newXP = s.gamification.xp + amount;
      return {
        gamification: {
          ...s.gamification,
          xp: newXP,
          level: levelForXP(newXP),
        },
      };
    });
    debouncedPersist(() => get().persistData());
  },

  checkAndAwardBadges: () => {
    const { gamification, dailyRecords, modelOutputs, products } = get();
    const streak = get().getStreak();

    const newBadgeIds = checkBadgeEligibility(
      gamification,
      dailyRecords,
      modelOutputs,
      products,
      streak,
    );

    if (newBadgeIds.length === 0) return;

    const newBadges: Badge[] = newBadgeIds.map((id) => {
      const def = BADGE_DEFINITIONS[id];
      return {
        id,
        name: def.name,
        description: def.description,
        earned_at: new Date().toISOString(),
        xp_reward: def.xp_reward,
      };
    });

    const bonusXP = newBadges.reduce((sum, b) => sum + b.xp_reward, 0);
    set((s) => {
      const newXP = s.gamification.xp + bonusXP;
      return {
        gamification: {
          ...s.gamification,
          badges: [...s.gamification.badges, ...newBadges],
          xp: newXP,
          level: levelForXP(newXP),
        },
      };
    });
    debouncedPersist(() => get().persistData());
  },

  updatePersonalBests: () => {
    const { modelOutputs, dailyRecords, gamification } = get();
    if (modelOutputs.length === 0) return;

    const streak = get().getStreak();
    const updatedBests = computePersonalBests(
      gamification.personal_bests,
      dailyRecords,
      modelOutputs,
      streak,
    );

    set((s) => ({
      gamification: {
        ...s.gamification,
        personal_bests: updatedBests,
      },
    }));
    debouncedPersist(() => get().persistData());
  },

  generateWeeklyChallenges: () => {
    const { gamification } = get();
    const challenges = generateChallenges(gamification.weekly_challenges);
    set((s) => ({
      gamification: {
        ...s.gamification,
        weekly_challenges: challenges,
      },
    }));
    debouncedPersist(() => get().persistData());
  },

  setSubscription: (sub) => {
    set({ subscription: sub });
    debouncedPersist(() => get().persistData());
  },

  incrementFreeScansUsed: () => {
    set((s) => ({
      subscription: {
        ...s.subscription,
        free_scans_used: s.subscription.free_scans_used + 1,
      },
    }));
    debouncedPersist(() => get().persistData());
  },

  canPerformScan: () => canScanPure(get().subscription),

  startTrial: () => {
    if (get().subscription.trial_start_date) return; // already started
    const trialFields = computeTrial();
    set((s) => ({
      subscription: { ...s.subscription, ...trialFields },
    }));
    // Sync trial dates to backend
    const user = get().user;
    if (user) {
      syncToBackend('update trial dates', async () => {
        const patch: BackendTrialPatch = {
          trial_start_date: trialFields.trial_start_date,
          trial_end_date: trialFields.trial_end_date,
        };
        try {
          await api.updateUser(user.user_id, patch);
        } catch (err) {
          if (isApiStatus(err, 404)) {
            await api.createUser(toBackendUserProfilePayload(user));
            await api.updateUser(user.user_id, patch);
            return;
          }
          throw err;
        }
      });
    }
    debouncedPersist(() => get().persistData());
  },

  setNotificationTime: (time) => {
    set((s) => ({
      notificationSettings: {
        ...normalizeNotificationSettings(s.notificationSettings),
        notifications_enabled: time !== null,
        notification_time: time,
      },
    }));
    debouncedPersist(() => get().persistData());
  },

  setNotificationsEnabled: (enabled) => {
    set((s) => ({
      notificationSettings: {
        ...normalizeNotificationSettings(s.notificationSettings),
        notifications_enabled: enabled,
      },
    }));
    debouncedPersist(() => get().persistData());
  },

  setDailyReminder: async (enabled, time) => {
    if (enabled) {
      const nextTime = time ?? get().notificationSettings.notification_time ?? '08:00';
      const { hour, minute } = parseReminderTime(nextTime);
      await scheduleDailyReminder(hour, minute);
      get().setNotificationTime(nextTime);
      return;
    }
    await cancelDailyReminder();
    // Keep notification_time so re-enabling restores the user's chosen time
    // instead of snapping back to the 08:00 default.
    set((s) => ({
      notificationSettings: {
        ...normalizeNotificationSettings(s.notificationSettings),
        notifications_enabled: false,
      },
    }));
    debouncedPersist(() => get().persistData());
  },

  setRitualReminder: async (section, enabled, time) => {
    const timeKey = section === 'am' ? 'ritual_am_time' : 'ritual_pm_time';
    const enabledKey = section === 'am' ? 'ritual_am_enabled' : 'ritual_pm_enabled';
    if (enabled) {
      const nextTime = time ?? get().notificationSettings[timeKey] ?? (section === 'am' ? '07:00' : '21:30');
      const parsed = parseReminderTime(nextTime);
      await scheduleRitualReminder(section, parsed);
      set((s) => ({
        notificationSettings: {
          ...normalizeNotificationSettings(s.notificationSettings),
          [enabledKey]: true,
          [timeKey]: nextTime,
        },
      }));
      debouncedPersist(() => get().persistData());
      return;
    }
    await cancelRitualReminder(section);
    // Keep the stored time (same rationale as setDailyReminder's off-path).
    set((s) => ({
      notificationSettings: {
        ...normalizeNotificationSettings(s.notificationSettings),
        [enabledKey]: false,
      },
    }));
    debouncedPersist(() => get().persistData());
  },

  loadPersistedData: async () => {
    try {
      const raw = await AsyncStorage.getItem('glowlytics_data');
      let parsed: PersistedAppState | null = null;
      let needsReencrypt = false;
      if (raw) {
        try {
          // MOB-01: the persisted blob is AES-encrypted at rest.
          parsed = asPersistedAppState(await decryptJson(raw));
        } catch {
          // Legacy plaintext blob written before encryption: parse it and flag
          // for one-time transparent re-encryption once state is restored.
          try {
            parsed = asPersistedAppState(JSON.parse(raw));
            if (parsed) needsReencrypt = true;
          } catch {
            parsed = null;
          }
        }
      }
      const fromVersion = parsed?.schemaVersion ?? 1;
      if (parsed) {
        // Schema-version seam: blobs written before versioning carry no
        // schemaVersion field and are treated as v1.
        parsed = migratePersisted(parsed, fromVersion);
      }
      const hasPersistedSession = Boolean(
        parsed?.user ||
        parsed?.protocol ||
        (parsed?.dailyRecords && parsed.dailyRecords.length > 0) ||
        (parsed?.modelOutputs && parsed.modelOutputs.length > 0)
      );

      if (parsed && hasPersistedSession) {
        // Restore the persisted onboarding flow as-is when it's valid: it already
        // encodes the healthSyncedCycleDetected decision (manual menstrual screens
        // skipped when HealthKit supplied cycle data). Rebuilding here dropped that
        // 3rd arg and re-inserted those screens, lengthening the flow and desyncing
        // the persisted index so resume landed on the wrong screen (#34). Only
        // rebuild when the persisted flow is missing/empty.
        let restoredFlow: OnboardingScreenName[] = parsed.onboardingFlow ?? [];
        if (!Array.isArray(restoredFlow) || restoredFlow.length === 0) {
          restoredFlow = buildOnboardingFlow(parsed.user?.sex, parsed.user?.menstrual_status);
        }
        const restoredIndex = typeof parsed.onboardingFlowIndex === 'number' ? parsed.onboardingFlowIndex : 0;

        set({
          user: normalizeUser(parsed.user),
          authedUserId: parsed.authedUserId ?? null,
          protocol: parsed.protocol || null,
          products: parsed.products || [],
          dailyRecords: parsed.dailyRecords || [],
          modelOutputs: parsed.modelOutputs || [],
          gamification: parsed.gamification || defaultGamification(),
          subscription: {
            ...defaultSubscription(),
            ...parsed.subscription,
            trial_start_date: parsed.subscription?.trial_start_date ?? null,
            trial_end_date: parsed.subscription?.trial_end_date ?? null,
          },
          notificationSettings: normalizeNotificationSettings(parsed.notificationSettings),
          onboardingFlow: restoredFlow,
          onboardingFlowIndex: restoredIndex,
          healthDailyRecords: parsed.healthDailyRecords || [],
          // Force in_progress false on restore: a sync killed mid-flight persists
          // in_progress:true, and the syncHealthData mutex would then short-circuit
          // every future sync forever (#11). Cold start is always "not syncing".
          healthSyncStatus: parsed.healthSyncStatus
            ? { ...parsed.healthSyncStatus, in_progress: false }
            : {
                last_sync_at: null,
                last_success_at: null,
                last_error: null,
                in_progress: false,
              },
          patterns: parsed.patterns || [],
          firstLookInsight: parsed.firstLookInsight || null,
          patternNotifications: parsed.patternNotifications || { first_pattern_unlock_sent: false },
          ritualCompletions: parsed.ritualCompletions || {},
          // Trim a previously-bloated persisted list down to the cap on load.
          consideringList: Array.isArray(parsed.consideringList) ? parsed.consideringList.slice(-CONSIDERING_MAX) : [],
          appearance: {
            // Partial merge so a new field in DEFAULT_APPEARANCE picks up on
            // upgrade without wiping the user's existing choices.
            ...DEFAULT_APPEARANCE,
            ...(parsed.appearance ?? {}),
          },
          dailyQuoteSeenDate: typeof parsed.dailyQuoteSeenDate === 'string' ? parsed.dailyQuoteSeenDate : null,
          preferredName: typeof parsed.preferredName === 'string' ? parsed.preferredName : null,
          aiProcessingConsentGranted: parsed.aiProcessingConsentGranted === true,
        });

        // Backfill: upgraded users from pre-paywall builds may have no trial dates.
        // If they're not paid AND have never had a trial, grant one now (one-time only).
        // Fix layer 2 of 3 for the paywall gap.
        const restoredSub = get().subscription;
        if (
          !restoredSub.is_active &&
          restoredSub.trial_start_date === null &&
          restoredSub.trial_end_date === null
        ) {
          get().startTrial();
        }
        // v3 migration: pre-identifier builds scheduled notifications without
        // identifiers, unreachable by the per-identifier cancels — nuke every
        // OS-scheduled notification once, then reschedule what's enabled.
        // Best-effort: a failure here must never block state restore.
        if (fromVersion < 3) {
          void (async () => {
            try {
              await migrateLegacyNotifications();
              const ns = get().notificationSettings;
              if (ns.notifications_enabled && ns.notification_time) {
                const t = parseReminderTime(ns.notification_time);
                await scheduleDailyReminder(t.hour, t.minute);
              }
              if (ns.ritual_am_enabled && ns.ritual_am_time) {
                await scheduleRitualReminder('am', parseReminderTime(ns.ritual_am_time));
              }
              if (ns.ritual_pm_enabled && ns.ritual_pm_time) {
                await scheduleRitualReminder('pm', parseReminderTime(ns.ritual_pm_time));
              }
              // Stamp v3 so the migration never re-runs.
              await get().persistData();
            } catch { /* best-effort */ }
          })();
        }
        // MOB-01: upgrade a migrated legacy plaintext blob to the encrypted format.
        if (needsReencrypt) {
          try { await get().persistData(); } catch { /* best-effort migration */ }
        }
        return;
      }

      // No persisted data — start clean
    } catch (e) {
      console.log('Failed to load persisted data', e);
    }
  },

  persistData: async () => {
    try {
      const {
        user, authedUserId, protocol, products, dailyRecords, modelOutputs, gamification,
        subscription, notificationSettings, onboardingFlow, onboardingFlowIndex,
        healthDailyRecords, healthSyncStatus, patterns, firstLookInsight,
        patternNotifications, ritualCompletions, appearance, dailyQuoteSeenDate,
        preferredName, aiProcessingConsentGranted, consideringList,
      } = get();
      // Cap stored records to last 365 days to prevent AsyncStorage bloat
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 365);
      const cutoffStr = localDateStr(cutoff);
      const cappedDailyRecords = dailyRecords.filter((r) => r.date >= cutoffStr);
      const cappedDailyIds = new Set(cappedDailyRecords.map((r) => r.daily_id));
      const cappedModelOutputs = modelOutputs.filter((o) => cappedDailyIds.has(o.daily_id));
      const cappedHealthRecords = healthDailyRecords.filter((r) => r.date >= cutoffStr);
      const cappedRitualCompletions = Object.fromEntries(
        Object.entries(ritualCompletions).filter(([date]) => date >= cutoffStr),
      );
      // MOB-01: encrypt the blob at rest before writing to AsyncStorage.
      const snapshot = {
        schemaVersion: SCHEMA_VERSION,
        user, authedUserId, protocol, products,
        dailyRecords: cappedDailyRecords,
        modelOutputs: cappedModelOutputs,
        gamification, subscription, notificationSettings,
        onboardingFlow, onboardingFlowIndex,
        healthDailyRecords: cappedHealthRecords,
        healthSyncStatus, patterns, firstLookInsight, patternNotifications,
        ritualCompletions: cappedRitualCompletions,
        appearance, dailyQuoteSeenDate, preferredName, aiProcessingConsentGranted, consideringList,
      };
      await AsyncStorage.setItem('glowlytics_data', await encryptJson(snapshot));
    } catch (e) {
      console.log('Failed to persist data', e);
    }
  },

  resetAll: async () => {
    // Cancel any pending debounced persist so it doesn't re-write cleared data
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    set({
      user: null,
      authedUserId: null,
      authHydrating: false,
      protocol: null,
      products: [],
      dailyRecords: [],
      modelOutputs: [],
      onboardingStep: 0,
      onboardingFlow: buildOnboardingFlow(),
      onboardingFlowIndex: 0,
      pendingScanResult: null,
      pendingPhotoBase64: null,
      pendingLesions: null,
      gamification: defaultGamification(),
      subscription: defaultSubscription(),
      notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
      healthDailyRecords: [],
      healthSyncStatus: {
        last_sync_at: null,
        last_success_at: null,
        last_error: null,
        in_progress: false,
      },
      patterns: [],
      firstLookInsight: null,
      patternNotifications: { first_pattern_unlock_sent: false },
      ritualCompletions: {},
      appearance: { ...DEFAULT_APPEARANCE },
      dailyQuoteSeenDate: null,
      preferredName: null,
      aiProcessingConsentGranted: false,
      consideringList: [],
    });
    try { await cancelAllAppNotifications(); } catch { /* best-effort */ }
    // Cross-account bleed guard: sign-out is the single cleanup chokepoint, so it
    // must also drop the previous user's cached JWT, queued mutations, analytics
    // identity, and RevenueCat entitlement. Each is isolated so one failure can't
    // block the others — the next account on a shared device starts clean.
    try { api.clearAuthTokenCache(); } catch { /* best-effort */ }
    try { resetSyncOutbox(); } catch { /* best-effort */ }
    try { resetAnalytics(); } catch { /* best-effort */ }
    try { await logOutRevenueCat(); } catch { /* best-effort */ }
    try {
      await AsyncStorage.removeItem('glowlytics_data');
      // MOB-02: account/data deletion must also wipe captured face photos at rest.
      const FileSystemLegacy = require('expo-file-system/legacy');
      await FileSystemLegacy.deleteAsync(
        `${FileSystemLegacy.documentDirectory}scan_photos/`,
        { idempotent: true },
      );
    } catch {
      // Best-effort cleanup
    }
  },
}));
