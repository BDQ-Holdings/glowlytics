import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { BorderRadius, Colors, FontFamily, FontSize, Spacing } from '../../src/constants/theme';
import { useStore } from '../../src/store/useStore';
import { generateDefaultIndices } from '../../src/services/mockScanner';
import { imageToBase64 } from '../../src/services/visionAPI';
import { trackEvent } from '../../src/services/analytics';

const STATUS_MESSAGES = [
  'Preparing your scan...',
  'Encoding image data...',
];

const CALM_EASING = Easing.out(Easing.cubic);
const MIN_HOLD = 2000;

export default function ProcessingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ photoUri: string }>();
  const user = useStore((s) => s.user);
  const protocol = useStore((s) => s.protocol);
  const setPendingPhotoBase64 = useStore((s) => s.setPendingPhotoBase64);

  const [messageIndex, setMessageIndex] = useState(0);
  const hasStarted = useRef(false);

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.9);
  const glowPulse = useSharedValue(0.3);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 500, easing: CALM_EASING });
    logoScale.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.96, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 1500 }),
        withTiming(0.2, { duration: 1500 }),
      ),
      -1,
    );

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  // Prepare photo and navigate to analyzing
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const startTime = Date.now();

    (async () => {
      if (!user || !protocol) {
        router.replace('/(tabs)/today');
        return;
      }

      trackEvent('scan_photo_captured');
      const scannerData = generateDefaultIndices();

      if (params.photoUri) {
        try {
          const base64 = await imageToBase64(params.photoUri);
          setPendingPhotoBase64(base64);
        } catch {
          // Encoding failed — analysis will re-encode
        }
      }

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_HOLD - elapsed);

      setTimeout(() => {
        router.replace({
          pathname: '/scan/analyzing',
          params: {
            inflammation: String(scannerData.inflammation_index),
            pigmentation: String(scannerData.pigmentation_index),
            texture: String(scannerData.texture_index),
            photoUri: params.photoUri || '',
          },
        });
      }, remaining);
    })();
  }, []);

  const logoAnimStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const glowAnimStyle = useAnimatedStyle(() => ({
    opacity: glowPulse.value,
  }));

  return (
    <View style={styles.container}>
      {/* Same seamless gradient as analyzing screen */}
      <LinearGradient
        colors={[Colors.gradientStart, Colors.gradientEarly, Colors.gradientMid, Colors.gradientLate, Colors.gradientEnd]}
        locations={[0, 0.25, 0.45, 0.7, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle center glow */}
      <Animated.View style={[styles.bgGlow, glowAnimStyle]}>
        <LinearGradient
          colors={[Colors.glowPrimary, 'transparent']}
          start={{ x: 0.5, y: 0.3 }}
          end={{ x: 0.5, y: 0.8 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <View style={styles.content}>
        {/* Breathing logo placeholder — same size as analyzing ring */}
        <Animated.View style={[styles.logoCircle, logoAnimStyle]}>
          <View style={styles.logoInner}>
            <Text style={styles.logoLetter}>G</Text>
          </View>
        </Animated.View>

        {/* Rotating message */}
        <View style={styles.messageContainer}>
          <Animated.Text
            key={messageIndex}
            entering={FadeIn.duration(400)}
            exiting={FadeOut.duration(400)}
            style={styles.statusMessage}
          >
            {STATUS_MESSAGES[messageIndex]}
          </Animated.Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gradientStart,
  },
  bgGlow: {
    position: 'absolute',
    top: '25%',
    left: -50,
    right: -50,
    height: 300,
    borderRadius: BorderRadius.full,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: 'rgba(125, 231, 225, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  logoInner: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    fontSize: FontSize.hero,
    fontWeight: '700',
    color: 'rgba(125, 231, 225, 0.5)',
  },
  messageContainer: {
    height: 30,
    justifyContent: 'center',
  },
  statusMessage: {
    color: Colors.textOnDark,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.lg,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
