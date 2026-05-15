/**
 * HarmonyFocusCard — "Today's focus" surface on the Today screen.
 *
 * Bone-structure analysis stops being abstract when it produces a single
 * thing to do today. This card picks the most-severe finding from the
 * user's latest bone-structure scan, surfaces its top lifestyle
 * intervention, and links into the finding detail screen for the full
 * three-tier ladder.
 *
 * Returns null when:
 *   - No scan with bone data exists, OR
 *   - The latest bone result has zero findings (composed Harmony was clean), OR
 *   - The top finding has no lifestyle suggestions (intentionally rare —
 *     the interventions table is built to always offer at least one
 *     lifestyle item per finding code, but we guard anyway).
 *
 * Sits above HarmonyTrendCard on Today so the daily loop reads as:
 *   trend (where you've been) → focus (what to do today).
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { FINDING_COPY, HARMONY_ACCENT } from '../constants/boneStructure';
import { BorderRadius, Colors, FontFamily, FontSize, Glow, Spacing } from '../constants/theme';
import type { ModelOutput } from '../types';

interface FocusData {
  dailyId: string;
  findingCode: ModelOutput['bone_structure'] extends { findings: infer F } ? F : never;
  findingTitle: string;
  findingDesc: string;
  actionTitle: string;
  actionBody: string;
}

export const HarmonyFocusCard: React.FC = () => {
  const router = useRouter();

  const focus = useStore<FocusData | null>((s) => {
    // Walk from latest scan backwards — surface the first scan that has
    // bone-structure data AND at least one finding with a lifestyle
    // intervention. Most recent scans win.
    for (let i = s.modelOutputs.length - 1; i >= 0; i--) {
      const out = s.modelOutputs[i];
      const bone = out.bone_structure;
      if (!bone || !bone.findings || bone.findings.length === 0) continue;
      const topFinding = bone.findings[0]; // already sorted most-severe-first
      const copy = FINDING_COPY[topFinding.findingCode];
      if (!copy) continue;
      const lifestyleAction = bone.interventions?.lifestyle?.[0];
      if (!lifestyleAction) continue;
      return {
        dailyId: out.daily_id,
        findingCode: topFinding.findingCode as never,
        findingTitle: copy.title,
        findingDesc: copy.description,
        actionTitle: lifestyleAction.title,
        actionBody: lifestyleAction.body,
      };
    }
    return null;
  });

  // Truncate the body for the card surface — full text is on the detail page.
  const trimmedBody = useMemo(() => {
    if (!focus) return '';
    const max = 130;
    if (focus.actionBody.length <= max) return focus.actionBody;
    const cut = focus.actionBody.slice(0, max).split(' ').slice(0, -1).join(' ');
    return cut + '…';
  }, [focus]);

  if (!focus) return null;

  return (
    <Pressable
      style={styles.card}
      onPress={() =>
        router.push({
          pathname: '/architecture/[finding]',
          params: { finding: focus.findingCode as unknown as string, dailyId: focus.dailyId },
        })
      }
      accessibilityLabel={`Today's focus: ${focus.findingTitle}. Try ${focus.actionTitle}. Tap for more.`}
    >
      <View style={styles.headerRow}>
        <View style={styles.iconBubble}>
          <Feather name="compass" size={13} color={HARMONY_ACCENT} />
        </View>
        <Text style={styles.eyebrow}>Today's focus</Text>
        <Feather name="chevron-right" size={14} color={Colors.textMuted} style={styles.chevron} />
      </View>

      <Text style={styles.findingTitle}>{focus.findingTitle}</Text>

      <View style={styles.actionWrap}>
        <View style={styles.actionLine}>
          <Feather name="sun" size={11} color={Colors.success} />
          <Text style={styles.actionLabel}>Lifestyle ·</Text>
          <Text style={styles.actionTitle}>{focus.actionTitle}</Text>
        </View>
        <Text style={styles.actionBody}>{trimmedBody}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
    backgroundColor: Glow.palette.surface,
    borderWidth: 1,
    borderColor: HARMONY_ACCENT + '2C',
    gap: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconBubble: {
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: HARMONY_ACCENT + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  eyebrow: {
    flex: 1,
    color: Colors.textMuted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  chevron: {
    marginLeft: 'auto',
  },
  findingTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    marginTop: 2,
  },
  actionWrap: {
    marginTop: Spacing.xs,
    gap: Spacing.xxs,
  },
  actionLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xxs,
  },
  actionLabel: {
    color: Colors.success,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  actionTitle: {
    flex: 1,
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  actionBody: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 19,
  },
});
