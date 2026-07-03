import React, { useEffect } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Button } from '../../src/components/Button';
import { FadeUp, BreathingGlow } from '../../src/components/glow/GlowPrimitives';
import { PRIVACY_POLICY_URL } from '../../src/constants/externalLinks';
import { BorderRadius, FontFamily, FontSize, Glow, Spacing } from '../../src/constants/theme';
import { useStore } from '../../src/store/useStore';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const DISCLOSURE_ITEMS = [
  'Scan photo, which may include your face.',
  'Skin scores, recent scan history, goals, or context.',
  'Apple Health summaries only if connected and relevant.',
];

const PROTECTION_ITEMS = [
  'Our secure backend prepares the request.',
  'OpenAI receives only what is needed for skin analysis.',
  'API data is not used for OpenAI model training under our agreement.',
];

export default function AiConsentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const P = Glow.palette;
  const reduceMotion = useStore((s) => s.appearance.reduceMotion);
  const setAiProcessingConsentGranted = useStore((s) => s.setAiProcessingConsentGranted);
  const pulseOpacity = useSharedValue(reduceMotion ? 0.16 : 0);

  useEffect(() => {
    if (reduceMotion) {
      pulseOpacity.value = 0.16;
      return;
    }

    pulseOpacity.value = 0;
    pulseOpacity.value = withDelay(
      Glow.motion.stagger[7] + 600,
      withSequence(
        withTiming(0.68, {
          duration: 450,
          easing: Easing.bezier(...Glow.motion.easingOutCubic),
        }),
        withTiming(0, {
          duration: 450,
          easing: Easing.bezier(...Glow.motion.easingOutCubic),
        }),
      ),
    );
  }, [pulseOpacity, reduceMotion]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const grantConsent = () => {
    setAiProcessingConsentGranted(true);
    router.replace('/scan/camera');
  };

  return (
    <View style={[styles.root, { backgroundColor: P.bg }]}>
      <LinearGradient
        colors={[P.surface, P.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.md,
            paddingBottom: insets.bottom + Spacing.md,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ConsentReveal reduceMotion={reduceMotion} delay={Glow.motion.stagger[0]} duration={500}>
          <View style={styles.iconStage}>
            <BreathingGlow color={P.glow} size={Spacing.xxl * 2} style={styles.heroHalo} />
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: P.surface,
                  borderColor: P.glow,
                },
              ]}
            >
              <Feather name="shield" size={24} color={P.accent} />
            </View>
          </View>
        </ConsentReveal>

        <ConsentReveal
          reduceMotion={reduceMotion}
          delay={Glow.motion.stagger[1]}
          duration={600}
          style={styles.heroCopy}
        >
          <Text style={[styles.eyebrow, { color: P.muted }]}>Before your scan</Text>
          <Text style={[styles.title, { color: P.ink }]}>Allow AI processing for this skin analysis?</Text>
          <Text style={[styles.lede, { color: P.muted }]}>
            To score your skin, Glowlytics shares your scan with our secure backend and OpenAI. Your call first.
          </Text>
        </ConsentReveal>

        <View style={styles.cardsGroup}>
          <ConsentReveal reduceMotion={reduceMotion} delay={380} duration={600}>
            <DisclosureCard
              icon="send"
              title="What we send"
              items={DISCLOSURE_ITEMS}
              palette={P}
            />
          </ConsentReveal>

          <ConsentReveal reduceMotion={reduceMotion} delay={530} duration={600}>
            <DisclosureCard
              icon="shield"
              title="How it is protected"
              items={PROTECTION_ITEMS}
              palette={P}
            />
          </ConsentReveal>

          <ConsentReveal reduceMotion={reduceMotion} delay={680} duration={600}>
            <View style={[styles.footnote, { borderTopColor: P.glow }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.smallIconChip, { backgroundColor: P.glow }]}>
                  <Feather name="x-circle" size={16} color={P.accent} />
                </View>
                <Text style={[styles.footnoteTitle, { color: P.ink }]}>If you do not allow</Text>
              </View>
              <Text style={[styles.footnoteText, { color: P.muted }]}>
                We will not start a scan that uploads personal scan data to OpenAI. You can review
                the privacy policy before deciding.
              </Text>
            </View>
          </ConsentReveal>
        </View>

        <ConsentReveal
          reduceMotion={reduceMotion}
          delay={Glow.motion.stagger[7]}
          duration={600}
          style={styles.actions}
        >
          <View style={styles.primaryAction}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ctaPulse,
                {
                  backgroundColor: P.glow,
                  shadowColor: P.accent,
                },
                pulseStyle,
              ]}
            />
            <Button title="I allow AI processing" onPress={grantConsent} size="lg" />
          </View>
          <Button title="Not now" onPress={() => router.back()} variant="ghost" size="md" />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Read privacy policy"
            hitSlop={Spacing.md}
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
            style={({ pressed }) => [styles.policyHitbox, pressed && styles.linkPressed]}
          >
            <Text
              style={[
                styles.policyLink,
                {
                  color: P.accent,
                  borderBottomColor: P.accent,
                },
              ]}
            >
              Read privacy policy
            </Text>
          </Pressable>
        </ConsentReveal>
      </ScrollView>
    </View>
  );
}

function ConsentReveal({
  reduceMotion,
  delay,
  duration,
  style,
  children,
}: {
  reduceMotion: boolean;
  delay: number;
  duration: number;
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  if (reduceMotion) {
    return <View style={style}>{children}</View>;
  }

  return (
    <FadeUp delay={delay} duration={duration} style={style}>
      {children}
    </FadeUp>
  );
}

function DisclosureCard({
  icon,
  title,
  items,
  palette,
}: {
  icon: FeatherName;
  title: string;
  items: string[];
  palette: typeof Glow.palette;
}) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.surface,
          borderColor: palette.glow,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.smallIconChip, { backgroundColor: palette.glow }]}>
          <Feather name={icon} size={16} color={palette.accent} />
        </View>
        <Text style={[styles.cardTitle, { color: palette.ink }]}>{title}</Text>
      </View>

      <View style={styles.bullets}>
        {items.map((item) => (
          <View key={item} style={styles.bulletRow}>
            <View style={[styles.bullet, { backgroundColor: palette.accent }]} />
            <Text style={[styles.bulletText, { color: palette.muted }]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  iconStage: {
    alignSelf: 'flex-start',
    width: Spacing.xxxl,
    height: Spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  heroHalo: {
    top: -Spacing.md,
    left: -Spacing.md,
  },
  iconWrap: {
    width: Spacing.xxl,
    height: Spacing.xxl,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroCopy: {
    marginBottom: Spacing.xl,
  },
  eyebrow: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  title: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    lineHeight: 34,
    marginBottom: Spacing.md,
  },
  lede: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  cardsGroup: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  smallIconChip: {
    width: Spacing.xl,
    height: Spacing.xl,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  bullets: {
    gap: Spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  bullet: {
    width: Spacing.xs,
    height: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  bulletText: {
    flex: 1,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  footnote: {
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footnoteTitle: {
    flex: 1,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  footnoteText: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  actions: {
    gap: Spacing.sm,
  },
  primaryAction: {
    position: 'relative',
  },
  ctaPulse: {
    position: 'absolute',
    top: -Spacing.sm,
    right: -Spacing.sm,
    bottom: -Spacing.sm,
    left: -Spacing.sm,
    borderRadius: BorderRadius.full,
    shadowOpacity: 0.5,
    shadowRadius: Spacing.lg,
    shadowOffset: { width: 0, height: Spacing.sm },
    elevation: 6,
  },
  policyHitbox: {
    alignSelf: 'center',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  policyLink: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    paddingBottom: Spacing.xxs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  linkPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
});
