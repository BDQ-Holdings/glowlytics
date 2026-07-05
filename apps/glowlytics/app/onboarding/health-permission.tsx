import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { GlowIcon, type GlowIconName } from '../../src/components/glow/GlowIcons';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Glow, FontFamily, type GlowPalette } from '../../src/constants/theme';
import { trackEvent } from '../../src/services/analytics';
import { localDateStr } from '../../src/utils/localDate';

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
// Design switch — 44×26 track, 22 knob (handoff S08 control)
// ---------------------------------------------------------------------------

function DesignSwitch({ on, palette }: { on: boolean; palette: GlowPalette }) {
  return (
    <View style={[styles.switchTrack, { backgroundColor: on ? palette.accent : palette.glow }]}>
      <View
        style={[
          styles.switchKnob,
          on ? styles.switchKnobOn : styles.switchKnobOff,
          { backgroundColor: palette.surface, shadowColor: palette.ink },
        ]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Rise — staggered fade-up entrance, gated on reduceMotion
// ---------------------------------------------------------------------------

function Rise({
  delay,
  reduceMotion,
  children,
}: {
  delay: number;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 600, easing: Easing.bezier(0.215, 0.61, 0.355, 1) }),
    );
  }, [reduceMotion, delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
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
  const notificationSettings = useStore((s) => s.notificationSettings);
  const reduceMotion = useStore((s) => s.appearance?.reduceMotion) ?? false;
  const P = Glow.palette;

  const [screenState, setScreenState] = useState<ScreenState>('idle');
  const [syncStats, setSyncStats] = useState<SyncStats>({
    daysSynced: 0,
    metricsPopulated: 0,
    cycleDay: null,
  });

  // Refs for cleanup
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Single fire-once guard shared by EVERY path that can leave this screen: the
  // two auto-skip effects, handleSkip, handleContinue, and the post-connect
  // auto-advance timer. A manual Continue/Skip racing the in-flight availability
  // check (or the granted-auto timer, a React double-invoke, or a remount) can
  // therefore only advance once — whichever path loses the race finds the ref
  // already set and no-ops.
  const advancedRef = useRef(false);
  const advanceOnce = () => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    advance();
  };
  // The auto-skip effects additionally bail if the screen already unmounted, so
  // an availability check that resolves post-unmount is inert.
  const autoAdvanceOnce = () => {
    if (!mountedRef.current) return;
    advanceOnce();
  };

  // -----------------------------------------------------------------------
  // Cleanup on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Auto-skip: already granted
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (user?.health_connection?.status === 'granted') {
      autoAdvanceOnce();
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
          autoAdvanceOnce();
        }
      } catch (e: unknown) {
        console.warn('[Health onboarding] availability check failed:', e);
      }
    };
    if (Platform.OS === 'ios' && user?.health_connection?.status !== 'granted') {
      checkAvailability();
    } else if (Platform.OS !== 'ios') {
      updateHealthConnection({ status: 'unavailable', sync_skipped: true });
      autoAdvanceOnce();
    }
  }, []);


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
          advanceOnce();
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
    advanceOnce();
  };

  // -----------------------------------------------------------------------
  // Derived labels / disabled state per screen state
  // -----------------------------------------------------------------------
  const isConnecting = screenState === 'connecting';
  const healthConnected =
    screenState === 'success-full' ||
    screenState === 'success-partial' ||
    user?.health_connection?.status === 'granted';

  // Apple Health row body reflects the live connection state so the sync
  // stats the old status cards surfaced stay visible on the row itself.
  const healthBody = (() => {
    switch (screenState) {
      case 'connecting':
        return 'Syncing your health data\u2026';
      case 'success-full':
        return `${syncStats.daysSynced} ${
          syncStats.daysSynced === 1 ? 'day' : 'days'
        } synced \u00B7 ${syncStats.metricsPopulated} metrics${
          syncStats.cycleDay ? ` \u00B7 cycle day ${syncStats.cycleDay}` : ''
        }`;
      case 'success-partial':
        return "Connected. We'll pull data as you use Apple Health.";
      case 'denied':
        return 'No problem \u2014 connect later in Settings.';
      default:
        return 'Sleep, hydration, workouts. Read-only.';
    }
  })();

  // Continue proceeds. From idle (never connected) it routes through the skip
  // path so the not_requested write + skipped analytics event still fire —
  // behaviour-equivalent to the old "Set up later" secondary.
  const handleContinue = () => {
    if (screenState === 'idle') {
      handleSkip();
    } else {
      advanceOnce();
    }
  };

  // -----------------------------------------------------------------------
  // Permission overview — Apple Health carries the real request; its row
  // body + switch reflect the live connection state. Notifications shows the
  // stored preference; camera is flagged required (both requested elsewhere).
  // -----------------------------------------------------------------------
  const renderContent = () => {
    const rows: {
      icon: GlowIconName;
      title: string;
      body: string;
      control: 'health' | 'notifications' | 'camera';
    }[] = [
      { icon: 'health', title: 'Apple Health', body: healthBody, control: 'health' },
      {
        icon: 'bell',
        title: 'Notifications',
        body: 'One soft nudge per day, at your time.',
        control: 'notifications',
      },
      {
        icon: 'camera',
        title: 'Camera',
        body: 'Required for daily check-ins.',
        control: 'camera',
      },
    ];

    return (
      <View style={styles.list}>
        {rows.map((row, i) => {
          const isHealth = row.control === 'health';
          const interactive = isHealth && screenState === 'idle';
          let trailing: React.ReactNode;
          if (row.control === 'camera') {
            trailing = (
              <View style={[styles.requiredChip, { backgroundColor: P.bg }]}>
                <Text style={[styles.requiredLabel, { color: P.muted }]}>Required</Text>
              </View>
            );
          } else if (isHealth && isConnecting) {
            trailing = <ActivityIndicator size="small" color={P.accent} />;
          } else {
            trailing = (
              <DesignSwitch
                on={isHealth ? healthConnected : notificationSettings.notifications_enabled}
                palette={P}
              />
            );
          }

          return (
            <Rise key={row.title} delay={Glow.motion.stagger[i] ?? 0} reduceMotion={reduceMotion}>
              <TouchableOpacity
                activeOpacity={interactive ? 0.86 : 1}
                disabled={!interactive}
                onPress={interactive ? handleConnect : undefined}
                accessibilityRole={interactive ? 'button' : undefined}
                accessibilityLabel={interactive ? 'Connect Apple Health' : undefined}
                style={[styles.card, { backgroundColor: P.surface, borderColor: P.glow }]}
              >
                <View style={[styles.cardIconTile, { backgroundColor: P.bg }]}>
                  <GlowIcon name={row.icon} size={20} color={P.accent} stroke={1.6} />
                </View>
                <View style={styles.cardText}>
                  <Text style={[styles.cardTitle, { color: P.ink }]}>{row.title}</Text>
                  <Text style={[styles.cardBody, { color: P.muted }]}>{row.body}</Text>
                </View>
                {trailing}
              </TouchableOpacity>
            </Rise>
          );
        })}

        <Rise delay={Glow.motion.stagger[3] ?? 380} reduceMotion={reduceMotion}>
          <Text style={[styles.footnote, { color: P.muted }]}>
            {"You'll see iOS's own prompt next. "}
            <Text style={[styles.footnoteEm, { color: P.ink }]}>
              {"Allow only what you're comfortable with."}
            </Text>
          </Text>
        </Rise>
      </View>
    );
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <OnboardingTransition
      heading={'A bigger picture,\nif you want.'}
      subtext="Optional. Glowlytics gets sharper when it knows how you sleep — but it works without any of these."
      primaryLabel="Continue"
      primaryOnPress={handleContinue}
      primaryDisabled={isConnecting}
      onSkip={screenState === 'idle' ? handleSkip : undefined}
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
  list: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  cardIconTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  cardBody: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 999,
  },
  switchKnob: {
    position: 'absolute',
    top: 2,
    width: 22,
    height: 22,
    borderRadius: 999,
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  switchKnobOn: {
    right: 2,
  },
  switchKnobOff: {
    left: 2,
  },
  requiredChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  requiredLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  footnote: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 12,
    marginTop: 6,
  },
  footnoteEm: {
    fontFamily: FontFamily.serifItalic,
    fontSize: 13,
  },
});
