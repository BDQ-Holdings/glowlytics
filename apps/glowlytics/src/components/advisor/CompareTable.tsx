import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VerdictMark } from './VerdictMark';
import { ProductThumb } from './ProductThumb';
import { fitMeta } from './fitMeta';
import { FadeUp } from '../glow/GlowPrimitives';
import { GlowIcon } from '../glow/GlowIcons';
import { FontFamily } from '../../constants/theme';
import type { GlowPalette } from '../../constants/theme';
import type { ConsideringItem, ShoppingVerdict } from '../../types';

/**
 * Compare table — the considering list read side by side. Each row is a product
 * with its verdict chip + match score; the strongest pick gets a "Best for you"
 * frame. Tap a row to dig in. Pure presentational.
 */
export interface CompareTableProps {
  items: ConsideringItem[];
  onOpen: (id: string) => void;
  onBack: () => void;
  onScanMore: () => void;
  onRecap: () => void;
  palette: GlowPalette;
}

const RANK: Record<ShoppingVerdict, number> = { buy: 0, maybe: 1, skip: 2 };

export const CompareTable: React.FC<CompareTableProps> = ({
  items,
  onOpen,
  onBack,
  onScanMore,
  onRecap,
  palette,
}) => {
  const insets = useSafeAreaInsets();

  const best = items.length
    ? [...items].sort(
        (a, b) => RANK[a.verdict] - RANK[b.verdict] || b.score - a.score,
      )[0]
    : null;

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to camera" hitSlop={8} style={styles.backBtn}>
          <GlowIcon name="back" size={16} color={palette.muted} stroke={1.8} />
          <Text style={[styles.backText, { color: palette.muted }]}>Camera</Text>
        </Pressable>
        <Text style={[styles.count, { color: palette.muted }]}>
          CONSIDERING · {items.length}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
      >
        <FadeUp index={0} style={styles.intro}>
          <Text style={[styles.title, { color: palette.ink }]}>Side by side</Text>
          <Text style={[styles.sub, { color: palette.ink + 'B3' }]}>
            Your picks, ranked for fit. Tap any to dig in.
          </Text>
        </FadeUp>

        {items.length === 0 ? (
          <FadeUp index={1} style={styles.emptyWrap}>
            <Text style={[styles.empty, { color: palette.muted }]}>
              Nothing scanned yet. Scan a few products and they'll line up here.
            </Text>
          </FadeUp>
        ) : (
          <FadeUp index={1} style={styles.list}>
            {items.map((it) => {
              const isBest = best?.id === it.id;
              const m = fitMeta(it.verdict, palette);
              return (
                <Pressable
                  key={it.id}
                  onPress={() => onOpen(it.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${it.name}, ${it.verdict}, match ${it.score}. View details`}
                  style={[
                    styles.row,
                    {
                      backgroundColor: palette.surface,
                      borderColor: isBest ? palette.accent : palette.glow,
                      borderWidth: isBest ? 1.5 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  {isBest && (
                    <View style={[styles.bestBadge, { backgroundColor: palette.accent }]}>
                      <Text style={[styles.bestBadgeText, { color: palette.surface }]}>
                        BEST FOR YOU
                      </Text>
                    </View>
                  )}
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
                  <View style={styles.scoreCol}>
                    <Text style={[styles.score, { color: m.textColor }]}>{it.score}</Text>
                    <Text style={[styles.scoreLabel, { color: palette.muted }]}>match</Text>
                  </View>
                </Pressable>
              );
            })}

            {/* Scan more */}
            <Pressable
              onPress={onScanMore}
              accessibilityRole="button"
              accessibilityLabel="Scan more"
              style={[styles.scanMore, { borderColor: palette.muted + '66' }]}
            >
              <View style={[styles.scanMoreIcon, { borderColor: palette.muted + '66' }]}>
                <GlowIcon name="camera" size={18} color={palette.muted} stroke={1.7} />
              </View>
              <Text style={[styles.scanMoreText, { color: palette.muted }]}>Scan more</Text>
            </Pressable>
          </FadeUp>
        )}

        <View style={styles.footer}>
          <Pressable
            onPress={onRecap}
            disabled={items.length === 0}
            accessibilityRole="button"
            accessibilityLabel="See my pick"
            accessibilityState={{ disabled: items.length === 0 }}
            style={[
              styles.cta,
              { backgroundColor: items.length === 0 ? palette.muted + '55' : palette.accent },
            ]}
          >
            <Text style={[styles.ctaText, { color: palette.surface }]}>See my pick</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
};

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
  list: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 12,
  },
  emptyWrap: {
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  empty: {
    fontSize: 14,
    lineHeight: 21,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    padding: 14,
  },
  bestBadge: {
    position: 'absolute',
    top: -9,
    left: 16,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  bestBadgeText: {
    fontSize: 9.5,
    letterSpacing: 0.6,
    fontFamily: FontFamily.sansBold,
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
  scoreCol: {
    alignItems: 'center',
    minWidth: 44,
  },
  score: {
    fontSize: 22,
    fontFamily: FontFamily.sans,
  },
  scoreLabel: {
    fontSize: 9.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  scanMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 14,
  },
  scanMoreIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanMoreText: {
    fontSize: 13,
    fontFamily: FontFamily.sansMedium,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  cta: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 15,
    fontFamily: FontFamily.sansMedium,
  },
});
