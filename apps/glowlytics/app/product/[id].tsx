import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlowIcon, GlowSpark } from '../../src/components/glow/GlowIcons';
import {
  BreathingGlow,
  FadeUp,
  SectionHead,
} from '../../src/components/glow/GlowPrimitives';
import {
  BorderRadius,
  Colors,
  FontFamily,
  Glow,
  Spacing,
} from '../../src/constants/theme';
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
import { FACET_TONE } from '../../src/constants/facets';
import { safeClamp } from '../../src/utils/safeClamp';
import type { IngredientRating } from '../../src/services/ingredientDB';
import type { CompositeSignals } from '../../src/services/skinInsights';

const GOAL_LABELS: Record<string, string> = {
  acne: 'Acne management',
  sun_damage: 'Sun protection',
  skin_age: 'Skin age',
};

const FACET_FROM_SIGNAL: Record<keyof CompositeSignals, 'Hydrated' | 'Calm' | 'Even' | 'Firm' | 'Bounce'> = {
  hydration: 'Hydrated',
  inflammation: 'Calm',
  sunDamage: 'Even',
  structure: 'Firm',
  elasticity: 'Bounce',
};

const VERDICT_LABEL = (score: number) => {
  if (score >= 60) return 'Working for you';
  if (score >= 35) return 'Settling in';
  return 'Hard to say yet';
};

const VERDICT_BLURB = (score: number) => {
  if (score >= 75) return 'Your readings move with this in your routine. Stay the course.';
  if (score >= 60) return 'Holding a steady contribution to your goal. Keep it on the shelf.';
  if (score >= 35) return 'Early signal. A few more weeks of data will firm up the verdict.';
  return 'Not enough movement yet to credit this product.';
};

function tonesFor(seed: string): string {
  const tones = Object.values(FACET_TONE);
  const hash = Array.from(seed).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return tones[hash % tones.length];
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = Glow.palette;
  const insets = useSafeAreaInsets();

  const products = useStore((s) => s.products);
  const protocol = useStore((s) => s.protocol);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const modelOutputs = useStore((s) => s.modelOutputs);
  const ritualCompletions = useStore((s) => s.ritualCompletions);

  const product = products.find((p) => p.user_product_id === id);

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

  const ingredientRows = useMemo(() => {
    if (!product) return [];
    return product.ingredients_list.map((raw) => {
      const profile = matchIngredient(raw);
      return { raw, profile };
    });
  }, [product]);

  const relatedSignals = useMemo(() => {
    if (!effectiveness) return [] as { key: keyof CompositeSignals; net: number }[];
    const signalKeys: (keyof CompositeSignals)[] = ['structure', 'hydration', 'inflammation', 'sunDamage', 'elasticity'];
    const result: { key: keyof CompositeSignals; net: number }[] = [];
    for (const sKey of signalKeys) {
      let net = 0;
      for (const { profile } of effectiveness.matchedIngredients) {
        net += profile.signalRelevance[sKey];
      }
      if (net !== 0) result.push({ key: sKey, net });
    }
    return result.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [effectiveness]);

  // Pick the strongest-affected facet for the verdict + trend.
  const primaryFacetSignal = relatedSignals[0]?.key ?? 'hydration';
  const facetLabel = FACET_FROM_SIGNAL[primaryFacetSignal];

  // Build a trend series — facet score across recent reads.
  const trend = useMemo(() => {
    return modelOutputs.slice(-9).map((o) => {
      const ins = buildOverallSkinInsight({
        latestOutput: o,
        baselineOutput: baseline,
        latestDaily: getLatestDailyForOutput(o, dailyRecords),
        baselineDaily,
        serverSignalScores: o.signal_scores,
        serverSignalFeatures: o.signal_features,
        serverSignalConfidence: o.signal_confidence,
        serverLesions: o.lesions,
      });
      return Math.round(ins?.signals[primaryFacetSignal] ?? 0);
    });
  }, [modelOutputs, dailyRecords, baseline, baselineDaily, primaryFacetSignal]);

  // Compute "since you started" from the user-product start_date.
  const sinceLabel = useMemo(() => {
    if (!product?.start_date) return 'recent';
    const start = new Date(product.start_date);
    const diffWeeks = Math.max(1, Math.round((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 7)));
    if (diffWeeks === 1) return '1 week';
    return `${diffWeeks} weeks`;
  }, [product]);

  // Real use count from checked ritual product steps.
  const timesUsed = useMemo(() => {
    if (!product) return 0;
    const amId = `product:${product.user_product_id}:am`;
    const pmId = `product:${product.user_product_id}:pm`;
    return Object.values(ritualCompletions).reduce((count, day) => {
      return count + (day[amId] || day[pmId] ? 1 : 0);
    }, 0);
  }, [product, ritualCompletions]);

  if (!product) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: insets.top + Spacing.xl }}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <GlowIcon name="back" size={22} color={palette.ink} stroke={1.8} />
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.xl }}>
          <Text style={[s.heroTitle, { color: palette.ink }]}>Product not found</Text>
        </View>
      </View>
    );
  }

  const score = effectiveness ? safeClamp(Math.round(effectiveness.score)) : 0;
  const verdict = VERDICT_LABEL(score);
  const verdictBlurb = VERDICT_BLURB(score);
  const heartCount = Math.max(1, Math.round(score / 20));
  const tone = tonesFor(product.product_name);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
      showsVerticalScrollIndicator={false}
    >
      <FadeUp index={0}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <GlowIcon name="back" size={22} color={palette.ink} stroke={1.8} />
          </TouchableOpacity>
          <View style={{ width: 22 }} />
        </View>
      </FadeUp>

      {/* Hero — tone-tinted thumb + brand + name + hearts */}
      <FadeUp index={1}>
        <View style={s.heroOuter}>
          <LinearGradient
            colors={[tone, palette.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.heroThumb, { borderColor: palette.glow }]}
          />
          <View style={{ flex: 1, minWidth: 0, paddingBottom: 6 }}>
            {!!product.brand && (
              <Text style={[s.heroBrand, { color: palette.muted }]}>{product.brand.toUpperCase()}</Text>
            )}
            <Text style={[s.heroTitle, { color: palette.ink }]} numberOfLines={2}>
              {product.product_name}
            </Text>
            <Text style={[s.heroNotes, { color: palette.muted }]}>
              {product.usage_schedule === 'both' ? 'AM + PM' : product.usage_schedule}
            </Text>
            <View style={s.heroHearts}>
              {[1, 2, 3, 4, 5].map((n) => (
                <GlowIcon
                  key={n}
                  name="heart"
                  size={13}
                  color={n <= heartCount ? palette.accent : palette.glow}
                  stroke={1.6}
                  filled={n <= heartCount}
                />
              ))}
            </View>
          </View>
        </View>
      </FadeUp>

      {/* Verdict */}
      <FadeUp index={2}>
        <View style={s.section}>
          <View
            style={[
              s.verdictCard,
              { backgroundColor: palette.surface, borderColor: palette.glow },
            ]}
          >
            <View style={s.verdictBreathePos}>
              <BreathingGlow color={palette.accent} size={140} />
            </View>
            <View style={{ position: 'relative' }}>
              <Text style={[s.verdictEyebrow, { color: palette.muted }]}>OUR READ</Text>
              <Text style={[s.verdictTitle, { color: palette.accent }]}>{verdict}</Text>
              <Text style={[s.verdictBlurb, { color: palette.muted }]}>{verdictBlurb}</Text>
              <View style={s.statsRow}>
                <Stat palette={palette} label="On your shelf" value={sinceLabel} />
                <Stat palette={palette} label="Times used" value={String(timesUsed)} />
                <Stat palette={palette} label="Glow lift" value={`+${score}`} accent />
              </View>
            </View>
          </View>
        </View>
      </FadeUp>

      {/* Trend on primary facet */}
      {trend.length >= 2 && (
        <FadeUp index={3}>
          <View style={s.section}>
            <SectionHead
              title={`${facetLabel} since starting`}
              hint={sinceLabel}
              ink={palette.ink}
              muted={palette.muted}
            />
            <View style={[s.card, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
              <GlowSpark
                data={trend}
                color={palette.accent}
                width={296}
                height={70}
              />
              <View style={s.trendDates}>
                <Text style={[s.trendLabel, { color: palette.muted }]}>start</Text>
                <Text style={[s.trendLabel, { color: palette.muted }]}>today</Text>
              </View>
            </View>
          </View>
        </FadeUp>
      )}

      {/* Before / now */}
      <FadeUp index={4}>
        <View style={s.section}>
          <SectionHead
            title="Before & now"
            hint={`${sinceLabel} apart`}
            ink={palette.ink}
            muted={palette.muted}
          />
          <View style={s.beforeNowRow}>
            {[
              { label: 'Before', tone: '#3a2e35', score: trend[0] ?? 0 },
              { label: 'Now', tone: '#5a4a52', score: trend[trend.length - 1] ?? score },
            ].map((b, i) => (
              <View key={i} style={{ flex: 1 }}>
                <LinearGradient
                  colors={[b.tone, palette.bg]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[s.beforeNowTile, { borderColor: palette.glow }]}
                >
                  <View style={[s.beforeNowPill, { backgroundColor: palette.ink + 'cc' }]}>
                    <Text style={[s.beforeNowPillText, { color: palette.surface }]}>
                      {b.label.toUpperCase()}
                    </Text>
                  </View>
                </LinearGradient>
                <Text style={[s.beforeNowCaption, { color: palette.muted }]}>
                  {facetLabel}{' '}
                  <Text style={{ fontFamily: FontFamily.sansSemiBold, color: palette.ink }}>
                    {b.score}
                  </Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      </FadeUp>

      {/* Ingredients */}
      <FadeUp index={5}>
        <View style={s.section}>
          <SectionHead
            title="Ingredients"
            hint={`${ingredientRows.length} listed`}
            ink={palette.ink}
            muted={palette.muted}
          />
          <View style={[s.card, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
            {ingredientRows.map((row, idx) => {
              const dotColor = row.profile ? ratingTone(row.profile.rating, palette) : palette.muted;
              const desc = row.profile ? row.profile.description : 'Not in our database';
              return (
                <View
                  key={`${row.raw}-${idx}`}
                  style={[
                    s.ingredientRow,
                    idx < ingredientRows.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: palette.bg,
                    },
                  ]}
                >
                  <View style={[s.ingredientDot, { backgroundColor: dotColor }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={[s.ingredientName, { color: palette.ink }]}
                      numberOfLines={2}
                    >
                      {row.raw}
                    </Text>
                    <Text style={[s.ingredientDesc, { color: palette.muted }]} numberOfLines={2}>
                      {desc}
                    </Text>
                  </View>
                </View>
              );
            })}
            <Text style={[s.disclaimer, { color: palette.muted }]}>
              Ingredient references are shown for transparency. Glowlytics guidance is informational only.
            </Text>
          </View>
        </View>
      </FadeUp>

      {/* Goal alignment + summary */}
      <FadeUp index={6}>
        <View style={s.section}>
          <SectionHead
            title={`How this helps your ${GOAL_LABELS[primaryGoal] ?? primaryGoal}`}
            hint={`${score} match`}
            ink={palette.ink}
            muted={palette.muted}
          />
          <View style={[s.card, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
            <View style={[s.alignmentTrack, { backgroundColor: palette.bg }]}>
              <View
                style={{
                  height: '100%',
                  width: `${score}%`,
                  backgroundColor: palette.accent,
                }}
              />
            </View>
            <Text style={[s.alignmentBlurb, { color: palette.ink }]}>{blurb}</Text>
            {effectiveness && effectiveness.topContributors.length > 0 && (
              <Text style={[s.alignmentMeta, { color: palette.muted }]}>
                Top contributors · {effectiveness.topContributors.join(', ')}
                {effectiveness.concerns.length > 0
                  ? `. Watch for ${effectiveness.concerns.join(', ')}.`
                  : ''}
              </Text>
            )}
          </View>
        </View>
      </FadeUp>

      {/* Tips */}
      {tips.length > 0 && (
        <FadeUp index={7}>
          <View style={s.section}>
            <SectionHead title="Use it well" hint={`${tips.length} tips`} ink={palette.ink} muted={palette.muted} />
            <View style={{ gap: 8, marginTop: 12 }}>
              {tips.map((tip, i) => (
                <View
                  key={i}
                  style={[s.tipRow, { backgroundColor: palette.surface, borderColor: palette.glow }]}
                >
                  <View style={[s.tipDot, { backgroundColor: palette.accent }]} />
                  <Text style={[s.tipText, { color: palette.ink }]}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>
        </FadeUp>
      )}

      {/* Actions */}
      <FadeUp index={7}>
        <View style={[s.section, { gap: 10 }]}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[s.primaryCta, { backgroundColor: palette.ink }]}
          >
            <Text style={[s.primaryCtaText, { color: palette.surface }]}>
              Re-order from {product.brand || 'this brand'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[s.secondaryCta, { borderColor: palette.glow }]}
          >
            <Text style={[s.secondaryCtaText, { color: palette.ink }]}>Pause for a week</Text>
          </TouchableOpacity>
        </View>
      </FadeUp>
    </ScrollView>
  );
}

function ratingTone(rating: IngredientRating, palette: typeof Glow.palette): string {
  switch (rating) {
    case 'highly_beneficial':
    case 'beneficial':
      return palette.accent;
    case 'neutral':
      return palette.muted;
    case 'potentially_concerning':
    case 'concerning':
      return Colors.warning;
  }
}

function Stat({
  palette,
  label,
  value,
  accent,
}: {
  palette: typeof Glow.palette;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontFamily: FontFamily.sans,
          fontSize: 22,
          color: accent ? palette.accent : palette.ink,
          lineHeight: 24,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: FontFamily.sansMedium,
          fontSize: 10,
          color: palette.muted,
          letterSpacing: 0.6,
          marginTop: 4,
        }}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  headerRow: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroOuter: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 18,
  },
  heroThumb: {
    width: 96,
    height: 124,
    borderRadius: 16,
    borderWidth: 1,
  },
  heroBrand: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontFamily: FontFamily.sans,
    fontSize: 26,
    lineHeight: 30,
    marginTop: 4,
  },
  heroNotes: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    marginTop: 6,
  },
  heroHearts: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 8,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  verdictCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    overflow: 'hidden',
  },
  verdictBreathePos: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 140,
    height: 140,
    opacity: 0.4,
  },
  verdictEyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  verdictTitle: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 26,
    lineHeight: 32,
    marginTop: 6,
  },
  verdictBlurb: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 18,
  },
  card: {
    marginTop: 12,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  trendDates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  trendLabel: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
  },
  beforeNowRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  beforeNowTile: {
    aspectRatio: 3 / 4,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  beforeNowPill: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  beforeNowPillText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  beforeNowCaption: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
  },
  ingredientDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  ingredientName: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
  },
  ingredientDesc: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  disclaimer: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
    fontStyle: 'italic',
  },
  alignmentTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  alignmentBlurb: {
    fontFamily: FontFamily.sans,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
  },
  alignmentMeta: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    marginTop: 8,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  tipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tipText: {
    flex: 1,
    fontFamily: FontFamily.sans,
    fontSize: 14,
    lineHeight: 21,
  },
  primaryCta: {
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  primaryCtaText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
  },
  secondaryCta: {
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryCtaText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 14,
  },
});
