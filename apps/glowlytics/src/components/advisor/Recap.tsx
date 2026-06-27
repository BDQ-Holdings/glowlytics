import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VerdictMark } from './VerdictMark';
import { ProductThumb } from './ProductThumb';
import { fitMeta } from './fitMeta';
import { BreathingGlow, FadeUp } from '../glow/GlowPrimitives';
import { GlowIcon } from '../glow/GlowIcons';
import { FontFamily } from '../../constants/theme';
import type { GlowPalette } from '../../constants/theme';
import type { ConsideringItem, ShoppingVerdict } from '../../types';

/**
 * Session recap / shortlist — the scanned products grouped by verdict
 * (Fits you / Worth a look / Not for you). The single strongest pick is framed
 * as the top pick. Each card carries a save toggle driven by `savedIds`. Pure
 * presentational.
 */
export interface RecapProps {
  items: ConsideringItem[];
  savedIds: Set<string>;
  onOpen: (id: string) => void;
  onSave: (id: string) => void;
  onDone: () => void;
  palette: GlowPalette;
}

const GROUP_ORDER: ShoppingVerdict[] = ['buy', 'maybe', 'skip'];
const RANK: Record<ShoppingVerdict, number> = { buy: 0, maybe: 1, skip: 2 };

export const Recap: React.FC<RecapProps> = ({
  items,
  savedIds,
  onOpen,
  onSave,
  onDone,
  palette,
}) => {
  const insets = useSafeAreaInsets();

  const topPickId = items.length
    ? [...items].sort((a, b) => RANK[a.verdict] - RANK[b.verdict] || b.score - a.score)[0].id
    : null;

  const groups = GROUP_ORDER.map((verdict) => ({
    verdict,
    meta: fitMeta(verdict, palette),
    items: items
      .filter((it) => it.verdict === verdict)
      .sort((a, b) => b.score - a.score),
  })).filter((g) => g.items.length > 0);

  let fadeIndex = 1;

  const Card = (it: ConsideringItem, big: boolean) => {
    const saved = savedIds.has(it.id);
    return (
      <View key={it.id} style={styles.cardRow}>
        <Pressable
          onPress={() => onOpen(it.id)}
          accessibilityRole="button"
          accessibilityLabel={`${it.name}, ${it.verdict}. View details`}
          style={[
            styles.card,
            big && styles.cardBig,
            {
              backgroundColor: palette.surface,
              borderColor: big ? palette.accent : palette.glow,
              borderWidth: big ? 1.5 : StyleSheet.hairlineWidth,
            },
          ]}
        >
          {big && (
            <BreathingGlow color={palette.accent + '26'} size={150} style={styles.cardGlow} />
          )}
          {big && (
            <View style={[styles.topBadge, { backgroundColor: palette.accent }]}>
              <Text style={[styles.topBadgeText, { color: palette.surface }]}>TOP PICK</Text>
            </View>
          )}
          <View style={styles.cardMain}>
            <ProductThumb
              imageUrl={it.result.product.image_url}
              tone={palette.glow}
              w={big ? 64 : 46}
              h={big ? 84 : 60}
              r={big ? 14 : 10}
              palette={palette}
            />
            <View style={styles.cardText}>
              {!!it.brand && (
                <Text style={[styles.cardBrand, { color: palette.muted }]} numberOfLines={1}>
                  {it.brand.toUpperCase()}
                </Text>
              )}
              <Text
                style={[styles.cardName, big && styles.cardNameBig, { color: palette.ink }]}
                numberOfLines={2}
              >
                {it.name}
              </Text>
              <View style={styles.cardChip}>
                <VerdictMark verdict={it.verdict} variant="chip" size="sm" palette={palette} />
              </View>
            </View>
          </View>
          {big && !!it.result.headline && (
            <Text style={[styles.cardWhy, { color: palette.ink }]} numberOfLines={3}>
              {it.result.headline}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => onSave(it.id)}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Saved to considering' : 'Save to considering'}
          style={[
            styles.saveToggle,
            {
              backgroundColor: saved ? palette.accent : palette.surface,
              borderColor: saved ? palette.accent : palette.glow,
            },
          ]}
        >
          <GlowIcon
            name={saved ? 'check' : 'plus'}
            size={17}
            color={saved ? palette.surface : palette.muted}
            stroke={2}
          />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.closeBtn}>
          <Text style={[styles.closeText, { color: palette.muted }]}>Close</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 50 + insets.bottom }}
      >
        <FadeUp index={0} style={styles.intro}>
          <Text style={[styles.kicker, { color: palette.accent }]}>SESSION WRAP</Text>
          <Text style={[styles.title, { color: palette.ink }]}>
            Here&apos;s your{' '}
            <Text style={[styles.titleEm, { color: palette.accent }]}>pick</Text>
          </Text>
        </FadeUp>

        {items.length === 0 ? (
          <FadeUp index={1} style={styles.emptyWrap}>
            <Text style={[styles.empty, { color: palette.muted }]}>
              No products scanned this session.
            </Text>
          </FadeUp>
        ) : (
          groups.map((g) => {
            const idx = fadeIndex++;
            return (
              <FadeUp key={g.verdict} index={idx} style={styles.group}>
                <View style={styles.groupHead}>
                  <View style={[styles.groupDot, { backgroundColor: g.meta.dot }]} />
                  <Text style={[styles.groupLabel, { color: g.meta.textColor }]}>
                    {g.meta.label}
                  </Text>
                  <Text style={[styles.groupCount, { color: palette.ink + 'B3' }]}>
                    {g.items.length}
                  </Text>
                </View>
                <View style={styles.groupList}>
                  {g.items.map((it) => Card(it, it.id === topPickId))}
                </View>
              </FadeUp>
            );
          })
        )}

        <View style={styles.footer}>
          <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Done for now" style={[styles.doneBtn, { borderColor: palette.glow }]}>
            <Text style={[styles.doneText, { color: palette.ink }]}>Done for now</Text>
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
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  closeBtn: {
    paddingVertical: 4,
  },
  closeText: {
    fontSize: 13.5,
    fontFamily: FontFamily.sansMedium,
  },
  intro: {
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 28,
    lineHeight: 32,
    marginTop: 6,
    fontFamily: FontFamily.sans,
  },
  titleEm: {
    fontStyle: 'italic',
    fontFamily: FontFamily.sans,
  },
  emptyWrap: {
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  empty: {
    fontSize: 14,
    lineHeight: 21,
  },
  group: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  groupDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  groupLabel: {
    flex: 1,
    fontSize: 13,
    letterSpacing: 0.4,
    fontStyle: 'italic',
    fontFamily: FontFamily.sansMedium,
  },
  groupCount: {
    fontSize: 12,
  },
  groupList: {
    gap: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  card: {
    flex: 1,
    borderRadius: 22,
    padding: 16,
    overflow: 'hidden',
  },
  cardBig: {
    borderRadius: 26,
    padding: 20,
  },
  cardGlow: {
    top: -40,
    right: -40,
  },
  topBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    marginBottom: 12,
  },
  topBadgeText: {
    fontSize: 9.5,
    letterSpacing: 0.6,
    fontFamily: FontFamily.sansBold,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  cardBrand: {
    fontSize: 10.5,
    letterSpacing: 0.6,
  },
  cardName: {
    fontSize: 17,
    lineHeight: 21,
    marginTop: 2,
    fontFamily: FontFamily.sans,
  },
  cardNameBig: {
    fontSize: 22,
    lineHeight: 26,
  },
  cardChip: {
    marginTop: 8,
  },
  cardWhy: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 14,
  },
  saveToggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  doneBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  doneText: {
    fontSize: 14,
    fontFamily: FontFamily.sansMedium,
  },
});
