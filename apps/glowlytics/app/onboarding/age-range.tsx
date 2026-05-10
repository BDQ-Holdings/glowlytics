import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { OnboardingGridOption } from '../../src/components/OnboardingOptionCard';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Spacing } from '../../src/constants/theme';

const AGE_OPTIONS = [
  'Under 18',
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55+',
] as const;

function AgeIllustration() {
  const pulseOpacity = useSharedValue(0.7);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  return (
    <Animated.View style={pulseStyle}>
      <Svg width={220} height={180} viewBox="0 0 220 180">
        <Defs>
          {/* Warm amber center */}
          <RadialGradient id="ageAmber" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#F5C842" stopOpacity={0.85} />
            <Stop offset="40%" stopColor="#E8933A" stopOpacity={0.35} />
            <Stop offset="100%" stopColor="#D4A024" stopOpacity={0} />
          </RadialGradient>
          {/* Red-orange outer warmth */}
          <RadialGradient id="ageWarm" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#EF7B4D" stopOpacity={0.6} />
            <Stop offset="55%" stopColor="#E8593A" stopOpacity={0.15} />
            <Stop offset="100%" stopColor="#E8593A" stopOpacity={0} />
          </RadialGradient>
          {/* Purple haze */}
          <RadialGradient id="agePurple" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.5} />
            <Stop offset="60%" stopColor="#6366B5" stopOpacity={0.12} />
            <Stop offset="100%" stopColor="#6366B5" stopOpacity={0} />
          </RadialGradient>
          {/* Teal accent */}
          <RadialGradient id="ageTeal" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#3A9E8F" stopOpacity={0.5} />
            <Stop offset="60%" stopColor="#3A9E8F" stopOpacity={0.1} />
            <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
          </RadialGradient>
          {/* Core glow */}
          <RadialGradient id="ageCore" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.7} />
            <Stop offset="25%" stopColor="#F5C842" stopOpacity={0.6} />
            <Stop offset="100%" stopColor="#D4A024" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Color orbs */}
        <Ellipse cx={80} cy={60} rx={55} ry={50} fill="url(#ageWarm)" />
        <Ellipse cx={155} cy={65} rx={45} ry={42} fill="url(#agePurple)" />
        <Circle cx={70} cy={135} r={40} fill="url(#ageTeal)" />

        {/* Central amber field */}
        <Circle cx={110} cy={90} r={55} fill="url(#ageAmber)" />

        {/* Concentric rings — multi-color */}
        <Circle cx={110} cy={90} r={62} fill="none" stroke="#EF7B4D" strokeWidth={1} strokeOpacity={0.2} />
        <Circle cx={110} cy={90} r={50} fill="none" stroke="#F5C842" strokeWidth={1.2} strokeOpacity={0.3} />
        <Circle cx={110} cy={90} r={38} fill="none" stroke="#8B5CF6" strokeWidth={1} strokeOpacity={0.2} />
        <Circle cx={110} cy={90} r={26} fill="none" stroke="#3A9E8F" strokeWidth={1.2} strokeOpacity={0.25} />

        {/* Core */}
        <Circle cx={110} cy={90} r={14} fill="url(#ageCore)" />
        <Circle cx={110} cy={90} r={5} fill="#F5C842" fillOpacity={0.9} />

        {/* Accent particles */}
        <Circle cx={45} cy={35} r={3} fill="#EF7B4D" fillOpacity={0.5} />
        <Circle cx={185} cy={40} r={2.5} fill="#8B5CF6" fillOpacity={0.45} />
        <Circle cx={40} cy={150} r={2.5} fill="#3A9E8F" fillOpacity={0.4} />
        <Circle cx={190} cy={145} r={2} fill="#F5C842" fillOpacity={0.4} />
        <Circle cx={110} cy={22} r={2} fill="#F5C842" fillOpacity={0.35} />
        <Circle cx={110} cy={162} r={2} fill="#EF7B4D" fillOpacity={0.3} />
      </Svg>
    </Animated.View>
  );
}

export default function AgeRange() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const updateUser = useStore((s) => s.updateUser);

  const [selected, setSelected] = useState<string | null>(null);

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
      illustration={<AgeIllustration />}
      heading="What's your age range?"
      subtext="Your skin changes a lot decade to decade. This helps us set the right baseline."
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
      <View style={styles.grid}>
        {AGE_OPTIONS.map((age) => (
          <View key={age} style={styles.gridItem}>
            <OnboardingGridOption
              label={age}
              selected={selected === age}
              onPress={() => setSelected(age)}
            />
          </View>
        ))}
      </View>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  gridItem: {
    width: '48%',
  },
});
