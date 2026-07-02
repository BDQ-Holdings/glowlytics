import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { GlowIcon } from '../../src/components/glow/GlowIcons';
import { FadeUp, SectionHead } from '../../src/components/glow/GlowPrimitives';
import { useStore } from '../../src/store/useStore';
import {
  BorderRadius,
  Colors,
  FontFamily,
  Glow,
  Spacing,
} from '../../src/constants/theme';
import { exportAndSharePattern } from '../../src/services/patternExport';
import { PatternExportCard } from '../../src/components/PatternExportCard';
import { ClinicalSourcesCard } from '../../src/components/ClinicalSourcesCard';

// Static "what you can try" lookup — keyed on (signal + driver)
const SUGGESTIONS: Record<string, string[]> = {
  'inflammation:cycle_day': [
    'Increase niacinamide use on days 22-28 of your cycle',
    'Reduce dairy and sugar in the same window',
    'Prioritize sleep — inflammation spikes are worse when sleep is short',
  ],
  'inflammation:hrv_sdnn_ms': [
    'Try to get 7+ hours of sleep — HRV recovers with rest',
    'Consider 10 minutes of mindful breathing on high-stress days',
    'Hold off on new active ingredients during low-HRV weeks',
  ],
  'hydration:sleep_total_minutes': [
    'Aim for 7-9 hours of sleep consistently',
    'Apply a hydrating toner or essence before bed',
    'Keep a glass of water by your bed',
  ],
  'acne:drinks_yesterday': [
    'Try a 2-week alcohol-free window and watch the trend',
    'Drink extra water on drinking days',
    'Double-cleanse on mornings after drinks',
  ],
  'overall:stress_level': [
    'Schedule one stress-reducing activity daily (walk, breath, stretch)',
    'Keep your evening routine simple on high-stress days',
    'Track what works — stress is the #1 lifestyle factor in the data',
  ],
};

export default function PatternDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = Glow.palette;
  const insets = useSafeAreaInsets();

  const patterns = useStore((s) => s.patterns);
  const pattern = patterns.find((p) => p.id === id);

  const [sharingPattern, setSharingPattern] = useState<typeof pattern | null>(null);
  const exportRef = useRef<View | null>(null);

  useEffect(() => {
    if (!sharingPattern) return;
    const t = setTimeout(() => {
      exportAndSharePattern(sharingPattern, exportRef).finally(() => setSharingPattern(null));
    }, 100);
    return () => clearTimeout(t);
  }, [sharingPattern]);

  const suggestions = useMemo(() => {
    if (!pattern) return [];
    const key = `${pattern.signal}:${pattern.driver}`;
    return SUGGESTIONS[key] ?? [];
  }, [pattern]);

  // Build 7-day correlation visual from chartData (uses the most recent 7 days).
  const correlation = useMemo(() => {
    if (!pattern) return [];
    const last7 = pattern.chartData.slice(-7);
    return last7.map((p, i) => ({
      day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i % 7],
      value: Math.round(p.signalValue ?? 0),
      driver: p.driverValue,
    }));
  }, [pattern]);

  const maxV = useMemo(
    () => (correlation.length ? Math.max(...correlation.map((c) => c.value)) || 100 : 100),
    [correlation],
  );

  if (!pattern) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: insets.top + Spacing.xl }}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <GlowIcon name="back" size={22} color={palette.ink} stroke={1.8} />
          </TouchableOpacity>
        </View>
        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.xl }}>
          <Text style={[s.title, { color: palette.ink }]}>Pattern not found</Text>
          <Text style={[s.subtitle, { color: palette.muted }]}>
            This insight may have been replaced as your data evolved.
          </Text>
        </View>
      </View>
    );
  }

  const avgValue =
    correlation.length > 0
      ? Math.round(correlation.reduce((a, c) => a + c.value, 0) / correlation.length)
      : 0;
  const lift = correlation.length >= 2 ? correlation[correlation.length - 1].value - correlation[0].value : 0;

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
          <Text style={[s.titleSmall, { color: palette.ink }]}>Pattern</Text>
          <View style={{ width: 22 }} />
        </View>
      </FadeUp>

      {/* Hero */}
      <FadeUp index={1}>
        <View style={s.heroOuter}>
          <LinearGradient
            colors={[palette.surface, palette.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.heroCard, { borderColor: palette.glow }]}
          >
            <View style={s.heroTopRow}>
              <Text style={[s.heroTag, { color: palette.accent }]}>
                {pattern.driverLabel.toUpperCase()} · {pattern.signal.toUpperCase()}
              </Text>
              <View style={[s.heroPill, { backgroundColor: palette.bg }]}>
                <Text style={[s.heroPillText, { color: palette.muted }]}>
                  {pattern.confidence} match
                </Text>
              </View>
            </View>
            <Text style={[s.heroTitle, { color: palette.ink }]}>{pattern.insightText}</Text>
            <Text style={[s.heroBody, { color: palette.muted }]}>{pattern.detailText}</Text>
          </LinearGradient>
        </View>
      </FadeUp>

      {/* Correlation chart */}
      {correlation.length > 0 && (
        <FadeUp index={2}>
          <View style={s.section}>
            <SectionHead
              title="The evidence"
              hint={`last ${correlation.length} reads`}
              ink={palette.ink}
              muted={palette.muted}
            />
            <View style={[s.chartCard, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
              <View style={s.chartRow}>
                {correlation.map((c, i) => (
                  <View key={`${c.day}-${i}`} style={s.chartCol}>
                    <View style={s.chartBarWrap}>
                      <View
                        style={[
                          s.chartBar,
                          {
                            height: `${(c.value / maxV) * 100}%`,
                            backgroundColor: palette.accent,
                          },
                        ]}
                      >
                        <Text style={[s.chartBarValue, { color: palette.ink }]}>{c.value}</Text>
                      </View>
                    </View>
                    <Text style={[s.chartDay, { color: palette.muted }]}>{c.day}</Text>
                  </View>
                ))}
              </View>
              <View style={[s.chartFooter, { borderTopColor: palette.bg }]}>
                <Stat palette={palette} label="Avg score" value={String(avgValue)} />
                <Stat palette={palette} label="Sample" value={`${pattern.sampleSize}d`} />
                <Stat palette={palette} label="Lift" value={`${lift >= 0 ? '+' : ''}${lift}`} accent />
              </View>
            </View>
          </View>
        </FadeUp>
      )}

      {/* How we found it */}
      <FadeUp index={3}>
        <View style={s.section}>
          <SectionHead
            title="How we found this"
            hint=""
            ink={palette.ink}
            muted={palette.muted}
          />
          <View style={[s.card, { backgroundColor: palette.surface, borderColor: palette.glow }]}>
            <Text style={[s.cardBody, { color: palette.ink }]}>
              Tracked <Text style={{ fontFamily: FontFamily.sansSemiBold }}>{pattern.sampleSize}</Text> days of paired data.
              The pattern{' '}
              {pattern.confidence === 'strong'
                ? 'appears strongly and consistently'
                : 'has emerged and is holding steady'}{' '}
              in your recent history.
            </Text>
            {pattern.lagDays > 0 && (
              <Text style={[s.cardCaption, { color: palette.muted }]}>
                Lag · {pattern.driverLabel.toLowerCase()} leads {pattern.signal} by {pattern.lagDays}{' '}
                day{pattern.lagDays === 1 ? '' : 's'}
              </Text>
            )}
          </View>
        </View>
      </FadeUp>

      {/* Try this */}
      {suggestions.length > 0 && (
        <FadeUp index={4}>
          <View style={s.section}>
            <SectionHead
              title="Try this"
              hint=""
              ink={palette.ink}
              muted={palette.muted}
            />
            <View style={{ gap: 8, marginTop: 12 }}>
              {suggestions.map((tip, i) => (
                <View
                  key={i}
                  style={[s.tipRow, { backgroundColor: palette.surface, borderColor: palette.glow }]}
                >
                  <View style={[s.tipDot, { backgroundColor: palette.accent }]} />
                  <Text style={[s.tipText, { color: palette.ink }]}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>
        </FadeUp>
      )}

      <FadeUp index={5}>
        <View style={s.section}>
          <ClinicalSourcesCard
            title="Clinical sources"
            subtitle="References behind the skin-health recommendations shown here."
          />
        </View>
      </FadeUp>

      {/* Share */}
      {!pattern.isPredicted && (
        <FadeUp index={5}>
          <View style={s.section}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setSharingPattern(pattern)}
              style={[s.shareCta, { backgroundColor: palette.ink }]}
            >
              <Text style={[s.shareCtaText, { color: palette.surface }]}>Share this pattern</Text>
              <GlowIcon name="arrow" size={16} color={palette.surface} stroke={1.8} />
            </TouchableOpacity>
          </View>
        </FadeUp>
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
    </ScrollView>
  );
}

function Stat({
  palette,
  label,
  value,
  accent,
}: {
  palette: typeof Glow.palette;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontFamily: FontFamily.sans,
          fontSize: 22,
          color: accent ? palette.accent : palette.ink,
          lineHeight: 24,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: FontFamily.sansMedium,
          fontSize: 10,
          color: palette.muted,
          letterSpacing: 0.6,
          marginTop: 4,
        }}
      >
        {label.toUpperCase()}
      </Text>
    </View>
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
  title: {
    fontFamily: FontFamily.sans,
    fontSize: 32,
  },
  titleSmall: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 22,
  },
  subtitle: {
    fontFamily: FontFamily.sans,
    fontSize: 14,
    marginTop: 8,
    lineHeight: 21,
  },
  heroOuter: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTag: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  heroPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  heroPillText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  heroTitle: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 28,
    lineHeight: 34,
    marginTop: 12,
  },
  heroBody: {
    fontFamily: FontFamily.sans,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  chartCard: {
    marginTop: 12,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    gap: 8,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  chartBarWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: '70%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    position: 'relative',
  },
  chartBarValue: {
    position: 'absolute',
    top: -16,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 10,
  },
  chartDay: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  chartFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  card: {
    marginTop: 12,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  cardBody: {
    fontFamily: FontFamily.sans,
    fontSize: 14,
    lineHeight: 22,
  },
  cardCaption: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    marginTop: 8,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  tipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tipText: {
    flex: 1,
    fontFamily: FontFamily.sans,
    fontSize: 14,
    lineHeight: 21,
  },
  shareCta: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 15,
    borderRadius: BorderRadius.full,
  },
  shareCtaText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 15,
  },
});
