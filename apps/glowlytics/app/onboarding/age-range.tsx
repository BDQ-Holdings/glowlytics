import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { GlowIcon } from '../../src/components/glow/GlowIcons';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Glow, FontFamily } from '../../src/constants/theme';

const AGE_OPTIONS = [
  'Under 18',
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55+',
] as const;
type AgeRangeOption = typeof AGE_OPTIONS[number];

export default function AgeRange() {
  const P = Glow.palette;
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const updateUser = useStore((s) => s.updateUser);

  const [selected, setSelected] = useState<AgeRangeOption | null>(() => {
    const ageRange = useStore.getState().user?.age_range;
    return AGE_OPTIONS.includes(ageRange as AgeRangeOption) ? (ageRange as AgeRangeOption) : null;
  });

  const handleContinue = () => {
    if (!selected) return;
    updateUser({ age_range: selected });
    advance();
  };

  const handleSkip = () => {
    advance();
  };

  return (
    <OnboardingTransition
      heading={"What's your\nage range?"}
      subtext="Your skin changes a lot decade to decade. This helps us set the right baseline."
      primaryLabel="Continue"
      primaryOnPress={handleContinue}
      primaryDisabled={!selected}
      onSkip={handleSkip}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.chips}>
        {AGE_OPTIONS.map((age) => {
          const on = selected === age;
          return (
            <TouchableOpacity
              key={age}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? P.ink : P.surface,
                  borderColor: on ? P.ink : P.glow,
                },
              ]}
              onPress={() => setSelected(age)}
              activeOpacity={0.86}
              hitSlop={{ top: 4, bottom: 4 }}
              accessibilityRole="button"
              accessibilityLabel={age}
              accessibilityState={{ selected: on }}
            >
              {on && <GlowIcon name="check" size={13} stroke={2.2} color={P.surface} />}
              <Text style={[styles.chipLabel, { color: on ? P.surface : P.ink }]}>{age}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 999,
  },
  chipLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 14,
  },
});
