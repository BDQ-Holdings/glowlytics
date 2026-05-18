import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import type { Pattern, PatternConfidence } from '../types';
import { FontFamily, Glow, Spacing } from '../constants/theme';
import { SIGNAL_COLORS } from '../constants/signals';

const P = Glow.palette;

// Confidence colors stay semantic across palettes — strong leans into the
// active accent, moderate into the warm secondary, emerging into the soft
// glow, watching stays muted.
const CONFIDENCE_COLORS: Record<PatternConfidence, { bg: string; text: string; label: string }> = {
  strong:   { bg: P.accent + '24',  text: P.accent,  label: 'STRONG' },
  moderate: { bg: P.accent2 + '24', text: '#9A6A3A', label: 'MODERATE' },
  emerging: { bg: P.glow + '60',    text: P.muted,   label: 'EMERGING' },
  watching: { bg: P.bg,             text: P.muted,   label: 'WATCHING' },
};

interface PatternCardProps {
  pattern: Pattern;
  onPressDetail: () => void;
  onPressShare: () => void;
  widthHint?: number;
}

export const PatternCard: React.FC<PatternCardProps> = ({
  pattern,
  onPressDetail,
  onPressShare,
  widthHint,
}) => {
  const conf = CONFIDENCE_COLORS[pattern.confidence];
  const signalColor =
    (SIGNAL_COLORS as Record<string, string | undefined>)[pattern.signal] ?? P.accent;
  const isPredicted = pattern.isPredicted;
  const daysToUnlock = pattern.unlocksAtDay ?? null;

  // Derive inner content width from the card's outer width hint minus padding + border.
  const sparkWidth = Math.max(widthHint ? widthHint - Spacing.lg * 2 - 2 : 240, 40);
  const sparkHeight = 56;
  const points = pattern.chartData.slice(-30);
  const sparkPoints =
    points.length > 1
      ? points
          .map((p, i) => {
            const x = (i / (points.length - 1)) * sparkWidth;
            const v = Number.isFinite(p.signalValue)
              ? Math.max(0, Math.min(100, p.signalValue))
              : 50;
            const y = sparkHeight - (v / 100) * sparkHeight;
            return `${x},${y}`;
          })
          .join(' ')
      : '';

  return (
    <View style={[styles.card, widthHint ? { width: widthHint } : null]}>
      {/* Top row — confidence + sample-size meta, no competing weight */}
      <View style={styles.topRow}>
        <View style={[styles.confPill, { backgroundColor: conf.bg }]}>
          <View style={[styles.confDot, { backgroundColor: conf.text }]} />
          <Text style={[styles.confText, { color: conf.text }]}>{conf.label}</Text>
        </View>
        {!isPredicted && (
          <Text style={styles.sampleText}>{pattern.sampleSize}-day read</Text>
        )}
      </View>

      {/* Headline — italic accent on the verb */}
      <Text style={styles.headline} numberOfLines={3}>
        {pattern.insightText}
      </Text>

      {/* Sparkline or placeholder */}
      {!isPredicted && sparkPoints ? (
        <View style={styles.sparkline}>
          <Svg width={sparkWidth} height={sparkHeight}>
            <Polyline
              points={sparkPoints}
              fill="none"
              stroke={signalColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      ) : (
        <View style={[styles.sparkline, styles.sparkPlaceholder]}>
          <Feather name="activity" size={18} color={P.muted} />
          <Text style={styles.placeholderText}>
            {daysToUnlock ? `Unlocks in ${daysToUnlock} days` : 'Building your pattern'}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={onPressDetail}
          style={({ pressed }) => [styles.detailButton, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="See pattern detail"
        >
          <Text style={styles.detailButtonText}>See pattern</Text>
          <Feather name="arrow-right" size={13} color={P.ink} />
        </Pressable>
        {!isPredicted && (
          <Pressable
            onPress={onPressShare}
            style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Share pattern"
          >
            <Feather name="share-2" size={14} color={P.surface} />
            <Text style={styles.shareButtonText}>Share</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: P.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: P.glow,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  confDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  sampleText: {
    color: P.muted,
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  headline: {
    color: P.ink,
    fontFamily: FontFamily.sans,
    fontSize: 19,
    lineHeight: 26,
    marginTop: 2,
  },
  sparkline: {
    height: 56,
    justifyContent: 'center',
  },
  sparkPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: P.bg,
    borderRadius: 14,
  },
  placeholderText: {
    color: P.muted,
    fontFamily: FontFamily.sansMedium,
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  detailButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.glow,
    backgroundColor: 'transparent',
  },
  detailButtonText: {
    color: P.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: 13,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: P.ink,
  },
  shareButtonText: {
    color: P.surface,
    fontFamily: FontFamily.sansBold,
    fontSize: 13,
  },
});
