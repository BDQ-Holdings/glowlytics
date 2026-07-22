// app/considering.tsx
//
// Considering — the persisted "save to your considering list" surface. The
// advise-only advisor endpoint (saveToConsidering) writes here; this screen is
// the destination that finally renders it. List the saved products, remove one
// (removeFromConsidering), or open a read-only DeepDive of the saved verdict.
// Advice only — there is no cart. Glow design system, ported row style from the
// advisor CompareTable/Recap surfaces.

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useStore } from '../src/store/useStore';
import { ProductThumb } from '../src/components/advisor/ProductThumb';
import { VerdictMark } from '../src/components/advisor/VerdictMark';
import { DeepDive } from '../src/components/advisor/DeepDive';
import { GlowIcon } from '../src/components/glow/GlowIcons';
import { FadeUp } from '../src/components/glow/GlowPrimitives';
import { FontFamily, Glow } from '../src/constants/theme';

export default function ConsideringScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = Glow.palette;

  const consideringList = useStore((s) => s.consideringList);
  const removeFromConsidering = useStore((s) => s.removeFromConsidering);

  // When set, show a read-only DeepDive of the saved result instead of the list.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? consideringList.find((c) => c.id === detailId) ?? null : null;

  if (detail) {
    return (
      <DeepDive
        result={detail.result}
        readOnly
        onBack={() => setDetailId(null)}
        palette={palette}
      />
    );
  }

  const remove = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    removeFromConsidering(id);
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={styles.backBtn}
        >
          <GlowIcon name="back" size={18} color={palette.muted} stroke={1.8} />
          <Text style={[styles.backText, { color: palette.muted }]}>Back</Text>
        </Pressable>
        <Text style={[styles.count, { color: palette.muted }]}>
          CONSIDERING · {consideringList.length}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 50 + insets.bottom }}
      >
        <FadeUp index={0} delay={0} style={styles.intro}>
          <Text style={[styles.title, { color: palette.ink }]}>Your shortlist</Text>
          <Text style={[styles.sub, { color: palette.ink + 'B3' }]}>
            Products you saved to weigh later. Tap any to revisit the read.
          </Text>
        </FadeUp>

        {consideringList.length === 0 ? (
          <FadeUp index={1} delay={0} style={styles.emptyWrap}>
            <Text style={[styles.emptyTitle, { color: palette.ink }]}>Nothing saved yet</Text>
            <Text style={[styles.emptyBody, { color: palette.muted }]}>
              Deliberating in the aisle is a skill. Scan a product in the advisor and tap &ldquo;Save to considering&rdquo; and we’ll hold it here.
            </Text>
            <Pressable
              onPress={() => router.replace('/shop-advisor')}
              accessibilityRole="button"
              accessibilityLabel="Open the shopping advisor"
              style={[styles.cta, { backgroundColor: palette.accent }]}
            >
              <GlowIcon name="camera" size={17} color={palette.surface} stroke={1.8} />
              <Text style={[styles.ctaText, { color: palette.surface }]}>Scan a product</Text>
            </Pressable>
          </FadeUp>
        ) : (
          <FadeUp index={1} delay={0} style={styles.list}>
            {consideringList.map((it) => (
              <View
                key={it.id}
                style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.glow }]}
              >
                <Pressable
                  onPress={() => setDetailId(it.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${it.name}, ${it.verdict}. View details`}
                  style={styles.rowMain}
                >
                  <ProductThumb
                    imageUrl={it.result.product.image_url}
                    tone={palette.glow}
                    w={48}
                    h={62}
                    r={11}
                    palette={palette}
                  />
                  <View style={styles.rowText}>
                    {!!it.brand && (
                      <Text style={[styles.rowBrand, { color: palette.muted }]} numberOfLines={1}>
                        {it.brand.toUpperCase()}
                      </Text>
                    )}
                    <Text style={[styles.rowName, { color: palette.ink }]} numberOfLines={2}>
                      {it.name}
                    </Text>
                    <View style={styles.rowChip}>
                      <VerdictMark verdict={it.verdict} variant="chip" size="sm" palette={palette} />
                    </View>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => remove(it.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${it.name} from considering`}
                  hitSlop={8}
                  style={[styles.removeBtn, { borderColor: palette.glow }]}
                >
                  <GlowIcon name="x" size={16} color={palette.muted} stroke={2} />
                </Pressable>
              </View>
            ))}
          </FadeUp>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 90,
  },
  backText: {
    fontSize: 14,
  },
  count: {
    fontSize: 11,
    letterSpacing: 1,
  },
  headerSpacer: {
    width: 90,
  },
  intro: {
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  title: {
    fontSize: 26,
    lineHeight: 30,
    fontFamily: FontFamily.sans,
  },
  sub: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  emptyWrap: {
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: FontFamily.sans,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  cta: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  ctaText: {
    fontSize: 14,
    fontFamily: FontFamily.sansMedium,
  },
  list: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minWidth: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowBrand: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  rowName: {
    fontSize: 14,
    lineHeight: 18,
    marginTop: 1,
    fontFamily: FontFamily.sansMedium,
  },
  rowChip: {
    marginTop: 8,
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
