import React, { useState } from 'react';
import Svg, { Defs, RadialGradient, Stop, Circle, Path, Ellipse } from 'react-native-svg';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { OnboardingOptionCard } from '../../src/components/OnboardingOptionCard';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import type { ShowerFrequency } from '../../src/types';

const SHOWER_OPTIONS: { label: string; value: ShowerFrequency }[] = [
  { label: 'Once daily', value: 'once_daily' },
  { label: 'Twice daily', value: 'twice_daily' },
  { label: '3+ times daily', value: '3+_daily' },
  { label: 'Every other day', value: 'every_other' },
  { label: 'Less frequently', value: 'less' },
];

function ShowerIllustration() {
  return (
    <Svg width={200} height={160} viewBox="0 0 200 160">
      <Defs>
        <RadialGradient id="waterGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#3B7FC4" stopOpacity={0.8} />
          <Stop offset="55%" stopColor="#3B7FC4" stopOpacity={0.2} />
          <Stop offset="100%" stopColor="#3B7FC4" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="waterCore" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.4} />
          <Stop offset="30%" stopColor="#3B7FC4" stopOpacity={0.7} />
          <Stop offset="70%" stopColor="#3B7FC4" stopOpacity={0.15} />
          <Stop offset="100%" stopColor="#3B7FC4" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="waterMist" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#3A9E8F" stopOpacity={0.5} />
          <Stop offset="60%" stopColor="#3A9E8F" stopOpacity={0.1} />
          <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* Outer mist halo */}
      <Ellipse cx={100} cy={80} rx={80} ry={70} fill="url(#waterMist)" />
      {/* Mid water glow */}
      <Circle cx={100} cy={80} r={55} fill="url(#waterGlow)" />
      {/* Fluid curve 1 - top wave */}
      <Path
        d="M55 55 Q70 40 85 55 Q100 70 115 55 Q130 40 145 55"
        fill="none"
        stroke="#3B7FC4"
        strokeWidth={2}
        strokeOpacity={0.5}
        strokeLinecap="round"
      />
      {/* Fluid curve 2 - mid wave */}
      <Path
        d="M50 80 Q68 65 86 80 Q104 95 122 80 Q140 65 155 80"
        fill="none"
        stroke="#3B7FC4"
        strokeWidth={1.8}
        strokeOpacity={0.4}
        strokeLinecap="round"
      />
      {/* Fluid curve 3 - bottom wave */}
      <Path
        d="M60 105 Q78 92 96 105 Q114 118 132 105 Q146 94 155 105"
        fill="none"
        stroke="#3A9E8F"
        strokeWidth={1.5}
        strokeOpacity={0.35}
        strokeLinecap="round"
      />
      {/* Droplet forms */}
      <Path
        d="M100 60 Q105 50 100 42 Q95 50 100 60Z"
        fill="#3B7FC4"
        fillOpacity={0.5}
      />
      <Path
        d="M78 75 Q82 68 78 62 Q74 68 78 75Z"
        fill="#3B7FC4"
        fillOpacity={0.35}
      />
      <Path
        d="M126 72 Q130 65 126 58 Q122 65 126 72Z"
        fill="#3A9E8F"
        fillOpacity={0.35}
      />
      {/* Core water orb */}
      <Circle cx={100} cy={82} r={16} fill="url(#waterCore)" />
      <Circle cx={100} cy={82} r={5} fill="#3B7FC4" fillOpacity={0.85} />
      {/* Scattered droplet dots */}
      <Circle cx={62} cy={45} r={2.5} fill="#3B7FC4" fillOpacity={0.4} />
      <Circle cx={142} cy={48} r={2} fill="#3B7FC4" fillOpacity={0.35} />
      <Circle cx={55} cy={115} r={2} fill="#3A9E8F" fillOpacity={0.3} />
      <Circle cx={148} cy={112} r={2.5} fill="#3B7FC4" fillOpacity={0.3} />
      <Circle cx={88} cy={125} r={1.5} fill="#3B7FC4" fillOpacity={0.25} />
      <Circle cx={118} cy={40} r={1.5} fill="#3A9E8F" fillOpacity={0.25} />
    </Svg>
  );
}

export default function ShowerFrequencyScreen() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const updateUser = useStore((s) => s.updateUser);

  const [selected, setSelected] = useState<ShowerFrequency | null>(null);

  const handleContinue = () => {
    if (!selected) return;
    updateUser({ shower_frequency: selected });

    advance();
  };

  const handleSkip = () => {
    advance();
  };

  return (
    <OnboardingTransition
      illustration={<ShowerIllustration />}
      heading="How often do you wash your face?"
      subtext="Too much or too little cleansing both leave traces we can measure. This gives us your normal baseline."
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
      {SHOWER_OPTIONS.map((option) => (
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
