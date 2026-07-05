import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { GlowIcon } from '../src/components/glow/GlowIcons';
import { FadeUp } from '../src/components/glow/GlowPrimitives';
import { ProductCard } from '../src/components/ProductCard';
import { AddProductSheet } from '../src/components/AddProductSheet';
import {
  FontFamily,
  FontSize,
  Glow,
  scoreColor,
} from '../src/constants/theme';
import { useStore } from '../src/store/useStore';
import { computeProductEffectiveness } from '../src/services/ingredientDB';
import {
  buildOverallSkinInsight,
  getLatestDailyForOutput,
} from '../src/services/skinInsights';
import { trackEvent } from '../src/services/analytics';
import {
  sortByApplicationOrder,
  detectConflicts,
  generateAdjustments,
} from '../src/services/routineBuilder';
import { activeProducts } from '../src/services/ritual';

// ---------------------------------------------------------------------------
// Score ring
// ---------------------------------------------------------------------------
const RING_SIZE = 76;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function RoutineScoreRing({ score }: { score: number }) {
  const P = Glow.palette;
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
          stroke={P.glow}
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
      <View style={ringStyles.labelWrap}>
        <Text style={[ringStyles.value, { color: P.ink }]}>{safe}</Text>
        <Text style={[ringStyles.suffix, { color: P.muted }]}>/100</Text>
      </View>
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
  labelWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  value: {
    fontFamily: FontFamily.sansBold,
    fontSize: 22,
    lineHeight: 24,
  },
  suffix: {
    fontFamily: FontFamily.sans,
    fontSize: 10,
    marginTop: 1,
  },
});

// ---------------------------------------------------------------------------
// Schedule groups
// ---------------------------------------------------------------------------
type ScheduleGroup = 'AM' | 'PM' | 'both';

interface ProductDatum {
  product: ReturnType<typeof useStore.getState>['products'][number];
  score: number;
  topContributor?: string;
}

const SCHEDULE_ORDER: ScheduleGroup[] = ['AM', 'PM', 'both'];
const SCHEDULE_COPY: Record<ScheduleGroup, { eyebrow: string; accentLabel: string }> = {
  AM:   { eyebrow: 'IN THE MORNING', accentLabel: 'sunrise' },
  PM:   { eyebrow: 'IN THE EVENING', accentLabel: 'dusk' },
  both: { eyebrow: 'TWICE A DAY',    accentLabel: 'always' },
};
const SCHEDULE_ICON: Record<ScheduleGroup, 'sun' | 'sparkle' | 'leaf'> = {
  AM:   'sun',
  PM:   'sparkle',
  both: 'leaf',
};

function groupBySchedule(data: ProductDatum[]): Map<ScheduleGroup, ProductDatum[]> {
  const map = new Map<ScheduleGroup, ProductDatum[]>();
  for (const datum of data) {
    const schedule = (datum.product.usage_schedule || 'both') as ScheduleGroup;
    const key = schedule === 'AM' || schedule === 'PM' ? schedule : 'both';
    const list = map.get(key) ?? [];
    list.push(datum);
    map.set(key, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Coaching line
// ---------------------------------------------------------------------------
function buildInsight(data: ProductDatum[], routineScore: number): string | null {
  if (data.length === 0) return null;
  if (routineScore >= 75) return 'This routine is doing real work for your goal.';
  if (routineScore >= 55) return 'Mostly on point. A swap or two could lift the rest.';
  if (routineScore >= 35) return 'A few products are along for the ride. See if they earn their slot.';
  return 'Most of this stack isn\u2019t helping the goal you set. Time to edit.';
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function RoutineScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const allProducts = useStore((s) => s.products);
  // Soft-removed products (end_date set) stay in the store for ritual history —
  // forward-looking scoring/conflicts must only see the active shelf.
  const products = useMemo(() => activeProducts(allProducts), [allProducts]);
  const protocol = useStore((s) => s.protocol);
  const modelOutputs = useStore((s) => s.modelOutputs);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const [showAddSheet, setShowAddSheet] = useState(false);

  const P = Glow.palette;

  const overallInsight = useMemo(() => {
    const latestOutput = modelOutputs.length > 0 ? modelOutputs[modelOutputs.length - 1] : null;
    const baseline = modelOutputs.length > 0 ? modelOutputs[0] : null;
    return buildOverallSkinInsight({
      latestOutput,
      baselineOutput: baseline,
      latestDaily: getLatestDailyForOutput(latestOutput, dailyRecords),
      baselineDaily: getLatestDailyForOutput(baseline, dailyRecords),
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

  // Conflict detection: find ingredient conflicts in AM/PM products
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
    trackEvent('product_add_sheet_opened', { source: 'routine_screen' });
    setShowAddSheet(true);
  };

  return (
    <View style={[styles.host, { backgroundColor: P.bg }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 140,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <FadeUp index={0}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={[styles.iconBtn, { backgroundColor: P.surface, borderColor: P.glow }]}
            >
              <GlowIcon name="back" size={16} color={P.ink} stroke={1.8} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: P.muted }]}>YOUR ROUTINE</Text>
              <Text style={[styles.title, { color: P.ink }]}>
                What you actually{' '}
                <Text style={[styles.titleAccent, { color: P.accent }]}>use</Text>
              </Text>
              {products.length > 0 && (
                <Text style={[styles.count, { color: P.muted }]}>
                  {products.length} product{products.length !== 1 ? 's' : ''} on your shelf
                </Text>
              )}
            </View>
          </View>
        </FadeUp>

        {products.length > 0 && (
          <>
            {/* Routine Score */}
            <FadeUp index={1}>
              <View style={[styles.scoreCard, { backgroundColor: P.surface, borderColor: P.glow }]}>
                <View style={styles.scoreCol}>
                  <Text style={[styles.scoreLabel, { color: P.muted }]}>ROUTINE SCORE</Text>
                  <Text style={[styles.scoreInsight, { color: P.ink }]}>
                    {insight ?? 'Add a few products to start scoring.'}
                  </Text>
                </View>
                <RoutineScoreRing score={routineScore} />
              </View>
            </FadeUp>

            {/* Signal-driven adjustment tips */}
            {adjustments.length > 0 && (
              <FadeUp index={2}>
                <View style={styles.tipsBlock}>
                  {adjustments.map((tip, i) => (
                    <View
                      key={i}
                      style={[styles.tipRow, { backgroundColor: P.surface, borderColor: P.glow }]}
                    >
                      <GlowIcon
                        name={tip.color === 'warning' ? 'flame' : 'sparkle'}
                        size={14}
                        color={tip.color === 'warning' ? P.accent : P.muted}
                        stroke={1.8}
                      />
                      <Text style={[styles.tipText, { color: P.ink }]} numberOfLines={3}>
                        {tip.text}
                      </Text>
                    </View>
                  ))}
                </View>
              </FadeUp>
            )}

            {/* Conflicts banner — surfaced here at the top of the page so the
                user notices it before scrolling through individual products. */}
            {conflicts.length > 0 && (
              <FadeUp index={3}>
                <View
                  style={[
                    styles.conflictBlock,
                    { backgroundColor: P.surface, borderColor: P.accent },
                  ]}
                >
                  <View style={styles.conflictHeader}>
                    <GlowIcon name="flame" size={14} color={P.accent} stroke={1.9} />
                    <Text style={[styles.conflictTitle, { color: P.accent }]}>
                      {conflicts.length === 1
                        ? 'One pairing worth a second look'
                        : `${conflicts.length} pairings worth a second look`}
                    </Text>
                  </View>
                  {conflicts.map((c, i) => (
                    <View key={i} style={styles.conflictItem}>
                      <Text style={[styles.conflictPair, { color: P.ink }]} numberOfLines={2}>
                        {c.productA} <Text style={{ color: P.muted }}>+</Text> {c.productB}
                      </Text>
                      <Text style={[styles.conflictResolution, { color: P.muted }]} numberOfLines={3}>
                        {c.resolution}
                      </Text>
                    </View>
                  ))}
                </View>
              </FadeUp>
            )}

            {/* Grouped product list */}
            <View style={styles.sections}>
              {SCHEDULE_ORDER.map((schedule, sectionIdx) => {
                const items = sortedGrouped.get(schedule);
                if (!items || items.length === 0) return null;
                const copy = SCHEDULE_COPY[schedule];
                return (
                  <FadeUp key={schedule} index={4 + sectionIdx}>
                    <View>
                      <View style={styles.sectionHeader}>
                        <View style={[styles.sectionIconWrap, { backgroundColor: P.glow }]}>
                          <GlowIcon
                            name={SCHEDULE_ICON[schedule]}
                            size={14}
                            color={P.accent}
                            stroke={1.8}
                          />
                        </View>
                        <Text style={[styles.sectionEyebrow, { color: P.muted }]}>
                          {copy.eyebrow}
                        </Text>
                        <Text style={[styles.sectionAccent, { color: P.accent }]}>
                          {copy.accentLabel}
                        </Text>
                        <View style={[styles.sectionCountPill, { backgroundColor: P.glow }]}>
                          <Text style={[styles.sectionCount, { color: P.ink }]}>{items.length}</Text>
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
                    </View>
                  </FadeUp>
                );
              })}

              {/* Inline add row */}
              <FadeUp index={7}>
                <TouchableOpacity
                  style={[styles.addRow, { borderColor: P.muted }]}
                  onPress={openAdd}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Add another product"
                >
                  <GlowIcon name="plus" size={14} color={P.ink} stroke={1.9} />
                  <Text style={[styles.addRowText, { color: P.ink }]}>Add another product</Text>
                </TouchableOpacity>
              </FadeUp>
            </View>
          </>
        )}

        {products.length === 0 && (
          <FadeUp index={1}>
            <View style={[styles.emptyState, { backgroundColor: P.surface, borderColor: P.glow }]}>
              <Text style={[styles.emptyEyebrow, { color: P.muted }]}>EMPTY SHELF</Text>
              <Text style={[styles.emptyTitle, { color: P.ink }]}>
                Start with one{' '}
                <Text style={[styles.emptyTitleAccent, { color: P.accent }]}>thing</Text>
              </Text>
              <Text style={[styles.emptyBody, { color: P.muted }]}>
                Add a product and we'll track how it shows up in your readings over time.
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: P.ink }]}
                onPress={openAdd}
                activeOpacity={0.85}
              >
                <GlowIcon name="plus" size={14} color={P.surface} stroke={1.9} />
                <Text style={[styles.emptyBtnText, { color: P.surface }]}>Add a product</Text>
              </TouchableOpacity>
            </View>
          </FadeUp>
        )}
      </ScrollView>

      <AddProductSheet visible={showAddSheet} onClose={() => setShowAddSheet(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 22,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  eyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: FontFamily.sans,
    fontSize: 28,
    lineHeight: 34,
    marginTop: 2,
  },
  titleAccent: {
    fontFamily: FontFamily.accent,
    fontSize: 32,
  },
  count: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
  },

  // Score card
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  scoreCol: {
    flex: 1,
    gap: 6,
  },
  scoreLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  scoreInsight: {
    fontFamily: FontFamily.sans,
    fontSize: 15,
    lineHeight: 21,
  },

  // Adjustment tips
  tipsBlock: {
    gap: 8,
    marginBottom: 16,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  tipText: {
    flex: 1,
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 19,
  },

  // Conflicts
  conflictBlock: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
    gap: 10,
  },
  conflictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conflictTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  conflictItem: {
    gap: 3,
  },
  conflictPair: {
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
  },
  conflictResolution: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: 'italic',
  },

  // Sections
  sections: {
    gap: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionEyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  sectionAccent: {
    fontFamily: FontFamily.accent,
    fontSize: 18,
    flex: 1,
  },
  sectionCountPill: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCount: {
    fontFamily: FontFamily.sansBold,
    fontSize: 12,
  },
  sectionList: {
    gap: 10,
  },

  // Add row
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 6,
  },
  addRowText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
  },

  // Empty state
  emptyState: {
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyEyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  emptyTitle: {
    fontFamily: FontFamily.sans,
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
    marginTop: 4,
  },
  emptyTitleAccent: {
    fontFamily: FontFamily.accent,
    fontSize: 28,
  },
  emptyBody: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 8,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
    marginTop: 18,
  },
  emptyBtnText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
  },
});
