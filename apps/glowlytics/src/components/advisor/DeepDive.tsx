import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VerdictMark } from './VerdictMark';
import { ProductThumb } from './ProductThumb';
import { toneColor, severityMeta, warnTextColor } from './fitMeta';
import { FadeUp } from '../glow/GlowPrimitives';
import { GlowIcon } from '../glow/GlowIcons';
import type { GlowIconName } from '../glow/GlowIcons';
import { FontFamily } from '../../constants/theme';
import type { GlowPalette } from '../../constants/theme';
import type { ShoppingScanResult, ShoppingReason } from '../../types';

/**
 * Deep dive (L2 / L3) — the full case for a product, built entirely from REAL
 * backend data: the verdict + headline, every reason grouped by kind, the
 * structured conflicts (severity-coloured), redundancy, goal fit (label + score
 * + beneficial ingredients) and the product's ingredient list. Pure
 * presentational; "Save to considering" is delegated via `onSave`.
 */
export interface DeepDiveProps {
  result: ShoppingScanResult;
  saved?: boolean;
  onBack: () => void;
  onSave?: () => void;
  /** Read-only surfaces (e.g. the saved "considering" detail) hide the save action. */
  readOnly?: boolean;
  palette: GlowPalette;
}

const KIND_ORDER: ShoppingReason['kind'][] = ['goal', 'conflict', 'redundancy', 'flag', 'neutral'];
const KIND_LABEL: Record<ShoppingReason['kind'], string> = {
  goal: 'Toward your goal',
  conflict: 'Conflicts',
  redundancy: 'Overlap',
  flag: 'Heads up',
  neutral: 'Worth knowing',
};

export const DeepDive: React.FC<DeepDiveProps> = ({ result, saved = false, onBack, onSave, readOnly = false, palette }) => {
  const insets = useSafeAreaInsets();
  const { product, verdict, headline, reasons, conflicts, redundancy, goalFit } = result;

  const card = {
    backgroundColor: palette.surface,
    borderColor: palette.glow,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 16,
  } as const;

  const groupedReasons = KIND_ORDER.map((kind) => ({
    kind,
    items: reasons.filter((r) => r.kind === kind),
  })).filter((g) => g.items.length > 0);

  const Sec: React.FC<{
    icon: GlowIconName;
    title: string;
    index: number;
    kicker?: React.ReactNode;
    children: React.ReactNode;
  }> = ({ icon, title, index, kicker, children }) => (
    <FadeUp index={index} style={styles.sec}>
      <View style={styles.secHead}>
        <GlowIcon name={icon} size={16} color={palette.accent} stroke={1.7} />
        <Text style={[styles.secTitle, { color: palette.muted }]}>{title.toUpperCase()}</Text>
        {kicker}
      </View>
      {children}
    </FadeUp>
  );

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.backBtn}>
          <GlowIcon name="back" size={18} color={palette.muted} stroke={1.8} />
          <Text style={[styles.backText, { color: palette.muted }]}>Back</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 50 + insets.bottom }}
      >
        {/* Hero */}
        <FadeUp index={0} style={styles.hero}>
          <ProductThumb
            imageUrl={product.image_url}
            tone={palette.glow}
            w={86}
            h={112}
            r={16}
            palette={palette}
          />
          <View style={styles.heroText}>
            <Text style={[styles.heroBrand, { color: palette.muted }]} numberOfLines={1}>
              {product.brand?.toUpperCase()}
            </Text>
            <Text style={[styles.heroName, { color: palette.ink }]} numberOfLines={3}>
              {product.name}
            </Text>
            {!!product.source && (
              <Text style={[styles.heroSource, { color: palette.muted }]} numberOfLines={1}>
                {product.source}
              </Text>
            )}
          </View>
        </FadeUp>

        {/* Verdict + headline */}
        <FadeUp index={1} style={styles.verdictWrap}>
          <View style={[card, styles.verdictCard]}>
            <VerdictMark verdict={verdict} variant="bloom" size="lg" palette={palette} />
            {!!headline && (
              <Text style={[styles.verdictWhy, { color: palette.ink }]}>{headline}</Text>
            )}
            <Text style={{ marginTop: 12, fontSize: 11.5, fontStyle: 'italic', color: palette.muted }}>
              Guidance, not medical advice.
            </Text>
          </View>
        </FadeUp>

        {/* The full read — reasons grouped by kind */}
        {groupedReasons.length > 0 && (
          <Sec icon="sparkle" title="The full read" index={2}>
            <View style={card}>
              {groupedReasons.map((g, gi) => (
                <View
                  key={g.kind}
                  style={[
                    styles.reasonGroup,
                    gi > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.bg },
                  ]}
                >
                  <Text style={[styles.groupLabel, { color: palette.muted }]}>
                    {KIND_LABEL[g.kind].toUpperCase()}
                  </Text>
                  {g.items.map((r, i) => (
                    <View key={i} style={styles.reasonRow}>
                      <View
                        style={[styles.reasonDot, { backgroundColor: toneColor(r.tone, palette) }]}
                      />
                      <Text style={[styles.reasonText, { color: palette.ink }]}>{r.text}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </Sec>
        )}

        {/* Against your shelf — conflicts + redundancy */}
        {(conflicts.length > 0 || redundancy) && (
          <Sec icon="shelf" title="Against your shelf" index={3}>
            <View style={[card, styles.stack]}>
              {conflicts.map((c, i) => {
                const sev = severityMeta(c.severity, palette);
                return (
                  <View key={i} style={styles.conflictRow}>
                    <View style={[styles.sevPill, { backgroundColor: sev.color + sev.bgAlpha }]}>
                      <Text style={[styles.sevText, { color: sev.textColor }]}>{sev.label}</Text>
                    </View>
                    <View style={styles.conflictBody}>
                      <Text style={[styles.conflictMsg, { color: palette.ink }]}>{c.message}</Text>
                      {!!c.withProduct && (
                        <Text style={[styles.conflictWith, { color: palette.muted }]}>
                          vs. {c.withProduct}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
              {redundancy && (
                <View
                  style={[
                    styles.conflictRow,
                    conflicts.length > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: palette.bg,
                      paddingTop: 12,
                    },
                  ]}
                >
                  <View style={[styles.sevPill, { backgroundColor: palette.accent2 + '1f' }]}>
                    <Text style={[styles.sevText, { color: warnTextColor(palette) }]}>Overlap</Text>
                  </View>
                  <View style={styles.conflictBody}>
                    <Text style={[styles.conflictMsg, { color: palette.ink }]}>
                      Overlaps your {redundancy.category}
                    </Text>
                    <Text style={[styles.conflictWith, { color: palette.muted }]}>
                      similar to {redundancy.withProduct}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </Sec>
        )}

        {/* Toward your goal — goalFit */}
        {!!goalFit && (
          <Sec
            icon="leaf"
            title="Toward your goal"
            index={4}
            kicker={
              <View style={[styles.scorePill, { backgroundColor: palette.accent + '1f' }]}>
                <Text style={[styles.scorePillText, { color: palette.accent }]}>
                  {goalFit.score}
                  <Text style={{ color: palette.muted }}> / 100</Text>
                </Text>
              </View>
            }
          >
            <View style={card}>
              {!!goalFit.label && (
                <Text style={[styles.goalLabel, { color: palette.ink }]}>{goalFit.label}</Text>
              )}
              {goalFit.beneficial.length > 0 && (
                <View style={styles.chips}>
                  {goalFit.beneficial.map((b, i) => (
                    <View
                      key={i}
                      style={[
                        styles.chip,
                        { backgroundColor: palette.accent + '14', borderColor: palette.accent + '33' },
                      ]}
                    >
                      <GlowIcon name="check" size={12} color={palette.accent} stroke={2.2} />
                      <Text style={[styles.chipText, { color: palette.ink }]}>{b}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </Sec>
        )}

        {/* What's inside — ingredients */}
        <Sec icon="drop" title="What's inside" index={5}>
          <View style={card}>
            {product.ingredients.length > 0 ? (
              <View style={styles.chips}>
                {product.ingredients.map((ing, i) => (
                  <View
                    key={i}
                    style={[
                      styles.chip,
                      { backgroundColor: palette.bg, borderColor: palette.glow },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: palette.ink }]}>{ing}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.empty, { color: palette.muted }]}>
                No ingredient list available for this product.
              </Text>
            )}
          </View>
        </Sec>

        {/* Save action */}
        {!readOnly && (
          <View style={styles.saveWrap}>
            <Pressable
              onPress={() => onSave?.()}
              accessibilityRole="button"
              accessibilityLabel={saved ? 'Saved to considering' : 'Save to considering'}
              style={[
                styles.saveBtn,
                { backgroundColor: saved ? palette.accent + '1f' : palette.ink },
              ]}
            >
              <GlowIcon
                name={saved ? 'check' : 'heart'}
                size={saved ? 17 : 16}
                color={saved ? palette.accent : palette.surface}
                stroke={saved ? 2.4 : 1.8}
              />
              <Text
                style={[styles.saveText, { color: saved ? palette.accent : palette.surface }]}
              >
                {saved ? 'Saved to considering' : 'Save to considering'}
              </Text>
            </Pressable>
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back to scanning"
              style={[styles.backToScan, { borderColor: palette.glow }]}
            >
              <Text style={[styles.backToScanText, { color: palette.ink }]}>Back to scanning</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backText: {
    fontSize: 14,
  },
  hero: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-end',
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 4,
  },
  heroBrand: {
    fontSize: 11,
    letterSpacing: 0.8,
  },
  heroName: {
    fontSize: 24,
    lineHeight: 27,
    marginTop: 3,
    fontFamily: FontFamily.sans,
  },
  heroSource: {
    fontSize: 12.5,
    marginTop: 5,
  },
  verdictWrap: {
    paddingHorizontal: 24,
    paddingTop: 22,
  },
  verdictCard: {
    padding: 20,
    overflow: 'hidden',
  },
  verdictWhy: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 14,
  },
  sec: {
    paddingHorizontal: 24,
    paddingTop: 22,
  },
  secHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  secTitle: {
    flex: 1,
    fontSize: 12,
    letterSpacing: 1,
  },
  reasonGroup: {
    paddingVertical: 12,
    gap: 8,
  },
  groupLabel: {
    fontSize: 10.5,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  reasonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  stack: {
    gap: 12,
  },
  conflictRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  sevPill: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginTop: 1,
  },
  sevText: {
    fontSize: 10.5,
    letterSpacing: 0.4,
    fontFamily: FontFamily.sansMedium,
  },
  conflictBody: {
    flex: 1,
    minWidth: 0,
  },
  conflictMsg: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  conflictWith: {
    fontSize: 12,
    marginTop: 3,
  },
  scorePill: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  scorePillText: {
    fontSize: 12,
    fontFamily: FontFamily.sansMedium,
  },
  goalLabel: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 12.5,
  },
  empty: {
    fontSize: 13,
    lineHeight: 20,
  },
  saveWrap: {
    paddingHorizontal: 24,
    paddingTop: 26,
    gap: 10,
  },
  saveBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveText: {
    fontSize: 15,
    fontFamily: FontFamily.sansMedium,
  },
  backToScan: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  backToScanText: {
    fontSize: 14,
  },
});
