import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  scoreColor,
} from '../constants/theme';

interface Props {
  score: number;
  statusLabel: string;
  actionStatement: string;
  trendDelta: number;
  onViewResults: () => void;
}

export const SkinScoreHero: React.FC<Props> = ({
  score,
  statusLabel,
  actionStatement,
  trendDelta,
  onViewResults,
}) => {
  const [animatedScore, setAnimatedScore] = useState(0);
  const previousScore = useRef(0);
  const barWidth = useRef(new Animated.Value(0)).current;

  // Animated score counter
  useEffect(() => {
    const from = previousScore.current;
    const to = score;
    const duration = 760;
    const startAt = Date.now();
    let frame = 0;

    const run = () => {
      const elapsed = Date.now() - startAt;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(from + (to - from) * eased);

      if (progress < 1) {
        frame = requestAnimationFrame(run);
      } else {
        previousScore.current = to;
      }
    };

    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  // Accent bar animation
  useEffect(() => {
    const safe = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
    barWidth.setValue(0);
    Animated.timing(barWidth, {
      toValue: safe,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [score]);

  const safeScore = Number.isFinite(score) ? score : 0;
  const accent = scoreColor(safeScore);
  const displayScore = Number.isFinite(animatedScore) ? Math.round(animatedScore) : 0;

  const safeDelta = Number.isFinite(trendDelta) ? trendDelta : 0;
  const trendColor = safeDelta >= 0 ? Colors.success : Colors.error;
  const trendIcon: React.ComponentProps<typeof Feather>['name'] = safeDelta >= 0 ? 'trending-up' : 'trending-down';
  const trendText = safeDelta === 0 ? 'Stable' : `${safeDelta > 0 ? '+' : ''}${safeDelta}`;

  const barInterp = barWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onViewResults}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Overall skin score ${displayScore}, ${statusLabel}. Tap for details.`}
    >
      {/* Score row: big number + trend badge */}
      <View style={styles.scoreRow}>
        <Text style={[styles.score, { color: accent }]}>{displayScore}</Text>
        <View style={styles.trendBadge}>
          <Feather name={trendIcon} size={16} color={trendColor} />
          <Text style={[styles.trendText, { color: trendColor }]}>{trendText}</Text>
        </View>
      </View>

      {/* Animated accent bar */}
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: barInterp, backgroundColor: accent }]} />
      </View>

      {/* Action statement — the coaching line */}
      <Text style={styles.action} numberOfLines={3}>{actionStatement}</Text>

      {/* Subtle tap hint */}
      <View style={styles.hintRow}>
        <Text style={styles.hint}>View full results</Text>
        <Feather name="chevron-right" size={16} color={Colors.textDim} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.lg,
  },
  score: {
    fontFamily: FontFamily.sansBold,
    fontSize: 104,
    lineHeight: 100,
    letterSpacing: -3,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingBottom: 18,
  },
  trendText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  barTrack: {
    height: 6,
    backgroundColor: Colors.divider,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  action: {
    color: Colors.text,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.lg,
    lineHeight: 26,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  hint: {
    color: Colors.textDim,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
});
