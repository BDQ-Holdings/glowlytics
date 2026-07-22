/**
 * GlowCard — the headline share template: massive score + delta + italic
 * verdict line on a dark plum background. Default template when the user
 * taps "Share this day".
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FontFamily, Glow } from '../../../constants/theme';
import { useStore } from '../../../store/useStore';
import type { DayEntry } from '../../day-story/dayModel';
import { CardShell, Watermark } from './CardShell';
import { byAspect, type CardAspect } from '../cardFit';
import { moodAdjective } from '../../day-story/dayModel';

const P = Glow.palette;

export interface GlowCardProps {
  day: DayEntry;
  aspect?: CardAspect;
}

export function GlowCard({ day, aspect = 'story' }: GlowCardProps) {
  const user = useStore((s) => s.user);
  const adj = moodAdjective(day.score);

  // Author for the 9:16 story, step down for the shorter crops so the score +
  // delta chip + verdict clear the CardShell padding box (baseH − 64).
  const scoreSize = byAspect(aspect, { story: 190, post: 116, tweet: 74 });
  const scoreLine = byAspect(aspect, { story: 180, post: 112, tweet: 72 });
  const scoreSpacing = byAspect(aspect, { story: -4, post: -2, tweet: -1 });
  const eyebrowSize = byAspect(aspect, { story: 12, post: 11, tweet: 10 });
  const chipTop = byAspect(aspect, { story: 16, post: 10, tweet: 6 });
  const deltaSize = byAspect(aspect, { story: 14, post: 13, tweet: 12 });
  const verdictSize = byAspect(aspect, { story: 26, post: 20, tweet: 15 });
  const verdictLine = byAspect(aspect, { story: 32, post: 26, tweet: 20 });
  const verdictTop = byAspect(aspect, { story: 36, post: 16, tweet: 8 });
  const verdictMax = byAspect(aspect, { story: 280, post: 280, tweet: 380 });

  return (
    <CardShell dark>
      <View style={styles.head}>
        <Watermark dark />
        <Text style={styles.headDate}>{day.m.toUpperCase()} {day.d}</Text>
      </View>

      <View style={styles.body}>
        <Text style={[styles.eyebrow, { fontSize: eyebrowSize }]} numberOfLines={1}>TODAY'S GLOW</Text>
        <Text
          style={[styles.score, { fontSize: scoreSize, lineHeight: scoreLine, letterSpacing: scoreSpacing }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {day.score ?? '—'}
        </Text>
        {day.delta != null && day.delta !== 0 && (
          <View style={[styles.deltaChip, { marginTop: chipTop }]}>
            <Text style={[styles.deltaText, { fontSize: deltaSize }]} numberOfLines={1}>
              {day.delta > 0 ? '+' : ''}{day.delta} vs. last scan
            </Text>
          </View>
        )}
        <Text
          style={[styles.verdict, { fontSize: verdictSize, lineHeight: verdictLine, marginTop: verdictTop, maxWidth: verdictMax }]}
          numberOfLines={2}
        >
          “You look <Text style={styles.verdictEm}>{adj}</Text>.”
        </Text>
      </View>

      <View style={styles.foot}>
        <Text style={styles.footName}>{user?.user_id ? 'Logged today' : 'Personal read'}</Text>
        <Text style={styles.footMeta}>glowlytics.ai</Text>
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headDate: { fontSize: 11, letterSpacing: 1.2, color: P.surface, opacity: 0.6, fontFamily: FontFamily.sansMedium },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { letterSpacing: 1.6, color: P.surface, opacity: 0.6, fontFamily: FontFamily.sansMedium },
  score: {
    fontFamily: FontFamily.sansBold,
    color: P.surface,
    marginTop: 8,
    textAlign: 'center',
  },
  deltaChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: P.accent + '33',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.accent + '66',
  },
  deltaText: { color: P.accent2, fontFamily: FontFamily.sansBold },
  verdict: {
    fontFamily: FontFamily.sansMedium,
    fontStyle: 'italic',
    color: P.surface,
    textAlign: 'center',
  },
  verdictEm: { color: P.accent2, fontFamily: FontFamily.sansBold },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footName: { fontSize: 13, color: P.surface, opacity: 0.5, fontFamily: FontFamily.sans },
  footMeta: { fontSize: 11, letterSpacing: 1, color: P.surface, opacity: 0.5, fontFamily: FontFamily.sansMedium },
});
