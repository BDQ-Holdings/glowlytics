import React, { useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GlowIcon, GlowSpark } from '../../src/components/glow/GlowIcons';
import {
  BreathingGlow,
  FadeUp,
  GlowRing,
  SectionHead,
} from '../../src/components/glow/GlowPrimitives';
import {
  BorderRadius,
  Colors,
  FontFamily,
  Glow,
  Spacing,
} from '../../src/constants/theme';
import { toSignalKey } from '../../src/constants/signals';
import { resolveMedicalSourceUrl } from '../../src/constants/externalLinks';
import { useStore } from '../../src/store/useStore';
import {
  buildOverallSkinInsight,
  getLatestDailyForOutput,
} from '../../src/services/skinInsights';
import type { CompositeSignals } from '../../src/services/skinInsights';

type SignalKey = 'hydration' | 'elasticity' | 'inflammation' | 'sun_damage' | 'structure';

const signalProperty = (key: SignalKey): keyof CompositeSignals => toSignalKey(key);

// Glow facet labels — match the Today/Story tabs.
const FACET_LABEL: Record<SignalKey, string> = {
  hydration: 'Hydrated',
  inflammation: 'Calm',
  sun_damage: 'Even',
  structure: 'Firm',
  elasticity: 'Bounce',
};

const FACET_HINT: Record<SignalKey, string> = {
  hydration: 'Plump + dewy moisture',
  inflammation: 'Less redness, even tone',
  sun_damage: 'Brighter, smoother tone',
  structure: 'Bounce + dermal integrity',
  elasticity: 'Skin firmness + resilience',
};

const FACET_ICON: Record<SignalKey, 'drop' | 'leaf' | 'sun' | 'sparkle'> = {
  hydration: 'drop',
  inflammation: 'leaf',
  sun_damage: 'sun',
  structure: 'sparkle',
  elasticity: 'sparkle',
};

const FACET_LEAD: Record<SignalKey, (score: number) => string> = {
  hydration: (s) => (s >= 75 ? 'plump' : s >= 50 ? 'steady' : 'a little dry'),
  inflammation: (s) => (s >= 75 ? 'calm' : s >= 50 ? 'settling' : 'reactive'),
  sun_damage: (s) => (s >= 75 ? 'even' : s >= 50 ? 'brightening' : 'a touch uneven'),
  structure: (s) => (s >= 75 ? 'firm' : s >= 50 ? 'holding' : 'soft'),
  elasticity: (s) => (s >= 75 ? 'springy' : s >= 50 ? 'resilient' : 'a little tired'),
};

interface WeightFactor {
  label: string;
  weight: number;
  sourceField: string;
}

const WEIGHT_FACTORS: Record<SignalKey, WeightFactor[]> = {
  structure: [
    { label: 'Texture index', weight: 0.55, sourceField: 'texture_index' },
    { label: 'Skin age',      weight: 0.45, sourceField: 'skin_age_score' },
  ],
  hydration: [
    { label: 'Texture index', weight: 0.5,  sourceField: 'texture_index' },
    { label: 'Acne risk',     weight: 0.2,  sourceField: 'acne_score' },
    { label: 'Stress level',  weight: 0.15, sourceField: 'stress_level' },
    { label: 'Sleep quality', weight: 0.15, sourceField: 'sleep_quality' },
  ],
  inflammation: [
    { label: 'Inflammation index', weight: 0.8, sourceField: 'inflammation_index' },
    { label: 'Acne risk',          weight: 0.2, sourceField: 'acne_score' },
  ],
  sun_damage: [
    { label: 'Sun damage score',   weight: 0.82, sourceField: 'sun_damage_score' },
    { label: 'Pigmentation index', weight: 0.18, sourceField: 'pigmentation_index' },
  ],
  elasticity: [
    { label: 'Skin age',      weight: 0.62, sourceField: 'skin_age_score' },
    { label: 'Texture index', weight: 0.38, sourceField: 'texture_index' },
  ],
};

const formatShortDate = (dateStr: string) => {
  const [, m, d] = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
};

export default function SignalDetailScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const palette = Glow.palette;
  const insets = useSafeAreaInsets();

  const signalKey = (key || 'structure') as SignalKey;
  const facetLabel = FACET_LABEL[signalKey];
  const hint = FACET_HINT[signalKey];
  const icon = FACET_ICON[signalKey];

  const dailyRecords = useStore((s) => s.dailyRecords);
  const modelOutputs = useStore((s) => s.modelOutputs);
  const getLatestOutput = useStore((s) => s.getLatestOutput);

  const latestOutput = getLatestOutput();
  const latestDaily = getLatestDailyForOutput(latestOutput, dailyRecords);
  const baselineOutput = modelOutputs.length > 0 ? modelOutputs[0] : null;
  const baselineDaily = getLatestDailyForOutput(baselineOutput, dailyRecords);

  const insight = useMemo(
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
    [latestOutput, latestDaily, baselineOutput, baselineDaily],
  );

  const baselineInsight = useMemo(
    () =>
      baselineOutput
        ? buildOverallSkinInsight({
            latestOutput: baselineOutput,
            baselineOutput,
            latestDaily: baselineDaily,
            baselineDaily,
            serverSignalScores: baselineOutput.signal_scores,
            serverSignalFeatures: baselineOutput.signal_features,
            serverSignalConfidence: baselineOutput.signal_confidence,
            serverLesions: baselineOutput.lesions,
          })
        : null,
    [baselineOutput, baselineDaily],
  );

  const hasData = insight !== null;
  const rawSignalValue = hasData ? insight.signals[signalProperty(signalKey)] : 50;
  const signalValue = Number.isFinite(rawSignalValue) ? Math.round(rawSignalValue) : 50;
  const baseValue = baselineInsight ? Math.round(baselineInsight.signals[signalProperty(signalKey)]) : null;
  const delta = baseValue !== null ? signalValue - baseValue : null;
  const lead = FACET_LEAD[signalKey](signalValue);

  const factorValues = useMemo(() => {
    if (!latestOutput || !latestDaily) return {} as Record<string, number | undefined>;
    return {
      texture_index: latestDaily.scanner_indices?.texture_index,
      inflammation_index: latestDaily.scanner_indices?.inflammation_index,
      pigmentation_index: latestDaily.scanner_indices?.pigmentation_index,
      acne_score: latestOutput.acne_score,
      sun_damage_score: latestOutput.sun_damage_score,
      skin_age_score: latestOutput.skin_age_score,
      stress_level: latestDaily.stress_level != null ? Number(latestDaily.stress_level) * 20 : undefined,
      sleep_quality: latestDaily.sleep_quality != null ? Number(latestDaily.sleep_quality) * 20 : undefined,
    };
  }, [latestOutput, latestDaily]);

  const trendEntries = useMemo(() => {
    const sorted = [...dailyRecords].sort((a, b) => a.date.localeCompare(b.date));
    const last14 = sorted.slice(-14);
    return last14
      .map((record) => {
        const output = modelOutputs.find((o) => o.daily_id === record.daily_id);
        if (!output) return null;
        const dayInsight = buildOverallSkinInsight({
          latestOutput: output,
          baselineOutput,
          latestDaily: record,
          baselineDaily,
          serverSignalScores: output?.signal_scores,
          serverSignalFeatures: output?.signal_features,
          serverSignalConfidence: output?.signal_confidence,
          serverLesions: output?.lesions,
        });
        if (!dayInsight) return null;
        return { date: record.date, value: Math.round(dayInsight.signals[signalProperty(signalKey)]) };
      })
      .filter((v): v is { date: string; value: number } => v !== null);
  }, [dailyRecords, modelOutputs, signalKey, baselineOutput, baselineDaily]);

  const trendData = trendEntries.map((e) => e.value);
  const trendStartDate = trendEntries.length >= 2 ? trendEntries[0].date : null;
  const trendEndDate = trendEntries.length >= 2 ? trendEntries[trendEntries.length - 1].date : null;

  const generatedInsight = latestOutput?.generated_insights?.signal_insights?.[signalProperty(signalKey)];

  const signalGuidelines = useMemo(() => {
    const recs = latestOutput?.rag_recommendations;
    if (!recs || recs.length === 0) return [];
    return recs.filter((r) => r.signal === signalProperty(signalKey) || r.signal === 'general');
  }, [latestOutput?.rag_recommendations, signalKey]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
      showsVerticalScrollIndicator={false}
    >
      <FadeUp index={0}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <GlowIcon name="back" size={22} color={palette.ink} stroke={1.8} />
          </TouchableOpacity>
          <Text style={[s.eyebrow, { color: palette.muted }]}>{facetLabel.toUpperCase()} · DETAIL</Text>
          <View style={{ width: 22 }} />
        </View>
      </FadeUp>

      {/* Hero */}
      <FadeUp index={1}>
        <View style={s.heroOuter}>
          <LinearGradient
            colors={[palette.surface, palette.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[s.heroCard, { borderColor: palette.glow }]}
          >
            <View style={s.heroBreathePos}>
              <BreathingGlow color={palette.glow} size={220} />
            </View>
            <View style={s.heroTopRow}>
              <View style={{ flex: 1 }}>
                <View style={s.heroIconRow}>
                  <GlowIcon name={icon} size={20} color={palette.accent} stroke={1.6} />
                  <Text style={[s.heroIconLabel, { color: palette.muted }]}>
                    {facetLabel.toUpperCase()}
                  </Text>
                </View>
                <View style={s.heroNumberRow}>
                  <Text style={[s.heroNumber, { color: palette.ink }]}>
                    {hasData ? signalValue : '—'}
                  </Text>
                  {delta !== null && delta !== 0 && (
                    <View style={{ marginLeft: 8 }}>
                      <Text style={[s.heroDelta, { color: palette.accent }]}>
                        {delta > 0 ? '+' : ''}{delta}
                      </Text>
                      <Text style={[s.heroDeltaCaption, { color: palette.muted }]}>vs. start</Text>
                    </View>
                  )}
                </View>
                <Text style={[s.heroCopy, { color: palette.ink }]}>
                  Reading <Text style={[s.heroCopyAccent, { color: palette.ink }]}>{lead}</Text>. {hint}.
                </Text>
              </View>
              <GlowRing
                size={92}
                stroke={6}
                value={hasData ? signalValue : 0}
                color={palette.accent}
                track={palette.glow}
              >
                <Text style={[s.heroRingLabel, { color: palette.muted }]}>
                  {facetLabel.toUpperCase()}
                </Text>
                <Text style={[s.heroRingValue, { color: palette.ink }]}>
                  {hasData ? signalValue : '—'}
                </Text>
              </GlowRing>
            </View>
          </LinearGradient>
        </View>
      </FadeUp>

      {!hasData && (
        <FadeUp index={2}>
          <View style={s.section}>
            <View style={[s.emptyCard, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
              <Text style={[s.emptyTitle, { color: palette.ink }]}>Reading pending</Text>
              <Text style={[s.emptyBody, { color: palette.muted }]}>
                Your {facetLabel.toLowerCase()} breakdown appears after your first scan.
              </Text>
            </View>
          </View>
        </FadeUp>
      )}

      {hasData && (
        <>
          {/* Contributing factors */}
          <FadeUp index={2}>
            <View style={s.section}>
              <SectionHead
                title="What feeds it"
                hint={`${WEIGHT_FACTORS[signalKey].length} signals`}
                ink={palette.ink}
                muted={palette.muted}
              />
              <View style={[s.card, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
                {WEIGHT_FACTORS[signalKey].map((factor, i) => {
                  const rawValue = factorValues[factor.sourceField];
                  const displayVal = rawValue != null ? Math.round(rawValue) : null;
                  return (
                    <View
                      key={factor.label}
                      style={[
                        s.factorRow,
                        i < WEIGHT_FACTORS[signalKey].length - 1 && {
                          borderBottomWidth: 1,
                          borderBottomColor: palette.bg,
                        },
                      ]}
                    >
                      <View style={s.factorTopRow}>
                        <Text style={[s.factorLabel, { color: palette.ink }]}>{factor.label}</Text>
                        <View style={s.factorRight}>
                          {displayVal != null && (
                            <Text style={[s.factorActual, { color: palette.accent }]}>{displayVal}</Text>
                          )}
                          <Text style={[s.factorWeight, { color: palette.muted }]}>
                            {Math.round(factor.weight * 100)}%
                          </Text>
                        </View>
                      </View>
                      <View style={[s.factorTrack, { backgroundColor: palette.bg }]}>
                        <View
                          style={{
                            height: '100%',
                            width: `${factor.weight * 100}%`,
                            backgroundColor: palette.accent,
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </FadeUp>

          {/* Trend */}
          <FadeUp index={3}>
            <View style={s.section}>
              <SectionHead
                title="Last 14 days"
                hint={trendData.length >= 2 ? `${trendData.length} reads` : 'need more reads'}
                ink={palette.ink}
                muted={palette.muted}
              />
              <View style={[s.card, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
                {trendData.length >= 2 ? (
                  <>
                    <GlowSpark
                      data={trendData}
                      color={palette.accent}
                      width={296}
                      height={70}
                    />
                    <View style={s.trendDates}>
                      <Text style={[s.trendDate, { color: palette.muted }]}>
                        {trendStartDate ? formatShortDate(trendStartDate) : ''}
                      </Text>
                      <Text style={[s.trendDate, { color: palette.muted }]}>
                        {trendEndDate ? formatShortDate(trendEndDate) : ''}
                      </Text>
                    </View>
                  </>
                ) : (
                  <Text style={[s.emptyBody, { color: palette.muted }]}>
                    Take a few more check-ins to see your trend.
                  </Text>
                )}
              </View>
            </View>
          </FadeUp>

          {/* Recommendation */}
          <FadeUp index={4}>
            <View style={s.section}>
              <SectionHead
                title="What to do"
                hint=""
                ink={palette.ink}
                muted={palette.muted}
              />
              <View style={[s.card, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
                {generatedInsight ? (
                  <View>
                    <View style={s.recDotRow}>
                      <View style={[s.recDot, { backgroundColor: palette.accent }]} />
                      <Text style={[s.recStatus, { color: palette.ink }]}>{generatedInsight.status}</Text>
                    </View>
                    <Text style={[s.recDriver, { color: palette.muted }]}>
                      Driver · {generatedInsight.driver}
                    </Text>
                    <Text style={[s.recAction, { color: palette.ink }]}>{generatedInsight.action}</Text>
                  </View>
                ) : (
                  <Text style={[s.emptyBody, { color: palette.muted }]}>
                    Personalized guidance appears once your scan reaches our analysis service.
                  </Text>
                )}
                <Text style={[s.disclaimer, { color: palette.muted }]}>
                  Informational only. Not medical advice. See a dermatologist for diagnosis and treatment.
                </Text>
              </View>
            </View>
          </FadeUp>

          {/* Clinical guidelines */}
          {signalGuidelines.length > 0 && (
            <FadeUp index={5}>
              <View style={s.section}>
                <SectionHead
                  title="The evidence"
                  hint={`${signalGuidelines.length} sources`}
                  ink={palette.ink}
                  muted={palette.muted}
                />
                <View style={{ gap: 8 }}>
                  {signalGuidelines.map((rec, i) => {
                    const sourceUrl = rec.source_citation ? resolveMedicalSourceUrl(rec.source_citation) : null;
                    return (
                      <View
                        key={i}
                        style={[s.evidenceCard, { backgroundColor: palette.surface, borderColor: palette.glow }]}
                      >
                        <View style={s.evidenceTopRow}>
                          <Text style={[s.evidenceCategory, { color: palette.accent }]}>
                            {rec.category.replace(/_/g, ' ').toUpperCase()}
                          </Text>
                          <View style={[s.evidencePill, { backgroundColor: palette.bg }]}>
                            <Text style={[s.evidencePillText, { color: palette.muted }]}>
                              Grade {rec.evidence_level || 'C'}
                            </Text>
                          </View>
                        </View>
                        <Text style={[s.evidenceText, { color: palette.ink }]}>{rec.text}</Text>
                        {!!rec.source_citation && (
                          sourceUrl ? (
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => Linking.openURL(sourceUrl).catch(() => {})}
                            >
                              <Text style={[s.evidenceSourceLink, { color: palette.accent }]}>
                                {rec.source_citation}
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={[s.evidenceSource, { color: palette.muted }]}>
                              {rec.source_citation}
                            </Text>
                          )
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            </FadeUp>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  headerRow: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
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
    paddingBottom: 28,
    overflow: 'hidden',
  },
  heroBreathePos: {
    position: 'absolute',
    top: -40,
    right: -50,
    width: 220,
    height: 220,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroIconLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  heroNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
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
  section: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  card: {
    marginTop: 12,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
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
  factorRow: {
    paddingVertical: 12,
  },
  factorTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  factorLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 14,
  },
  factorRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  factorActual: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
  },
  factorWeight: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
  },
  factorTrack: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 8,
  },
  trendDates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  trendDate: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
  },
  recDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recStatus: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
  },
  recDriver: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    marginTop: 4,
  },
  recAction: {
    fontFamily: FontFamily.sans,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  disclaimer: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 14,
    fontStyle: 'italic',
  },
  evidenceCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  evidenceTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  evidenceCategory: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  evidencePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  evidencePillText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  evidenceText: {
    fontFamily: FontFamily.sans,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  evidenceSource: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    marginTop: 8,
  },
  evidenceSourceLink: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 11,
    marginTop: 8,
    textDecorationLine: 'underline',
  },
});
