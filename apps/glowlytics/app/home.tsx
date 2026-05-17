import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router as globalRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlowIcon } from '../src/components/glow/GlowIcons';
import { GlowSpark } from '../src/components/glow/GlowIcons';
import {
  BreathingGlow,
  FadeUp,
  GlowRing,
  SectionHead,
} from '../src/components/glow/GlowPrimitives';
import { PatternCarousel } from '../src/components/PatternCarousel';
import { PatternProgressBar } from '../src/components/PatternProgressBar';
import { PatternExportCard } from '../src/components/PatternExportCard';
import { HarmonyFocusCard } from '../src/components/HarmonyFocusCard';
import { HarmonyTrendCard } from '../src/components/HarmonyTrendCard';
import { exportAndSharePattern } from '../src/services/patternExport';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Glow,
  Spacing,
} from '../src/constants/theme';
import {
  buildOverallSkinInsight,
  getLatestDailyForOutput,
} from '../src/services/skinInsights';
import { useStore } from '../src/store/useStore';
import { gateWithPaywall } from '../src/services/subscription';
import { GLOW_FACETS, facetValues, type GlowFacetKey } from '../src/constants/facets';
import { safeClamp } from '../src/utils/safeClamp';
import { buildRitualSteps, type RitualStep } from '../src/services/ritual';
import { localDateStr } from '../src/utils/localDate';
import type { Pattern } from '../src/types';

let useClerkUser: (() => { user: { firstName?: string | null } | null | undefined }) | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const clerk = require('@clerk/clerk-expo');
  useClerkUser = clerk.useUser;
} catch {
  useClerkUser = undefined;
}

const MOOD_OPTIONS: Array<{
  key: string;
  icon:
    | 'mood_sleep'
    | 'mood_smile'
    | 'mood_grin'
    | 'sparkle'
    | 'mood_woozy'
    | 'mood_meh';
}> = [
  { key: 'sleep', icon: 'mood_sleep' },
  { key: 'smile', icon: 'mood_smile' },
  { key: 'grin', icon: 'mood_grin' },
  { key: 'sparkle', icon: 'sparkle' },
  { key: 'woozy', icon: 'mood_woozy' },
  { key: 'meh', icon: 'mood_meh' },
];

export default function Home() {
  const router = globalRouter;
  const dailyRecords = useStore((s) => s.dailyRecords);
  const modelOutputs = useStore((s) => s.modelOutputs);
  const patterns = useStore((s) => s.patterns);
  const products = useStore((s) => s.products);
  const ritualCompletions = useStore((s) => s.ritualCompletions);
  const getStreak = useStore((s) => s.getStreak);
  const insets = useSafeAreaInsets();
  const palette = Glow.palette;

  const clerkUserHook = useClerkUser ? useClerkUser() : null;
  const firstName = clerkUserHook?.user?.firstName ?? '';

  const [sharingPattern, setSharingPattern] = useState<Pattern | null>(null);
  const [mood, setMood] = useState<string | null>(null);
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

  const handleScanPress = async () => {
    if (!(await gateWithPaywall())) return;
    router.push('/scan/camera' as any);
  };

  const latestOutput = modelOutputs.length > 0 ? modelOutputs[modelOutputs.length - 1] : null;
  const baseline = modelOutputs.length > 0 ? modelOutputs[0] : null;
  const latestDaily = getLatestDailyForOutput(latestOutput, dailyRecords);
  const baselineDaily = getLatestDailyForOutput(baseline, dailyRecords);

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

  const facets = useMemo(
    () => facetValues(overallInsight?.signals ?? null),
    [overallInsight],
  );
  const baseFacets = useMemo(
    () => facetValues(baselineInsight?.signals ?? null),
    [baselineInsight],
  );

  const glowScore = overallInsight ? Math.round(overallInsight.score) : null;
  const glowDelta = overallInsight && baselineInsight
    ? Math.round(overallInsight.score - baselineInsight.score)
    : 0;

  const todayStr = localDateStr(new Date());
  const dayCompletions = ritualCompletions[todayStr] ?? {};
  const ritualSteps = useMemo(() => buildRitualSteps(products), [products]);
  const ritualPreview = useMemo<RitualStep[]>(() => {
    const unfinished = ritualSteps.filter((step) => !dayCompletions[step.id]);
    // Show the next 3 unfinished steps; if all are done, fall back to the first
    // 3 so the user still sees progress instead of an empty preview.
    return (unfinished.length > 0 ? unfinished : ritualSteps).slice(0, 3);
  }, [ritualSteps, dayCompletions]);
  const ritualDone = ritualSteps.filter((step) => dayCompletions[step.id]).length;
  const ritualTotal = ritualSteps.length;
  const ritualPct = ritualTotal === 0 ? 0 : (ritualDone / ritualTotal) * 100;

  const heroCopy = useMemo(() => {
    if (!glowScore) return { lead: 'Take your first read.', detail: 'A short check-in builds your baseline.' };
    if (glowScore >= 75) return { lead: 'radiant', detail: 'Hydration is up, redness is down.' };
    if (glowScore >= 60) return { lead: 'steady', detail: 'Things are settling. Stay the course.' };
    if (glowScore >= 45) return { lead: 'a little tired', detail: 'Skin is asking for slow morning + water.' };
    return { lead: 'asking for care', detail: 'Skip exfoliants tonight. Hydrate, sleep early.' };
  }, [glowScore]);

  const today = new Date();
  const dayLabel = today.toLocaleDateString('en-US', { weekday: 'long' });
  const dateLabel = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const greeting = useMemo(() => {
    const h = today.getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const featuredPattern = patterns?.[0] ?? null;

  // Build a Glow-score series from recent model outputs for the trend sparkline.
  const sparkSeries = useMemo(() => {
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.xl,
        paddingBottom: insets.bottom + 120,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <FadeUp index={0}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={[s.eyebrow, { color: palette.muted }]}>
              {dayLabel.toUpperCase()} · {dateLabel.toUpperCase()}
            </Text>
            <Text style={[s.greetingTitle, { color: palette.ink }]}>
              {greeting},{'\n'}
              <Text style={[s.greetingAccent, { color: palette.ink }]}>
                {firstName || 'friend'}
              </Text>
            </Text>
          </View>
          {streak > 0 && (
            <View style={[s.streakChip, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
              <GlowIcon name="flame" size={14} color={palette.accent2} stroke={1.7} />
              <Text style={[s.streakValue, { color: palette.ink }]}>{streak}</Text>
            </View>
          )}
        </View>
      </FadeUp>

      {/* Glow hero */}
      <FadeUp index={1}>
        <View style={[s.heroOuter]}>
          <LinearGradient
            colors={[palette.surface, palette.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[s.heroCard, { borderColor: palette.glow }]}
          >
            <View style={[s.heroBreathePos]}>
              <BreathingGlow color={palette.glow} size={180} />
            </View>
            <View style={s.heroTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.heroEyebrow, { color: palette.muted }]}>TODAY'S GLOW</Text>
                <View style={s.heroNumberRow}>
                  <Text style={[s.heroNumber, { color: palette.ink }]}>
                    {glowScore ?? '—'}
                  </Text>
                  <View style={{ marginLeft: 8 }}>
                    {glowDelta !== 0 && (
                      <Text style={[s.heroDelta, { color: palette.accent }]}>
                        {glowDelta > 0 ? '+' : ''}{glowDelta}
                      </Text>
                    )}
                    <Text style={[s.heroDeltaCaption, { color: palette.muted }]}>
                      vs. start
                    </Text>
                  </View>
                </View>
                <Text style={[s.heroCopy, { color: palette.ink }]}>
                  You're <Text style={[s.heroCopyAccent, { color: palette.ink }]}>{heroCopy.lead}</Text>. {heroCopy.detail}
                </Text>
              </View>
              <GlowRing
                size={92}
                stroke={6}
                value={glowScore ?? 0}
                color={palette.accent}
                track={palette.glow}
              >
                <Text style={[s.heroRingLabel, { color: palette.muted }]}>GLOW</Text>
                <Text style={[s.heroRingValue, { color: palette.ink }]}>
                  {glowScore ?? '—'}
                </Text>
              </GlowRing>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleScanPress}
              style={[s.heroCta, { backgroundColor: palette.ink }]}
            >
              <Text style={[s.heroCtaText, { color: palette.surface }]}>
                Take today's check-in
              </Text>
              <GlowIcon name="arrow" size={18} color={palette.surface} stroke={1.7} />
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </FadeUp>

      {/* Facets */}
      <FadeUp index={2}>
        <View style={s.section}>
          <SectionHead
            title="How your skin feels"
            hint="tap any to see why"
            ink={palette.ink}
            muted={palette.muted}
          />
          <View style={s.facetGrid}>
            {GLOW_FACETS.map((facet) => {
              const value = facets[facet.key];
              const display = value === null ? '—' : safeClamp(value);
              return (
                <TouchableOpacity
                  key={facet.key}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push({
                      pathname: '/signal/[key]',
                      params: { key: facetToRouteKey(facet.key) },
                    })
                  }
                  style={[
                    s.facetCard,
                    { backgroundColor: palette.surface, borderColor: palette.glow },
                  ]}
                >
                  <View style={s.facetTop}>
                    <GlowIcon name={facet.icon} size={20} color={palette.accent} stroke={1.5} />
                    <Text style={[s.facetValue, { color: palette.ink }]}>{display}</Text>
                  </View>
                  <Text style={[s.facetLabel, { color: palette.ink }]}>{facet.label}</Text>
                  <Text style={[s.facetHint, { color: palette.muted }]}>{facet.hint}</Text>
                  <View style={[s.facetTrack, { backgroundColor: palette.bg }]}>
                    <View
                      style={[
                        s.facetFill,
                        {
                          width: `${value ?? 0}%`,
                          backgroundColor: palette.accent,
                        },
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </FadeUp>

      {/* Harmony focus + trend — both render null when their data
          preconditions aren't met. Focus card needs a scan with at least
          one finding; trend needs ≥2 scans. Stacked: action → context. */}
      <FadeUp index={3}>
        <View style={[s.section, s.trendWrap]}>
          <HarmonyFocusCard />
          <View style={{ height: 8 }} />
          <HarmonyTrendCard />
        </View>
      </FadeUp>

      {/* Ritual */}
      <FadeUp index={4}>
        <View style={s.section}>
          <SectionHead
            title="Today's ritual"
            hint={`${ritualDone}/${ritualTotal}`}
            ink={palette.ink}
            muted={palette.muted}
          />
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push('/ritual' as any)}
            style={[s.ritualCard, { backgroundColor: palette.surface, borderColor: palette.glow }]}
          >
            <View style={[s.ritualTrack, { backgroundColor: palette.bg }]}>
              <View
                style={{
                  height: '100%',
                  width: `${ritualPct}%`,
                  backgroundColor: palette.accent,
                  borderRadius: 999,
                }}
              />
            </View>
            {ritualPreview.length === 0 ? (
              <View style={s.ritualRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.ritualTitle, { color: palette.ink }]}>
                    Build your shelf
                  </Text>
                  <Text style={[s.ritualMeta, { color: palette.muted }]}>
                    Add products and they show up here
                  </Text>
                </View>
              </View>
            ) : (
              ritualPreview.map((step, i) => {
                const isDone = Boolean(dayCompletions[step.id]);
                return (
                  <View
                    key={step.id}
                    style={[
                      s.ritualRow,
                      i < ritualPreview.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: palette.bg,
                      },
                    ]}
                  >
                    <View
                      style={[
                        s.ritualDot,
                        isDone
                          ? { backgroundColor: palette.accent, borderWidth: 0 }
                          : { borderColor: palette.muted, borderWidth: 1.5 },
                      ]}
                    >
                      {isDone && (
                        <GlowIcon name="check" size={14} color={palette.surface} stroke={2} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          s.ritualTitle,
                          { color: palette.ink },
                          isDone && { textDecorationLine: 'line-through', opacity: 0.5 },
                        ]}
                        numberOfLines={1}
                      >
                        {step.title}
                      </Text>
                      <Text
                        style={[s.ritualMeta, { color: palette.muted }]}
                        numberOfLines={1}
                      >
                        {step.subtitle ? `${step.subtitle} · ${step.time}` : step.time}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
            <View style={s.ritualMore}>
              <Text style={[s.ritualMoreText, { color: palette.accent }]}>See full ritual</Text>
              <GlowIcon name="arrow" size={13} color={palette.accent} stroke={1.8} />
            </View>
          </TouchableOpacity>
        </View>
      </FadeUp>

      {/* Story preview */}
      {featuredPattern && (
        <FadeUp index={5}>
          <View style={s.section}>
            <SectionHead
              title="Your story"
              hint="this week"
              ink={palette.ink}
              muted={palette.muted}
            />
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push('/(tabs)/reports' as any)}
              style={[s.storyCard, { backgroundColor: palette.surface, borderColor: palette.glow }]}
            >
              <Text style={[s.storyEyebrow, { color: palette.accent }]}>
                PATTERN · {String(featuredPattern.confidence ?? 'strong').toUpperCase()}
              </Text>
              <Text style={[s.storyTitle, { color: palette.ink }]}>
                {featuredPattern.insightText || 'A pattern is forming'}
              </Text>
              <Text style={[s.storyBody, { color: palette.muted }]} numberOfLines={3}>
                {featuredPattern.detailText ||
                  'Take a few more check-ins so we can read your story.'}
              </Text>
            </TouchableOpacity>
          </View>
        </FadeUp>
      )}

      {/* Mood */}
      <FadeUp index={6}>
        <View style={s.section}>
          <SectionHead
            title="Note today's mood"
            hint="optional"
            ink={palette.ink}
            muted={palette.muted}
          />
          <View style={s.moodRow}>
            {MOOD_OPTIONS.map((m) => {
              const active = mood === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  activeOpacity={0.85}
                  onPress={() => setMood(active ? null : m.key)}
                  style={[
                    s.moodButton,
                    {
                      backgroundColor: active ? palette.accent : palette.surface,
                      transform: [{ scale: active ? 1.05 : 1 }],
                    },
                  ]}
                >
                  <GlowIcon
                    name={m.icon}
                    size={22}
                    color={active ? palette.surface : palette.ink}
                    stroke={1.5}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </FadeUp>

      {/* Trends sparkline (only when we have history) */}
      {modelOutputs.length >= 3 && (
        <FadeUp index={7}>
          <View style={s.section}>
            <SectionHead
              title="Glow over time"
              hint={`${modelOutputs.length} reads`}
              ink={palette.ink}
              muted={palette.muted}
            />
            <View style={[s.sparkCard, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
              <GlowSpark
                data={sparkSeries}
                color={palette.accent}
                width={296}
                height={70}
              />
            </View>
          </View>
        </FadeUp>
      )}

      {/* Patterns carousel — preserve existing behaviour */}
      {patterns && patterns.length > 0 && (
        <View style={{ marginTop: Spacing.md }}>
          <PatternProgressBar />
          <PatternCarousel patterns={patterns} onShare={(p) => setSharingPattern(p)} />
        </View>
      )}

      {/* Hidden export node for pattern share */}
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
    </ScrollView>
  );
}

function facetToRouteKey(facet: GlowFacetKey): string {
  switch (facet) {
    case 'hydrated': return 'hydration';
    case 'calm':     return 'inflammation';
    case 'even':     return 'sun_damage';
    case 'firm':     return 'structure';
  }
}

const s = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 12,
    letterSpacing: 0.6,
  },
  greetingTitle: {
    fontFamily: FontFamily.sans,
    fontSize: 32,
    lineHeight: 38,
    marginTop: 4,
  },
  greetingAccent: {
    fontFamily: FontFamily.accent,
    fontSize: 38,
    lineHeight: 42,
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    gap: 6,
  },
  streakValue: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 13,
  },
  heroOuter: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
    overflow: 'hidden',
  },
  heroBreathePos: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 180,
    height: 180,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroEyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
  },
  heroNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
  },
  heroNumber: {
    fontFamily: FontFamily.sans,
    fontSize: 72,
    lineHeight: 72,
  },
  heroDelta: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 13,
  },
  heroDeltaCaption: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
  },
  heroCopy: {
    fontFamily: FontFamily.sans,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    maxWidth: 220,
  },
  heroCopyAccent: {
    fontFamily: FontFamily.accent,
    fontSize: 17,
  },
  heroRingLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    letterSpacing: 1,
  },
  heroRingValue: {
    fontFamily: FontFamily.sans,
    fontSize: 28,
    lineHeight: 28,
  },
  heroCta: {
    marginTop: 22,
    paddingVertical: 15,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  heroCtaText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 15,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  trendWrap: {
    // Same horizontal padding as `section`; the card itself handles internal
    // padding. Renders nothing when the user has <2 scans with bone data —
    // marginTop above stays harmless because the card collapses to null.
  },
  facetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    marginHorizontal: -5,
  },
  facetCard: {
    width: '50%',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    margin: 5,
    flexBasis: '47%',
  },
  facetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  facetValue: {
    fontFamily: FontFamily.sans,
    fontSize: 26,
    lineHeight: 26,
  },
  facetLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
    marginTop: 8,
  },
  facetHint: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    marginTop: 2,
  },
  facetTrack: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 10,
  },
  facetFill: {
    height: '100%',
    borderRadius: 999,
  },
  ritualCard: {
    marginTop: 12,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  ritualTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 14,
  },
  ritualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  ritualDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ritualTitle: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 14,
  },
  ritualMeta: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    marginTop: 2,
  },
  ritualMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  ritualMoreText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 12,
  },
  storyCard: {
    marginTop: 12,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  storyEyebrow: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  storyTitle: {
    fontFamily: FontFamily.sans,
    fontSize: 22,
    lineHeight: 26,
    marginTop: 6,
  },
  storyBody: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  moodRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  moodButton: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkCard: {
    marginTop: 12,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
  },
});
