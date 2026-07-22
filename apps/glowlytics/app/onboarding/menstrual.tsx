import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { GlowIcon } from '../../src/components/glow/GlowIcons';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { buildOnboardingFlow } from '../../src/services/onboardingFlow';
import { Glow, FontFamily, FontSize, Spacing, BorderRadius } from '../../src/constants/theme';
import type { MenstrualStatus } from '../../src/types';

interface MenstrualOption {
  label: string;
  value: MenstrualStatus;
}

const MENSTRUAL_OPTIONS: MenstrualOption[] = [
  { label: 'Yes, regular cycle', value: 'regular' },
  { label: 'Yes, but irregular', value: 'irregular' },
  { label: 'No', value: 'no' },
  { label: 'Prefer not to say', value: 'prefer_not' },
];

export default function Menstrual() {
  const P = Glow.palette;
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const setOnboardingFlow = useStore((s) => s.setOnboardingFlow);
  const updateUser = useStore((s) => s.updateUser);
  const user = useStore((s) => s.user);

  const [selected, setSelected] = useState<MenstrualStatus | null>(
    () => useStore.getState().user?.menstrual_status ?? null,
  );

  const handleContinue = () => {
    if (!selected) return;

    const periodApplicable = selected === 'regular' || selected === 'irregular' ? 'yes' : 'no';
    updateUser({
      menstrual_status: selected,
      period_applicable: periodApplicable,
    });

    setOnboardingFlow(
      buildOnboardingFlow(user?.sex, selected, user?.health_connection?.cycle_detected),
    );
    advance();
  };

  const handleSkip = () => {
    updateUser({
      menstrual_status: 'prefer_not',
      period_applicable: 'prefer_not',
    });
    setOnboardingFlow(
      buildOnboardingFlow(user?.sex, 'prefer_not', user?.health_connection?.cycle_detected),
    );
    advance();
  };

  return (
    <OnboardingTransition
      heading={'Do you have\na menstrual cycle?'}
      subtext="Hormonal shifts show up in your skin throughout the month. This helps us explain patterns — we're not tracking your period."
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
      <View style={styles.options}>
        {MENSTRUAL_OPTIONS.map((opt) => {
          const on = selected === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setSelected(opt.value)}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={opt.label}
              style={[
                styles.optionRow,
                { backgroundColor: on ? P.ink : P.surface, borderColor: on ? P.ink : P.glow },
              ]}
            >
              <Text style={[styles.optionLabel, { color: on ? P.surface : P.ink }]}>{opt.label}</Text>
              {on && <GlowIcon name="check" size={16} color={P.surface} stroke={2} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: Spacing.sm + Spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md + 2,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  optionLabel: {
    flex: 1,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
  },
});
