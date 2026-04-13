import React, { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../constants/theme';
import { ProgressDots } from './ProgressDots';

import { CALM_EASING } from '../utils/animations';

interface OnboardingTransitionProps {
  children?: React.ReactNode;
  illustration?: React.ReactNode;
  heading: string;
  subtext: string;
  primaryLabel: string;
  primaryOnPress: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  secondaryOnPress?: () => void;
  showProgress?: boolean;
  totalSteps?: number;
  currentStep?: number;
  showBack?: boolean;
  onBack?: () => void;
}

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export const OnboardingTransition: React.FC<OnboardingTransitionProps> = ({
  children,
  illustration,
  heading,
  subtext,
  primaryLabel,
  primaryOnPress,
  primaryDisabled = false,
  secondaryLabel,
  secondaryOnPress,
  showProgress = true,
  totalSteps = 7,
  currentStep = 0,
  showBack = false,
  onBack,
}) => {
  const insets = useSafeAreaInsets();

  // Staggered fade-with-rise entrance — more dramatic
  const illustrationOpacity = useSharedValue(0);
  const illustrationTranslateY = useSharedValue(32);
  const illustrationScale = useSharedValue(0.92);
  const headingOpacity = useSharedValue(0);
  const headingTranslateY = useSharedValue(20);
  const subtextOpacity = useSharedValue(0);
  const subtextTranslateY = useSharedValue(16);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(14);
  const buttonsOpacity = useSharedValue(0);
  const buttonsTranslateY = useSharedValue(12);
  const backOpacity = useSharedValue(0);

  // Ambient background glow pulse
  const glowPulse = useSharedValue(0.6);

  useEffect(() => {
    // Illustration — scale + fade entrance
    illustrationOpacity.value = withTiming(1, { duration: 700, easing: CALM_EASING });
    illustrationTranslateY.value = withTiming(0, { duration: 700, easing: CALM_EASING });
    illustrationScale.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.exp) });

    // Heading — 150ms stagger
    headingOpacity.value = withDelay(150, withTiming(1, { duration: 550, easing: CALM_EASING }));
    headingTranslateY.value = withDelay(150, withTiming(0, { duration: 550, easing: CALM_EASING }));

    // Subtext
    subtextOpacity.value = withDelay(280, withTiming(1, { duration: 500, easing: CALM_EASING }));
    subtextTranslateY.value = withDelay(280, withTiming(0, { duration: 500, easing: CALM_EASING }));

    // Content (options/inputs)
    contentOpacity.value = withDelay(380, withTiming(1, { duration: 500, easing: CALM_EASING }));
    contentTranslateY.value = withDelay(380, withTiming(0, { duration: 500, easing: CALM_EASING }));

    // Buttons
    buttonsOpacity.value = withDelay(480, withTiming(1, { duration: 450, easing: CALM_EASING }));
    buttonsTranslateY.value = withDelay(480, withTiming(0, { duration: 450, easing: CALM_EASING }));

    // Back chevron
    if (showBack) {
      backOpacity.value = withDelay(500, withTiming(1, { duration: 400, easing: CALM_EASING }));
    }

    // Ambient glow breathing
    glowPulse.value = withDelay(600, withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    ));
  }, []);

  const illustrationStyle = useAnimatedStyle(() => ({
    opacity: illustrationOpacity.value,
    transform: [
      { translateY: illustrationTranslateY.value },
      { scale: illustrationScale.value },
    ],
  }));

  const headingStyle = useAnimatedStyle(() => ({
    opacity: headingOpacity.value,
    transform: [{ translateY: headingTranslateY.value }],
  }));

  const subtextStyle = useAnimatedStyle(() => ({
    opacity: subtextOpacity.value,
    transform: [{ translateY: subtextTranslateY.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  const buttonsStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsTranslateY.value }],
  }));

  const backStyle = useAnimatedStyle(() => ({
    opacity: backOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowPulse.value * 0.35,
  }));

  const glowStyle2 = useAnimatedStyle(() => ({
    opacity: glowPulse.value * 0.25,
  }));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Base cream gradient */}
      <LinearGradient
        colors={[Colors.background, Colors.backgroundDeep, Colors.backgroundWarm]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Warm golden glow — top left */}
      <Animated.View style={[styles.glowGolden, glowStyle]}>
        <LinearGradient
          colors={['rgba(245, 200, 66, 0.5)', 'rgba(245, 166, 35, 0.15)', 'transparent']}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Soft purple glow — bottom right */}
      <Animated.View style={[styles.glowPurple, glowStyle2]}>
        <LinearGradient
          colors={['rgba(139, 92, 246, 0.4)', 'rgba(99, 102, 181, 0.12)', 'transparent']}
          start={{ x: 0.2, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Teal glow — mid right */}
      <LinearGradient
        colors={['rgba(58, 158, 143, 0.15)', 'transparent']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.midGlow}
      />

      {/* Rose glow — top right accent */}
      <Animated.View style={[styles.glowRose, glowStyle]}>
        <LinearGradient
          colors={['rgba(232, 89, 58, 0.2)', 'rgba(232, 123, 154, 0.08)', 'transparent']}
          start={{ x: 0.3, y: 0.1 }}
          end={{ x: 0.8, y: 0.8 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Back button */}
      {showBack && onBack && (
        <Animated.View style={[styles.backButton, { top: insets.top + 8 }, backStyle]}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Go back" accessibilityRole="button">
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path
                d="M15 18L9 12L15 6"
                stroke={Colors.textSecondary}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </TouchableOpacity>
        </Animated.View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.lg }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {illustration && (
            <Animated.View style={[styles.illustrationArea, illustrationStyle]}>
              {illustration}
            </Animated.View>
          )}

          {/* Progress dots — exclude welcome (index 0) and paywall (last) from display */}
          {showProgress && (
            <View style={styles.dotsContainer}>
              <ProgressDots total={Math.max(totalSteps - 2, 1)} current={Math.max(currentStep - 1, 0)} />
            </View>
          )}

          <Animated.Text style={[styles.heading, headingStyle]}>
            {heading}
          </Animated.Text>

          <Animated.Text style={[styles.subtext, subtextStyle]}>
            {subtext}
          </Animated.Text>

          {children && (
            <Animated.View style={[styles.contentArea, contentStyle]}>
              {children}
            </Animated.View>
          )}

          <View style={{ flex: 1, minHeight: Spacing.xl }} />

          <Animated.View style={[styles.buttonArea, buttonsStyle]}>
            <TouchableOpacity
              style={[styles.primaryButton, primaryDisabled && styles.primaryButtonDisabled]}
              onPress={primaryOnPress}
              disabled={primaryDisabled}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
              accessibilityState={{ disabled: primaryDisabled }}
            >
              <LinearGradient
                colors={primaryDisabled
                  ? [Colors.surfaceHighlight, Colors.surface]
                  : ['#3A9E8F', '#2B8C7E', '#258070']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryGradient}
              >
                <Text style={[styles.primaryText, primaryDisabled && styles.primaryTextDisabled]}>
                  {primaryLabel}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {secondaryLabel && secondaryOnPress && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={secondaryOnPress}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={secondaryLabel}
              >
                <Text style={styles.secondaryText}>{secondaryLabel}</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  glowGolden: {
    position: 'absolute',
    top: -80,
    left: -60,
    width: 300,
    height: 300,
    borderRadius: 150,
    overflow: 'hidden',
  },
  glowPurple: {
    position: 'absolute',
    bottom: -40,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    overflow: 'hidden',
  },
  glowRose: {
    position: 'absolute',
    top: 60,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    overflow: 'hidden',
  },
  midGlow: {
    position: 'absolute',
    top: 200,
    right: -100,
    width: 280,
    height: 240,
    borderRadius: BorderRadius.full,
    opacity: 0.2,
  },
  backButton: {
    position: 'absolute',
    left: Spacing.lg,
    zIndex: 10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  illustrationArea: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    marginBottom: Spacing.md,
  },
  dotsContainer: {
    marginBottom: Spacing.lg,
  },
  heading: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    lineHeight: 34,
    marginBottom: Spacing.sm,
  },
  subtext: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 24,
    marginBottom: Spacing.lg,
  },
  contentArea: {
    gap: Spacing.md,
  },
  buttonArea: {
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },
  primaryButton: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#3A9E8F',
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  primaryButtonDisabled: {
    ...Platform.select({
      ios: {
        shadowOpacity: 0,
      },
      android: {
        elevation: 0,
      },
      default: {},
    }),
  },
  primaryGradient: {
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  primaryText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    letterSpacing: 0.3,
  },
  primaryTextDisabled: {
    color: Colors.textMuted,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
  },
});
