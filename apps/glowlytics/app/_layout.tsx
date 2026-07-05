import 'react-native-get-random-values';
import React, { useEffect, useRef, useState } from 'react';
import { Stack, Redirect, useSegments, useRouter, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, Image, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { resourceCache } from '@clerk/clerk-expo/resource-cache';
import * as Sentry from '@sentry/react-native';
import { env } from '../src/config/env';
import { localDateStr } from '../src/utils/localDate';
import { resolveAuthRoute } from '../src/utils/authRoute';
import { shouldRouteToDailyQuote, resolveEntryTarget, isQuoteRedirectRendered } from '../src/utils/dailyQuoteRoute';
import { Glow, GlowPalettesDark } from '../src/constants/theme';
import { useStore } from '../src/store/useStore';
import { setAuthTokenProvider } from '../src/services/api';
import { initRevenueCat, identifyUser, subscriptionFromCustomerInfo, setupCustomerInfoListener } from '../src/services/subscription';
import { initAnalytics, identifyUser as identifyAnalyticsUser, trackEvent } from '../src/services/analytics';
import {
  applyAppIcon,
  currentNativeIcon,
  resolveColorMode,
} from '../src/services/appearance';
import { AppearanceHost } from '../src/components/AppearanceHost';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
import { BreathingGlow } from '../src/components/glow/GlowPrimitives';
// Lazy import — onnxruntime-react-native crashes in Expo Go
const initLesionDetection = () =>
  import('../src/services/onDeviceLesionDetection').then((m) => m.initLesionDetection());
const initSignalModels = () =>
  import('../src/services/onDeviceSignalModels').then((m) => m.initSignalModels());

// ─── Sentry Crash Reporting ──────────────────────────────────────
// Initialized at module scope so native crashes during startup are captured.
// Inert until EXPO_PUBLIC_SENTRY_DSN is set (eas.json env / EAS secrets) —
// with an empty DSN we skip init entirely, and even with a DSN, dev builds
// stay silent via `enabled: !__DEV__`.
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    enabled: !__DEV__,
    tracesSampleRate: 0.2, // sample perf traces lightly; errors are always sent
    sendDefaultPii: false, // never attach IPs/emails — skin data app, keep telemetry lean
  });
}

// Hold the native (cream/dusk) splash ourselves. expo-router auto-hides it the
// moment the Stack mounts, which used to expose the blank font-gate view and
// the black JS splash beneath it. We keep it up until fonts + critical init +
// Clerk (or its timeout) have all settled, then hide it exactly once so the
// next thing the user sees is the target screen — no cream↔black flips.
SplashScreen.preventAutoHideAsync();

// Brief floor on the splash so iOS's launch image cross-fade into our React
// view doesn't flicker. Anything longer than this is theatrical, so we keep
// the floor short and let real init finish ahead of the user.
const SPLASH_MIN_MS = 350;

// Hard ceiling on how long critical init may hold the splash. Past this the
// watchdog releases the splash so hideAsync can always fire — an eternal splash
// is worse than opening on partially-hydrated state (#C).
const CRITICAL_INIT_TIMEOUT_MS = 6000;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ─── Glowlytics Splash ───────────────────────────────────────────
// Branded under-layer + safety net beneath the native splash: dusk background,
// logo emblem fading in over a gentle breathing halo. Shown if the native
// splash is ever absent (Expo Go, or a frame between control handoffs) so the
// user never sees black or a bare cream flash.
function GlowSplash() {
  // Follow the system scheme so this branded under-layer matches the native
  // splash in both modes. NOTE (follow-up): the native app.json splash is still
  // light-only — an expo-splash-screen dark variant needs a native rebuild, so
  // that migration is deliberately out of scope here; this JS layer only covers
  // the handoff gap (#D).
  const scheme = useColorScheme();
  const P = scheme === 'dark' ? GlowPalettesDark.dusk : Glow.palette;
  const logoOpacity = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.value }));

  return (
    <View style={[splash.container, { backgroundColor: P.bg }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={splash.halo} pointerEvents="none">
        <BreathingGlow color={P.glow} size={240} />
      </View>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    ...StyleSheet.absoluteFillObject,
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

// Session guard shared by AuthRedirector's first-open quote fold and
// DailyQuoteRouter, so at most one of them sends the user to /quote per launch.
// Module scope = reset on cold start (fresh module evaluation).
const dailyQuoteGuard = { routed: false };

// ─── Auth Redirector ─────────────────────────────────────────────
function AuthRedirector() {
  const { isSignedIn, isLoaded, userId } = useAuth();
  const onboardingComplete = useStore((s) => s.user?.onboarding_complete ?? false);
  // Store hydration is in flight (offline / slow disk). Onboarding state lives in
  // the persisted store, so we must not redirect based on a not-yet-restored user.
  const authHydrating = useStore((s) => s.authHydrating ?? false);
  const dailyQuoteSeenDate = useStore((s) => s.dailyQuoteSeenDate);
  const segments = useSegments();
  const root = segments[0];
  const decision = resolveAuthRoute({
    isLoaded,
    isSignedIn: !!isSignedIn,
    onboardingComplete,
    authHydrating,
    root,
  });

  // Fold the first-open-of-day quote into the tabs redirect so /quote is the
  // FIRST screen after the splash — never a flash of the home tabs first. The
  // shared guard keeps DailyQuoteRouter from also firing this launch.
  const quoteDue =
    decision === 'tabs' &&
    shouldRouteToDailyQuote({
      isLoaded,
      isSignedIn: !!isSignedIn,
      onboardingComplete,
      alreadyRouted: dailyQuoteGuard.routed,
      root: '(tabs)',
      dailyQuoteSeenDate,
      today: localDateStr(new Date()),
    });
  const tabsTarget = resolveEntryTarget({ authDecision: decision, quoteDue });

  // Reset the per-launch quote guard when the signed-in identity changes or the
  // user signs out, so a different account still gets its first-open-of-day
  // /quote in a warm session — the module-scope guard would otherwise leak the
  // previous user's claim across accounts (#B). Declared BEFORE the claim effect
  // so on the same commit that resolves a new identity the reset runs first and
  // the claim below still wins.
  useEffect(() => {
    dailyQuoteGuard.routed = false;
  }, [userId, isSignedIn]);

  // Claim the daily-quote guard ONLY when the /quote Redirect is actually
  // rendered. The __DEV__ onboarding hatch below returns null (no navigation)
  // even when decision === 'tabs' and the quote is due, so gate the claim on the
  // same predicate the hatch uses rather than on tabsTarget alone (#A).
  const quoteRedirectRendered = isQuoteRedirectRendered({
    authDecision: decision,
    entryTarget: tabsTarget,
    devOnboardingHatchActive: __DEV__ && root === 'onboarding' && decision === 'tabs',
  });
  useEffect(() => {
    if (quoteRedirectRendered) dailyQuoteGuard.routed = true;
  }, [quoteRedirectRendered]);
  // DEV-ONLY design-review hatch: allow deep-linking into /onboarding/* even
  // when the signed-in user has already completed onboarding, so the flow can
  // be reviewed on a simulator without resetting the account. No-op in prod.
  if (__DEV__ && root === 'onboarding' && decision === 'tabs') return null;
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
  return <Redirect href={tabsTarget} />; // decision === 'tabs'
}

// ─── Daily Quote Router ──────────────────────────────────────────
// Routes the user to /quote on the first cold-open of each local day,
// AFTER auth + onboarding are settled. Shares `dailyQuoteGuard` with the
// AuthRedirector fold so re-renders — and that fold — never double-route.
// Does nothing while the user is already inside the quote screen or any
// non-logged-in route — that's AuthRedirector's job.

function DailyQuoteRouter() {
  const { isSignedIn, isLoaded } = useAuth();
  const onboardingComplete = useStore((s) => s.user?.onboarding_complete ?? false);
  const dailyQuoteSeenDate = useStore((s) => s.dailyQuoteSeenDate);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const root = segments[0];
    if (
      !shouldRouteToDailyQuote({
        isLoaded,
        isSignedIn: !!isSignedIn,
        onboardingComplete,
        alreadyRouted: dailyQuoteGuard.routed,
        root,
        dailyQuoteSeenDate,
        today: localDateStr(new Date()),
      })
    ) {
      return;
    }
    dailyQuoteGuard.routed = true;
    if (__DEV__) console.log('[DailyQuoteRouter] First open — showing /quote');
    router.replace('/quote');
  }, [isLoaded, isSignedIn, onboardingComplete, dailyQuoteSeenDate, segments, router]);

  return null;
}

// ─── Clerk-Gated App ─────────────────────────────────────────────
function ClerkGatedApp() {
  const { getToken, userId, isLoaded: clerkLoaded } = useAuth();
  const loadPersistedData = useStore((s) => s.loadPersistedData);
  const reconcileAuthUserId = useStore((s) => s.reconcileAuthUserId);
  const setSubscription = useStore((s) => s.setSubscription);
  // Status bar must react to appearance changes (including 'auto' following the
  // system scheme), so subscribe via hooks rather than a one-shot getState() read.
  const appearanceMode = useStore((s) => s.appearance.mode);
  const systemScheme = useColorScheme();
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

    // Watchdog: never let a hung critical-init (e.g. a stalled loadPersistedData
    // on bad disk) hold the splash forever. Race it against a timer so appReady
    // can always flip and hideAsync eventually fires. Tripping it is logged, not
    // fatal — the app opens on whatever hydrated so far (#C).
    let initSettled = false;
    const initWatchdog = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (initSettled) return;
        if (__DEV__) {
          console.warn(`[App] Critical init exceeded ${CRITICAL_INIT_TIMEOUT_MS}ms — releasing splash via watchdog`);
        }
        resolve();
      }, CRITICAL_INIT_TIMEOUT_MS);
    });

    Promise.all([
      Promise.race([
        initCritical().finally(() => { initSettled = true; }),
        initWatchdog,
      ]),
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

  // Hand off from the native splash exactly once: this component only mounts
  // after RootLayout's font gate, so fonts are already loaded; we wait for
  // critical init (appReady) and Clerk (or its timeout) before hiding, so the
  // native cream/dusk splash covers the whole cold-start gap.
  const splashHiddenRef = useRef(false);
  useEffect(() => {
    if (splashHiddenRef.current) return;
    if (appReady && (clerkLoaded || splashTimedOut)) {
      splashHiddenRef.current = true;
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appReady, clerkLoaded, splashTimedOut]);

  // Splash gates on BOTH our own critical init AND Clerk's session restoration.
  // Without the `clerkLoaded` gate, the splash dismissed before Clerk had loaded
  // the persisted session — and AuthRedirector then redirected the user to
  // /auth/sign-in, producing the "app logs me out at launch" UX bug. Capping
  // at 8s prevents Clerk being down from holding the splash forever; the
  // (very rare) "Clerk failed to load" path falls through to AuthRedirector
  // which now holds rather than redirects.
  if (!appReady || (!clerkLoaded && !splashTimedOut)) {
    return <GlowSplash />;
  }

  return (
    <SafeAreaProvider>
      <AppearanceHost>
        <AppErrorBoundary>
          <View style={{ flex: 1, backgroundColor: Glow.palette.bg }}>
            <StatusBar style={resolveColorMode(appearanceMode, systemScheme) === 'dark' ? 'light' : 'dark'} />
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
function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Switzer-Regular': require('../assets/fonts/Switzer-Regular.ttf'),
    'Switzer-Medium': require('../assets/fonts/Switzer-Medium.ttf'),
    'Switzer-Bold': require('../assets/fonts/Switzer-Bold.ttf'),
    'DancingScript': require('../assets/fonts/DancingScript-Medium.ttf'),
    'InstrumentSerif-Regular': require('../assets/fonts/InstrumentSerif-Regular.ttf'),
    'InstrumentSerif-Italic': require('../assets/fonts/InstrumentSerif-Italic.ttf'),
  });

  // Pass the font gate on success OR error: a missing/corrupt font file must
  // fall through to system fonts rather than trap the user on an eternal splash
  // (#C). fontError is set once useFonts gives up loading.
  if (!fontsLoaded && !fontError) {
    return <GlowSplash />;
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

// Sentry.wrap adds touch-event + profiling instrumentation around the root
// component. Wrapping unconditionally is the documented pattern and is a
// no-op-cheap passthrough when Sentry.init was never called (no DSN).
export default Sentry.wrap(RootLayout);
