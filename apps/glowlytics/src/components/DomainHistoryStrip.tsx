/**
 * DomainHistoryStrip — six inline sparklines, one per BoneDomain, stacked
 * vertically. Each line uses its domain's accent colour so the eye reads
 * "this is symmetry / mandibular / etc." without explicit labels.
 *
 * Shown on bone-results page 2 ("By area") next to the radial chart so a
 * user can see at once: which domain is dragging now (radial pinch), and
 * which domain has been most volatile over time (steepest sparkline).
 *
 * Returns null when there are fewer than 2 scans with bone-structure data —
 * a single point isn't a trend.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { useStore } from '../store/useStore';
import { BONE_DOMAINS } from '../constants/boneStructure';
import { Colors, FontFamily, FontSize, Spacing } from '../constants/theme';
import type { BoneDomain } from '../types';

interface Props {
  /** Cap the number of points rendered per line. Default 12. */
  maxPoints?: number;
}

interface DomainSeries {
  key: BoneDomain;
  label: string;
  accent: string;
  scores: number[];
}

export const DomainHistoryStrip: React.FC<Props> = ({ maxPoints = 12 }) => {
  // Stable-ref pattern — see HarmonyTrendCard / HarmonyFocusCard for the
  // full rationale.  Returning a fresh array of objects from a Zustand
  // selector every call thrashes the consumer tree under store churn.
  const modelOutputs = useStore((s) => s.modelOutputs);
  const series: DomainSeries[] = useMemo(() => {
    const points: Array<Partial<Record<BoneDomain, number>>> = [];
    for (const m of modelOutputs ?? []) {
      if (!m) continue;
      const ds = m.bone_structure?.domain_scores;
      if (!ds) continue;
      const point: Partial<Record<BoneDomain, number>> = {};
      let hasAny = false;
      for (const d of BONE_DOMAINS) {
        const v = ds[d.key];
        if (typeof v === 'number' && Number.isFinite(v)) {
          point[d.key] = v;
          hasAny = true;
        }
      }
      if (hasAny) points.push(point);
    }
    const trimmed = points.slice(-maxPoints);
    return BONE_DOMAINS.map((d) => ({
      key: d.key,
      label: d.label,
      accent: d.accent,
      scores: trimmed.map((p) => p[d.key]).filter((v): v is number => typeof v === 'number'),
    }));
  }, [modelOutputs, maxPoints]);

  const enoughHistory = series.some((s) => s.scores.length >= 2);
  if (!enoughHistory) return null;

  return (
    <View style={styles.wrap}>
      {series.map((s) => (
        <DomainRow key={s.key} series={s} />
      ))}
    </View>
  );
};

// ───────────────────────────────────────────────────────────────────────
// Per-domain row
// ───────────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 24;
const SPARK_WIDTH = 90;
const SPARK_PAD = 3;

const DomainRow: React.FC<{ series: DomainSeries }> = ({ series }) => {
  const projected = useMemo(() => {
    if (series.scores.length < 2) return null;
    const min = Math.min(...series.scores);
    const max = Math.max(...series.scores);
    const range = Math.max(1, max - min);
    return series.scores.map((s, i) => {
      const x = (i / (series.scores.length - 1)) * (SPARK_WIDTH - SPARK_PAD * 2) + SPARK_PAD;
      const y = ROW_HEIGHT - SPARK_PAD - ((s - min) / range) * (ROW_HEIGHT - SPARK_PAD * 2);
      return { x, y };
    });
  }, [series.scores]);

  const latest = series.scores.length > 0 ? series.scores[series.scores.length - 1] : null;
  const first = series.scores.length > 0 ? series.scores[0] : null;
  const delta = latest != null && first != null ? Math.round(latest - first) : null;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{series.label}</Text>
      <View style={styles.spark}>
        {projected ? (
          <Svg width={SPARK_WIDTH} height={ROW_HEIGHT}>
            <Polyline
              points={projected.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke={series.accent}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
            <Circle
              cx={projected[projected.length - 1].x}
              cy={projected[projected.length - 1].y}
              r={2.4}
              fill={series.accent}
              stroke={Colors.background}
              strokeWidth={1}
            />
          </Svg>
        ) : (
          <View style={styles.sparkPlaceholder} />
        )}
      </View>
      <View style={styles.valueCol}>
        <Text style={[styles.value, { color: series.accent }]}>{latest != null ? latest : '—'}</Text>
        {delta != null && delta !== 0 && (
          <Text style={[styles.deltaText, { color: delta > 0 ? Colors.success : Colors.warning }]}>
            {delta > 0 ? '+' : ''}{delta}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  label: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  spark: {
    width: SPARK_WIDTH,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkPlaceholder: {
    width: SPARK_WIDTH,
    height: 1,
    backgroundColor: Colors.borderStrong,
    opacity: 0.3,
  },
  valueCol: {
    width: 50,
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
  },
  value: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
    minWidth: 22,
    textAlign: 'right',
  },
  deltaText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
    minWidth: 22,
    textAlign: 'right',
  },
});
