import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router as globalRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowIcon, GlowSpark } from '../src/components/glow/GlowIcons';
import { FadeUp, SectionHead } from '../src/components/glow/GlowPrimitives';
import { HarmonyTrendCard } from '../src/components/HarmonyTrendCard';
import {
  BorderRadius,
  Colors,
  FontFamily,
  Glow,
  Spacing,
} from '../src/constants/theme';
import { useStore } from '../src/store/useStore';
import {
  buildOverallSkinInsight,
  getLatestDailyForOutput,
} from '../src/services/skinInsights';

export default function StoryScreen() {
  const router = globalRouter;
  const palette = Glow.palette;
  const insets = useSafeAreaInsets();

  const dailyRecords = useStore((s) => s.dailyRecords);
  const modelOutputs = useStore((s) => s.modelOutputs);
  const patterns = useStore((s) => s.patterns);

  const baseline = modelOutputs[0] ?? null;
  const baselineDaily = getLatestDailyForOutput(baseline, dailyRecords);

  const series = useMemo(() => {
    return modelOutputs.slice(-14).map((o) => {
      const insight = buildOverallSkinInsight({
        latestOutput: o,
        baselineOutput: baseline,
        latestDaily: getLatestDailyForOutput(o, dailyRecords),
        baselineDaily,
        serverSignalScores: o.signal_scores,
        serverSignalFeatures: o.signal_features,
        serverSignalConfidence: o.signal_confidence,
        serverLesions: o.lesions,
      });
      return Math.round(insight?.score ?? 0);
    });
  }, [modelOutputs, baseline, dailyRecords, baselineDaily]);

  const delta = series.length >= 2 ? series[series.length - 1] - series[0] : 0;
  const dateLabels = useMemo(() => {
    return modelOutputs.slice(-14).map((o, i) => {
      const d = getLatestDailyForOutput(o, dailyRecords);
      const iso = d?.date as string | undefined;
      if (!iso) return '';
      const date = new Date(iso);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
  }, [modelOutputs, dailyRecords]);

  const evenIndices = dateLabels.map((_, i) => i).filter((i) => i % Math.max(1, Math.floor(dateLabels.length / 4)) === 0);

  const moodFor = (score: number): 'mood_meh' | 'mood_smile' | 'mood_grin' | 'mood_sad' => {
    if (score >= 80) return 'mood_grin';
    if (score >= 65) return 'mood_smile';
    if (score >= 50) return 'mood_meh';
    return 'mood_sad';
  };

  const visiblePatterns = (patterns ?? []).slice(0, 5);
  const photoStrip = modelOutputs.slice(-5);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.xl,
        paddingBottom: insets.bottom + 120,
      }}
      showsVerticalScrollIndicator={false}
    >
      <FadeUp index={0}>
        <View style={s.header}>
          <Text style={[s.title, { color: palette.ink }]}>Your story</Text>
          <Text style={[s.subtitle, { color: palette.muted }]}>
            How your skin has been changing
          </Text>
        </View>
      </FadeUp>

      <FadeUp index={1}>
        <View style={[s.heroOuter]}>
          <LinearGradient
            colors={[palette.surface, palette.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.heroCard, { borderColor: palette.glow }]}
          >
            <Text style={[s.heroEyebrow, { color: palette.muted }]}>
              GLOW OVER {Math.max(1, series.length)} READS
            </Text>
            <View style={s.heroNumberRow}>
              <Text style={[s.heroNumber, { color: palette.ink }]}>
                {delta >= 0 ? '+' : ''}{delta}
              </Text>
              <Text style={[s.heroSince, { color: palette.muted }]}>
                since you started
              </Text>
            </View>
            {series.length >= 2 ? (
              <View style={{ marginTop: 14 }}>
                <GlowSpark
                  data={series}
                  color={palette.accent}
                  width={296}
                  height={70}
                />
                <View style={s.dateRow}>
                  {evenIndices.map((idx) => (
                    <Text key={idx} style={[s.dateLabel, { color: palette.muted }]}>
                      {dateLabels[idx]}
                    </Text>
                  ))}
                </View>
              </View>
            ) : (
              <Text style={[s.empty, { color: palette.muted }]}>
                Your trend appears after a few check-ins.
              </Text>
            )}
          </LinearGradient>
        </View>
      </FadeUp>

      {/* Facial architecture — only renders when ≥2 scans with bone data
          exist (HarmonyTrendCard returns null otherwise). The section title
          + container collapse with it so an empty user doesn't see an
          orphan heading. */}
      {modelOutputs.filter((o) => typeof o.bone_structure?.harmony === 'number').length >= 2 && (
        <FadeUp index={2}>
          <View style={s.section}>
            <SectionHead
              title="Facial architecture"
              hint="Tap to open"
              ink={palette.ink}
              muted={palette.muted}
            />
            <View style={{ marginTop: 12 }}>
              <HarmonyTrendCard />
            </View>
          </View>
        </FadeUp>
      )}

      <FadeUp index={3}>
        <View style={s.section}>
          <SectionHead
            title="What we noticed"
            hint={`${visiblePatterns.length} ${visiblePatterns.length === 1 ? 'pattern' : 'patterns'}`}
            ink={palette.ink}
            muted={palette.muted}
          />
          <View style={{ marginTop: 12 }}>
            {visiblePatterns.length === 0 ? (
              <View style={[s.emptyCard, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
                <Text style={[s.emptyTitle, { color: palette.ink }]}>
                  Your patterns are forming
                </Text>
                <Text style={[s.emptyBody, { color: palette.muted }]}>
                  We need a handful of check-ins before we can see the rhythms in your skin.
                </Text>
              </View>
            ) : (
              visiblePatterns.map((pattern) => (
                <TouchableOpacity
                  key={pattern.id}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: '/pattern/[id]',
                      params: { id: pattern.id },
                    })
                  }
                  style={[s.patternCard, { backgroundColor: palette.surface, borderColor: palette.glow }]}
                >
                  <View style={s.patternTopRow}>
                    <Text style={[s.patternTag, { color: palette.accent }]}>
                      {pattern.driverLabel.toUpperCase()} · {pattern.signal.toUpperCase()}
                    </Text>
                    <View style={[s.patternConfidence, { backgroundColor: palette.bg }]}>
                      <Text style={[s.patternConfidenceText, { color: palette.muted }]}>
                        {pattern.confidence}
                      </Text>
                    </View>
                  </View>
                  <Text style={[s.patternTitle, { color: palette.ink }]}>
                    {pattern.insightText}
                  </Text>
                  <Text style={[s.patternBody, { color: palette.muted }]} numberOfLines={3}>
                    {pattern.detailText}
                  </Text>
                  <View style={s.patternMore}>
                    <Text style={[s.patternMoreText, { color: palette.accent }]}>
                      See the evidence
                    </Text>
                    <GlowIcon name="arrow" size={12} color={palette.accent} stroke={1.8} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </FadeUp>

      {photoStrip.length > 0 && (
        <FadeUp index={4}>
          <View style={s.section}>
            <SectionHead
              title="Your face, week by week"
              hint="tap to compare"
              ink={palette.ink}
              muted={palette.muted}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, marginTop: 12, paddingBottom: 4 }}
            >
              {photoStrip.map((o) => {
                const insight = buildOverallSkinInsight({
                  latestOutput: o,
                  baselineOutput: baseline,
                  latestDaily: getLatestDailyForOutput(o, dailyRecords),
                  baselineDaily,
                  serverSignalScores: o.signal_scores,
                  serverSignalFeatures: o.signal_features,
                  serverSignalConfidence: o.signal_confidence,
                  serverLesions: o.lesions,
                });
                const score = Math.round(insight?.score ?? 0);
                const d = getLatestDailyForOutput(o, dailyRecords)?.date as string | undefined;
                const dateLabel = d
                  ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '';
                return (
                  <View key={o.output_id} style={{ width: 96 }}>
                    <LinearGradient
                      colors={[palette.glow, palette.surface]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[s.photoTile, { borderColor: palette.glow }]}
                    >
                      <GlowIcon
                        name={moodFor(score)}
                        size={28}
                        color={palette.accent}
                        stroke={1.5}
                      />
                    </LinearGradient>
                    <Text style={[s.photoDate, { color: palette.muted }]}>{dateLabel}</Text>
                    <Text style={[s.photoScore, { color: palette.ink }]}>{score}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </FadeUp>
      )}

      <FadeUp index={5}>
        <View style={s.section}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push('/report/generate' as any)}
            style={[s.reportCta, { backgroundColor: palette.ink }]}
          >
            <Text style={[s.reportCtaText, { color: palette.surface }]}>
              Generate full report
            </Text>
            <GlowIcon name="arrow" size={16} color={palette.surface} stroke={1.8} />
          </TouchableOpacity>
        </View>
      </FadeUp>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  title: {
    fontFamily: FontFamily.sans,
    fontSize: 32,
    lineHeight: 36,
  },
  subtitle: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    marginTop: 6,
  },
  heroOuter: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 18,
  },
  heroEyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  heroNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
    gap: 12,
  },
  heroNumber: {
    fontFamily: FontFamily.sans,
    fontSize: 56,
    lineHeight: 56,
  },
  heroSince: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  dateLabel: {
    fontFamily: FontFamily.sans,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  empty: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    marginTop: 12,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  emptyCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  emptyTitle: {
    fontFamily: FontFamily.sans,
    fontSize: 18,
  },
  emptyBody: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  patternCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    marginBottom: 10,
  },
  patternTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  patternTag: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  patternConfidence: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  patternConfidenceText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
  },
  patternTitle: {
    fontFamily: FontFamily.sans,
    fontSize: 20,
    lineHeight: 25,
    marginTop: 8,
  },
  patternBody: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  patternMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  patternMoreText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 11,
  },
  photoTile: {
    aspectRatio: 3 / 4,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDate: {
    fontFamily: FontFamily.sans,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
  },
  photoScore: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 12,
    textAlign: 'center',
  },
  reportCta: {
    paddingVertical: 15,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  reportCtaText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 15,
  },
});
