import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
} from '../constants/theme';
import { getLevelProgress } from '../services/gamification';

interface LevelProgressBarProps {
  xp: number;
}

export const LevelProgressBar: React.FC<LevelProgressBarProps> = ({ xp }) => {
  const { current, next, progress, currentThreshold, nextThreshold } = getLevelProgress(xp);

  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withTiming(progress, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value * 100}%` as any,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.labels}>
        <Text style={styles.currentLevel}>{current}</Text>
        {next ? (
          <Text style={styles.nextLevel}>{next}</Text>
        ) : (
          <Text style={styles.maxLevel}>MAX</Text>
        )}
      </View>

      <View style={styles.trackOuter}>
        <Animated.View style={[styles.trackFill, barStyle]} />
      </View>

      <Text style={styles.xpText}>
        {xp.toLocaleString()} {nextThreshold ? `/ ${nextThreshold.toLocaleString()} XP` : 'XP'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currentLevel: {
    color: Colors.primary,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  nextLevel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  maxLevel: {
    color: Colors.warning,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.6,
  },
  trackOuter: {
    height: 6,
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
  },
  xpText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    textAlign: 'right',
  },
});
