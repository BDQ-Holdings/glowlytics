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
import { byAspect, type CardAspect } from '../cardFit';

const P = Glow.palette;

export interface ArcCardProps {
  day: DayEntry;
  arcSeries: number[];
  aspect?: CardAspect;
}

export function ArcCard({ day, arcSeries, aspect = 'story' }: ArcCardProps) {
  const start = arcSeries[0] ?? day.score ?? 0;
  const end = day.score ?? arcSeries[arcSeries.length - 1] ?? 0;
  const delta = end - start;

  // Content box width = authored width − CardShell padding (2 × 32). The spark
  // and endpoint row fill it instead of the old hard-coded 320 that overran
  // the 296pt story/post box. Sizes step down for the shorter crops.
  const contentW = byAspect(aspect, { story: 296, post: 296, tweet: 416 });
  const deltaSize = byAspect(aspect, { story: 110, post: 84, tweet: 52 });
  const deltaSpacing = byAspect(aspect, { story: -3, post: -2, tweet: -1 });
  const subSize = byAspect(aspect, { story: 14, post: 13, tweet: 12 });
  const subTop = byAspect(aspect, { story: 4, post: 4, tweet: 2 });
  const sparkH = byAspect(aspect, { story: 130, post: 90, tweet: 50 });
  const sparkTop = byAspect(aspect, { story: 30, post: 16, tweet: 8 });
  const sparkBottom = byAspect(aspect, { story: 10, post: 8, tweet: 4 });

  return (
    <CardShell>
      <View style={styles.head}>
        <Watermark />
        <Text style={styles.eyebrow}>{arcSeries.length}-DAY ARC</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.deltaLabel} numberOfLines={1}>YOUR GLOW</Text>
        <Text
          style={[styles.deltaNum, { fontSize: deltaSize, lineHeight: deltaSize, letterSpacing: deltaSpacing }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {delta >= 0 ? '+' : ''}{delta}
        </Text>
        <Text style={[styles.deltaSub, { fontSize: subSize, marginTop: subTop }]} numberOfLines={1}>from {start} → {end}</Text>

        <View style={[styles.sparkWrap, { marginTop: sparkTop, marginBottom: sparkBottom }]}>
          {arcSeries.length >= 2 ? (
            <GlowSpark data={arcSeries} color={P.accent} width={contentW} height={sparkH} />
          ) : (
            <Text style={styles.placeholder} numberOfLines={2}>The arc appears after a few scans.</Text>
          )}
        </View>

        <View style={styles.rangeRow}>
          <Text style={styles.rangeText} numberOfLines={1}>start · {start}</Text>
          <Text style={styles.rangeText} numberOfLines={1}>today · {end}</Text>
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
    color: P.accent,
    marginTop: 4,
    textAlign: 'center',
  },
  deltaSub: { fontFamily: FontFamily.sansMedium, color: P.ink, opacity: 0.7 },
  sparkWrap: { alignSelf: 'stretch', alignItems: 'center' },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 6 },
  rangeText: { fontSize: 11, color: P.muted, letterSpacing: 0.6, fontFamily: FontFamily.sansMedium },
  placeholder: { fontFamily: FontFamily.sans, fontSize: 13, color: P.muted, textAlign: 'center', maxWidth: 280 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footText: { fontSize: 11, color: P.muted, fontFamily: FontFamily.sansMedium, letterSpacing: 0.4 },
});
