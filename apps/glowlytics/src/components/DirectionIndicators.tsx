import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

type Direction = 'left' | 'right' | 'up' | 'down' | 'closer' | 'face_camera';

interface Props {
  directions: Direction[];
}

const DirectionArrow: React.FC<{ direction: Direction }> = ({ direction }) => {
  const opacity = useSharedValue(0.4);
  const translateValue = useSharedValue(0);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 600 }),
        withTiming(0.4, { duration: 600 }),
      ),
      -1,
    );

    const translateAmount = 6;
    if (direction === 'left' || direction === 'right') {
      translateValue.value = withRepeat(
        withSequence(
          withTiming(direction === 'left' ? -translateAmount : translateAmount, { duration: 600 }),
          withTiming(0, { duration: 600 }),
        ),
        -1,
      );
    } else if (direction === 'up' || direction === 'down' || direction === 'closer') {
      translateValue.value = withRepeat(
        withSequence(
          withTiming(direction === 'up' ? -translateAmount : translateAmount, { duration: 600 }),
          withTiming(0, { duration: 600 }),
        ),
        -1,
      );
    }
  }, [direction]);

  const getIconName = (): React.ComponentProps<typeof Feather>['name'] => {
    switch (direction) {
      case 'left': return 'chevron-left';
      case 'right': return 'chevron-right';
      case 'up': return 'chevron-up';
      case 'down': return 'chevron-down';
      case 'closer': return 'maximize-2';
      case 'face_camera': return 'eye';
    }
  };

  const getPosition = () => {
    switch (direction) {
      case 'left': return { left: 20, top: '45%' as any };
      case 'right': return { right: 20, top: '45%' as any };
      case 'up': return { top: 80, left: '45%' as any };
      case 'down': return { bottom: 160, left: '45%' as any };
      case 'closer': return { bottom: 200, left: '42%' as any };
      case 'face_camera': return { top: 120, left: '42%' as any };
    }
  };

  const isHorizontal = direction === 'left' || direction === 'right';

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: isHorizontal
      ? [{ translateX: translateValue.value }]
      : [{ translateY: translateValue.value }],
  }));

  return (
    <Animated.View style={[styles.arrow, getPosition(), animStyle]}>
      <Feather name={getIconName()} size={32} color={Colors.text} />
    </Animated.View>
  );
};

export const DirectionIndicators: React.FC<Props> = ({ directions }) => {
  if (directions.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {directions.map((dir) => (
        <DirectionArrow key={dir} direction={dir} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  arrow: {
    position: 'absolute',
  },
});
