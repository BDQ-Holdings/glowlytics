import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { AtmosphereScreen } from '../../src/components/AtmosphereScreen';
import { ProductCard } from '../../src/components/ProductCard';
import { AddProductSheet } from '../../src/components/AddProductSheet';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Shadows,
  Spacing,
  Surfaces,
  scoreColor,
} from '../../src/constants/theme';
import { useStore } from '../../src/store/useStore';
import { computeProductEffectiveness } from '../../src/services/ingredientDB';
import {
  buildOverallSkinInsight,
  getLatestDailyForOutput,
} from '../../src/services/skinInsights';
import { trackEvent } from '../../src/services/analytics';
import {
  sortByApplicationOrder,
  detectConflicts,
  generateAdjustments,
} from '../../src/services/routineBuilder';

// ---------------------------------------------------------------------------
// Schedule color palette — warm/cool temporal rhythm
// ---------------------------------------------------------------------------
const SCHEDULE_PALETTE = {
  AM: {
    accent: '#C07B2A',       // warm amber
    iconBg: 'rgba(192, 123, 42, 0.10)',
    sectionBg: 'rgba(192, 123, 42, 0.04)',
    sectionBorder: 'rgba(192, 123, 42, 0.08)',
  },
  PM: {
    accent: '#6366B5',       // cool indigo
    iconBg: 'rgba(99, 102, 181, 0.10)',
    sectionBg: 'rgba(99, 102, 181, 0.04)',
    sectionBorder: 'rgba(99, 102, 181, 0.08)',
  },
  both: {
    accent: Colors.primary,  // teal
    iconBg: Colors.surfaceOverlay,
    sectionBg: 'rgba(58, 158, 143, 0.03)',
    sectionBorder: 'rgba(58, 158, 143, 0.06)',
  },
} as const;

// ---------------------------------------------------------------------------
// Score ring
// ---------------------------------------------------------------------------
const RING_SIZE = 72;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function RoutineScoreRing({ score }: { score: number }) {
  const safe = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const progress = safe / 100;
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
  const color = scoreColor(safe);

  return (
    <View style={ringStyles.container}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={color + '20'}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={color}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={`${RING_CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <Text style={[ringStyles.text, { color }]}>{safe}</Text>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  container: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    position: 'absolute',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
  },
});

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------
type ScheduleGroup = 'AM' | 'PM' | 'both';

interface ProductDatum {
  product: ReturnType<typeof useStore.getState>['products'][number];
  score: number;
  topContributor?: string;
}

const SCHEDULE_ORDER: ScheduleGroup[] = ['AM', 'PM', 'both'];
const SCHEDULE_LABEL: Record<ScheduleGroup, string> = {
  AM: 'Morning',
  PM: 'Evening',
  both: 'All Day',
};
const SCHEDULE_ICON: Record<ScheduleGroup, string> = {
  AM: 'sunrise',
  PM: 'moon',
  both: 'repeat',
};

function groupBySchedule(data: ProductDatum[]): Map<ScheduleGroup, ProductDatum[]> {
  const groups = new Map<ScheduleGroup, ProductDatum[]>();
  for (const d of data) {
    const key = (d.product.usage_schedule || 'both') as ScheduleGroup;
    const list = groups.get(key) || [];
    list.push(d);
    groups.set(key, list);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Routine coaching insight
// ---------------------------------------------------------------------------
function buildInsight(data: ProductDatum[], routineScore: number): { text: string; color: string } | null {
  if (data.length === 0) return null;
  const weakest = data.reduce((min, d) => (d.score < min.score ? d : min), data[0]);
  if (weakest.score < 35 && data.length > 1) {
    const name = weakest.product.product_name.length > 25
      ? weakest.product.product_name.slice(0, 22) + '...'
      : weakest.product.product_name;
    return { text: `${name} is pulling your score down. Consider swapping it.`, color: Colors.warning };
  }
  if (routineScore >= 75) return { text: 'Strong routine — your products work well together.', color: Colors.success };
  if (routineScore >= 55) return { text: 'Solid foundation. A targeted serum could push you higher.', color: Colors.primary };
  if (routineScore >= 35) return { text: 'Room to improve. Check your ingredient matches.', color: Colors.textSecondary };
  return null;
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function ProductsTab() {
  const router = useRouter();
  const products = useStore((s) => s.products);
  const protocol = useStore((s) => s.protocol);
  const modelOutputs = useStore((s) => s.modelOutputs);
  const dailyRecords = useStore((s) => s.dailyRecords);

  const [showAddSheet, setShowAddSheet] = useState(false);

  const overallInsight = useMemo(() => {
    const latestOutput = modelOutputs.length > 0 ? modelOutputs[modelOutputs.length - 1] : null;
    const baseline = modelOutputs.length > 0 ? modelOutputs[0] : null;
    const latestDaily = getLatestDailyForOutput(latestOutput, dailyRecords);
    const baselineDaily = getLatestDailyForOutput(baseline, dailyRecords);
    return buildOverallSkinInsight({
      latestOutput,
      baselineOutput: baseline,
      latestDaily,
      baselineDaily,
      serverSignalScores: latestOutput?.signal_scores,
      serverSignalFeatures: latestOutput?.signal_features,
      serverSignalConfidence: latestOutput?.signal_confidence,
      serverLesions: latestOutput?.lesions,
    });
  }, [modelOutputs, dailyRecords]);

  const productData = useMemo((): ProductDatum[] => {
    if (!protocol?.primary_goal) return products.map((p) => ({ product: p, score: 0 }));
    return products.map((p) => {
      const result = computeProductEffectiveness(p, protocol.primary_goal, overallInsight?.signals);
      return {
        product: p,
        score: result.score,
        topContributor: result.topContributors[0] || undefined,
      };
    });
  }, [products, protocol, overallInsight]);

  const routineScore = useMemo(() => {
    if (productData.length === 0) return 0;
    const sum = productData.reduce((acc, d) => acc + d.score, 0);
    return Math.round(sum / productData.length);
  }, [productData]);

  const insight = useMemo(() => buildInsight(productData, routineScore), [productData, routineScore]);
  const grouped = useMemo(() => groupBySchedule(productData), [productData]);

  // Smart ordering: sort products within each schedule group by application order
  const sortedGrouped = useMemo(() => {
    const result = new Map<ScheduleGroup, (ProductDatum & { timingLabel?: string })[]>();
    for (const [schedule, items] of grouped) {
      if (!items) continue;
      const byId = new Map(items.map((d) => [d.product.user_product_id, d]));
      const prods = items.map((d) => d.product);
      const sorted = sortByApplicationOrder(prods, schedule === 'PM' ? 'PM' : 'AM');
      result.set(
        schedule,
        sorted.map((cat) => {
          const original = byId.get(cat.product.user_product_id);
          return { ...original!, timingLabel: cat.timingLabel };
        }),
      );
    }
    return result;
  }, [grouped]);

  // Conflict detection: find ingredient conflicts in PM products
  const conflicts = useMemo(() => {
    const pmProducts = (grouped.get('PM') || []).map((d) => d.product);
    const amProducts = (grouped.get('AM') || []).map((d) => d.product);
    return [...detectConflicts(pmProducts), ...detectConflicts(amProducts)];
  }, [grouped]);

  // Signal-driven adjustment tips
  const adjustments = useMemo(() => {
    if (!overallInsight?.signals) return [];
    return generateAdjustments(products, overallInsight.signals);
  }, [products, overallInsight]);

  const openAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackEvent('product_add_sheet_opened', { source: 'products_tab' });
    setShowAddSheet(true);
  };

  return (
    <AtmosphereScreen>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Your Routine</Text>
          {products.length > 0 && (
            <Text style={styles.count}>
              {products.length} product{products.length !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
        {products.length > 0 && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={openAdd}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Add product"
          >
            <Feather name="plus" size={18} color={Colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Routine Score Card */}
      {products.length > 0 && (
        <View style={styles.scoreCard}>
          {/* Colored left accent bar driven by score */}
          <View style={[styles.scoreAccent, { backgroundColor: scoreColor(routineScore) }]} />
          <View style={styles.scoreCardContent}>
            <View style={styles.scoreTextCol}>
              <Text style={styles.scoreLabel}>Routine Score</Text>
              <Text style={styles.scoreDesc}>
                Average effectiveness across your products
              </Text>
              {insight && (
                <Text style={[styles.scoreInsight, { color: insight.color }]}>{insight.text}</Text>
              )}
            </View>
            <RoutineScoreRing score={routineScore} />
          </View>
        </View>
      )}

      {/* Signal-driven adjustment tips */}
      {adjustments.length > 0 && (
        <View style={styles.adjustmentSection}>
          {adjustments.map((tip, i) => (
            <View key={i} style={styles.adjustmentTip}>
              <Feather name={tip.color === 'warning' ? 'alert-circle' : 'info'} size={14} color={tip.color === 'warning' ? Colors.warning : Colors.primary} />
              <Text style={styles.adjustmentText} numberOfLines={3}>{tip.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Grouped product list */}
      {productData.length > 0 ? (
        <View style={styles.sections}>
          {SCHEDULE_ORDER.map((schedule) => {
            const items = sortedGrouped.get(schedule);
            if (!items || items.length === 0) return null;
            const palette = SCHEDULE_PALETTE[schedule];
            const sectionNames = new Set(items.map((d) => d.product.product_name));
            const sectionConflicts = conflicts.filter((c) =>
              sectionNames.has(c.productA) || sectionNames.has(c.productB)
            );

            return (
              <View
                key={schedule}
                style={[
                  styles.section,
                  {
                    backgroundColor: palette.sectionBg,
                    borderColor: palette.sectionBorder,
                  },
                ]}
              >
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionIconWrap, { backgroundColor: palette.iconBg }]}>
                    <Feather
                      name={SCHEDULE_ICON[schedule] as any}
                      size={13}
                      color={palette.accent}
                    />
                  </View>
                  <Text style={[styles.sectionLabel, { color: palette.accent }]}>
                    {SCHEDULE_LABEL[schedule]}
                  </Text>
                  <View style={[styles.sectionCountPill, { backgroundColor: palette.iconBg }]}>
                    <Text style={[styles.sectionCount, { color: palette.accent }]}>{items.length}</Text>
                  </View>
                </View>
                <View style={styles.sectionList}>
                  {items.map((d) => (
                    <ProductCard
                      key={d.product.user_product_id}
                      product={d.product}
                      score={d.score}
                      topContributor={d.topContributor}
                      timingLabel={d.timingLabel}
                      onPress={() =>
                        router.push({
                          pathname: '/product/[id]',
                          params: { id: d.product.user_product_id },
                        })
                      }
                    />
                  ))}
                </View>

                {/* Ingredient conflict warnings */}
                {sectionConflicts.length > 0 && (
                  <View style={styles.conflictSection}>
                    {sectionConflicts.map((c, i) => (
                      <View key={i} style={styles.conflictBanner}>
                        <Feather name="alert-triangle" size={14} color={Colors.warning} />
                        <View style={styles.conflictTextWrap}>
                          <Text style={styles.conflictMessage} numberOfLines={2}>{c.productA} + {c.productB}</Text>
                          <Text style={styles.conflictResolution} numberOfLines={2}>{c.resolution}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}

          {/* Inline add row */}
          <TouchableOpacity
            style={styles.addRow}
            onPress={openAdd}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add another product"
          >
            <View style={styles.addRowIcon}>
              <Feather name="plus" size={16} color={Colors.primary} />
            </View>
            <Text style={styles.addRowText}>Add product</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Feather name="shopping-bag" size={40} color={Colors.textDim} />
          </View>
          <Text style={styles.emptyTitle}>No products yet</Text>
          <Text style={styles.emptyDesc}>
            Add your skincare products to track their effectiveness and get personalized recommendations.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={openAdd}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add your first product"
          >
            <Feather name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.emptyButtonText}>Add your first product</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footerSpacer} />

      <AddProductSheet visible={showAddSheet} onClose={() => setShowAddSheet(false)} />
    </AtmosphereScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  title: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
  },
  count: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  // Score card
  scoreCard: {
    ...Surfaces.hero,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingLeft: 0,
    marginBottom: Spacing.lg,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  scoreAccent: {
    width: 4,
    alignSelf: 'stretch',
    borderTopLeftRadius: BorderRadius.xl,
    borderBottomLeftRadius: BorderRadius.xl,
    marginRight: Spacing.md,
  },
  scoreCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreTextCol: {
    flex: 1,
    gap: Spacing.xs,
    marginRight: Spacing.md,
  },
  scoreLabel: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  scoreDesc: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  scoreInsight: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    lineHeight: 18,
    marginTop: Spacing.xxs,
  },
  // Sections
  sections: {
    gap: Spacing.md,
  },
  section: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xxs,
  },
  sectionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex: 1,
  },
  sectionCountPill: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCount: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxs,
  },
  sectionList: {
    gap: Spacing.sm,
  },
  // Conflicts
  conflictSection: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  conflictBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.warning + '10',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  conflictTextWrap: {
    flex: 1,
    gap: Spacing.xxs,
  },
  conflictMessage: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  conflictResolution: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
  },
  // Adjustments
  adjustmentSection: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  adjustmentTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceOverlay,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  adjustmentText: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  // Add row
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  addRowIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRowText: {
    color: Colors.primary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  emptyDesc: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: Spacing.lg,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    ...Shadows.glow,
  },
  emptyButtonText: {
    color: Colors.textOnDark,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  footerSpacer: {
    height: 100,
  },
});
