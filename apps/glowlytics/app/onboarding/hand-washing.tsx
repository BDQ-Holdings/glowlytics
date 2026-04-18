import React, { useState } from 'react';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse, Path } from 'react-native-svg';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { OnboardingOptionCard } from '../../src/components/OnboardingOptionCard';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import type { HandWashingFrequency } from '../../src/types';

const HAND_WASHING_OPTIONS: { label: string; value: HandWashingFrequency }[] = [
  { label: 'Rarely', value: 'rarely' },
  { label: 'A few times a day', value: 'few_daily' },
  { label: 'After every meal and task', value: 'after_meals' },
  { label: 'Very frequently', value: 'very_frequent' },
];

function HandWashingIllustration() {
  return (
    <Svg width={200} height={160} viewBox="0 0 200 160">
      <Defs>
        <RadialGradient id="hwGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#3A9E8F" stopOpacity={0.7} />
          <Stop offset="55%" stopColor="#3A9E8F" stopOpacity={0.15} />
          <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="hwCore" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.35} />
          <Stop offset="30%" stopColor="#3A9E8F" stopOpacity={0.6} />
          <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* Soft outer glow */}
      <Ellipse cx={100} cy={80} rx={75} ry={65} fill="url(#hwGlow)" />
      {/* Overlapping gentle forms - top left */}
      <Circle cx={80} cy={65} r={28} fill="#3A9E8F" fillOpacity={0.12} />
      <Circle cx={80} cy={65} r={28} fill="none" stroke="#3A9E8F" strokeWidth={1} strokeOpacity={0.2} />
      {/* Overlapping gentle forms - top right */}
      <Circle cx={120} cy={65} r={28} fill="#3A9E8F" fillOpacity={0.1} />
      <Circle cx={120} cy={65} r={28} fill="none" stroke="#3A9E8F" strokeWidth={1} strokeOpacity={0.18} />
      {/* Overlapping gentle forms - bottom center */}
      <Circle cx={100} cy={95} r={28} fill="#3A9E8F" fillOpacity={0.1} />
      <Circle cx={100} cy={95} r={28} fill="none" stroke="#3A9E8F" strokeWidth={1} strokeOpacity={0.16} />
      {/* Intersection highlight */}
      <Circle cx={100} cy={75} r={14} fill="url(#hwCore)" />
      {/* Center point */}
      <Circle cx={100} cy={75} r={5} fill="#3A9E8F" fillOpacity={0.8} />
      {/* Tiny accent bubbles */}
      <Circle cx={60} cy={45} r={2} fill="#3A9E8F" fillOpacity={0.35} />
      <Circle cx={145} cy={50} r={1.5} fill="#3A9E8F" fillOpacity={0.3} />
      <Circle cx={55} cy={105} r={2.5} fill="#3A9E8F" fillOpacity={0.25} />
      <Circle cx={148} cy={108} r={2} fill="#3A9E8F" fillOpacity={0.3} />
      <Circle cx={75} cy={125} r={1.5} fill="#3A9E8F" fillOpacity={0.2} />
      <Circle cx={130} cy={120} r={1.5} fill="#3A9E8F" fillOpacity={0.22} />
    </Svg>
  );
}

export default function HandWashing() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const updateUser = useStore((s) => s.updateUser);

  const [selected, setSelected] = useState<HandWashingFrequency | null>(null);

  const handleContinue = () => {
    if (!selected) return;
    updateUser({ hand_washing_frequency: selected });

    advance();
  };

  const handleSkip = () => {
    advance();
  };

  return (
    <OnboardingTransition
      illustration={<HandWashingIllustration />}
      heading="How often do you wash your hands?"
      subtext="Your hands are the number one way bacteria reaches your face. This helps us put breakout patterns in context."
      primaryLabel="Continue"
      primaryOnPress={handleContinue}
      primaryDisabled={!selected}
      secondaryLabel="Skip"
      secondaryOnPress={handleSkip}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      {HAND_WASHING_OPTIONS.map((option) => (
        <OnboardingOptionCard
          key={option.value}
          label={option.label}
          selected={selected === option.value}
          onPress={() => setSelected(option.value)}
        />
      ))}
    </OnboardingTransition>
  );
}
