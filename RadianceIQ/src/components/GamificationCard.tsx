import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
} from '../constants/theme';
import { getLevelProgress } from '../services/gamification';
import type { GamificationState } from '../types';

interface GamificationCardProps {
  gamification: GamificationState;
  streak: number;
}

export const GamificationCard: React.FC<GamificationCardProps> = ({ gamification, streak }) => {
  const xp = gamification?.xp ?? 0;
  const { current, next, progress, nextThreshold } = getLevelProgress(xp);

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

  // Find the first incomplete challenge
  const activeChallenge = (gamification?.weekly_challenges ?? []).find((c) => !c.completed);
  const challengeProgress = activeChallenge
    ? Math.min(1, activeChallenge.progress / activeChallenge.target)
    : 0;

  const challengeBarWidth = useSharedValue(0);

  useEffect(() => {
    challengeBarWidth.value = withTiming(challengeProgress, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, [challengeProgress]);

  const challengeBarStyle = useAnimatedStyle(() => ({
    width: `${challengeBarWidth.value * 100}%` as any,
  }));

  return (
    <View style={styles.card}>
      {/* Top row: Level + XP + Streak */}
      <View style={styles.topRow}>
        <View style={styles.levelInfo}>
          <Text style={styles.levelLabel}>{current}</Text>
          <Text style={styles.xpLabel}>{xp.toLocaleString()} XP</Text>
        </View>

        <View style={styles.streakBadge}>
          <MaterialCommunityIcons name="fire" size={16} color={Colors.warning} />
          <Text style={styles.streakText}>{streak}</Text>
        </View>
      </View>

      {/* Level progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, barStyle]} />
      </View>
      <Text style={styles.progressLabel}>
        {next ? `${nextThreshold ? nextThreshold - gamification.xp : 0} XP to ${next}` : 'Max level reached'}
      </Text>

      {/* Active challenge */}
      {activeChallenge && (
        <View style={styles.challengeSection}>
          <View style={styles.challengeHeader}>
            <MaterialCommunityIcons name="trophy-outline" size={14} color={Colors.secondary} />
            <Text style={styles.challengeTitle}>{activeChallenge.title}</Text>
            <Text style={styles.challengeReward}>+{activeChallenge.xp_reward} XP</Text>
          </View>
          <View style={styles.challengeTrack}>
            <Animated.View style={[styles.challengeFill, challengeBarStyle]} />
          </View>
          <Text style={styles.challengeProgress}>
            {activeChallenge.progress} / {activeChallenge.target}
          </Text>
        </View>
      )}
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
    marginBottom: Spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelInfo: {
    gap: 2,
  },
  levelLabel: {
    color: Colors.primary,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  xpLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(192, 123, 42, 0.10)',
    borderRadius: BorderRadius.full,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  streakText: {
    color: Colors.warning,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
  },
  progressLabel: {
    color: Colors.textDim,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
  },
  challengeSection: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.surfaceOverlay,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  challengeTitle: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
  },
  challengeReward: {
    color: Colors.secondary,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
  },
  challengeTrack: {
    height: 3,
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  challengeFill: {
    height: '100%',
    backgroundColor: Colors.secondary,
    borderRadius: BorderRadius.full,
  },
  challengeProgress: {
    color: Colors.textDim,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xxs,
    textAlign: 'right',
  },
});
