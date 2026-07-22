import React, { useMemo, useState } from 'react';
import { Alert, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowIcon, type GlowIconName } from '../../src/components/glow/GlowIcons';
import { FadeUp } from '../../src/components/glow/GlowPrimitives';
import { ProgressDots } from '../../src/components/ProgressDots';
import { ProductCard } from '../../src/components/ProductCard';
import { AddProductSheet } from '../../src/components/AddProductSheet';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Glow, FontFamily, Spacing } from '../../src/constants/theme';
import { ONBOARDING_PROGRESS_DOT_COUNT } from '../../src/services/onboardingFlow';
import { activeProducts } from '../../src/services/ritual';

// Add-product methods surfaced as shelf cards. Both wire to the screen's one
// real entry point — the AddProductSheet — via its `initialMode` prop:
// scanning jumps to the label-photo flow, search to the by-name flow. The
// handoff's third "Browse popular" row has no backing action here, so it is
// intentionally omitted.
type ShelfMethod = {
  mode: 'photo' | 'search';
  icon: GlowIconName;
  title: string;
  body: string;
  fastest?: boolean;
};

const METHODS: ShelfMethod[] = [
  { mode: 'photo',  icon: 'camera', title: 'Scan a bottle',  body: 'Point at the label — we read the rest.', fastest: true },
  { mode: 'search', icon: 'search', title: 'Search by name', body: 'Type a brand or product.' },
];

export default function Products() {
  const { advance, goBack, onboardingFlowIndex } = useOnboardingNavigation();
  const insets = useSafeAreaInsets();
  const P = Glow.palette;

  const allProducts = useStore((s) => s.products);
  const products = useMemo(() => activeProducts(allProducts), [allProducts]);
  const removeProduct = useStore((s) => s.removeProduct);

  const [showSheet, setShowSheet] = useState(false);
  const [sheetMode, setSheetMode] = useState<'photo' | 'search'>('photo');

  const openSheet = (mode: 'photo' | 'search') => {
    setSheetMode(mode);
    setShowSheet(true);
  };

  const confirmRemove = (id: string, name: string) =>
    Alert.alert('Remove product?', name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeProduct(id) },
    ]);

  const hasProducts = products.length > 0;
  // Stagger slot offset so method rows fall after the heading (and the product
  // list, when present).
  const methodBase = hasProducts ? 2 : 1;

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: P.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 },
      ]}
    >
      {/* Header chrome — back + step dots. Skip lives in the bottom pill. */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={goBack}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <GlowIcon name="back" size={20} color={P.ink} stroke={1.8} />
        </TouchableOpacity>
        <View style={styles.dotsWrap}>
          <ProgressDots total={ONBOARDING_PROGRESS_DOT_COUNT} current={Math.max(onboardingFlowIndex - 1, 0)} />
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <FadeUp index={0}>
          <Text style={[styles.heading, { color: P.ink }]}>What's on{'\n'}your shelf?</Text>
          <Text style={[styles.sub, { color: P.muted }]}>
            Add what you use now — or leave it empty and build as you go.
          </Text>
        </FadeUp>

        {hasProducts && (
          <FadeUp index={1}>
            <View style={styles.productList}>
              {products.map((p) => (
                <ProductCard
                  key={p.user_product_id}
                  product={p}
                  onPress={() => confirmRemove(p.user_product_id, p.product_name)}
                />
              ))}
            </View>
          </FadeUp>
        )}

        <View style={styles.methods}>
          {METHODS.map((m, i) => (
            <FadeUp key={m.mode} index={methodBase + i}>
              <TouchableOpacity
                style={[styles.methodCard, { backgroundColor: P.surface, borderColor: P.glow }]}
                activeOpacity={0.85}
                onPress={() => openSheet(m.mode)}
                accessibilityRole="button"
                accessibilityLabel={m.title}
              >
                <View style={[styles.iconTile, { backgroundColor: P.bg }]}>
                  <GlowIcon name={m.icon} size={20} color={P.accent} stroke={1.6} />
                </View>
                <View style={styles.methodText}>
                  <View style={styles.methodTitleRow}>
                    <Text style={[styles.methodTitle, { color: P.ink }]}>{m.title}</Text>
                    {m.fastest && (
                      <View style={[styles.fastChip, { backgroundColor: P.accent + '18' }]}>
                        <Text style={[styles.fastChipText, { color: P.accent }]}>fastest</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.methodBody, { color: P.muted }]}>{m.body}</Text>
                </View>
                <GlowIcon name="chevron" size={16} color={P.muted} stroke={1.6} />
              </TouchableOpacity>
            </FadeUp>
          ))}

          <FadeUp index={methodBase + METHODS.length}>
            <Text style={[styles.microcopy, { color: P.muted }]}>
              <Text style={[styles.microcopyEm, { color: P.muted }]}>Three to five is plenty</Text>
              {' to start. Most people add their fifth in week two.'}
            </Text>
          </FadeUp>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.ghostPill, { borderColor: P.glow }]}
          activeOpacity={0.86}
          onPress={advance}
          accessibilityRole="button"
          accessibilityLabel="I'll do this later"
        >
          <Text style={[styles.ghostPillText, { color: P.ink }]}>I'll do this later</Text>
        </TouchableOpacity>
      </View>

      <AddProductSheet visible={showSheet} initialMode={sheetMode} onClose={() => setShowSheet(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 4,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dotsWrap: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 36 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  heading: {
    fontFamily: FontFamily.serifItalic,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.5,
    paddingHorizontal: 4,
  },
  sub: {
    fontFamily: FontFamily.sans,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  productList: { gap: Spacing.sm, marginTop: 20 },
  methods: { marginTop: 20, gap: 10 },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  iconTile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  methodText: { flex: 1, minWidth: 0 },
  methodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  methodTitle: { fontFamily: FontFamily.sansSemiBold, fontSize: 15 },
  fastChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  fastChipText: { fontFamily: FontFamily.sansMedium, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  methodBody: { fontFamily: FontFamily.sans, fontSize: 12, lineHeight: 16, marginTop: 2 },
  microcopy: { fontFamily: FontFamily.sans, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8 },
  microcopyEm: { fontFamily: FontFamily.serifItalic },
  footer: { paddingHorizontal: 24, paddingTop: 12 },
  ghostPill: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  ghostPillText: { fontFamily: FontFamily.sansMedium, fontSize: 14 },
});
