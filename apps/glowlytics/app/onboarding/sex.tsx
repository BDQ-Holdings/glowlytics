import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse, Path } from 'react-native-svg';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { OnboardingOptionCard } from '../../src/components/OnboardingOptionCard';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { buildOnboardingFlow, screenToRoute } from '../../src/services/onboardingFlow';
import { Colors, FontFamily, FontSize, Spacing } from '../../src/constants/theme';
import type { BiologicalSex } from '../../src/types';

const SEX_OPTIONS: { label: string; value: BiologicalSex }[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Intersex / Other', value: 'other' },
];

function SexIllustration() {
  return (
    <Svg width={220} height={180} viewBox="0 0 220 180">
      <Defs>
        {/* Rose-coral center */}
        <RadialGradient id="sexRose" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#E87B9A" stopOpacity={0.75} />
          <Stop offset="45%" stopColor="#C97BB2" stopOpacity={0.25} />
          <Stop offset="100%" stopColor="#C97BB2" stopOpacity={0} />
        </RadialGradient>
        {/* Warm coral accent */}
        <RadialGradient id="sexCoral" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#F5A87B" stopOpacity={0.6} />
          <Stop offset="55%" stopColor="#E8933A" stopOpacity={0.15} />
          <Stop offset="100%" stopColor="#E8933A" stopOpacity={0} />
        </RadialGradient>
        {/* Purple accent */}
        <RadialGradient id="sexPurple" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#B68AFF" stopOpacity={0.6} />
          <Stop offset="55%" stopColor="#8B5CF6" stopOpacity={0.15} />
          <Stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
        </RadialGradient>
        {/* Teal accent */}
        <RadialGradient id="sexTeal" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#3A9E8F" stopOpacity={0.45} />
          <Stop offset="55%" stopColor="#3A9E8F" stopOpacity={0.1} />
          <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
        </RadialGradient>
        {/* Core glow */}
        <RadialGradient id="sexCore" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.6} />
          <Stop offset="25%" stopColor="#E87B9A" stopOpacity={0.4} />
          <Stop offset="100%" stopColor="#C97BB2" stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {/* Color field orbs */}
      <Circle cx={75} cy={58} r={45} fill="url(#sexCoral)" />
      <Circle cx={155} cy={55} r={40} fill="url(#sexPurple)" />
      <Circle cx={65} cy={135} r={38} fill="url(#sexTeal)" />

      {/* Central rose field */}
      <Ellipse cx={110} cy={90} rx={55} ry={50} fill="url(#sexRose)" />

      {/* Cellular forms — organic, overlapping */}
      <Circle cx={88} cy={72} r={30} fill="none" stroke="#E87B9A" strokeWidth={1} strokeOpacity={0.3} />
      <Circle cx={132} cy={95} r={26} fill="none" stroke="#B68AFF" strokeWidth={1} strokeOpacity={0.25} />
      <Circle cx={105} cy={110} r={22} fill="none" stroke="#3A9E8F" strokeWidth={0.8} strokeOpacity={0.2} />

      {/* Interconnecting arcs */}
      <Path d="M88 72 Q110 65 132 95" fill="none" stroke="#F5A87B" strokeWidth={0.8} strokeOpacity={0.2} />
      <Path d="M132 95 Q118 105 105 110" fill="none" stroke="#B68AFF" strokeWidth={0.8} strokeOpacity={0.18} />

      {/* Nuclei — bold fills */}
      <Circle cx={88} cy={72} r={6} fill="#E87B9A" fillOpacity={0.55} />
      <Circle cx={132} cy={95} r={5} fill="#B68AFF" fillOpacity={0.45} />
      <Circle cx={105} cy={110} r={4.5} fill="#3A9E8F" fillOpacity={0.4} />

      {/* Core convergence */}
      <Circle cx={110} cy={88} r={10} fill="url(#sexCore)" />

      {/* Accent particles */}
      <Circle cx={45} cy={38} r={2.5} fill="#F5A87B" fillOpacity={0.5} />
      <Circle cx={180} cy={42} r={2} fill="#B68AFF" fillOpacity={0.45} />
      <Circle cx={42} cy={148} r={2} fill="#3A9E8F" fillOpacity={0.35} />
      <Circle cx={178} cy={145} r={2.5} fill="#E87B9A" fillOpacity={0.4} />
    </Svg>
  );
}

export default function Sex() {
  const router = useRouter();
  const { goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const setOnboardingFlowIndex = useStore((s) => s.setOnboardingFlowIndex);
  const setOnboardingFlow = useStore((s) => s.setOnboardingFlow);
  const updateUser = useStore((s) => s.updateUser);

  const [selected, setSelected] = useState<BiologicalSex | null>(null);

  const advanceWithSex = (sex: BiologicalSex) => {
    const periodApplicable = sex === 'female' ? 'yes' : 'no';
    updateUser({ sex, period_applicable: periodApplicable });

    // Rebuild the flow with the selected sex to conditionally include menstrual screens
    const newFlow = buildOnboardingFlow(sex);
    setOnboardingFlow(newFlow);

    // Find our current position in the new flow
    const currentScreenIndex = newFlow.indexOf('sex');
    const nextIndex = currentScreenIndex + 1;
    setOnboardingFlowIndex(nextIndex);
    // Use replace to prevent stale screens in the navigation stack after flow rebuild
    router.replace(screenToRoute(newFlow[nextIndex]) as any);
  };

  const handleContinue = () => {
    if (!selected) return;
    advanceWithSex(selected);
  };

  const handlePreferNot = () => {
    updateUser({ sex: 'prefer_not', period_applicable: 'prefer_not' });
    const newFlow = buildOnboardingFlow('prefer_not');
    setOnboardingFlow(newFlow);
    const currentScreenIndex = newFlow.indexOf('sex');
    const nextIndex = currentScreenIndex + 1;
    setOnboardingFlowIndex(nextIndex);
    router.replace(screenToRoute(newFlow[nextIndex]) as any);
  };

  return (
    <OnboardingTransition
      illustration={<SexIllustration />}
      heading="What's your biological sex?"
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
      <View style={styles.options}>
        {SEX_OPTIONS.map((opt) => (
          <OnboardingOptionCard
            key={opt.value}
            label={opt.label}
            selected={selected === opt.value}
            onPress={() => setSelected(opt.value)}
          />
        ))}
      </View>
      <Text style={styles.privacy}>
        This stays private and is only used for skin analysis context.
      </Text>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  options: {
    gap: Spacing.sm + 4,
  },
  privacy: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 18,
  },
});
