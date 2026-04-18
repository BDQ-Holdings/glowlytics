import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
} from '../constants/theme';

interface Props {
  label: string;
  score: number;
  delta?: number;
  color: string;
  sparklineData?: number[];
  compact?: boolean;
  icon?: string;
  lowLabel?: string;
  highLabel?: string;
  statusLabel?: string;
}

const TrendRail: React.FC<{
  data: number[];
  color: string;
  compact?: boolean;
}> = ({ data: raw, color, compact }) => {
  const data = raw.filter(Number.isFinite);
  const width = compact ? 132 : 208;
  const height = compact ? 28 : 34;

  if (data.length < 2) {
    return (
      <View style={[styles.flatRail, { width }]}>
        <View style={[styles.flatTrack, { backgroundColor: Colors.divider }]} />
        <View style={[styles.flatDot, { backgroundColor: color, left: width * 0.68 }]} />
      </View>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');

  const last = points.split(' ').pop()?.split(',') || ['0', '0'];

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={points}
        fill="none"
        stroke={Colors.divider}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={Number(last[0])} cy={Number(last[1])} r={3.5} fill={color} />
    </Svg>
  );
};

export const ScoreTile: React.FC<Props> = ({
  label,
  score,
  delta,
  color,
  sparklineData,
  compact,
  icon,
  lowLabel = 'Low',
  highLabel = 'High',
  statusLabel,
}) => {
  const resolvedStatus = statusLabel || (score <= 25 ? 'Calm' : score <= 50 ? 'Balanced' : score <= 75 ? 'Elevated' : 'Active');

  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      <View style={[styles.tint, { backgroundColor: color + '12' }]} />
      <View style={styles.topRow}>
        <View>
          <Text style={styles.label}>{label}</Text>
          <View style={styles.valueRow}>
            {icon ? <Text style={styles.icon}>{icon}</Text> : null}
            <Text style={[styles.score, compact && styles.compactScore]}>{score}</Text>
            <Text style={styles.scoreUnit}>/100</Text>
          </View>
        </View>
        <View style={styles.metaBlock}>
          <Text style={[styles.status, { color }]}>{resolvedStatus}</Text>
          {delta !== undefined ? (
            <View
              style={[
                styles.deltaBadge,
                { backgroundColor: (delta <= 0 ? Colors.success : Colors.error) + '16' },
              ]}
            >
              <Text
                style={[
                  styles.deltaText,
                  { color: delta <= 0 ? Colors.success : Colors.error },
                ]}
              >
                {delta > 0 ? '+' : ''}
                {delta}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.railBlock}>
        <TrendRail
          data={sparklineData && sparklineData.length > 1 ? sparklineData : [score]}
          color={color}
          compact={compact}
        />
        <View style={styles.anchorRow}>
          <Text style={styles.anchorLabel}>{lowLabel}</Text>
          <Text style={styles.anchorLabel}>{highLabel}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.glass,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  compactContainer: {
    paddingVertical: Spacing.md,
  },
  tint: {
    position: 'absolute',
    top: -18,
    left: -12,
    width: 140,
    height: 120,
    borderRadius: BorderRadius.full,
    opacity: 0.85,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  label: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  icon: {
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  score: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.hero,
    lineHeight: 42,
  },
  compactScore: {
    fontSize: FontSize.xxl,
    lineHeight: 32,
  },
  scoreUnit: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    paddingBottom: 4,
  },
  metaBlock: {
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  status: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  deltaBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  deltaText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
  },
  railBlock: {
    gap: Spacing.xs,
  },
  anchorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  anchorLabel: {
    color: Colors.textDim,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  flatRail: {
    justifyContent: 'center',
    height: 28,
  },
  flatTrack: {
    height: 2,
    borderRadius: BorderRadius.full,
  },
  flatDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    top: 10,
  },
});
