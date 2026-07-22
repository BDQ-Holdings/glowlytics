import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { useStore } from '../../src/store/useStore';
import { Glow, FontFamily } from '../../src/constants/theme';

/** The three-beat morning ritual — glyph is the first letter of one/two/three. */
const STEPS = [
  {
    key: 'notice',
    glyph: 'o',
    word: 'Notice',
    body: 'A six-second face read in soft window light.',
  },
  {
    key: 'name',
    glyph: 't',
    word: 'Name',
    body: 'We translate what we see into hydration, calm, even, firm.',
  },
  {
    key: 'nudge',
    glyph: 't',
    word: 'Nudge',
    body: "Tiny suggestions only when something's actually changing.",
  },
];

/**
 * Staggered fade-up entrance for each card — translateY 16 → 0 with a fade,
 * out-cubic easing, delayed per the Glow stagger cadence. Gated on the user's
 * reduce-motion preference: when reduced, the resting state renders at once.
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

export default function HowItWorks() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const P = Glow.palette;

  return (
    <OnboardingTransition
      eyebrow="How this works"
      heading={'Three small things,\nevery morning.'}
      headingSize={38}
      subtext=""
      primaryLabel="Continue"
      primaryOnPress={advance}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.cards}>
        {STEPS.map((s, i) => (
          <FadeUp
            key={s.key}
            index={i}
            style={i < STEPS.length - 1 ? styles.cardGap : undefined}
          >
            <View style={[styles.card, { backgroundColor: P.surface, borderColor: P.glow }]}>
              <View
                style={[
                  styles.glyphCircle,
                  { backgroundColor: i === 0 ? P.accent : P.bg },
                ]}
              >
                <Text style={[styles.glyph, { color: i === 0 ? P.surface : P.muted }]}>
                  {s.glyph}
                </Text>
              </View>
              <View style={styles.cardText}>
                <Text style={[styles.word, { color: P.ink }]}>{s.word}</Text>
                <Text style={[styles.cardBody, { color: P.muted }]}>{s.body}</Text>
              </View>
            </View>
          </FadeUp>
        ))}
      </View>
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  cards: {
    marginTop: 4,
  },
  cardGap: {
    marginBottom: 16,
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  glyphCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontFamily: FontFamily.serifItalic,
    fontSize: 16,
    lineHeight: 20,
  },
  cardText: {
    flex: 1,
  },
  word: {
    fontFamily: FontFamily.serifItalic,
    fontSize: 24,
    lineHeight: 26,
  },
  cardBody: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
});
