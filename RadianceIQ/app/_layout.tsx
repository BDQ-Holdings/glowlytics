import 'react-native-get-random-values';
import React, { useEffect, useRef, useState } from 'react';
import { Stack, Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, Image, StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkProvider, ClerkLoaded, useAuth } from '@clerk/clerk-expo';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { tokenCache } from '../src/config/tokenCache';
import { env } from '../src/config/env';
import { Colors, FontFamily, FontSize, Spacing } from '../src/constants/theme';
import { useStore } from '../src/store/useStore';
import { setAuthTokenProvider } from '../src/services/api';
import { initRevenueCat, identifyUser, checkSubscriptionStatus, setupCustomerInfoListener } from '../src/services/subscription';
import { initAnalytics, identifyUser as identifyAnalyticsUser, trackEvent } from '../src/services/analytics';
// Lazy import — onnxruntime-react-native crashes in Expo Go
const initLesionDetection = () =>
  import('../src/services/onDeviceLesionDetection').then((m) => m.initLesionDetection());

const SPLASH_MIN_MS = 1500;

// ─── Splash Screen ───────────────────────────────────────────────
// Logo fade-in, then "Find your glow" in cursive revealed left-to-right
// with a teal ink glow.
const TAGLINE_WIDTH = 280;

function SplashScreen() {
  const logoOpacity = useSharedValue(0);
  const revealWidth = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    logoOpacity.value = withTiming(1, { duration: 600, easing: ease });
    revealWidth.value = withDelay(500, withTiming(TAGLINE_WIDTH, {
      duration: 900,
      easing: Easing.out(Easing.quad),
    }));
    glowOpacity.value = withDelay(800, withTiming(1, { duration: 500, easing: ease }));
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
  }));

  const revealStyle = useAnimatedStyle(() => ({
    width: revealWidth.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={splash.container}>
      <StatusBar style="dark" />
      <Animated.View style={logoStyle}>
        <Image
          source={require('../assets/logo-emblem.png')}
          style={splash.logo}
          resizeMode="contain"
        />
      </Animated.View>
      <View style={splash.taglineWrapper}>
        <Animated.View style={[splash.taglineReveal, revealStyle]}>
          <Animated.Text style={[splash.tagline, glowStyle]}>
            Find your glow
          </Animated.Text>
        </Animated.View>
      </View>
    </View>
  );
}

const splash = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 120,
    height: 120,
  },
  taglineWrapper: {
    marginTop: Spacing.xl,
    height: 44,
    width: TAGLINE_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taglineReveal: {
    overflow: 'hidden',
    height: 44,
    justifyContent: 'center',
  },
  tagline: {
    width: TAGLINE_WIDTH,
    fontFamily: 'DancingScript',
    fontSize: 32,
    color: Colors.primary,
    textAlign: 'center',
    textShadowColor: 'rgba(58, 158, 143, 0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});

// ─── Auth Redirector ─────────────────────────────────────────────
function AuthRedirector() {
  const { isSignedIn, isLoaded } = useAuth();
  const onboardingComplete = useStore((s) => s.user?.onboarding_complete ?? false);

  if (!isLoaded) {
    if (__DEV__) console.log('[AuthRedirector] Clerk not loaded yet');
    return null;
  }

  if (!isSignedIn) {
    if (__DEV__) console.log('[AuthRedirector] Not signed in → sign-in');
    return <Redirect href="/auth/sign-in" />;
  }

  if (!onboardingComplete) {
    const { onboardingFlow, onboardingFlowIndex } = useStore.getState();
    const resumeScreen = (onboardingFlowIndex > 0 && onboardingFlow.length > 0)
      ? onboardingFlow[onboardingFlowIndex] || 'welcome'
      : 'welcome';
    if (__DEV__) console.log(`[AuthRedirector] Onboarding incomplete → ${resumeScreen}`);
    return <Redirect href={`/onboarding/${resumeScreen}`} />;
  }

  if (__DEV__) console.log('[AuthRedirector] All good → tabs');
  return <Redirect href="/(tabs)/today" />;
}

// ─── Clerk-Gated App ─────────────────────────────────────────────
function ClerkGatedApp() {
  const { getToken, userId } = useAuth();
  const loadPersistedData = useStore((s) => s.loadPersistedData);
  const setSubscription = useStore((s) => s.setSubscription);
  const subscription = useStore((s) => s.subscription);
  const loaded = useRef(false);
  const listenerCleanup = useRef<() => void>(() => {});
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      setAuthTokenProvider(() => getToken());

      const initApp = async () => {
        await loadPersistedData();

        try {
          if (__DEV__) console.log('[App] Initializing analytics...');
          await initAnalytics();
          try {
            if (__DEV__) console.log('[App] Initializing RevenueCat...');
            await initRevenueCat();
            listenerCleanup.current = setupCustomerInfoListener();
            if (userId) await identifyUser(userId);
            const currentSub = useStore.getState().subscription;
            const sub = await checkSubscriptionStatus(currentSub);
            setSubscription(sub);
            if (__DEV__) console.log('[App] RevenueCat ready');
          } catch (e: any) {
            if (__DEV__) console.warn('[App] RevenueCat init failed:', e?.message || e);
          }
        } catch (e: any) {
          if (__DEV__) console.warn('[App] Analytics init failed:', e?.message || e);
        }

        if (__DEV__) console.log('[App] Init complete');
        identifyAnalyticsUser(userId || 'anonymous');
        trackEvent('app_init_complete', {
          has_revenuecat_key: !!env.REVENUECAT_API_KEY,
          has_posthog_key: !!env.POSTHOG_API_KEY,
          has_api_url: !!env.API_BASE_URL,
        });

        initLesionDetection().catch(() => {});
      };

      Promise.all([
        initApp(),
        new Promise<void>((r) => setTimeout(r, SPLASH_MIN_MS)),
      ]).then(() => {
        setAppReady(true);
      }).catch((err) => {
        if (__DEV__) console.error('[App] Init failed:', err);
        setAppReady(true);
      });
    }

    return () => {
      listenerCleanup.current();
    };
  }, []);

  // Health sync on app foreground:
  // Re-sync at most once every 6 hours, only during waking hours (7am-midnight local) —
  // skip overnight resumes when no new HealthKit data is likely to be present.
  // The store's syncHealthData has its own reentrancy guard, but we still bound
  // the trigger here to avoid unnecessary HealthKit roundtrips on every app resume.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const state = useStore.getState();
      if (!state.user) return;
      const lastSync = state.healthSyncStatus.last_sync_at;
      const hoursSince = lastSync
        ? (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60)
        : Infinity;
      const hour = new Date().getHours();
      if (hoursSince > 6 && hour >= 7 && hour <= 23) {
        state.syncHealthData().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Show splash while initializing
  if (!appReady) {
    return <SplashScreen />;
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="auth" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="scan" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="product" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="signal" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="privacy-policy" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
        <AuthRedirector />
      </View>
    </SafeAreaProvider>
  );
}

// ─── Root Layout ─────────────────────────────────────────────────
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Switzer-Regular': require('../assets/fonts/Switzer-Regular.ttf'),
    'Switzer-Medium': require('../assets/fonts/Switzer-Medium.ttf'),
    'Switzer-Bold': require('../assets/fonts/Switzer-Bold.ttf'),
    'DancingScript': require('../assets/fonts/DancingScript-Medium.ttf'),
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  return (
    <ClerkProvider
      publishableKey={env.CLERK_PUBLISHABLE_KEY}
      tokenCache={tokenCache}
    >
      <ClerkLoaded>
        <ClerkGatedApp />
      </ClerkLoaded>
    </ClerkProvider>
  );
}
