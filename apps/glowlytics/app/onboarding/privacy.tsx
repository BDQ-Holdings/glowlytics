import React, { useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { GlowIcon, type GlowIconName } from '../../src/components/glow/GlowIcons';
import { useStore } from '../../src/store/useStore';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { Glow, FontFamily } from '../../src/constants/theme';

// ---------------------------------------------------------------------------
// Promises — verbatim from handoff S07_Privacy
// ---------------------------------------------------------------------------

const PROMISES: { icon: GlowIconName; title: string; body: string }[] = [
  {
    icon: 'lock',
    title: 'On your device, not in the cloud',
    body: 'Your photos and scans never leave your phone unless you choose to back them up.',
  },
  {
    icon: 'shield',
    title: 'Never used for training',
    body: "We don't sell, share, or train models on your face. Ever.",
  },
  {
    icon: 'close',
    title: 'Delete in one tap',
    body: 'Every photo has a trash icon. So does your whole history.',
  },
];

// ---------------------------------------------------------------------------
// Rise — staggered fade-up entrance, gated on reduceMotion
// ---------------------------------------------------------------------------

function Rise({
  delay,
  reduceMotion,
  children,
}: {
  delay: number;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration: 600,
        easing: Easing.bezier(0.215, 0.61, 0.355, 1),
      }),
    );
  }, [reduceMotion, delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

// ---------------------------------------------------------------------------
// SCREEN 07 — Privacy & photos
// ---------------------------------------------------------------------------

export default function Privacy() {
  const P = Glow.palette;
  const router = useRouter();
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const reduceMotion = useStore((s) => s.appearance?.reduceMotion) ?? false;

  return (
    <OnboardingTransition
      eyebrow="before the camera"
      heading={'Your face stays\nyour face.'}
      subtext=""
      primaryLabel="I trust you"
      primaryOnPress={advance}
      showArrow={false}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.list}>
        {PROMISES.map((pr, i) => (
          <Rise key={pr.title} delay={Glow.motion.stagger[i] ?? 0} reduceMotion={reduceMotion}>
            <View style={styles.row}>
              <View
                style={[styles.iconTile, { backgroundColor: P.surface, borderColor: P.glow }]}
              >
                <GlowIcon name={pr.icon} size={16} color={P.accent} stroke={1.6} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: P.ink }]}>{pr.title}</Text>
                <Text style={[styles.rowBody, { color: P.muted }]}>{pr.body}</Text>
              </View>
            </View>
          </Rise>
        ))}

        <Rise delay={Glow.motion.stagger[3] ?? 380} reduceMotion={reduceMotion}>
          <TouchableOpacity
            activeOpacity={0.86}
            style={[styles.policyCard, { backgroundColor: P.surface, borderColor: P.glow }]}
            onPress={() => router.push('/privacy-policy')}
            accessibilityRole="link"
            accessibilityLabel="Read the full privacy policy"
          >
            <Text style={[styles.policyText, { color: P.muted }]}>
              {"Read the full policy — it's "}
              <Text style={[styles.policyEm, { color: P.ink }]}>two pages, in plain English</Text>.
            </Text>
          </TouchableOpacity>
        </Rise>
      </View>
    </OnboardingTransition>
  );
}

// ---------------------------------------------------------------------------
// Layout-only styles — every palette color is applied inline in render.
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  list: {
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  rowBody: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  policyCard: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  policyText: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    lineHeight: 18,
  },
  policyEm: {
    fontFamily: FontFamily.serifItalic,
    fontSize: 13,
  },
});
