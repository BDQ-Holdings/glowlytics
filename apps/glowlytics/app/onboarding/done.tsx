import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useStore } from '../../src/store/useStore';
import { trackEvent } from '../../src/services/analytics';
import { BorderRadius, FontFamily, FontSize, Glow, Spacing } from '../../src/constants/theme';
import { GlowIcon } from '../../src/components/glow/GlowIcons';
import { BreathingGlow } from '../../src/components/glow/GlowPrimitives';

const OUT_CUBIC = Easing.bezier(...Glow.motion.easingOutCubic);

/** "HH:MM" (24h) → "7:30 AM". Returns null for missing/invalid input. */
function formatReminderTime(time: string | null | undefined): string | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2];
  if (hour > 23) return null;
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${meridiem}`;
}

/**
 * Onboarding end-card (hand-off S14) — the "Welcome home" beat. Owns the
 * actual onboarding completion so every path (paywall purchase, restore,
 * decline) funnels through one place.
 */
export default function Done() {
  const P = Glow.palette;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const preferredName = useStore((s) => s.preferredName);
  const updateUser = useStore((s) => s.updateUser);
  const reduceMotion = useStore((s) => s.appearance.reduceMotion);
  const notificationTime = useStore((s) => s.notificationSettings.notification_time);

  const timeLabel = formatReminderTime(notificationTime);

  const heroOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const heroRise = useSharedValue(reduceMotion ? 0 : 16);
  const ctaOpacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    heroOpacity.value = withTiming(1, { duration: 700, easing: OUT_CUBIC });
    heroRise.value = withTiming(0, { duration: 700, easing: OUT_CUBIC });
    ctaOpacity.value = withDelay(
      Glow.motion.stagger[3],
      withTiming(1, { duration: 500, easing: OUT_CUBIC }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ translateY: heroRise.value }],
  }));
  const ctaStyle = useAnimatedStyle(() => ({ opacity: ctaOpacity.value }));

  const handleOpen = () => {
    trackEvent('onboarding_completed');
    updateUser({ onboarding_complete: true });
    if (router.canDismiss()) router.dismissAll();
    router.replace('/(tabs)/today' as never);
  };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: P.bg,
          paddingTop: insets.top + Spacing.sm,
          paddingBottom: insets.bottom + Spacing.md,
        },
      ]}
    >
      <View pointerEvents="none" style={styles.haloArea}>
        <BreathingGlow color={P.glow} size={420} />
      </View>

      <Animated.View style={[styles.hero, heroStyle]}>
        <View style={[styles.checkBubble, { backgroundColor: P.accent }]}>
          <GlowIcon name="check" size={28} color={P.surface} stroke={2.2} />
        </View>

        <Text style={[styles.headline, { color: P.ink }]}>
          {'Welcome,\n'}
          {preferredName || 'friend'}.
        </Text>

        <Text style={[styles.body, { color: P.muted }]}>
          {timeLabel ? (
            <>
              Tomorrow at <Text style={[styles.bodyEm, { color: P.ink }]}>{timeLabel}</Text>, we'll
              check in again. No homework between now and then.
            </>
          ) : (
            <>
              Tomorrow morning, we'll check in again. No homework between now and then.
            </>
          )}
        </Text>

        {timeLabel && (
          <View
            style={[styles.chip, { backgroundColor: P.surface, borderColor: P.glow }]}
          >
            <GlowIcon name="bell" size={13} color={P.accent} stroke={1.7} />
            <Text style={[styles.chipText, { color: P.ink }]}>Tomorrow · {timeLabel}</Text>
          </View>
        )}
      </Animated.View>

      <Animated.View style={[styles.footer, ctaStyle]}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: P.ink }]}
          onPress={handleOpen}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel="Open Glowlytics"
        >
          <Text style={[styles.primaryText, { color: P.surface }]}>Open Glowlytics</Text>
          <GlowIcon name="arrow" size={18} color={P.surface} stroke={1.7} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  haloArea: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 160,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  checkBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  headline: {
    fontFamily: FontFamily.serifItalic,
    fontSize: 46,
    lineHeight: 50,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  body: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 280,
    marginTop: Spacing.md + 2,
  },
  bodyEm: {
    fontFamily: FontFamily.serifItalic,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    marginTop: 28,
  },
  chipText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 12,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  primaryButton: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
    paddingVertical: 16,
    minHeight: 56,
  },
  primaryText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    letterSpacing: 0.3,
  },
});
