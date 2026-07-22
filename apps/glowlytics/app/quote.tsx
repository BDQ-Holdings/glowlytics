/**
 * Daily philosopher quote — first-of-day intro screen.
 *
 * Mounted once per local day by `DailyQuoteRouter` in `app/_layout.tsx`.
 * A calm dusk canvas (`P.bg`) with a soft breathing halo, the quote set in
 * Instrument Serif italic — the design system's editorial voice — a small
 * uppercase attribution eyebrow, and two quiet affordances bottom-right:
 * share + advance.
 *
 * Design intent (per `design.md` — the Glow "dusk" language the whole app now
 * uses):
 *   - editorial serif-italic headline, ink on a warm-light ground
 *   - staggered fade-in (quote -> attribution -> controls), reduce-motion gated
 *   - share icon button + an ink advance pill to move on to the home page
 *   - first open of every day
 *
 * The screen does NOT attempt to be a brand splash — the SplashScreen in
 * `app/_layout.tsx` handles the load gate while Clerk + the persisted store
 * hydrate. This screen runs AFTER hydration so the quote is the first piece of
 * UI the user touches.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import { Pressable, Share, StyleSheet, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useStore } from '../src/store/useStore';
import { trackEvent } from '../src/services/analytics';
import { resolveColorMode } from '../src/services/appearance';
import { todaysQuote } from '../src/data/dailyQuotes';
import { Glow, FontFamily, BorderRadius, Spacing } from '../src/constants/theme';
import { BreathingGlow } from '../src/components/glow/GlowPrimitives';
import { GlowIcon } from '../src/components/glow/GlowIcons';

// Tuned so the user reads the quote naturally before reaching for a control.
// The quote arrives at ~600ms, the attribution at ~1.2s, the controls at ~1.8s.
// On exit we fade the lot in 240ms so the next screen's first frame is fresh.
const TIMING = {
  quoteIn: 700,
  quoteInDelay: 200,
  authorIn: 500,
  authorInDelay: 1100,
  controlsIn: 400,
  controlsInDelay: 1800,
  exit: 240,
};

export default function DailyQuoteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const markDailyQuoteSeen = useStore((s) => s.markDailyQuoteSeen);
  const reduceMotion = useStore((s) => s.appearance.reduceMotion);
  // Status-bar glyphs must contrast the resolved ground: a dark palette needs
  // light icons or they vanish. Same gate the root Stack uses in _layout.tsx.
  const appearanceMode = useStore((s) => s.appearance.mode);
  const systemScheme = useColorScheme();

  // Read the live palette in render — module-level StyleSheet would bake the
  // load-time palette and miss palette/dark switches (see design.md §1).
  const P = Glow.palette;

  // Pin the quote at mount so the screen renders the same text across all
  // re-renders, even if the user's clock crosses midnight while reading.
  const quote = useMemo(() => todaysQuote(), []);

  // A quiet date overline grounds the "first open of the day" ritual. Pinned
  // at mount alongside the quote so it never shifts under the reader.
  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    [],
  );

  const quoteOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const authorOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const controlsOpacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    trackEvent('daily_quote_shown', { author: quote.author });
    if (reduceMotion) return;
    const ease = Easing.out(Easing.cubic);
    quoteOpacity.value = withDelay(
      TIMING.quoteInDelay,
      withTiming(1, { duration: TIMING.quoteIn, easing: ease }),
    );
    authorOpacity.value = withDelay(
      TIMING.authorInDelay,
      withTiming(1, { duration: TIMING.authorIn, easing: ease }),
    );
    controlsOpacity.value = withDelay(
      TIMING.controlsInDelay,
      withTiming(1, { duration: TIMING.controlsIn, easing: ease }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateToHome = () => {
    router.replace('/(tabs)/today');
  };

  const dismiss = useCallback(() => {
    // Persist the date BEFORE animating out — if the user backgrounds the app
    // mid-fade, the gate stays closed for the rest of the day.
    markDailyQuoteSeen();
    trackEvent('daily_quote_dismissed', { author: quote.author });
    if (reduceMotion) {
      // No fade to wait on — hand off to home immediately.
      navigateToHome();
      return;
    }
    const ease = Easing.in(Easing.cubic);
    quoteOpacity.value = withTiming(0, { duration: TIMING.exit, easing: ease });
    authorOpacity.value = withTiming(0, { duration: TIMING.exit, easing: ease });
    controlsOpacity.value = withTiming(0, { duration: TIMING.exit, easing: ease }, (done) => {
      if (done) runOnJS(navigateToHome)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markDailyQuoteSeen, quote.author, reduceMotion]);

  const handleShare = useCallback(async () => {
    trackEvent('daily_quote_shared', { author: quote.author });
    void Haptics.selectionAsync().catch(() => {});
    try {
      // Identical share payload across platforms — title/message both filled
      // because iOS surfaces `message`, Android Intent uses `title`.
      await Share.share({
        title: `${quote.author}`,
        message: `"${quote.text}"\n— ${quote.author}\n\nvia Glowlytics`,
      });
    } catch {
      // User cancelled the sheet, or no Share UI available. Either way nothing
      // to do — the quote stays on screen and the user can advance manually.
    }
  }, [quote.author, quote.text]);

  const handleAdvance = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    dismiss();
  }, [dismiss]);

  const quoteStyle = useAnimatedStyle(() => ({ opacity: quoteOpacity.value }));
  const authorStyle = useAnimatedStyle(() => ({ opacity: authorOpacity.value }));
  const controlsStyle = useAnimatedStyle(() => ({ opacity: controlsOpacity.value }));

  return (
    <View style={[styles.root, { backgroundColor: P.bg }]}>
      <StatusBar style={resolveColorMode(appearanceMode, systemScheme) === 'dark' ? 'light' : 'dark'} />

      {/* Soft breathing halo behind the quote (reduce-motion gated internally). */}
      <View style={styles.haloWrap} pointerEvents="none">
        <BreathingGlow color={P.glow} size={360} />
      </View>

      <View style={styles.center}>
        <Animated.Text style={[styles.eyebrow, styles.overline, { color: P.muted }, quoteStyle]}>
          {dateLabel}
        </Animated.Text>
        <Animated.Text
          style={[styles.quote, { color: P.ink }, quoteStyle]}
          accessibilityRole="text"
          accessibilityLabel={`Quote: ${quote.text}, by ${quote.author}`}
        >
          {`\u201C${quote.text}\u201D`}
        </Animated.Text>
        <Animated.Text style={[styles.eyebrow, styles.author, { color: P.muted }, authorStyle]}>
          {`\u2014 ${quote.author}`}
        </Animated.Text>
      </View>

      <Animated.View
        style={[
          styles.controls,
          { right: Spacing.lg, bottom: insets.bottom + Spacing.lg },
          controlsStyle,
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handleShare}
          hitSlop={16}
          style={({ pressed }) => [
            styles.control,
            styles.sharePill,
            { backgroundColor: P.surface, borderColor: P.glow },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Share quote"
        >
          <GlowIcon name="share" size={20} color={P.ink} />
        </Pressable>
        <Pressable
          onPress={handleAdvance}
          hitSlop={16}
          style={({ pressed }) => [
            styles.control,
            { backgroundColor: P.ink },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Continue to home"
        >
          <GlowIcon name="arrow" size={20} color={P.surface} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  haloWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  quote: {
    fontFamily: FontFamily.serifItalic,
    fontSize: 32,
    lineHeight: 42,
    letterSpacing: -0.5,
    textAlign: 'center',
    maxWidth: 320,
  },
  eyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  overline: {
    marginBottom: Spacing.lg,
  },
  author: {
    marginTop: Spacing.lg,
  },
  controls: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  control: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharePill: {
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
