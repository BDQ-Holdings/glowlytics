import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, RadialGradient, Stop, Circle, Path } from 'react-native-svg';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { OnboardingOptionCard } from '../../src/components/OnboardingOptionCard';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { buildOnboardingFlow, screenToRoute } from '../../src/services/onboardingFlow';
import { Spacing } from '../../src/constants/theme';
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

function MenstrualIllustration() {
  return (
    <Svg width={180} height={160} viewBox="0 0 180 160">
      <Defs>
        <RadialGradient id="amberCenter" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#C07B2A" stopOpacity={0.45} />
          <Stop offset="60%" stopColor="#C07B2A" stopOpacity={0.1} />
          <Stop offset="100%" stopColor="#C07B2A" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="tealRim" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#3A9E8F" stopOpacity={0.3} />
          <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* Outer teal halo */}
      <Circle cx={90} cy={80} r={65} fill="url(#tealRim)" />
      {/* Wave circles */}
      <Circle cx={90} cy={80} r={55} fill="none" stroke="#3A9E8F" strokeWidth={0.7} strokeOpacity={0.12} />
      <Circle cx={90} cy={80} r={45} fill="none" stroke="#C07B2A" strokeWidth={0.8} strokeOpacity={0.18} />
      <Circle cx={90} cy={80} r={35} fill="none" stroke="#3A9E8F" strokeWidth={0.9} strokeOpacity={0.2} />
      <Circle cx={90} cy={80} r={25} fill="none" stroke="#C07B2A" strokeWidth={1} strokeOpacity={0.25} />
      {/* Amber center glow */}
      <Circle cx={90} cy={80} r={22} fill="url(#amberCenter)" />
      {/* Sinusoidal wave overlay */}
      <Path
        d="M25 80 Q45 60 65 80 Q85 100 105 80 Q125 60 145 80 Q165 100 175 80"
        fill="none"
        stroke="#C07B2A"
        strokeWidth={1.5}
        strokeOpacity={0.3}
        strokeLinecap="round"
      />
      <Path
        d="M15 85 Q35 65 55 85 Q75 105 95 85 Q115 65 135 85 Q155 105 175 85"
        fill="none"
        stroke="#3A9E8F"
        strokeWidth={1}
        strokeOpacity={0.18}
        strokeLinecap="round"
      />
      {/* Center dot */}
      <Circle cx={90} cy={80} r={5} fill="#C07B2A" fillOpacity={0.55} />
      <Circle cx={90} cy={80} r={2} fill="#C07B2A" fillOpacity={0.8} />
      {/* Phase dots around the circle */}
      <Circle cx={90} cy={25} r={3} fill="#C07B2A" fillOpacity={0.3} />
      <Circle cx={145} cy={80} r={3} fill="#3A9E8F" fillOpacity={0.25} />
      <Circle cx={90} cy={135} r={3} fill="#C07B2A" fillOpacity={0.3} />
      <Circle cx={35} cy={80} r={3} fill="#3A9E8F" fillOpacity={0.25} />
    </Svg>
  );
}

export default function Menstrual() {
  const router = useRouter();
  const { goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const setOnboardingFlowIndex = useStore((s) => s.setOnboardingFlowIndex);
  const setOnboardingFlow = useStore((s) => s.setOnboardingFlow);
  const updateUser = useStore((s) => s.updateUser);
  const user = useStore((s) => s.user);

  const [selected, setSelected] = useState<MenstrualStatus | null>(null);

  const handleContinue = () => {
    if (!selected) return;

    const periodApplicable = (selected === 'regular' || selected === 'irregular') ? 'yes' : 'no';
    updateUser({
      menstrual_status: selected,
      period_applicable: periodApplicable,
    });

    // Rebuild flow to include or exclude cycle-details
    const sex = user?.sex;
    const newFlow = buildOnboardingFlow(sex, selected);
    setOnboardingFlow(newFlow);

    // Find current position in the new flow and advance
    const currentScreenIndex = newFlow.indexOf('menstrual');
    const nextIndex = currentScreenIndex + 1;
    setOnboardingFlowIndex(nextIndex);
    router.replace(screenToRoute(newFlow[nextIndex]) as any);
  };

  return (
    <OnboardingTransition
      illustration={<MenstrualIllustration />}
      heading="Do you have a menstrual cycle?"
      subtext="Hormonal shifts show up in your skin throughout the month. This helps us explain patterns — we're not tracking your period."
      primaryLabel="Continue"
      primaryOnPress={handleContinue}
      primaryDisabled={!selected}
      secondaryLabel="Skip"
      secondaryOnPress={() => {
        const newFlow = buildOnboardingFlow(user?.sex, 'prefer_not');
        setOnboardingFlow(newFlow);
        const currentScreenIndex = newFlow.indexOf('menstrual');
        const nextIndex = currentScreenIndex + 1;
        setOnboardingFlowIndex(nextIndex);
        router.replace(screenToRoute(newFlow[nextIndex]) as any);
      }}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.options}>
        {MENSTRUAL_OPTIONS.map((opt) => (
          <OnboardingOptionCard
            key={opt.value}
            label={opt.label}
            selected={selected === opt.value}
            onPress={() => setSelected(opt.value)}
          />
        ))}
      </View>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: Spacing.sm + 4,
  },
});
