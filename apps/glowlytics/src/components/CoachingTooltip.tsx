import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Colors, FontFamily, FontSize, BorderRadius, Spacing } from '../constants/theme';

const STORAGE_KEY = 'coaching_camera_shown';

interface Props {
  visible: boolean;
}

export const CoachingTooltip: React.FC<Props> = ({ visible }) => {
  const [shouldShow, setShouldShow] = useState(false);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    (async () => {
      const shown = await AsyncStorage.getItem(STORAGE_KEY);
      if (shown || cancelled) return;

      setShouldShow(true);
      opacity.value = withDelay(500, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
      translateY.value = withDelay(500, withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }));

      timerRef.current = setTimeout(() => {
        if (!cancelled) dismiss();
      }, 5000);
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  const dismiss = () => {
    opacity.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(8, { duration: 200 });
    const t = setTimeout(() => setShouldShow(false), 200);
    timerRef.current = t;
    AsyncStorage.setItem(STORAGE_KEY, 'true');
  };

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!shouldShow) return null;

  return (
    <Animated.View style={[styles.container, animStyle]}>
      <TouchableOpacity onPress={dismiss} activeOpacity={0.9}>
        <View style={styles.tooltip}>
          <View style={styles.arrow} />
          <Text style={styles.text}>Capture your baseline</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 105,
    alignSelf: 'center',
    zIndex: 10,
  },
  tooltip: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  arrow: {
    position: 'absolute',
    bottom: -6,
    width: 12,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.primary + '30',
    transform: [{ rotate: '45deg' }],
  },
  text: {
    color: Colors.primaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
});
