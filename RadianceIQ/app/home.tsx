import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router as globalRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { AtmosphereScreen } from '../src/components/AtmosphereScreen';
import { Button } from '../src/components/Button';
import { PatternCarousel } from '../src/components/PatternCarousel';
import { PatternProgressBar } from '../src/components/PatternProgressBar';
import { SkinScoreHero } from '../src/components/SkinScoreHero';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Surfaces,
  Spacing,
} from '../src/constants/theme';
import { signalColorByRouteKey, SIGNAL_LABELS, SIGNAL_GLOWS, toSignalKey } from '../src/constants/signals';
import {
  buildOverallSkinInsight,
  getLatestDailyForOutput,
} from '../src/services/skinInsights';
import { useStore } from '../src/store/useStore';
import { gateWithPaywall } from '../src/services/subscription';
import { PatternExportCard } from '../src/components/PatternExportCard';
import { exportAndSharePattern } from '../src/services/patternExport';
import type { CompositeSignals } from '../src/services/skinInsights';
import { safeClamp } from '../src/utils/safeClamp';
import type { Pattern } from '../src/types';

interface TopStat {
  key: string;
  label: string;
  value: number | null;
  color: string;
  icon: string;
}

const ringSize = 72;
const ringStroke = 4.5;

const TopStatRing: React.FC<{ value: number | null; color: string; icon: string; signalKey?: string; delta?: number }> = ({ value, color, icon, signalKey, delta = 0 }) => {
  const hasData = value !== null && Number.isFinite(value);
  const displayValue = hasData ? safeClamp(value) : 0;
  const radius = (ringSize - ringStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ringSpan = circumference * 0.84;
  const gap = circumference - ringSpan;
  const progressSpan = hasData ? ringSpan * (displayValue / 100) : 0;
  const center = ringSize / 2;
  const rotation = `rotate(128 ${center} ${center})`;

  const glowColor = signalKey ? SIGNAL_GLOWS[toSignalKey(signalKey) as keyof typeof SIGNAL_GLOWS] : undefined;

  // Number color only: red if dropped 10+, green if gained 5+, otherwise default text
  const valueColor = delta <= -10 ? Colors.error : delta >= 5 ? Colors.success : Colors.text;

  return (
    <View style={styles.statRingWrap}>
      <Svg width={ringSize} height={ringSize}>
        <Circle
          cx={center} cy={center} r={radius}
          fill="none" stroke={Colors.borderStrong} strokeWidth={ringStroke}
          strokeLinecap="round" strokeDasharray={`${ringSpan} ${gap}`} transform={rotation}
        />
        {hasData && (
          <Circle
            cx={center} cy={center} r={radius}
            fill="none" stroke={color} strokeWidth={ringStroke}
            strokeLinecap="round" strokeDasharray={`${progressSpan} ${circumference}`} transform={rotation}
          />
        )}
      </Svg>
      <View style={styles.statRingCenter} pointerEvents="none">
        <Text style={[styles.statValue, { color: hasData ? valueColor : Colors.textDim }]}>
          {hasData ? displayValue : '--'}
        </Text>
      </View>
    </View>
  );
};

export default function Home() {
  const router = globalRouter;
  const protocol = useStore((s) => s.protocol);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const modelOutputs = useStore((s) => s.modelOutputs);
  const patterns = useStore((s) => s.patterns);

  const [sharingPattern, setSharingPattern] = useState<Pattern | null>(null);
  const exportRef = useRef<View | null>(null);

  useEffect(() => {
    if (!sharingPattern) return;
    const t = setTimeout(() => {
      exportAndSharePattern(sharingPattern, exportRef).finally(() => {
        setSharingPattern(null);
      });
    }, 100);
    return () => clearTimeout(t);
  }, [sharingPattern]);

  const handleScanPress = async (path: string) => {
    if (!(await gateWithPaywall())) return;
    router.push(path as any);
  };

  const latestOutput = modelOutputs.length > 0 ? modelOutputs[modelOutputs.length - 1] : null;
  const baseline = modelOutputs.length > 0 ? modelOutputs[0] : null;
  const latestDaily = getLatestDailyForOutput(latestOutput, dailyRecords);
  const baselineDaily = getLatestDailyForOutput(baseline, dailyRecords);

  const getStreak = useStore((s) => s.getStreak);
  const streak = useMemo(() => getStreak(), [dailyRecords, getStreak]);

  const overallInsight = useMemo(
    () =>
      buildOverallSkinInsight({
        latestOutput,
        baselineOutput: baseline,
        latestDaily,
        baselineDaily,
        serverSignalScores: latestOutput?.signal_scores,
        serverSignalFeatures: latestOutput?.signal_features,
        serverSignalConfidence: latestOutput?.signal_confidence,
        serverLesions: latestOutput?.lesions,
      }),
    [latestOutput, baseline, latestDaily, baselineDaily]
  );

  const topStats = useMemo<TopStat[]>(() => {
    const s = overallInsight?.signals;
    return [
      { key: 'hydration', label: 'Hydration', value: s?.hydration ?? null, color: signalColorByRouteKey('hydration'), icon: 'water-outline' },
      { key: 'elasticity', label: 'Elasticity', value: s?.elasticity ?? null, color: signalColorByRouteKey('elasticity'), icon: 'arrow-expand-horizontal' },
      { key: 'inflammation', label: 'Inflammation', value: s?.inflammation ?? null, color: signalColorByRouteKey('inflammation'), icon: 'fire' },
      { key: 'sun_damage', label: 'Sun Damage', value: s?.sunDamage ?? null, color: signalColorByRouteKey('sun_damage'), icon: 'weather-sunny' },
      { key: 'structure', label: 'Structure', value: s?.structure ?? null, color: signalColorByRouteKey('structure'), icon: 'waves' },
    ];
  }, [overallInsight]);

  const baselineInsight = useMemo(
    () =>
      baseline
        ? buildOverallSkinInsight({
            latestOutput: baseline,
            baselineOutput: baseline,
            latestDaily: baselineDaily,
            baselineDaily,
            serverSignalScores: baseline.signal_scores,
            serverSignalFeatures: baseline.signal_features,
            serverSignalConfidence: baseline.signal_confidence,
            serverLesions: baseline.lesions,
          })
        : null,
    [baseline, baselineDaily],
  );

  const signalMovers = useMemo(() => {
    if (!overallInsight?.signals || !baselineInsight?.signals) return [];
    const keys: (keyof CompositeSignals)[] = ['hydration', 'elasticity', 'inflammation', 'sunDamage', 'structure'];
    const routeKeys: Record<string, string> = { sunDamage: 'sun_damage' };
    return keys
      .map((k) => {
        const rawCurrent = overallInsight.signals[k];
        const rawBase = baselineInsight.signals[k];
        const current = Number.isFinite(rawCurrent) ? Math.round(rawCurrent) : 0;
        const base = Number.isFinite(rawBase) ? Math.round(rawBase) : 0;
        const delta = current - base;
        const routeKey = routeKeys[k] || k;
        return {
          key: routeKey,
          label: SIGNAL_LABELS[toSignalKey(routeKey) as keyof typeof SIGNAL_LABELS] || k,
          delta,
          color: signalColorByRouteKey(routeKey),
        };
      })
      .filter((m) => m.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);
  }, [overallInsight, baselineInsight]);

  return (
    <AtmosphereScreen>
      {/* ── 1. Header ── */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <Text style={styles.greeting}>Today</Text>
        <Text style={styles.date}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </Animated.View>

      {/* ── 2. Signal Rings (top, no title) ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(50)} style={styles.signalSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.signalRowContent}>
          {topStats.map((stat) => {
            const delta = overallInsight && baselineInsight
              ? Math.round((overallInsight.signals[toSignalKey(stat.key) as keyof CompositeSignals] ?? 0) - (baselineInsight.signals[toSignalKey(stat.key) as keyof CompositeSignals] ?? 0))
              : 0;
            return (
              <TouchableOpacity
                key={stat.key}
                style={styles.signalStat}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${stat.label} signal, score ${stat.value ?? 'no data'}${delta <= -10 ? ', declining' : delta >= 5 ? ', improving' : ''}`}
                onPress={() => router.push({ pathname: '/signal/[key]', params: { key: stat.key } })}
              >
                <TopStatRing value={stat.value} color={stat.color} icon={stat.icon} signalKey={stat.key} delta={delta} />
                <Text style={styles.signalLabel}>{stat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>

      {/* ── 3. HERO: Overall Score + Streak ── */}
      {overallInsight ? (
        <Animated.View entering={FadeInDown.duration(500).delay(150)}>
          <View style={styles.heroStreakRow}>
            <View style={{ flex: 1 }}>
              <SkinScoreHero
                score={overallInsight.score}
                statusLabel={overallInsight.statusLabel}
                actionStatement={overallInsight.actionStatement}
                trendDelta={overallInsight.trendDelta}
                onViewResults={() => router.push('/scan/results')}
              />
            </View>
            {streak > 0 && (
              <View style={styles.streakBadge}>
                <MaterialCommunityIcons
                  name="fire"
                  size={22}
                  color={streak >= 7 ? Colors.warning : Colors.primary}
                />
                <Text style={[styles.streakBadgeValue, {
                  color: streak >= 7 ? Colors.warning : Colors.primary,
                }]}>
                  {streak}
                </Text>
                <Text style={styles.streakBadgeLabel}>day streak</Text>
              </View>
            )}
          </View>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.duration(500).delay(150)} style={styles.emptyHero}>
          <Text style={styles.emptyHeroTitle}>Build your first baseline</Text>
          <Text style={styles.emptyHeroCopy}>
            Your skin score appears here after your first scan.
          </Text>
          <Button title="Start first scan" onPress={() => handleScanPress('/scan/camera')} />
        </Animated.View>
      )}

      {/* ── 4. Pattern progress + carousel ── */}
      <PatternProgressBar />
      <PatternCarousel patterns={patterns} onShare={(p) => setSharingPattern(p)} />


      {/* ── 5. Signal Movers ── */}
      {latestOutput && baseline && signalMovers.length > 0 && (
        <Animated.View entering={FadeInDown.duration(400).delay(350)} style={styles.moversSection}>
          <Text style={styles.sectionLabel}>Since your baseline</Text>
          <View style={styles.moversRow}>
            {signalMovers.map((m) => {
              const isUp = m.delta >= 0;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.moverCard, { borderColor: m.color + '20' }]}
                  activeOpacity={0.7}
                  onPress={() => router.push({ pathname: '/signal/[key]', params: { key: m.key } })}
                >
                  <View style={[styles.moverDot, { backgroundColor: m.color }]} />
                  <Text style={[styles.moverDelta, { color: isUp ? Colors.success : Colors.error }]}>
                    {isUp ? '+' : ''}{m.delta}
                  </Text>
                  <Text style={styles.moverLabel} numberOfLines={1}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      )}

      {/* ── 6. Latest Insight ── */}
      {latestOutput?.generated_insights?.overall_summary && (
        <Animated.View entering={FadeIn.duration(400).delay(450)} style={styles.insightCard}>
          <View style={styles.insightHeader}>
            <Feather name="message-circle" size={13} color={Colors.primary} />
            <Text style={styles.insightLabel}>Latest insight</Text>
          </View>
          <Text style={styles.insightText} numberOfLines={3}>
            {latestOutput.generated_insights.overall_summary}
          </Text>
          {latestOutput.generated_insights.action_plan?.[0] && (
            <View style={styles.insightActionRow}>
              <Feather name="arrow-right" size={11} color={Colors.primaryLight} />
              <Text style={styles.insightAction} numberOfLines={2}>
                {latestOutput.generated_insights.action_plan[0]}
              </Text>
            </View>
          )}
        </Animated.View>
      )}

      {!latestOutput && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No scan data yet</Text>
          <Text style={styles.emptyCopy}>
            Your first scan will unlock trends and detailed assessments.
          </Text>
        </View>
      )}

      {sharingPattern && (
        <View
          pointerEvents="none"
          collapsable={false}
          style={{
            position: 'absolute',
            left: -10000,
            top: 0,
            width: 1080,
            height: 1920,
          }}
        >
          <View ref={exportRef as any} collapsable={false}>
            <PatternExportCard pattern={sharingPattern} />
          </View>
        </View>
      )}
    </AtmosphereScreen>
  );
}

const styles = StyleSheet.create({
  // ── Header ──
  header: {
    marginBottom: Spacing.lg,
  },
  greeting: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  date: {
    marginTop: Spacing.xs,
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    lineHeight: 34,
  },

  // ── Empty hero ──
  emptyHero: {
    ...Surfaces.hero,
    padding: Spacing.xl,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  emptyHeroTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
  },
  emptyHeroCopy: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 24,
  },

  // ── Section label (shared) ──
  sectionLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xxs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },

  // ── Signal rings ──
  // Break out of AtmosphereScreen's paddingHorizontal so the scroll goes edge-to-edge
  signalSection: {
    marginBottom: Spacing.xl,
    marginHorizontal: -Spacing.lg,
  },
  signalRowContent: {
    gap: Spacing.md,
    paddingLeft: Spacing.lg,   // align first ring with screen content margin
    paddingRight: Spacing.lg,  // breathing room after last ring
  },
  signalStat: {
    width: 84,
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  statRingWrap: {
    width: ringSize,
    height: ringSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringGlow: {
    position: 'absolute',
    width: Math.round(ringSize * 0.85),
    height: Math.round(ringSize * 0.85),
    borderRadius: Math.round(ringSize * 0.85) / 2,
  },
  statRingCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    lineHeight: 26,
  },
  signalLabel: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  // ── Hero + Streak inline ──
  heroStreakRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  streakBadge: {
    alignItems: 'center',
    paddingTop: Spacing.md,
    paddingLeft: Spacing.sm,
    gap: 2,
  },
  streakBadgeValue: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    lineHeight: 26,
  },
  streakBadgeLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
    color: Colors.textMuted,
  },

  // ── Signal movers ──
  moversSection: {
    marginBottom: Spacing.xl,
  },
  moversRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  moverCard: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    backgroundColor: Colors.surfaceOverlay,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  moverDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 2,
  },
  moverDelta: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    letterSpacing: -0.5,
  },
  moverLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
  },

  // ── Insight card ──
  insightCard: {
    backgroundColor: Colors.surfaceOverlay,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  insightLabel: {
    color: Colors.primary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xxs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  insightText: {
    color: Colors.text,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 23,
  },
  insightActionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  insightAction: {
    flex: 1,
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    lineHeight: 18,
  },

  // ── Empty state ──
  emptyState: {
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
});
