import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useStore } from '../../src/store/useStore';
import { buildOnboardingFlow } from '../../src/services/onboardingFlow';
import { trackEvent } from '../../src/services/analytics';
import { Glow, FontFamily } from '../../src/constants/theme';
import { GlowIcon } from '../../src/components/glow/GlowIcons';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';

/**
 * Staggered fade-up entrance — translateY 16 → 0 with a fade, out-cubic easing,
 * delayed per the Glow stagger cadence. Gated on the user's reduce-motion
 * preference: when reduced, the final resting state renders immediately. Local
 * to this bespoke cover (OnboardingTransition owns entrances elsewhere).
 */
function FadeUp({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useStore((s) => s.appearance?.reduceMotion);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 16);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    const delay = Glow.motion.stagger[Math.min(index, Glow.motion.stagger.length - 1)];
    const easing = Easing.out(Easing.cubic);
    opacity.value = withDelay(delay, withTiming(1, { duration: 600, easing }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 600, easing }));
  }, [reduceMotion, index, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

export default function Welcome() {
  const router = useRouter();
  const { userId } = useAuth();
  const insets = useSafeAreaInsets();
  const createUser = useStore((s) => s.createUser);
  const setOnboardingFlow = useStore((s) => s.setOnboardingFlow);
  const { advance } = useOnboardingNavigation();
  const P = Glow.palette;

  const handleStart = () => {
    trackEvent('onboarding_started');
    const existingUser = useStore.getState().user;
    if (!existingUser || (userId && existingUser.user_id && existingUser.user_id !== userId)) {
      createUser({ user_id: userId ?? undefined });
    }
    const flow = buildOnboardingFlow(
      existingUser?.sex,
      existingUser?.menstrual_status,
      existingUser?.health_connection?.cycle_detected,
    );
    setOnboardingFlow(flow);
    // Welcome IS flow[0]; hand off to the shared guarded advance() (double-tap
    // safe, writes indexOf(target)) instead of pushing by hand, so the stored
    // index can never disagree with the route.
    advance();
  };

  const handleSignIn = () => {
    router.push('/auth/sign-in');
  };

  return (
    <View style={[styles.root, { backgroundColor: P.bg }]}>
      {/* Soft glow halo, upper third — radial P.glow fading to transparent */}
      <View style={styles.haloWrap} pointerEvents="none">
        <Svg width={360} height={360}>
          <Defs>
            <RadialGradient id="welcomeGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={P.glow} stopOpacity={0.85} />
              <Stop offset="65%" stopColor={P.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={180} cy={180} r={180} fill="url(#welcomeGlow)" />
        </Svg>
      </View>

      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <FadeUp index={0}>
          <Text style={[styles.wordmark, { color: P.ink }]}>
            Glowl
            <Text style={{ color: P.accent }}>y</Text>
            tics
          </Text>
        </FadeUp>

        <View style={styles.heroBlock}>
          <FadeUp index={1}>
            <Text style={[styles.eyebrow, { color: P.muted }]}>welcome</Text>
          </FadeUp>
          <FadeUp index={2}>
            <Text style={[styles.headline, { color: P.ink }]}>
              {'Your skin,\nin your own\nwords.'}
            </Text>
          </FadeUp>
          <FadeUp index={3}>
            <Text style={[styles.body, { color: P.muted }]}>
              A glow companion that listens before it speaks. Six seconds a
              morning. No streaks-bait, no scoring you against strangers.
            </Text>
          </FadeUp>
        </View>

        <View style={styles.spacer} />

        <FadeUp index={4}>
          <TouchableOpacity
            style={[styles.beginBtn, { backgroundColor: P.ink }]}
            activeOpacity={0.86}
            onPress={handleStart}
            accessibilityRole="button"
            accessibilityLabel="Begin"
          >
            <Text style={[styles.beginLabel, { color: P.surface }]}>Begin</Text>
            <GlowIcon name="arrow" size={18} color={P.surface} stroke={1.7} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signInWrap}
            activeOpacity={0.7}
            onPress={handleSignIn}
            accessibilityRole="link"
            accessibilityLabel="Sign in"
          >
            <Text style={[styles.signInText, { color: P.muted }]}>
              Already on the inside?{' '}
              <Text style={[styles.signInLink, { color: P.ink }]}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </FadeUp>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  haloWrap: {
    position: 'absolute',
    top: '10%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
  },
  wordmark: {
    fontFamily: FontFamily.accent,
    fontSize: 30,
    letterSpacing: -0.5,
  },
  heroBlock: {
    marginTop: 72,
  },
  spacer: {
    flex: 1,
  },
  eyebrow: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  headline: {
    fontFamily: FontFamily.serifItalic,
    fontSize: 52,
    lineHeight: 55,
    letterSpacing: -0.5,
    marginTop: 10,
  },
  body: {
    fontFamily: FontFamily.sans,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 18,
    maxWidth: 300,
  },
  beginBtn: {
    width: '100%',
    borderRadius: 999,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  beginLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 15,
  },
  signInWrap: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 6,
  },
  signInText: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    textAlign: 'center',
  },
  signInLink: {
    fontFamily: FontFamily.sansSemiBold,
    textDecorationLine: 'underline',
  },
});
