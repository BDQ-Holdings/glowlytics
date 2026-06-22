/**
 * Daily philosopher quote — first-of-day intro screen.
 *
 * Mounted once per local day by `DailyQuoteRouter` in `app/_layout.tsx`.
 * Pure black background, quote text fading in, short attribution, two
 * affordances bottom-right: share + advance.
 *
 * Design intent (per product brief):
 *   - "simple quote ... written on on a black screen"
 *   - "fading in and out animations"
 *   - "share icon button on the bottom right with an arrow to the right of it
 *      to move on to the home page"
 *   - "first open of every day"
 *
 * The screen does NOT attempt to be a brand splash — the SplashScreen in
 * `app/_layout.tsx` (distilled in the same pass) handles the load gate while
 * Clerk + the persisted store hydrate. This screen runs AFTER hydration so
 * the quote is the first piece of UI the user touches.
 */
import React, { useCallback, useEffect, useMemo } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
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
import { todaysQuote } from '../src/data/dailyQuotes';

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

const SERIF_FONT = Platform.select({
  // iOS ships New York and Charter natively. Charter is the warmer pick for
  // body-length philosophical text; falls back to New York then system serif.
  ios: 'Charter',
  android: 'serif',
  default: 'serif',
});

export default function DailyQuoteScreen() {
  const router = useRouter();
  const markDailyQuoteSeen = useStore((s) => s.markDailyQuoteSeen);

  // Pin the quote at mount so the screen renders the same text across all
  // re-renders, even if the user's clock crosses midnight while reading.
  const quote = useMemo(() => todaysQuote(), []);

  const quoteOpacity = useSharedValue(0);
  const authorOpacity = useSharedValue(0);
  const controlsOpacity = useSharedValue(0);

  useEffect(() => {
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
    trackEvent('daily_quote_shown', { author: quote.author });
  }, []);

  const dismiss = useCallback(() => {
    // Persist the date BEFORE animating out — if the user backgrounds the app
    // mid-fade, the gate stays closed for the rest of the day.
    markDailyQuoteSeen();
    trackEvent('daily_quote_dismissed', { author: quote.author });
    const ease = Easing.in(Easing.cubic);
    quoteOpacity.value = withTiming(0, { duration: TIMING.exit, easing: ease });
    authorOpacity.value = withTiming(0, { duration: TIMING.exit, easing: ease });
    controlsOpacity.value = withTiming(0, { duration: TIMING.exit, easing: ease }, (done) => {
      if (done) runOnJS(navigateToHome)();
    });
  }, [markDailyQuoteSeen, quote.author]);

  const navigateToHome = () => {
    router.replace('/(tabs)/today' as any);
  };

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
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.center}>
        <Animated.Text
          style={[styles.quote, quoteStyle]}
          accessibilityRole="text"
          accessibilityLabel={`Quote: ${quote.text}, by ${quote.author}`}
        >
          {`\u201C${quote.text}\u201D`}
        </Animated.Text>
        <Animated.Text style={[styles.author, authorStyle]}>
          {`\u2014 ${quote.author}`}
        </Animated.Text>
      </View>
      <Animated.View style={[styles.controls, controlsStyle]} pointerEvents="box-none">
        <Pressable
          onPress={handleShare}
          hitSlop={16}
          style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}
          accessibilityRole="button"
          accessibilityLabel="Share quote"
        >
          <Feather name="share" size={20} color={QUOTE_COLOR} />
        </Pressable>
        <Pressable
          onPress={handleAdvance}
          hitSlop={16}
          style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}
          accessibilityRole="button"
          accessibilityLabel="Continue to home"
        >
          <Feather name="arrow-right" size={22} color={QUOTE_COLOR} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

// A few muted-white shades to avoid the harshness of pure white on pure black
// at the system brightness most users keep their phone at first thing in the
// morning. 0.92 reads as "white" but is gentler than #FFF.
const QUOTE_COLOR = 'rgba(255, 255, 255, 0.92)';
const AUTHOR_COLOR = 'rgba(255, 255, 255, 0.55)';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  quote: {
    fontFamily: SERIF_FONT,
    fontSize: 26,
    lineHeight: 36,
    color: QUOTE_COLOR,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  author: {
    marginTop: 28,
    fontFamily: SERIF_FONT,
    fontStyle: 'italic',
    fontSize: 15,
    color: AUTHOR_COLOR,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  controls: {
    position: 'absolute',
    right: 28,
    bottom: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  control: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlPressed: {
    opacity: 0.55,
  },
});
