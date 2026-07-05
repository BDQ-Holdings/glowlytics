import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { AtmosphereScreen } from '../../src/components/AtmosphereScreen';
import { Button } from '../../src/components/Button';
import { ClinicalSourcesCard } from '../../src/components/ClinicalSourcesCard';
import { FaceAssessmentMap } from '../../src/components/FaceAssessmentMap';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Glow,
  Spacing,
} from '../../src/constants/theme';
import {
  buildMetricDetailInsight,
  getLatestDailyForOutput,
  type SeverityLevel,
  type SkinMetricKey,
} from '../../src/services/skinInsights';
import { useStore } from '../../src/store/useStore';
import { resolveScanEntryRoute } from '../../src/utils/scanConsentRoute';
import { activeProducts } from '../../src/services/ritual';

const validMetrics: SkinMetricKey[] = ['acne', 'sun_damage', 'skin_age'];

// ---------------------------------------------------------------------------
// Per-metric personality
// ---------------------------------------------------------------------------
interface MetricPersonality {
  color: string;
  glow: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  tagline: string;
}

const METRIC_PERSONALITY: Record<SkinMetricKey, MetricPersonality> = {
  acne: {
    color: Colors.acne,
    glow: 'rgba(209, 90, 87, 0.12)',
    icon: 'thermometer',
    tagline: 'Inflammation + congestion signal',
  },
  sun_damage: {
    color: Colors.sunDamage,
    glow: 'rgba(184, 140, 62, 0.12)',
    icon: 'sun',
    tagline: 'UV and pigmentation load',
  },
  skin_age: {
    color: Colors.skinAge,
    glow: 'rgba(75, 127, 204, 0.12)',
    icon: 'clock',
    tagline: 'Texture + elasticity drift',
  },
};

const severityMeta: Record<SeverityLevel, { label: string; color: string; icon: React.ComponentProps<typeof Feather>['name'] }> = {
  low: { label: 'Low', color: Colors.success, icon: 'check-circle' },
  moderate: { label: 'Moderate', color: Colors.warning, icon: 'alert-circle' },
  high: { label: 'High', color: Colors.error, icon: 'alert-triangle' },
};

const toMetricLabel = (metric: SkinMetricKey) =>
  metric === 'sun_damage' ? 'Sun Damage' : metric === 'skin_age' ? 'Skin Age' : 'Acne';

// ---------------------------------------------------------------------------
// Recommendation card config
// ---------------------------------------------------------------------------
const REC_CONFIG = {
  stop: {
    bg: 'rgba(209, 67, 67, 0.06)',
    border: 'rgba(209, 67, 67, 0.15)',
    labelColor: Colors.error,
    icon: 'x-circle' as const,
  },
  consider: {
    bg: 'rgba(192, 123, 42, 0.06)',
    border: 'rgba(192, 123, 42, 0.15)',
    labelColor: Colors.warning,
    icon: 'plus-circle' as const,
  },
  continue: {
    bg: 'rgba(52, 167, 123, 0.06)',
    border: 'rgba(52, 167, 123, 0.15)',
    labelColor: Colors.success,
    icon: 'check-circle' as const,
  },
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function MetricAssessmentDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ metric?: string | string[] }>();
  const modelOutputs = useStore((s) => s.modelOutputs);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const allProducts = useStore((s) => s.products);
  const products = useMemo(() => activeProducts(allProducts), [allProducts]);
  const aiProcessingConsentGranted = useStore((s) => s.aiProcessingConsentGranted);

  const resolvedMetricParam = Array.isArray(params.metric) ? params.metric[0] : params.metric;
  const metric = validMetrics.includes(resolvedMetricParam as SkinMetricKey)
    ? (resolvedMetricParam as SkinMetricKey)
    : null;

  const latestOutput = modelOutputs.length > 0 ? modelOutputs[modelOutputs.length - 1] : null;
  const latestDaily = getLatestDailyForOutput(latestOutput, dailyRecords);

  const detail = useMemo(
    () =>
      metric
        ? buildMetricDetailInsight({
            metric,
            latestOutput,
            latestDaily,
            products,
          })
        : null,
    [metric, latestOutput, latestDaily, products]
  );

  const [selectedZone, setSelectedZone] = useState('');

  useEffect(() => {
    if (detail?.zones.length) {
      setSelectedZone(detail.zones[0].key);
    }
  }, [detail]);

  const activeZone = detail?.zones.find((zone) => zone.key === selectedZone) || detail?.zones[0];

  // ---- Invalid / empty states ----
  if (!metric) {
    return (
      <AtmosphereScreen scroll={false} contentContainerStyle={styles.invalidLayout}>
        <View style={styles.invalidState}>
          <Text style={styles.invalidTitle}>Not a metric we measure</Text>
          <Text style={styles.invalidCopy}>That link points somewhere we don{'\u2019'}t track. Head back and pick a real one.</Text>
        </View>
        <Button title="Back" onPress={() => router.replace('/skin-metrics')} />
      </AtmosphereScreen>
    );
  }

  if (!detail) {
    return (
      <AtmosphereScreen scroll={false} contentContainerStyle={styles.invalidLayout}>
        <View style={styles.invalidState}>
          <Text style={styles.invalidTitle}>{toMetricLabel(metric)}</Text>
          <Text style={styles.invalidCopy}>
            Run at least one scan to unlock this detailed assessment.
          </Text>
        </View>
        <Button title="Start scan" onPress={() => router.push(resolveScanEntryRoute(aiProcessingConsentGranted))} />
      </AtmosphereScreen>
    );
  }

  const personality = METRIC_PERSONALITY[metric];
  const severityInfo = severityMeta[detail.severity];

  return (
    <AtmosphereScreen>
      {/* ── Header ── */}
      <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTextCol}>
          <Text style={[styles.headerTitle, { color: personality.color }]}>{detail.title}</Text>
          <Text style={styles.headerTagline}>{personality.tagline}</Text>
        </View>
      </Animated.View>

      {/* ── Hero: Score + Severity ── */}
      <Animated.View entering={ZoomIn.duration(500).delay(100)} style={styles.heroScore}>
        <View style={[styles.heroGlow, { backgroundColor: personality.glow }]} />
        <Text style={[styles.heroScoreValue, { color: personality.color }]}>{Number.isFinite(detail.score) ? detail.score : 0}</Text>
        <View style={[styles.severityBadge, { backgroundColor: severityInfo.color + '18' }]}>
          <Feather name={severityInfo.icon} size={13} color={severityInfo.color} />
          <Text style={[styles.severityLabel, { color: severityInfo.color }]}>
            {severityInfo.label}
          </Text>
        </View>
      </Animated.View>

      {/* ── Face map ── */}
      <Animated.View entering={FadeIn.duration(500).delay(200)}>
        <FaceAssessmentMap
          zones={detail.zones}
          selectedZoneKey={activeZone?.key || detail.zones[0].key}
          onSelectZone={setSelectedZone}
          lesions={latestOutput?.lesions?.length ? latestOutput.lesions : undefined}
          accentColor={personality.color}
        />
      </Animated.View>

      {/* ── Summary ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(300)}>
        <Text style={styles.summary}>{detail.summary}</Text>
      </Animated.View>

      {/* ── Zone finding ── */}
      {activeZone && (
        <Animated.View
          key={activeZone.key}
          entering={FadeInDown.duration(300)}
          style={[styles.zoneFinding, { borderLeftColor: severityMeta[activeZone.severity].color }]}
        >
          <View style={styles.zoneFindingHeader}>
            <Feather
              name={severityMeta[activeZone.severity].icon}
              size={16}
              color={severityMeta[activeZone.severity].color}
            />
            <Text style={styles.zoneFindingTitle}>{activeZone.label}</Text>
          </View>
          <Text style={styles.zoneFindingCopy}>{activeZone.summary}</Text>
          {activeZone.recommendation && (
            <View style={styles.zoneFindingActionRow}>
              <Feather name="arrow-right" size={12} color={Colors.primaryLight} />
              <Text style={styles.zoneFindingAction}>{activeZone.recommendation}</Text>
            </View>
          )}
        </Animated.View>
      )}

      {/* ── Product guidance ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(400)} style={styles.guidanceSection}>
        <Text style={styles.guidanceSectionTitle}>Product guidance</Text>
        <Text style={styles.guidanceReport}>{detail.report}</Text>

        <View style={styles.recStack}>
          {(['stop', 'consider', 'continue'] as const).map((type, i) => {
            const cfg = REC_CONFIG[type];
            const text =
              type === 'stop'
                ? latestOutput?.generated_insights?.product_guidance?.stop || detail.stopUsing
                : type === 'consider'
                  ? latestOutput?.generated_insights?.product_guidance?.consider || detail.considerUsing
                  : latestOutput?.generated_insights?.product_guidance?.continue || detail.continueUsing;

            return (
              <Animated.View
                key={type}
                entering={FadeInDown.duration(300).delay(500 + i * 80)}
                style={[styles.recRow, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
              >
                <View style={styles.recHeader}>
                  <Feather name={cfg.icon} size={14} color={cfg.labelColor} />
                  <Text style={[styles.recLabel, { color: cfg.labelColor }]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </View>
                <Text style={styles.recText}>{text}</Text>
              </Animated.View>
            );
          })}
        </View>
      </Animated.View>

      {latestOutput?.rag_recommendations?.length ? (
        <Animated.View entering={FadeInDown.duration(400).delay(550)} style={styles.sourcesSection}>
          <ClinicalSourcesCard recommendations={latestOutput.rag_recommendations} />
        </Animated.View>
      ) : null}

      {/* ── Disclaimer ── */}
      <Animated.View entering={FadeIn.duration(300).delay(700)}>
        <Text style={styles.disclaimer}>
          For informational purposes only. Consult a dermatologist for diagnosis and treatment.
        </Text>
      </Animated.View>
    </AtmosphereScreen>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
  },
  headerTagline: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },

  // Hero score — big, centered, bold
  heroScore: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.sm,
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    top: 0,
  },
  heroScoreValue: {
    fontFamily: FontFamily.sansBold,
    fontSize: 72,
    lineHeight: 80,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xs,
  },
  severityLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Summary
  summary: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 23,
    marginBottom: Spacing.lg,
  },

  // Zone finding
  zoneFinding: {
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.lg,
    borderLeftWidth: 3,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  zoneFindingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  zoneFindingTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  zoneFindingCopy: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  zoneFindingActionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.xxs,
  },
  zoneFindingAction: {
    flex: 1,
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },

  // Guidance section
  guidanceSection: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  guidanceSectionTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  guidanceReport: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  recStack: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  recRow: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  recLabel: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  recText: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },

  // Disclaimer
  disclaimer: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  sourcesSection: {
    marginTop: Spacing.lg,
  },

  // Invalid states
  invalidLayout: {
    justifyContent: 'space-between',
  },
  invalidState: {
    gap: Spacing.sm,
  },
  invalidTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
  },
  invalidCopy: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
});
