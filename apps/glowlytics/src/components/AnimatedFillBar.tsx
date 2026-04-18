import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { BorderRadius, Colors } from '../constants/theme';

interface AnimatedFillBarProps {
  /** Score 0-100 — determines fill width as a percentage */
  score: number;
  /** Fill color */
  color: string;
  /** Delay in ms before the fill animation starts */
  delay: number;
  /** Bar height in px (default 6) */
  height?: number;
}

export function AnimatedFillBar({ score, color, delay, height = 6 }: AnimatedFillBarProps) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(
      delay,
      withTiming(Math.max(0, Math.min(score, 100)), {
        duration: 600,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [score]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
    backgroundColor: color,
  }));

  return (
    <View style={[styles.bg, { height }]}>
      <Animated.View style={[styles.fill, { height }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.surfaceHighlight,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: BorderRadius.xs,
  },
});
