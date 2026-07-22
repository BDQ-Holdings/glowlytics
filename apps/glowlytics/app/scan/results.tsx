import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, ScrollView, StyleSheet, Text, useWindowDimensions, View, ViewToken } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { ActionCard } from '../../src/components/ActionCard';
import { Button } from '../../src/components/Button';
import { ClinicalSourcesCard } from '../../src/components/ClinicalSourcesCard';
import { Face3DViewer } from '../../src/components/Face3DViewer';
import { HarmonyScoreReveal } from '../../src/components/HarmonyScoreReveal';
import { InterventionDrawer } from '../../src/components/InterventionDrawer';
import { buildCanonicalMesh } from '../../src/services/canonicalFaceMesh';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Glow,
  Motion,
  Spacing,
  scoreColor,
} from '../../src/constants/theme';
import { SIGNAL_COLORS, SIGNAL_LABELS } from '../../src/constants/signals';
import { TYPICAL_COMPOSITE } from '../../src/constants/scoreReference';
import { getExplanation } from '../../src/services/skinAnalysis';
import {
  buildOverallSkinInsight,
  getLatestDailyForOutput,
} from '../../src/services/skinInsights';
import { useStore } from '../../src/store/useStore';
import { trackEvent } from '../../src/services/analytics';
import { AnimatedFillBar } from '../../src/components/AnimatedFillBar';
import type { PrimaryGoal } from '../../src/types';

const GOAL_LABELS: Record<PrimaryGoal, string> = {
  acne: 'acne clarity',
  sun_damage: 'sun-damage repair',
  skin_age: 'skin-age support',
};
const LEGAL_DISCLAIMER = 'For informational purposes only. Not medical advice. Consult a dermatologist for diagnosis and treatment.';
const TYPICAL_RANGE_LABEL = `${TYPICAL_COMPOSITE.low}–${TYPICAL_COMPOSITE.high}`;

const SWIPE_ICON_SIZE = 14;
const SWIPE_LABEL_LINE_HEIGHT = 12;
const DISCLAIMER_LINE_HEIGHT = 14;
export const BOTTOM_OVERLAY_HEIGHT =
  SWIPE_ICON_SIZE +
  Spacing.xxs +
  SWIPE_LABEL_LINE_HEIGHT +
  Spacing.sm +
  DISCLAIMER_LINE_HEIGHT * 2 +
  Spacing.sm;

const ARC_SIZE = 236;
const ARC_CENTER = ARC_SIZE / 2;
const ARC_RADIUS = 100;
const ARC_STROKE = 8;
const ARC_START_DEG = 135;
const ARC_SWEEP_DEG = 270;

const pluralizePoint = (points: number): string => `${points} point${points === 1 ? '' : 's'}`;

export function buildTypicalRangeComparison(score: number): string {
  const rounded = Math.round(score);
  if (rounded < TYPICAL_COMPOSITE.low) {
    return `${pluralizePoint(TYPICAL_COMPOSITE.low - rounded)} below the typical Glowlytics range (${TYPICAL_RANGE_LABEL})`;
  }
  if (rounded > TYPICAL_COMPOSITE.high) {
    return `${pluralizePoint(rounded - TYPICAL_COMPOSITE.high)} above the typical Glowlytics range (${TYPICAL_RANGE_LABEL})`;
  }
  if (rounded === TYPICAL_COMPOSITE.mid) {
    return `Right at the typical Glowlytics range (${TYPICAL_RANGE_LABEL})`;
  }
  return `Within the typical Glowlytics range (${TYPICAL_RANGE_LABEL})`;
}

function buildPracticalLeverCopy(signals: Record<keyof typeof SIGNAL_LABELS, number> | undefined): string | null {
  if (!signals) return null;
  const signalKeys = Object.keys(SIGNAL_LABELS) as Array<keyof typeof SIGNAL_LABELS>;
  const lowest = signalKeys.reduce<{ key: keyof typeof SIGNAL_LABELS; score: number } | null>((current, key) => {
    const score = signals[key];
    if (!Number.isFinite(score)) return current;
    if (!current || score < current.score) return { key, score };
    return current;
  }, null);
  if (!lowest) return null;
  const actions: Record<keyof typeof SIGNAL_LABELS, string> = {
    structure: 'steady sleep and barrier support move it fastest',
    hydration: 'a barrier-friendly moisturizer is the quickest win',
    inflammation: 'a calm, unchanged routine helps it settle',
    sunDamage: 'daily SPF moves it fastest',
    elasticity: 'steady SPF and retinoid support help most',
  };
  return `Biggest near-term lever: ${SIGNAL_LABELS[lowest.key].toLowerCase()}. ${actions[lowest.key]}.`;
}

const clampScore = (value: number): number => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

const scoreToSweep = (score: number): number => (clampScore(score) / 100) * ARC_SWEEP_DEG;

const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

const polarToCartesian = (radius: number, angleDeg: number) => {
  const angleRad = (Math.PI / 180) * angleDeg;
  return {
    x: ARC_CENTER + radius * Math.cos(angleRad),
    y: ARC_CENTER + radius * Math.sin(angleRad),
  };
};

const describeArc = (radius: number, startDeg: number, sweepDeg: number): string => {
  if (sweepDeg <= 0) return '';
  const start = polarToCartesian(radius, startDeg);
  const end = polarToCartesian(radius, startDeg + sweepDeg);
  const largeArcFlag = sweepDeg > 180 ? 1 : 0;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
};

// The greeting name comes from Clerk (the store's UserProfile has no name
// field). Lazy optional require — same pattern as app/(tabs)/profile.tsx —
// so Expo Go / jest without the native Clerk module degrade to no greeting.
let useClerkUser: (() => { user: { firstName?: string | null } | null | undefined }) | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const clerk = require('@clerk/clerk-expo');
  useClerkUser = clerk.useUser;
} catch {
  // Clerk not available
}

// ---------------------------------------------------------------------------
// Story page wrapper — each page fills the viewport
// ---------------------------------------------------------------------------
function StoryPage({ children, screenH, insets }: {
  children: React.ReactNode;
  screenH: number;
  insets: { top: number; bottom: number };
}) {
  // Each page fills the viewport and centers its content. When async content
  // (action plans, clinical sources, the bone mesh + intervention drawer)
  // loads in and exceeds the viewport, we enable scrolling so nothing clips
  // off-screen. While content fits, scrolling stays OFF so the vertical swipe
  // falls through to the parent paging FlatList and page snapping is unchanged.
  const frameH = useRef(0);
  const [scrollEnabled, setScrollEnabled] = useState(false);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    frameH.current = e.nativeEvent.layout.height;
  }, []);
  const onContentSizeChange = useCallback((_w: number, contentH: number) => {
    setScrollEnabled(contentH > frameH.current + 1);
  }, []);
  return (
    <View style={[storyStyles.page, { height: screenH }]}>
      <LinearGradient
        colors={[Glow.palette.bg, Glow.palette.surface, Glow.palette.glow]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        style={storyStyles.scroll}
        contentContainerStyle={[
          storyStyles.pageContent,
          // Reserve the full bottom overlay (swipe cue + legal copy + safe area)
          // so content never collides with the persistent reviewer disclosure.
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + BOTTOM_OVERLAY_HEIGHT },
        ]}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        bounces={false}
        nestedScrollEnabled
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const storyStyles = StyleSheet.create({
  page: { width: '100%' },
  scroll: { flex: 1 },
  pageContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
  },
});

// ---------------------------------------------------------------------------
// Progress dots — animated pill indicator
// ---------------------------------------------------------------------------
function ProgressDots({ count, active }: { count: number; active: number }) {
  return (
    <View style={dotStyles.container} pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            dotStyles.dot,
            i === active && dotStyles.dotActive,
            i < active && dotStyles.dotDone,
          ]}
        />
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: Spacing.sm,
    top: '42%',
    gap: Spacing.sm,
    zIndex: 10,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.textDim,
  },
  dotActive: {
    backgroundColor: Glow.palette.accent,
    width: 5,
    height: 16,
    borderRadius: 3,
  },
  dotDone: {
    backgroundColor: Glow.palette.accent2,
  },
});

// ---------------------------------------------------------------------------
// Animated score glow — 3 concentric rings with staggered breathing
// ---------------------------------------------------------------------------
const BREATHE_EASING = Easing.inOut(Easing.ease);

function ScoreGlow({ color, reduceMotion }: { color: string; reduceMotion: boolean }) {
  const breathe = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(breathe);
    if (reduceMotion) {
      breathe.value = 1;
      return;
    }
    // Seamless cycle: 1 → 1.06 → 0.94 → 1 (symmetric, no seam on repeat)
    breathe.value = withDelay(600, withRepeat(
      withSequence(
        withTiming(1.06, { duration: 500, easing: BREATHE_EASING }),
        withTiming(0.94, { duration: 1000, easing: BREATHE_EASING }),
        withTiming(1, { duration: 500, easing: BREATHE_EASING }),
      ),
      -1,
    ));
    return () => cancelAnimation(breathe);
  }, [breathe, reduceMotion]);

  // Normalize breathe (0.94–1.06) to 0–1 for opacity interpolation
  const outerStyle = useAnimatedStyle(() => {
    const t = (breathe.value - 0.94) / 0.12; // 0 at trough, 1 at peak
    return {
      transform: [{ scale: breathe.value }],
      opacity: 0.25 + t * 0.3, // 0.25 → 0.55
    };
  });

  const midStyle = useAnimatedStyle(() => {
    const t = (breathe.value - 0.94) / 0.12;
    return {
      transform: [{ scale: 1 + (breathe.value - 1) * 0.6 }],
      opacity: 0.4 + t * 0.25, // 0.4 → 0.65
    };
  });

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (breathe.value - 1) * 0.25 }],
    opacity: 0.7, // constant anchor — always rich
  }));

  return (
    <>
      <Animated.View style={[styles.glowOuter, { backgroundColor: color + '06' }, outerStyle]} />
      <Animated.View style={[styles.glowMid, { backgroundColor: color + '0C' }, midStyle]} />
      <Animated.View style={[styles.glowInner, { backgroundColor: color + '14' }, innerStyle]} />
    </>
  );
}

function PercentileArc({ score, color, reduceMotion }: { score: number; color: string; reduceMotion: boolean }) {
  const finalScore = clampScore(score);
  const [displayedScore, setDisplayedScore] = useState(reduceMotion ? finalScore : 0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplayedScore(finalScore);
      return;
    }

    let raf = 0;
    const startedAt = Date.now();
    setDisplayedScore(0);
    const step = () => {
      const elapsed = Date.now() - startedAt;
      const t = Math.min(1, elapsed / Motion.dramatic);
      // JavaScript equivalent of the design token's out-expo curve.
      setDisplayedScore(finalScore * easeOutExpo(t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [finalScore, reduceMotion]);

  const bandStartSweep = scoreToSweep(TYPICAL_COMPOSITE.low);
  const bandSweep = scoreToSweep(TYPICAL_COMPOSITE.high) - bandStartSweep;
  const foregroundSweep = scoreToSweep(displayedScore);
  const midAngle = ARC_START_DEG + scoreToSweep(TYPICAL_COMPOSITE.mid);
  const tickStart = polarToCartesian(ARC_RADIUS - 9, midAngle);
  const tickEnd = polarToCartesian(ARC_RADIUS + 10, midAngle);
  const label = polarToCartesian(ARC_RADIUS + 23, midAngle);

  return (
    <Svg
      width={ARC_SIZE}
      height={ARC_SIZE}
      viewBox={`0 0 ${ARC_SIZE} ${ARC_SIZE}`}
      style={styles.percentileArc}
      pointerEvents="none"
    >
      <Path
        d={describeArc(ARC_RADIUS, ARC_START_DEG, ARC_SWEEP_DEG)}
        stroke={Glow.palette.glow}
        strokeWidth={ARC_STROKE}
        strokeLinecap="round"
        fill="none"
        opacity={0.9}
      />
      <Path
        d={describeArc(ARC_RADIUS, ARC_START_DEG + bandStartSweep, bandSweep)}
        stroke={Glow.palette.muted}
        strokeWidth={ARC_STROKE + 5}
        strokeLinecap="round"
        fill="none"
        opacity={0.22}
      />
      <Path
        d={describeArc(ARC_RADIUS, ARC_START_DEG, foregroundSweep)}
        stroke={color}
        strokeWidth={ARC_STROKE + 1}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={`M ${tickStart.x.toFixed(3)} ${tickStart.y.toFixed(3)} L ${tickEnd.x.toFixed(3)} ${tickEnd.y.toFixed(3)}`}
        stroke={Glow.palette.muted}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
        opacity={0.75}
      />
      <SvgText
        x={label.x}
        y={label.y}
        fill={Glow.palette.muted}
        fontFamily={FontFamily.sansSemiBold}
        fontSize={9}
        textAnchor="middle"
      >
        typical
      </SvgText>
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function Results({ hideBottomAction: hideBottomActionProp }: { hideBottomAction?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const searchParams = useLocalSearchParams<{ hideBottomAction?: string }>();
  const hideBottomAction = hideBottomActionProp || searchParams.hideBottomAction === 'true';

  const allOutputs = useStore((s) => s.modelOutputs);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const clerkUser = useClerkUser ? useClerkUser() : null;
  const firstName = clerkUser?.user?.firstName?.trim().split(/\s+/)[0] || null;
  const protocol = useStore((s) => s.protocol);
  const getStreak = useStore((s) => s.getStreak);
  const currentStreak = getStreak();
  const reduceMotion = useStore((s) => s.appearance.reduceMotion);
  const latestOutput = allOutputs.length > 0 ? allOutputs[allOutputs.length - 1] : null;
  const previousOutput = allOutputs.length >= 2 ? allOutputs[allOutputs.length - 2] : null;
  const baselineOutput = allOutputs.length > 0 ? allOutputs[0] : null;
  const latestDaily = getLatestDailyForOutput(latestOutput, dailyRecords);
  const previousDaily = getLatestDailyForOutput(previousOutput, dailyRecords);
  const baselineDaily = getLatestDailyForOutput(baselineOutput, dailyRecords);

  const overallInsight = useMemo(
    () => buildOverallSkinInsight({
      latestOutput,
      baselineOutput,
      latestDaily,
      baselineDaily,
      serverSignalScores: latestOutput?.signal_scores,
      serverSignalFeatures: latestOutput?.signal_features,
      serverSignalConfidence: latestOutput?.signal_confidence,
      serverLesions: latestOutput?.lesions,
    }),
    [latestOutput, baselineOutput, latestDaily, baselineDaily],
  );

  const previousOverallInsight = useMemo(
    () => previousOutput
      ? buildOverallSkinInsight({
        latestOutput: previousOutput,
        baselineOutput,
        latestDaily: previousDaily,
        baselineDaily,
        serverSignalScores: previousOutput.signal_scores,
        serverSignalFeatures: previousOutput.signal_features,
        serverSignalConfidence: previousOutput.signal_confidence,
        serverLesions: previousOutput.lesions,
      })
      : null,
    [previousOutput, baselineOutput, previousDaily, baselineDaily],
  );

  useEffect(() => {
    if (latestOutput) {
      trackEvent('scan_results_viewed', {
        acne_score: latestOutput.acne_score,
        sun_damage_score: latestOutput.sun_damage_score,
        skin_age_score: latestOutput.skin_age_score,
        escalation_flag: latestOutput.escalation_flag,
      });
    }
  }, [latestOutput?.output_id]);

  // Haptic "reveal" on first mount — success double-tap
  const hapticFired = useRef(false);
  useEffect(() => {
    if (latestOutput && !hapticFired.current) {
      hapticFired.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [latestOutput]);

  const [activePage, setActivePage] = useState(0);
  const listRef = useRef<FlatList>(null);

  // Stable inset values (useSafeAreaInsets returns new object each render)
  const insetsTop = insets.top;
  const insetsBottom = insets.bottom;
  const stableInsets = useMemo(() => ({ top: insetsTop, bottom: insetsBottom }), [insetsTop, insetsBottom]);

  // Stable viewability config ref (React warns about inline objects)
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const lastPageRef = useRef(0);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const idx = viewableItems[0]?.index;
    if (idx != null && idx !== lastPageRef.current) {
      lastPageRef.current = idx;
      setActivePage(idx);
      // Subtle tick as each story page snaps into place — adds tactile polish to
      // the swipe-through flow without being noisy (selection-level haptic).
      Haptics.selectionAsync().catch(() => {});
    }
  }).current;

  // Build story pages (memoized). Hoisted above the empty-state early-return
  // (below) so the hook order is identical whether or not latestOutput exists.
  // An async store hydration can populate it while this screen is mounted; a
  // hook after a conditional return would crash with "rendered more hooks".
  const pages = useMemo(() => {
    if (!latestOutput) return [] as { key: string; render: () => React.ReactNode }[];

    const generatedInsights = latestOutput.generated_insights;
    const templateExplanation = getExplanation(latestOutput, {
      sunscreen: latestDaily?.sunscreen_used ?? true,
      cycleWindow: latestOutput.primary_driver === 'cycle window',
      newProduct: latestDaily?.new_product_added ?? false,
      sleepQuality: latestDaily?.sleep_quality,
    });
    const explanation = generatedInsights?.overall_summary
      || latestOutput.personalized_feedback
      || templateExplanation
      || 'Your skin analysis is ready. See your signal breakdown below.';
    const handleDone = () => router.replace('/(tabs)/today');
    const scanCount = allOutputs.length;
    const safeScore = Number.isFinite(overallInsight?.score) ? overallInsight!.score : 0;
    const accentColor = scoreColor(safeScore);

    const goalLabel = protocol?.primary_goal ? GOAL_LABELS[protocol.primary_goal] : null;
    const previousScore = Number.isFinite(previousOverallInsight?.score) ? previousOverallInsight!.score : null;
    const scoreDelta = previousScore != null ? Math.round(safeScore - previousScore) : null;
    const showQuickReadCue = generatedInsights?.source === 'local';
    const rangeComparison = buildTypicalRangeComparison(safeScore);
    const practicalLever = buildPracticalLeverCopy(overallInsight?.signals);


    const p: { key: string; render: () => React.ReactNode }[] = [];

    // Page 1: Score reveal
    p.push({
      key: 'score',
      render: () => (
        <StoryPage screenH={screenH} insets={stableInsets}>
          <Animated.View entering={ZoomIn.duration(600)} style={styles.scoreCenter}>
            {(firstName || goalLabel) && (
              <View style={styles.scorePersonalization}>
                {firstName ? <Text style={styles.scoreGreeting}>Hi, {firstName}</Text> : null}
                {goalLabel ? <Text style={styles.scoreGoal}>Focused on {goalLabel}</Text> : null}
              </View>
            )}
            <View style={styles.scoreOrb}>
              <ScoreGlow color={accentColor} reduceMotion={reduceMotion} />
              <PercentileArc score={safeScore} color={accentColor} reduceMotion={reduceMotion} />
              <Text style={[styles.bigScore, { color: accentColor }]}>
                {safeScore}
              </Text>
            </View>
            <Text style={styles.scoreStatus}>{overallInsight?.statusLabel}</Text>
            {(scoreDelta != null || currentStreak > 1) && (
              <View style={styles.headlineChipRow}>
                {scoreDelta != null && (
                  <View style={styles.headlineChip}>
                    <Feather
                      name={scoreDelta > 0 ? 'trending-up' : scoreDelta < 0 ? 'trending-down' : 'minus'}
                      size={12}
                      color={scoreDelta > 0 ? Colors.success : scoreDelta < 0 ? Colors.warning : Glow.palette.muted}
                    />
                    <Text style={[
                      styles.headlineChipText,
                      { color: scoreDelta > 0 ? Colors.success : scoreDelta < 0 ? Colors.warning : Glow.palette.muted },
                    ]}>
                      {scoreDelta === 0 ? 'No change' : `${scoreDelta > 0 ? '+' : ''}${scoreDelta} vs last scan`}
                    </Text>
                  </View>
                )}
                {currentStreak > 1 && (
                  <View style={styles.headlineChip}>
                    <Feather name="zap" size={12} color={Glow.palette.accent} />
                    <Text style={[styles.headlineChipText, { color: Glow.palette.accent }]}>
                      {currentStreak} day streak
                    </Text>
                  </View>
                )}
              </View>
            )}
          </Animated.View>
          <Animated.View entering={FadeInUp.duration(500).delay(400)} style={styles.scoreContext}>
            <Text style={styles.scoreComparison}>{rangeComparison}</Text>
            <Text style={styles.scoreAction} numberOfLines={3}>
              {scanCount === 1
                ? 'This is your baseline. Future scans will show how your skin changes.'
                : generatedInsights?.overall_score_context || overallInsight?.actionStatement}
            </Text>
            {practicalLever ? <Text style={styles.practicalNextStep}>{practicalLever}</Text> : null}
            {showQuickReadCue ? (
              <Text style={styles.quickReadCue}>Quick read: full analysis unavailable this scan.</Text>
            ) : null}
          </Animated.View>
        </StoryPage>
      ),
    });

    // Page 2: Signal breakdown
    if (latestOutput.signal_scores) {
      // Compute previous scan's signal scores for delta indicators
      const prevOutput = allOutputs.length >= 2 ? allOutputs[allOutputs.length - 2] : null;
      const prevScores = prevOutput?.signal_scores;

      // Find strongest and weakest for hierarchy
      const signalKeys = Object.keys(SIGNAL_LABELS) as Array<keyof typeof SIGNAL_LABELS>;
      const scoredSignals = signalKeys
        .map((k) => ({ key: k, score: latestOutput.signal_scores?.[k as keyof typeof latestOutput.signal_scores] }))
        .filter((s): s is { key: keyof typeof SIGNAL_LABELS; score: number } => s.score != null);
      const bestKey = scoredSignals.reduce((a, b) => (b.score > a.score ? b : a), scoredSignals[0])?.key;
      const worstKey = scoredSignals.reduce((a, b) => (b.score < a.score ? b : a), scoredSignals[0])?.key;

      p.push({
        key: 'signals',
        render: () => (
          <StoryPage screenH={screenH} insets={stableInsets}>
            <Animated.View entering={FadeInDown.duration(400)}>
              <Text style={styles.signalTitle}>Your skin signals</Text>
              <Text style={styles.signalSubtitle}>How each signal scored today.</Text>
            </Animated.View>
            <View style={styles.signalList}>
              {signalKeys.map((key, i) => {
                const score = latestOutput.signal_scores?.[key as keyof typeof latestOutput.signal_scores];
                if (score == null) return null;
                const clamped = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
                const prevScore = prevScores?.[key as keyof typeof prevScores];
                const delta = prevScore != null ? Math.round(clamped - prevScore) : null;
                const isBest = key === bestKey;
                const isWorst = key === worstKey;
                return (
                  <Animated.View key={key} entering={FadeInDown.duration(300).delay(150 + i * 100)} style={styles.signalItem}>
                    <View style={styles.signalRow}>
                      <View style={[styles.signalDot, { backgroundColor: SIGNAL_COLORS[key] }]} />
                      <Text style={styles.signalLabel}>{SIGNAL_LABELS[key]}</Text>
                      <View style={styles.signalDeltaSlot}>
                        {delta != null && delta !== 0 && (
                          <View style={styles.signalDelta}>
                            <Feather
                              name={delta > 0 ? 'trending-up' : 'trending-down'}
                              size={11}
                              color={delta > 0 ? Colors.success : Colors.warning}
                            />
                            <Text style={[styles.signalDeltaText, { color: delta > 0 ? Colors.success : Colors.warning }]}>
                              {delta > 0 ? '+' : ''}{delta}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.signalScore, { color: SIGNAL_COLORS[key] }]}>{clamped}</Text>
                    </View>
                    <AnimatedFillBar score={clamped} color={SIGNAL_COLORS[key]} delay={250 + i * 100} />
                    {(isBest || (isWorst && scoredSignals.length > 1)) && (
                      <Text style={[styles.signalBadge, { color: isBest ? Colors.success : Glow.palette.accent }]}>
                        {isBest ? 'Strongest signal' : 'Worth tending to'}
                      </Text>
                    )}
                  </Animated.View>
                );
              })}
            </View>
            {latestOutput.lesions && latestOutput.lesions.length > 0 && (
              <Animated.View entering={FadeInDown.duration(300).delay(600)} style={styles.lesionSummary}>
                <Feather name="target" size={13} color={Glow.palette.accent} />
                <Text style={styles.lesionSummaryText}>
                  {latestOutput.lesions.length} lesion{latestOutput.lesions.length !== 1 ? 's' : ''} located
                </Text>
              </Animated.View>
            )}
          </StoryPage>
        ),
      });
    }

    // Page 3: Insights + action plan
    p.push({
      key: 'insights',
      render: () => (
        <StoryPage screenH={screenH} insets={stableInsets}>
          <Text style={styles.pageTitle}>What to do</Text>
          <Animated.View entering={FadeInDown.duration(400).delay(100)}>
            <ActionCard
              driver={latestOutput.primary_driver || 'daily insight'}
              action={explanation}
              supportingText={latestOutput.recommended_action}
            />
          </Animated.View>
          {generatedInsights?.action_plan && generatedInsights.action_plan.length > 0 && (
            <Animated.View entering={FadeInDown.duration(400).delay(300)} style={styles.actionPlan}>
              <Text style={styles.actionPlanTitle}>Action plan</Text>
              {generatedInsights.action_plan.slice(0, 3).filter(Boolean).map((action, i) => (
                <Animated.View key={i} entering={FadeInDown.duration(250).delay(400 + i * 80)} style={styles.actionPlanItem}>
                  <View style={styles.actionPlanDot}>
                    <Text style={styles.actionPlanNumber}>{i + 1}</Text>
                  </View>
                  <Text style={styles.actionPlanText} numberOfLines={3}>{action}</Text>
                </Animated.View>
              ))}
            </Animated.View>
          )}
          <Animated.View entering={FadeInDown.duration(400).delay(500)} style={styles.sourcesWrap}>
            <ClinicalSourcesCard recommendations={latestOutput.rag_recommendations} />
          </Animated.View>
        </StoryPage>
      ),
    });

    // Page 4: 3D facial mesh — render lesions on the canonical topology so
    // feature dots/overlays use the same MediaPipe anatomy on every device.
    if (latestOutput.conditions?.length || (latestOutput.lesions && latestOutput.lesions.length > 0)) {
      const meshVerts = buildCanonicalMesh();
      const meshSource = 'canonical' as const;
      p.push({
        key: 'mesh3d',
        render: () => (
          <StoryPage screenH={screenH} insets={stableInsets}>
            <Text style={styles.pageTitle}>Where it's showing</Text>
            <View style={styles.meshWrap}>
              <Face3DViewer
                vertices={meshVerts}
                source={meshSource}
                mode="skin"
                size={Math.min(360, screenH * 0.4)}
                lesions={latestOutput.lesions}
              />
            </View>
            <View style={styles.meshHintChip}>
              <Feather name="move" size={11} color={Glow.palette.muted} />
              <Text style={styles.meshHint}>Pinch to zoom · drag to orbit</Text>
            </View>
          </StoryPage>
        ),
      });
    }

    // Page 5: Facial architecture — keep measurements on the canonical mesh;
    // raw ARKit vertices do not share the MediaPipe landmark topology.
    if (latestOutput.bone_structure?.harmony != null) {
      const bone = latestOutput.bone_structure;
      const meshVerts = buildCanonicalMesh();
      const meshSource = 'canonical' as const;
      p.push({
        key: 'architecture',
        render: () => (
          <StoryPage screenH={screenH} insets={stableInsets}>
            <View style={styles.architectureStack}>
              <Text style={[styles.pageTitle, styles.architectureTitle]}>Facial architecture</Text>
              <View style={styles.architectureViewerWrap}>
                <Face3DViewer
                  vertices={meshVerts}
                  source={meshSource}
                  mode="measurements"
                  size={Math.min(336, screenH * 0.34)}
                  bone={bone}
                />
              </View>
              <View style={styles.architectureScoreWrap}>
                <HarmonyScoreReveal
                  score={bone.harmony}
                  caption={bone.dominant_driver ? `Strongest opportunity: ${bone.dominant_driver}` : undefined}
                />
              </View>
              <View style={styles.interventionWrap}>
                <InterventionDrawer bundle={bone.interventions} />
              </View>
            </View>
          </StoryPage>
        ),
      });
    }

    // Page 5: Done
    p.push({
      key: 'done',
      render: () => (
        <StoryPage screenH={screenH} insets={stableInsets}>
          <View style={styles.doneCenter}>
            <Animated.View entering={ZoomIn.duration(400)} style={styles.doneIconWrap}>
              <View style={styles.doneIconHalo} />
              <Feather name="check" size={32} color={Glow.palette.accent} strokeWidth={2.4} />
            </Animated.View>
            <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.doneText}>
              <Text style={styles.doneTitle}>Scan complete</Text>
              <Text style={styles.doneStat}>Scan #{scanCount} · saved</Text>
              <Text style={styles.doneCopy}>
                Your signals are on Today. Keep scanning to see how trends shift.
              </Text>
            </Animated.View>

            {latestOutput.escalation_flag && (
              <Animated.View entering={FadeInDown.duration(400).delay(400)} style={styles.alertStrip}>
                <Feather name="alert-triangle" size={16} color={Colors.warning} />
                <Text style={styles.alertCopy}>
                  Your trend shifted quickly. Consider sharing a report with your clinician.
                </Text>
                <Button
                  title="Share report"
                  variant="secondary"
                  size="sm"
                  onPress={() => router.push('/report/generate')}
                />
              </Animated.View>
            )}

            {!hideBottomAction && (
              <Animated.View entering={FadeIn.duration(300).delay(600)} style={styles.doneAction}>
                <Button
                  title="View face map"
                  variant="secondary"
                  size="lg"
                  onPress={() => router.push('/scan/face-map')}
                />
                <Button title="Done" onPress={handleDone} size="lg" />
              </Animated.View>
            )}
          </View>
        </StoryPage>
      ),
    });

    return p;
  }, [latestOutput, overallInsight, previousOverallInsight, latestDaily, allOutputs, firstName, protocol, currentStreak, screenH, stableInsets, hideBottomAction, router, reduceMotion]);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: screenH, offset: screenH * index, index }),
    [screenH],
  );

  // Empty state — rendered after every hook so the hook order never changes.
  if (!latestOutput) {
    return (
      <StoryPage screenH={screenH} insets={stableInsets}>
        <View style={styles.emptyCenter}>
          <Text style={styles.emptyTitle}>Results appear after your first scan</Text>
          <Text style={styles.emptyCopy}>Take a scan to see your full breakdown.</Text>
          <Button title="Go back" onPress={() => router.back()} />
        </View>
      </StoryPage>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => item.render() as React.ReactElement}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={screenH}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={getItemLayout}
      />
      <ProgressDots count={pages.length} active={activePage} />
      <View style={[styles.bottomOverlay, { paddingBottom: insetsBottom + Spacing.sm }]} pointerEvents="none">
        {activePage < pages.length - 1 ? (
          <View style={styles.bottomSwipeHint} accessibilityLabel="Swipe up for next results page">
            <Feather name="chevron-up" size={SWIPE_ICON_SIZE} color={Glow.palette.accent} />
            <Text style={styles.swipeText}>Swipe up</Text>
          </View>
        ) : null}
        <Text style={styles.disclaimerText}>{LEGAL_DISCLAIMER}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Glow.palette.bg,
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  bottomSwipeHint: {
    alignItems: 'center',
    gap: Spacing.xxs,
    marginBottom: Spacing.sm,
  },
  disclaimerText: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xxs,
    lineHeight: DISCLAIMER_LINE_HEIGHT,
    textAlign: 'center',
    maxWidth: 320,
    opacity: 0.86,
  },
  // Page 1: Score reveal
  scoreCenter: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  scoreOrb: {
    width: 280,
    height: 188,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentileArc: {
    position: 'absolute',
    top: -24,
    left: 22,
  },
  glowOuter: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -36,
    left: 10,
  },
  glowMid: {
    position: 'absolute',
    width: 196,
    height: 196,
    borderRadius: 98,
    top: -4,
    left: 42,
  },
  glowInner: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    top: 24,
    left: 70,
  },
  scorePersonalization: {
    alignItems: 'center',
    gap: Spacing.xxs,
    marginBottom: Spacing.lg,
  },
  scoreGreeting: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    letterSpacing: -0.2,
  },
  scoreGoal: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  bigScore: {
    fontFamily: FontFamily.sansBold,
    fontSize: 120,
    lineHeight: 120,
    letterSpacing: -4,
  },
  scoreStatus: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: Spacing.xs,
  },
  headlineChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  headlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Glow.palette.surface,
    borderWidth: 1,
    borderColor: Glow.palette.glow,
  },
  headlineChipText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.2,
  },
  scoreContext: {
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: 320,
    gap: Spacing.sm,
  },
  scoreComparison: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  scoreAction: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    lineHeight: 24,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  practicalNextStep: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  quickReadCue: {
    marginTop: Spacing.md,
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  swipeText: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xxs,
    lineHeight: SWIPE_LABEL_LINE_HEIGHT,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  // Shared page title (pages 3, 4)
  pageTitle: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Spacing.lg,
  },

  // Page 2: Signals
  signalTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    marginBottom: Spacing.xs,
  },
  signalSubtitle: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    marginBottom: Spacing.xl,
  },
  signalList: {
    gap: Spacing.lg,
  },
  signalItem: {
    gap: Spacing.sm,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  signalLabel: {
    flex: 1,
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    letterSpacing: -0.1,
  },
  // Fixed-width slot so labels & scores don't shift when delta appears.
  signalDeltaSlot: {
    width: 44,
    alignItems: 'flex-end',
  },
  signalDelta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  signalDeltaText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  signalScore: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    letterSpacing: -0.5,
    minWidth: 40,
    textAlign: 'right',
  },
  signalBadge: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xxs,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: Spacing.xxs,
  },
  // Lesion summary pill
  lesionSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm + 2,
    backgroundColor: Glow.palette.surface,
    borderWidth: 1,
    borderColor: Glow.palette.glow,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  lesionSummaryText: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.3,
  },

  // Page 3: Insights
  actionPlan: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  actionPlanTitle: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  actionPlanItem: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  actionPlanDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    backgroundColor: Glow.palette.accent,
  },
  actionPlanNumber: {
    color: Colors.textOnDark,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxs,
    letterSpacing: 0.2,
  },
  actionPlanText: {
    flex: 1,
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  sourcesWrap: {
    marginTop: Spacing.lg,
  },
  meshWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  meshHintChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: Spacing.md,
    paddingVertical: 5,
    paddingHorizontal: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Glow.palette.surface,
    borderWidth: 1,
    borderColor: Glow.palette.glow,
  },
  meshHint: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  architectureStack: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: Spacing.md,
  },
  architectureTitle: {
    marginBottom: 0,
  },
  architectureViewerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  architectureScoreWrap: {
    alignItems: 'center',
    marginTop: -Spacing.sm,
    marginBottom: -Spacing.sm,
  },
  interventionWrap: {
    marginTop: Spacing.lg,
  },


  // Page 5: Done
  doneCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  doneIconWrap: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    backgroundColor: Glow.palette.surface,
    borderWidth: 1,
    borderColor: Glow.palette.glow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneIconHalo: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: BorderRadius.full,
    backgroundColor: Glow.palette.accent + '10',
  },
  doneText: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  doneTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    letterSpacing: -0.5,
  },
  doneStat: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  doneCopy: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 24,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xs,
  },
  doneAction: {
    width: '100%',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  alertStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warning + '12',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.warning + '33',
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
  },
  alertCopy: {
    flex: 1,
    color: Glow.palette.ink,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },

  // Empty
  emptyCenter: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
  },
  emptyCopy: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 24,
  },
});
