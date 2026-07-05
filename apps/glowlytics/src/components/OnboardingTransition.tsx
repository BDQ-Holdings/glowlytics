import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { FontFamily, FontSize, Glow, Spacing, BorderRadius } from '../constants/theme';
import { ProgressDots } from './ProgressDots';
import { ONBOARDING_PROGRESS_DOT_COUNT } from '../services/onboardingFlow';
import { GlowIcon } from './glow/GlowIcons';
import { BreathingGlow } from './glow/GlowPrimitives';
import { useStore } from '../store/useStore';

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
  /** Uppercase overline rendered above the heading. */
  eyebrow?: string;
  /** Renders a quiet Skip affordance in the header. */
  onSkip?: () => void;
  skipLabel?: string;
  /** Soft breathing `P.glow` halo behind the upper third. */
  halo?: boolean;
  /** Trailing arrow on the primary pill (default true — most CTAs advance). */
  showArrow?: boolean;
  /** Heading point size (serif italic). Default 34. */
  headingSize?: number;
}

const OUT_CUBIC = Easing.bezier(...Glow.motion.easingOutCubic);

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
  totalSteps,
  currentStep = 0,
  showBack = false,
  onBack,
  eyebrow,
  onSkip,
  skipLabel = 'Skip',
  halo = false,
  showArrow = true,
  headingSize = 34,
}) => {
  const insets = useSafeAreaInsets();
  const P = Glow.palette;
  const reduceMotion = useStore((s) => s.appearance.reduceMotion);

  // Staggered fade-up entrance per the hand-off cadence (0/150/280/380ms).
  const headingOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const headingRise = useSharedValue(reduceMotion ? 0 : 16);
  const subtextOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const subtextRise = useSharedValue(reduceMotion ? 0 : 14);
  const contentOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const contentRise = useSharedValue(reduceMotion ? 0 : 12);
  const buttonsOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const buttonsRise = useSharedValue(reduceMotion ? 0 : 12);

  useEffect(() => {
    if (reduceMotion) return;
    const rise = (v: SharedValue<number>, delay: number, duration: number) => {
      v.value = withDelay(delay, withTiming(0, { duration, easing: OUT_CUBIC }));
    };
    const fade = (v: SharedValue<number>, delay: number, duration: number) => {
      v.value = withDelay(delay, withTiming(1, { duration, easing: OUT_CUBIC }));
    };
    fade(headingOpacity, Glow.motion.stagger[0], 600);
    rise(headingRise, Glow.motion.stagger[0], 600);
    fade(subtextOpacity, Glow.motion.stagger[1], 550);
    rise(subtextRise, Glow.motion.stagger[1], 550);
    fade(contentOpacity, Glow.motion.stagger[2], 500);
    rise(contentRise, Glow.motion.stagger[2], 500);
    fade(buttonsOpacity, Glow.motion.stagger[3], 500);
    rise(buttonsRise, Glow.motion.stagger[3], 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const headingStyle = useAnimatedStyle(() => ({
    opacity: headingOpacity.value,
    transform: [{ translateY: headingRise.value }],
  }));
  const subtextStyle = useAnimatedStyle(() => ({
    opacity: subtextOpacity.value,
    transform: [{ translateY: subtextRise.value }],
  }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentRise.value }],
  }));
  const buttonsStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsRise.value }],
  }));

  return (
    <View style={[styles.root, { backgroundColor: P.bg, paddingTop: insets.top + Spacing.sm }]}>
      {halo && (
        <View pointerEvents="none" style={styles.haloArea}>
          <BreathingGlow color={P.glow} size={360} />
        </View>
      )}

      {/* Header — back chevron · step dots · skip */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          disabled={!showBack || !onBack}
          style={[styles.backButton, { opacity: showBack && onBack ? 1 : 0 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M15 5 L8 12 L15 19"
              stroke={P.ink}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </TouchableOpacity>

        {showProgress ? (
          <ProgressDots
            // Stable denominator: the longest possible path minus welcome /
            // paywall / done, so dots never grow when later answers add
            // cycle screens. `totalSteps` is accepted for API compat but the
            // quiet step dots always use the flow-wide constant.
            total={ONBOARDING_PROGRESS_DOT_COUNT}
            current={Math.max(currentStep - 1, 0)}
          />
        ) : (
          <View />
        )}

        <TouchableOpacity
          onPress={onSkip}
          disabled={!onSkip}
          style={[styles.skipButton, { opacity: onSkip ? 1 : 0 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={skipLabel}
          accessibilityRole="button"
        >
          <Text style={[styles.skipText, { color: P.muted }]}>{skipLabel}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.md }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {illustration && (
            <Animated.View style={[styles.illustrationArea, headingStyle]}>
              {illustration}
            </Animated.View>
          )}

          <Animated.View style={[styles.headingBlock, headingStyle]}>
            {eyebrow != null && (
              <Text style={[styles.eyebrow, { color: P.muted }]}>{eyebrow}</Text>
            )}
            <Text
              style={[
                styles.heading,
                {
                  color: P.ink,
                  fontSize: headingSize,
                  lineHeight: Math.round(headingSize * 1.12),
                },
              ]}
            >
              {heading}
            </Text>
          </Animated.View>

          {subtext !== '' && (
            <Animated.Text style={[styles.subtext, { color: P.muted }, subtextStyle]}>
              {subtext}
            </Animated.Text>
          )}

          {children && (
            <Animated.View style={[styles.contentArea, contentStyle]}>{children}</Animated.View>
          )}

          <View style={{ flex: 1, minHeight: Spacing.lg }} />

          <Animated.View style={buttonsStyle}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: primaryDisabled ? P.glow + '55' : P.ink },
              ]}
              onPress={primaryOnPress}
              disabled={primaryDisabled}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
              accessibilityState={{ disabled: primaryDisabled }}
            >
              <Text
                style={[
                  styles.primaryText,
                  { color: primaryDisabled ? P.muted : P.surface },
                ]}
              >
                {primaryLabel}
              </Text>
              {showArrow && !primaryDisabled && (
                <GlowIcon name="arrow" size={18} color={P.surface} stroke={1.7} />
              )}
            </TouchableOpacity>

            {secondaryLabel && secondaryOnPress && (
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: P.glow }]}
                onPress={secondaryOnPress}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={secondaryLabel}
              >
                <Text style={[styles.secondaryText, { color: P.ink }]}>{secondaryLabel}</Text>
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
  },
  haloArea: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    paddingTop: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
    paddingBottom: 4,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  skipText: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  illustrationArea: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headingBlock: {
    paddingHorizontal: Spacing.xs,
  },
  eyebrow: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  heading: {
    fontFamily: FontFamily.serifItalic,
    letterSpacing: -0.5,
  },
  subtext: {
    fontFamily: FontFamily.sans,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    paddingHorizontal: Spacing.xs,
  },
  contentArea: {
    marginTop: Spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
    paddingVertical: 16,
    minHeight: 56,
  },
  primaryText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    letterSpacing: 0.3,
  },
  secondaryButton: {
    marginTop: Spacing.sm + Spacing.xs,
    borderWidth: 1.5,
    borderRadius: BorderRadius.full,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 14,
    letterSpacing: 0.2,
  },
});
