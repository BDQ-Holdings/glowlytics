import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { useStore } from '../../src/store/useStore';
import { trackEvent } from '../../src/services/analytics';
import { Colors, Glow, FontFamily, FontSize, Spacing, BorderRadius } from '../../src/constants/theme';

const AnimatedView = Animated.View;

const SIGNAL_LABELS: Record<string, { label: string; color: string }> = {
  acne: {
    label: 'Acne & Breakouts',
    color: '#D15A57',
  },
  sun_damage: {
    label: 'Sun Damage & Pigmentation',
    color: '#B88C3E',
  },
  skin_age: {
    label: 'Aging & Texture',
    color: '#4B7FCC',
  },
};

const TRACKED_SIGNALS = [
  { label: 'Structure', color: '#7DE7E1' },
  { label: 'Hydration', color: '#4DA6FF' },
  { label: 'Inflammation', color: '#FF7A78' },
  { label: 'Sun Damage', color: '#F2B56A' },
  { label: 'Elasticity', color: '#B68AFF' },
];

function PreviewIllustration() {
  const pulse1 = useSharedValue(0.6);
  const pulse2 = useSharedValue(0.5);

  useEffect(() => {
    pulse1.value = withRepeat(
      withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    pulse2.value = withDelay(800, withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    ));
  }, []);

  const style1 = useAnimatedStyle(() => ({ opacity: pulse1.value }));
  const style2 = useAnimatedStyle(() => ({ opacity: pulse2.value }));

  return (
    <View style={previewStyles.center}>
      <AnimatedView style={style1}>
        <Svg width={240} height={200} viewBox="0 0 240 200">
          <Defs>
            {/* Celebration spectrum */}
            <RadialGradient id="pvGreen" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#34D399" stopOpacity={0.8} />
              <Stop offset="45%" stopColor="#3A9E8F" stopOpacity={0.3} />
              <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="pvGold" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#F5C842" stopOpacity={0.75} />
              <Stop offset="50%" stopColor="#D4A024" stopOpacity={0.2} />
              <Stop offset="100%" stopColor="#D4A024" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="pvPurple" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.7} />
              <Stop offset="50%" stopColor="#6366B5" stopOpacity={0.2} />
              <Stop offset="100%" stopColor="#6366B5" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="pvBlue" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#3B82F6" stopOpacity={0.6} />
              <Stop offset="50%" stopColor="#3B82F6" stopOpacity={0.15} />
              <Stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="pvRose" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#EF4444" stopOpacity={0.55} />
              <Stop offset="50%" stopColor="#E87B9A" stopOpacity={0.15} />
              <Stop offset="100%" stopColor="#E87B9A" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="pvCore" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.9} />
              <Stop offset="20%" stopColor="#34D399" stopOpacity={0.5} />
              <Stop offset="50%" stopColor="#3A9E8F" stopOpacity={0.2} />
              <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
            </RadialGradient>
          </Defs>

          {/* Spectrum orbs — radial burst */}
          <Circle cx={120} cy={55} r={42} fill="url(#pvGold)" />
          <Circle cx={175} cy={75} r={38} fill="url(#pvRose)" />
          <Circle cx={170} cy={135} r={36} fill="url(#pvBlue)" />
          <Circle cx={70} cy={140} r={38} fill="url(#pvPurple)" />
          <Circle cx={65} cy={70} r={40} fill="url(#pvGreen)" />

          {/* Central convergence */}
          <Circle cx={120} cy={100} r={50} fill="url(#pvGreen)" />

          {/* Orbital celebration rings */}
          <Circle cx={120} cy={100} r={60} fill="none" stroke="#F5C842" strokeWidth={0.8} strokeOpacity={0.3} />
          <Circle cx={120} cy={100} r={48} fill="none" stroke="#8B5CF6" strokeWidth={0.8} strokeOpacity={0.25} />
          <Circle cx={120} cy={100} r={36} fill="none" stroke="#3B82F6" strokeWidth={0.8} strokeOpacity={0.2} />
          <Circle cx={120} cy={100} r={24} fill="none" stroke="#EF4444" strokeWidth={0.8} strokeOpacity={0.18} />

          {/* Core */}
          <Circle cx={120} cy={100} r={16} fill="url(#pvCore)" />
          <Circle cx={120} cy={100} r={5} fill="#FFFFFF" fillOpacity={0.95} />

          {/* Celebration particles */}
          <Circle cx={40} cy={35} r={3} fill="#F5C842" fillOpacity={0.6} />
          <Circle cx={200} cy={38} r={2.5} fill="#EF4444" fillOpacity={0.5} />
          <Circle cx={35} cy={168} r={2.5} fill="#8B5CF6" fillOpacity={0.5} />
          <Circle cx={205} cy={165} r={3} fill="#3B82F6" fillOpacity={0.5} />
          <Circle cx={120} cy={20} r={2} fill="#34D399" fillOpacity={0.45} />
          <Circle cx={120} cy={185} r={2} fill="#34D399" fillOpacity={0.35} />
          <Circle cx={25} cy={100} r={2} fill="#F5A623" fillOpacity={0.3} />
          <Circle cx={215} cy={100} r={2} fill="#E87B9A" fillOpacity={0.3} />

          {/* Extra sparkle dots */}
          <Circle cx={80} cy={30} r={1.5} fill="#EF4444" fillOpacity={0.35} />
          <Circle cx={165} cy={28} r={1.5} fill="#F5C842" fillOpacity={0.35} />
          <Circle cx={45} cy={120} r={1.5} fill="#3B82F6" fillOpacity={0.3} />
          <Circle cx={195} cy={125} r={1.5} fill="#8B5CF6" fillOpacity={0.3} />
          <Circle cx={90} cy={175} r={1.5} fill="#34D399" fillOpacity={0.25} />
          <Circle cx={155} cy={170} r={1.5} fill="#F5C842" fillOpacity={0.25} />
        </Svg>
      </AnimatedView>
    </View>
  );
}

const previewStyles = StyleSheet.create({
  center: { alignItems: 'center' },
});

export default function Preview() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const protocol = useStore((s) => s.protocol);
  const user = useStore((s) => s.user);

  const skinGoals = user?.skin_goals ?? (protocol?.primary_goal ? [protocol.primary_goal] : ['acne']);
  const goalInfos = skinGoals.map((g) => SIGNAL_LABELS[g] || SIGNAL_LABELS.acne);

  const handleContinue = () => {
    trackEvent('onboarding_preview_continue');
    advance();
  };

  // Staggered signal dot animations
  const dotAnimations = TRACKED_SIGNALS.map((_, i) => {
    const opacity = useSharedValue(0);
    const translateX = useSharedValue(-8);

    useEffect(() => {
      opacity.value = withDelay(600 + i * 120, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
      translateX.value = withDelay(600 + i * 120, withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }));
    }, []);

    return useAnimatedStyle(() => ({
      opacity: opacity.value,
      transform: [{ translateX: translateX.value }],
    }));
  });

  return (
    <OnboardingTransition
      illustration={<PreviewIllustration />}
      heading="Here's what we've built for you."
      subtext="Your first scan creates your baseline. Everything after that is measured against it — that's where the real insights begin."
      primaryLabel="Continue"
      primaryOnPress={handleContinue}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      {/* Focus area badges */}
      <View style={styles.focusBadgeRow}>
        {goalInfos.map((info, i) => (
          <View key={skinGoals[i]} style={styles.focusBadge}>
            <View style={[styles.focusDot, { backgroundColor: info.color }]} />
            <Text style={styles.focusLabel}>{info.label}</Text>
          </View>
        ))}
      </View>

      {/* Signal tracking preview */}
      <View style={styles.signalCard}>
        <Text style={styles.signalTitle}>Signals we'll track</Text>
        <View style={styles.signalList}>
          {TRACKED_SIGNALS.map((signal, i) => (
            <AnimatedView key={signal.label} style={[styles.signalRow, dotAnimations[i]]}>
              <View style={[styles.signalDot, { backgroundColor: signal.color }]} />
              <Text style={styles.signalLabel}>{signal.label}</Text>
            </AnimatedView>
          ))}
        </View>
      </View>

      {/* Medical disclaimer */}
      <Text style={styles.disclaimer}>
        Glowlytics provides wellness insights only and is not a medical device. It does not diagnose, treat, or prevent any condition. Consult a dermatologist for medical concerns.
      </Text>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  focusBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  focusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.lg,
  },
  focusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  focusLabel: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  signalCard: {
    backgroundColor: Glow.palette.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Glow.palette.glow,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  signalTitle: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  signalList: {
    gap: Spacing.sm,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  signalLabel: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
  },
  disclaimer: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xxs,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
