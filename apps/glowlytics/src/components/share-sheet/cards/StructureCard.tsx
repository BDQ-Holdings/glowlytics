/**
 * StructureCard — face-read share template. Cream background, face outline
 * centred, 4 metric tiles. The "Looksmaxxing" / facial-architecture story
 * gets its own card so users can share their structure without exposing
 * the daily glow score.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FontFamily, Glow } from '../../../constants/theme';
import { useStore } from '../../../store/useStore';
import { FaceOutline } from '../../day-story/FacialStructure';
import type { DayEntry } from '../../day-story/dayModel';
import { CardShell, Watermark } from './CardShell';

const P = Glow.palette;

export interface StructureCardProps {
  day: DayEntry;
}

export function StructureCard({ day: _day }: StructureCardProps) {
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

  return (
    <CardShell>
      <View style={styles.head}>
        <Watermark />
        <Text style={styles.eyebrow}>FACE READ</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.smallEyebrow}>FACIAL STRUCTURE</Text>
        <View style={styles.faceWrap}>
          <FaceOutline color={P.accent} size={150} />
        </View>
        <Text style={styles.shape}>
          <Text style={styles.shapeEm}>{shape}</Text>
        </Text>
        <Text style={styles.shapeSub}>softly tapered</Text>

        <View style={styles.metricGrid}>
          {metrics.map((m) => (
            <View key={m.l} style={styles.metricCell}>
              <Text style={styles.metricLabel}>{m.l.toUpperCase()}</Text>
              <Text style={styles.metricValue}>{m.v}</Text>
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
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  faceWrap: { marginTop: 4 },
  shape: { fontFamily: FontFamily.sansBold, fontSize: 30, color: P.ink, marginTop: 6 },
  shapeEm: { fontStyle: 'italic', color: P.accent },
  shapeSub: { fontSize: 14, color: P.muted, letterSpacing: 0.4 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%', maxWidth: 280, marginTop: 14 },
  metricCell: {
    flexBasis: '47%',
    backgroundColor: P.surface,
    borderRadius: 14,
    padding: 10,
  },
  metricLabel: { fontSize: 9, color: P.muted, letterSpacing: 0.6, fontFamily: FontFamily.sansMedium },
  metricValue: { fontFamily: FontFamily.sansBold, fontSize: 16, color: P.ink, marginTop: 2 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footText: { fontSize: 11, color: P.muted, fontFamily: FontFamily.sansMedium, letterSpacing: 0.4 },
});
