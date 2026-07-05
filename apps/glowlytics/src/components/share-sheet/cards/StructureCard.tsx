/**
 * StructureCard — face-read share template. Cream background, face outline
 * centred, 4 metric tiles. The "Looksmaxxing" / facial-architecture story
 * gets its own card so users can share their structure without exposing
 * the daily glow score.
 */

import React from 'react';
import { StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { FontFamily, Glow } from '../../../constants/theme';
import { useStore } from '../../../store/useStore';
import { FaceOutline } from '../../day-story/FacialStructure';
import type { DayEntry } from '../../day-story/dayModel';
import { CardShell, Watermark } from './CardShell';
import { byAspect, type CardAspect } from '../cardFit';

const P = Glow.palette;

export interface StructureCardProps {
  day: DayEntry;
  aspect?: CardAspect;
}

export function StructureCard({ day: _day, aspect = 'story' }: StructureCardProps) {
  // Read the live bone-structure result from the store. When none exists we
  // still render the card with sensible placeholders so the user sees the
  // template — the metrics simply read "—".
  const modelOutputs = useStore((s) => s.modelOutputs);
  const bone = (() => {
    for (let i = modelOutputs.length - 1; i >= 0; i--) {
      const b = modelOutputs[i]?.bone_structure;
      if (b && b.status === 'ok') return b;
    }
    return null;
  })();

  const harmony = bone?.harmony ?? null;
  const sym = bone?.domain_scores?.symmetry ?? null;
  const cheek = bone?.scored_metrics?.zygomatic_projection ?? null;
  const jaw = bone?.scored_metrics?.gonial_angle ?? null;

  const shape = bone?.dominant_driver
    ? ({
        symmetry: 'Symmetric',
        periorbital: 'Wide-set',
        mandibular: 'Defined',
        midface: 'Soft Oval',
        nose: 'Balanced',
        brow: 'Lifted',
      } as Record<string, string>)[bone.dominant_driver] ?? 'Balanced'
    : harmony != null ? 'Balanced' : '—';

  const metrics: Array<{ l: string; v: string }> = [
    { l: 'Harmony',    v: harmony != null ? `${harmony}` : '—' },
    { l: 'Symmetry',   v: sym != null ? `${sym}%` : '—' },
    { l: 'Cheekbones', v: cheek != null && cheek >= 75 ? 'Prominent' : cheek != null && cheek >= 55 ? 'Soft' : cheek != null ? 'Subtle' : '—' },
    { l: 'Jawline',    v: jaw != null && jaw >= 75 ? 'Defined' : jaw != null && jaw >= 55 ? 'Tapered' : jaw != null ? 'Round' : '—' },
  ];

  // Author for the tall story crop; step the outline + grid down for the
  // shorter crops. On the wide 16:9 tweet the four tiles collapse to a single
  // row so all four still show inside the CardShell padding box (baseH − 64).
  const faceSize = byAspect(aspect, { story: 130, post: 52, tweet: 34 });
  const shapeSize = byAspect(aspect, { story: 30, post: 22, tweet: 16 });
  const shapeSubSize = byAspect(aspect, { story: 14, post: 12, tweet: 11 });
  const bodyGap = byAspect(aspect, { story: 8, post: 4, tweet: 4 });
  const gridTop = byAspect(aspect, { story: 14, post: 6, tweet: 6 });
  const gridMax = byAspect(aspect, { story: 280, post: 280, tweet: 416 });
  const cellBasis = byAspect<DimensionValue>(aspect, { story: '47%', post: '47%', tweet: '23%' });
  const cellPad = byAspect(aspect, { story: 10, post: 8, tweet: 8 });
  const labelSize = byAspect(aspect, { story: 9, post: 9, tweet: 8 });
  const valueSize = byAspect(aspect, { story: 16, post: 14, tweet: 12 });

  return (
    <CardShell>
      <View style={styles.head}>
        <Watermark />
        <Text style={styles.eyebrow}>FACE READ</Text>
      </View>

      <View style={[styles.body, { gap: bodyGap }]}>
        <Text style={styles.smallEyebrow} numberOfLines={1}>FACIAL STRUCTURE</Text>
        <View style={styles.faceWrap}>
          <FaceOutline color={P.accent} size={faceSize} />
        </View>
        <Text style={[styles.shape, { fontSize: shapeSize }]} numberOfLines={1}>
          <Text style={styles.shapeEm}>{shape}</Text>
        </Text>
        <Text style={[styles.shapeSub, { fontSize: shapeSubSize }]} numberOfLines={1}>softly tapered</Text>

        <View style={[styles.metricGrid, { maxWidth: gridMax, marginTop: gridTop }]}>
          {metrics.map((m) => (
            <View key={m.l} style={[styles.metricCell, { flexBasis: cellBasis, padding: cellPad }]}>
              <Text style={[styles.metricLabel, { fontSize: labelSize }]} numberOfLines={1}>{m.l.toUpperCase()}</Text>
              <Text style={[styles.metricValue, { fontSize: valueSize }]} numberOfLines={1}>{m.v}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.foot}>
        <Text style={styles.footText}>Read on-device · Glowlytics</Text>
        <Text style={styles.footText}>glowlytics.ai</Text>
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 11, letterSpacing: 1.2, color: P.ink, opacity: 0.6, fontFamily: FontFamily.sansMedium },
  smallEyebrow: { fontSize: 11, letterSpacing: 1.6, color: P.muted, fontFamily: FontFamily.sansMedium },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  faceWrap: { marginTop: 4 },
  shape: { fontFamily: FontFamily.sansBold, color: P.ink, marginTop: 6, textAlign: 'center' },
  shapeEm: { fontStyle: 'italic', color: P.accent },
  shapeSub: { color: P.muted, letterSpacing: 0.4 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, width: '100%' },
  metricCell: {
    backgroundColor: P.surface,
    borderRadius: 14,
  },
  metricLabel: { color: P.muted, letterSpacing: 0.6, fontFamily: FontFamily.sansMedium },
  metricValue: { fontFamily: FontFamily.sansBold, color: P.ink, marginTop: 2 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footText: { fontSize: 11, color: P.muted, fontFamily: FontFamily.sansMedium, letterSpacing: 0.4 },
});
