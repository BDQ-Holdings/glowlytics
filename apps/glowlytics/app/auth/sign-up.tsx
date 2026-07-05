import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSSO, useSignInWithApple, useSignUp, useSignIn } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Colors,
  FontFamily,
  FontSize,
  Glow,
  Spacing,
  BorderRadius,
} from '../../src/constants/theme';
import { trackEvent } from '../../src/services/analytics';
import { env } from '../../src/config/env';
import {
  SignUpCompletionRequiredError,
  detectSignUpCompletion,
  friendlyAuthErrorMessage,
  isSignUpCompletionRequiredError,
} from '../../src/services/oauthCompletion';

WebBrowser.maybeCompleteAuthSession();

const CALM_EASING = Easing.out(Easing.cubic);
const OAUTH_CALLBACK_PATH = 'oauth-native-callback';

const decodeClerkHost = (pk: string): string => {
  try {
    const encoded = pk.split('_').slice(2).join('_');
    if (typeof globalThis.atob !== 'function') return 'unknown';
    return globalThis.atob(encoded).replace(/\$$/, '') || 'unknown';
  } catch {
    return 'unknown';
  }
};

const getOAuthRedirectUrl = () =>
  (Platform.OS === 'web'
    ? AuthSession.makeRedirectUri({
      scheme: 'glowlytics',
      path: OAUTH_CALLBACK_PATH,
    })
    : `glowlytics://${OAUTH_CALLBACK_PATH}`);

const buildOAuthFailureMessage = (err: unknown, redirectUrl: string) =>
  friendlyAuthErrorMessage(err, {
    redirectUrl,
    clerkHost: decodeClerkHost(env.CLERK_PUBLISHABLE_KEY),
  });

const getSupportedStrategies = (resource: any): string[] | null => {
  if (!Array.isArray(resource?.supportedFirstFactors)) return null;
  return resource.supportedFirstFactors
    .map((factor: any) => factor?.strategy)
    .filter((s: unknown): s is string => typeof s === 'string');
};

const isStrategyExplicitlyUnavailable = (resource: any, strategy: string): boolean => {
  const strategies = getSupportedStrategies(resource);
  // Clerk can return an empty list transiently during init; don't hard-fail on that.
  if (!strategies || strategies.length === 0) return false;
  return !strategies.includes(strategy);
};

const listStrategies = (resource: any): string => {
  const strategies = getSupportedStrategies(resource);
  if (!strategies || strategies.length === 0) return 'none';
  return strategies.length > 0 ? strategies.join(', ') : 'none';
};

const ensureOAuthSession = async (
  result: any,
  method: 'apple' | 'google',
) => {
  const authSessionType = result?.authSessionResult?.type;
  if (authSessionType && authSessionType !== 'success') {
    throw new Error(`OAuth flow ${authSessionType}`);
  }

  if (result?.createdSessionId) {
    try {
      await result.setActive?.({ session: result.createdSessionId });
    } catch (e) {
      throw new Error(
        __DEV__
          ? `We couldn\u2019t start your session. Please try again. (${(e as Error)?.message})`
          : 'We couldn\u2019t start your session. Please try again.',
      );
    }
    const completedEvent = result.signUp?.createdSessionId === result.createdSessionId
      ? 'auth_sign_up_completed'
      : 'auth_sign_in_completed';
    trackEvent(completedEvent, { method });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return;
  }

  if (result?.signUp?.verifications?.externalAccount?.status === 'verified') {
    const completeSignUp = await result.signUp.update({});
    if (completeSignUp.status === 'complete' && completeSignUp.createdSessionId) {
      try {
        await result.setActive?.({ session: completeSignUp.createdSessionId });
      } catch (e) {
        throw new Error(
          __DEV__
            ? `We couldn\u2019t start your session. Please try again. (${(e as Error)?.message})`
            : 'We couldn\u2019t start your session. Please try again.',
        );
      }
      trackEvent('auth_sign_up_completed', { method });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
  }
  // SSO fresh-user transferable handoff. `useSignInWithApple` (iOS native)
  // performs the transfer-create internally, but `useSSO().startSSOFlow`
  // (Google + non-iOS Apple) hands us back a signIn in `transferable` state
  // with the signUp resource empty. Without this branch the user falls
  // through to the generic "Sign-in couldn't finish" error.
  if (
    result?.signIn?.status === 'transferable'
    && result?.signUp
    && !result?.signUp?.createdSessionId
    && result?.signUp?.status !== 'complete'
    && (!result?.signUp?.status || result?.signUp?.status === 'missing_requirements' || result?.signUp?.status === 'abandoned')
  ) {
    try {
      await result.signUp.create({ transfer: true });
    } catch (transferErr) {
      throw transferErr;
    }
    if (result.signUp.createdSessionId) {
      try {
        await result.setActive?.({ session: result.signUp.createdSessionId });
      } catch (e) {
        throw new Error(
          __DEV__
            ? `We couldn\u2019t start your session. Please try again. (${(e as Error)?.message})`
            : 'We couldn\u2019t start your session. Please try again.',
        );
      }
      trackEvent('auth_sign_up_completed', { method });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
  }


  // Apple often returns with the signUp resource pending an email address or
  // other field — route the user to /auth/complete-signup so they can finish
  // creating their account instead of dead-ending.
  const completion = detectSignUpCompletion(result?.signUp, method);
  if (completion) {
    trackEvent('auth_sign_up_completion_required', {
      method,
      missing: completion.missingFields.join(',') || 'none',
      unverified: completion.unverifiedFields.join(',') || 'none',
    });
    throw new SignUpCompletionRequiredError(completion);
  }

  const signInStatus = result?.signIn?.status;
  const signUpStatus = result?.signUp?.status;
  const hasStatuses = Boolean(signInStatus || signUpStatus);
  if (!authSessionType && !hasStatuses) {
    if (method === 'apple') {
      throw new Error(
        __DEV__
          ? 'Apple sign-in returned no session. Verify Apple is enabled for this Clerk instance.'
          : 'Sign-in couldn\u2019t finish. Please try again or use email.',
      );
    }
    if (method === 'google') {
      throw new Error(
        __DEV__
          ? 'Google sign-in returned no session. Verify Google is enabled for this Clerk instance.'
          : 'Sign-in couldn\u2019t finish. Please try again or use email.',
      );
    }
  }

  throw new Error(
    __DEV__
      ? `Authentication did not complete (signIn=${signInStatus || 'none'}, signUp=${signUpStatus || 'none'}).`
      : 'Sign-in couldn\u2019t finish. Please try again or use email.',
  );
};

const getAuthErrorMessage = (err: unknown, fallback = 'An error occurred.') => {
  const clerkMessage = (err as any)?.errors?.[0]?.longMessage ?? (err as any)?.errors?.[0]?.message;
  if (typeof clerkMessage === 'string' && clerkMessage.trim().length > 0) {
    return clerkMessage;
  }
  return err instanceof Error ? err.message : fallback;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isMissingSSORedirectError = (err: unknown) =>
  /Missing external verification redirect URL for SSO flow/i.test(getAuthErrorMessage(err));

const getSSODebugState = (resource: any): string => {
  const firstFactor = resource?.firstFactorVerification;
  return [
    `signIn.status=${resource?.status ?? 'unknown'}`,
    `firstFactor.status=${firstFactor?.status ?? 'unknown'}`,
    `hasExternalRedirect=${Boolean(firstFactor?.externalVerificationRedirectURL)}`,
    `factors=${listStrategies(resource)}`,
  ].join(', ');
};

const isAppleAuthCancelError = (err: unknown) => {
  const code = String((err as any)?.code ?? '').toUpperCase();
  if (code.includes('CANCEL')) return true;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /cancel|1001/i.test(message);
};

export default function SignUpScreen() {
  const router = useRouter();
  const { startSSOFlow } = useSSO();
  const { signUp, setActive, isLoaded } = useSignUp();
  const { signIn, isLoaded: isSignInLoaded } = useSignIn();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const isEmailAuthReady = isLoaded;
  const isVerificationReady = isLoaded;
  const isOAuthReady = isLoaded && isSignInLoaded;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clerkSlowWarning, setClerkSlowWarning] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Staggered entrance animations
  const orbOpacity = useSharedValue(0);
  const orbScale = useSharedValue(0.85);
  const brandOpacity = useSharedValue(0);
  const brandTranslateY = useSharedValue(20);
  const taglineOpacity = useSharedValue(0);
  const taglineTranslateY = useSharedValue(20);
  const oauthOpacity1 = useSharedValue(0);
  const oauthTranslateY1 = useSharedValue(20);
  const oauthOpacity2 = useSharedValue(0);
  const oauthTranslateY2 = useSharedValue(20);
  const dividerOpacity = useSharedValue(0);
  const dividerScaleX = useSharedValue(0.6);
  const emailOpacity = useSharedValue(0);
  const emailTranslateY = useSharedValue(20);
  const passwordOpacity = useSharedValue(0);
  const passwordTranslateY = useSharedValue(20);
  const buttonOpacity = useSharedValue(0);
  const buttonTranslateY = useSharedValue(20);
  const footerOpacity = useSharedValue(0);

  // Verification animations
  const verifyOpacity = useSharedValue(0);
  const verifyScale = useSharedValue(0.95);

  // Error shake
  const errorTranslateX = useSharedValue(0);

  // Content fade for success
  const contentOpacity = useSharedValue(1);

  useEffect(() => {
    orbOpacity.value = withTiming(1, { duration: 600, easing: CALM_EASING });
    orbScale.value = withTiming(1, { duration: 600, easing: CALM_EASING });
    brandOpacity.value = withDelay(200, withTiming(1, { duration: 500, easing: CALM_EASING }));
    brandTranslateY.value = withDelay(200, withTiming(0, { duration: 500, easing: CALM_EASING }));
    taglineOpacity.value = withDelay(350, withTiming(1, { duration: 500, easing: CALM_EASING }));
    taglineTranslateY.value = withDelay(350, withTiming(0, { duration: 500, easing: CALM_EASING }));
    oauthOpacity1.value = withDelay(500, withTiming(1, { duration: 500, easing: CALM_EASING }));
    oauthTranslateY1.value = withDelay(500, withTiming(0, { duration: 500, easing: CALM_EASING }));
    oauthOpacity2.value = withDelay(620, withTiming(1, { duration: 500, easing: CALM_EASING }));
    oauthTranslateY2.value = withDelay(620, withTiming(0, { duration: 500, easing: CALM_EASING }));
    dividerOpacity.value = withDelay(740, withTiming(1, { duration: 400, easing: CALM_EASING }));
    dividerScaleX.value = withDelay(740, withTiming(1, { duration: 400, easing: CALM_EASING }));
    emailOpacity.value = withDelay(900, withTiming(1, { duration: 500, easing: CALM_EASING }));
    emailTranslateY.value = withDelay(900, withTiming(0, { duration: 500, easing: CALM_EASING }));
    passwordOpacity.value = withDelay(1020, withTiming(1, { duration: 500, easing: CALM_EASING }));
    passwordTranslateY.value = withDelay(1020, withTiming(0, { duration: 500, easing: CALM_EASING }));
    buttonOpacity.value = withDelay(1140, withTiming(1, { duration: 500, easing: CALM_EASING }));
    buttonTranslateY.value = withDelay(1140, withTiming(0, { duration: 500, easing: CALM_EASING }));
    footerOpacity.value = withDelay(1300, withTiming(1, { duration: 400, easing: CALM_EASING }));
  }, []);

  // Countdown timer for verification
  useEffect(() => {
    if (!pendingVerification) return;
    setCountdown(60);
    setCanResend(false);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [pendingVerification]);

  // Trigger shake on error
  useEffect(() => {
    if (error) {
      errorTranslateX.value = withSequence(
        withTiming(-6, { duration: 60 }),
        withTiming(6, { duration: 60 }),
        withTiming(-3, { duration: 60 }),
        withTiming(0, { duration: 80 }),
      );
    }
  }, [error]);

  useEffect(() => {
    if (isOAuthReady) {
      setClerkSlowWarning(null);
      return;
    }
    const t = setTimeout(() => {
      setClerkSlowWarning(
        __DEV__
          ? `Authentication is taking longer than expected. Network may be blocking ${env.CLERK_INSTANCE_HOST}. Try cellular or another Wi-Fi.`
          : 'Sign-in is taking longer than expected. Please check your connection and try again.',
      );
    }, 12000);
    return () => clearTimeout(t);
  }, [isOAuthReady]);

  useEffect(() => {
    if (!__DEV__ || !isOAuthReady) return;
    console.log(`[Auth] SignUp factors (${decodeClerkHost(env.CLERK_PUBLISHABLE_KEY)}): ${listStrategies(signIn)}`);
  }, [isOAuthReady, signIn]);

  const orbStyle = useAnimatedStyle(() => ({
    opacity: orbOpacity.value,
    transform: [{ scale: orbScale.value }],
  }));
  const brandStyle = useAnimatedStyle(() => ({
    opacity: brandOpacity.value * contentOpacity.value,
    transform: [{ translateY: brandTranslateY.value }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value * contentOpacity.value,
    transform: [{ translateY: taglineTranslateY.value }],
  }));
  const oauth1Style = useAnimatedStyle(() => ({
    opacity: oauthOpacity1.value * contentOpacity.value,
    transform: [{ translateY: oauthTranslateY1.value }],
  }));
  const oauth2Style = useAnimatedStyle(() => ({
    opacity: oauthOpacity2.value * contentOpacity.value,
    transform: [{ translateY: oauthTranslateY2.value }],
  }));
  const dividerStyle = useAnimatedStyle(() => ({
    opacity: dividerOpacity.value * contentOpacity.value,
    transform: [{ scaleX: dividerScaleX.value }],
  }));
  const emailStyle = useAnimatedStyle(() => ({
    opacity: emailOpacity.value * contentOpacity.value,
    transform: [{ translateY: emailTranslateY.value }],
  }));
  const passwordStyle = useAnimatedStyle(() => ({
    opacity: passwordOpacity.value * contentOpacity.value,
    transform: [{ translateY: passwordTranslateY.value }],
  }));
  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value * contentOpacity.value,
    transform: [{ translateY: buttonTranslateY.value }],
  }));
  const footerStyle = useAnimatedStyle(() => ({
    opacity: footerOpacity.value * contentOpacity.value,
  }));
  const errorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: errorTranslateX.value }],
  }));
  const verifyStyle = useAnimatedStyle(() => ({
    opacity: verifyOpacity.value,
    transform: [{ scale: verifyScale.value }],
  }));

  const startSSOWithRetry = useCallback(async (
    strategy: 'oauth_apple' | 'oauth_google',
    redirectUrl: string,
  ) => {
    const run = () => startSSOFlow({ strategy, redirectUrl });
    try {
      return await run();
    } catch (err) {
      if (!isMissingSSORedirectError(err)) throw err;
      if (__DEV__) {
        console.warn(
          `[Auth] ${strategy} missing external verification redirect URL. Retrying once after signIn.reload(). ${getSSODebugState(signIn)}`,
        );
      }
      try {
        await signIn?.reload?.();
      } catch {}
      await sleep(350);
      try {
        return await run();
      } catch (retryErr) {
        throw new Error(
          __DEV__
            ? `${getAuthErrorMessage(retryErr)}\nDetails: ${getSSODebugState(signIn)}`
            : getAuthErrorMessage(retryErr),
        );
      }
    }
  }, [signIn, startSSOFlow]);

  const handleAppleSignUp = useCallback(async () => {
    if (!isOAuthReady) {
      setError('Authentication is still initializing. Please try again in a moment.');
      return;
    }
    if (__DEV__ && (
      isStrategyExplicitlyUnavailable(signIn, 'oauth_token_apple')
      && isStrategyExplicitlyUnavailable(signIn, 'oauth_apple')
    )) {
      console.warn(`[Auth] Apple may be disabled on this instance (${decodeClerkHost(env.CLERK_PUBLISHABLE_KEY)}). Factors: ${listStrategies(signIn)}`);
    }
    try {
      setError(null);
      setOauthLoading('apple');
      trackEvent('auth_sign_up_started', { method: 'apple' });
      const redirectUrl = getOAuthRedirectUrl();

      const result = Platform.OS === 'ios'
        ? await startAppleAuthenticationFlow()
        : await startSSOWithRetry('oauth_apple', redirectUrl);

      await ensureOAuthSession(result, 'apple');
    } catch (err: unknown) {
      if (isSignUpCompletionRequiredError(err)) {
        setOauthLoading(null);
        router.push({
          pathname: '/auth/complete-signup',
          params: {
            method: err.context.method,
            missing: err.context.missingFields.join(','),
            unverified: err.context.unverifiedFields.join(','),
          },
        } as any);
        return;
      }
      if (!isAppleAuthCancelError(err)) {
        const message = buildOAuthFailureMessage(err, getOAuthRedirectUrl());
        trackEvent('auth_sign_up_failed', { method: 'apple', error: message });
        setError(message);
      }
    } finally {
      setOauthLoading(null);
    }
  }, [isOAuthReady, signIn, startAppleAuthenticationFlow, startSSOWithRetry]);

  const handleGoogleSignUp = useCallback(async () => {
    if (!isOAuthReady) {
      setError('Authentication is still initializing. Please try again in a moment.');
      return;
    }
    if (__DEV__ && isStrategyExplicitlyUnavailable(signIn, 'oauth_google')) {
      console.warn(`[Auth] Google may be disabled on this instance (${decodeClerkHost(env.CLERK_PUBLISHABLE_KEY)}). Factors: ${listStrategies(signIn)}`);
    }
    try {
      setError(null);
      setOauthLoading('google');
      trackEvent('auth_sign_up_started', { method: 'google' });

      const redirectUrl = getOAuthRedirectUrl();
      const result = await startSSOWithRetry('oauth_google', redirectUrl);

      await ensureOAuthSession(result, 'google');
    } catch (err: unknown) {
      if (isSignUpCompletionRequiredError(err)) {
        setOauthLoading(null);
        router.push({
          pathname: '/auth/complete-signup',
          params: {
            method: err.context.method,
            missing: err.context.missingFields.join(','),
            unverified: err.context.unverifiedFields.join(','),
          },
        } as any);
        return;
      }
      const message = buildOAuthFailureMessage(err, getOAuthRedirectUrl());
      if (!message.includes('cancel')) {
        trackEvent('auth_sign_up_failed', { method: 'google', error: message });
        setError(message);
      }
    } finally {
      setOauthLoading(null);
    }
  }, [isOAuthReady, signIn, startSSOWithRetry]);

  const handleEmailSignUp = useCallback(async () => {
    if (!isEmailAuthReady || !signUp) {
      setError('Email sign-up is still initializing. Please try again in a moment.');
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    try {
      setError(null);
      setLoading(true);
      trackEvent('auth_sign_up_started', { method: 'email' });

      await signUp.create({ emailAddress: trimmedEmail, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

      // Transition to verification
      contentOpacity.value = withTiming(0, { duration: 300 });
      setTimeout(() => {
        setPendingVerification(true);
        verifyOpacity.value = withTiming(1, { duration: 500, easing: CALM_EASING });
        verifyScale.value = withTiming(1, { duration: 500, easing: CALM_EASING });
      }, 300);
    } catch (err: unknown) {
      const message = getAuthErrorMessage(err, 'Unable to create account.');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isEmailAuthReady, signUp, email, password]);

  const handleVerification = useCallback(async () => {
    if (!isVerificationReady || !signUp) {
      setError('Verification is still initializing. Please try again in a moment.');
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        trackEvent('auth_sign_up_completed', { method: 'email' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: unknown) {
      const message = getAuthErrorMessage(err, 'Invalid verification code.');
      trackEvent('auth_sign_up_failed', { method: 'email', error: message });
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isVerificationReady, signUp, setActive, verificationCode]);

  const handleResendCode = useCallback(async () => {
    if (!isVerificationReady || !signUp || !canResend) return;
    try {
      setError(null);
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setCountdown(60);
      setCanResend(false);
    } catch (err: unknown) {
      const message = getAuthErrorMessage(err, 'Unable to resend code.');
      setError(message);
    }
  }, [isVerificationReady, signUp, canResend]);

  const isBusy = loading || oauthLoading !== null;
  const isEmailDisabled = isBusy || !isEmailAuthReady;
  const isVerificationDisabled = loading || !isVerificationReady;
  const isOAuthDisabled = isBusy || !isOAuthReady;
  // Render buttons whenever Clerk is initialized and the env kill-switch is on.
  // See sign-in.tsx for the reasoning — supportedFirstFactors is unreliable for gating.
  const showAppleOAuth = env.ENABLE_APPLE_OAUTH && isOAuthReady;
  const showGoogleOAuth = env.ENABLE_GOOGLE_OAUTH && isOAuthReady;
  const showOAuthDivider = showAppleOAuth || showGoogleOAuth;

  if (pendingVerification) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
        >
          <Animated.View style={[styles.verifyContainer, verifyStyle]}>
            <Text style={styles.verifyTitle}>Check your email</Text>
            <Text style={styles.verifySubtitle}>
              We sent a verification code to {email}
            </Text>

            {error ? (
              <Animated.View style={[styles.errorContainer, errorStyle]}>
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            <TextInput
              style={styles.codeInput}
              placeholder="Enter code"
              placeholderTextColor={Colors.textDim}
              value={verificationCode}
              onChangeText={setVerificationCode}
              keyboardType="number-pad"
              autoFocus
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.signUpButton, isVerificationDisabled && styles.buttonDisabled]}
              onPress={handleVerification}
              disabled={isVerificationDisabled}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <Text style={styles.signUpButtonText}>Verify</Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              {canResend ? (
                <TouchableOpacity onPress={handleResendCode} disabled={loading}>
                  <Text style={styles.resendLink}>Resend code</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.countdownText}>
                  Resend code in {countdown}s
                </Text>
              )}
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Branding */}
          <View style={styles.brandContainer}>
            <Animated.View style={orbStyle}>
              <Image
                source={require('../../assets/app-icons/og-rose.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </Animated.View>
            <Animated.Text style={[styles.brandName, brandStyle]}>Glowlytics</Animated.Text>
            <Animated.Text style={[styles.brandTagline, taglineStyle]}>Create your account</Animated.Text>
          </View>

          {error ? (
            <Animated.View style={[styles.errorContainer, errorStyle]}>
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          ) : null}
          {!error && clerkSlowWarning ? (
            <View style={styles.infoContainer}>
              <Text style={styles.infoText}>{clerkSlowWarning}</Text>
            </View>
          ) : null}

          {/* OAuth */}
          {showAppleOAuth ? (
            <Animated.View style={oauth1Style}>
              <TouchableOpacity
                style={styles.appleButton}
                onPress={handleAppleSignUp}
                disabled={isOAuthDisabled}
                activeOpacity={0.8}
              >
                {oauthLoading === 'apple' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.appleIcon}>{'\uF8FF'}</Text>
                    <Text style={styles.appleButtonText}>Continue with Apple</Text>
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          {showGoogleOAuth ? (
            <Animated.View style={oauth2Style}>
              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleSignUp}
                disabled={isOAuthDisabled}
                activeOpacity={0.8}
              >
                {oauthLoading === 'google' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.googleIcon}>G</Text>
                    <Text style={styles.googleButtonText}>Continue with Google</Text>
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          {/* Divider */}
          {showOAuthDivider ? (
            <Animated.View style={[styles.divider, dividerStyle]}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </Animated.View>
          ) : null}

          {/* Email / Password */}
          <Animated.View style={[styles.inputContainer, emailStyle]}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textDim}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!isBusy}
            />
          </Animated.View>

          <Animated.View style={[styles.inputContainer, passwordStyle]}>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="At least 8 characters"
              placeholderTextColor={Colors.textDim}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              editable={!isBusy}
            />
          </Animated.View>

          <Animated.View style={buttonStyle}>
            <TouchableOpacity
              style={[styles.signUpButton, isEmailDisabled && styles.buttonDisabled]}
              onPress={handleEmailSignUp}
              disabled={isEmailDisabled}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <Text style={styles.signUpButtonText}>Create account</Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Health disclaimer */}
          <Animated.View style={[styles.disclaimer, footerStyle]}>
            <Text style={styles.disclaimerText}>
              Glowlytics tracks skin metrics and trends. It does not provide medical diagnoses.
            </Text>
          </Animated.View>

          {/* Footer */}
          <Animated.View style={[styles.footer, footerStyle]}>
            <Text style={styles.footerText}>
              Already have an account?{' '}
              <Text
                style={styles.footerLink}
                onPress={() => router.replace('/auth/sign-in')}
              >
                Sign in
              </Text>
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Glow.palette.bg,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
    justifyContent: 'center',
    gap: Spacing.md,
  },

  // Branding
  brandContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  brandName: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    letterSpacing: 0.5,
  },
  brandTagline: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    marginTop: Spacing.xs,
  },

  // Error
  errorContainer: {
    backgroundColor: 'rgba(209, 67, 67, 0.08)',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(209, 67, 67, 0.18)',
    padding: Spacing.md,
  },
  errorText: {
    color: Colors.error,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  infoContainer: {
    backgroundColor: 'rgba(58, 158, 143, 0.08)',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(58, 158, 143, 0.2)',
    padding: Spacing.md,
  },
  infoText: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
  },

  // OAuth
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Glow.palette.ink,
    height: 56,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  appleIcon: {
    fontSize: FontSize.xl,
    color: Glow.palette.surface,
  },
  appleButtonText: {
    color: Glow.palette.surface,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Glow.palette.surface, borderWidth: 1, borderColor: Glow.palette.glow,
    height: 56,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  googleIcon: {
    fontSize: FontSize.xl,
    color: Glow.palette.surface,
    fontFamily: FontFamily.sansBold,
  },
  googleButtonText: {
    color: Glow.palette.surface,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Glow.palette.glow,
  },
  dividerText: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    marginHorizontal: Spacing.md,
  },

  // Form
  inputContainer: {
    gap: Spacing.xs,
  },
  inputLabel: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  input: {
    backgroundColor: Glow.palette.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    height: 52,
    paddingHorizontal: Spacing.md,
    color: Glow.palette.ink,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
  },
  signUpButton: {
    backgroundColor: Glow.palette.accent,
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signUpButtonText: {
    color: Glow.palette.bg,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  // Disclaimer
  disclaimer: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
  },
  disclaimerText: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    lineHeight: 18,
    textAlign: 'center',
  },

  // Verification
  verifyContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  verifyTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    textAlign: 'center',
  },
  verifySubtitle: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  codeInput: {
    backgroundColor: Glow.palette.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    height: 56,
    paddingHorizontal: Spacing.md,
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xl,
    textAlign: 'center',
    letterSpacing: 8,
  },
  resendRow: {
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  countdownText: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
  },
  resendLink: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },

  // Footer
  footer: {
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  footerText: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
  },
  footerLink: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansSemiBold,
  },
});
