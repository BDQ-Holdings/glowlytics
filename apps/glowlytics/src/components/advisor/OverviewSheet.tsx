import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VerdictMark } from './VerdictMark';
import { ProductThumb } from './ProductThumb';
import { toneColor } from './fitMeta';
import { GlowIcon } from '../glow/GlowIcons';
import { FontFamily } from '../../constants/theme';
import type { GlowPalette } from '../../constants/theme';
import type { ShoppingScanResult } from '../../types';
import { useStore } from '../../store/useStore';

/**
 * Overview sheet (L1) — slides up over the camera with just enough to triage:
 * identity, the verdict, the headline, top reasons (coloured by tone), goal fit,
 * and the Dismiss / Keep / Look-closer actions. Pure presentational.
 *
 * Seam note: the design split the backdrop tap (`onClose`) from the Dismiss
 * button (`onDismiss`); the frozen prop set has only `onClose`, so both routes
 * call it.
 */
export interface OverviewSheetProps {
  result: ShoppingScanResult;
  lensNote?: string | null;
  kept: boolean;
  onClose: () => void;
  onKeep: () => void;
  onDeep: () => void;
  palette: GlowPalette;
}

export const OverviewSheet: React.FC<OverviewSheetProps> = ({
  result,
  lensNote,
  kept,
  onClose,
  onKeep,
  onDeep,
  palette,
}) => {
  const insets = useSafeAreaInsets();
  const reduceMotion = useStore((s) => s.appearance.reduceMotion);
  const { product, verdict, headline, goalFit } = result;
  const topReasons = result.reasons.slice(0, 3);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View
        entering={FadeIn.duration(reduceMotion ? 120 : 250)}
        style={StyleSheet.absoluteFill}
      >
        <Pressable
          onPress={onClose}
          accessibilityLabel="Dismiss overview"
          style={[StyleSheet.absoluteFill, styles.scrim]}
        />
      </Animated.View>

      <View style={styles.dock} pointerEvents="box-none">
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(120) : SlideInDown.duration(380)}
          style={[
            styles.sheet,
            { backgroundColor: palette.surface, paddingBottom: 22 + insets.bottom },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: palette.glow }]} />

          <ScrollView
            style={styles.scroll}
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            {/* Identity + verdict chip */}
            <View style={styles.identity}>
              <ProductThumb
                imageUrl={product.image_url}
                tone={palette.glow}
                w={58}
                h={76}
                r={12}
                palette={palette}
              />
              <View style={styles.identityText}>
                <Text style={[styles.brand, { color: palette.muted }]} numberOfLines={1}>
                  {product.brand?.toUpperCase()}
                </Text>
                <Text style={[styles.name, { color: palette.ink }]} numberOfLines={2}>
                  {product.name}
                </Text>
                {!!product.source && (
                  <Text style={[styles.source, { color: palette.muted }]} numberOfLines={1}>
                    {product.source}
                  </Text>
                )}
              </View>
            </View>

            {/* Verdict block (bloom) */}
            <View style={styles.verdictBlock}>
              <VerdictMark verdict={verdict} variant="bloom" size="lg" palette={palette} />
            </View>

            {/* Headline — the one personalized line */}
            {!!headline && (
              <Text style={[styles.headline, { color: palette.ink }]}>{headline}</Text>
            )}
            {!!lensNote && (
              <Text style={[styles.lensNote, { color: palette.accent }]}>{lensNote}</Text>
            )}

            {/* Top reasons — coloured by tone */}
            {topReasons.length > 0 && (
              <View style={styles.reasons}>
                {topReasons.map((r, i) => (
                  <View key={i} style={styles.reasonRow}>
                    <View
                      style={[styles.reasonDot, { backgroundColor: toneColor(r.tone, palette) }]}
                    />
                    <Text style={[styles.reasonText, { color: palette.ink }]}>{r.text}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Goal fit */}
            {!!goalFit?.label && (
              <View style={styles.goalRow}>
                <View style={[styles.goalChip, { backgroundColor: palette.accent + '18' }]}>
                  <GlowIcon name="leaf" size={13} color={palette.accent} stroke={1.7} />
                  <Text style={[styles.goalScore, { color: palette.accent }]}>
                    Goal fit · {goalFit.score}
                  </Text>
                </View>
                <Text style={[styles.goalLabel, { color: palette.muted }]} numberOfLines={2}>
                  {goalFit.label}
                </Text>
              </View>
            )}

            <Text style={[styles.disclaimer, { color: palette.muted }]}>
              Guidance, not medical advice.
            </Text>
          </ScrollView>

          {/* Actions — the two primaries share one row; Dismiss drops to a quiet
              link below so "Keep considering" never wraps on a ~320pt screen. */}
          <View style={styles.actions}>
            <View style={styles.actionsPrimary}>
              <Pressable
                onPress={onKeep}
                accessibilityRole="button"
                accessibilityLabel={kept ? 'Considering' : 'Keep considering'}
                accessibilityState={{ selected: kept }}
                style={[
                  styles.btnKeep,
                  {
                    backgroundColor: kept ? palette.accent + '1f' : 'transparent',
                    borderColor: kept ? palette.accent : palette.glow,
                  },
                ]}
              >
                {kept && <GlowIcon name="check" size={15} color={palette.accent} stroke={2.4} />}
                <Text
                  numberOfLines={1}
                  style={[styles.btnKeepText, { color: kept ? palette.accent : palette.ink }]}
                >
                  {kept ? 'Considering' : 'Keep considering'}
                </Text>
              </Pressable>
              <Pressable
                onPress={onDeep}
                accessibilityRole="button"
                accessibilityLabel="Look closer"
                style={[styles.btnDeep, { backgroundColor: palette.ink }]}
              >
                <Text numberOfLines={1} style={[styles.btnDeepText, { color: palette.surface }]}>
                  Look closer
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              style={styles.btnGhost}
            >
              <Text numberOfLines={1} style={[styles.btnGhostText, { color: palette.muted }]}>
                Dismiss
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: '#0008',
  },
  dock: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -12 },
    elevation: 18,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 16,
  },
  scroll: {
    flexShrink: 1,
  },
  body: {
    paddingBottom: 18,
  },
  identity: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  identityText: {
    flex: 1,
    minWidth: 0,
  },
  brand: {
    fontSize: 11,
    letterSpacing: 0.6,
  },
  name: {
    fontSize: 20,
    lineHeight: 23,
    marginTop: 1,
    fontFamily: FontFamily.sans,
  },
  source: {
    fontSize: 12,
    marginTop: 3,
  },
  verdictBlock: {
    marginTop: 18,
  },
  headline: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 22,
  },
  lensNote: {
    marginTop: 8,
    fontSize: 12,
    fontStyle: 'italic',
  },
  disclaimer: {
    marginTop: 16,
    fontSize: 11.5,
    fontStyle: 'italic',
  },
  reasons: {
    marginTop: 16,
    gap: 10,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  reasonDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 6,
  },
  reasonText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 20,
  },
  goalRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  goalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  goalScore: {
    fontSize: 11.5,
    fontFamily: FontFamily.sansMedium,
  },
  goalLabel: {
    flex: 1,
    fontSize: 12,
    minWidth: 120,
  },
  actions: {
    marginTop: 16,
    gap: 10,
  },
  actionsPrimary: {
    flexDirection: 'row',
    gap: 10,
  },
  btnGhost: {
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostText: {
    fontSize: 13.5,
    fontFamily: FontFamily.sansMedium,
  },
  btnKeep: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnKeepText: {
    fontSize: 13.5,
    fontFamily: FontFamily.sansMedium,
  },
  btnDeep: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDeepText: {
    fontSize: 13.5,
    fontFamily: FontFamily.sansMedium,
  },
});
