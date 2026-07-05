import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Animated, { Easing, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { FontFamily, FontSize, Glow, Spacing } from '../../src/constants/theme';
import { useStore } from '../../src/store/useStore';
import { FaceMapZones, ZoneKey } from '../../src/components/scan/FaceMapZones';
import { Dot } from '../../src/components/scan/ScanAtoms';

const P = Glow.palette;

type FacetRow = {
  label: string;
  zone: ZoneKey;
  score: number;
  delta: number | null;
  note: string;
};

// Severity bands match the convention used elsewhere (100 = optimal):
// >= 75 healthy, 50-74 watching, < 50 needs attention.
function noteForScore(label: string, score: number): string {
  if (score >= 85) return `${label} looking peak`;
  if (score >= 75) return `${label} holding strong`;
  if (score >= 60) return `${label} steady. Keep an eye on it`;
  if (score >= 40) return `${label} drifting. Small changes will help`;
  return `${label} needs attention`;
}

interface SignalLike {
  structure?: number;
  hydration?: number;
  inflammation?: number;
  sunDamage?: number;
  elasticity?: number;
}

/**
 * Per-zone read derived from the active signal channels. Each facet maps to
 * the signal that most directly reflects that anatomical region:
 *  - Forehead  → hydration (first to show TEWL / dehydration lines)
 *  - Cheeks    → inflammation (where redness / breakouts cluster)
 *  - T-zone    → sunDamage   (most UV-exposed region of the face)
 *  - Jaw       → structure   (jawline definition tracks pore + texture)
 *  - Under-eye → elasticity  (collagen-driven crepiness shows here first)
 *
 * Deltas come from the prior scan's same channel. `null` means "no prior scan
 * yet" — UI hides the delta in that case rather than fabricating a number.
 */
function mapSignalsToFacets(
  current: SignalLike | undefined,
  previous: SignalLike | undefined,
): FacetRow[] {
  const safe = (v: number | undefined): number | null =>
    Number.isFinite(v) ? Math.round(v as number) : null;
  const buildDelta = (cur: number | null, prev: number | null): number | null =>
    cur == null || prev == null ? null : cur - prev;

  type Slot = { label: string; zone: ZoneKey; key: keyof SignalLike };
  const slots: Slot[] = [
    { label: 'Forehead',  zone: 'forehead',  key: 'hydration' },
    { label: 'Cheeks',    zone: 'cheekL',    key: 'inflammation' },
    { label: 'T-zone',    zone: 'tzone',     key: 'sunDamage' },
    { label: 'Jaw',       zone: 'jaw',       key: 'structure' },
    { label: 'Under-eye', zone: 'undereyeL', key: 'elasticity' },
  ];

  return slots.map(({ label, zone, key }) => {
    const score = safe(current?.[key]);
    const prevScore = safe(previous?.[key]);
    const displayScore = score ?? 0;
    return {
      label,
      zone,
      score: displayScore,
      delta: buildDelta(score, prevScore),
      note: score != null ? noteForScore(label, score) : 'No reading yet',
    };
  });
}

function formatDelta(d: number | null): string {
  if (d == null) return '—';
  if (d === 0) return '0';
  if (d > 0) return `+${d}`;
  return `−${Math.abs(d)}`;
}

function formatScanTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const month = date.toLocaleDateString(undefined, { month: 'short' });
  const day = date.getDate();
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${weekday} · ${month} ${day} · ${time}`;
}

// Same weighting as `scoreFromSignals` in skinInsights.ts / gamification.ts —
// keeps the composite shown here aligned with the score shown on Today, Story,
// and Personal Bests. Returns null when no valid channels are present so the
// UI can render an empty state rather than fabricate a number.
function compositeFromSignals(scores: SignalLike | undefined): number | null {
  if (!scores) return null;
  const s = {
    structure: Number.isFinite(scores.structure) ? (scores.structure as number) : null,
    hydration: Number.isFinite(scores.hydration) ? (scores.hydration as number) : null,
    inflammation: Number.isFinite(scores.inflammation) ? (scores.inflammation as number) : null,
    sunDamage: Number.isFinite(scores.sunDamage) ? (scores.sunDamage as number) : null,
    elasticity: Number.isFinite(scores.elasticity) ? (scores.elasticity as number) : null,
  };
  if (
    s.structure == null || s.hydration == null || s.inflammation == null ||
    s.sunDamage == null || s.elasticity == null
  ) {
    return null;
  }
  return Math.round(
    s.structure * 0.22 +
      s.hydration * 0.18 +
      s.inflammation * 0.20 +
      s.sunDamage * 0.20 +
      s.elasticity * 0.20,
  );
}

export default function FaceMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const modelOutputs = useStore((s) => s.modelOutputs);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const latest = modelOutputs.length > 0 ? modelOutputs[modelOutputs.length - 1] : null;
  const prev = modelOutputs.length > 1 ? modelOutputs[modelOutputs.length - 2] : null;
  const latestDaily = useMemo(() => {
    if (!latest) return null;
    return dailyRecords.find((d) => d.daily_id === latest.daily_id) ?? null;
  }, [dailyRecords, latest]);

  const composite = compositeFromSignals(latest?.signal_scores);
  const prevComposite = compositeFromSignals(prev?.signal_scores);
  const delta = composite != null && prevComposite != null ? composite - prevComposite : null;

  const facets = useMemo(
    () => mapSignalsToFacets(latest?.signal_scores, prev?.signal_scores),
    [latest?.signal_scores, prev?.signal_scores],
  );

  const zoneStyles = useMemo(
    () => ({
      forehead:  { fill: P.accent + '55', stroke: P.accent, strokeWidth: 0.8 },
      tzone:     { fill: P.accent2 + '66', stroke: P.accent2, strokeWidth: 0.8 },
      cheekL:    { fill: P.accent + '70', stroke: P.accent, strokeWidth: 0.8 },
      cheekR:    { fill: P.accent + '55', stroke: P.accent, strokeWidth: 0.8 },
      undereyeL: { fill: P.glow + '99', stroke: P.glow, strokeWidth: 0.6 },
      undereyeR: { fill: P.glow + '99', stroke: P.glow, strokeWidth: 0.6 },
      jaw:       { fill: P.accent + '40', stroke: P.accent, strokeWidth: 0.8 },
    }),
    [],
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[P.surface, P.bg]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.xs,
          paddingBottom: insets.bottom + Spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityLabel="Back"
            style={styles.backBtn}
          >
            <Feather name="arrow-left" size={20} color={P.ink} />
          </Pressable>
          <Text style={styles.headerLabel}>
            {(() => {
              // Prefer the real scan timestamp; fall back to the record's
              // calendar date (no time component) and finally to the empty
              // string. Never invent an "09:42" stub.
              if (latestDaily?.scanned_at) {
                const d = new Date(latestDaily.scanned_at);
                if (!Number.isNaN(d.getTime())) return formatScanTime(d);
              }
              if (latestDaily?.date) {
                const dateOnly = new Date(`${latestDaily.date}T00:00`);
                if (!Number.isNaN(dateOnly.getTime())) {
                  return `${dateOnly.toLocaleDateString(undefined, { weekday: 'short' })} · ${dateOnly.toLocaleDateString(undefined, { month: 'short' })} ${dateOnly.getDate()}`;
                }
              }
              return '';
            })()}
          </Text>
          <View style={styles.backBtn} />
        </View>

        {/* hero — face map + score */}
        <Animated.View
          entering={FadeInUp.duration(700).easing(Easing.out(Easing.cubic))}
          style={styles.heroCard}
        >
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>Today's read</Text>
              <View style={styles.scoreRow}>
                <Text style={styles.scoreBig}>{composite ?? '—'}</Text>
                <View>
                  <Text style={styles.scoreDelta}>{formatDelta(delta)}</Text>
                  <Text style={styles.scoreDeltaLabel}>
                    {prevComposite != null ? 'vs. last scan' : 'first read'}
                  </Text>
                </View>
              </View>
              <Text style={styles.heroQuote}>
                You look{' '}
                <Text style={styles.heroQuoteAccent}>well-rested</Text>.
              </Text>
            </View>

            <View style={styles.heroFaceWrap}>
              <FaceMapZones size={140} zones={zoneStyles} contour="ink" />
            </View>
          </View>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <Dot color={P.accent} />
              <Text style={styles.legendLabel}>Glowing</Text>
            </View>
            <View style={styles.legendItem}>
              <Dot color={P.accent2} />
              <Text style={styles.legendLabel}>Watching</Text>
            </View>
            <View style={styles.legendItem}>
              <Dot color={P.glow} />
              <Text style={styles.legendLabel}>Tender</Text>
            </View>
          </View>
        </Animated.View>

        {/* by-area section */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>By area</Text>
          <Text style={styles.sectionHint}>tap to drill in</Text>
        </View>

        <View style={styles.facetList}>
          {facets.map((f, idx) => (
            <Animated.View
              key={f.label}
              entering={FadeInDown.delay(80 * idx + 120)
                .duration(560)
                .easing(Easing.out(Easing.cubic))}
            >
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/scan/zone-detail',
                    params: { zone: f.zone, label: f.label, score: String(f.score) },
                  })
                }
                style={({ pressed }) => [styles.facetRow, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={`${f.label}, score ${f.score}`}
              >
                <View style={styles.facetMiniFace}>
                  <FaceMapZones
                    size={36}
                    contour="soft"
                    zones={{ [f.zone]: { fill: P.accent + '88' } }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.facetLabel}>{f.label}</Text>
                  <Text style={styles.facetNote}>{f.note}</Text>
                </View>
                <View style={styles.facetScoreCol}>
                  <Text style={styles.facetScore}>{f.score}</Text>
                  <Text
                    style={[
                      styles.facetDelta,
                      f.delta != null && f.delta > 0 && { color: P.accent },
                    ]}
                  >
                    {formatDelta(f.delta)}
                  </Text>
                </View>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        <Pressable
          onPress={() => router.push('/scan/method')}
          style={({ pressed }) => [styles.methodBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="How we read this"
        >
          <Text style={styles.methodBtnText}>How we read this</Text>
          <Feather name="arrow-right" size={14} color={P.muted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: P.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    color: P.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroCard: {
    marginHorizontal: 16,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 22,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    overflow: 'hidden',
  },
  // (corner glow blob removed: unanchored decoration, brand pass 2026-07)
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  eyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  scoreBig: {
    fontFamily: FontFamily.sans,
    fontSize: 64,
    lineHeight: 64,
    color: P.ink,
  },
  scoreDelta: {
    fontFamily: FontFamily.sansBold,
    fontSize: 13,
    color: P.accent,
  },
  scoreDeltaLabel: {
    fontFamily: FontFamily.sans,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 0.4,
  },
  heroQuote: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 20,
    color: P.ink,
    marginTop: 12,
    lineHeight: 26,
    maxWidth: 200,
  },
  heroQuoteAccent: {
    color: P.accent,
    fontFamily: FontFamily.accent,
  },
  heroFaceWrap: {
    marginLeft: 8,
    marginTop: -6,
  },
  legend: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: P.glow + '55',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 22,
    color: P.ink,
  },
  sectionHint: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  facetList: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 6,
  },
  facetRow: {
    backgroundColor: P.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: P.glow,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  facetMiniFace: {
    width: 36,
    height: 48,
    opacity: 0.9,
    overflow: 'hidden',
  },
  facetLabel: {
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
    color: P.ink,
  },
  facetNote: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    marginTop: 1,
  },
  facetScoreCol: {
    alignItems: 'flex-end',
  },
  facetScore: {
    fontFamily: FontFamily.sans,
    fontSize: 18,
    color: P.ink,
    lineHeight: 18,
  },
  facetDelta: {
    fontFamily: FontFamily.sansBold,
    fontSize: 10,
    color: P.muted,
    marginTop: 2,
  },
  methodBtn: {
    marginTop: 24,
    marginHorizontal: 24,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  methodBtnText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 12,
    color: P.ink,
    letterSpacing: 0.4,
  },
});
