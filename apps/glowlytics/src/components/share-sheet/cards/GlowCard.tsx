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
import { moodAdjective } from '../../day-story/dayModel';

const P = Glow.palette;

export interface GlowCardProps {
  day: DayEntry;
}

export function GlowCard({ day }: GlowCardProps) {
  const user = useStore((s) => s.user);
  const adj = moodAdjective(day.score);

  return (
    <CardShell dark>
      <View style={styles.head}>
        <Watermark dark />
        <Text style={styles.headDate}>{day.m.toUpperCase()} {day.d}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.eyebrow}>TODAY'S GLOW</Text>
        <Text style={styles.score}>{day.score ?? '—'}</Text>
        {day.delta != null && day.delta !== 0 && (
          <View style={styles.deltaChip}>
            <Text style={styles.deltaText}>
              {day.delta > 0 ? '+' : ''}{day.delta} vs. last scan
            </Text>
          </View>
        )}
        <Text style={styles.verdict}>
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
  eyebrow: { fontSize: 12, letterSpacing: 1.6, color: P.surface, opacity: 0.6, fontFamily: FontFamily.sansMedium },
  score: {
    fontFamily: FontFamily.sansBold,
    fontSize: 190,
    lineHeight: 180,
    color: P.surface,
    marginTop: 8,
    letterSpacing: -4,
  },
  deltaChip: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: P.accent + '33',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: P.accent + '66',
  },
  deltaText: { fontSize: 14, color: P.accent2, fontFamily: FontFamily.sansBold },
  verdict: {
    fontFamily: FontFamily.sansMedium,
    fontStyle: 'italic',
    fontSize: 26,
    lineHeight: 32,
    color: P.surface,
    marginTop: 36,
    maxWidth: 280,
    textAlign: 'center',
  },
  verdictEm: { color: P.accent2, fontFamily: FontFamily.sansBold },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footName: { fontSize: 13, color: P.surface, opacity: 0.5, fontFamily: FontFamily.sans },
  footMeta: { fontSize: 11, letterSpacing: 1, color: P.surface, opacity: 0.5, fontFamily: FontFamily.sansMedium },
});
