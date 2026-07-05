import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowIcon, type GlowIconName } from '../../src/components/glow/GlowIcons';
import { FadeUp } from '../../src/components/glow/GlowPrimitives';
import { ProgressDots } from '../../src/components/ProgressDots';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';
import { trackEvent } from '../../src/services/analytics';
import { Glow, FontFamily } from '../../src/constants/theme';
import { ONBOARDING_PROGRESS_DOT_COUNT } from '../../src/services/onboardingFlow';

const PILL_ICONS: GlowIconName[] = ['leaf', 'sun', 'sparkle', 'drop'];

export default function Preview() {
  const { advance, goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();
  const insets = useSafeAreaInsets();
  const P = Glow.palette;

  // Existing primary action — take the first read. Keeps its analytics event
  // and advances the flow (the capture flow itself lives outside onboarding).
  const handlePrimary = () => {
    trackEvent('onboarding_preview_continue');
    advance();
  };
  // Skip path — same destination, no "continue" event (the user opted out of
  // scanning now). Shown only while there is a next screen to move to.
  const handleSkip = () => {
    advance();
  };
  const skippable = onboardingFlowIndex < onboardingFlow.length - 1;

  const ctaShadow = Platform.select({
    ios: { shadowColor: P.accent2, shadowOpacity: 0.4, shadowRadius: 32, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 8 },
    default: {},
  });

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: P.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 },
      ]}
    >
      {/* Radial halo — soft accent2 bloom behind the hero. */}
      <View pointerEvents="none" style={styles.halo}>
        <Svg width={380} height={380} viewBox="0 0 380 380">
          <Defs>
            <RadialGradient id="scanHalo" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={P.accent2} stopOpacity={0.33} />
              <Stop offset="65%" stopColor={P.accent2} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={190} cy={190} r={190} fill="url(#scanHalo)" />
        </Svg>
      </View>

      {/* Header chrome — back + step dots + Later (when skippable). */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={goBack}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <GlowIcon name="back" size={18} color={P.ink} stroke={1.8} />
        </TouchableOpacity>
        <View style={styles.dotsWrap}>
          <ProgressDots total={ONBOARDING_PROGRESS_DOT_COUNT} current={Math.max(onboardingFlowIndex - 1, 0)} />
        </View>
        {skippable ? (
          <TouchableOpacity
            onPress={handleSkip}
            style={styles.laterBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Skip for later"
          >
            <Text style={[styles.laterText, { color: P.muted }]}>Later</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {/* Centered hero */}
      <View style={styles.center}>
        <FadeUp index={0}>
          <Text style={[styles.eyebrow, { color: P.muted }]}>nearly there</Text>
        </FadeUp>
        <FadeUp index={1}>
          <Text style={[styles.hero, { color: P.ink }]}>One first{'\n'}read.</Text>
        </FadeUp>
        <FadeUp index={2}>
          <Text style={[styles.body, { color: P.muted }]}>
            Soft natural light. Chin level. Three breaths. Six seconds. We'll do the rest.
          </Text>
        </FadeUp>
        <FadeUp index={3}>
          <View style={[styles.iconPill, { backgroundColor: P.surface, borderColor: P.glow }]}>
            {PILL_ICONS.map((n) => (
              <GlowIcon key={n} name={n} size={16} color={P.accent} stroke={1.5} />
            ))}
          </View>
        </FadeUp>
      </View>

      {/* Glow CTA (the scan "shutter" moment) + skip */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.glowCta, { backgroundColor: P.accent2 }, ctaShadow]}
          activeOpacity={0.86}
          onPress={handlePrimary}
          accessibilityRole="button"
          accessibilityLabel="Take your first read"
        >
          <GlowIcon name="camera" size={18} color={P.ink} stroke={1.7} />
          <Text style={[styles.glowCtaText, { color: P.ink }]}>Take your first read</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSkip}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Skip, I'll do it tomorrow"
        >
          <Text style={[styles.skipText, { color: P.muted }]}>Skip · I'll do it tomorrow</Text>
        </TouchableOpacity>
        <Text style={[styles.disclaimer, { color: P.muted }]}>
          Glowlytics provides wellness insights only and is not a medical device. It does not
          diagnose, treat, or prevent any condition. Consult a dermatologist for medical concerns.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  halo: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 4,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dotsWrap: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 36 },
  laterBtn: { minWidth: 36, height: 36, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 4 },
  laterText: { fontFamily: FontFamily.sans, fontSize: 13 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  eyebrow: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  hero: {
    fontFamily: FontFamily.serifItalic,
    fontSize: 52,
    lineHeight: 55,
    letterSpacing: -1,
    textAlign: 'center',
    marginTop: 14,
  },
  body: {
    fontFamily: FontFamily.sans,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 280,
    marginTop: 18,
  },
  iconPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 28,
  },
  footer: { paddingHorizontal: 24, paddingTop: 8 },
  glowCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 999,
    paddingVertical: 16,
  },
  glowCtaText: { fontFamily: FontFamily.sansSemiBold, fontSize: 15 },
  skipText: { fontFamily: FontFamily.sans, fontSize: 13, textAlign: 'center', marginTop: 12 },
  disclaimer: {
    fontFamily: FontFamily.sans,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    maxWidth: 320,
    alignSelf: 'center',
    marginTop: 12,
  },
});
