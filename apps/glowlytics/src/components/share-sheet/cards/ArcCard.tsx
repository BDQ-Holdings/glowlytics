/**
 * ArcCard — 14-day progress card. Big delta number across the top, the arc
 * sparkline filling most of the card, daily score endpoints underneath.
 * The shareable proof that the routine is working.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FontFamily, Glow } from '../../../constants/theme';
import { GlowSpark } from '../../glow/GlowIcons';
import type { DayEntry } from '../../day-story/dayModel';
import { CardShell, Watermark } from './CardShell';

const P = Glow.palette;

export interface ArcCardProps {
  day: DayEntry;
  arcSeries: number[];
}

export function ArcCard({ day, arcSeries }: ArcCardProps) {
  const start = arcSeries[0] ?? day.score ?? 0;
  const end = day.score ?? arcSeries[arcSeries.length - 1] ?? 0;
  const delta = end - start;

  return (
    <CardShell>
      <View style={styles.head}>
        <Watermark />
        <Text style={styles.eyebrow}>{arcSeries.length}-DAY ARC</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.deltaLabel}>YOUR GLOW</Text>
        <Text style={styles.deltaNum}>
          {delta >= 0 ? '+' : ''}{delta}
        </Text>
        <Text style={styles.deltaSub}>from {start} → {end}</Text>

        <View style={styles.sparkWrap}>
          {arcSeries.length >= 2 ? (
            <GlowSpark data={arcSeries} color={P.accent} width={320} height={130} />
          ) : (
            <Text style={styles.placeholder}>The arc appears after a few scans.</Text>
          )}
        </View>

        <View style={styles.rangeRow}>
          <Text style={styles.rangeText}>start · {start}</Text>
          <Text style={styles.rangeText}>today · {end}</Text>
        </View>
      </View>

      <View style={styles.foot}>
        <Text style={styles.footText}>{arcSeries.length} day{arcSeries.length === 1 ? '' : 's'} of paying attention</Text>
        <Text style={styles.footText}>glowlytics.ai</Text>
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 11, letterSpacing: 1.2, color: P.muted, fontFamily: FontFamily.sansMedium },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  deltaLabel: { fontSize: 12, letterSpacing: 1.6, color: P.muted, fontFamily: FontFamily.sansMedium },
  deltaNum: {
    fontFamily: FontFamily.sansBold,
    fontSize: 110,
    lineHeight: 110,
    color: P.accent,
    marginTop: 4,
    letterSpacing: -3,
  },
  deltaSub: { fontFamily: FontFamily.sansMedium, fontSize: 14, color: P.ink, opacity: 0.7, marginTop: 4 },
  sparkWrap: { marginTop: 30, marginBottom: 10 },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', width: 320, marginTop: 6 },
  rangeText: { fontSize: 11, color: P.muted, letterSpacing: 0.6, fontFamily: FontFamily.sansMedium },
  placeholder: { fontFamily: FontFamily.sans, fontSize: 13, color: P.muted, textAlign: 'center', maxWidth: 280 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footText: { fontSize: 11, color: P.muted, fontFamily: FontFamily.sansMedium, letterSpacing: 0.4 },
});
