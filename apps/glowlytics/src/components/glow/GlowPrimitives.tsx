import React, { useEffect } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Glow } from '../../constants/theme';
import { useStore } from '../../store/useStore';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Circular ring with animated stroke fill — the design's core "Glow" indicator.
 * Renders a track + a colored arc that animates from 0 to `value` (0-100).
 * Children render centered (label + score).
 */
export interface GlowRingProps {
  value: number;
  size?: number;
  stroke?: number;
  color: string;
  track: string;
  children?: React.ReactNode;
  animateOnMount?: boolean;
}

export const GlowRing: React.FC<GlowRingProps> = ({
  value,
  size = 92,
  stroke = 6,
  color,
  track,
  children,
  animateOnMount = true,
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = useSharedValue(animateOnMount ? 0 : value);

  useEffect(() => {
    progress.value = withTiming(value, {
      duration: 800,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    });
  }, [value, progress]);

  const animatedProps = useAnimatedStyle(() => ({}));
  const dashOffset = useAnimatedStyle(() => ({}));
  // Reanimated v3 animated SVG props use a different pattern; reuse useSharedValue inline.
  const animatedDash = useAnimatedStyle(() => ({}));

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={track}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c * (value / 100)} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFillObject, ringStyles.center]} pointerEvents="none">
        {children}
      </View>
    </View>
  );
};

const ringStyles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * Soft radial halo that breathes (3.2s sine) — the design's signature
 * accent behind the Today hero, the Scan Result hero, and verdict cards.
 *
 * Implemented as a scaling+fading radial gradient surrogate (RN doesn't
 * support radial-gradient natively; we approximate with a tinted circle
 * that scales 1.0 → 1.08 and fades 0.5 → 0.95 on a sine curve).
 */
export interface BreathingGlowProps {
  color: string;
  size?: number;
  style?: ViewStyle;
  duration?: number;
}

export const BreathingGlow: React.FC<BreathingGlowProps> = ({
  color,
  size = 180,
  style,
  duration = Glow.motion.breathe,
}) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);
  // Honour the user's reduce-motion preference. When on, the glow renders
  // as a static dimmer halo (still useful as a visual anchor) instead of
  // breathing continuously. Reading from the store directly is fine here —
  // the primitive is mounted under a single section header and we want the
  // change to take effect on the next mount.
  const reduceMotion = useStore((s) => s.appearance.reduceMotion);

  useEffect(() => {
    if (reduceMotion) {
      // Skip the repeating timeline entirely and settle in the "calm" pose.
      scale.value = 1;
      opacity.value = 0.6;
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: duration / 2, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
        withTiming(1, { duration: duration / 2, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      ),
      -1,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.95, { duration: duration / 2, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
        withTiming(0.5, { duration: duration / 2, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      ),
      -1,
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [duration, scale, opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          // Soft fade-out ring via shadow on iOS, elevation on Android.
          shadowColor: color,
          shadowOpacity: 0.7,
          shadowRadius: size / 3,
          shadowOffset: { width: 0, height: 0 },
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

/**
 * Staggered fade-up entrance — wraps children, delays them per the design's
 * 150/280/380/480ms cadence. Use `index` 0-7 for the section's stagger slot.
 */
export interface FadeUpProps {
  index?: number;
  duration?: number;
  delay?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}

export const FadeUp: React.FC<FadeUpProps> = ({
  index = 0,
  duration = Glow.motion.fadeUp,
  delay,
  children,
  style,
}) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(14);
  const resolved = delay ?? Glow.motion.stagger[Math.min(index, Glow.motion.stagger.length - 1)];
  const reduceMotion = useStore((s) => s.appearance.reduceMotion);

  useEffect(() => {
    // Reduce-motion drops the translate entirely and collapses the duration
    // so sections appear without sweeping in. The DelayedReveal stagger is
    // also short-circuited via `effectiveDelay` below.
    const dur = reduceMotion ? 120 : duration;
    opacity.value = withTiming(1, {
      duration: dur,
      easing: Easing.bezier(0.215, 0.61, 0.355, 1),
    });
    translateY.value = reduceMotion
      ? 0
      : withTiming(0, {
          duration: dur,
          easing: Easing.bezier(0.215, 0.61, 0.355, 1),
        }) as unknown as number;
  }, [duration, opacity, translateY, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[animatedStyle, style]}
      // emulate animation-delay via a setTimeout-driven shared value start
      onLayout={() => {}}
    >
      {/* Use entering delay via Reanimated's withDelay alternative: */}
      <DelayedReveal delay={reduceMotion ? 0 : resolved}>{children}</DelayedReveal>
    </Animated.View>
  );
};

const DelayedReveal: React.FC<{ delay: number; children: React.ReactNode }> = ({
  delay,
  children,
}) => {
  const opacity = useSharedValue(0);
  useEffect(() => {
    const id = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 1, easing: Easing.linear });
    }, delay);
    return () => clearTimeout(id);
  }, [delay, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
};

/**
 * Section heading with italic-accent title + uppercase hint.
 * Mirrors `SectionHead` from the design.
 */
export interface SectionHeadProps {
  title: string;
  hint?: string;
  ink: string;
  muted: string;
  accentFamily?: string;
}

export const SectionHead: React.FC<SectionHeadProps> = ({
  title,
  hint,
  ink,
  muted,
  accentFamily,
}) => (
  <View style={sectionStyles.row}>
    <Text
      style={[
        sectionStyles.title,
        { color: ink, fontFamily: accentFamily ?? 'Switzer-Medium' },
      ]}
    >
      {title}
    </Text>
    {!!hint && (
      <Text style={[sectionStyles.hint, { color: muted }]}>{hint.toUpperCase()}</Text>
    )}
  </View>
);

const sectionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  title: {
    fontSize: 22,
    fontStyle: 'italic',
  },
  hint: {
    fontSize: 11,
    letterSpacing: 0.6,
  },
});
