/**
 * PatternCard — "the assistant noticed" quote-card. Big editorial headline
 * (the user's strongest detected pattern) sits centred on cream with the
 * supporting sentence underneath.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FontFamily, Glow } from '../../../constants/theme';
import type { DayEntry } from '../../day-story/dayModel';
import { CardShell, Watermark } from './CardShell';

const P = Glow.palette;

export interface PatternCardProps {
  day: DayEntry;
  headline: string;
  body: string;
}

export function PatternCard({ day, headline, body }: PatternCardProps) {
  return (
    <CardShell>
      <View style={styles.head}>
        <Watermark />
        <Text style={styles.eyebrow}>PATTERN · {day.m.toUpperCase()} {day.d}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.quote}>“{headline}”</Text>
        <Text style={styles.attribution}>— your skin, this week</Text>
        <View style={styles.divider} />
        <Text style={styles.support}>{body}</Text>
      </View>

      <View style={styles.foot}>
        <Text style={styles.footText}>Pattern detection by Glowlytics</Text>
        <Text style={styles.footText}>glowlytics.ai</Text>
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 11, letterSpacing: 1.2, color: P.muted, fontFamily: FontFamily.sansMedium },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  quote: {
    fontFamily: FontFamily.sansBold,
    fontStyle: 'italic',
    fontSize: 32,
    lineHeight: 40,
    color: P.ink,
    textAlign: 'center',
    maxWidth: 320,
  },
  attribution: { fontSize: 12, color: P.muted, marginTop: 8, fontFamily: FontFamily.sansMedium, letterSpacing: 0.6 },
  divider: { width: 36, height: 1, backgroundColor: P.muted + '60', marginTop: 24, marginBottom: 18 },
  support: {
    fontSize: 14,
    lineHeight: 21,
    color: P.ink,
    textAlign: 'center',
    maxWidth: 280,
    fontFamily: FontFamily.sans,
    opacity: 0.85,
  },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footText: { fontSize: 11, color: P.muted, fontFamily: FontFamily.sansMedium, letterSpacing: 0.4 },
});
