import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { GlowIcon } from '../../src/components/glow/GlowIcons';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { buildOnboardingFlow } from '../../src/services/onboardingFlow';
import { Glow, FontFamily } from '../../src/constants/theme';
import type { BiologicalSex } from '../../src/types';

const SEX_OPTIONS: { label: string; value: BiologicalSex }[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Intersex / Other', value: 'other' },
];

export default function Sex() {
  const P = Glow.palette;
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const setOnboardingFlow = useStore((s) => s.setOnboardingFlow);
  const updateUser = useStore((s) => s.updateUser);
  const user = useStore((s) => s.user);

  const [selected, setSelected] = useState<BiologicalSex | null>(
    () => useStore.getState().user?.sex ?? null,
  );

  const advanceWithSex = (sex: BiologicalSex) => {
    const periodApplicable = sex === 'female' ? 'yes' : 'no';
    updateUser({ sex, period_applicable: periodApplicable });

    const newFlow = buildOnboardingFlow(
      sex,
      user?.menstrual_status,
      user?.health_connection?.cycle_detected,
    );
    setOnboardingFlow(newFlow);
    advance();
  };

  const handleContinue = () => {
    if (!selected) return;
    advanceWithSex(selected);
  };

  const handlePreferNot = () => {
    updateUser({ sex: 'prefer_not', period_applicable: 'prefer_not' });
    setOnboardingFlow(
      buildOnboardingFlow(
        'prefer_not',
        user?.menstrual_status,
        user?.health_connection?.cycle_detected,
      ),
    );
    advance();
  };

  return (
    <OnboardingTransition
      heading={"What's your\nbiological sex?"}
      subtext="Hormones play a huge role in how your skin behaves. This helps us read your scores more accurately."
      primaryLabel="Continue"
      primaryOnPress={handleContinue}
      primaryDisabled={!selected}
      secondaryLabel="Prefer not to say"
      secondaryOnPress={handlePreferNot}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.chips}>
        {SEX_OPTIONS.map((opt) => {
          const on = selected === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? P.ink : P.surface,
                  borderColor: on ? P.ink : P.glow,
                },
              ]}
              onPress={() => setSelected(opt.value)}
              activeOpacity={0.86}
              hitSlop={{ top: 4, bottom: 4 }}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: on }}
            >
              {on && <GlowIcon name="check" size={13} stroke={2.2} color={P.surface} />}
              <Text style={[styles.chipLabel, { color: on ? P.surface : P.ink }]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.privacy, { color: P.muted }]}>
        This stays private and is only used for skin analysis context.
      </Text>
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
  privacy: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 16,
  },
});
