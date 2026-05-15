/**
 * Bone-structure results — vertical story carousel.
 *
 * Five pages, paged vertically so the user takes the analysis in one beat
 * at a time rather than scrolling a long document:
 *
 *   1. Hero          — 3D mesh + Harmony score + delta vs previous
 *   2. By area       — radial domain chart (with ghost outline of last scan)
 *   3. Measurements  — 16-card grid of each metric value + score bar
 *   4. What stood out — top findings, tap to drill into a finding detail screen
 *   5. What you can do — three-tier intervention drawer + disclaimer + Done
 *
 * Matches the pacing of `scan/results.tsx` (skin pipeline) so users feel a
 * consistent rhythm between the two analysis flows.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewToken,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Button } from '../../src/components/Button';
import { DomainRadialChart } from '../../src/components/DomainRadialChart';
import { Face3DViewer } from '../../src/components/Face3DViewer';
import { HarmonyIntroOverlay } from '../../src/components/HarmonyIntroOverlay';
import { HarmonyScoreReveal } from '../../src/components/HarmonyScoreReveal';
import { InterventionDrawer } from '../../src/components/InterventionDrawer';
import { ProgressDots, StoryPage } from '../../src/components/StoryCarousel';
import {
  BONE_METRICS,
  FINDING_COPY,
  formatMetricValue,
  type BoneMetricKey,
} from '../../src/constants/boneStructure';
import { buildCanonicalMesh } from '../../src/services/canonicalFaceMesh';
import { useStore } from '../../src/store/useStore';
import { BorderRadius, Colors, FontFamily, FontSize, Glow, Spacing } from '../../src/constants/theme';

export default function BoneResults() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { dailyId } = useLocalSearchParams<{ dailyId?: string }>();

  const modelOutputs = useStore((s) => s.modelOutputs);

  const { output, previousBone } = useMemo(() => {
    if (modelOutputs.length === 0) return { output: null, previousBone: null };
    const target = dailyId
      ? modelOutputs.find((o) => o.daily_id === dailyId) ?? modelOutputs[modelOutputs.length - 1]
      : modelOutputs[modelOutputs.length - 1];
    let prev: typeof modelOutputs[number]['bone_structure'] | null = null;
    const targetIndex = target ? modelOutputs.indexOf(target) : -1;
    for (let i = targetIndex - 1; i >= 0; i--) {
      const b = modelOutputs[i]?.bone_structure;
      if (b && typeof b.harmony === 'number' && Number.isFinite(b.harmony)) {
        prev = b;
        break;
      }
    }
    return { output: target ?? null, previousBone: prev };
  }, [modelOutputs, dailyId]);

  const bone = output?.bone_structure;

  // Stable insets ref so useMemo doesn't re-fire on every render
  const insetsTop = insets.top;
  const insetsBottom = insets.bottom;
  const stableInsets = useMemo(
    () => ({ top: insetsTop, bottom: insetsBottom }),
    [insetsTop, insetsBottom],
  );

  // Story page tracking
  const [activePage, setActivePage] = useState(0);
  const listRef = useRef<FlatList>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActivePage(viewableItems[0].index);
    }
  }).current;

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: screenH, offset: screenH * index, index }),
    [screenH],
  );

  // ── Empty state ─────────────────────────────────────────────
  if (!bone) {
    return (
      <View style={styles.root}>
        <LinearGradient
          colors={[Glow.palette.bg, Glow.palette.surface, Glow.palette.glow]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.emptyContainer,
            { paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.xxl },
          ]}
        >
          <View style={styles.emptyMeshWrap}>
            <View style={styles.emptyMeshGlow} />
            <Face3DViewer
              vertices={buildCanonicalMesh()}
              source="mediapipe"
              mode="anatomy"
              size={Math.min(260, screenW - Spacing.xl * 2)}
              revealProgress={0.55}
            />
          </View>
          <View style={styles.emptyCopyWrap}>
            <Text style={styles.emptyTitle}>Your facial architecture, waiting</Text>
            <Text style={styles.emptyCopy}>
              Run a quick scan to map 32 anatomical landmarks across your face. We’ll compose your Harmony score and what to do about each finding.
            </Text>
          </View>
          <View style={styles.emptyActions}>
            <Button title="Start capture" onPress={() => router.replace('/scan/bone-capture')} size="lg" />
            <Button title="Back" variant="secondary" onPress={() => router.back()} />
          </View>
        </View>
      </View>
    );
  }

  const meshVerts = bone.downsampled_mesh?.vertices || buildCanonicalMesh();
  const meshSource = bone.downsampled_mesh?.source || 'mediapipe';
  const viewerSize = Math.min(340, screenW - Spacing.lg * 2);
  const radialSize = Math.min(280, screenW - Spacing.lg * 2);

  // ── Story pages ──────────────────────────────────────────────
  // Each page renders inside StoryPage which fills the viewport.

  // Page 1 — Hero: 3D mesh + Harmony score + delta vs previous
  const renderHero = () => (
    <StoryPage screenH={screenH} insets={stableInsets}>
      <Animated.View entering={FadeIn.duration(500)} style={styles.heroMeshWrap}>
        <Face3DViewer
          vertices={meshVerts}
          source={meshSource}
          mode="measurements"
          size={viewerSize}
          bone={bone}
        />
      </Animated.View>
      <HarmonyScoreReveal
        score={bone.harmony}
        previousScore={previousBone?.harmony ?? null}
        caption={bone.dominant_driver ? `Strongest opportunity: ${bone.dominant_driver}` : undefined}
      />
      <Animated.View entering={FadeIn.duration(400).delay(900)} style={styles.swipeHint} pointerEvents="none">
        <Feather name="chevron-up" size={14} color={Colors.textDim} />
        <Text style={styles.swipeText}>Swipe up</Text>
      </Animated.View>
    </StoryPage>
  );

  // Page 2 — By area: radial domain chart with optional ghost overlay
  const renderByArea = () => (
    <StoryPage screenH={screenH} insets={stableInsets}>
      <Text style={styles.pageEyebrow}>By area</Text>
      <Animated.View entering={FadeInDown.duration(450)}>
        <Text style={styles.pageTitle}>Where balance lives</Text>
        <Text style={styles.pageSubtitle}>
          A regular hexagon means your six domains are balanced. The further a corner pulls in, the more that domain is dragging.
        </Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.duration(450).delay(150)} style={styles.radialWrap}>
        <DomainRadialChart
          scores={bone.domain_scores || {}}
          previousScores={previousBone?.domain_scores}
          size={radialSize}
        />
        {previousBone && (
          <View style={styles.radialLegend}>
            <View style={styles.radialLegendItem}>
              <View style={[styles.radialLegendSwatch, styles.radialLegendSwatchSolid]} />
              <Text style={styles.radialLegendText}>This scan</Text>
            </View>
            <View style={styles.radialLegendItem}>
              <View style={[styles.radialLegendSwatch, styles.radialLegendSwatchDashed]} />
              <Text style={styles.radialLegendText}>Previous scan</Text>
            </View>
          </View>
        )}
      </Animated.View>
    </StoryPage>
  );

  // Page 3 — Measurements: 16-card metric grid
  const renderMeasurements = () => (
    <StoryPage screenH={screenH} insets={stableInsets}>
      <Text style={styles.pageEyebrow}>Measurements</Text>
      <Text style={styles.pageTitle}>The actual numbers</Text>
      <ScrollView
        style={styles.measurementScroll}
        contentContainerStyle={styles.measurementGrid}
        showsVerticalScrollIndicator={false}
      >
        {BONE_METRICS.map((m, i) => {
          const value = bone.metrics?.[m.key]?.value;
          const score = bone.scored_metrics?.[m.key];
          if (!Number.isFinite(value)) return null;
          return (
            <Animated.View
              key={m.key}
              entering={FadeInDown.duration(350).delay(80 + i * 25)}
              style={styles.metricCard}
            >
              <Text style={styles.metricLabel}>{m.label}</Text>
              <Text style={styles.metricValue}>
                {formatMetricValue(m.key as BoneMetricKey, value as number)}
              </Text>
              {Number.isFinite(score) && (
                <View style={styles.metricFooter}>
                  <View style={styles.miniBar}>
                    <View
                      style={[
                        styles.miniBarFill,
                        { width: `${Math.max(0, Math.min(100, score as number))}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.miniScore}>{score}</Text>
                </View>
              )}
            </Animated.View>
          );
        })}
      </ScrollView>
    </StoryPage>
  );

  // Page 4 — Findings: top 6 most-actionable items
  const renderFindings = () => (
    <StoryPage screenH={screenH} insets={stableInsets}>
      <Text style={styles.pageEyebrow}>What stood out</Text>
      <Text style={styles.pageTitle}>
        {bone.findings && bone.findings.length > 0
          ? 'The points worth knowing'
          : 'Nothing major flagged'}
      </Text>
      {bone.findings && bone.findings.length > 0 ? (
        <ScrollView
          style={styles.findingScroll}
          contentContainerStyle={styles.findingList}
          showsVerticalScrollIndicator={false}
        >
          {bone.findings.slice(0, 6).map((f, i) => {
            const copy = FINDING_COPY[f.findingCode];
            if (!copy) return null;
            return (
              <Animated.View key={f.findingCode} entering={FadeInDown.duration(350).delay(80 + i * 60)}>
                <Pressable
                  style={styles.findingCard}
                  onPress={() =>
                    router.push({
                      pathname: '/architecture/[finding]',
                      params: { finding: f.findingCode, dailyId: output?.daily_id || '' },
                    })
                  }
                  accessibilityLabel={`See details for ${copy.title}`}
                >
                  <View style={styles.findingHeader}>
                    <Feather name="circle" size={8} color={Colors.harmony} />
                    <Text style={styles.findingTitle}>{copy.title}</Text>
                    <View style={[styles.findingBadge, severityStyle(f.severity)]}>
                      <Text style={styles.findingBadgeText}>{f.severity}</Text>
                    </View>
                    <Feather name="chevron-right" size={14} color={Colors.textMuted} />
                  </View>
                  <Text style={styles.findingDesc}>{copy.description}</Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={styles.findingsEmpty}>
          Every domain landed inside its healthy range on this scan. Keep going — the more scans you log, the clearer trends become.
        </Text>
      )}
    </StoryPage>
  );

  // Page 5 — What you can do: three-tier intervention drawer + done
  const renderInterventions = () => (
    <StoryPage screenH={screenH} insets={stableInsets}>
      <Text style={styles.pageEyebrow}>What you can do</Text>
      <Text style={styles.pageTitle}>Three tiers, in order</Text>
      <Text style={styles.pageSubtitle}>
        Start with lifestyle. Add pharma if you want more lift. Procedural is permanent — only with a board-certified specialist.
      </Text>
      <Animated.View entering={FadeInDown.duration(400).delay(150)} style={styles.interventionWrap}>
        <InterventionDrawer bundle={bone.interventions} />
      </Animated.View>
      <View style={styles.doneRow}>
        <Button title="Done" onPress={() => router.replace('/(tabs)/today')} size="lg" />
      </View>
    </StoryPage>
  );

  const pages = useMemo(
    () => [
      { key: 'hero',          render: renderHero },
      { key: 'by-area',       render: renderByArea },
      { key: 'measurements',  render: renderMeasurements },
      { key: 'findings',      render: renderFindings },
      { key: 'interventions', render: renderInterventions },
    ],
    // Re-create when bone or geometry change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bone, previousBone, stableInsets, screenH, screenW],
  );

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => item.render() as React.ReactElement}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={screenH}
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={getItemLayout}
      />
      <ProgressDots count={pages.length} active={activePage} />
      <View style={styles.disclaimerBar} pointerEvents="none">
        <Text style={styles.disclaimerText}>
          For informational purposes only. Not medical advice.
        </Text>
      </View>
      {/* One-shot 2-card explainer; only shows on first ever open. */}
      <HarmonyIntroOverlay />
    </View>
  );
}

function severityStyle(severity: 'mild' | 'moderate' | 'marked') {
  if (severity === 'mild') return { backgroundColor: Colors.success + '22' };
  if (severity === 'moderate') return { backgroundColor: Colors.warning + '22' };
  return { backgroundColor: Colors.error + '22' };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Glow.palette.bg },

  // Disclaimer bar — always visible across all pages, like scan/results.tsx
  disclaimerBar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 8,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  disclaimerText: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    opacity: 0.85,
  },

  // Hero
  heroMeshWrap: { alignItems: 'center', marginBottom: Spacing.md },
  swipeHint: {
    position: 'absolute',
    bottom: Spacing.xl,
    alignSelf: 'center',
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  swipeText: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Shared page header pieces
  pageEyebrow: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  pageTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    marginBottom: Spacing.sm,
  },
  pageSubtitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },

  // By area
  radialWrap: { alignItems: 'center', gap: Spacing.sm },
  radialLegend: { flexDirection: 'row', gap: Spacing.md },
  radialLegendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  radialLegendSwatch: { width: 14, height: 2, borderRadius: 1 },
  radialLegendSwatchSolid: { backgroundColor: Colors.harmony },
  radialLegendSwatchDashed: {
    borderTopWidth: 1.2,
    borderTopColor: Colors.textMuted,
    borderStyle: 'dashed',
    width: 18, height: 0,
  },
  radialLegendText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },

  // Measurements
  measurementScroll: { flexGrow: 0 },
  measurementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  metricCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.xxs,
  },
  metricLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
  },
  metricValue: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  metricFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  miniBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    backgroundColor: Colors.harmony,
  },
  miniScore: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
    minWidth: 20,
    textAlign: 'right',
  },

  // Findings
  findingScroll: { flexGrow: 0 },
  findingList: { gap: Spacing.sm, paddingBottom: Spacing.md },
  findingCard: {
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  findingHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  findingTitle: {
    flex: 1,
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  findingBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  findingBadgeText: {
    color: Colors.text,
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  findingDesc: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 19,
  },
  findingsEmpty: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
    paddingHorizontal: Spacing.sm,
  },

  // Interventions
  interventionWrap: { marginBottom: Spacing.lg },
  doneRow: { paddingHorizontal: Spacing.lg },

  // Empty state
  emptyContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyMeshWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    position: 'relative',
  },
  emptyMeshGlow: {
    position: 'absolute',
    width: 260, height: 260,
    borderRadius: 130,
    backgroundColor: Colors.harmony + '14',
  },
  emptyCopyWrap: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  emptyTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    textAlign: 'center',
  },
  emptyCopy: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: Spacing.sm,
  },
  emptyActions: {
    width: '100%',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
});
