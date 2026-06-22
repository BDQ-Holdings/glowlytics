/**
 * HarmonyTrendCard — surfaces Harmony movement on the Today screen.
 *
 * Renders the user's last N Harmony scores as a small inline sparkline
 * alongside the current value and delta from their first logged scan.
 * Returns null when there are fewer than 2 scans with bone-structure
 * data, since a single point isn't a trend.
 *
 * Tapping the card opens the latest bone-results.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Defs, LinearGradient as SvgLG, Polyline, Stop } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { harmonyStatusLabel, HARMONY_ACCENT } from '../constants/boneStructure';
import { BorderRadius, Colors, FontFamily, FontSize, Glow, Spacing } from '../constants/theme';

interface SamplePoint {
  dailyId: string;
  date?: string;
  score: number;
}

interface Props {
  /** Cap the number of points rendered. Default 10 — keeps the sparkline tight. */
  maxPoints?: number;
}

export const HarmonyTrendCard: React.FC<Props> = ({ maxPoints = 10 }) => {
  const router = useRouter();

  // Pull the raw outputs reference (stable across renders unless the array
  // actually changes); derive the sparkline series via useMemo so each
  // render of THIS component doesn't synthesise a fresh array reference.
  // Zustand v5 selectors that return new array/object refs each call cause
  // unnecessary re-renders and, in render-storms during sign-in / store
  // hydration, can crash the consumer tree.
  const modelOutputs = useStore((s) => s.modelOutputs);
  const points: SamplePoint[] = useMemo(() => {
    const out: SamplePoint[] = [];
    for (const m of modelOutputs ?? []) {
      if (!m) continue;
      const h = m.bone_structure?.harmony;
      if (typeof h === 'number' && Number.isFinite(h)) {
        out.push({ dailyId: m.daily_id, score: h });
      }
    }
    return out.slice(-maxPoints);
  }, [modelOutputs, maxPoints]);

  // Sparkline geometry. `projected` is computed unconditionally — guarding the
  // <2-point case inside — so the hook order is identical on every render.
  // An async attachBoneStructure can take this card from 1 → 2 points while
  // mounted; a useMemo placed after the early-return below would change the
  // hook count between renders and crash the tree ("rendered more hooks").
  const width = 100;
  const height = 28;
  const pad = 4;
  const projected = useMemo(() => {
    if (points.length < 2) return [] as { x: number; y: number }[];
    const min = Math.min(...points.map((p) => p.score));
    const max = Math.max(...points.map((p) => p.score));
    const range = Math.max(1, max - min);
    return points.map((p, i) => {
      const x = (i / (points.length - 1)) * (width - pad * 2) + pad;
      const y = height - pad - ((p.score - min) / range) * (height - pad * 2);
      return { x, y };
    });
  }, [points]);

  if (points.length < 2) return null;

  const latest = points[points.length - 1];
  const first = points[0];
  const delta = Math.round(latest.score - first.score);
  const status = harmonyStatusLabel(latest.score);

  const polylinePoints = projected.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = projected[projected.length - 1];

  const deltaUp = delta > 0;
  const deltaFlat = delta === 0;
  const deltaColor = deltaFlat ? Colors.textMuted : deltaUp ? Colors.success : Colors.warning;

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push({ pathname: '/scan/bone-results', params: { dailyId: latest.dailyId } })}
      accessibilityLabel={`Harmony score ${latest.score}, ${status}. ${deltaFlat ? 'No change' : `${deltaUp ? 'Up' : 'Down'} ${Math.abs(delta)} since first scan.`} Open results.`}
    >
      <View style={styles.left}>
        <View style={styles.labelRow}>
          <Feather name="hexagon" size={11} color={HARMONY_ACCENT} />
          <Text style={styles.label}>Harmony trend</Text>
        </View>
        <View style={styles.valueRow}>
          <Text style={styles.score}>{latest.score}</Text>
          <Text style={styles.status}>{status}</Text>
        </View>
        <View style={styles.deltaRow}>
          {!deltaFlat && (
            <Feather
              name={deltaUp ? 'trending-up' : 'trending-down'}
              size={11}
              color={deltaColor}
            />
          )}
          <Text style={[styles.deltaText, { color: deltaColor }]}>
            {deltaFlat
              ? `Steady across ${points.length} scans`
              : `${deltaUp ? '+' : ''}${delta} since first scan`}
          </Text>
        </View>
      </View>

      <View style={styles.right}>
        <Svg width={width} height={height}>
          <Defs>
            <SvgLG id="harmonySparkFade" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={HARMONY_ACCENT} stopOpacity="0.25" />
              <Stop offset="100%" stopColor={HARMONY_ACCENT} stopOpacity="1" />
            </SvgLG>
          </Defs>
          <Polyline
            points={polylinePoints}
            fill="none"
            stroke="url(#harmonySparkFade)"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {last && (
            <Circle
              cx={last.x} cy={last.y} r={2.4}
              fill={HARMONY_ACCENT}
              stroke={Colors.background}
              strokeWidth={1}
            />
          )}
        </Svg>
        <Feather name="chevron-right" size={14} color={Colors.textMuted} />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.xl,
    backgroundColor: Glow.palette.surface,
    borderWidth: 1,
    borderColor: HARMONY_ACCENT + '22',
  },
  left: {
    flex: 1,
    gap: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  label: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
    marginTop: 2,
  },
  score: {
    color: HARMONY_ACCENT,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    letterSpacing: -1,
  },
  status: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  deltaText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
