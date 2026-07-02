/**
 * Finding detail — drill-in for a single BoneFinding. Renders the 3D mesh
 * with the affected metric highlighted, plus interventions filtered to that
 * specific finding code (using the same lookup map the backend uses).
 */
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { Face3DViewer } from '../../src/components/Face3DViewer';
import { InterventionDrawer } from '../../src/components/InterventionDrawer';
import {
  BONE_METRICS,
  FINDING_COPY,
  formatMetricValue,
  HARMONY_ACCENT,
  METRIC_BY_KEY,
  interpretMetricScore,
  type BoneMetricKey,
} from '../../src/constants/boneStructure';
import { buildCanonicalMesh } from '../../src/services/canonicalFaceMesh';
import { useStore } from '../../src/store/useStore';
import { BorderRadius, Colors, FontFamily, FontSize, Glow, Spacing } from '../../src/constants/theme';
import type {
  BoneFinding,
  BoneFindingCode,
  BoneIntervention,
  BoneInterventionTier,
  InterventionBundle,
} from '../../src/types';

export default function FindingDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const { finding: findingCode, dailyId } = useLocalSearchParams<{ finding: BoneFindingCode; dailyId?: string }>();

  const modelOutputs = useStore((s) => s.modelOutputs);

  const { output, finding, metricMeta } = useMemo(() => {
    const out = dailyId
      ? modelOutputs.find((o) => o.daily_id === dailyId)
      : modelOutputs[modelOutputs.length - 1];
    const f = out?.bone_structure?.findings.find((x) => x.findingCode === findingCode) || null;
    const meta = f ? METRIC_BY_KEY[f.metric as BoneMetricKey] : null;
    return { output: out || null, finding: f, metricMeta: meta };
  }, [modelOutputs, dailyId, findingCode]);

  const bone = output?.bone_structure;

  if (!bone || !finding) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + Spacing.xxl }]}>
        <Text style={styles.emptyTitle}>Finding not available</Text>
        <Pressable onPress={() => router.back()} style={styles.backChip}>
          <Feather name="arrow-left" size={14} color={Colors.text} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const copy = FINDING_COPY[finding.findingCode];
  const meshVerts = bone.downsampled_mesh?.vertices || buildCanonicalMesh();
  const meshSource = bone.downsampled_mesh?.source || 'mediapipe';
  const filteredBundle = filterInterventionsTo(bone.interventions, finding);
  const viewerSize = Math.min(320, screenW - Spacing.lg * 2);
  const value = bone.metrics?.[finding.metric]?.value;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[Glow.palette.bg, Glow.palette.surface, Glow.palette.glow]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} style={styles.backChip}>
          <Feather name="arrow-left" size={14} color={Colors.text} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.title}>{copy?.title || finding.metric}</Text>
        <Text style={styles.description}>{copy?.description || ''}</Text>

        <View style={styles.viewerWrap}>
          <Face3DViewer
            vertices={meshVerts}
            source={meshSource}
            mode="measurements"
            size={viewerSize}
            bone={{ ...bone, findings: [finding] }}
          />
        </View>

        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Your value</Text>
            <Text style={styles.statValue}>
              {Number.isFinite(value) ? formatMetricValue(finding.metric as BoneMetricKey, value as number) : '—'}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Score</Text>
            <Text style={[styles.statValue, { color: HARMONY_ACCENT }]}>{finding.score}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Severity</Text>
            <Text style={[styles.statValue, styles[`severity_${finding.severity}` as 'severity_mild' | 'severity_moderate' | 'severity_marked']]}>
              {finding.severity}
            </Text>
          </View>
        </View>

        {Number.isFinite(finding.score) && (() => {
          const interp = interpretMetricScore(finding.metric as BoneMetricKey, finding.score);
          const ideal = interp.band === 'ideal';
          return (
            <View style={styles.interpretCard}>
              <View style={styles.interpretHead}>
                <Text style={styles.interpretLabel}>{interp.label}</Text>
                <View style={[styles.bandChip, ideal ? styles.bandChipIdeal : styles.bandChipBelow]}>
                  <Text style={[styles.bandChipText, ideal ? styles.bandChipTextIdeal : styles.bandChipTextBelow]}>{interp.bandLabel}</Text>
                </View>
              </View>
              <Text style={styles.interpretIdeal}>{interp.idealText}</Text>
              <Text style={styles.interpretMeaning}>{interp.meaning}</Text>
            </View>
          );
        })()}

        {metricMeta && (
          <Text style={styles.hint}>{metricMeta.hint}</Text>
        )}

        <Text style={styles.sectionTitle}>What you can do</Text>
        <InterventionDrawer bundle={filteredBundle} />

        <Text style={styles.disclaimer}>
          For informational purposes only. Surgical and injectable procedures carry real risk. Discuss with a board-certified plastic surgeon or dermatologist before pursuing any procedural option.
        </Text>
      </ScrollView>
    </View>
  );
}

// Suggestion ids associated with each finding code (mirror of the backend
// FINDING_TO_SUGGESTIONS map; kept here so the UI can filter without a roundtrip).
// We don't need the full text — only the ids — because the bundle that comes
// back from the server already contains the full BoneIntervention objects.
const FINDING_SUGGESTION_IDS: Partial<Record<BoneFindingCode, Record<BoneInterventionTier, string[]>>> = {
  canthal_tilt_negative:    { lifestyle: ['lymphatic_massage', 'elevated_sleep', 'sleep_quality'], pharmacological: ['topical_tretinoin', 'caffeine_topical'], interventional: ['lateral_canthopexy', 'lateral_canthoplasty'] },
  canthal_tilt_excess:      { lifestyle: ['lymphatic_massage', 'sleep_quality'], pharmacological: [], interventional: ['lateral_canthopexy'] },
  scleral_show_inferior:    { lifestyle: ['elevated_sleep', 'sleep_quality'], pharmacological: ['caffeine_topical'], interventional: ['lower_lid_retractor_release', 'spacer_graft', 'fat_transposition_lower'] },
  palpebral_fissure_narrow: { lifestyle: ['lymphatic_massage', 'elevated_sleep'], pharmacological: ['caffeine_topical', 'topical_peptides'], interventional: ['lower_lid_retractor_release'] },
  ipd_atypical:             { lifestyle: [], pharmacological: [], interventional: [] },
  gonial_angle_obtuse:      { lifestyle: ['mastic_chewing', 'weight_optimisation', 'posture_neck'], pharmacological: [], interventional: ['mandibular_angle_implant', 'jawline_filler'] },
  gonial_angle_acute:       { lifestyle: ['posture_neck'], pharmacological: [], interventional: ['masseter_botox'] },
  lower_face_wide:          { lifestyle: ['weight_optimisation', 'unilateral_chew_avoid'], pharmacological: [], interventional: ['masseter_botox'] },
  lower_face_narrow:        { lifestyle: ['mastic_chewing'], pharmacological: [], interventional: ['jawline_filler', 'mandibular_angle_implant'] },
  chin_recessed:            { lifestyle: ['posture_neck'], pharmacological: [], interventional: ['chin_filler', 'genioplasty'] },
  chin_excess:              { lifestyle: [], pharmacological: [], interventional: ['genioplasty'] },
  bitemporal_narrow:        { lifestyle: [], pharmacological: ['topical_tretinoin'], interventional: ['deep_cheek_filler'] },
  bitemporal_wide:          { lifestyle: ['weight_optimisation'], pharmacological: [], interventional: [] },
  midface_flat:             { lifestyle: ['daily_spf', 'smoking_cessation'], pharmacological: ['topical_tretinoin', 'topical_peptides'], interventional: ['malar_implant', 'deep_cheek_filler'] },
  alar_wide:                { lifestyle: [], pharmacological: [], interventional: ['rhinoplasty_consult'] },
  nasolabial_acute:         { lifestyle: [], pharmacological: [], interventional: ['rhinoplasty_consult'] },
  nasolabial_obtuse:        { lifestyle: [], pharmacological: [], interventional: ['rhinoplasty_consult'] },
  brow_low:                 { lifestyle: ['sleep_quality'], pharmacological: ['topical_peptides'], interventional: ['brow_botox', 'brow_lift'] },
  brow_high:                { lifestyle: [], pharmacological: [], interventional: [] },
  brow_apex_misplaced:      { lifestyle: [], pharmacological: ['topical_peptides'], interventional: ['brow_botox'] },
  thirds_uneven:            { lifestyle: ['posture_neck', 'sleep_side_rotation'], pharmacological: ['topical_tretinoin'], interventional: [] },
  fifths_uneven:            { lifestyle: ['posture_neck'], pharmacological: [], interventional: ['asymmetric_filler'] },
  asymmetry_elevated:       { lifestyle: ['sleep_side_rotation', 'unilateral_chew_avoid', 'posture_neck'], pharmacological: [], interventional: ['asymmetric_filler'] },
};

function filterInterventionsTo(bundle: InterventionBundle, finding: BoneFinding): InterventionBundle {
  const ids = FINDING_SUGGESTION_IDS[finding.findingCode];
  if (!ids) return bundle;
  const keep = (tier: BoneInterventionTier) => {
    const allowed = new Set(ids[tier]);
    return bundle[tier].filter((s: BoneIntervention) => allowed.has(s.id));
  };
  return {
    lifestyle: keep('lifestyle'),
    pharmacological: keep('pharmacological'),
    interventional: keep('interventional'),
    procedural_disclaimer: bundle.procedural_disclaimer,
  };
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  backChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Glow.palette.surface,
  },
  backText: {
    color: Colors.text,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
  title: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    lineHeight: 32,
  },
  description: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  viewerWrap: { alignItems: 'center', marginTop: Spacing.sm },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xxs,
  },
  statLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
  },
  statValue: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    textTransform: 'capitalize',
  },
  severity_mild: { color: Colors.success },
  severity_moderate: { color: Colors.warning },
  severity_marked: { color: Colors.error },
  hint: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
  sectionTitle: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  disclaimer: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: Spacing.sm,
  },
  emptyTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  interpretCard: {
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Glow.palette.glow,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, gap: Spacing.xxs,
    marginTop: Spacing.md,
  },
  interpretHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  interpretLabel: { flex: 1, color: Glow.palette.ink, fontFamily: FontFamily.sansSemiBold, fontSize: FontSize.md },
  interpretIdeal: { color: Glow.palette.muted, fontFamily: FontFamily.sans, fontSize: FontSize.xs },
  interpretMeaning: { color: Colors.textSecondary, fontFamily: FontFamily.sans, fontSize: FontSize.sm, lineHeight: 20 },
  bandChip: { paddingHorizontal: Spacing.xs + 2, paddingVertical: 2, borderRadius: BorderRadius.full },
  bandChipBelow: { backgroundColor: Colors.warning + '1E' },
  bandChipIdeal: { backgroundColor: Colors.success + '1E' },
  bandChipText: { fontFamily: FontFamily.sansSemiBold, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6 },
  bandChipTextBelow: { color: Colors.warning },
  bandChipTextIdeal: { color: Colors.success },
});
