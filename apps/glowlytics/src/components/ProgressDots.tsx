import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Glow } from '../constants/theme';
import { useStore } from '../store/useStore';

interface Props {
  total: number;
  current: number;
}

const DOT = 5;
const ACTIVE_WIDTH = 18;
const DURATION = 300;
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

const Dot: React.FC<{ active: boolean; past: boolean; reduceMotion: boolean }> = ({
  active,
  past,
  reduceMotion,
}) => {
  const P = Glow.palette;
  const width = useSharedValue(active ? ACTIVE_WIDTH : DOT);

  useEffect(() => {
    const target = active ? ACTIVE_WIDTH : DOT;
    width.value = reduceMotion
      ? target
      : withTiming(target, { duration: DURATION, easing: EASE });
  }, [active, reduceMotion, width]);

  const animatedStyle = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <Animated.View
      style={[
        styles.dot,
        animatedStyle,
        { backgroundColor: active || past ? P.accent : P.glow },
      ]}
    />
  );
};

/**
 * Quiet step indicator from the hand-off (`StepDots`): active step is an
 * 18×5 accent pill, past steps are 5×5 accent dots, future steps 5×5 glow.
 */
export const ProgressDots: React.FC<Props> = ({ total, current }) => {
  const reduceMotion = useStore((s) => s.appearance?.reduceMotion ?? false);

  return (
    <View style={styles.container}>
      {Array.from({ length: total }).map((_, i) => (
        <Dot key={i} active={i === current} past={i < current} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    height: DOT,
    borderRadius: 999,
  },
});
