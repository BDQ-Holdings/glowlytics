import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
  scoreColor,
} from '../../src/constants/theme';
import { SIGNAL_COLORS, SIGNAL_LABELS } from '../../src/constants/signals';
import { useStore } from '../../src/store/useStore';
import {
  computeProductEffectiveness,
  generateProductBlurb,
  getUsageTips,
  matchIngredient,
} from '../../src/services/ingredientDB';
import {
  buildOverallSkinInsight,
  getLatestDailyForOutput,
} from '../../src/services/skinInsights';
import { useCalmFadeIn } from '../../src/utils/animations';
import { safeClamp } from '../../src/utils/safeClamp';

import type { IngredientRating } from '../../src/services/ingredientDB';
import type { CompositeSignals } from '../../src/services/skinInsights';

// ---------------------------------------------------------------------------
// Ring gauge (mirrors TopStatRing from home screen)
// ---------------------------------------------------------------------------
const ringSize = 96;
const ringStroke = 6;

const clampScore = safeClamp;


const ratingDotColor: Record<IngredientRating, string> = {
  highly_beneficial: '#34A77B',
  beneficial: Colors.primary,
  neutral: Colors.textMuted,
  potentially_concerning: '#C07B2A',
  concerning: '#D14343',
};

const GOAL_LABELS: Record<string, string> = {
  acne: 'Acne Management',
  sun_damage: 'Sun Protection',
  skin_age: 'Skin Age Management',
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const products = useStore((s) => s.products);
  const protocol = useStore((s) => s.protocol);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const modelOutputs = useStore((s) => s.modelOutputs);

  const product = products.find((p) => p.user_product_id === id);

  // Build overall insight for signal data
  const latestOutput = modelOutputs.length > 0 ? modelOutputs[modelOutputs.length - 1] : null;
  const baseline = modelOutputs.length > 0 ? modelOutputs[0] : null;
  const latestDaily = getLatestDailyForOutput(latestOutput, dailyRecords);
  const baselineDaily = getLatestDailyForOutput(baseline, dailyRecords);

  const overallInsight = useMemo(
    () =>
      buildOverallSkinInsight({
        latestOutput,
        baselineOutput: baseline,
        latestDaily,
        baselineDaily,
        serverSignalScores: latestOutput?.signal_scores,
        serverSignalFeatures: latestOutput?.signal_features,
        serverSignalConfidence: latestOutput?.signal_confidence,
        serverLesions: latestOutput?.lesions,
      }),
    [latestOutput, baseline, latestDaily, baselineDaily],
  );

  const primaryGoal = protocol?.primary_goal ?? 'acne';

  const effectiveness = useMemo(() => {
    if (!product) return null;
    return computeProductEffectiveness(product, primaryGoal, overallInsight?.signals);
  }, [product, primaryGoal, overallInsight?.signals]);

  const blurb = useMemo(() => {
    if (!product || !effectiveness) return '';
    return generateProductBlurb(product, effectiveness, primaryGoal);
  }, [product, effectiveness, primaryGoal]);

  const tips = useMemo(() => {
    if (!effectiveness) return [];
    return getUsageTips(effectiveness.matchedIngredients);
  }, [effectiveness]);

  // Match each raw ingredient individually
  const ingredientRows = useMemo(() => {
    if (!product) return [];
    return product.ingredients_list.map((raw) => {
      const profile = matchIngredient(raw);
      return { raw, profile };
    });
  }, [product]);

  // Determine which signals this product affects
  const relatedSignals = useMemo(() => {
    if (!effectiveness) return [];
    const signalKeys: (keyof CompositeSignals)[] = [
      'structure',
      'hydration',
      'inflammation',
      'sunDamage',
      'elasticity',
    ];
    const result: { key: keyof CompositeSignals; net: number }[] = [];

    for (const sKey of signalKeys) {
      let net = 0;
      for (const { profile } of effectiveness.matchedIngredients) {
        net += profile.signalRelevance[sKey];
      }
      if (net !== 0) {
        result.push({ key: sKey, net });
      }
    }
    return result;
  }, [effectiveness]);

  // Staggered entrance animations
  const headerAnim = useCalmFadeIn(0);
  const ingredientCardAnim = useCalmFadeIn(120);
  const goalCardAnim = useCalmFadeIn(240);
  const blurbCardAnim = useCalmFadeIn(360);
  const tipsCardAnim = useCalmFadeIn(480);
  const signalsCardAnim = useCalmFadeIn(600);

  // ---------------------------------------------------------------------------
  // Not found
  // ---------------------------------------------------------------------------
  if (!product) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.notFound}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.notFoundText}>Product not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const score = effectiveness?.score ?? 0;
  const ringColor = scoreColor(score);

  // Ring gauge math
  const radius = (ringSize - ringStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ringSpan = circumference * 0.84;
  const gap = circumference - ringSpan;
  const progressSpan = ringSpan * (clampScore(score) / 100);
  const center = ringSize / 2;
  const rotation = `rotate(128 ${center} ${center})`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                           */}
        {/* ---------------------------------------------------------------- */}
        <Animated.View style={[styles.headerRow, headerAnim]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={Colors.text} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.productName} numberOfLines={2}>
              {product.product_name}
            </Text>
            <Text style={styles.scheduleLabel}>
              {product.usage_schedule === 'both'
                ? 'AM + PM'
                : product.usage_schedule}
            </Text>
          </View>

          {/* Effectiveness ring */}
          <View style={styles.ringWrap}>
            <Svg width={ringSize} height={ringSize}>
              <Circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={Colors.borderStrong}
                strokeWidth={ringStroke}
                strokeLinecap="round"
                strokeDasharray={`${ringSpan} ${gap}`}
                transform={rotation}
              />
              <Circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={ringColor}
                strokeWidth={ringStroke}
                strokeLinecap="round"
                strokeDasharray={`${progressSpan} ${circumference}`}
                transform={rotation}
              />
            </Svg>
            <View style={styles.ringCenter} pointerEvents="none">
              <Text style={[styles.ringScore, { color: ringColor }]}>
                {clampScore(score)}
              </Text>
              <Text style={styles.ringLabel}>Score</Text>
            </View>
          </View>
        </Animated.View>

        {/* ---------------------------------------------------------------- */}
        {/* Ingredient List Card                                             */}
        {/* ---------------------------------------------------------------- */}
        <Animated.View style={[styles.card, ingredientCardAnim]}>
          <Text style={styles.cardTitle}>Ingredients</Text>
          {ingredientRows.map((row, idx) => {
            const dotColor = row.profile
              ? ratingDotColor[row.profile.rating]
              : Colors.textDim;
            // ALWAYS show the user-entered name verbatim. The canonical name is shown as a
            // secondary tag only when it differs from the raw input — this preserves
            // clinical specificity (e.g. "Tretinoin Cream USP 0.025%" instead of the
            // generic canonical "Tretinoin"). Fixes TestFlight feedback #1.
            const rawDisplay = row.raw;
            const canonical = row.profile?.canonicalName ?? null;
            const showCanonicalTag =
              canonical !== null &&
              canonical.toLowerCase() !== rawDisplay.trim().toLowerCase();
            const desc = row.profile
              ? row.profile.description
              : 'Not in database';

            return (
              <View
                key={`${row.raw}-${idx}`}
                style={[
                  styles.ingredientRow,
                  idx < ingredientRows.length - 1 && styles.ingredientRowBorder,
                ]}
              >
                <View style={[styles.dot, { backgroundColor: dotColor }]} />
                <View style={styles.ingredientInfo}>
                  <View style={styles.ingredientNameRow}>
                    <Text style={styles.ingredientName} numberOfLines={2}>
                      {rawDisplay}
                    </Text>
                    {showCanonicalTag && (
                      <View style={styles.canonicalTag}>
                        <Text style={styles.canonicalTagText}>{canonical}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.ingredientDesc} numberOfLines={2}>
                    {desc}
                  </Text>
                </View>
              </View>
            );
          })}
        </Animated.View>

        {/* ---------------------------------------------------------------- */}
        {/* Goal Alignment Card                                              */}
        {/* ---------------------------------------------------------------- */}
        <Animated.View style={[styles.card, goalCardAnim]}>
          <Text style={styles.cardTitle}>
            How this helps your {GOAL_LABELS[primaryGoal] ?? primaryGoal}
          </Text>

          {/* Alignment bar */}
          <View style={styles.alignmentBarTrack}>
            <View
              style={[
                styles.alignmentBarFill,
                {
                  width: `${clampScore(score)}%`,
                  backgroundColor: ringColor,
                },
              ]}
            />
          </View>

          <View style={styles.alignmentMeta}>
            <Text style={[styles.alignmentScore, { color: ringColor }]}>
              {clampScore(score)}
            </Text>
            <Text style={styles.alignmentGoal}>
              {GOAL_LABELS[primaryGoal] ?? primaryGoal}
            </Text>
          </View>

          {effectiveness && effectiveness.topContributors.length > 0 && (
            <Text style={styles.alignmentExplanation}>
              Top contributors:{' '}
              {effectiveness.topContributors.join(', ')}.
              {effectiveness.concerns.length > 0
                ? ` Watch for ${effectiveness.concerns.join(', ')}.`
                : ''}
            </Text>
          )}
        </Animated.View>

        {/* ---------------------------------------------------------------- */}
        {/* Template Summary Card                                            */}
        {/* ---------------------------------------------------------------- */}
        <Animated.View style={[styles.card, blurbCardAnim]}>
          <Text style={styles.cardTitle}>Summary</Text>
          <Text style={styles.blurbText}>{blurb}</Text>
        </Animated.View>

        {/* ---------------------------------------------------------------- */}
        {/* Usage Tips Card                                                  */}
        {/* ---------------------------------------------------------------- */}
        {tips.length > 0 && (
          <Animated.View style={[styles.card, tipsCardAnim]}>
            <Text style={styles.cardTitle}>Usage Tips</Text>
            {tips.map((tip, idx) => (
              <View key={idx} style={styles.tipRow}>
                <Feather
                  name="zap"
                  size={16}
                  color={Colors.warning}
                  style={styles.tipIcon}
                />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Related Signals Card                                             */}
        {/* ---------------------------------------------------------------- */}
        {relatedSignals.length > 0 && (
          <Animated.View style={[styles.card, signalsCardAnim]}>
            <Text style={styles.cardTitle}>Related Signals</Text>
            {relatedSignals.map(({ key, net }) => {
              const direction = net > 0 ? 'up' : 'down';
              const arrowIcon = net > 0 ? 'arrow-up-right' : 'arrow-down-right';
              const signalColor = SIGNAL_COLORS[key];

              return (
                <View key={key} style={styles.signalRow}>
                  <View style={[styles.signalDot, { backgroundColor: signalColor }]} />
                  <Text style={styles.signalName}>{SIGNAL_LABELS[key]}</Text>
                  <Feather
                    name={arrowIcon}
                    size={16}
                    color={direction === 'up' ? '#34A77B' : '#D14343'}
                  />
                  <Text
                    style={[
                      styles.signalDirection,
                      { color: direction === 'up' ? '#34A77B' : '#D14343' },
                    ]}
                  >
                    {direction === 'up' ? 'Improves' : 'May reduce'}
                  </Text>
                </View>
              );
            })}
          </Animated.View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    gap: Spacing.xxs,
  },
  productName: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    lineHeight: 28,
  },
  scheduleLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Ring
  ringWrap: {
    width: ringSize,
    height: ringSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringScore: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    lineHeight: 32,
  },
  ringLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    marginTop: -2,
  },

  // Cards
  card: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    marginBottom: Spacing.md,
  },

  // Ingredients
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  ingredientRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.xs,
    marginTop: 6,
  },
  ingredientInfo: {
    flex: 1,
    gap: Spacing.xxs,
  },
  ingredientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  ingredientName: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    flexShrink: 1,
  },
  canonicalTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  canonicalTagText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
    letterSpacing: 0.3,
  },
  ingredientDesc: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 19,
  },

  // Goal alignment
  alignmentBarTrack: {
    height: 8,
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: BorderRadius.xs,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  alignmentBarFill: {
    height: '100%',
    borderRadius: BorderRadius.xs,
  },
  alignmentMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  alignmentScore: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
  },
  alignmentGoal: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
  alignmentExplanation: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },

  // Blurb
  blurbText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 23,
  },

  // Tips
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tipIcon: {
    marginTop: 2,
  },
  tipText: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
  },

  // Signals
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.xs,
  },
  signalName: {
    flex: 1,
    color: Colors.text,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
  },
  signalDirection: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },

  // Not found
  notFound: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.lg,
  },
  notFoundText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.lg,
    textAlign: 'center',
    marginTop: Spacing.xxl,
  },

  bottomSpacer: {
    height: Spacing.xxl,
  },
});
