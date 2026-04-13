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
  Spacing,
  BorderRadius,
} from '../../src/constants/theme';
import { trackEvent } from '../../src/services/analytics';
import { env } from '../../src/config/env';

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

const buildOAuthFailureMessage = (err: unknown, redirectUrl: string) => {
  const base = getAuthErrorMessage(err);
  const host = decodeClerkHost(env.CLERK_PUBLISHABLE_KEY);
  const withNetworkHint = (message: string) => {
    if (/missing external verification redirect url|network|timed out|503|failed to fetch/i.test(message)) {
      return `${message}\nNetwork may be blocking ${host}. Try cellular or a different Wi-Fi network.`;
    }
    return message;
  };
  if (/redirect|callback|oauth/i.test(base)) {
    return withNetworkHint(`${base}\nRedirect URL: ${redirectUrl}\nClerk instance: ${host}`);
  }
  return withNetworkHint(base);
};

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
    await result.setActive?.({ session: result.createdSessionId });
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
      await result.setActive?.({ session: completeSignUp.createdSessionId });
      trackEvent('auth_sign_up_completed', { method });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
  }

  const hasStatuses = Boolean(result?.signIn?.status || result?.signUp?.status);
  if (!authSessionType && !hasStatuses) {
    if (method === 'apple') {
      throw new Error('Apple sign-in returned no session. Verify Apple is enabled for this Clerk instance.');
    }
    if (method === 'google') {
      throw new Error('Google sign-in returned no session. Verify Google is enabled for this Clerk instance.');
    }
  }

  const signInStatus = result?.signIn?.status;
  const signUpStatus = result?.signUp?.status;
  throw new Error(
    `Authentication did not complete (signIn=${signInStatus || 'none'}, signUp=${signUpStatus || 'none'}).`,
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
  const { isLoaded: isSignInLoaded, signIn } = useSignIn();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
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
        `Authentication is taking longer than expected. Network may be blocking ${env.CLERK_INSTANCE_HOST}. Try cellular or another Wi-Fi.`,
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
        throw new Error(`${getAuthErrorMessage(retryErr)}\nDetails: ${getSSODebugState(signIn)}`);
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
    if (!isLoaded || !signUp) return;

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
  }, [isLoaded, signUp, email, password]);

  const handleVerification = useCallback(async () => {
    if (!isLoaded || !signUp) return;

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
  }, [isLoaded, signUp, setActive, verificationCode]);

  const handleResendCode = useCallback(async () => {
    if (!isLoaded || !signUp || !canResend) return;
    try {
      setError(null);
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setCountdown(60);
      setCanResend(false);
    } catch (err: unknown) {
      const message = getAuthErrorMessage(err, 'Unable to resend code.');
      setError(message);
    }
  }, [isLoaded, signUp, canResend]);

  const isDisabled = loading || oauthLoading !== null || !isOAuthReady;

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
            />

            <TouchableOpacity
              style={[styles.signUpButton, isDisabled && styles.buttonDisabled]}
              onPress={handleVerification}
              disabled={isDisabled}
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
                <TouchableOpacity onPress={handleResendCode}>
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
                source={require('../../assets/icon.png')}
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
          <Animated.View style={oauth1Style}>
            <TouchableOpacity
              style={styles.appleButton}
              onPress={handleAppleSignUp}
              disabled={isDisabled}
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

          <Animated.View style={oauth2Style}>
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignUp}
              disabled={isDisabled}
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

          {/* Divider */}
          <Animated.View style={[styles.divider, dividerStyle]}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </Animated.View>

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
              editable={!isDisabled}
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
              editable={!isDisabled}
            />
          </Animated.View>

          <Animated.View style={buttonStyle}>
            <TouchableOpacity
              style={[styles.signUpButton, isDisabled && styles.buttonDisabled]}
              onPress={handleEmailSignUp}
              disabled={isDisabled}
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
    backgroundColor: Colors.background,
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
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    letterSpacing: 0.5,
  },
  brandTagline: {
    color: Colors.textSecondary,
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
    color: Colors.textSecondary,
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
    backgroundColor: '#000000',
    height: 56,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  appleIcon: {
    fontSize: FontSize.xl,
    color: Colors.textOnDark,
  },
  appleButtonText: {
    color: Colors.textOnDark,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
    height: 56,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  googleIcon: {
    fontSize: FontSize.xl,
    color: Colors.textOnDark,
    fontFamily: FontFamily.sansBold,
  },
  googleButtonText: {
    color: Colors.textOnDark,
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
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textDim,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    marginHorizontal: Spacing.md,
  },

  // Form
  inputContainer: {
    gap: Spacing.xs,
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    height: 52,
    paddingHorizontal: Spacing.md,
    color: Colors.text,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
  },
  signUpButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signUpButtonText: {
    color: Colors.background,
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
    color: Colors.textDim,
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
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    textAlign: 'center',
  },
  verifySubtitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  codeInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    height: 56,
    paddingHorizontal: Spacing.md,
    color: Colors.text,
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
    color: Colors.textMuted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
  },
  resendLink: {
    color: Colors.secondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },

  // Footer
  footer: {
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  footerText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
  },
  footerLink: {
    color: Colors.secondary,
    fontFamily: FontFamily.sansSemiBold,
  },
});
