/**
 * Bone-structure results — story-format presentation of the captured 3D mesh,
 * Harmony composite score, per-metric breakdown, and tiered interventions.
 */
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Button } from '../../src/components/Button';
import { DomainRadialChart } from '../../src/components/DomainRadialChart';
import { Face3DViewer } from '../../src/components/Face3DViewer';
import { HarmonyScoreReveal } from '../../src/components/HarmonyScoreReveal';
import { InterventionDrawer } from '../../src/components/InterventionDrawer';
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
  const { width: screenW } = useWindowDimensions();
  const { dailyId } = useLocalSearchParams<{ dailyId?: string }>();

  const modelOutputs = useStore((s) => s.modelOutputs);

  const output = useMemo(() => {
    if (!dailyId) return modelOutputs[modelOutputs.length - 1] || null;
    return modelOutputs.find((o) => o.daily_id === dailyId) || modelOutputs[modelOutputs.length - 1] || null;
  }, [modelOutputs, dailyId]);

  const bone = output?.bone_structure;

  if (!bone) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + Spacing.xxl }]}>
        <Text style={styles.emptyTitle}>No facial architecture data yet</Text>
        <Text style={styles.emptyCopy}>Run a bone-structure capture to see your breakdown.</Text>
        <Button title="Back" onPress={() => router.back()} />
      </View>
    );
  }

  const meshVerts = bone.downsampled_mesh?.vertices || buildCanonicalMesh();
  const meshSource = bone.downsampled_mesh?.source || 'mediapipe';
  const viewerSize = Math.min(360, screenW - Spacing.lg * 2);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[Glow.palette.bg, Glow.palette.surface, Glow.palette.glow]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — 3D mesh + Harmony reveal */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.hero}>
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
          caption={bone.dominant_driver ? `Strongest opportunity: ${bone.dominant_driver}` : undefined}
        />

        {/* Domain breakdown — radial petal chart. A regular hexagon means
            balanced; a lopsided shape immediately reads which domain is
            dragging.  Score dots colour-coded per domain. */}
        <Animated.View entering={FadeInDown.duration(450).delay(200)} style={styles.section}>
          <Text style={styles.sectionTitle}>By area</Text>
          <View style={styles.radialWrap}>
            <DomainRadialChart
              scores={bone.domain_scores || {}}
              size={Math.min(280, screenW - Spacing.lg * 2)}
            />
          </View>
        </Animated.View>

        {/* Per-metric values */}
        <Animated.View entering={FadeInDown.duration(450).delay(350)} style={styles.section}>
          <Text style={styles.sectionTitle}>Measurements</Text>
          <View style={styles.metricGrid}>
            {BONE_METRICS.map((m) => {
              const value = bone.metrics?.[m.key]?.value;
              const score = bone.scored_metrics?.[m.key];
              if (!Number.isFinite(value)) return null;
              return (
                <View key={m.key} style={styles.metricCard}>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                  <Text style={styles.metricValue}>
                    {formatMetricValue(m.key as BoneMetricKey, value as number)}
                  </Text>
                  {Number.isFinite(score) && (
                    <View style={styles.metricFooter}>
                      <View style={styles.miniBar}>
                        <View style={[styles.miniBarFill, { width: `${Math.max(0, Math.min(100, score as number))}%` }]} />
                      </View>
                      <Text style={styles.miniScore}>{score}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </Animated.View>

        {/* Findings list */}
        {bone.findings && bone.findings.length > 0 && (
          <Animated.View entering={FadeInDown.duration(450).delay(500)} style={styles.section}>
            <Text style={styles.sectionTitle}>What stood out</Text>
            <View style={styles.findingList}>
              {bone.findings.slice(0, 6).map((f) => {
                const copy = FINDING_COPY[f.findingCode];
                if (!copy) return null;
                return (
                  <Pressable
                    key={f.findingCode}
                    style={styles.findingCard}
                    onPress={() => router.push({
                      pathname: '/architecture/[finding]',
                      params: { finding: f.findingCode, dailyId: output?.daily_id || '' },
                    })}
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
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* Interventions */}
        <Animated.View entering={FadeInDown.duration(450).delay(650)} style={styles.section}>
          <Text style={styles.sectionTitle}>What you can do</Text>
          <InterventionDrawer bundle={bone.interventions} />
        </Animated.View>

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            For informational purposes only. Not medical advice. Consult a board-certified dermatologist or plastic surgeon before pursuing any procedural option.
          </Text>
        </View>

        <Button title="Done" onPress={() => router.replace('/(tabs)/today')} size="lg" />
      </ScrollView>
    </View>
  );
}

function severityStyle(severity: 'mild' | 'moderate' | 'marked') {
  if (severity === 'mild') return { backgroundColor: Colors.success + '22' };
  if (severity === 'moderate') return { backgroundColor: Colors.warning + '22' };
  return { backgroundColor: Colors.error + '22' };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  hero: { alignItems: 'center', justifyContent: 'center' },
  section: { gap: Spacing.sm },
  radialWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
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
  findingList: { gap: Spacing.sm },
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
  disclaimer: {
    paddingHorizontal: Spacing.sm,
  },
  disclaimerText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    lineHeight: 16,
    textAlign: 'center',
  },
  emptyTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    textAlign: 'center',
  },
  emptyCopy: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    marginVertical: Spacing.md,
  },
});
