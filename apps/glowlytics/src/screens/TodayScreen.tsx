import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AtmosphereScreen } from '../components/AtmosphereScreen';
import { ActionCard } from '../components/ActionCard';
import { Button } from '../components/Button';
import { ConfidenceBadge } from '../components/ConfidenceBadge';
import { ScoreTile } from '../components/ScoreTile';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Shadows,
  Spacing,
} from '../constants/theme';
import { formatMetricStatus } from '../constants/signals';
import { useStore } from '../store/useStore';

export default function TodayScreen() {
  const router = useRouter();
  const protocol = useStore((s) => s.protocol);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const modelOutputs = useStore((s) => s.modelOutputs);

  const latestOutput = modelOutputs.length > 0 ? modelOutputs[modelOutputs.length - 1] : null;
  const baseline = modelOutputs.length > 0 ? modelOutputs[0] : null;

  const streak = useMemo(() => {
    const sorted = [...dailyRecords].sort((a, b) => b.date.localeCompare(a.date));
    if (sorted.length === 0) return 0;

    let value = 0;
    const today = new Date();

    for (let i = 0; i < sorted.length; i++) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - i);
      const expectedStr = expected.toISOString().split('T')[0];
      if (sorted.find((record) => record.date === expectedStr)) {
        value += 1;
      } else {
        break;
      }
    }

    return value;
  }, [dailyRecords]);

  const outputHistory = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const records = dailyRecords.filter((record) => record.date >= cutoffStr);
    const ids = new Set(records.map((record) => record.daily_id));
    return modelOutputs.filter((output) => ids.has(output.daily_id));
  }, [dailyRecords, modelOutputs]);

  const todayStr = new Date().toISOString().split('T')[0];
  const scannedToday = dailyRecords.some((record) => record.date === todayStr);

  const acneHistory = outputHistory.map((output) => output.acne_score);
  const sunHistory = outputHistory.map((output) => output.sun_damage_score);
  const ageHistory = outputHistory.map((output) => output.skin_age_score);

  const goals = {
    acne: {
      label: 'Acne',
      score: latestOutput?.acne_score,
      color: Colors.acne,
      delta: latestOutput && baseline ? latestOutput.acne_score - baseline.acne_score : undefined,
      history: acneHistory,
      icon: 'A',
    },
    sun_damage: {
      label: 'Sun Damage',
      score: latestOutput?.sun_damage_score,
      color: Colors.sunDamage,
      delta: latestOutput && baseline ? latestOutput.sun_damage_score - baseline.sun_damage_score : undefined,
      history: sunHistory,
      icon: 'S',
    },
    skin_age: {
      label: 'Skin Age',
      score: latestOutput?.skin_age_score,
      color: Colors.skinAge,
      delta: latestOutput && baseline ? latestOutput.skin_age_score - baseline.skin_age_score : undefined,
      history: ageHistory,
      icon: 'G',
    },
  } as const;

  const goalKey = protocol?.primary_goal || 'acne';
  const spotlightMetric = goals[goalKey];
  const primaryAction = scannedToday && latestOutput ? '/scan/results' : '/scan/camera';

  return (
    <AtmosphereScreen contentContainerStyle={styles.screenContent}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Today</Text>
          <Text style={styles.date}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
        <TouchableOpacity style={styles.reportButton} onPress={() => router.push('/report/generate')}>
          <Text style={styles.reportButtonText}>Report</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        {Object.values(goals).map((metric) => (
          <View key={metric.label} style={styles.summaryChip}>
            <Text style={[styles.summaryScore, { color: metric.color }]}>
              {metric.score ?? '--'}
            </Text>
            <Text style={styles.summaryLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroGlow} />
        <View style={styles.heroHeader}>
          <Text style={styles.heroEyebrow}>
            {scannedToday ? 'Today refreshed' : 'Today spotlight'}
          </Text>
          {latestOutput ? <ConfidenceBadge level={latestOutput.confidence} /> : null}
        </View>
        <Text style={styles.heroTitle}>
          {latestOutput
            ? `${spotlightMetric.label} is ${formatMetricStatus(spotlightMetric.score || 0).toLowerCase()} today.`
            : 'Build your first baseline.'}
        </Text>
        <Text style={styles.heroCopy}>
          {latestOutput
            ? latestOutput.recommended_action
            : 'Run your first guided scan to unlock trend lines, context-aware insights, and report previews.'}
        </Text>

        <View style={styles.heroMetricRow}>
          <View>
            <Text style={styles.heroMetricLabel}>{spotlightMetric.label} signal</Text>
            <View style={styles.heroMetricValueRow}>
              <Text style={styles.heroMetricValue}>{spotlightMetric.score ?? '--'}</Text>
              {spotlightMetric.delta !== undefined ? (
                <Text
                  style={[
                    styles.heroMetricDelta,
                    { color: spotlightMetric.delta <= 0 ? Colors.success : Colors.error },
                  ]}
                >
                  {spotlightMetric.delta > 0 ? '+' : ''}
                  {spotlightMetric.delta}
                </Text>
              ) : null}
            </View>
          </View>
          <Button
            title={scannedToday && latestOutput ? "View today's results" : "Start today's scan"}
            onPress={() => router.push(primaryAction)}
            size="lg"
          />
        </View>
      </View>

      <View style={styles.infoGrid}>
        <View style={styles.infoCard}>
          <Text style={styles.infoEyebrow}>Cadence</Text>
          <Text style={styles.infoValue}>{streak} day streak</Text>
          <Text style={styles.infoCopy}>
            {protocol?.scan_region
              ? `Same-region scans on ${protocol.scan_region.replace(/_/g, ' ')} keep the trend cleaner.`
              : 'Choose a consistent region for cleaner signal tracking.'}
          </Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoEyebrow}>Program</Text>
          <Text style={styles.infoValue}>
            {protocol?.primary_goal ? protocol.primary_goal.replace(/_/g, ' ') : 'Baseline'}
          </Text>
          <Text style={styles.infoCopy}>
            {dailyRecords.length > 0
              ? `${dailyRecords.length} scans captured so far.`
              : 'No scans captured yet.'}
          </Text>
        </View>
      </View>

      {latestOutput ? (
        <View style={styles.metricStack}>
          <ScoreTile
            label="Acne"
            score={latestOutput.acne_score}
            delta={goals.acne.delta}
            color={Colors.acne}
            sparklineData={acneHistory}
            compact
            lowLabel="Baseline"
            highLabel="Today"
            statusLabel={formatMetricStatus(latestOutput.acne_score)}
          />
          <ScoreTile
            label="Sun Damage"
            score={latestOutput.sun_damage_score}
            delta={goals.sun_damage.delta}
            color={Colors.sunDamage}
            sparklineData={sunHistory}
            compact
            lowLabel="Baseline"
            highLabel="Today"
            statusLabel={formatMetricStatus(latestOutput.sun_damage_score)}
          />
          <ScoreTile
            label="Skin Age"
            score={latestOutput.skin_age_score}
            delta={goals.skin_age.delta}
            color={Colors.skinAge}
            sparklineData={ageHistory}
            compact
            lowLabel="Baseline"
            highLabel="Today"
            statusLabel={formatMetricStatus(latestOutput.skin_age_score)}
          />
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No scan data yet</Text>
          <Text style={styles.emptyCopy}>
            Your first baseline will unlock this dashboard and the shareable report preview.
          </Text>
        </View>
      )}

      {latestOutput?.recommended_action ? (
        <ActionCard
          driver={latestOutput.primary_driver || 'daily insight'}
          action={latestOutput.recommended_action}
          supportingText="One best next step, kept intentionally focused so the dashboard stays fast to scan."
        />
      ) : null}

      <View style={styles.utilityStrip}>
        <TouchableOpacity style={styles.utilityAction} onPress={() => router.push('/report/generate')}>
          <Text style={styles.utilityLabel}>Share report</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.utilityAction} onPress={() => router.push('/onboarding/products')}>
          <Text style={styles.utilityLabel}>Products</Text>
        </TouchableOpacity>
      </View>
    </AtmosphereScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: 148,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  date: {
    marginTop: Spacing.xs,
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
  },
  reportButton: {
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  reportButtonText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  summaryChip: {
    flex: 1,
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  summaryScore: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
  },
  summaryLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.glassStrong,
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.card,
  },
  heroGlow: {
    position: 'absolute',
    right: -40,
    top: -30,
    width: 180,
    height: 180,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glowPrimary,
    opacity: 0.22,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  heroEyebrow: {
    color: Colors.secondaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  heroTitle: {
    color: Colors.text,
    fontFamily: FontFamily.serifBold,
    fontSize: FontSize.hero,
    lineHeight: 42,
    maxWidth: '92%',
  },
  heroCopy: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 24,
  },
  heroMetricRow: {
    gap: Spacing.lg,
  },
  heroMetricLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.xs,
  },
  heroMetricValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  heroMetricValue: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.display,
    lineHeight: 52,
  },
  heroMetricDelta: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    marginBottom: 8,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  infoCard: {
    flex: 1,
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  infoEyebrow: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  infoValue: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    textTransform: 'capitalize',
  },
  infoCopy: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  metricStack: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
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
    lineHeight: 23,
  },
  utilityStrip: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  utilityAction: {
    flex: 1,
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  utilityLabel: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
});
