import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router as globalRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowIcon } from '../src/components/glow/GlowIcons';
import { FadeUp, GlowRing, SectionHead } from '../src/components/glow/GlowPrimitives';
import { AddProductSheet } from '../src/components/AddProductSheet';
import {
  FontFamily,
  Glow,
  Spacing,
} from '../src/constants/theme';
import { useStore } from '../src/store/useStore';
import { buildRitualSteps, type RitualSection, type RitualStep } from '../src/services/ritual';
import { localDateStr } from '../src/utils/localDate';
import { trackEvent } from '../src/services/analytics';

const SECTION_TITLES: Record<RitualSection, string> = {
  morning: 'Morning',
  evening: 'Evening',
  allday: 'All day',
};

const SECTION_ORDER: RitualSection[] = ['morning', 'allday', 'evening'];

export default function RitualScreen() {
  const router = globalRouter;
  const palette = Glow.palette;
  const insets = useSafeAreaInsets();
  const products = useStore((s) => s.products);
  const ritualCompletions = useStore((s) => s.ritualCompletions);
  const toggleRitualStep = useStore((s) => s.toggleRitualStep);
  const removeProduct = useStore((s) => s.removeProduct);
  const [showAddSheet, setShowAddSheet] = useState(false);

  const today = localDateStr(new Date());
  const steps = useMemo(() => buildRitualSteps(products, today, Object.keys(ritualCompletions[today] ?? {})), [products, today, ritualCompletions]);
  const dayCompletions = ritualCompletions[today] ?? {};

  const grouped = useMemo(() => {
    const map: Record<RitualSection, RitualStep[]> = { morning: [], evening: [], allday: [] };
    for (const step of steps) map[step.section].push(step);
    return map;
  }, [steps]);

  const done = steps.filter((st) => dayCompletions[st.id]).length;
  const total = steps.length;
  const remaining = total - done;
  const pct = total === 0 ? 0 : (done / total) * 100;

  const ringSummary =
    total === 0
      ? 'Build your shelf.'
      : remaining === 0
        ? 'Complete.'
        : `${remaining} small thing${remaining > 1 ? 's' : ''} left.`;

  const ringDetail =
    total === 0
      ? 'Add products on the Shelf and they show up here.'
      : 'No rush. The streak waits.';

  const handleToggle = (stepId: string) => {
    Haptics.selectionAsync();
    toggleRitualStep(stepId, today);
  };

  const openAddSheet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackEvent('product_add_sheet_opened', { source: 'ritual_screen' });
    setShowAddSheet(true);
  };

  const handleRemoveProduct = (step: RitualStep) => {
    if (step.source !== 'product') return;
    // step.id shape: `product:<user_product_id>:am|pm`
    const userProductId = step.id.split(':')[1];
    if (!userProductId) return;
    Alert.alert(
      `Remove ${step.title}?`,
      'This removes it from your shelf and tomorrow\'s ritual. Past check-ins stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            removeProduct(userProductId);
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.xl,
        paddingBottom: insets.bottom + 40,
      }}
      showsVerticalScrollIndicator={false}
    >
      <FadeUp index={0}>
        <View style={s.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <GlowIcon name="back" size={22} color={palette.ink} stroke={1.8} />
          </TouchableOpacity>
          <Text style={[s.title, { color: palette.ink }]}>Today's ritual</Text>
        </View>
      </FadeUp>

      <FadeUp index={1}>
        <View style={s.heroOuter}>
          <LinearGradient
            colors={[palette.surface, palette.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.heroCard, { borderColor: palette.glow }]}
          >
            <GlowRing
              size={92}
              stroke={6}
              value={pct}
              color={palette.accent}
              track={palette.glow}
            >
              <Text style={[s.ringText, { color: palette.ink }]}>{done}/{total}</Text>
            </GlowRing>
            <View style={{ flex: 1, marginLeft: 18 }}>
              <Text style={[s.ringSummary, { color: palette.ink }]}>{ringSummary}</Text>
              <Text style={[s.ringDetail, { color: palette.muted }]}>{ringDetail}</Text>
            </View>
          </LinearGradient>
        </View>
      </FadeUp>

      {total === 0 ? (
        <FadeUp index={2}>
          <View style={s.emptyOuter}>
            <View style={[s.emptyCard, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
              <Text style={[s.emptyTitle, { color: palette.ink }]}>
                Nothing on your shelf yet
              </Text>
              <Text style={[s.emptyBody, { color: palette.muted }]}>
                Add the things you actually use and we'll line them up by AM / PM so you can check them off here.
              </Text>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={openAddSheet}
                style={[s.emptyCta, { backgroundColor: palette.ink }]}
              >
                <GlowIcon name="plus" size={16} color={palette.surface} stroke={1.8} />
                <Text style={[s.emptyCtaText, { color: palette.surface }]}>
                  Add a product
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </FadeUp>
      ) : (
        SECTION_ORDER.map((section, sIndex) => {
          const sectionSteps = grouped[section];
          if (sectionSteps.length === 0) return null;
          const sectionDone = sectionSteps.filter((st) => dayCompletions[st.id]).length;
          return (
            <FadeUp key={section} index={Math.min(2 + sIndex, 5)}>
              <View style={s.sectionWrap}>
                <SectionHead
                  title={SECTION_TITLES[section]}
                  hint={`${sectionDone}/${sectionSteps.length}`}
                  ink={palette.ink}
                  muted={palette.muted}
                />
                <View style={{ marginTop: 12, gap: 8 }}>
                  {sectionSteps.map((step) => {
                    const isDone = Boolean(dayCompletions[step.id]);
                    return (
                      <TouchableOpacity
                        key={step.id}
                        activeOpacity={0.85}
                        onPress={() => handleToggle(step.id)}
                        onLongPress={
                          step.source === 'product'
                            ? () => handleRemoveProduct(step)
                            : undefined
                        }
                        delayLongPress={400}
                        style={[
                          s.item,
                          {
                            backgroundColor: palette.surface,
                            borderColor: palette.glow,
                            opacity: isDone ? 0.6 : 1,
                          },
                        ]}
                      >
                        <View
                          style={[
                            s.dot,
                            isDone
                              ? { backgroundColor: palette.accent, borderWidth: 0 }
                              : { borderColor: palette.muted, borderWidth: 1.5 },
                          ]}
                        >
                          {isDone && (
                            <GlowIcon name="check" size={16} color={palette.surface} stroke={2} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              s.itemTitle,
                              { color: palette.ink },
                              isDone && { textDecorationLine: 'line-through' },
                            ]}
                          >
                            {step.title}
                          </Text>
                          {!!step.subtitle && (
                            <Text
                              style={[s.itemCopy, { color: palette.muted }]}
                              numberOfLines={1}
                            >
                              {step.subtitle}
                            </Text>
                          )}
                        </View>
                        <Text style={[s.itemTime, { color: palette.muted }]}>{step.time}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </FadeUp>
          );
        })
      )}

      {total > 0 && (
        <FadeUp index={5}>
          <View style={s.footerWrap}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={openAddSheet}
              style={[s.addCta, { borderColor: palette.muted }]}
            >
              <GlowIcon name="plus" size={16} color={palette.ink} stroke={1.8} />
              <Text style={[s.addCtaText, { color: palette.ink }]}>Add a product</Text>
            </TouchableOpacity>
            <Text style={[s.footerHint, { color: palette.muted }]}>
              Long-press a product to remove it. New products land in tomorrow's ritual instantly.
            </Text>
          </View>
        </FadeUp>
      )}

      {showAddSheet && (
        <AddProductSheet
          visible={showAddSheet}
          onClose={() => setShowAddSheet(false)}
        />
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  headerRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 24,
  },
  heroOuter: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ringText: {
    fontFamily: FontFamily.sans,
    fontSize: 24,
  },
  ringSummary: {
    fontFamily: FontFamily.sans,
    fontSize: 22,
    lineHeight: 26,
  },
  ringDetail: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    marginTop: 6,
  },
  sectionWrap: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  item: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 15,
  },
  itemCopy: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    marginTop: 2,
  },
  itemTime: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  emptyOuter: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  emptyCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  emptyTitle: {
    fontFamily: FontFamily.sans,
    fontSize: 20,
    lineHeight: 26,
  },
  emptyBody: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  emptyCta: {
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyCtaText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
  },
  footerWrap: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  addCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 999,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addCtaText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
  },
  footerHint: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 12,
  },
});
