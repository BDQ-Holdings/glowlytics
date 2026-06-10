import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import type {
  UserProfile, ScanProtocol, ProductEntry, DailyRecord,
  ModelOutput, PrimaryGoal, ScanRegion, HealthConnectionState,
  GamificationState, Badge, WeeklyChallenge, LevelName,
  OnboardingScreenName, SubscriptionState, NotificationSettings,
  DetectedLesion, HealthDailyRecord, HealthSyncStatus, Pattern, FirstLookInsight,
  PatternNotificationsState,
  AppearancePreferences,
} from '../types';
import { DEFAULT_APPEARANCE, applyAppIcon } from '../services/appearance';
import { defaultSubscription, canScan as canScanPure, startTrial as computeTrial } from '../services/subscription';
import * as api from '../services/api';
import { enqueueSync } from '../services/syncOutbox';
import { buildOnboardingFlow } from '../services/onboardingFlow';
import { localDateStr } from '../utils/localDate';
import { detectPatterns } from '../services/patternEngine';
import { trackEvent } from '../services/analytics';
// healthSync imports the native @kingstinct/react-native-healthkit module at the top level,
// which throws when loaded under Jest (no TurboModule registry). Defer to a dynamic require
// inside syncHealthData so the test environment never triggers the native binding.
import type { pullLastNDays as PullLastNDays } from '../services/healthSync';
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

  // Actions
  setOnboardingStep: (step: number) => void;
  setOnboardingFlow: (flow: OnboardingScreenName[]) => void;
  setOnboardingFlowIndex: (index: number) => void;
  reconcileAuthUserId: (authUserId: string) => Promise<void>;
  hydrateForUser: (authUserId: string) => Promise<void>;
  createUser: (data: Partial<UserProfile>) => void;
  updateUser: (data: Partial<UserProfile>) => void;
  updateHealthConnection: (data: Partial<HealthConnectionState>) => void;
  setProtocol: (goal: PrimaryGoal, region: ScanRegion) => void;
  addProduct: (product: Omit<ProductEntry, 'user_product_id' | 'user_id'>) => void;
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
  addHealthDailyRecord: (record: HealthDailyRecord) => void;
  upsertHealthDailyRecord: (date: string, record: HealthDailyRecord) => void;
  syncHealthData: () => Promise<{ added: number; errors: string[] }>;
  syncHealthDataInitial: () => Promise<{ added: number; errors: string[] }>;
  setPatterns: (patterns: Pattern[]) => void;
  setFirstLookInsight: (insight: FirstLookInsight | null) => void;
  runPatternDetection: () => void;
  setFirstUnlockNotifSent: (sent: boolean) => void;
  toggleRitualStep: (stepId: string, dateStr?: string) => void;
  setAppearance: (patch: Partial<AppearancePreferences>) => Promise<void>;
  resetAppearance: () => Promise<void>;
  requestAddProduct: () => void;
  markDailyQuoteSeen: () => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  notificationSettings: { notifications_enabled: false, notification_time: null },
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
  openAddProductTrigger: 0,
  dailyQuoteSeenDate: null,

  setOnboardingStep: (step) => set({ onboardingStep: step }),
  setOnboardingFlow: (flow) => set({ onboardingFlow: flow }),
  setOnboardingFlowIndex: (index) => set({ onboardingFlowIndex: index }),
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
    try {
      const [profile, protocol, products, dailyRecords, modelOutputs] = await Promise.all([
        api.getUser(authUserId).catch(() => null),
        api.getProtocol(authUserId).catch(() => null),
        api.getProducts(authUserId).catch(() => [] as ProductEntry[]),
        api.getDailyRecords(authUserId, 365).catch(() => [] as DailyRecord[]),
        api.getModelOutputs(authUserId, 365).catch(() => [] as ModelOutput[]),
      ]);
      set({
        authedUserId: authUserId,
        user: profile ? normalizeUser(profile) : get().user,
        protocol: protocol ?? null,
        products: Array.isArray(products) ? products : [],
        dailyRecords: Array.isArray(dailyRecords) ? dailyRecords : [],
        modelOutputs: Array.isArray(modelOutputs) ? modelOutputs : [],
      });
      debouncedPersist(() => get().persistData());
    } catch (e) {
      if (__DEV__) console.warn('[Store] hydrateForUser failed', e);
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

  addProduct: (product) => {
    const user = get().user;
    if (!user) return;
    const entry: ProductEntry = {
      ...product,
      user_product_id: generateId(),
      user_id: user.user_id,
    };
    set((s) => ({ products: [...s.products, entry] }));
    debouncedPersist(() => get().persistData());
    syncToBackend('add product', () => api.addProduct(entry));
  },

  removeProduct: (id) => {
    set((s) => ({ products: s.products.filter((p) => p.user_product_id !== id) }));
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
        const next = [...s.healthDailyRecords];
        next[existing] = record;
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
      // Dynamic require keeps the native HealthKit binding out of the Jest module graph.
      const pullLastNDays: typeof PullLastNDays = require('../services/healthSync').pullLastNDays;
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
    } catch (e: any) {
      set((s) => ({
        healthSyncStatus: {
          ...s.healthSyncStatus,
          in_progress: false,
          last_sync_at: new Date().toISOString(),
          last_error: e?.message ?? String(e),
        },
      }));
      return { added: 0, errors: [e?.message ?? String(e)] };
    }
  },

  syncHealthDataInitial: async () => {
    const user = get().user;
    if (!user) return { added: 0, errors: ['no_user'] };
    set((s) => ({ healthSyncStatus: { ...s.healthSyncStatus, in_progress: true } }));
    try {
      const pullLastNDays: typeof PullLastNDays = require('../services/healthSync').pullLastNDays;
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
    } catch (e: any) {
      set((s) => ({
        healthSyncStatus: {
          ...s.healthSyncStatus,
          in_progress: false,
          last_sync_at: new Date().toISOString(),
          last_error: e?.message ?? String(e),
        },
      }));
      return { added: 0, errors: [e?.message ?? String(e)] };
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
    } catch (e: any) {
      console.warn('[patternEngine] detection failed:', e?.message ?? e);
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
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < records.length; i++) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - i);
      const expectedStr = localDateStr(expected);
      if (dateSet.has(expectedStr)) {
        streak++;
      } else {
        break;
      }
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
        const patch = {
          trial_start_date: trialFields.trial_start_date,
          trial_end_date: trialFields.trial_end_date,
        } as any;
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
    set({ notificationSettings: { notifications_enabled: time !== null, notification_time: time } });
    debouncedPersist(() => get().persistData());
  },

  setNotificationsEnabled: (enabled) => {
    set((s) => ({
      notificationSettings: { ...s.notificationSettings, notifications_enabled: enabled },
    }));
    debouncedPersist(() => get().persistData());
  },

  loadPersistedData: async () => {
    try {
      const data = await AsyncStorage.getItem('glowlytics_data');
      const parsed = data ? JSON.parse(data) : null;
      const hasPersistedSession = Boolean(
        parsed?.user ||
        parsed?.protocol ||
        (parsed?.dailyRecords && parsed.dailyRecords.length > 0) ||
        (parsed?.modelOutputs && parsed.modelOutputs.length > 0)
      );

      if (hasPersistedSession) {
        // Restore onboarding flow: use persisted flow, or rebuild from profile if stale/missing
        let restoredFlow: OnboardingScreenName[] = parsed.onboardingFlow;
        if (!Array.isArray(restoredFlow) || (parsed.user?.sex && !restoredFlow.includes('products'))) {
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
          notificationSettings: parsed.notificationSettings || { notifications_enabled: false, notification_time: null },
          onboardingFlow: restoredFlow,
          onboardingFlowIndex: restoredIndex,
          healthDailyRecords: parsed.healthDailyRecords || [],
          healthSyncStatus: parsed.healthSyncStatus || {
            last_sync_at: null,
            last_success_at: null,
            last_error: null,
            in_progress: false,
          },
          patterns: parsed.patterns || [],
          firstLookInsight: parsed.firstLookInsight || null,
          patternNotifications: parsed.patternNotifications || { first_pattern_unlock_sent: false },
          ritualCompletions: parsed.ritualCompletions || {},
          appearance: {
            // Partial merge so a new field in DEFAULT_APPEARANCE picks up on
            // upgrade without wiping the user's existing choices.
            ...DEFAULT_APPEARANCE,
            ...(parsed.appearance ?? {}),
          },
          dailyQuoteSeenDate: typeof parsed.dailyQuoteSeenDate === 'string' ? parsed.dailyQuoteSeenDate : null,
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
      await AsyncStorage.setItem('glowlytics_data', JSON.stringify({
        user, authedUserId, protocol, products,
        dailyRecords: cappedDailyRecords,
        modelOutputs: cappedModelOutputs,
        gamification, subscription, notificationSettings,
        onboardingFlow, onboardingFlowIndex,
        healthDailyRecords: cappedHealthRecords,
        healthSyncStatus, patterns, firstLookInsight, patternNotifications,
        ritualCompletions: cappedRitualCompletions,
        appearance, dailyQuoteSeenDate,
      }));
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
      notificationSettings: { notifications_enabled: false, notification_time: null },
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
    });
    try {
      await AsyncStorage.removeItem('glowlytics_data');
    } catch {
      // Best-effort cleanup
    }
  },
}));
