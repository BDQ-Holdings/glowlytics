import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import type { Badge, BadgeId } from '../types';
import { BADGE_DEFINITIONS } from '../services/gamification';
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
} from '../constants/theme';

interface BadgeShowcaseProps {
  earnedBadges: Badge[];
}

const ALL_BADGE_IDS: BadgeId[] = [
  'first_scan', 'streak_7', 'streak_30', 'streak_60',
  'sunscreen_champion', 'perfect_week', 'sleep_warrior', 'product_expert',
  'early_bird', 'consistency_king',
  'level_novice', 'level_enthusiast', 'level_expert', 'level_master', 'level_scientist',
];

const BADGE_ICONS: Record<BadgeId, string> = {
  first_scan: 'star-outline',
  streak_7: 'fire',
  streak_30: 'fire',
  streak_60: 'fire',
  sunscreen_champion: 'weather-sunny',
  perfect_week: 'calendar-check',
  sleep_warrior: 'sleep',
  product_expert: 'flask-outline',
  early_bird: 'weather-sunset-up',
  consistency_king: 'clock-outline',
  level_novice: 'arrow-up-circle-outline',
  level_enthusiast: 'heart-outline',
  level_expert: 'shield-check-outline',
  level_master: 'crown-outline',
  level_scientist: 'atom',
};

export const BadgeShowcase: React.FC<BadgeShowcaseProps> = ({ earnedBadges }) => {
  const earnedMap = new Map(earnedBadges.map((b) => [b.id, b]));

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {ALL_BADGE_IDS.map((id) => {
          const earned = earnedMap.get(id);
          const def = BADGE_DEFINITIONS[id];
          const isEarned = !!earned;
          const iconName = BADGE_ICONS[id];

          return (
            <View
              key={id}
              style={[styles.badgeCell, isEarned ? styles.badgeCellEarned : styles.badgeCellLocked]}
            >
              <View style={[styles.iconCircle, isEarned ? styles.iconCircleEarned : styles.iconCircleLocked]}>
                {isEarned ? (
                  <MaterialCommunityIcons
                    name={iconName as any}
                    size={22}
                    color={Colors.primary}
                  />
                ) : (
                  <Feather name="lock" size={16} color={Colors.textDim} />
                )}
              </View>
              <Text
                style={[styles.badgeName, isEarned ? styles.badgeNameEarned : styles.badgeNameLocked]}
                numberOfLines={2}
              >
                {def.name}
              </Text>
              {isEarned && earned?.earned_at && (
                <Text style={styles.earnedDate}>
                  {new Date(earned.earned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  badgeCell: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  badgeCellEarned: {
    backgroundColor: 'rgba(58, 158, 143, 0.08)',
  },
  badgeCellLocked: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    opacity: 0.5,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleEarned: {
    backgroundColor: 'rgba(58, 158, 143, 0.12)',
  },
  iconCircleLocked: {
    backgroundColor: Colors.surfaceHighlight,
  },
  badgeName: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sansMedium,
    textAlign: 'center',
    lineHeight: 14,
  },
  badgeNameEarned: {
    color: Colors.text,
  },
  badgeNameLocked: {
    color: Colors.textDim,
  },
  earnedDate: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xxs,
  },
});
