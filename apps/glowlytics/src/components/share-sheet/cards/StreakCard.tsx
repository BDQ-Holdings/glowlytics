/**
 * StreakCard — celebrates the user's current scan streak on a warm-ink
 * background. The big number is the streak; the verdict reinforces the
 * habit ("12 mornings in a row of paying attention").
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FontFamily, Glow } from '../../../constants/theme';
import { GlowIcon } from '../../glow/GlowIcons';
import { useStore } from '../../../store/useStore';
import type { DayEntry } from '../../day-story/dayModel';
import { CardShell, Watermark } from './CardShell';

const P = Glow.palette;

export interface StreakCardProps {
  day: DayEntry;
}

export function StreakCard({ day: _day }: StreakCardProps) {
  const getStreak = useStore((s) => s.getStreak);
  const streak = getStreak();

  return (
    <CardShell dark>
      <View style={styles.head}>
        <Watermark dark />
        <Text style={styles.eyebrow}>STREAK</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.flameRow}>
          <GlowIcon name="flame" size={36} color={P.accent2} stroke={1.6} filled />
          <Text style={styles.unit}>days</Text>
        </View>
        <Text style={styles.streakNum}>{streak}</Text>
        <Text style={styles.line}>
          mornings in a row of <Text style={styles.lineEm}>paying attention</Text>.
        </Text>
        {streak >= 30 && <Text style={styles.badge}>· skin-scientist tier ·</Text>}
        {streak >= 7 && streak < 30 && <Text style={styles.badge}>· week warrior ·</Text>}
      </View>

      <View style={styles.foot}>
        <Text style={styles.footText}>Glowlytics</Text>
        <Text style={styles.footText}>glowlytics.ai</Text>
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 11, letterSpacing: 1.2, color: P.surface, opacity: 0.6, fontFamily: FontFamily.sansMedium },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unit: { fontFamily: FontFamily.sansMedium, fontSize: 14, color: P.surface, opacity: 0.7, letterSpacing: 1.2 },
  streakNum: {
    fontFamily: FontFamily.sansBold,
    fontSize: 200,
    lineHeight: 190,
    color: P.surface,
    letterSpacing: -4,
    marginTop: 4,
  },
  line: {
    fontFamily: FontFamily.sansMedium,
    fontStyle: 'italic',
    fontSize: 22,
    lineHeight: 28,
    color: P.surface,
    opacity: 0.9,
    maxWidth: 280,
    textAlign: 'center',
    marginTop: 28,
  },
  lineEm: { color: P.accent2, fontFamily: FontFamily.sansBold },
  badge: { marginTop: 16, color: P.accent2, fontSize: 12, letterSpacing: 2, fontFamily: FontFamily.sansBold },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footText: { fontSize: 11, color: P.surface, opacity: 0.5, fontFamily: FontFamily.sansMedium, letterSpacing: 0.6 },
});
