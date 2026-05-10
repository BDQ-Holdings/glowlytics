import React, { useState } from 'react';
import Svg, { Defs, RadialGradient, Stop, Circle, Path, Ellipse, Line } from 'react-native-svg';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { OnboardingOptionCard } from '../../src/components/OnboardingOptionCard';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import type { ExerciseFrequency } from '../../src/types';

const EXERCISE_OPTIONS: { label: string; value: ExerciseFrequency }[] = [
  { label: 'Rarely or never', value: 'rarely' },
  { label: '1-2 times a week', value: '1-2_weekly' },
  { label: '3-4 times a week', value: '3-4_weekly' },
  { label: '5+ times a week', value: '5+_weekly' },
];

function ExerciseIllustration() {
  return (
    <Svg width={200} height={160} viewBox="0 0 200 160">
      <Defs>
        <RadialGradient id="motionGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#6366B5" stopOpacity={0.8} />
          <Stop offset="55%" stopColor="#6366B5" stopOpacity={0.2} />
          <Stop offset="100%" stopColor="#6366B5" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="tealPulse" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#3A9E8F" stopOpacity={0.7} />
          <Stop offset="60%" stopColor="#3A9E8F" stopOpacity={0.15} />
          <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="coreEnergy" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.4} />
          <Stop offset="35%" stopColor="#6366B5" stopOpacity={0.7} />
          <Stop offset="100%" stopColor="#6366B5" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* Outer teal halo */}
      <Ellipse cx={100} cy={80} rx={78} ry={68} fill="url(#tealPulse)" />
      {/* Mid purple motion field */}
      <Circle cx={100} cy={80} r={55} fill="url(#motionGlow)" />
      {/* Kinetic motion lines */}
      <Line x1={45} y1={55} x2={70} y2={60} stroke="#6366B5" strokeWidth={2} strokeOpacity={0.5} strokeLinecap="round" />
      <Line x1={40} y1={75} x2={65} y2={78} stroke="#6366B5" strokeWidth={1.5} strokeOpacity={0.4} strokeLinecap="round" />
      <Line x1={48} y1={95} x2={72} y2={95} stroke="#3A9E8F" strokeWidth={1.5} strokeOpacity={0.35} strokeLinecap="round" />
      <Line x1={130} y1={58} x2={155} y2={55} stroke="#6366B5" strokeWidth={2} strokeOpacity={0.45} strokeLinecap="round" />
      <Line x1={135} y1={78} x2={160} y2={76} stroke="#3A9E8F" strokeWidth={1.5} strokeOpacity={0.35} strokeLinecap="round" />
      <Line x1={128} y1={98} x2={152} y2={96} stroke="#6366B5" strokeWidth={1.5} strokeOpacity={0.3} strokeLinecap="round" />
      {/* Dynamic arc paths */}
      <Path
        d="M80 50 Q100 30 120 50"
        fill="none"
        stroke="#6366B5"
        strokeWidth={1.5}
        strokeOpacity={0.4}
        strokeLinecap="round"
      />
      <Path
        d="M75 110 Q100 130 125 110"
        fill="none"
        stroke="#3A9E8F"
        strokeWidth={1.5}
        strokeOpacity={0.35}
        strokeLinecap="round"
      />
      {/* Orbital ring */}
      <Circle cx={100} cy={80} r={38} fill="none" stroke="#6366B5" strokeWidth={1} strokeOpacity={0.2} />
      {/* Core energy */}
      <Circle cx={100} cy={80} r={18} fill="url(#coreEnergy)" />
      <Circle cx={100} cy={80} r={6} fill="#6366B5" fillOpacity={0.85} />
      {/* Accent particles */}
      <Circle cx={58} cy={42} r={2.5} fill="#6366B5" fillOpacity={0.5} />
      <Circle cx={148} cy={45} r={2} fill="#3A9E8F" fillOpacity={0.4} />
      <Circle cx={55} cy={115} r={2} fill="#3A9E8F" fillOpacity={0.3} />
      <Circle cx={150} cy={110} r={3} fill="#6366B5" fillOpacity={0.35} />
    </Svg>
  );
}

export default function Exercise() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const updateUser = useStore((s) => s.updateUser);

  const [selected, setSelected] = useState<ExerciseFrequency | null>(null);

  const handleContinue = () => {
    if (!selected) return;
    updateUser({ exercise_frequency: selected });

    advance();
  };

  const handleSkip = () => {
    advance();
  };

  return (
    <OnboardingTransition
      illustration={<ExerciseIllustration />}
      heading="How often do you work out?"
      subtext="Exercise boosts blood flow and can change oil production. This helps us make sense of your readings."
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
      {EXERCISE_OPTIONS.map((option) => (
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
