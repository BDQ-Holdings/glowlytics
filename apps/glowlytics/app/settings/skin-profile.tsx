import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FontFamily, Glow, Spacing } from '../../src/constants/theme';
import {
  Chip,
  Intro,
  IntroAccent,
  PrimaryButton,
  SectionLabel,
  SettingsHeader,
  SettingsPage,
} from '../../src/components/settings/SettingsPrimitives';
import { useStore } from '../../src/store/useStore';
import type { PrimaryGoal, ScanRegion } from '../../src/types';

const P = Glow.palette;


// Mirrors onboarding/skin-goal.tsx: each goal carries the default scan region
// the protocol needs, so saving here really re-targets the analysis.
const GOAL_OPTIONS: Array<{ value: PrimaryGoal; label: string; body: string; defaultRegion: ScanRegion }> = [
  {
    value: 'acne',
    label: 'Acne & breakouts',
    body: 'Track inflammation, active breakouts, and clarity.',
    defaultRegion: 'whole_face',
  },
  {
    value: 'sun_damage',
    label: 'Sun damage & pigmentation',
    body: 'Follow UV-related changes and visible pigmentation.',
    defaultRegion: 'forehead',
  },
  {
    value: 'skin_age',
    label: 'Aging & texture',
    body: 'Monitor fine lines, elasticity, and texture shifts.',
    defaultRegion: 'crows_feet',
  },
];

export default function SkinProfileScreen() {
  const router = useRouter();
  const userGoals = useStore((s) => s.user?.skin_goals);
  const protocolGoal = useStore((s) => s.protocol?.primary_goal);
  const updateUser = useStore((s) => s.updateUser);
  const setProtocol = useStore((s) => s.setProtocol);
  // Single-select, matching onboarding: the protocol drives analysis and can
  // only target one goal, so offering multi-select here would be dishonest.
  const [selectedGoal, setSelectedGoal] = useState<PrimaryGoal>(
    () => protocolGoal ?? userGoals?.[0] ?? 'acne',
  );

  const handleSave = () => {
    const option = GOAL_OPTIONS.find((g) => g.value === selectedGoal);
    if (!option) return;
    updateUser({ skin_goals: [selectedGoal] });
    // The protocol is what scans/results/routine scoring actually read —
    // without this, "your scan focus has been updated" would be untrue.
    setProtocol(option.value, option.defaultRegion);
    Alert.alert('Skin profile saved', 'Your scan focus has been updated.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <SettingsPage>
      <SettingsHeader title="Skin profile" />

      <Intro>
        Your scan focus drives what every scan measures and how your routine is
        scored. <IntroAccent>Pick one main focus — you can change it anytime.</IntroAccent>
      </Intro>

      <SectionLabel>Scan focus</SectionLabel>
      <View style={styles.goalList}>
        {GOAL_OPTIONS.map((goal) => (
          <Chip
            key={goal.value}
            active={selectedGoal === goal.value}
            onPress={() => setSelectedGoal(goal.value)}
          >
            {goal.label}
          </Chip>
        ))}
      </View>

      <View style={styles.goalCard}>
        {GOAL_OPTIONS.filter((goal) => goal.value === selectedGoal).map((goal) => (
          <View key={goal.value} style={styles.goalRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.concernLabel}>{goal.label}</Text>
              <Text style={styles.concernBody}>{goal.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Save changes" onPress={handleSave} />
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  goalList: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  goalCard: {
    marginHorizontal: 16,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    borderRadius: 18,
    padding: 6,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  goalDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: P.glow,
  },
  rankBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: P.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: {
    fontFamily: FontFamily.sansBold,
    fontSize: 11,
    color: P.ink,
  },
  concernLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 14,
    color: P.ink,
  },
  concernBody: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    marginTop: 1,
  },
  footer: {
    padding: Spacing.lg,
  },
});
