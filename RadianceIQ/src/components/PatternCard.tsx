import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import type { Pattern, PatternConfidence, PatternSignal } from '../types';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
} from '../constants/theme';
import { SIGNAL_COLORS } from '../constants/signals';

const CONFIDENCE_COLORS: Record<PatternConfidence, { bg: string; text: string; label: string }> = {
  strong: { bg: 'rgba(58, 158, 143, 0.18)', text: '#3A9E8F', label: 'STRONG' },
  moderate: { bg: 'rgba(242, 181, 106, 0.18)', text: '#C07B2A', label: 'MODERATE' },
  emerging: { bg: 'rgba(99, 102, 181, 0.18)', text: '#6366B5', label: 'EMERGING' },
  watching: { bg: 'rgba(127, 127, 127, 0.12)', text: Colors.textMuted, label: 'WATCHING' },
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
    (SIGNAL_COLORS as Record<string, string | undefined>)[pattern.signal] ?? Colors.primary;
  const isPredicted = pattern.isPredicted;
  const daysToUnlock = pattern.unlocksAtDay ?? null;

  // Build sparkline polyline points (normalized to 0-100 of card width/height)
  const sparkWidth = 240;
  const sparkHeight = 60;
  const points = pattern.chartData.slice(-30);
  const sparkPoints =
    points.length > 1
      ? points
          .map((p, i) => {
            const x = (i / (points.length - 1)) * sparkWidth;
            const y = sparkHeight - (p.signalValue / 100) * sparkHeight;
            return `${x},${y}`;
          })
          .join(' ')
      : '';

  return (
    <View style={[styles.card, widthHint ? { width: widthHint } : null]}>
      {/* Confidence pill */}
      <View style={[styles.confPill, { backgroundColor: conf.bg }]}>
        <View style={[styles.confDot, { backgroundColor: conf.text }]} />
        <Text style={[styles.confText, { color: conf.text }]}>{conf.label}</Text>
      </View>

      {/* Headline */}
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
          <Feather name="activity" size={20} color={Colors.textDim} />
          <Text style={styles.placeholderText}>
            {daysToUnlock ? `Unlocks in ${daysToUnlock} days` : 'Building your pattern'}
          </Text>
        </View>
      )}

      {/* Sample line */}
      {!isPredicted && (
        <Text style={styles.sampleText}>
          Based on {pattern.sampleSize} days
        </Text>
      )}

      {/* Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity onPress={onPressDetail} style={styles.detailButton}>
          <Text style={styles.detailButtonText}>See pattern</Text>
        </TouchableOpacity>
        {!isPredicted && (
          <TouchableOpacity onPress={onPressShare} style={styles.shareButton}>
            <Feather name="share-2" size={14} color={Colors.background} />
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  confPill: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  confDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xxs,
    letterSpacing: 0.6,
  },
  headline: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    lineHeight: 24,
    marginTop: Spacing.xs,
  },
  sparkline: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  sparkPlaceholder: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: 'rgba(127,127,127,0.06)',
    borderRadius: BorderRadius.md,
  },
  placeholderText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
  sampleText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  detailButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  detailButtonText: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  shareButtonText: {
    color: Colors.background,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
});
