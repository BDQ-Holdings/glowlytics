import { useEffect, useMemo } from 'react';
import {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  type SharedValue,
} from 'react-native-reanimated';

export const CALM_DURATION = 500;
export const CALM_EASING = Easing.out(Easing.cubic);
export const STAGGER_GAP = 120;

/**
 * Returns an array of animated styles that stagger-fade elements in.
 * Each element fades from opacity 0 to 1 and slides up from translateY offset.
 */
export function useStaggeredEntrance(
  itemCount: number,
  baseDelay = 0,
  staggerMs = STAGGER_GAP,
) {
  const opacities: SharedValue<number>[] = [];
  const translates: SharedValue<number>[] = [];

  for (let i = 0; i < itemCount; i++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    opacities.push(useSharedValue(0));
    // eslint-disable-next-line react-hooks/rules-of-hooks
    translates.push(useSharedValue(16));
  }

  useEffect(() => {
    for (let i = 0; i < itemCount; i++) {
      const delay = baseDelay + i * staggerMs;
      opacities[i].value = withDelay(
        delay,
        withTiming(1, { duration: CALM_DURATION, easing: CALM_EASING }),
      );
      translates[i].value = withDelay(
        delay,
        withTiming(0, { duration: CALM_DURATION, easing: CALM_EASING }),
      );
    }
  }, []);

  return useMemo(
    () =>
      opacities.map((opacity, i) => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        return useAnimatedStyle(() => ({
          opacity: opacity.value,
          transform: [{ translateY: translates[i].value }],
        }));
      }),
    [],
  );
}

/**
 * Returns a shake animation style and trigger function for error states.
 */
export function useShakeAnimation() {
  const translateX = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const trigger = () => {
    translateX.value = withSequence(
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 60 }),
      withTiming(-3, { duration: 60 }),
      withTiming(0, { duration: 80 }),
    );
  };

  return { style, trigger };
}

/**
 * Returns an animated style for a single calm fade-in + slide-up entrance.
 */
export function useCalmFadeIn(delay = 0) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: CALM_DURATION, easing: CALM_EASING }),
    );
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: CALM_DURATION, easing: CALM_EASING }),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return style;
}
