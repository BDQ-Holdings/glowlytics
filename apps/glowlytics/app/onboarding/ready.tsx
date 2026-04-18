import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { trackEvent } from '../../src/services/analytics';

const AnimatedView = Animated.View;

function ReadyIllustration() {
  const pulseOpacity = useSharedValue(0.4);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(1.0, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  return (
    <AnimatedView style={pulseStyle}>
      <Svg width={220} height={180} viewBox="0 0 220 180">
        <Defs>
          <RadialGradient id="readyOuterGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#C07B2A" stopOpacity={0.35} />
            <Stop offset="40%" stopColor="#C07B2A" stopOpacity={0.12} />
            <Stop offset="70%" stopColor="#3A9E8F" stopOpacity={0.08} />
            <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="readyMidGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#3A9E8F" stopOpacity={0.8} />
            <Stop offset="35%" stopColor="#3A9E8F" stopOpacity={0.45} />
            <Stop offset="65%" stopColor="#39B5BF" stopOpacity={0.15} />
            <Stop offset="100%" stopColor="#39B5BF" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="readyInnerGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.7} />
            <Stop offset="20%" stopColor="#5DBCAE" stopOpacity={0.6} />
            <Stop offset="45%" stopColor="#3A9E8F" stopOpacity={0.4} />
            <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="readyGoldRing" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#C07B2A" stopOpacity={0.5} />
            <Stop offset="60%" stopColor="#C07B2A" stopOpacity={0.15} />
            <Stop offset="100%" stopColor="#C07B2A" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="readyCoreWhite" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.9} />
            <Stop offset="40%" stopColor="#5DBCAE" stopOpacity={0.5} />
            <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={110} cy={90} rx={100} ry={85} fill="url(#readyOuterGlow)" />
        <Ellipse cx={110} cy={90} rx={72} ry={65} fill="url(#readyGoldRing)" />
        <Circle cx={110} cy={90} r={58} fill="url(#readyMidGlow)" />
        <Circle cx={110} cy={90} r={52} fill="none" stroke="#C07B2A" strokeWidth={1} strokeOpacity={0.25} />
        <Circle cx={110} cy={90} r={42} fill="none" stroke="#3A9E8F" strokeWidth={1.2} strokeOpacity={0.3} />
        <Circle cx={110} cy={90} r={32} fill="none" stroke="#5DBCAE" strokeWidth={0.8} strokeOpacity={0.2} />
        <Circle cx={110} cy={90} r={24} fill="url(#readyInnerGlow)" />
        <Circle cx={110} cy={90} r={10} fill="url(#readyCoreWhite)" />
        <Circle cx={110} cy={90} r={4} fill="#FFFFFF" fillOpacity={0.95} />
        <Circle cx={55} cy={55} r={3} fill="#C07B2A" fillOpacity={0.5} />
        <Circle cx={168} cy={60} r={2.5} fill="#C07B2A" fillOpacity={0.4} />
        <Circle cx={50} cy={120} r={2} fill="#C07B2A" fillOpacity={0.3} />
        <Circle cx={172} cy={115} r={3} fill="#C07B2A" fillOpacity={0.35} />
        <Circle cx={70} cy={38} r={2} fill="#3A9E8F" fillOpacity={0.45} />
        <Circle cx={155} cy={42} r={2.5} fill="#3A9E8F" fillOpacity={0.4} />
        <Circle cx={65} cy={140} r={2.5} fill="#3A9E8F" fillOpacity={0.3} />
        <Circle cx={160} cy={135} r={2} fill="#3A9E8F" fillOpacity={0.35} />
        <Circle cx={110} cy={30} r={2} fill="#5DBCAE" fillOpacity={0.3} />
        <Circle cx={110} cy={150} r={1.5} fill="#5DBCAE" fillOpacity={0.25} />
        <Circle cx={85} cy={160} r={1.5} fill="#C07B2A" fillOpacity={0.2} />
        <Circle cx={140} cy={25} r={1.5} fill="#3A9E8F" fillOpacity={0.2} />
      </Svg>
    </AnimatedView>
  );
}

export default function Ready() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();

  const handleContinue = () => {
    trackEvent('onboarding_ready_continue');
    advance();
  };

  return (
    <OnboardingTransition
      illustration={<ReadyIllustration />}
      heading="You're all set."
      subtext="Your first scan creates your baseline. Everything after that gets measured against it — that's where the real insights start."
      primaryLabel="Continue"
      primaryOnPress={handleContinue}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View />
    </OnboardingTransition>
  );
}
