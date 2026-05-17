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
  delta: number;
  note: string;
};

/**
 * Map the production 5-signal model to the design's 5 face areas.
 * We keep the model unchanged — this is purely the visual mapping.
 */
function mapSignalsToFacets(signals: Record<string, number> | undefined): FacetRow[] {
  const s = signals ?? {};
  return [
    {
      label: 'Forehead',
      zone: 'forehead',
      score: Math.round(s.hydration ?? 70),
      delta: 3,
      note: 'Hydration crisp this morning',
    },
    {
      label: 'Cheeks',
      zone: 'cheekL',
      score: Math.round(s.inflammation != null ? 100 - s.inflammation : 76),
      delta: 5,
      note: 'No new redness · holding',
    },
    {
      label: 'T-zone',
      zone: 'tzone',
      score: Math.round(s.sunDamage != null ? 100 - s.sunDamage * 0.6 : 71),
      delta: -2,
      note: 'A touch of shine vs. typical',
    },
    {
      label: 'Jaw',
      zone: 'jaw',
      score: Math.round(s.structure ?? 88),
      delta: 1,
      note: 'Clear · 12-day streak',
    },
    {
      label: 'Under-eye',
      zone: 'undereyeL',
      score: Math.round(s.elasticity ?? 62),
      delta: 0,
      note: 'Still a bit tired-looking',
    },
  ];
}

function formatDelta(d: number): string {
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

  const composite = latest?.signal_scores
    ? Math.round(
        Object.values(latest.signal_scores).reduce((a, b) => a + (b as number), 0) /
          Math.max(Object.keys(latest.signal_scores).length, 1),
      )
    : 78;

  const prevComposite = prev?.signal_scores
    ? Math.round(
        Object.values(prev.signal_scores).reduce((a, b) => a + (b as number), 0) /
          Math.max(Object.keys(prev.signal_scores).length, 1),
      )
    : composite - 5;

  const delta = composite - prevComposite;

  const facets = useMemo(
    () => mapSignalsToFacets(latest?.signal_scores as Record<string, number> | undefined),
    [latest?.signal_scores],
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
            {formatScanTime(latestDaily?.date ? new Date(`${latestDaily.date}T09:42`) : new Date())}
          </Text>
          <View style={styles.backBtn} />
        </View>

        {/* hero — face map + score */}
        <Animated.View
          entering={FadeInUp.duration(700).easing(Easing.out(Easing.cubic))}
          style={styles.heroCard}
        >
          <View style={styles.heroGlow} pointerEvents="none" />

          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>Today's read</Text>
              <View style={styles.scoreRow}>
                <Text style={styles.scoreBig}>{composite}</Text>
                <View>
                  <Text style={styles.scoreDelta}>{formatDelta(delta)}</Text>
                  <Text style={styles.scoreDeltaLabel}>vs. yesterday</Text>
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
                      f.delta > 0 && { color: P.accent },
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
  heroGlow: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: P.glow,
    opacity: 0.6,
  },
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
