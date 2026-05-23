import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import Svg, { Path } from 'react-native-svg';
import { v4 as uuidv4 } from 'uuid';
import Animated, {
  type SharedValue,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { Colors, FontFamily, FontSize, Glow, Spacing } from '../../src/constants/theme';
import { Button } from '../../src/components/Button';
import { StagePills, Dot } from '../../src/components/scan/ScanAtoms';
import { localDateStr } from '../../src/utils/localDate';
import { useStore } from '../../src/store/useStore';
import { analyzeWithFallback } from '../../src/services/skinAnalysis';
import { streamInsights } from '../../src/services/visionAPI';
import { buildInsightsFromDeterministic } from '../../src/services/onDeviceInsightsFallback';
import type { GeneratedInsights } from '../../src/types';
import { buildHealthkitRollup } from '../../src/services/healthSync';
import { captureFaceMesh } from '../../src/services/faceMeshCapture';
import { analyzeBoneStructure } from '../../src/services/boneStructure';
import { enqueueSync } from '../../src/services/syncOutbox';
import { ApiError } from '../../src/services/httpClient';
import { getEstimatedCycleDay } from '../../src/utils/cycleDay';
import { trackEvent } from '../../src/services/analytics';
import { env } from '../../src/config/env';

// ---------------------------------------------------------------------------
// Animated SVG path for Reanimated
// ---------------------------------------------------------------------------
const AnimatedPath = Animated.createAnimatedComponent(Path);

// ---------------------------------------------------------------------------
// Infinity loop — round figure-8, just fluid trails, no outline
// ---------------------------------------------------------------------------
const INF_W = 280;
const INF_H = 220;
// Round loops with control points at y=25/195 for near-circular curvature.
// Path length computed to 785px for seamless dash wrap (no jump on loop).
const INF_PATH =
  'M 20,110 C 20,25 140,25 140,110 C 140,195 260,195 260,110 C 260,25 140,25 140,110 C 140,195 20,195 20,110';
const INF_LEN = 785;

function InfinityLoop({ progress }: { progress: SharedValue<number> }) {
  const phaseA = useSharedValue(0);
  const phaseB = useSharedValue(0);
  const phaseC = useSharedValue(0);

  useEffect(() => {
    // Primary — fast, bold
    phaseA.value = withRepeat(
      withTiming(INF_LEN, { duration: 2800, easing: Easing.linear }),
      -1,
    );
    // Secondary — medium, offset
    phaseB.value = withDelay(500, withRepeat(
      withTiming(INF_LEN, { duration: 4000, easing: Easing.linear }),
      -1,
    ));
    // Tertiary — slow accent
    phaseC.value = withDelay(1000, withRepeat(
      withTiming(INF_LEN, { duration: 6000, easing: Easing.linear }),
      -1,
    ));
  }, []);

  // Glow trail — same phase as A, wide + dim = soft bloom
  const glowProps = useAnimatedProps(() => ({
    strokeDashoffset: -phaseA.value,
    strokeOpacity: 0.06 + progress.value * 0.1,
  }));

  // Primary trail — bold, bright
  const fluidAProps = useAnimatedProps(() => ({
    strokeDashoffset: -phaseA.value,
    strokeOpacity: 0.55 + progress.value * 0.45,
  }));

  // Secondary trail
  const fluidBProps = useAnimatedProps(() => ({
    strokeDashoffset: -phaseB.value,
    strokeOpacity: 0.3 + progress.value * 0.4,
  }));

  // Tertiary accent trail — thin, slow
  const fluidCProps = useAnimatedProps(() => ({
    strokeDashoffset: -phaseC.value,
    strokeOpacity: 0.15 + progress.value * 0.25,
  }));

  return (
    <Svg width={INF_W} height={INF_H} viewBox={`0 0 ${INF_W} ${INF_H}`}>
      {/* Glow — wide, dim bloom behind the primary trail */}
      <AnimatedPath
        d={INF_PATH}
        stroke={Colors.ringAccent}
        strokeWidth={14}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${INF_LEN * 0.35} ${INF_LEN * 0.65}`}
        animatedProps={glowProps}
      />

      {/* Trail A — primary, bold */}
      <AnimatedPath
        d={INF_PATH}
        stroke={Colors.ringAccent}
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${INF_LEN * 0.35} ${INF_LEN * 0.65}`}
        animatedProps={fluidAProps}
      />

      {/* Trail B — secondary */}
      <AnimatedPath
        d={INF_PATH}
        stroke={Colors.primary}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${INF_LEN * 0.22} ${INF_LEN * 0.78}`}
        animatedProps={fluidBProps}
      />

      {/* Trail C — thin accent */}
      <AnimatedPath
        d={INF_PATH}
        stroke={Colors.ringAccent}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${INF_LEN * 0.15} ${INF_LEN * 0.85}`}
        animatedProps={fluidCProps}
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Stage durations (internal timer track -- unchanged from original)
// ---------------------------------------------------------------------------
interface Stage {
  duration: number; // ms, 0 = holds until API done
}

const STAGES: Stage[] = [
  { duration: 600 },
  { duration: 700 },
  { duration: 700 },
  { duration: 700 },
  { duration: 700 },
  { duration: 700 },
  { duration: 0 },   // API hold stage
  { duration: 800 },
  { duration: 600 },
];

// Status messages — specific to the 3-layer analysis pipeline
const STAGE_MESSAGES = [
  'Measuring skin signals...',
  'Mapping dermal structure...',
  'Checking hydration levels...',
  'Detecting inflammation markers...',
  'Scanning for lesions...',
  'Cross-checking clinical guidance...',
  'Building your analysis...',
  'Scoring your signals...',
  'Preparing your results...',
];

const messageForStage = (stage: number): string =>
  STAGE_MESSAGES[Math.min(stage, STAGE_MESSAGES.length - 1)];

const CALM_EASING = Easing.out(Easing.cubic);
const API_STAGE = 6;

// Map the 9-stage internal pipeline to the design's 4 story beats.
// Stages 0-1 → Captured, 2-3 → Mapped, 4-6 → Compared, 7-8 → Composed.
function stageStory(stage: number): Array<{ label: string; done: boolean | 'live' }> {
  const beats: Array<[string, number]> = [
    ['Captured', 1],
    ['Mapped', 3],
    ['Compared', 6],
    ['Composed', 8],
  ];
  let activeIdx = beats.findIndex(([, end]) => stage <= end);
  if (activeIdx < 0) activeIdx = beats.length - 1;
  return beats.map(([label], i) => ({
    label,
    done: i < activeIdx ? true : i === activeIdx ? 'live' : false,
  }));
}

// Orbiting findings — fade in as stages progress.
const ORBIT_FINDINGS: Array<{ text: string; color: string; x: number; y: number; minStage: number }> = [
  { text: 'Hydration · +4',  color: Glow.palette.accent2, x: -130, y: -90,  minStage: 1 },
  { text: 'Tone · steady',   color: Glow.palette.glow,    x: 130,  y: -50,  minStage: 2 },
  { text: 'No new redness',  color: Glow.palette.accent2, x: -150, y: 40,   minStage: 4 },
  { text: 'Pores · soft',    color: Glow.palette.glow,    x: 140,  y: 90,   minStage: 5 },
];

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function AnalyzingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    inflammation: string;
    pigmentation: string;
    texture: string;
    photoUri: string;
  }>();

  const user = useStore((s) => s.user);
  const protocol = useStore((s) => s.protocol);
  const addDailyRecord = useStore((s) => s.addDailyRecord);
  const addModelOutput = useStore((s) => s.addModelOutput);
  const clearPendingPhotoBase64 = useStore((s) => s.clearPendingPhotoBase64);

  const [currentStage, setCurrentStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [slowWarning, setSlowWarning] = useState(false);
  const [xpFeedback, setXpFeedback] = useState<{ xp: number; badge?: string } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [streamedText, setStreamedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const insightsRef = useRef<any>(null);

  const apiDone = useRef(false);
  const apiResult = useRef<any>(null);
  const holdingOnApiStage = useRef(false);
  const postApiStarted = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasStarted = useRef(false);
  const scannerDataRef = useRef({ inflammation_index: 0, pigmentation_index: 0, texture_index: 0 });
  const cycleDayRef = useRef<number | undefined>(undefined);
  const lastRecordRef = useRef<any>(null);
  const analysisStartTime = useRef(0);

  // ---------------------------------------------------------------------------
  // Animations
  // ---------------------------------------------------------------------------
  const logoOpacity = useSharedValue(0);
  const ringProgress = useSharedValue(0);

  // Message index derived from stage for cross-fade key
  const [displayedMessage, setDisplayedMessage] = useState(STAGE_MESSAGES[0]);

  const progressForStage = (stage: number) => {
    if (stage <= 5) return (stage + 1) / STAGES.length;
    if (stage === 6) return 0.70;
    if (stage === 7) return 0.85;
    return 1;
  };

  const advanceStage = (stage: number) => {
    setCurrentStage(stage);
    setDisplayedMessage(messageForStage(stage));
    const target = progressForStage(stage);
    ringProgress.value = withTiming(target, { duration: 400, easing: CALM_EASING });
  };

  // ---------------------------------------------------------------------------
  // Photo persistence (unchanged)
  // ---------------------------------------------------------------------------
  const persistPhoto = async (tempUri: string): Promise<string | undefined> => {
    try {
      const photosDir = `${FileSystemLegacy.documentDirectory}scan_photos/`;
      await FileSystemLegacy.makeDirectoryAsync(photosDir, { intermediates: true });
      // If the capture was already persisted by the camera screen, reuse it directly.
      if (tempUri.startsWith(photosDir)) {
        return tempUri;
      }
      const filename = `scan_${Date.now()}.jpg`;
      const destUri = `${photosDir}${filename}`;
      await FileSystemLegacy.copyAsync({ from: tempUri, to: destUri });
      return destUri;
    } catch {
      return undefined;
    }
  };

  // Clean up old scan photos (keep last 90 days max)
  const cleanupOldPhotos = async () => {
    try {
      const photosDir = `${FileSystemLegacy.documentDirectory}scan_photos/`;
      const files = await FileSystemLegacy.readDirectoryAsync(photosDir);
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      for (const file of files) {
        const match = file.match(/^scan_(\d+)\.jpg$/);
        if (match && parseInt(match[1], 10) < cutoff) {
          await FileSystemLegacy.deleteAsync(`${photosDir}${file}`, { idempotent: true });
        }
      }
    } catch {
      // Cleanup is best-effort
    }
  };

  // ---------------------------------------------------------------------------
  // Post-API stage runner (unchanged guard logic)
  // ---------------------------------------------------------------------------
  const runPostApiStages = () => {
    if (postApiStarted.current) return;
    postApiStarted.current = true;

    const t1 = setTimeout(() => {
      advanceStage(7);
      const t2 = setTimeout(() => {
        advanceStage(8);
        const t3 = setTimeout(() => {
          persistAndNavigate();
        }, STAGES[8].duration);
        timers.current.push(t3);
      }, STAGES[7].duration);
      timers.current.push(t2);
    }, 100);
    timers.current.push(t1);
  };

  // ---------------------------------------------------------------------------
  // Persist results + navigate (unchanged)
  // ---------------------------------------------------------------------------
  const persistAndNavigate = async () => {
    const analysis = apiResult.current;
    if (!analysis) {
      // No results — don't navigate to an empty results screen
      setError('We couldn\u2019t complete your analysis. Please try again.');
      return;
    }

    try {
      const state = useStore.getState();
      const currentProtocol = protocol || state.protocol;

      let savedPhotoUri: string | undefined;
      if (params.photoUri) {
        savedPhotoUri = await persistPhoto(params.photoUri);
        // Best-effort cleanup of old photos in background
        cleanupOldPhotos();
      }

      clearPendingPhotoBase64();

      // Use camera-detected lesions as fallback if backend returned none
      const cameraLesions = state.pendingLesions;
      const finalLesions = (analysis.lesions && analysis.lesions.length > 0)
        ? analysis.lesions
        : cameraLesions || undefined;
      // Clear pending lesions after use
      useStore.getState().setPendingLesions(null);

      const xpBefore = state.gamification.xp;
      const badgesBefore = state.gamification.badges.length;

      const prev = lastRecordRef.current;
      // Derive new_product_added from products added today
      const scanDate = localDateStr();
      const hasNewProduct = useStore.getState().products.some((p) => p.start_date === scanDate);
      const dailyRecord = addDailyRecord({
        date: scanDate,
        scanner_reading_id: uuidv4(),
        scanner_indices: scannerDataRef.current,
        scanner_quality_flag: 'pass',
        scan_region: currentProtocol?.scan_region || 'whole_face',
        photo_uri: savedPhotoUri,
        photo_quality_flag: 'pass',
        sunscreen_used: prev?.sunscreen_used ?? false,
        new_product_added: hasNewProduct,
        cycle_day_estimated: cycleDayRef.current,
        sleep_quality: prev?.sleep_quality,
        stress_level: prev?.stress_level,
      });

      // Stage 2: Stream personalized insights in background (non-blocking).
      // The L3 GPT-4o path is best-effort — when it's not reachable (offline,
      // backend disabled, transient failure) we synthesise the same shape via
      // `buildInsightsFromDeterministic` on-device so the scan always lands
      // with a populated `generated_insights` field.
      if (analysis.signal_scores) {
        const attachInsights = (insights: GeneratedInsights, source: 'remote' | 'local') => {
          insightsRef.current = insights;
          const currentOutputs = useStore.getState().modelOutputs;
          if (currentOutputs.length > 0) {
            const updated = [...currentOutputs];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              generated_insights: insights,
            };
            useStore.setState({ modelOutputs: updated });
            useStore.getState().persistData();
          }
          trackEvent('scan_insights_generated', { source });
        };

        const fallbackInsights = (): GeneratedInsights =>
          buildInsightsFromDeterministic({
            signal_scores: analysis.signal_scores,
            lesions: finalLesions,
            conditions: analysis.conditions,
            scan_count: state.modelOutputs.length,
          });

        if (env.API_BASE_URL) {
          setIsStreaming(true);
          setDisplayedMessage('Generating insights...');
          streamInsights(
            {
              signal_scores: analysis.signal_scores,
              signal_features: analysis.signal_features,
              signal_confidence: analysis.signal_confidence,
              lesions: finalLesions,
              conditions: analysis.conditions,
              zone_severity: analysis.zone_severity,
              user_goal: currentProtocol?.primary_goal,
              scan_count: state.modelOutputs.length,
              rag_context: analysis.rag_recommendations,
              // Ground L3 in 7-day HealthKit averages so insights can reference
              // sleep / HRV / RHR / movement / mindful trends instead of only
              // the single scan's lifestyle log.
              healthkit_context: buildHealthkitRollup(state.healthDailyRecords, 7),
            },
            (chunk) => {
              setStreamedText((prev) => prev + chunk);
            },
          ).then((insights) => {
            setIsStreaming(false);
            if (insights) {
              attachInsights(insights, 'remote');
            } else {
              // Stream returned no parseable insights — fall back to on-device
              // template generation so the model output still ships with text.
              trackEvent('scan_insights_stream_failed', { reason: 'no_insights' });
              attachInsights(fallbackInsights(), 'local');
            }
          }).catch((err: any) => {
            setIsStreaming(false);
            trackEvent('scan_insights_stream_failed', { error: String(err?.message || err) });
            attachInsights(fallbackInsights(), 'local');
          });
        } else {
          // No backend configured — generate insights entirely on-device.
          attachInsights(fallbackInsights(), 'local');
        }
      }

      addModelOutput({
        daily_id: dailyRecord.daily_id,
        acne_score: analysis.acne_score,
        sun_damage_score: analysis.sun_damage_score,
        skin_age_score: analysis.skin_age_score,
        confidence: analysis.confidence,
        primary_driver: analysis.primary_driver,
        recommended_action: analysis.recommended_action,
        escalation_flag: analysis.escalation_flag,
        conditions: analysis.conditions,
        rag_recommendations: analysis.rag_recommendations,
        personalized_feedback: analysis.personalized_feedback,
        signal_scores: analysis.signal_scores,
        signal_features: analysis.signal_features,
        lesions: finalLesions,
        signal_confidence: analysis.signal_confidence,
        zone_severity: analysis.zone_severity,
      });

      // Bone-structure analysis runs in parallel with the skin pipeline.
      // The local attach happens immediately so the UI has data; if the
      // server couldn't persist (model_outputs row hadn't synced yet), we
      // queue a retry through syncOutbox so MCP queries eventually see it.
      (async () => {
        const dailyId = dailyRecord.daily_id;
        const sex = useStore.getState().user?.sex;
        const sexOverride = sex === 'male' || sex === 'female' ? sex : undefined;
        let captured;
        let firstResult;
        try {
          captured = await captureFaceMesh();
          firstResult = await analyzeBoneStructure({ mesh: captured.mesh, dailyId, sexOverride });
          useStore.getState().attachBoneStructure(dailyId, firstResult);
        } catch (err: any) {
          if (__DEV__) console.warn('[Glowlytics] Bone-structure analysis skipped:', err);
          // Track outside __DEV__ so PostHog sees production failures instead
          // of the scan looking "complete" without bone metrics. The user-
          // facing scan still proceeds — bone-structure is a side analysis.
          trackEvent('scan_bone_structure_failed', {
            error: String(err?.message || err),
            status: err instanceof ApiError ? err.status : null,
          });
          return;
        }

        if (firstResult.persisted === false) {
          enqueueSync({
            label: 'bone-structure persist',
            run: async () => {
              const retry = await analyzeBoneStructure({ mesh: captured!.mesh, dailyId, sexOverride });
              if (retry.persisted === false) {
                throw new Error('bone-structure not yet persisted on server');
              }
              useStore.getState().attachBoneStructure(dailyId, retry);
            },
            // Don't keep retrying on auth / validation errors — only on the
            // transient "row not yet there" case (which surfaces as our own
            // thrown Error, not an ApiError).
            isTerminalError: (err) => err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429,
          });
        }
      })();

      // Pattern engine post-scan trigger: opportunistic health sync + pattern recompute.
      // syncHealthData has its own reentrancy guard and will short-circuit if a sync
      // is already in progress; runPatternDetection is also safe to call directly
      // because the engine is pure and the store action wraps it in try/catch.
      useStore.getState().syncHealthData().catch(() => {});
      useStore.getState().runPatternDetection();

      const currentState = useStore.getState();
      const xpGained = currentState.gamification.xp - xpBefore;
      const newBadges = currentState.gamification.badges.slice(badgesBefore);
      const latestBadgeName = newBadges.length > 0 ? newBadges[newBadges.length - 1].name : undefined;

      if (xpGained > 0 || latestBadgeName) {
        setXpFeedback({ xp: xpGained, badge: latestBadgeName });
        const t = setTimeout(() => {
          router.replace('/scan/results');
        }, 1500);
        timers.current.push(t);
        return;
      }
    } catch (err: any) {
      if (__DEV__) console.error('[Glowlytics] Persist failed:', err?.message || err);
      setError('We couldn\u2019t save your results. Please try again.');
      return;
    }

    router.replace('/scan/results');
  };

  // ---------------------------------------------------------------------------
  // Start animations + cleanup
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Fade infinity in
    logoOpacity.value = withTiming(1, { duration: 800, easing: CALM_EASING });

    return () => {
      timers.current.forEach(clearTimeout);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Bail out if store never hydrates within 5s
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (hasStarted.current || user) return;
    const bail = setTimeout(() => {
      if (!hasStarted.current) {
        clearPendingPhotoBase64();
        setError('Unable to load your profile. Please restart the app and try again.');
      }
    }, 5000);
    timers.current.push(bail);
    return () => clearTimeout(bail);
  }, [user]);

  // ---------------------------------------------------------------------------
  // Block Android back button during analysis to prevent broken state
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = () => {
      if (error) {
        // Allow back when showing error screen
        clearPendingPhotoBase64();
        return false;
      }
      // Block back during active analysis
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [error]);

  // ---------------------------------------------------------------------------
  // Main effect: timer track + API call (with reliability fix)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (hasStarted.current || !user || !protocol) return;
    hasStarted.current = true;

    // --- Timer track: advance stages 0-5, then hold at 6 ---
    let delay = 0;
    for (let i = 0; i <= 5; i++) {
      const stageIndex = i;
      const t = setTimeout(() => advanceStage(stageIndex), delay);
      timers.current.push(t);
      delay += STAGES[i].duration;
    }

    // Move to stage 6 (hold stage) after stage 5 completes
    const tHold = setTimeout(() => {
      advanceStage(API_STAGE);
      // Drift animation on ring while waiting for API
      ringProgress.value = withRepeat(
        withSequence(
          withTiming(0.72, { duration: 2000, easing: CALM_EASING }),
          withTiming(0.66, { duration: 2000, easing: CALM_EASING }),
        ),
        -1,
      );

      if (apiDone.current) {
        runPostApiStages();
      } else {
        holdingOnApiStage.current = true;
      }
    }, delay);
    timers.current.push(tHold);

    // Slow warning after 15s
    const tSlow = setTimeout(() => {
      if (!apiDone.current) setSlowWarning(true);
    }, 15000);
    timers.current.push(tSlow);

    // Hard timeout at 45s -- show error instead of navigating with no data
    const tHardTimeout = setTimeout(() => {
      if (!apiDone.current) {
        if (__DEV__) console.error('[Glowlytics] Analysis hard timeout at 45s');
        trackEvent('scan_analysis_timeout', { analysis_time_ms: 45000 });
        setError('Analysis is taking too long. Please check your connection and try again.');
      }
    }, 45000);
    timers.current.push(tHardTimeout);

    // --- API track: encode photo + fire analysis ---
    const safeParse = (v: string | string[] | undefined) => { const n = parseFloat(Array.isArray(v) ? v[0] : v || '0'); return Number.isFinite(n) ? n : 0; };
    const scannerData = {
      inflammation_index: safeParse(params.inflammation),
      pigmentation_index: safeParse(params.pigmentation),
      texture_index: safeParse(params.texture),
    };
    scannerDataRef.current = scannerData;

    const estimatedCycleDay = getEstimatedCycleDay(user);
    cycleDayRef.current = estimatedCycleDay;

    // Clear any stale base64 from a previous scan before starting fresh
    clearPendingPhotoBase64();

    // Carry forward context from most recent daily record
    const state = useStore.getState();
    const { modelOutputs: prevOutputs, dailyRecords } = state;
    const lastRecord = dailyRecords.length > 0 ? dailyRecords[dailyRecords.length - 1] : null;
    lastRecordRef.current = lastRecord;

    // Derive new_product_added: true if any product was added today
    const todayStr = localDateStr();
    const newProductToday = state.products.some((p) => p.start_date === todayStr);
    analysisStartTime.current = Date.now();

    // Encode the current photo fresh each time. Compute the on-device
    // skin-signals model in parallel so its result is ready by the time
    // the network call lands — the backend will trust the client scores
    // and skip its own (slow, CPU-bound) ONNX layer.
    const encodeAndAnalyze = async () => {
      const encodePromise: Promise<string | undefined> = (async () => {
        if (!params.photoUri) return undefined;
        try {
          const { imageToBase64 } = await import('../../src/services/visionAPI');
          const b = await imageToBase64(params.photoUri);
          useStore.getState().setPendingPhotoBase64(b);
          return b;
        } catch {
          // Encoding failed — analysis will try again without a pre-encoded base64
          return undefined;
        }
      })();

      const onDevicePromise: Promise<
        Awaited<ReturnType<typeof import('../../src/services/onDeviceSignalModels').runSkinSignals>>
      > = (async () => {
        if (!params.photoUri) return null;
        try {
          const mod = await import('../../src/services/onDeviceSignalModels');
          if (!mod.isReady()) {
            // Bootstrap path may not have finished — try to init now. If the
            // model is unavailable (Expo Go, missing asset, init failure)
            // the backend's L2 path picks up the slack.
            const ok = await mod.initSignalModels();
            if (!ok) return null;
          }
          return await mod.runSkinSignals(params.photoUri);
        } catch (err: any) {
          if (__DEV__) console.warn('[Glowlytics] On-device L2 skipped:', err?.message || err);
          return null;
        }
      })();

      const [base64, onDevice] = await Promise.all([encodePromise, onDevicePromise]);

      if (__DEV__ && onDevice) {
        console.log(
          `[Glowlytics] On-device L2 ${onDevice.latency_ms}ms:`,
          onDevice.signal_scores,
        );
      }
      trackEvent('scan_on_device_l2', {
        ran: onDevice ? 1 : 0,
        latency_ms: onDevice?.latency_ms ?? 0,
      });

      // Lesions were already computed on-device during the camera capture
      // (see camera.tsx → setPendingLesions); pass them through so the
      // backend can skip YOLOv8s too.
      const clientLesions = useStore.getState().pendingLesions ?? undefined;

      return analyzeWithFallback({
        scannerData,
        photoUri: params.photoUri || undefined,
        userProfile: user,
        protocol,
        previousOutputs: prevOutputs,
        dailyContext: {
          sunscreen_used: lastRecord?.sunscreen_used ?? false,
          new_product_added: newProductToday,
          cycle_day_estimated: estimatedCycleDay,
          sleep_quality: lastRecord?.sleep_quality,
          stress_level: lastRecord?.stress_level,
        },
        preEncodedBase64: base64 || undefined,
        clientSignalScores: onDevice?.signal_scores,
        clientSignalConfidence: onDevice?.signal_confidence,
        clientLesions,
        skipDelay: true,
      });
    };

    encodeAndAnalyze()
      .then((result) => {
        apiResult.current = result;
        apiDone.current = true;
        setSlowWarning(false);

        trackEvent('scan_analysis_completed', {
          analysis_time_ms: Date.now() - analysisStartTime.current,
          acne_score: result.acne_score ?? 0,
          sun_damage_score: result.sun_damage_score ?? 0,
          skin_age_score: result.skin_age_score ?? 0,
          has_lesions: Array.isArray(result.lesions) && result.lesions.length > 0,
        });

        // If timer has reached the API hold stage, proceed immediately.
        // Otherwise, wait — the timer will call runPostApiStages when it
        // reaches stage 6 and sees apiDone.current === true.
        if (holdingOnApiStage.current) {
          runPostApiStages();
        }
      })
      .catch((err) => {
        if (__DEV__) console.error('[Glowlytics] Analysis failed:', err?.message || err);
        const rawPhotoParam = Array.isArray(params.photoUri) ? params.photoUri[0] : params.photoUri;
        const photoUriForLog = typeof rawPhotoParam === 'string' ? rawPhotoParam : '';
        trackEvent('scan_analysis_failed', {
          error: String(err?.message || err),
          analysis_time_ms: Date.now() - analysisStartTime.current,
          has_photo_uri: !!photoUriForLog,
          photo_uri_prefix: photoUriForLog ? photoUriForLog.slice(0, 16) : 'none',
          has_protocol: !!protocol,
        });
        if (__DEV__) {
          console.warn('[Glowlytics] Analysis context:', {
            hasPhotoUri: !!photoUriForLog,
            photoPrefix: photoUriForLog ? photoUriForLog.slice(0, 32) : 'none',
            hasProtocol: !!protocol,
          });
        }
        clearPendingPhotoBase64();
        setError(err?.message || 'Something went wrong. Please try again.');
      });

  }, [user, protocol, retryCount]);

  // ---------------------------------------------------------------------------
  // Animated styles
  // ---------------------------------------------------------------------------
  const infinityAnimStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));

  // ---------------------------------------------------------------------------
  // Retry handler (unchanged logic, updated shared values)
  // ---------------------------------------------------------------------------
  const handleRetry = () => {
    setError(null);
    setSlowWarning(false);
    setCurrentStage(0);
    setDisplayedMessage(STAGE_MESSAGES[0]);
    setXpFeedback(null);
    setStreamedText('');
    setIsStreaming(false);
    insightsRef.current = null;
    clearPendingPhotoBase64();
    apiDone.current = false;
    apiResult.current = null;
    holdingOnApiStage.current = false;
    postApiStarted.current = false;
    hasStarted.current = false;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    ringProgress.value = 0;
    logoOpacity.value = withTiming(1, { duration: 800, easing: CALM_EASING });
    setRetryCount((c) => c + 1);
  };

  // ---------------------------------------------------------------------------
  // Error screen
  // ---------------------------------------------------------------------------
  if (error) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[Glow.palette.bg, Glow.palette.surface, Glow.palette.glow, Glow.palette.surface, Glow.palette.bg]}
          locations={[0, 0.25, 0.5, 0.75, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.content}>
          <View style={styles.errorIconWrap}>
            <Feather name="alert-circle" size={36} color={Glow.palette.accent} />
          </View>
          <Text style={styles.errorTitle}>We couldn't finish your scan</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>
          <View style={styles.errorButtons}>
            <Button title="Try again" onPress={handleRetry} />
            <Button
              title="Back to today"
              variant="ghost"
              onPress={() => {
                useStore.getState().clearPendingPhotoBase64();
                router.replace('/(tabs)/today');
              }}
            />
          </View>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.gradientStart, Colors.gradientEarly, Colors.gradientMid, Colors.gradientLate, Colors.gradientEnd]}
        locations={[0, 0.25, 0.45, 0.7, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <Animated.View style={[styles.infinityContainer, infinityAnimStyle]}>
          <InfinityLoop progress={ringProgress} />

          {/* Orbiting findings — glass chips that fade in as stages advance */}
          {ORBIT_FINDINGS.map((f) =>
            currentStage >= f.minStage ? (
              <Animated.View
                key={f.text}
                entering={FadeIn.duration(500)}
                style={[
                  styles.orbitChip,
                  { transform: [{ translateX: f.x }, { translateY: f.y }] },
                ]}
                pointerEvents="none"
              >
                <Dot color={f.color} />
                <Text style={styles.orbitChipText}>{f.text}</Text>
              </Animated.View>
            ) : null,
          )}
        </Animated.View>

        <View style={styles.messageContainer}>
          <Animated.Text
            key={displayedMessage}
            entering={FadeIn.duration(500)}
            exiting={FadeOut.duration(500)}
            style={styles.statusMessage}
          >
            {displayedMessage}
          </Animated.Text>
        </View>

        <View style={styles.stageStrip}>
          <StagePills stages={stageStory(currentStage)} />
        </View>

        {isStreaming && streamedText.length > 0 && (
          <Animated.View entering={FadeIn.duration(400)} style={styles.streamContainer}>
            <Text style={styles.streamText} numberOfLines={4} accessibilityLabel="Analysis insight">
              {streamedText.slice(-200).replace(/^\S*\s/, '')}
            </Text>
          </Animated.View>
        )}

        {slowWarning && !isStreaming && (
          <Animated.Text
            entering={FadeIn.duration(300)}
            style={styles.slowWarning}
            accessibilityLabel="Analysis is taking longer than expected"
          >
            Almost there — still composing.
          </Animated.Text>
        )}
      </View>

      {/* XP feedback overlay */}
      {xpFeedback && (
        <Animated.View
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(300)}
          style={styles.xpOverlay}
        >
          <View style={styles.xpOverlayContent}>
            {xpFeedback.xp > 0 && (
              <Text style={styles.xpGainText}>+{xpFeedback.xp} XP</Text>
            )}
            {xpFeedback.badge && (
              <Text style={styles.badgeEarnedText}>Badge earned: {xpFeedback.badge}!</Text>
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  infinityContainer: {
    width: INF_W,
    height: INF_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitChip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(125,231,225,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(125,231,225,0.18)',
  },
  orbitChipText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    color: Colors.textOnDark,
    letterSpacing: 0.2,
  },
  stageStrip: {
    paddingTop: Spacing.md,
    width: '100%',
  },
  messageContainer: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  statusMessage: {
    position: 'absolute',
    color: Colors.textOnDark,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xl,
    lineHeight: 30,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  streamContainer: {
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
  },
  streamText: {
    color: Colors.textOnDarkDim,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  slowWarning: {
    color: Colors.textOnDarkMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    letterSpacing: 0.2,
    marginTop: Spacing.md,
  },
  // Error screen
  errorIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Glow.palette.surface,
    borderWidth: 1,
    borderColor: Glow.palette.glow,
  },
  errorTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    lineHeight: 34,
    letterSpacing: -0.4,
    textAlign: 'center',
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  errorSubtitle: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  errorButtons: {
    marginTop: Spacing.xl,
    gap: Spacing.sm,
    width: '100%',
  },
  // XP overlay
  xpOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpOverlayContent: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  xpGainText: {
    color: Colors.ringAccent,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.hero,
    letterSpacing: -1,
  },
  badgeEarnedText: {
    color: Colors.textOnDark,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    opacity: 0.85,
  },
});
