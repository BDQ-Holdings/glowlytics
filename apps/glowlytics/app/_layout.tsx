import 'react-native-get-random-values';
import React, { useEffect, useRef, useState } from 'react';
import { Stack, Redirect, useSegments, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, Image, StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { resourceCache } from '@clerk/clerk-expo/resource-cache';
import { env } from '../src/config/env';
import { localDateStr } from '../src/utils/localDate';
import { resolveAuthRoute } from '../src/utils/authRoute';
import { shouldRouteToDailyQuote } from '../src/utils/dailyQuoteRoute';
import { Colors, FontFamily, FontSize, Glow, Spacing } from '../src/constants/theme';
import { useStore } from '../src/store/useStore';
import { setAuthTokenProvider } from '../src/services/api';
import { initRevenueCat, identifyUser, subscriptionFromCustomerInfo, setupCustomerInfoListener } from '../src/services/subscription';
import { initAnalytics, identifyUser as identifyAnalyticsUser, trackEvent } from '../src/services/analytics';
import {
  applyAppIcon,
  currentNativeIcon,
} from '../src/services/appearance';
import { AppearanceHost } from '../src/components/AppearanceHost';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
// Lazy import — onnxruntime-react-native crashes in Expo Go
const initLesionDetection = () =>
  import('../src/services/onDeviceLesionDetection').then((m) => m.initLesionDetection());
const initSignalModels = () =>
  import('../src/services/onDeviceSignalModels').then((m) => m.initSignalModels());

// Brief floor on the splash so iOS's launch image cross-fade into our React
// view doesn't flicker. Anything longer than this is theatrical, so we keep
// the floor short and let real init finish ahead of the user.
const SPLASH_MIN_MS = 350;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ─── Splash Screen ───────────────────────────────────────────────
// Distilled: black background, logo emblem fading in. Removed the cursive
// tagline reveal + glow — the daily-quote screen below now owns the
// "first thing the user sees" moment, so the splash only needs to bridge
// the system launch image until the JS runtime + persisted store are ready.
function SplashScreen() {
  const logoOpacity = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.value }));

  return (
    <View style={splash.container}>
      <StatusBar style="light" />
      <Animated.View style={logoStyle}>
        <Image
          source={require('../assets/logo-emblem.png')}
          style={splash.logo}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const splash = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 96,
    height: 96,
  },
});

// ─── Demo Seeder — loads demo data for the test@test.com reviewer account ───
const DEMO_EMAIL = 'test@test.com';
// MOB-05: the demo seeder only runs in dev builds, or in App Review builds that
// explicitly opt in via EXPO_PUBLIC_DEMO_SEEDER=true. Never in normal production.
const DEMO_SEEDER_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_DEMO_SEEDER === 'true';

function DemoSeeder() {
  let clerkEmail: string | undefined;
  try {
    const { useUser } = require('@clerk/clerk-expo');
    const { user } = useUser();
    clerkEmail = user?.primaryEmailAddress?.emailAddress;
  } catch {}

  const dailyRecords = useStore((s) => s.dailyRecords);
  const seeded = useRef(false);

  useEffect(() => {
    if (!DEMO_SEEDER_ENABLED) return;
    if (seeded.current) return;
    if (clerkEmail !== DEMO_EMAIL) return;
    if (dailyRecords.length > 0) return; // Already has data

    seeded.current = true;
    const { createDemoSeed } = require('../src/services/demoData');
    const demo = createDemoSeed();
    const store = useStore.getState();

    store.createUser(demo.user);
    for (const p of demo.products) store.addProduct(p);
    useStore.setState({
      protocol: demo.protocol,
      dailyRecords: demo.records,
      modelOutputs: demo.outputs,
      gamification: demo.gamification,
    });
    store.persistData();
    console.log('[DemoSeeder] Loaded demo data for test@test.com');
  }, [clerkEmail, dailyRecords.length]);

  return null;
}

// ─── Auth Redirector ─────────────────────────────────────────────
function AuthRedirector() {
  const { isSignedIn, isLoaded } = useAuth();
  const onboardingComplete = useStore((s) => s.user?.onboarding_complete ?? false);
  // Store hydration is in flight (offline / slow disk). Onboarding state lives in
  // the persisted store, so we must not redirect based on a not-yet-restored user.
  const authHydrating = useStore((s) => s.authHydrating ?? false);
  const segments = useSegments();
  const root = segments[0];
  const decision = resolveAuthRoute({
    isLoaded,
    isSignedIn: !!isSignedIn,
    onboardingComplete,
    authHydrating,
    root,
  });
  if (__DEV__ && decision !== 'hold') {
    console.log(`[AuthRedirector] ${root ?? '\u2205'} → ${decision}`);
  }

  if (decision === 'hold') return null;
  if (decision === 'sign-in') return <Redirect href="/auth/sign-in" />;
  if (decision === 'onboarding') {
    // onboarding_complete is false here; resume at the persisted flow position.
    const { onboardingFlow, onboardingFlowIndex } = useStore.getState();
    const resumeScreen = (onboardingFlowIndex > 0 && onboardingFlow.length > 0)
      ? onboardingFlow[onboardingFlowIndex] || 'welcome'
      : 'welcome';
    return <Redirect href={`/onboarding/${resumeScreen}`} />;
  }
  return <Redirect href="/(tabs)/today" />; // decision === 'tabs'
}

// ─── Daily Quote Router ──────────────────────────────────────────
// Routes the user to /quote on the first cold-open of each local day,
// AFTER auth + onboarding are settled. Uses a session ref so re-renders
// during the same launch don't re-route. Does nothing while the user is
// already inside the quote screen or any non-logged-in route — that's
// AuthRedirector's job.

function DailyQuoteRouter() {
  const { isSignedIn, isLoaded } = useAuth();
  const onboardingComplete = useStore((s) => s.user?.onboarding_complete ?? false);
  const dailyQuoteSeenDate = useStore((s) => s.dailyQuoteSeenDate);
  const segments = useSegments();
  const router = useRouter();
  const routedRef = useRef(false);

  useEffect(() => {
    const root = segments[0];
    if (
      !shouldRouteToDailyQuote({
        isLoaded,
        isSignedIn: !!isSignedIn,
        onboardingComplete,
        alreadyRouted: routedRef.current,
        root,
        dailyQuoteSeenDate,
        today: localDateStr(new Date()),
      })
    ) {
      return;
    }
    routedRef.current = true;
    if (__DEV__) console.log('[DailyQuoteRouter] First open — showing /quote');
    router.replace('/quote' as any);
  }, [isLoaded, isSignedIn, onboardingComplete, dailyQuoteSeenDate, segments, router]);

  return null;
}

// ─── Clerk-Gated App ─────────────────────────────────────────────
function ClerkGatedApp() {
  const { getToken, userId, isLoaded: clerkLoaded } = useAuth();
  const loadPersistedData = useStore((s) => s.loadPersistedData);
  const reconcileAuthUserId = useStore((s) => s.reconcileAuthUserId);
  const setSubscription = useStore((s) => s.setSubscription);
  const initStarted = useRef(false);
  const servicesInitStarted = useRef(false);
  const clerkInitStartedAt = useRef(Date.now());
  const listenerCleanup = useRef<() => void>(() => {});
  const [appReady, setAppReady] = useState(false);
  const [splashTimedOut, setSplashTimedOut] = useState(false);

  useEffect(() => {
    if (clerkLoaded) {
      if (__DEV__) {
        console.log(`[Auth] Clerk loaded in ${Date.now() - clerkInitStartedAt.current}ms (${env.CLERK_KEY_ENV}:${env.CLERK_INSTANCE_HOST})`);
      }
      return;
    }
    // Warn loudly in dev when Clerk takes more than 5s.
    const warnT = setTimeout(() => {
      if (__DEV__) {
        console.warn(`[Auth] Clerk still loading after ${Date.now() - clerkInitStartedAt.current}ms (${env.CLERK_KEY_ENV}:${env.CLERK_INSTANCE_HOST})`);
      }
    }, 5000);
    // Safety net: stop blocking the splash on Clerk after 8s — at that point
    // the user is better served seeing the sign-in screen (AuthRedirector
    // will route there once the timeout flips).
    const giveUpT = setTimeout(() => {
      if (__DEV__) console.warn('[Auth] Clerk load timed out at 8s — dismissing splash');
      setSplashTimedOut(true);
    }, 8000);
    return () => {
      clearTimeout(warnT);
      clearTimeout(giveUpT);
    };
  }, [clerkLoaded]);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    const initCritical = async () => {
      const t0 = Date.now();
      await loadPersistedData();

      // Hydrate the native iOS app icon to whatever the user picked on a
      // previous launch — `expo-alternate-app-icons` doesn't persist its
      // own choice across cold starts, but our store does. We only fire a
      // swap when the native current diverges from the stored intent so
      // we don't trigger the iOS confirmation alert on every launch.
      try {
        const intent = useStore.getState().appearance.icon;
        const live = currentNativeIcon();
        if (intent !== live) await applyAppIcon(intent);
      } catch {
        // Best-effort; this never blocks the splash.
      }

      // Text-scale + palette are wired by AppearanceHost (mounted below) so
      // they react to every store change rather than only at cold start.

      if (__DEV__) console.log(`[App] Critical init ready in ${Date.now() - t0}ms`);
    };

    Promise.all([
      initCritical(),
      delay(SPLASH_MIN_MS),
    ]).then(() => {
      setAppReady(true);
    }).catch((err) => {
      if (__DEV__) console.error('[App] Init failed:', err);
      setAppReady(true);
    });
  }, [loadPersistedData]);

  useEffect(() => {
    if (!clerkLoaded || servicesInitStarted.current) return;
    servicesInitStarted.current = true;
    setAuthTokenProvider((opts) => getToken(opts?.skipCache ? { skipCache: true } : undefined));

    const initDeferred = async () => {
      try {
        if (__DEV__) console.log('[App] Initializing analytics...');
        await initAnalytics();
        identifyAnalyticsUser(userId || 'anonymous');
        trackEvent('app_init_complete', {
          has_revenuecat_key: !!env.REVENUECAT_API_KEY,
          has_posthog_key: !!env.POSTHOG_API_KEY,
          has_api_url: !!env.API_BASE_URL,
        });
        try {
          if (__DEV__) console.log('[App] Initializing RevenueCat...');
          await initRevenueCat();
          listenerCleanup.current = setupCustomerInfoListener();
          if (userId) {
            const customerInfo = await identifyUser(userId);
            if (customerInfo) {
              const currentSub = useStore.getState().subscription;
              setSubscription(subscriptionFromCustomerInfo(customerInfo, currentSub));
            }
          }
          if (__DEV__) console.log('[App] RevenueCat ready');
        } catch (e: any) {
          if (__DEV__) console.warn('[App] RevenueCat init failed:', e?.message || e);
        }
      } catch (e: any) {
        if (__DEV__) console.warn('[App] Analytics init failed:', e?.message || e);
      }
      if (__DEV__) console.log('[App] Deferred init complete');
      initLesionDetection().catch(() => {});
      initSignalModels().catch(() => {});
    };

    void initDeferred();
  }, [clerkLoaded, getToken, setSubscription, userId]);

  useEffect(() => {
    return () => { listenerCleanup.current(); };
  }, []);

  useEffect(() => {
    // Gate on appReady so reconciliation never runs before loadPersistedData()
    // has restored the persisted account — reconciling against an empty store on
    // cold start would wipe the just-restored user.
    if (!appReady || !userId) return;
    reconcileAuthUserId(userId);
  }, [appReady, userId, reconcileAuthUserId]);

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

  // Splash gates on BOTH our own critical init AND Clerk's session restoration.
  // Without the `clerkLoaded` gate, the splash dismissed before Clerk had loaded
  // the persisted session — and AuthRedirector then redirected the user to
  // /auth/sign-in, producing the "app logs me out at launch" UX bug. Capping
  // at 8s prevents Clerk being down from holding the splash forever; the
  // (very rare) "Clerk failed to load" path falls through to AuthRedirector
  // which now holds rather than redirects.
  if (!appReady || (!clerkLoaded && !splashTimedOut)) {
    return <SplashScreen />;
  }

  return (
    <SafeAreaProvider>
      <AppearanceHost>
        <AppErrorBoundary>
          <View style={{ flex: 1, backgroundColor: Glow.palette.bg }}>
            <StatusBar style={useStore.getState().appearance.mode === 'dark' ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: Glow.palette.bg },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="index" options={{ animation: 'fade' }} />
              <Stack.Screen name="auth" options={{ animation: 'fade' }} />
              <Stack.Screen name="oauth-native-callback" options={{ animation: 'fade' }} />
              <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
              <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
              <Stack.Screen name="scan" options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="product" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="signal" options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="privacy-policy" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="pattern" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="ritual" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="quote" options={{ animation: 'fade' }} />
            </Stack>
            <AuthRedirector />
            <DemoSeeder />
            <DailyQuoteRouter />
          </View>
        </AppErrorBoundary>
      </AppearanceHost>
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
      __experimental_resourceCache={resourceCache}
    >
        <ClerkGatedApp />
    </ClerkProvider>
  );
}
