import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, useWindowDimensions, View, ViewToken } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, {
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
import { ActionCard } from '../../src/components/ActionCard';
import { Button } from '../../src/components/Button';
import { FacialMesh } from '../../src/components/FacialMesh';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  scoreColor,
} from '../../src/constants/theme';
import { SIGNAL_COLORS, SIGNAL_LABELS } from '../../src/constants/signals';
import { getExplanation } from '../../src/services/skinAnalysis';
import {
  buildOverallSkinInsight,
  getLatestDailyForOutput,
} from '../../src/services/skinInsights';
import { useStore } from '../../src/store/useStore';
import { trackEvent } from '../../src/services/analytics';
import { AnimatedFillBar } from '../../src/components/AnimatedFillBar';

// ---------------------------------------------------------------------------
// Story page wrapper — each page fills the viewport
// ---------------------------------------------------------------------------
function StoryPage({ children, screenH, insets }: {
  children: React.ReactNode;
  screenH: number;
  insets: { top: number; bottom: number };
}) {
  return (
    <View style={[storyStyles.page, { height: screenH }]}>
      <LinearGradient
        colors={[Colors.background, Colors.backgroundDeep, Colors.backgroundWarm]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[
        storyStyles.pageContent,
        { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xxl },
      ]}>
        {children}
      </View>
    </View>
  );
}

const storyStyles = StyleSheet.create({
  page: { width: '100%' },
  pageContent: {
    flex: 1,
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
    backgroundColor: Colors.primary,
    width: 5,
    height: 16,
    borderRadius: 3,
  },
  dotDone: {
    backgroundColor: Colors.primaryLight,
  },
});

// ---------------------------------------------------------------------------
// Animated score glow — 3 concentric rings with staggered breathing
// ---------------------------------------------------------------------------
const BREATHE_EASING = Easing.inOut(Easing.ease);

function ScoreGlow({ color }: { color: string }) {
  const breathe = useSharedValue(1);

  useEffect(() => {
    // Seamless cycle: 1 → 1.06 → 0.94 → 1 (symmetric, no seam on repeat)
    breathe.value = withDelay(600, withRepeat(
      withSequence(
        withTiming(1.06, { duration: 500, easing: BREATHE_EASING }),
        withTiming(0.94, { duration: 1000, easing: BREATHE_EASING }),
        withTiming(1, { duration: 500, easing: BREATHE_EASING }),
      ),
      -1,
    ));
  }, []);

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
  const latestOutput = allOutputs.length > 0 ? allOutputs[allOutputs.length - 1] : null;
  const baselineOutput = allOutputs.length > 0 ? allOutputs[0] : null;
  const latestDaily = getLatestDailyForOutput(latestOutput, dailyRecords);
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
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActivePage(viewableItems[0].index);
    }
  }).current;

  // Empty state
  if (!latestOutput) {
    return (
      <StoryPage screenH={screenH} insets={stableInsets}>
        <View style={styles.emptyCenter}>
          <Text style={styles.emptyTitle}>No results yet</Text>
          <Text style={styles.emptyCopy}>Capture a scan first.</Text>
          <Button title="Go back" onPress={() => router.back()} />
        </View>
      </StoryPage>
    );
  }

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

  // Build story pages (memoized)
  const pages = useMemo(() => {
    const p: { key: string; render: () => React.ReactNode }[] = [];

    // Page 1: Score reveal
    p.push({
      key: 'score',
      render: () => (
        <StoryPage screenH={screenH} insets={stableInsets}>
          <Animated.View entering={ZoomIn.duration(600)} style={styles.scoreCenter}>
            <ScoreGlow color={accentColor} />
            <Text style={[styles.bigScore, { color: accentColor }]}>
              {safeScore}
            </Text>
            <Text style={styles.scoreStatus}>{overallInsight?.statusLabel}</Text>
          </Animated.View>
          <Animated.View entering={FadeInUp.duration(500).delay(400)}>
            <Text style={styles.scoreAction} numberOfLines={3}>
              {scanCount === 1
                ? 'This is your baseline. Future scans will show how your skin changes.'
                : generatedInsights?.overall_score_context || overallInsight?.actionStatement}
            </Text>
          </Animated.View>
          <Animated.View entering={FadeIn.duration(400).delay(800)} style={styles.swipeHint} accessibilityLabel="Swipe up for signal details">
            <Feather name="chevron-up" size={14} color={Colors.textDim} />
            <Text style={styles.swipeText}>Swipe up</Text>
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
                      {delta != null && delta !== 0 && (
                        <View style={styles.signalDelta}>
                          <Feather
                            name={delta > 0 ? 'trending-up' : 'trending-down'}
                            size={11}
                            color={delta > 0 ? Colors.success : Colors.error}
                          />
                          <Text style={[styles.signalDeltaText, { color: delta > 0 ? Colors.success : Colors.error }]}>
                            {delta > 0 ? '+' : ''}{delta}
                          </Text>
                        </View>
                      )}
                      <Text style={[styles.signalScore, { color: SIGNAL_COLORS[key] }]}>{clamped}</Text>
                    </View>
                    <AnimatedFillBar score={clamped} color={SIGNAL_COLORS[key]} delay={250 + i * 100} />
                    {isBest && (
                      <Text style={[styles.signalBadge, { color: Colors.success }]}>Strongest signal</Text>
                    )}
                    {isWorst && scoredSignals.length > 1 && (
                      <Text style={[styles.signalBadge, { color: Colors.warning }]}>Needs attention</Text>
                    )}
                  </Animated.View>
                );
              })}
            </View>
            {latestOutput.lesions && latestOutput.lesions.length > 0 && (
              <Animated.View entering={FadeInDown.duration(300).delay(600)} style={styles.lesionSummary}>
                <Feather name="target" size={14} color={Colors.primary} />
                <Text style={styles.lesionSummaryText}>
                  {latestOutput.lesions.length} lesion{latestOutput.lesions.length !== 1 ? 's' : ''} detected
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
                  <View style={[styles.actionPlanDot, { backgroundColor: Colors.primary }]}>
                    <Text style={styles.actionPlanNumber}>{i + 1}</Text>
                  </View>
                  <Text style={styles.actionPlanText} numberOfLines={3}>{action}</Text>
                </Animated.View>
              ))}
            </Animated.View>
          )}
        </StoryPage>
      ),
    });

    // Page 4: Facial analysis (conditional)
    if (latestOutput.conditions?.length || (latestOutput.lesions && latestOutput.lesions.length > 0)) {
      p.push({
        key: 'deepdive',
        render: () => (
          <StoryPage screenH={screenH} insets={stableInsets}>
            <FacialMesh
              acneScore={latestOutput.acne_score}
              sunDamageScore={latestOutput.sun_damage_score}
              skinAgeScore={latestOutput.skin_age_score}
              conditions={latestOutput.conditions}
              lesions={latestOutput.lesions}
              signalConfidence={latestOutput.signal_confidence}
            />
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
            <Animated.View entering={ZoomIn.duration(400)}>
              <Feather name="check-circle" size={56} color={Colors.success} />
            </Animated.View>
            <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.doneText}>
              <Text style={styles.doneTitle}>Scan complete</Text>
              <Text style={styles.doneStat}>Scan #{scanCount}</Text>
              <Text style={styles.doneCopy}>
                Your data has been saved. Check your signals on Today to track changes.
              </Text>
            </Animated.View>

            {latestOutput.escalation_flag && (
              <Animated.View entering={FadeInDown.duration(400).delay(400)} style={styles.alertStrip}>
                <Feather name="alert-triangle" size={18} color={Colors.warning} />
                <Text style={styles.alertCopy}>
                  Your trend changed quickly. Consider sharing a report with your clinician.
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
                <Button title="Done" onPress={handleDone} size="lg" />
              </Animated.View>
            )}
          </View>
        </StoryPage>
      ),
    });

    return p;
  }, [latestOutput, overallInsight, generatedInsights, explanation, screenH, stableInsets, hideBottomAction, accentColor, scanCount]);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: screenH, offset: screenH * index, index }),
    [screenH],
  );

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
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={getItemLayout}
      />
      <ProgressDots count={pages.length} active={activePage} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // Page 1: Score reveal
  scoreCenter: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  glowOuter: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    top: -87,
  },
  glowMid: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    top: -47,
  },
  glowInner: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    top: -17,
  },
  bigScore: {
    fontFamily: FontFamily.sansBold,
    fontSize: 120,
    lineHeight: 120,
    letterSpacing: -4,
  },
  scoreStatus: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    marginTop: Spacing.xs,
  },
  scoreAction: {
    color: Colors.text,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.lg,
    lineHeight: 26,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  swipeHint: {
    position: 'absolute',
    bottom: Spacing.xl,
    alignSelf: 'center',
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  swipeText: {
    color: Colors.textDim,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Shared page title (pages 3, 4)
  pageTitle: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Spacing.lg,
  },

  // Page 2: Signals
  signalTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    marginBottom: Spacing.xs,
  },
  signalSubtitle: {
    color: Colors.textMuted,
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
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  signalLabel: {
    flex: 1,
    color: Colors.text,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
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
    minWidth: 36,
    textAlign: 'right',
  },
  signalBadge: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
    letterSpacing: 0.5,
    marginTop: Spacing.xxs,
  },
  // Lesion summary pill
  lesionSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceOverlay,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  lesionSummaryText: {
    color: Colors.primary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },

  // Page 3: Insights
  actionPlan: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  actionPlanTitle: {
    color: Colors.primaryLight,
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
  },
  actionPlanNumber: {
    color: Colors.textOnDark,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxs,
  },
  actionPlanText: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },


  // Page 5: Done
  doneCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  doneText: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  doneTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
  },
  doneStat: {
    color: Colors.primary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  doneCopy: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 23,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.xs,
  },
  doneAction: {
    width: '100%',
    paddingHorizontal: Spacing.lg,
  },
  alertStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warning + '14',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.warning + '40',
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
  },
  alertCopy: {
    flex: 1,
    color: Colors.textSecondary,
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
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
  },
  emptyCopy: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 24,
  },
});
