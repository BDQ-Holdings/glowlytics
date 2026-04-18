import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Shadows,
  Spacing,
  Surfaces,
} from '../constants/theme';

interface Props {
  driver: string;
  action: string;
  escalation?: boolean;
  mode?: 'standard' | 'hero';
  supportingText?: string;
}

const formatDriver = (driver: string) =>
  driver.charAt(0).toUpperCase() + driver.slice(1).replace(/_/g, ' ');

export const ActionCard: React.FC<Props> = ({
  driver,
  action,
  escalation,
  mode = 'standard',
  supportingText,
}) => {
  const hero = mode === 'hero';
  const glowColor = escalation ? Colors.glowAmber : Colors.glowPrimary;

  return (
    <LinearGradient
      colors={[
        Colors.glassStrong,
        escalation ? 'rgba(255, 243, 224, 0.94)' : 'rgba(245, 244, 240, 0.96)',
      ]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, hero && styles.heroContainer]}
    >
      <View style={[styles.glow, { backgroundColor: glowColor }]} />
      <View style={styles.header}>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: escalation ? Colors.warning + '1C' : Colors.primary + '18',
              borderColor: escalation ? Colors.warning + '45' : Colors.primary + '3A',
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: escalation ? Colors.warning : Colors.primaryLight }]}>
            {formatDriver(driver)}
          </Text>
        </View>
      </View>
      <Text style={[styles.action, hero && styles.heroAction]}>{action}</Text>
      {supportingText ? (
        <Text style={styles.supportingText}>{supportingText}</Text>
      ) : null}
      {escalation && !supportingText ? (
        <Text style={styles.supportingText}>
          Consider sharing a report with a clinician for context.
        </Text>
      ) : null}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    ...Surfaces.hero,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  heroContainer: {
    minHeight: 220,
    justifyContent: 'flex-end',
  },
  glow: {
    position: 'absolute',
    top: -36,
    right: -28,
    width: 180,
    height: 180,
    borderRadius: BorderRadius.full,
    opacity: 0.18,
  },
  header: {
    marginBottom: Spacing.md,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  action: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    lineHeight: 26,
  },
  heroAction: {
    fontFamily: FontFamily.serifBold,
    fontSize: FontSize.hero,
    lineHeight: 44,
  },
  supportingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 21,
    maxWidth: '92%',
  },
});
