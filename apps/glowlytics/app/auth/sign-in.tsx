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
import { useSSO, useSignIn, useSignInWithApple, useSignUp } from '@clerk/clerk-expo';
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
  onSuccess: () => void,
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
    onSuccess();
    return;
  }

  if (result?.signUp?.verifications?.externalAccount?.status === 'verified') {
    const completeSignUp = await result.signUp.update({});
    if (completeSignUp.status === 'complete' && completeSignUp.createdSessionId) {
      await result.setActive?.({ session: completeSignUp.createdSessionId });
      trackEvent('auth_sign_up_completed', { method });
      onSuccess();
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

const getFactorStrategies = (factors: any[] | null | undefined): string[] =>
  Array.isArray(factors)
    ? factors
      .map((factor) => factor?.strategy)
      .filter((value: unknown): value is string => typeof value === 'string')
    : [];

const describeIncompleteEmailSignIn = (result: any): string => {
  const status = result?.status;
  if (status === 'needs_second_factor') {
    const factors = getFactorStrategies(result?.supportedSecondFactors);
    const factorLabel = factors.length > 0 ? ` (${factors.join(', ')})` : '';
    return `This account requires a second factor${factorLabel}. For App Review, remove MFA from the demo account in Clerk or use an account that completes with email and password only.`;
  }
  if (status === 'needs_new_password') {
    return 'This account must set a new password before it can sign in. Use Forgot password or reset the demo account password in Clerk.';
  }
  if (status === 'needs_first_factor') {
    const factors = getFactorStrategies(result?.supportedFirstFactors);
    const factorLabel = factors.length > 0 ? ` Available factors: ${factors.join(', ')}.` : '';
    return `Password sign-in did not complete for this account.${factorLabel}`;
  }
  if (status === 'needs_identifier') {
    return 'Clerk did not accept this sign-in identifier. Verify the demo account email exists in the production Clerk instance.';
  }
  return `Authentication did not complete (status=${status || 'unknown'}).`;
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

export default function SignInScreen() {
  const router = useRouter();
  const { startSSOFlow } = useSSO();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { isLoaded: isSignUpLoaded } = useSignUp();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const isEmailAuthReady = isLoaded;
  const isOAuthReady = isLoaded && isSignUpLoaded;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clerkSlowWarning, setClerkSlowWarning] = useState<string | null>(null);
  const [successAnimating, setSuccessAnimating] = useState(false);

  // Staggered entrance animations
  const orbOpacity = useSharedValue(0);
  const orbScale = useSharedValue(0.85);
  const brandOpacity = useSharedValue(0);
  const brandTranslateY = useSharedValue(20);
  const welcomeOpacity = useSharedValue(0);
  const welcomeTranslateY = useSharedValue(20);
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

  // Error shake
  const errorTranslateX = useSharedValue(0);

  // Success animation
  const contentOpacity = useSharedValue(1);
  const successOrbScale = useSharedValue(1);

  useEffect(() => {
    // Logo orb
    orbOpacity.value = withTiming(1, { duration: 600, easing: CALM_EASING });
    orbScale.value = withTiming(1, { duration: 600, easing: CALM_EASING });

    // Brand name
    brandOpacity.value = withDelay(200, withTiming(1, { duration: 500, easing: CALM_EASING }));
    brandTranslateY.value = withDelay(200, withTiming(0, { duration: 500, easing: CALM_EASING }));

    // Welcome
    welcomeOpacity.value = withDelay(350, withTiming(1, { duration: 500, easing: CALM_EASING }));
    welcomeTranslateY.value = withDelay(350, withTiming(0, { duration: 500, easing: CALM_EASING }));

    // OAuth buttons
    oauthOpacity1.value = withDelay(500, withTiming(1, { duration: 500, easing: CALM_EASING }));
    oauthTranslateY1.value = withDelay(500, withTiming(0, { duration: 500, easing: CALM_EASING }));
    oauthOpacity2.value = withDelay(620, withTiming(1, { duration: 500, easing: CALM_EASING }));
    oauthTranslateY2.value = withDelay(620, withTiming(0, { duration: 500, easing: CALM_EASING }));

    // Divider
    dividerOpacity.value = withDelay(740, withTiming(1, { duration: 400, easing: CALM_EASING }));
    dividerScaleX.value = withDelay(740, withTiming(1, { duration: 400, easing: CALM_EASING }));

    // Email
    emailOpacity.value = withDelay(900, withTiming(1, { duration: 500, easing: CALM_EASING }));
    emailTranslateY.value = withDelay(900, withTiming(0, { duration: 500, easing: CALM_EASING }));

    // Password
    passwordOpacity.value = withDelay(1020, withTiming(1, { duration: 500, easing: CALM_EASING }));
    passwordTranslateY.value = withDelay(1020, withTiming(0, { duration: 500, easing: CALM_EASING }));

    // Sign-in button
    buttonOpacity.value = withDelay(1140, withTiming(1, { duration: 500, easing: CALM_EASING }));
    buttonTranslateY.value = withDelay(1140, withTiming(0, { duration: 500, easing: CALM_EASING }));

    // Footer
    footerOpacity.value = withDelay(1300, withTiming(1, { duration: 400, easing: CALM_EASING }));
  }, []);

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
    console.log(`[Auth] SignIn factors (${decodeClerkHost(env.CLERK_PUBLISHABLE_KEY)}): ${listStrategies(signIn)}`);
  }, [isOAuthReady, signIn]);

  const orbStyle = useAnimatedStyle(() => ({
    opacity: orbOpacity.value,
    transform: [{ scale: orbScale.value * successOrbScale.value }],
  }));
  const brandStyle = useAnimatedStyle(() => ({
    opacity: brandOpacity.value * contentOpacity.value,
    transform: [{ translateY: brandTranslateY.value }],
  }));
  const welcomeStyle = useAnimatedStyle(() => ({
    opacity: welcomeOpacity.value * contentOpacity.value,
    transform: [{ translateY: welcomeTranslateY.value }],
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

  const triggerSuccessAnimation = useCallback(() => {
    setSuccessAnimating(true);
    contentOpacity.value = withTiming(0, { duration: 400 });
    successOrbScale.value = withTiming(1.2, { duration: 500, easing: CALM_EASING });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

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

  const handleAppleSignIn = useCallback(async () => {
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
      trackEvent('auth_sign_in_started', { method: 'apple' });
      const redirectUrl = getOAuthRedirectUrl();

      const result = Platform.OS === 'ios'
        ? await startAppleAuthenticationFlow()
        : await startSSOWithRetry('oauth_apple', redirectUrl);

      await ensureOAuthSession(result, 'apple', triggerSuccessAnimation);
    } catch (err: unknown) {
      if (!isAppleAuthCancelError(err)) {
        const message = buildOAuthFailureMessage(err, getOAuthRedirectUrl());
        trackEvent('auth_sign_in_failed', { method: 'apple', error: message });
        setError(message);
      }
    } finally {
      setOauthLoading(null);
    }
  }, [isOAuthReady, signIn, startAppleAuthenticationFlow, startSSOWithRetry, triggerSuccessAnimation]);

  const handleGoogleSignIn = useCallback(async () => {
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
      trackEvent('auth_sign_in_started', { method: 'google' });

      const redirectUrl = getOAuthRedirectUrl();
      const result = await startSSOWithRetry('oauth_google', redirectUrl);

      await ensureOAuthSession(result, 'google', triggerSuccessAnimation);
    } catch (err: unknown) {
      const message = buildOAuthFailureMessage(err, getOAuthRedirectUrl());
      if (!message.includes('cancel')) {
        trackEvent('auth_sign_in_failed', { method: 'google', error: message });
        setError(message);
      }
    } finally {
      setOauthLoading(null);
    }
  }, [isOAuthReady, signIn, startSSOWithRetry, triggerSuccessAnimation]);

  const handleEmailSignIn = useCallback(async () => {
    if (!isEmailAuthReady || !signIn) {
      setError('Email sign-in is still initializing. Please try again in a moment.');
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }

    try {
      setError(null);
      setLoading(true);
      trackEvent('auth_sign_in_started', { method: 'email' });

      const result = await signIn.create({
        identifier: trimmedEmail,
        password,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        trackEvent('auth_sign_in_completed', { method: 'email' });
        triggerSuccessAnimation();
      } else {
        const message = describeIncompleteEmailSignIn(result);
        if (__DEV__) {
          console.warn('[Auth] Incomplete email sign-in:', {
            status: result.status,
            supportedFirstFactors: getFactorStrategies(result.supportedFirstFactors),
            supportedSecondFactors: getFactorStrategies(result.supportedSecondFactors),
          });
        }
        trackEvent('auth_sign_in_failed', { method: 'email', error: message, status: result.status || 'unknown' });
        setError(message);
      }
    } catch (err: unknown) {
      const message = getAuthErrorMessage(err, 'Invalid email or password.');
      trackEvent('auth_sign_in_failed', { method: 'email', error: message });
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isEmailAuthReady, signIn, setActive, email, password, triggerSuccessAnimation]);

  const isBusy = loading || oauthLoading !== null || successAnimating;
  const isEmailDisabled = isBusy || !isEmailAuthReady;
  const isOAuthDisabled = isBusy || !isOAuthReady;

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
            <Animated.Text style={[styles.brandTagline, welcomeStyle]}>Welcome back</Animated.Text>
          </View>

          {/* Error message */}
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

          {/* OAuth Buttons */}
          <Animated.View style={[styles.oauthSection, oauth1Style]}>
            <TouchableOpacity
              style={styles.appleButton}
              onPress={handleAppleSignIn}
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

          <Animated.View style={oauth2Style}>
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
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
              editable={!isBusy}
            />
          </Animated.View>

          <Animated.View style={[styles.inputContainer, passwordStyle]}>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={Colors.textDim}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              editable={!isBusy}
            />
            <TouchableOpacity
              style={styles.forgotLink}
              onPress={() => router.push('/auth/forgot-password')}
              disabled={isBusy}
            >
              <Text style={styles.forgotLinkText}>Forgot password?</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={buttonStyle}>
            <TouchableOpacity
              style={[styles.signInButton, isEmailDisabled && styles.buttonDisabled]}
              onPress={handleEmailSignIn}
              disabled={isEmailDisabled}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <Text style={styles.signInButtonText}>Sign in</Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Footer */}
          <Animated.View style={[styles.footer, footerStyle]}>
            <Text style={styles.footerText}>
              Don't have an account?{' '}
              <Text
                style={styles.footerLink}
                onPress={() => router.replace('/auth/sign-up')}
              >
                Sign up
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
  oauthSection: {
    marginBottom: 0,
  },
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
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: Spacing.xs,
  },
  forgotLinkText: {
    color: Colors.secondary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  signInButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInButtonText: {
    color: Colors.background,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  buttonDisabled: {
    opacity: 0.6,
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
