import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse, Path } from 'react-native-svg';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { OnboardingOptionCard } from '../../src/components/OnboardingOptionCard';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Spacing } from '../../src/constants/theme';
import type { PrimaryGoal, ScanRegion } from '../../src/types';

interface GoalOption {
  label: string;
  description: string;
  value: PrimaryGoal;
  defaultRegion: ScanRegion;
}

const GOAL_OPTIONS: GoalOption[] = [
  {
    label: 'Acne & Breakouts',
    description: 'Track inflammation, active breakouts, and day-to-day clarity',
    value: 'acne',
    defaultRegion: 'whole_face',
  },
  {
    label: 'Sun Damage & Pigmentation',
    description: 'Monitor UV-related changes and visible pigmentation over time',
    value: 'sun_damage',
    defaultRegion: 'forehead',
  },
  {
    label: 'Aging & Texture',
    description: 'Follow fine lines, elasticity, and skin vitality trends',
    value: 'skin_age',
    defaultRegion: 'crows_feet',
  },
];

function AcneIllustration() {
  return (
    <Svg width={200} height={170} viewBox="0 0 200 170">
      <Defs>
        <RadialGradient id="acneCore" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#EF4444" stopOpacity={0.8} />
          <Stop offset="40%" stopColor="#D15A57" stopOpacity={0.35} />
          <Stop offset="100%" stopColor="#D15A57" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="acneOrange" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#F5A623" stopOpacity={0.6} />
          <Stop offset="60%" stopColor="#E8933A" stopOpacity={0.12} />
          <Stop offset="100%" stopColor="#E8933A" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="acnePurple" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.45} />
          <Stop offset="60%" stopColor="#6366B5" stopOpacity={0.1} />
          <Stop offset="100%" stopColor="#6366B5" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={70} cy={55} r={42} fill="url(#acneOrange)" />
      <Circle cx={145} cy={120} r={38} fill="url(#acnePurple)" />
      <Circle cx={100} cy={85} r={55} fill="url(#acneCore)" />
      <Circle cx={100} cy={85} r={42} fill="none" stroke="#EF4444" strokeWidth={1} strokeOpacity={0.3} />
      <Circle cx={100} cy={85} r={30} fill="none" stroke="#D15A57" strokeWidth={1.2} strokeOpacity={0.35} />
      {/* Breakout spots — bold, saturated */}
      <Circle cx={80} cy={65} r={7} fill="#EF4444" fillOpacity={0.45} />
      <Circle cx={120} cy={72} r={5.5} fill="#D15A57" fillOpacity={0.4} />
      <Circle cx={90} cy={100} r={6} fill="#EF4444" fillOpacity={0.38} />
      <Circle cx={112} cy={95} r={4.5} fill="#F5A623" fillOpacity={0.35} />
      <Circle cx={100} cy={85} r={3.5} fill="#EF4444" fillOpacity={0.55} />
      {/* Particles */}
      <Circle cx={50} cy={35} r={2.5} fill="#F5A623" fillOpacity={0.5} />
      <Circle cx={158} cy={45} r={2} fill="#8B5CF6" fillOpacity={0.4} />
      <Circle cx={45} cy={135} r={2} fill="#D15A57" fillOpacity={0.3} />
      <Circle cx={160} cy={140} r={2.5} fill="#EF4444" fillOpacity={0.35} />
    </Svg>
  );
}

function SunDamageIllustration() {
  return (
    <Svg width={200} height={170} viewBox="0 0 200 170">
      <Defs>
        <RadialGradient id="sunCore" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#F5C842" stopOpacity={0.85} />
          <Stop offset="40%" stopColor="#D4A024" stopOpacity={0.35} />
          <Stop offset="100%" stopColor="#B88C3E" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="sunOrange" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#EF7B4D" stopOpacity={0.6} />
          <Stop offset="60%" stopColor="#E8593A" stopOpacity={0.12} />
          <Stop offset="100%" stopColor="#E8593A" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="sunTeal" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#3A9E8F" stopOpacity={0.4} />
          <Stop offset="60%" stopColor="#3A9E8F" stopOpacity={0.08} />
          <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={65} cy={55} r={40} fill="url(#sunOrange)" />
      <Circle cx={150} cy={130} r={35} fill="url(#sunTeal)" />
      <Circle cx={100} cy={85} r={50} fill="url(#sunCore)" />
      <Circle cx={100} cy={85} r={32} fill="none" stroke="#F5C842" strokeWidth={1.2} strokeOpacity={0.35} />
      {/* Sun rays — bolder */}
      <Path d="M100 38 L100 24" stroke="#F5C842" strokeWidth={2} strokeOpacity={0.5} strokeLinecap="round" />
      <Path d="M100 146 L100 132" stroke="#D4A024" strokeWidth={2} strokeOpacity={0.45} strokeLinecap="round" />
      <Path d="M52 85 L38 85" stroke="#EF7B4D" strokeWidth={2} strokeOpacity={0.45} strokeLinecap="round" />
      <Path d="M162 85 L148 85" stroke="#F5C842" strokeWidth={2} strokeOpacity={0.45} strokeLinecap="round" />
      <Path d="M67 52 L58 43" stroke="#D4A024" strokeWidth={1.5} strokeOpacity={0.35} strokeLinecap="round" />
      <Path d="M133 118 L142 127" stroke="#3A9E8F" strokeWidth={1.5} strokeOpacity={0.3} strokeLinecap="round" />
      <Path d="M133 52 L142 43" stroke="#EF7B4D" strokeWidth={1.5} strokeOpacity={0.35} strokeLinecap="round" />
      <Path d="M67 118 L58 127" stroke="#F5C842" strokeWidth={1.5} strokeOpacity={0.3} strokeLinecap="round" />
      {/* Core */}
      <Circle cx={100} cy={85} r={16} fill="#F5C842" fillOpacity={0.35} />
      <Circle cx={100} cy={85} r={6} fill="#F5C842" fillOpacity={0.7} />
      {/* Particles */}
      <Circle cx={42} cy={30} r={2.5} fill="#EF7B4D" fillOpacity={0.5} />
      <Circle cx={165} cy={35} r={2} fill="#F5C842" fillOpacity={0.45} />
      <Circle cx={38} cy={145} r={2} fill="#3A9E8F" fillOpacity={0.35} />
      <Circle cx={168} cy={148} r={2.5} fill="#D4A024" fillOpacity={0.4} />
    </Svg>
  );
}

function SkinAgeIllustration() {
  return (
    <Svg width={200} height={170} viewBox="0 0 200 170">
      <Defs>
        <RadialGradient id="ageBlueCore" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#3B82F6" stopOpacity={0.8} />
          <Stop offset="40%" stopColor="#4B7FCC" stopOpacity={0.35} />
          <Stop offset="100%" stopColor="#4B7FCC" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="agePurple2" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.6} />
          <Stop offset="60%" stopColor="#6366B5" stopOpacity={0.12} />
          <Stop offset="100%" stopColor="#6366B5" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="ageTeal2" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#3A9E8F" stopOpacity={0.45} />
          <Stop offset="60%" stopColor="#3A9E8F" stopOpacity={0.08} />
          <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={65} cy={60} r={42} fill="url(#agePurple2)" />
      <Circle cx={145} cy={125} r={38} fill="url(#ageTeal2)" />
      <Circle cx={100} cy={85} r={52} fill="url(#ageBlueCore)" />
      {/* Texture waves — bolder */}
      <Path d="M35 60 Q65 48 100 60 Q135 72 165 60" fill="none" stroke="#3B82F6" strokeWidth={1.2} strokeOpacity={0.3} />
      <Path d="M35 85 Q65 73 100 85 Q135 97 165 85" fill="none" stroke="#8B5CF6" strokeWidth={1.5} strokeOpacity={0.35} />
      <Path d="M35 110 Q65 98 100 110 Q135 122 165 110" fill="none" stroke="#3A9E8F" strokeWidth={1.2} strokeOpacity={0.3} />
      {/* Elasticity curves */}
      <Ellipse cx={100} cy={85} rx={30} ry={22} fill="none" stroke="#3B82F6" strokeWidth={1.5} strokeOpacity={0.35} />
      <Circle cx={100} cy={85} r={12} fill="#3B82F6" fillOpacity={0.25} />
      <Circle cx={100} cy={85} r={4.5} fill="#3B82F6" fillOpacity={0.6} />
      {/* Particles */}
      <Circle cx={42} cy={32} r={2.5} fill="#8B5CF6" fillOpacity={0.5} />
      <Circle cx={165} cy={38} r={2} fill="#3B82F6" fillOpacity={0.45} />
      <Circle cx={38} cy={140} r={2} fill="#3A9E8F" fillOpacity={0.35} />
      <Circle cx={168} cy={145} r={2.5} fill="#8B5CF6" fillOpacity={0.4} />
    </Svg>
  );
}

const ILLUSTRATIONS: Record<PrimaryGoal, React.ReactNode> = {
  acne: <AcneIllustration />,
  sun_damage: <SunDamageIllustration />,
  skin_age: <SkinAgeIllustration />,
};

function DefaultGoalIllustration() {
  return (
    <Svg width={200} height={170} viewBox="0 0 200 170">
      <Defs>
        <RadialGradient id="defGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#3A9E8F" stopOpacity={0.6} />
          <Stop offset="45%" stopColor="#3A9E8F" stopOpacity={0.2} />
          <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="defPurple" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.4} />
          <Stop offset="60%" stopColor="#6366B5" stopOpacity={0.08} />
          <Stop offset="100%" stopColor="#6366B5" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="defGold" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#F5C842" stopOpacity={0.4} />
          <Stop offset="60%" stopColor="#D4A024" stopOpacity={0.08} />
          <Stop offset="100%" stopColor="#D4A024" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={70} cy={55} r={38} fill="url(#defGold)" />
      <Circle cx={140} cy={125} r={35} fill="url(#defPurple)" />
      <Circle cx={100} cy={85} r={48} fill="url(#defGlow)" />
      <Circle cx={100} cy={85} r={35} fill="none" stroke="#3A9E8F" strokeWidth={0.8} strokeOpacity={0.25} />
      <Circle cx={100} cy={85} r={22} fill="none" stroke="#8B5CF6" strokeWidth={1} strokeOpacity={0.2} />
      <Circle cx={100} cy={85} r={6} fill="#3A9E8F" fillOpacity={0.45} />
    </Svg>
  );
}

export default function SkinGoal() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const setProtocol = useStore((s) => s.setProtocol);
  const updateUser = useStore((s) => s.updateUser);

  const [selected, setSelected] = useState<PrimaryGoal[]>([]);

  const toggle = (goal: PrimaryGoal) => {
    setSelected((prev) =>
      prev.includes(goal)
        ? prev.filter((g) => g !== goal)
        : [...prev, goal],
    );
  };

  const allSelected = selected.length === GOAL_OPTIONS.length;

  const handleContinue = () => {
    if (selected.length === 0) return;
    const primary = selected[0];
    const option = GOAL_OPTIONS.find((o) => o.value === primary);
    if (!option) return;
    updateUser({ skin_goals: selected });
    const region = selected.length === GOAL_OPTIONS.length ? 'whole_face' : option.defaultRegion;
    setProtocol(option.value, region);
    advance();
  };

  const handleTrackAll = () => {
    const allGoals = GOAL_OPTIONS.map((o) => o.value);
    updateUser({ skin_goals: allGoals });
    setProtocol('acne', 'whole_face');
    advance();
  };

  // Show illustration for last selected goal, or default
  const lastSelected = selected.length > 0 ? selected[selected.length - 1] : null;
  const illustration = lastSelected ? ILLUSTRATIONS[lastSelected] : <DefaultGoalIllustration />;

  return (
    <OnboardingTransition
      illustration={illustration}
      heading="What do you want to focus on?"
      subtext="Pick one or several — we'll tailor your scans and insights to all of them."
      primaryLabel={selected.length > 1 ? `Continue (${selected.length})` : 'Continue'}
      primaryOnPress={handleContinue}
      primaryDisabled={selected.length === 0}
      secondaryLabel={allSelected ? undefined : 'Track everything'}
      secondaryOnPress={allSelected ? undefined : handleTrackAll}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.options}>
        {GOAL_OPTIONS.map((opt) => (
          <OnboardingOptionCard
            key={opt.value}
            label={opt.label}
            description={opt.description}
            selected={selected.includes(opt.value)}
            onPress={() => toggle(opt.value)}
            multiSelect
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
