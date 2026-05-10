import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontSize, FontFamily, Glow, Spacing, BorderRadius } from '../constants/theme';
import { ProgressDots } from './ProgressDots';

interface Props {
  total: number;
  current: number;
  eyebrow: string;
  title: string;
  subtitle: string;
}

export const OnboardingHero: React.FC<Props> = ({
  total,
  current,
  eyebrow,
  title,
  subtitle,
}) => {
  return (
    <View style={styles.wrapper}>
      <ProgressDots total={total} current={current} />
      <View style={styles.card}>
        <View style={styles.eyebrowBadge}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.lg,
  },
  card: {
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Glow.palette.glow,
    gap: Spacing.sm,
  },
  eyebrowBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Glow.palette.bg,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  eyebrow: {
    color: Glow.palette.accent,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sansBold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: Glow.palette.ink,
    fontSize: 36,
    fontFamily: FontFamily.sans,
    lineHeight: 42,
  },
  subtitle: {
    color: Glow.palette.muted,
    fontSize: FontSize.md,
    lineHeight: 22,
    fontStyle: 'italic',
  },
});
