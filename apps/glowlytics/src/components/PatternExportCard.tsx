import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import type { Pattern, PatternSignal } from '../types';
import { Colors, FontFamily } from '../constants/theme';
import { SIGNAL_COLORS } from '../constants/signals';

// This view is rendered OFF-SCREEN and captured via react-native-view-shot.
// Dimensions are fixed at 1080x1920 (Instagram Story aspect).
// The view is never displayed to the user directly.

interface Props {
  pattern: Pattern;
}

export const PatternExportCard: React.FC<Props> = ({ pattern }) => {
  const signalColor =
    (SIGNAL_COLORS as Record<string, string | undefined>)[pattern.signal] ??
    Colors.primary;
  const chartW = 900;
  const chartH = 400;
  const points = pattern.chartData.slice(-30);
  const polyline =
    points.length > 1
      ? points
          .map((p, i) => {
            const x = (i / (points.length - 1)) * chartW;
            const y = chartH - (p.signalValue / 100) * chartH;
            return `${x},${y}`;
          })
          .join(' ')
      : '';

  return (
    <View collapsable={false} style={styles.container}>
      <Text style={styles.wordmark}>Glowlytics</Text>

      <View style={styles.headlineBlock}>
        <Text style={styles.headline}>{pattern.insightText}</Text>
      </View>

      {polyline ? (
        <View style={styles.chartWrap}>
          <Svg width={chartW} height={chartH}>
            <Polyline
              points={polyline}
              fill="none"
              stroke={signalColor}
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      ) : null}

      <Text style={styles.sample}>Based on {pattern.sampleSize} days</Text>

      <Text style={styles.url}>glowlytics.ai</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 1080,
    height: 1920,
    backgroundColor: Colors.background,
    paddingHorizontal: 90,
    paddingVertical: 120,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    color: Colors.primary,
    fontFamily: FontFamily.sansBold,
    fontSize: 42,
    letterSpacing: 2,
  },
  headlineBlock: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  headline: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: 92,
    lineHeight: 104,
    textAlign: 'center',
  },
  chartWrap: {
    paddingVertical: 60,
  },
  sample: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: 36,
    marginTop: 20,
  },
  url: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: 32,
    letterSpacing: 1,
  },
});
