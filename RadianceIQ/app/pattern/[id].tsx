import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Line, Polyline } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useStore } from '../../src/store/useStore';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
} from '../../src/constants/theme';
import { SIGNAL_COLORS } from '../../src/constants/signals';
import { exportAndSharePattern } from '../../src/services/patternExport';

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
  const patterns = useStore((s) => s.patterns);
  const pattern = patterns.find((p) => p.id === id);

  const suggestions = useMemo(() => {
    if (!pattern) return [];
    const key = `${pattern.signal}:${pattern.driver}`;
    return SUGGESTIONS[key] ?? [];
  }, [pattern]);

  if (!pattern) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.notFound}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.notFoundText}>Pattern not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const signalColor = (SIGNAL_COLORS as Record<string, string>)[pattern.signal] ?? Colors.primary;
  const chartW = 320;
  const chartH = 180;
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
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <Text style={styles.breadcrumb}>
          {pattern.confidence.toUpperCase()} · {pattern.type.replace(/_/g, ' ').toUpperCase()}
        </Text>

        <Text style={styles.headline}>{pattern.insightText}</Text>
        <Text style={styles.detail}>{pattern.detailText}</Text>

        {polyline ? (
          <View style={styles.chartBox}>
            <Svg width={chartW} height={chartH}>
              {[0, 25, 50, 75, 100].map((tick) => {
                const y = chartH - (tick / 100) * chartH;
                return (
                  <Line
                    key={tick}
                    x1={0}
                    y1={y}
                    x2={chartW}
                    y2={y}
                    stroke={Colors.border}
                    strokeWidth={0.5}
                    strokeDasharray="2,4"
                  />
                );
              })}
              <Polyline
                points={polyline}
                fill="none"
                stroke={signalColor}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>How we found this</Text>
        <Text style={styles.sectionBody}>
          Tracked {pattern.sampleSize} days of paired data. Pattern{' '}
          {pattern.confidence === 'strong'
            ? 'appears strongly and consistently'
            : 'has emerged and is holding steady'}{' '}
          in your recent history.
        </Text>

        {suggestions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>What you can try</Text>
            {suggestions.map((s, i) => (
              <View key={i} style={styles.suggestionRow}>
                <Feather name="check-circle" size={14} color={Colors.primary} />
                <Text style={styles.suggestionText}>{s}</Text>
              </View>
            ))}
          </>
        )}

        {!pattern.isPredicted && (
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => exportAndSharePattern(pattern)}
          >
            <Feather name="share-2" size={16} color={Colors.background} />
            <Text style={styles.shareButtonText}>Share this pattern</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },
  headerRow: { paddingTop: Spacing.sm },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumb: {
    color: Colors.primary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xxs,
    letterSpacing: 1.2,
  },
  headline: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    lineHeight: 34,
  },
  detail: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 23,
  },
  chartBox: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
    marginVertical: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    marginTop: Spacing.sm,
  },
  sectionBody: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  suggestionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  suggestionText: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  shareButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.lg,
  },
  shareButtonText: {
    color: Colors.background,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  notFound: { flex: 1, padding: Spacing.lg, gap: Spacing.lg },
  notFoundText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.lg,
    textAlign: 'center',
    marginTop: Spacing.xxl,
  },
});
