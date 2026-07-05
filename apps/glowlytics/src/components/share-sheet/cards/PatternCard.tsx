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
import { byAspect, type CardAspect } from '../cardFit';

const P = Glow.palette;

export interface PatternCardProps {
  day: DayEntry;
  headline: string;
  body: string;
  aspect?: CardAspect;
}

export function PatternCard({ day, headline, body, aspect = 'story' }: PatternCardProps) {
  // Quotes are arbitrary length, so we clamp to numberOfLines + shrink the
  // font (adjustsFontSizeToFit) instead of cropping. Sizes and line counts
  // step down for the shorter crops so quote + support clear baseH − 64.
  const quoteSize = byAspect(aspect, { story: 32, post: 26, tweet: 18 });
  const quoteLine = byAspect(aspect, { story: 40, post: 32, tweet: 24 });
  const quoteLines = byAspect(aspect, { story: 4, post: 4, tweet: 3 });
  const quoteMax = byAspect(aspect, { story: 296, post: 296, tweet: 400 });
  const attrTop = byAspect(aspect, { story: 8, post: 6, tweet: 4 });
  const dividerTop = byAspect(aspect, { story: 24, post: 16, tweet: 8 });
  const dividerBottom = byAspect(aspect, { story: 18, post: 12, tweet: 6 });
  const supportSize = byAspect(aspect, { story: 14, post: 13, tweet: 12 });
  const supportLine = byAspect(aspect, { story: 21, post: 19, tweet: 17 });
  const supportLines = byAspect(aspect, { story: 4, post: 3, tweet: 2 });
  const supportMax = byAspect(aspect, { story: 280, post: 280, tweet: 380 });

  return (
    <CardShell>
      <View style={styles.head}>
        <Watermark />
        <Text style={styles.eyebrow}>PATTERN · {day.m.toUpperCase()} {day.d}</Text>
      </View>

      <View style={styles.body}>
        <Text
          style={[styles.quote, { fontSize: quoteSize, lineHeight: quoteLine, maxWidth: quoteMax }]}
          numberOfLines={quoteLines}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          “{headline}”
        </Text>
        <Text style={[styles.attribution, { marginTop: attrTop }]} numberOfLines={1}>— your skin, this week</Text>
        <View style={[styles.divider, { marginTop: dividerTop, marginBottom: dividerBottom }]} />
        <Text
          style={[styles.support, { fontSize: supportSize, lineHeight: supportLine, maxWidth: supportMax }]}
          numberOfLines={supportLines}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {body}
        </Text>
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
    color: P.ink,
    textAlign: 'center',
  },
  attribution: { fontSize: 12, color: P.muted, fontFamily: FontFamily.sansMedium, letterSpacing: 0.6 },
  divider: { width: 36, height: 1, backgroundColor: P.muted + '60' },
  support: {
    color: P.ink,
    textAlign: 'center',
    fontFamily: FontFamily.sans,
    opacity: 0.85,
  },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footText: { fontSize: 11, color: P.muted, fontFamily: FontFamily.sansMedium, letterSpacing: 0.4 },
});
