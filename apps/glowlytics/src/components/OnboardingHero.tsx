import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, FontFamily, Spacing, BorderRadius } from '../constants/theme';
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
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  eyebrowBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '18',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  eyebrow: {
    color: Colors.primaryLight,
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sansBold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.hero,
    fontFamily: FontFamily.sansBold,
    lineHeight: 42,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
});
