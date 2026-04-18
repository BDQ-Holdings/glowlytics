import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Camera } from 'expo-camera';
import Svg, { Defs, RadialGradient, Stop, Circle, Path, Ellipse, Line } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../../src/constants/theme';

function CameraIllustration() {
  const scanPulse = useSharedValue(0.7);

  useEffect(() => {
    scanPulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: scanPulse.value,
  }));

  return (
    <Animated.View style={pulseStyle}>
      <Svg width={220} height={180} viewBox="0 0 220 180">
        <Defs>
          {/* Central teal-cyan lens glow */}
          <RadialGradient id="camLens" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#22D3EE" stopOpacity={0.85} />
            <Stop offset="35%" stopColor="#3A9E8F" stopOpacity={0.45} />
            <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
          </RadialGradient>
          {/* Green field */}
          <RadialGradient id="camGreen" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#34D399" stopOpacity={0.6} />
            <Stop offset="60%" stopColor="#34D399" stopOpacity={0.12} />
            <Stop offset="100%" stopColor="#34D399" stopOpacity={0} />
          </RadialGradient>
          {/* Blue accent */}
          <RadialGradient id="camBlue" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#3B82F6" stopOpacity={0.55} />
            <Stop offset="60%" stopColor="#3B82F6" stopOpacity={0.12} />
            <Stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
          </RadialGradient>
          {/* Purple accent */}
          <RadialGradient id="camPurple" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.45} />
            <Stop offset="60%" stopColor="#6366B5" stopOpacity={0.1} />
            <Stop offset="100%" stopColor="#6366B5" stopOpacity={0} />
          </RadialGradient>
          {/* Core white */}
          <RadialGradient id="camCore" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.7} />
            <Stop offset="25%" stopColor="#22D3EE" stopOpacity={0.6} />
            <Stop offset="60%" stopColor="#3A9E8F" stopOpacity={0.15} />
            <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Color orbs */}
        <Circle cx={70} cy={55} r={45} fill="url(#camGreen)" />
        <Circle cx={165} cy={50} r={40} fill="url(#camBlue)" />
        <Circle cx={60} cy={140} r={38} fill="url(#camPurple)" />

        {/* Central teal lens field */}
        <Ellipse cx={110} cy={90} rx={65} ry={58} fill="url(#camLens)" />

        {/* Aperture hexagon */}
        <Path
          d="M110 46 L134 64 L134 90 L110 108 L86 90 L86 64 Z"
          fill="none"
          stroke="#3A9E8F"
          strokeWidth={1.8}
          strokeOpacity={0.45}
        />
        <Path
          d="M110 54 L129 68 L129 86 L110 100 L91 86 L91 68 Z"
          fill="none"
          stroke="#22D3EE"
          strokeWidth={1}
          strokeOpacity={0.3}
        />

        {/* Inner aperture fills */}
        <Path d="M110 54 L129 68 L110 62 Z" fill="#3A9E8F" fillOpacity={0.12} />
        <Path d="M129 68 L129 86 L118 77 Z" fill="#22D3EE" fillOpacity={0.1} />
        <Path d="M129 86 L110 100 L118 86 Z" fill="#3B82F6" fillOpacity={0.08} />
        <Path d="M110 100 L91 86 L102 86 Z" fill="#8B5CF6" fillOpacity={0.08} />
        <Path d="M91 86 L91 68 L102 77 Z" fill="#34D399" fillOpacity={0.1} />
        <Path d="M91 68 L110 54 L102 68 Z" fill="#3A9E8F" fillOpacity={0.1} />

        {/* Crosshairs */}
        <Line x1={110} y1={35} x2={110} y2={58} stroke="#3A9E8F" strokeWidth={1} strokeOpacity={0.35} strokeLinecap="round" />
        <Line x1={110} y1={100} x2={110} y2={125} stroke="#3A9E8F" strokeWidth={1} strokeOpacity={0.35} strokeLinecap="round" />
        <Line x1={65} y1={77} x2={88} y2={77} stroke="#22D3EE" strokeWidth={1} strokeOpacity={0.3} strokeLinecap="round" />
        <Line x1={132} y1={77} x2={155} y2={77} stroke="#22D3EE" strokeWidth={1} strokeOpacity={0.3} strokeLinecap="round" />

        {/* Core lens */}
        <Circle cx={110} cy={77} r={14} fill="url(#camCore)" />
        <Circle cx={110} cy={77} r={5} fill="#3A9E8F" fillOpacity={0.95} />

        {/* Corner brackets — sci-fi */}
        <Path d="M55 38 L55 50 M55 38 L67 38" stroke="#34D399" strokeWidth={2} strokeOpacity={0.4} strokeLinecap="round" />
        <Path d="M165 38 L165 50 M165 38 L153 38" stroke="#3B82F6" strokeWidth={2} strokeOpacity={0.4} strokeLinecap="round" />
        <Path d="M55 128 L55 116 M55 128 L67 128" stroke="#8B5CF6" strokeWidth={2} strokeOpacity={0.35} strokeLinecap="round" />
        <Path d="M165 128 L165 116 M165 128 L153 128" stroke="#F5C842" strokeWidth={2} strokeOpacity={0.35} strokeLinecap="round" />

        {/* Accent particles */}
        <Circle cx={42} cy={30} r={2.5} fill="#34D399" fillOpacity={0.5} />
        <Circle cx={178} cy={28} r={2} fill="#3B82F6" fillOpacity={0.45} />
        <Circle cx={38} cy={145} r={2} fill="#8B5CF6" fillOpacity={0.4} />
        <Circle cx={182} cy={142} r={2.5} fill="#F5C842" fillOpacity={0.4} />
      </Svg>
    </Animated.View>
  );
}

export default function CameraPermission() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const updateUser = useStore((s) => s.updateUser);

  const handleEnable = async () => {
    const result = await Camera.requestCameraPermissionsAsync();
    updateUser({
      camera_permission_status: result.granted ? 'granted' : 'denied',
    });
    advance();
  };

  const handleSkip = () => {
    updateUser({ camera_permission_status: 'not_requested' });
    advance();
  };

  return (
    <OnboardingTransition
      illustration={<CameraIllustration />}
      heading="Now, let's set up your camera."
      subtext="Photos are processed privately and never shared. We don't access your camera in the background."
      primaryLabel="Enable camera access"
      primaryOnPress={handleEnable}
      secondaryLabel="Set up later"
      secondaryOnPress={handleSkip}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.trustCard}>
        <View style={styles.trustIconRow}>
          <Svg width={20} height={20} viewBox="0 0 20 20">
            <Path
              d="M10 2L3 6V10C3 14.4 6 18.3 10 19C14 18.3 17 14.4 17 10V6L10 2Z"
              fill="#3A9E8F"
              fillOpacity={0.15}
              stroke="#3A9E8F"
              strokeWidth={1.2}
              strokeOpacity={0.6}
            />
            <Path
              d="M7.5 10L9.5 12L13 8"
              fill="none"
              stroke="#3A9E8F"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={styles.trustTitle}>Privacy-first design</Text>
        </View>
        <Text style={styles.trustBody}>
          Photos stay yours. Glowlytics never accesses your camera in the background. You control when scans happen.
        </Text>
      </View>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  trustCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    borderColor: Colors.glowPrimary,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  trustIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  trustTitle: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  trustBody: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
