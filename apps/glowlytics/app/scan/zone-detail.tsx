import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import Animated, { Easing, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { FontFamily, Glow, Spacing } from '../../src/constants/theme';
import { FaceMapZones, ZoneKey } from '../../src/components/scan/FaceMapZones';
import { useStore } from '../../src/store/useStore';
import { computeSignalHistory } from '../../src/services/skinInsights';

const P = Glow.palette;

type Finding = { lead: string; body: string; tag: string };

// Zone → primary signal channel mapping (must mirror face-map.tsx).
const ZONE_SIGNAL: Record<string, 'hydration' | 'inflammation' | 'sunDamage' | 'structure' | 'elasticity'> = {
  forehead:  'hydration',
  cheekL:    'inflammation',
  cheekR:    'inflammation',
  tzone:     'sunDamage',
  jaw:       'structure',
  undereyeL: 'elasticity',
  undereyeR: 'elasticity',
};

// Generic verdict copy derived from the active score band. We avoid making
// the legacy hardcoded claims (e.g. "Clear · 12-day streak") because they
// were shown to every user regardless of their actual data.
function verdictForScore(label: string, score: number, deltaVs7d: number | null): {
  mood: string; quote: string;
} {
  const direction = deltaVs7d == null ? '' :
    deltaVs7d >= 4 ? ' · trending up' :
    deltaVs7d <= -4 ? ' · trending down' :
    ' · steady';

  if (score >= 85) return { mood: `Glowing${direction}`, quote: `${label} read is peak today.` };
  if (score >= 75) return { mood: `Holding${direction}`,  quote: `${label} is comfortably in your healthy band.` };
  if (score >= 60) return { mood: `Watching${direction}`, quote: `${label} is steady. Small habits will keep it there.` };
  if (score >= 40) return { mood: `Drifting${direction}`, quote: `${label} dipped. There is room for a meaningful change.` };
  return { mood: `Tender${direction}`, quote: `${label} needs attention: protect, soothe, repeat.` };
}

// Findings synthesised from the current score band + recent trend. Every
// claim is anchored to a number so a user can verify it against their data.
function findingsForBand(
  label: string,
  score: number,
  history: number[],
): Finding[] {
  const recent = history.slice(-7);
  const baseline = history.length > 7
    ? history.slice(0, history.length - 7).reduce((a, b) => a + b, 0) / Math.max(1, history.length - 7)
    : null;
  const recentAvg = recent.length > 0
    ? recent.reduce((a, b) => a + b, 0) / recent.length
    : score;
  const baselineDelta = baseline != null ? recentAvg - baseline : null;

  const stateTag = score >= 75 ? 'stable' : score >= 60 ? 'watch' : 'tender';
  const trendTag = baselineDelta == null
    ? 'first read'
    : baselineDelta >= 4 ? 'improving' : baselineDelta <= -4 ? 'slipping' : 'flat';

  return [
    {
      lead: 'Current reading',
      body: `${score}/100, ${label.toLowerCase()} ${score >= 75 ? 'in the healthy band' : score >= 60 ? 'in the watching band' : 'below your healthy band'}.`,
      tag: stateTag,
    },
    {
      lead: '7-day trend',
      body: baselineDelta == null
        ? 'Not enough history yet. Keep scanning daily to build a trendline.'
        : `Last 7 days average ${recentAvg.toFixed(0)}, prior baseline ${baseline!.toFixed(0)} (${baselineDelta >= 0 ? '+' : ''}${baselineDelta.toFixed(0)}).`,
      tag: trendTag,
    },
    {
      lead: 'Range this fortnight',
      body: history.length === 0
        ? 'No paired readings yet.'
        : `${Math.min(...history)}–${Math.max(...history)} across ${history.length} scan${history.length === 1 ? '' : 's'}.`,
      tag: 'range',
    },
  ];
}

function ghostZones(focus: ZoneKey) {
  const focusStyle = { fill: P.accent + 'dd', stroke: P.accent, strokeWidth: 1 };
  const ghost = { fill: 'none', stroke: P.glow, strokeWidth: 0.6, dash: '2 3', opacity: 0.5 };
  const all: ZoneKey[] = ['forehead', 'tzone', 'cheekL', 'cheekR', 'jaw', 'undereyeL', 'undereyeR'];
  const out: Partial<Record<ZoneKey, { fill: string; stroke: string; strokeWidth: number; dash?: string; opacity?: number }>> = {};
  for (const z of all) out[z] = z === focus ? focusStyle : ghost;
  // Mirror under-eye / cheek highlights for symmetry.
  if (focus === 'undereyeL') out.undereyeR = focusStyle;
  if (focus === 'cheekL') out.cheekR = focusStyle;
  return out;
}

function TrendSparkline({ data, color = P.accent }: { data: number[]; color?: string }) {
  const w = 300;
  const h = 60;
  const min = Math.min(...data) - 2;
  const max = Math.max(...data) + 2;
  const range = Math.max(max - min, 1);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / range) * h] as const);
  const linePath = pts
    .map(([x, y], i) => (i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`))
    .join(' ');
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <Defs>
        <SvgLinearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Path d={areaPath} fill="url(#trend-grad)" />
      <Path
        d={linePath}
        stroke={color}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {pts.map(([x, y], i) => (
        <Circle
          key={i}
          cx={x}
          cy={y}
          r={i === pts.length - 1 ? 3.2 : 1.6}
          fill={color}
        />
      ))}
    </Svg>
  );
}

export default function ZoneDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ zone?: string; label?: string; score?: string }>();

  const zone = (params.zone as ZoneKey) ?? 'undereyeL';
  const label = params.label ?? 'Under-eye';
  const score = params.score ? Number(params.score) : 0;

  // Real signal-history trend for this zone's mapped channel. Falls back
  // to a single-point series anchored on the current score so the sparkline
  // still renders for users with only one scan.
  const modelOutputs = useStore((s) => s.modelOutputs);
  const dailyRecords = useStore((s) => s.dailyRecords);
  const signalKey = ZONE_SIGNAL[zone] ?? 'structure';

  const trend = useMemo(() => {
    const history = computeSignalHistory(signalKey, dailyRecords, modelOutputs, 14);
    if (history.length === 0) return [score];
    return history.map((p) => p.value);
  }, [signalKey, dailyRecords, modelOutputs, score]);

  // 7-day delta vs the prior baseline (used for verdict + findings).
  const last7Avg = useMemo(() => {
    const tail = trend.slice(-7);
    if (tail.length === 0) return null;
    return tail.reduce((a, b) => a + b, 0) / tail.length;
  }, [trend]);
  const prior7Avg = useMemo(() => {
    if (trend.length <= 7) return null;
    const head = trend.slice(0, trend.length - 7);
    return head.reduce((a, b) => a + b, 0) / head.length;
  }, [trend]);
  const deltaVs7d = last7Avg != null && prior7Avg != null
    ? Math.round(last7Avg - prior7Avg)
    : null;

  const verdict = useMemo(
    () => verdictForScore(label, score, deltaVs7d),
    [label, score, deltaVs7d],
  );
  const findings = useMemo(
    () => findingsForBand(label, score, trend),
    [label, score, trend],
  );

  const trendLabelSuffix = deltaVs7d == null
    ? ''
    : deltaVs7d >= 4 ? ' · ↑' : deltaVs7d <= -4 ? ' · ↓' : ' · holding';

  const zoneStyles = useMemo(() => ghostZones(zone), [zone]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[P.surface, P.bg]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.xs,
          paddingBottom: insets.bottom + Spacing.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityLabel="Back"
            style={styles.backBtn}
          >
            <Feather name="arrow-left" size={20} color={P.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>{label}</Text>
          <View style={styles.backBtn} />
        </View>

        {/* hero zone card */}
        <Animated.View
          entering={FadeInUp.duration(700).easing(Easing.out(Easing.cubic))}
          style={styles.heroCard}
        >
          <View style={styles.heroFace}>
            <FaceMapZones size={96} zones={zoneStyles} contour="ink" />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.heroEyebrow}>{verdict.mood}</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreBig}>{score}</Text>
              <Text style={styles.scoreHolding}>{trendLabelSuffix || ' · first read'}</Text>
            </View>
            <Text style={styles.heroQuote}>{verdict.quote}</Text>
          </View>
        </Animated.View>

        {/* findings */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>What we noticed</Text>
        </View>

        <View style={styles.findingsList}>
          {findings.map((f, idx) => (
            <Animated.View
              key={f.lead}
              entering={FadeInDown.delay(80 * idx + 100)
                .duration(540)
                .easing(Easing.out(Easing.cubic))}
              style={styles.findingCard}
            >
              <View style={styles.findingRow}>
                <Text style={styles.findingLead}>{f.lead}</Text>
                <Text style={styles.findingTag}>{f.tag}</Text>
              </View>
              <Text style={styles.findingBody}>{f.body}</Text>
            </Animated.View>
          ))}
        </View>

        {/* trend */}
        <View style={styles.trendCard}>
          <View style={styles.trendHead}>
            <Text style={styles.trendLabel}>Trend · {trend.length} scan{trend.length === 1 ? '' : 's'}</Text>
            <Text style={styles.trendRange}>
              {Math.min(...trend)}–{Math.max(...trend)}
            </Text>
          </View>
          <TrendSparkline data={trend} />
        </View>

        {/* next */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="See the pattern"
          >
            <Text style={styles.primaryBtnText}>See the pattern →</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.6 }]}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <Text style={styles.ghostBtnText}>Back to face map</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: P.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 22,
    color: P.ink,
  },
  heroCard: {
    marginHorizontal: 16,
    borderRadius: 28,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  heroFace: {
    width: 96,
    height: 130,
  },
  heroEyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 4,
  },
  scoreBig: {
    fontFamily: FontFamily.sans,
    fontSize: 38,
    lineHeight: 38,
    color: P.ink,
  },
  scoreHolding: {
    fontFamily: FontFamily.sansBold,
    fontSize: 11,
    color: P.muted,
    marginBottom: 4,
  },
  heroQuote: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 16,
    color: P.ink,
    marginTop: 8,
    lineHeight: 21,
  },
  sectionHead: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  findingsList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  findingCard: {
    backgroundColor: P.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: P.glow,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  findingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  findingLead: {
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
    color: P.ink,
  },
  findingTag: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 9,
    color: P.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  findingBody: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    color: P.muted,
    marginTop: 4,
    lineHeight: 18,
  },
  trendCard: {
    marginTop: 20,
    marginHorizontal: 16,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    borderRadius: 18,
    padding: 16,
  },
  trendHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  trendLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  trendRange: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
  },
  actions: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: P.ink,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: P.surface,
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
  },
  ghostBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  ghostBtnText: {
    color: P.muted,
    fontFamily: FontFamily.sans,
    fontSize: 12,
  },
});
