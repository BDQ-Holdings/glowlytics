import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowIcon } from '../../src/components/glow/GlowIcons';
import { FadeUp } from '../../src/components/glow/GlowPrimitives';
import { AddProductSheet } from '../../src/components/AddProductSheet';
import { FocusFade } from '../../src/components/FocusFade';
import {
  BorderRadius,
  Colors,
  FontFamily,
  Glow,
  Spacing,
} from '../../src/constants/theme';
import { FACET_TONE, type GlowFacetKey } from '../../src/constants/facets';
import { useStore } from '../../src/store/useStore';
import { trackEvent } from '../../src/services/analytics';
import { computeProductEffectiveness } from '../../src/services/ingredientDB';
import {
  buildOverallSkinInsight,
  getLatestDailyForOutput,
} from '../../src/services/skinInsights';

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

function spelledCount(n: number): string {
  if (n < 0) return '0';
  if (n <= 10) return NUMBER_WORDS[n];
  return String(n);
}

function tonesFor(index: number, productName: string): string {
  // Stable pseudo-random tone based on product name hash → keeps tones stable across renders.
  const tones = Object.values(FACET_TONE);
  const hash = Array.from(productName).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return tones[(hash + index) % tones.length];
}

export default function ShelfTab() {
  const router = useRouter();
  const palette = Glow.palette;
  const insets = useSafeAreaInsets();
  const products = useStore((s) => s.products);
  const protocol = useStore((s) => s.protocol);
  const modelOutputs = useStore((s) => s.modelOutputs);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const addProductTrigger = useStore((s) => s.openAddProductTrigger);
  const lastSeenTrigger = useRef(addProductTrigger);

  // Open the AddProductSheet whenever the cross-component trigger increments
  // (the tab-bar camera FAB calls `requestAddProduct()` from the Shelf tab).
  // Counter, not boolean: a second press while the sheet is open re-opens it.
  useEffect(() => {
    if (addProductTrigger === lastSeenTrigger.current) return;
    lastSeenTrigger.current = addProductTrigger;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackEvent('product_add_sheet_opened', { source: 'camera_fab' });
    setShowAddSheet(true);
  }, [addProductTrigger]);

  const overallInsight = useMemo(() => {
    const latest = modelOutputs[modelOutputs.length - 1] ?? null;
    const baseline = modelOutputs[0] ?? null;
    return buildOverallSkinInsight({
      latestOutput: latest,
      baselineOutput: baseline,
      latestDaily: getLatestDailyForOutput(latest, dailyRecords),
      baselineDaily: getLatestDailyForOutput(baseline, dailyRecords),
      serverSignalScores: latest?.signal_scores,
      serverSignalFeatures: latest?.signal_features,
      serverSignalConfidence: latest?.signal_confidence,
      serverLesions: latest?.lesions,
    });
  }, [modelOutputs, dailyRecords]);

  const scored = useMemo(() => {
    if (!protocol?.primary_goal) return products.map((p) => ({ product: p, score: 0 }));
    return products.map((p) => {
      const r = computeProductEffectiveness(p, protocol.primary_goal, overallInsight?.signals);
      return { product: p, score: r.score };
    });
  }, [products, protocol, overallInsight]);

  const workingCount = scored.filter((s) => s.score >= 50).length;

  const openAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackEvent('product_add_sheet_opened', { source: 'shelf_tab' });
    setShowAddSheet(true);
  };

  return (
    <FocusFade>
      <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.xl,
        paddingBottom: insets.bottom + 120,
      }}
      showsVerticalScrollIndicator={false}
    >
      <FadeUp index={0}>
        <View style={s.header}>
          <Text style={[s.eyebrow, { color: palette.muted }]}>YOUR SHELF</Text>
          <Text style={[s.title, { color: palette.ink }]}>
            <Text style={[s.titleAccent, { color: palette.ink }]}>
              {products.length === 0 ? 'Empty' : spelledCount(workingCount || products.length)}
            </Text>
            {products.length === 0 ? ' — start with one' : ' things working'}
          </Text>
          <Text style={[s.subtitle, { color: palette.muted }]}>
            Tap any product to see how it shows up in your patterns.
          </Text>
        </View>
      </FadeUp>

      <View style={s.list}>
        {scored.length === 0 ? (
          <FadeUp index={1}>
            <View style={[s.empty, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
              <Text style={[s.emptyTitle, { color: palette.ink }]}>
                No products yet
              </Text>
              <Text style={[s.emptyBody, { color: palette.muted }]}>
                Add the things you actually use. We'll watch how they show up in your readings.
              </Text>
            </View>
          </FadeUp>
        ) : (
          scored.map(({ product, score }, i) => {
            const tone = tonesFor(i, product.product_name);
            const heartCount = Math.max(1, Math.round(score / 20));
            return (
              <FadeUp key={product.user_product_id} index={Math.min(1 + i, 5)}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: '/product/[id]',
                      params: { id: product.user_product_id },
                    })
                  }
                  style={[s.card, { backgroundColor: palette.surface, borderColor: palette.glow }]}
                >
                  <LinearGradient
                    colors={[tone, palette.surface]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[s.thumb, { borderColor: palette.glow }]}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {!!product.brand && (
                      <Text style={[s.brand, { color: palette.muted }]}>
                        {product.brand.toUpperCase()}
                      </Text>
                    )}
                    <Text
                      style={[s.name, { color: palette.ink }]}
                      numberOfLines={1}
                    >
                      {product.product_name}
                    </Text>
                    <Text style={[s.role, { color: palette.muted }]}>
                      {product.usage_schedule || 'Both'}
                    </Text>
                  </View>
                  <View style={s.hearts}>
                    {[1, 2, 3, 4, 5].map((n) => {
                      const filled = n <= heartCount;
                      return (
                        <GlowIcon
                          key={n}
                          name="heart"
                          size={11}
                          color={filled ? palette.accent : palette.glow}
                          stroke={1.6}
                          filled={filled}
                        />
                      );
                    })}
                  </View>
                </TouchableOpacity>
              </FadeUp>
            );
          })
        )}
      </View>

      <FadeUp index={6}>
        <View style={{ paddingHorizontal: Spacing.lg, marginTop: 24 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={openAdd}
            style={[s.addCta, { borderColor: palette.muted }]}
          >
            <GlowIcon name="plus" size={16} color={palette.ink} stroke={1.8} />
            <Text style={[s.addCtaText, { color: palette.ink }]}>Add a product</Text>
          </TouchableOpacity>

          {products.length > 0 && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/routine' as any)}
              style={[s.routineCta]}
            >
              <Text style={[s.routineCtaText, { color: palette.muted }]}>
                See routine score & conflicts
              </Text>
              <GlowIcon name="arrow" size={13} color={palette.muted} stroke={1.7} />
            </TouchableOpacity>
          )}
        </View>
      </FadeUp>

      {showAddSheet && (
        <AddProductSheet
          visible={showAddSheet}
          onClose={() => setShowAddSheet(false)}
        />
      )}
    </ScrollView>
    </FocusFade>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  eyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 13,
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: FontFamily.sans,
    fontSize: 32,
    lineHeight: 38,
    marginTop: 4,
  },
  titleAccent: {
    fontFamily: FontFamily.accent,
    fontSize: 38,
  },
  subtitle: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    gap: 10,
  },
  empty: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  emptyTitle: {
    fontFamily: FontFamily.sans,
    fontSize: 18,
  },
  emptyBody: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  thumb: {
    width: 56,
    height: 72,
    borderRadius: 12,
    borderWidth: 1,
  },
  brand: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  name: {
    fontFamily: FontFamily.sans,
    fontSize: 18,
    marginTop: 2,
  },
  role: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    marginTop: 4,
  },
  hearts: {
    flexDirection: 'row',
    gap: 2,
  },
  addCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addCtaText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
  },
  routineCta: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  routineCtaText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 12,
  },
});
