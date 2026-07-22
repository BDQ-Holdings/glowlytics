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
import { byAspect, type CardAspect } from '../cardFit';

const P = Glow.palette;

export interface StreakCardProps {
  day: DayEntry;
  aspect?: CardAspect;
}

export function StreakCard({ day: _day, aspect = 'story' }: StreakCardProps) {
  const getStreak = useStore((s) => s.getStreak);
  const streak = getStreak();

  // Author for the 9:16 story, step down for the shorter 1:1 / 16:9 crops so
  // the number + line + badge clear the CardShell padding box (baseH − 64).
  const numSize = byAspect(aspect, { story: 200, post: 120, tweet: 76 });
  const numLine = byAspect(aspect, { story: 190, post: 116, tweet: 74 });
  const numSpacing = byAspect(aspect, { story: -4, post: -2, tweet: -1 });
  const flameSize = byAspect(aspect, { story: 36, post: 30, tweet: 26 });
  const unitSize = byAspect(aspect, { story: 14, post: 13, tweet: 12 });
  const lineSize = byAspect(aspect, { story: 22, post: 18, tweet: 14 });
  const lineLine = byAspect(aspect, { story: 28, post: 24, tweet: 18 });
  const lineTop = byAspect(aspect, { story: 28, post: 16, tweet: 8 });
  const lineMax = byAspect(aspect, { story: 280, post: 280, tweet: 380 });
  const badgeTop = byAspect(aspect, { story: 16, post: 12, tweet: 6 });

  return (
    <CardShell dark>
      <View style={styles.head}>
        <Watermark dark />
        <Text style={styles.eyebrow}>STREAK</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.flameRow}>
          <GlowIcon name="flame" size={flameSize} color={P.accent2} stroke={1.6} filled />
          <Text style={[styles.unit, { fontSize: unitSize }]} numberOfLines={1}>{streak === 1 ? 'day' : 'days'}</Text>
        </View>
        <Text
          style={[styles.streakNum, { fontSize: numSize, lineHeight: numLine, letterSpacing: numSpacing }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {streak}
        </Text>
        {streak === 1 ? (
          <Text style={[styles.line, { fontSize: lineSize, lineHeight: lineLine, marginTop: lineTop, maxWidth: lineMax }]} numberOfLines={2}>
            one morning of <Text style={styles.lineEm}>paying attention</Text>. It counts.
          </Text>
        ) : (
          <Text style={[styles.line, { fontSize: lineSize, lineHeight: lineLine, marginTop: lineTop, maxWidth: lineMax }]} numberOfLines={2}>
            mornings in a row of <Text style={styles.lineEm}>paying attention</Text>.
          </Text>
        )}
        {streak >= 30 && <Text style={[styles.badge, { marginTop: badgeTop }]} numberOfLines={1}>· skin-scientist tier ·</Text>}
        {streak >= 7 && streak < 30 && <Text style={[styles.badge, { marginTop: badgeTop }]} numberOfLines={1}>· week warrior ·</Text>}
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
  unit: { fontFamily: FontFamily.sansMedium, color: P.surface, opacity: 0.7, letterSpacing: 1.2 },
  streakNum: {
    fontFamily: FontFamily.sansBold,
    color: P.surface,
    marginTop: 4,
    textAlign: 'center',
  },
  line: {
    fontFamily: FontFamily.sansMedium,
    fontStyle: 'italic',
    color: P.surface,
    opacity: 0.9,
    textAlign: 'center',
  },
  lineEm: { color: P.accent2, fontFamily: FontFamily.sansBold },
  badge: { color: P.accent2, fontSize: 12, letterSpacing: 2, fontFamily: FontFamily.sansBold },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footText: { fontSize: 11, color: P.surface, opacity: 0.5, fontFamily: FontFamily.sansMedium, letterSpacing: 0.6 },
});
