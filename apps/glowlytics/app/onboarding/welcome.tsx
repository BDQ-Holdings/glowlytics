import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { useStore } from '../../src/store/useStore';
import { buildOnboardingFlow, screenToRoute } from '../../src/services/onboardingFlow';
import { trackEvent } from '../../src/services/analytics';

function WelcomeIllustration() {
  const pulseScale = useSharedValue(0.95);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(1.06, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View style={pulseStyle}>
      <Svg width={240} height={200} viewBox="0 0 240 200">
        <Defs>
          {/* Central green-teal glow */}
          <RadialGradient id="wGreen" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#34D399" stopOpacity={0.85} />
            <Stop offset="45%" stopColor="#3A9E8F" stopOpacity={0.35} />
            <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
          </RadialGradient>
          {/* Top-left golden glow */}
          <RadialGradient id="wYellow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#F5C842" stopOpacity={0.8} />
            <Stop offset="50%" stopColor="#F5A623" stopOpacity={0.25} />
            <Stop offset="100%" stopColor="#F5A623" stopOpacity={0} />
          </RadialGradient>
          {/* Top-right rose glow */}
          <RadialGradient id="wRed" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#EF4444" stopOpacity={0.7} />
            <Stop offset="50%" stopColor="#E87B9A" stopOpacity={0.2} />
            <Stop offset="100%" stopColor="#E87B9A" stopOpacity={0} />
          </RadialGradient>
          {/* Bottom-left purple glow */}
          <RadialGradient id="wPurple" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.75} />
            <Stop offset="50%" stopColor="#6366B5" stopOpacity={0.2} />
            <Stop offset="100%" stopColor="#6366B5" stopOpacity={0} />
          </RadialGradient>
          {/* Bottom-right blue glow */}
          <RadialGradient id="wBlue" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#3B82F6" stopOpacity={0.7} />
            <Stop offset="50%" stopColor="#3B7FC4" stopOpacity={0.2} />
            <Stop offset="100%" stopColor="#3B7FC4" stopOpacity={0} />
          </RadialGradient>
          {/* Core white convergence */}
          <RadialGradient id="wCore" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.85} />
            <Stop offset="25%" stopColor="#34D399" stopOpacity={0.5} />
            <Stop offset="60%" stopColor="#3A9E8F" stopOpacity={0.15} />
            <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Five color orbs arranged radially */}
        <Circle cx={78} cy={58} r={52} fill="url(#wYellow)" />
        <Circle cx={172} cy={55} r={46} fill="url(#wRed)" />
        <Circle cx={62} cy={148} r={50} fill="url(#wPurple)" />
        <Circle cx={180} cy={150} r={44} fill="url(#wBlue)" />

        {/* Central green convergence — largest, on top */}
        <Circle cx={120} cy={100} r={60} fill="url(#wGreen)" />

        {/* Orbital rings — multi-color */}
        <Circle cx={120} cy={100} r={55} fill="none" stroke="#F5C842" strokeWidth={1} strokeOpacity={0.35} />
        <Circle cx={120} cy={100} r={42} fill="none" stroke="#8B5CF6" strokeWidth={1} strokeOpacity={0.3} />
        <Circle cx={120} cy={100} r={30} fill="none" stroke="#3B82F6" strokeWidth={0.8} strokeOpacity={0.25} />
        <Circle cx={120} cy={100} r={20} fill="none" stroke="#EF4444" strokeWidth={0.8} strokeOpacity={0.2} />

        {/* Core bright convergence */}
        <Circle cx={120} cy={100} r={16} fill="url(#wCore)" />
        <Circle cx={120} cy={100} r={6} fill="#3A9E8F" fillOpacity={0.95} />

        {/* Accent particles — each color */}
        <Circle cx={42} cy={35} r={3.5} fill="#F5C842" fillOpacity={0.65} />
        <Circle cx={200} cy={38} r={3} fill="#EF4444" fillOpacity={0.55} />
        <Circle cx={38} cy={172} r={3} fill="#8B5CF6" fillOpacity={0.55} />
        <Circle cx={204} cy={168} r={3.5} fill="#3B82F6" fillOpacity={0.55} />
        <Circle cx={120} cy={24} r={2.5} fill="#34D399" fillOpacity={0.5} />
        <Circle cx={120} cy={180} r={2.5} fill="#34D399" fillOpacity={0.4} />
        <Circle cx={26} cy={100} r={2} fill="#F5A623" fillOpacity={0.35} />
        <Circle cx={216} cy={100} r={2} fill="#E87B9A" fillOpacity={0.35} />

        {/* Secondary particles */}
        <Circle cx={65} cy={28} r={1.5} fill="#EF4444" fillOpacity={0.3} />
        <Circle cx={178} cy={30} r={1.5} fill="#F5C842" fillOpacity={0.3} />
        <Circle cx={30} cy={135} r={1.5} fill="#3B82F6" fillOpacity={0.25} />
        <Circle cx={212} cy={140} r={1.5} fill="#8B5CF6" fillOpacity={0.25} />
      </Svg>
    </Animated.View>
  );
}

export default function Welcome() {
  const router = useRouter();
  const { userId } = useAuth();
  const createUser = useStore((s) => s.createUser);
  const setOnboardingFlow = useStore((s) => s.setOnboardingFlow);
  const setOnboardingFlowIndex = useStore((s) => s.setOnboardingFlowIndex);

  const handleStart = () => {
    trackEvent('onboarding_started');
    createUser({ user_id: userId ?? undefined });
    const flow = buildOnboardingFlow();
    setOnboardingFlow(flow);
    setOnboardingFlowIndex(1);
    router.push(screenToRoute(flow[1]));
  };

  return (
    <OnboardingTransition
      illustration={<WelcomeIllustration />}
      heading="A few questions to make this yours."
      subtext="Glowlytics adapts to your skin, your lifestyle, and your goals. This takes under a minute."
      primaryLabel="Let's go"
      primaryOnPress={handleStart}
      showProgress={false}
    />
  );
}
