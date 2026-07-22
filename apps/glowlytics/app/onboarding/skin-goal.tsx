import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { GlowIcon, type GlowIconName } from '../../src/components/glow/GlowIcons';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Glow, FontFamily } from '../../src/constants/theme';
import type { PrimaryGoal, ScanRegion } from '../../src/types';

interface GoalOption {
  /** Full name — accessibility + semantic identity (unchanged). */
  label: string;
  /** Short serif word shown on the card face. */
  word: string;
  description: string;
  icon: GlowIconName;
  value: PrimaryGoal;
  defaultRegion: ScanRegion;
}

const GOAL_OPTIONS: GoalOption[] = [
  {
    label: 'Acne & Breakouts',
    word: 'Breakouts',
    description: 'Track inflammation, active breakouts, and day-to-day clarity',
    icon: 'drop',
    value: 'acne',
    defaultRegion: 'whole_face',
  },
  {
    label: 'Sun Damage & Pigmentation',
    word: 'Sun spots',
    description: 'Monitor UV-related changes and visible pigmentation over time',
    icon: 'sun',
    value: 'sun_damage',
    defaultRegion: 'forehead',
  },
  {
    label: 'Aging & Texture',
    word: 'Fine lines',
    description: 'Follow fine lines, elasticity, and skin vitality trends',
    icon: 'sparkle',
    value: 'skin_age',
    defaultRegion: 'crows_feet',
  },
];

export default function SkinGoal() {
  const P = Glow.palette;
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const setProtocol = useStore((s) => s.setProtocol);
  const updateUser = useStore((s) => s.updateUser);

  const [selected, setSelected] = useState<PrimaryGoal | null>(
    () => useStore.getState().user?.skin_goals?.[0] ?? null,
  );

  const handleContinue = () => {
    if (!selected) return;
    const option = GOAL_OPTIONS.find((o) => o.value === selected);
    if (!option) return;
    updateUser({ skin_goals: [selected] });
    setProtocol(option.value, option.defaultRegion);
    advance();
  };

  return (
    <OnboardingTransition
      eyebrow="your focus"
      heading={'What should we\nwatch closely?'}
      subtext="We'll tailor your scans and insights around the signal you care about most."
      primaryLabel="Continue"
      primaryOnPress={handleContinue}
      primaryDisabled={!selected}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.grid}>
        {GOAL_OPTIONS.map((opt) => {
          const on = selected === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.card,
                {
                  backgroundColor: on ? P.accent : P.surface,
                  borderColor: on ? P.accent : P.glow,
                },
              ]}
              onPress={() => setSelected(opt.value)}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: on }}
            >
              <GlowIcon name={opt.icon} size={22} stroke={1.5} color={on ? P.surface : P.accent} />
              <View style={styles.cardBody}>
                <Text style={[styles.word, { color: on ? P.surface : P.ink }]}>{opt.word}</Text>
                <Text style={[styles.desc, { color: on ? P.surface + 'CC' : P.muted }]}>
                  {opt.description}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  card: {
    width: '48%',
    minHeight: 100,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 18,
    justifyContent: 'space-between',
  },
  cardBody: {
    marginTop: 14,
  },
  word: {
    fontFamily: FontFamily.serifItalic,
    fontSize: 24,
    lineHeight: 27,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  desc: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    lineHeight: 16,
  },
});
