/**
 * HarmonyScoreReveal — composite Harmony score numeric reveal.
 *
 * Mirrors the breathing-ring pattern from `app/scan/results.tsx:129` so the
 * skin and bone-structure score reveals feel like siblings.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { harmonyStatusLabel, HARMONY_ACCENT } from '../constants/boneStructure';
import { Colors, FontFamily, FontSize, Glow, Spacing } from '../constants/theme';

const BREATHE_EASING = Easing.inOut(Easing.ease);

interface Props {
  score: number | null;
  caption?: string;
}

// Cubic-out easing — fast start, soft land.  Reads as confident rather than
// jittery (linear) or hesitant (cubic-in).
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export const HarmonyScoreReveal: React.FC<Props> = ({ score, caption }) => {
  const breathe = useSharedValue(1);

  useEffect(() => {
    breathe.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1.07, { duration: 600, easing: BREATHE_EASING }),
          withTiming(0.93, { duration: 1100, easing: BREATHE_EASING }),
          withTiming(1, { duration: 500, easing: BREATHE_EASING }),
        ),
        -1,
      ),
    );
  }, []);

  // Numeric tween: count up from 0 → final score over ~750ms. Bound to the
  // displayed Text via React state since SVG doesn't render Reanimated style.
  const [displayed, setDisplayed] = useState<number | null>(score == null ? null : 0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (score == null) {
      setDisplayed(null);
      return;
    }
    const duration = 750;
    const start = score === 0 ? 0 : 0;  // always animate from 0 on first arrival
    startedAt.current = Date.now();
    setDisplayed(start);
    let raf = 0;
    const step = () => {
      const elapsed = Date.now() - (startedAt.current ?? Date.now());
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      setDisplayed(Math.round(start + (score - start) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const outerStyle = useAnimatedStyle(() => {
    const t = (breathe.value - 0.93) / 0.14;
    return { transform: [{ scale: breathe.value }], opacity: 0.25 + t * 0.3 };
  });

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + (breathe.value - 1) * 0.25 }],
    opacity: 0.7,
  }));

  const status = harmonyStatusLabel(score);

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.glowOuter, outerStyle]} />
      <Animated.View style={[styles.glowInner, innerStyle]} />
      <Animated.View entering={ZoomIn.duration(550)} style={styles.center}>
        <Text style={styles.bigScore}>{displayed == null ? '—' : displayed}</Text>
        <Animated.View entering={FadeInUp.duration(450).delay(300)}>
          <Text style={styles.status}>{status}</Text>
        </Animated.View>
        {caption ? (
          <Animated.View entering={FadeInUp.duration(450).delay(500)}>
            <Text style={styles.caption}>{caption}</Text>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  glowOuter: {
    position: 'absolute',
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: HARMONY_ACCENT + '14',
  },
  glowInner: {
    position: 'absolute',
    width: 150, height: 150, borderRadius: 75,
    backgroundColor: HARMONY_ACCENT + '22',
  },
  center: { alignItems: 'center' },
  bigScore: {
    color: HARMONY_ACCENT,
    fontFamily: FontFamily.sansBold,
    fontSize: 96,
    lineHeight: 100,
    letterSpacing: -3,
  },
  status: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    marginTop: Spacing.xs,
  },
  caption: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    marginTop: Spacing.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
});
