import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AtmosphereScreen } from '../src/components/AtmosphereScreen';
import { Button } from '../src/components/Button';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
} from '../src/constants/theme';
import { METRIC_GUIDE } from '../src/constants/signals';
import {
  buildOverallSkinInsight,
  getLatestDailyForOutput,
} from '../src/services/skinInsights';
import { useStore } from '../src/store/useStore';
import { gateWithPaywall } from '../src/services/subscription';

export default function SkinMetricsScreen() {
  const router = useRouter();
  const modelOutputs = useStore((s) => s.modelOutputs);
  const dailyRecords = useStore((s) => s.dailyRecords);

  const latestOutput = modelOutputs.length > 0 ? modelOutputs[modelOutputs.length - 1] : null;
  const baselineOutput = modelOutputs.length > 0 ? modelOutputs[0] : null;
  const latestDaily = getLatestDailyForOutput(latestOutput, dailyRecords);
  const baselineDaily = getLatestDailyForOutput(baselineOutput, dailyRecords);

  const overallInsight = useMemo(
    () =>
      buildOverallSkinInsight({
        latestOutput,
        baselineOutput,
        latestDaily,
        baselineDaily,
        serverSignalScores: latestOutput?.signal_scores,
        serverSignalFeatures: latestOutput?.signal_features,
        serverSignalConfidence: latestOutput?.signal_confidence,
        serverLesions: latestOutput?.lesions,
      }),
    [latestOutput, baselineOutput, latestDaily, baselineDaily]
  );

  return (
    <AtmosphereScreen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Learn more</Text>
        <Text style={styles.title}>How your skin metrics are assessed</Text>
        <Text style={styles.subtitle}>
          Tap any metric to open a detailed assessment with face-map highlights and product actions.
        </Text>
      </View>

      {overallInsight ? (
        <View style={styles.overallCard}>
          <Text style={styles.overallLabel}>Overall score</Text>
          <Text style={styles.overallScore}>
            {overallInsight.score} <Text style={styles.overallStatus}>{overallInsight.statusLabel}</Text>
          </Text>
          <Text style={styles.overallAction}>{overallInsight.actionStatement}</Text>
          <View style={styles.signalRow}>
            <Text style={styles.signalChip}>Structure {overallInsight.signals.structure}</Text>
            <Text style={styles.signalChip}>Hydration {overallInsight.signals.hydration}</Text>
            <Text style={styles.signalChip}>Inflammation {overallInsight.signals.inflammation}</Text>
            <Text style={styles.signalChip}>Sun Damage {overallInsight.signals.sunDamage}</Text>
            <Text style={styles.signalChip}>Elasticity {overallInsight.signals.elasticity}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No metric data yet</Text>
          <Text style={styles.emptyCopy}>
            Run your first scan to unlock acne, sun damage, and skin age assessments.
          </Text>
          <Button title="Start first scan" onPress={async () => {
            if (!(await gateWithPaywall())) return;
            router.push('/scan/camera');
          }} />
        </View>
      )}

      <View style={styles.metricStack}>
        {METRIC_GUIDE.map((metric) => {
          const score =
            metric.key === 'acne'
              ? latestOutput?.acne_score
              : metric.key === 'sun_damage'
                ? latestOutput?.sun_damage_score
                : latestOutput?.skin_age_score;

          return (
            <TouchableOpacity
              key={metric.key}
              activeOpacity={0.85}
              style={styles.metricCard}
              onPress={() =>
                router.push({
                  pathname: '/skin-metric/[metric]',
                  params: { metric: metric.key },
                })
              }
            >
              <View style={styles.metricCardHeader}>
                <Text style={styles.metricTitle}>{metric.title}</Text>
                <Text style={[styles.metricScore, { color: metric.color }]}>
                  {score ?? '--'}
                  {score !== undefined ? '/100' : ''}
                </Text>
              </View>
              <Text style={styles.metricSubtitle}>{metric.subtitle}</Text>
              <Text style={styles.metricDetail}>{metric.detail}</Text>
              <Text style={styles.metricCta}>Open detailed assessment</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Button title="Back to home" variant="ghost" onPress={() => router.back()} />
    </AtmosphereScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    color: Colors.text,
    fontFamily: FontFamily.serifBold,
    fontSize: FontSize.hero,
    lineHeight: 41,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 23,
  },
  overallCard: {
    backgroundColor: Colors.glassStrong,
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  overallLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  overallScore: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.display,
    lineHeight: 52,
  },
  overallStatus: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  overallAction: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  signalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  signalChip: {
    color: Colors.text,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  metricStack: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  metricCard: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  metricTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
  },
  metricScore: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  metricSubtitle: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  metricDetail: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  metricCta: {
    marginTop: Spacing.xs,
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  emptyState: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
  },
  emptyCopy: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
});
