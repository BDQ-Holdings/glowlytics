/**
 * FocusFade — wraps a tab/screen so it fades in when it becomes focused and
 * fades out as it blurs. React Navigation's bottom tabs by default *instantly*
 * swap screens, which looks abrupt next to the rest of the app's motion
 * language. Wrapping the root view of each tab in `<FocusFade>` produces a
 * 220 ms cross-fade between siblings.
 *
 * Respects the user's `reduceMotion` preference (via the appearance store) by
 * snapping to full opacity instead of animating.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useStore } from '../store/useStore';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  /** ms — fade-in duration. Default 220 (matches Glow motion language). */
  duration?: number;
}

export function FocusFade({ children, style, duration = 220 }: Props) {
  const focused = useIsFocused();
  const reduceMotion = useStore((s) => s.appearance.reduceMotion);
  const opacity = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    cancelAnimation(opacity);
    if (reduceMotion) {
      opacity.value = focused ? 1 : 0;
      return;
    }
    opacity.value = withTiming(focused ? 1 : 0, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [focused, reduceMotion, duration, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.host, style, animatedStyle]}>
      <View style={styles.host}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
