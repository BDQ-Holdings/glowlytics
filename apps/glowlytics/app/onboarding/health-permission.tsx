import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Path, Line } from 'react-native-svg';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Colors, Glow, FontFamily, FontSize, Spacing, BorderRadius } from '../../src/constants/theme';
import { trackEvent } from '../../src/services/analytics';
import { localDateStr } from '../../src/utils/localDate';
import { PRIVACY_POLICY_URL } from '../../src/constants/externalLinks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScreenState = 'idle' | 'connecting' | 'success-full' | 'success-partial' | 'denied';

interface SyncStats {
  daysSynced: number;
  metricsPopulated: number;
  cycleDay: number | null;
}

// ---------------------------------------------------------------------------
// Progress messages cycled during the "connecting" state
// ---------------------------------------------------------------------------

const progressMessages = [
  'Reading sleep\u2026',
  'Reading heart rate\u2026',
  'Reading cycle data\u2026',
  'Reading steps\u2026',
  'Reading mindful minutes\u2026',
];

// ---------------------------------------------------------------------------
// SVG Illustration — heart motif with radiating pulses
// ---------------------------------------------------------------------------

function HealthIllustration() {
  const pulse = useSharedValue(0.7);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <Animated.View style={pulseStyle}>
      <Svg width={220} height={180} viewBox="0 0 220 180">
        <Defs>
          {/* Central teal glow */}
          <RadialGradient id="hlGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#22D3EE" stopOpacity={0.85} />
            <Stop offset="35%" stopColor="#3A9E8F" stopOpacity={0.45} />
            <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
          </RadialGradient>
          {/* Green field */}
          <RadialGradient id="hlGreen" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#34D399" stopOpacity={0.6} />
            <Stop offset="60%" stopColor="#34D399" stopOpacity={0.12} />
            <Stop offset="100%" stopColor="#34D399" stopOpacity={0} />
          </RadialGradient>
          {/* Blue accent */}
          <RadialGradient id="hlBlue" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#3B82F6" stopOpacity={0.55} />
            <Stop offset="60%" stopColor="#3B82F6" stopOpacity={0.12} />
            <Stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
          </RadialGradient>
          {/* Purple accent */}
          <RadialGradient id="hlPurple" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.45} />
            <Stop offset="60%" stopColor="#6366B5" stopOpacity={0.1} />
            <Stop offset="100%" stopColor="#6366B5" stopOpacity={0} />
          </RadialGradient>
          {/* Core white */}
          <RadialGradient id="hlCore" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.7} />
            <Stop offset="25%" stopColor="#22D3EE" stopOpacity={0.6} />
            <Stop offset="60%" stopColor="#3A9E8F" stopOpacity={0.15} />
            <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Color orbs */}
        <Circle cx={65} cy={60} r={45} fill="url(#hlGreen)" />
        <Circle cx={170} cy={55} r={40} fill="url(#hlBlue)" />
        <Circle cx={55} cy={140} r={38} fill="url(#hlPurple)" />

        {/* Central teal glow field */}
        <Circle cx={110} cy={90} r={55} fill="url(#hlGlow)" />

        {/* Heart shape */}
        <Path
          d="M110 120 C95 105, 70 95, 70 78 C70 62, 82 54, 95 54 C103 54, 108 60, 110 64 C112 60, 117 54, 125 54 C138 54, 150 62, 150 78 C150 95, 125 105, 110 120Z"
          fill="#3A9E8F"
          fillOpacity={0.18}
          stroke="#3A9E8F"
          strokeWidth={1.5}
          strokeOpacity={0.5}
        />
        {/* Inner heart highlight */}
        <Path
          d="M110 112 C98 100, 78 92, 78 80 C78 68, 87 62, 96 62 C102 62, 107 66, 110 70 C113 66, 118 62, 124 62 C133 62, 142 68, 142 80 C142 92, 122 100, 110 112Z"
          fill="#22D3EE"
          fillOpacity={0.1}
          stroke="#22D3EE"
          strokeWidth={0.8}
          strokeOpacity={0.3}
        />

        {/* Radiating pulse lines — left */}
        <Line x1={50} y1={85} x2={28} y2={85} stroke="#34D399" strokeWidth={1.5} strokeOpacity={0.4} strokeLinecap="round" />
        <Line x1={55} y1={70} x2={36} y2={62} stroke="#3A9E8F" strokeWidth={1.2} strokeOpacity={0.3} strokeLinecap="round" />
        <Line x1={55} y1={100} x2={36} y2={108} stroke="#8B5CF6" strokeWidth={1.2} strokeOpacity={0.3} strokeLinecap="round" />

        {/* Radiating pulse lines — right */}
        <Line x1={170} y1={85} x2={192} y2={85} stroke="#34D399" strokeWidth={1.5} strokeOpacity={0.4} strokeLinecap="round" />
        <Line x1={165} y1={70} x2={184} y2={62} stroke="#3A9E8F" strokeWidth={1.2} strokeOpacity={0.3} strokeLinecap="round" />
        <Line x1={165} y1={100} x2={184} y2={108} stroke="#8B5CF6" strokeWidth={1.2} strokeOpacity={0.3} strokeLinecap="round" />

        {/* ECG-style heartbeat line through center */}
        <Path
          d="M30 90 L65 90 L75 90 L82 78 L88 102 L94 68 L100 100 L106 82 L112 90 L155 90 L190 90"
          fill="none"
          stroke="#3A9E8F"
          strokeWidth={1.8}
          strokeOpacity={0.45}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Core glow */}
        <Circle cx={110} cy={85} r={12} fill="url(#hlCore)" />
        <Circle cx={110} cy={85} r={4} fill="#3A9E8F" fillOpacity={0.95} />

        {/* Corner brackets — sci-fi */}
        <Path d="M55 38 L55 50 M55 38 L67 38" stroke="#34D399" strokeWidth={2} strokeOpacity={0.4} strokeLinecap="round" />
        <Path d="M165 38 L165 50 M165 38 L153 38" stroke="#3B82F6" strokeWidth={2} strokeOpacity={0.4} strokeLinecap="round" />
        <Path d="M55 138 L55 126 M55 138 L67 138" stroke="#8B5CF6" strokeWidth={2} strokeOpacity={0.35} strokeLinecap="round" />
        <Path d="M165 138 L165 126 M165 138 L153 138" stroke="#F5C842" strokeWidth={2} strokeOpacity={0.35} strokeLinecap="round" />

        {/* Accent particles */}
        <Circle cx={42} cy={30} r={2.5} fill="#34D399" fillOpacity={0.5} />
        <Circle cx={178} cy={28} r={2} fill="#3B82F6" fillOpacity={0.45} />
        <Circle cx={38} cy={148} r={2} fill="#8B5CF6" fillOpacity={0.4} />
        <Circle cx={182} cy={145} r={2.5} fill="#F5C842" fillOpacity={0.4} />
      </Svg>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function HealthPermission() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const user = useStore((s) => s.user);
  const updateUser = useStore((s) => s.updateUser);
  const updateHealthConnection = useStore((s) => s.updateHealthConnection);
  const setOnboardingFlow = useStore((s) => s.setOnboardingFlow);

  const [screenState, setScreenState] = useState<ScreenState>('idle');
  const [progressIndex, setProgressIndex] = useState(0);
  const [syncStats, setSyncStats] = useState<SyncStats>({
    daysSynced: 0,
    metricsPopulated: 0,
    cycleDay: null,
  });

  // Refs for cleanup
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // -----------------------------------------------------------------------
  // Cleanup on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Auto-skip: already granted
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (user?.health_connection?.status === 'granted') {
      advance();
    }
  }, []);

  // -----------------------------------------------------------------------
  // Auto-skip: HealthKit unavailable (non-iOS, iPad, sim, MDM)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const checkAvailability = async () => {
      try {
        const { getHealthConnectionState } = require('../../src/services/healthPermissions');
        const state = await getHealthConnectionState();
        if (state.status === 'unavailable') {
          updateHealthConnection({ status: 'unavailable', sync_skipped: true });
          advance();
        }
      } catch (e: unknown) {
        console.warn('[Health onboarding] availability check failed:', e);
      }
    };
    if (Platform.OS === 'ios' && user?.health_connection?.status !== 'granted') {
      checkAvailability();
    } else if (Platform.OS !== 'ios') {
      updateHealthConnection({ status: 'unavailable', sync_skipped: true });
      advance();
    }
  }, []);

  // -----------------------------------------------------------------------
  // Rotate progress messages during connecting state
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (screenState === 'connecting') {
      progressTimer.current = setInterval(() => {
        setProgressIndex((prev) => (prev + 1) % progressMessages.length);
      }, 400);
    } else {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    }
    return () => {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    };
  }, [screenState]);

  // -----------------------------------------------------------------------
  // handleConnect
  // -----------------------------------------------------------------------
  const handleConnect = async () => {
    setScreenState('connecting');
    trackEvent('health_permission_shown');

    try {
      // Dynamic requires — keeps HealthKit native binding out of Jest module graph.
      const { connectHealthData } =
        require('../../src/services/healthPermissions') as typeof import('../../src/services/healthPermissions');
      const { detectCycleFromHealthKit } =
        require('../../src/services/healthSync') as typeof import('../../src/services/healthSync');
      const { generateFirstLookInsight } =
        require('../../src/services/firstLookInsight') as typeof import('../../src/services/firstLookInsight');

      const conn = await connectHealthData();
      if (!mountedRef.current) return;
      updateHealthConnection(conn);

      if (conn.status === 'denied' || conn.status === 'unavailable') {
        setScreenState('denied');
        trackEvent('health_permission_result', {
          result: 'denied',
          days_synced: 0,
          cycle_detected: false,
          metrics_populated: 0,
        });
        return;
      }

      // Detect cycle data (single fast query — safe for UI path).
      const cycleResult = await detectCycleFromHealthKit();
      if (!mountedRef.current) return;

      if (cycleResult.detected) {
        updateUser({
          period_last_start_date: cycleResult.lastPeriodStart
            ? localDateStr(cycleResult.lastPeriodStart)
            : undefined,
          cycle_length_days: cycleResult.cycleLengthDays ?? 28,
          menstrual_status: cycleResult.menstrualStatus ?? user?.menstrual_status,
        });
        updateHealthConnection({ ...conn, cycle_detected: true });
        // Rebuild onboarding flow to skip menstrual screens.
        const { buildOnboardingFlow } =
          require('../../src/services/onboardingFlow') as typeof import('../../src/services/onboardingFlow');
        const newFlow = buildOnboardingFlow(user?.sex, user?.menstrual_status, true);
        setOnboardingFlow(newFlow);
      }

      // Race: bootstrap sync vs 4s timeout.
      const syncPromise = useStore.getState().syncHealthDataInitial();
      const timeoutPromise = new Promise<{ added: 0; errors: string[] }>((resolve) =>
        setTimeout(() => resolve({ added: 0, errors: ['timeout'] }), 4000),
      );
      const { added, errors } = await Promise.race([syncPromise, timeoutPromise]);
      if (!mountedRef.current) return;

      if (errors.length > 0) {
        console.warn('[Health onboarding] bootstrap sync warning:', errors[0]);
      }

      // Count populated metrics on the most recent record.
      // `pullLastNDays` returns today at index 0 and the oldest day at index n-1.
      // We need today's record (the densest) to decide success-full vs success-partial.
      const records = useStore.getState().healthDailyRecords;
      const todayStr = new Date().toISOString().slice(0, 10);
      const latest =
        records.find((r) => r.date === todayStr) ?? records[0] ?? null;
      const metricsPopulated = latest
        ? [
            latest.sleep_total_minutes,
            latest.hrv_sdnn_ms,
            latest.resting_hr_bpm,
            latest.steps,
            latest.mindful_minutes,
          ].filter((v) => v !== null && v !== undefined).length
        : 0;

      if (metricsPopulated >= 3) {
        setSyncStats({
          daysSynced: added,
          metricsPopulated,
          cycleDay: latest?.cycle_day_estimated ?? null,
        });
        setScreenState('success-full');
      } else {
        setScreenState('success-partial');
      }

      // Generate firstLookInsight if enough data.
      if (metricsPopulated >= 3) {
        const insight = generateFirstLookInsight(records);
        if (insight) {
          useStore.getState().setFirstLookInsight(insight);
        }
      }

      trackEvent('health_permission_result', {
        result: 'granted',
        days_synced: added,
        cycle_detected: cycleResult.detected,
        metrics_populated: metricsPopulated,
        cycle_length_days: cycleResult.cycleLengthDays ?? 0,
      });

      // Auto-advance after delay.
      autoAdvanceTimer.current = setTimeout(() => {
        if (mountedRef.current) {
          advance();
        }
      }, metricsPopulated >= 3 ? 1500 : 2000);
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      const message = e instanceof Error ? e.message : String(e ?? 'unknown error');
      console.warn('[Health onboarding] connect failed:', message);
      updateHealthConnection({
        status: 'denied',
        availability_note: message,
      });
      setScreenState('denied');
      trackEvent('health_permission_result', {
        result: 'error',
        days_synced: 0,
        cycle_detected: false,
        metrics_populated: 0,
        error: message,
      });
    }
  };

  // -----------------------------------------------------------------------
  // handleSkip
  // -----------------------------------------------------------------------
  const handleSkip = () => {
    updateHealthConnection({ status: 'not_requested', sync_skipped: true });
    trackEvent('health_permission_result', {
      result: 'skipped',
      days_synced: 0,
      cycle_detected: false,
      metrics_populated: 0,
    });
    advance();
  };

  // -----------------------------------------------------------------------
  // Derived labels / disabled state per screen state
  // -----------------------------------------------------------------------
  const isConnecting = screenState === 'connecting';

  const primaryLabel = (() => {
    switch (screenState) {
      case 'idle':
        return 'Connect Apple Health';
      case 'connecting':
        return 'Connecting\u2026';
      case 'success-full':
      case 'success-partial':
        return 'Continue';
      case 'denied':
        return 'Continue without Apple Health';
    }
  })();

  const primaryOnPress = (() => {
    switch (screenState) {
      case 'idle':
        return handleConnect;
      case 'success-full':
      case 'success-partial':
      case 'denied':
        return advance;
      default:
        return () => {};
    }
  })();

  const showSecondary = screenState === 'idle';

  // -----------------------------------------------------------------------
  // Children content — switches per state
  // -----------------------------------------------------------------------
  const renderContent = () => {
    switch (screenState) {
      case 'idle':
        return (
          <>
            <View style={styles.patternChip}>
              <Text style={styles.patternLabel}>{'\u25C6'} EXAMPLE</Text>
              <Text style={styles.patternText}>
                {'"Your skin is 18% clearer on days after 7+ hours of sleep."'}
              </Text>
            </View>
            <View style={styles.privacyStrip}>
              <Feather name="lock" size={14} color={Colors.primary} />
              <Text style={styles.privacyText}>
                Reads sleep, heart rate, steps, cycle, and mindful minutes. We send 7-day averages to our skin AI to personalize your insights — never shared with third parties.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.privacyLinkRow}
              onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
              accessibilityRole="link"
              accessibilityLabel="Open privacy policy"
            >
              <Text style={styles.privacyLinkText}>See Privacy Policy</Text>
            </TouchableOpacity>
          </>
        );

      case 'connecting':
        return (
          <View style={styles.progressCard}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.progressText}>{progressMessages[progressIndex]}</Text>
          </View>
        );

      case 'success-full':
        return (
          <View style={styles.successCard}>
            <Feather name="check-circle" size={20} color={Colors.primary} />
            <Text style={styles.successTitle}>
              Connected {'\u00B7'} {syncStats.daysSynced} days of data
            </Text>
            <Text style={styles.successDetail}>
              {syncStats.metricsPopulated} health metrics tracked
              {syncStats.cycleDay ? ` \u00B7 cycle day ${syncStats.cycleDay}` : ''}
            </Text>
          </View>
        );

      case 'success-partial':
        return (
          <View style={styles.successCard}>
            <Feather name="check-circle" size={20} color={Colors.primary} />
            <Text style={styles.successTitle}>Connected</Text>
            <Text style={styles.successDetail}>
              {"We'll start pulling data as you use Apple Health."}
            </Text>
          </View>
        );

      case 'denied':
        return (
          <View style={styles.deniedCard}>
            <Text style={styles.deniedText}>
              No problem {'\u2014'} you can connect later in Settings.
            </Text>
          </View>
        );
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <OnboardingTransition
      illustration={<HealthIllustration />}
      heading="See what's really affecting your skin."
      subtext="Connect Apple Health to spot patterns like:"
      primaryLabel={primaryLabel}
      primaryOnPress={primaryOnPress}
      primaryDisabled={isConnecting}
      secondaryLabel={showSecondary ? 'Set up later' : undefined}
      secondaryOnPress={showSecondary ? handleSkip : undefined}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      {renderContent()}
    </OnboardingTransition>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  patternChip: {
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  patternLabel: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xxs,
    letterSpacing: 1.2,
  },
  patternText: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  privacyStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  privacyText: {
    flex: 1,
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    lineHeight: 18,
  },
  privacyLinkRow: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  privacyLinkText: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    lineHeight: 18,
    textDecorationLine: 'underline',
  },
  progressCard: {
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  progressText: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
  },
  successCard: {
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.xs,
    alignItems: 'center',
  },
  successTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  successDetail: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  deniedCard: {
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  deniedText: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
});
