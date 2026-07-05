/**
 * Finish creating a Clerk user after an OAuth provider (typically Apple)
 * succeeded but didn't supply every field Clerk needs.
 *
 * Flow:
 *   1. Mount with `useSignUp()` — the resource was populated by the prior
 *      `signUp.create({ transfer: true })` call inside the Clerk Apple hook.
 *   2. Show inputs for every field listed in `signUp.missingFields`.
 *   3. On submit, call `signUp.update({...})`. After update Clerk may decide
 *      the email needs verification (`unverifiedFields.includes('email_address')`);
 *      if so, send an OTP and switch to the verification step.
 *   4. OTP step: `signUp.attemptEmailAddressVerification({ code })`.
 *   5. Whenever `signUp.status === 'complete'`, call `setActive` and route to
 *      `/(tabs)/today` — same as the email signup path.
 *
 * If the user lands here without a pending signUp resource (deep link, app
 * restart, etc.) we surface a "start over" message rather than dead-ending
 * with a blank screen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSignUp } from '@clerk/clerk-expo';
import * as Haptics from 'expo-haptics';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Glow,
  Spacing,
} from '../../src/constants/theme';
import { trackEvent } from '../../src/services/analytics';
import {
  fieldLabel,
  friendlyAuthErrorMessage,
} from '../../src/services/oauthCompletion';

type OAuthMethod = 'apple' | 'google';

const EMAIL_FIELD = 'email_address';

const SUPPORTED_FIELDS = new Set([
  EMAIL_FIELD,
  'first_name',
  'last_name',
  'username',
]);

const parseList = (raw: unknown): string[] => {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

export default function CompleteSignUpScreen() {
  const router = useRouter();
  const { signUp, setActive, isLoaded } = useSignUp();
  const params = useLocalSearchParams<{ method?: string; missing?: string; unverified?: string }>();

  const method: OAuthMethod = params.method === 'google' ? 'google' : 'apple';
  const initialMissing = useMemo(() => parseList(params.missing), [params.missing]);
  const initialUnverified = useMemo(() => parseList(params.unverified), [params.unverified]);

  // The signUp resource is the live source of truth once we have it. We keep
  // the URL params as a hint for what to render before useSignUp finishes
  // loading, but fall back to the resource after first render so subsequent
  // update() calls drive UI state.
  const missingFields = useMemo(() => {
    const fromResource = (signUp?.missingFields || []).map(String);
    return fromResource.length > 0 ? fromResource : initialMissing;
  }, [signUp?.missingFields, initialMissing]);

  const unverifiedFields = useMemo(() => {
    const fromResource = (signUp?.unverifiedFields || []).map(String);
    return fromResource.length > 0 ? fromResource : initialUnverified;
  }, [signUp?.unverifiedFields, initialUnverified]);

  // Form state — one entry per supported missing field. We initialise lazily
  // and reset whenever the resource itself changes identity.
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OTP state — only relevant if Clerk requires email verification.
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpResending, setOtpResending] = useState(false);

  // Idempotency gate — Clerk's `useSignUp().signUp` mutates in place, and our
  // `useEffect` watcher on `signUp.status` can fire after the explicit
  // `handleVerifyOtp` already triggered `finishSession`. Without this ref the
  // second `setActive` call surfaces a Clerk "session already active" toast
  // immediately after a successful sign-up.
  const activatedRef = useRef(false);

  const setValue = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const finishSession = useCallback(async () => {
    if (activatedRef.current) return;
    if (!signUp || !setActive) return;
    try {
      if (signUp.status === 'complete' && signUp.createdSessionId) {
        activatedRef.current = true;
        await setActive({ session: signUp.createdSessionId });
        trackEvent('auth_sign_up_completed', { method });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        // Do NOT navigate here — AuthRedirector in _layout.tsx routes by auth state.
        // Navigating to /(tabs)/today races with the redirector when onboarding
        // hasn't been completed, producing a visible flash before bouncing to onboarding.
        return;
      }
      // Status didn't end in 'complete' even after we satisfied every known
      // field — surface a clear error so the user (and us in logs) know what
      // Clerk still wants.
      setError(
        signUp.status === 'missing_requirements'
          ? `Sign-up still needs: ${(signUp.missingFields || []).map(String).map(fieldLabel).join(', ') || 'additional info'}.`
          : 'Sign-up didn\u2019t finish. Please try again.',
      );
      setSubmitting(false);
      setVerifying(false);
    } catch (e) {
      activatedRef.current = false; // allow retry on setActive failure
      setError(friendlyAuthErrorMessage(e));
      setSubmitting(false);
      setVerifying(false);
    }
  }, [signUp, setActive, method]);

  // Pre-fill email from the signUp resource when Apple supplied it.
  useEffect(() => {
    const existing = signUp?.emailAddress;
    if (existing && !values[EMAIL_FIELD]) {
      setValues((prev) => ({ ...prev, [EMAIL_FIELD]: existing }));
    }
    // values intentionally excluded — we only want to seed once per signUp identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signUp?.emailAddress]);

  // Edge case: Clerk already considers the resource complete (e.g. duplicate
  // route entry after success). Activate via `finishSession`, gated by
  // `activatedRef` so we never call setActive twice.
  useEffect(() => {
    if (signUp?.status === 'complete' && signUp?.createdSessionId) {
      void finishSession();
    }
  }, [signUp?.status, signUp?.createdSessionId, finishSession]);

  // ─────────── No hooks below this line — early returns are safe. ───────────

  // If the resource hasn't loaded yet (Clerk still initialising), show a
  // small spinner instead of an empty form.
  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={Glow.palette.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // No pending signUp at all — Clerk client was reset between Apple flow and
  // arriving here (cold start, navigation backstack push, etc.). The honest
  // recovery path is to send them back to the sign-up screen.
  if (!signUp) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.title}>Let&rsquo;s try that again</Text>
          <Text style={styles.body}>
            We lost track of your in-progress sign-up. Please tap{' '}
            {method === 'apple' ? 'Continue with Apple' : 'Continue with Google'} again to retry.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.85}
            onPress={() => router.replace('/auth/sign-up' as any)}
          >
            <Text style={styles.primaryButtonText}>Back to sign-up</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleSubmit = async () => {
    setError(null);

    // Build the update payload from collected values, mapping snake_case →
    // Clerk's camelCase param names. Any missing field that isn't supported
    // by this screen will fall through and Clerk will reject; we surface that.
    const payload: Record<string, string> = {};
    for (const field of missingFields) {
      if (!SUPPORTED_FIELDS.has(field)) continue;
      const value = (values[field] || '').trim();
      if (!value) {
        setError(`${fieldLabel(field)} is required.`);
        return;
      }
      switch (field) {
        case EMAIL_FIELD:
          payload.emailAddress = value;
          break;
        case 'first_name':
          payload.firstName = value;
          break;
        case 'last_name':
          payload.lastName = value;
          break;
        case 'username':
          payload.username = value;
          break;
      }
    }

    setSubmitting(true);
    try {
      const updated = await signUp.update(payload as any);
      trackEvent('auth_sign_up_completion_updated', {
        method,
        status: updated.status || 'unknown',
        unverified: (updated.unverifiedFields || []).join(',') || 'none',
      });

      // Email needs OTP verification.
      if ((updated.unverifiedFields || []).map(String).includes(EMAIL_FIELD)) {
        await updated.prepareEmailAddressVerification({ strategy: 'email_code' });
        trackEvent('auth_sign_up_email_otp_sent', { method });
        setOtpStep(true);
        setSubmitting(false);
        return;
      }

      // Update completed Clerk's requirements; activate.
      await finishSession();
    } catch (e) {
      setError(friendlyAuthErrorMessage(e));
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    const code = otpCode.trim();
    if (code.length === 0) {
      setError('Enter the code we sent to your email.');
      return;
    }
    setVerifying(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      trackEvent('auth_sign_up_email_otp_verified', {
        method,
        status: result.status || 'unknown',
      });
      await finishSession();
    } catch (e) {
      setError(friendlyAuthErrorMessage(e));
      setVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpResending) return;
    setOtpResending(true);
    setError(null);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      trackEvent('auth_sign_up_email_otp_resent', { method });
    } catch (e) {
      setError(friendlyAuthErrorMessage(e));
    } finally {
      setOtpResending(false);
    }
  };

  // We render the OTP step the moment email verification is required, even
  // if other fields are also missing (Clerk handles them in order — email
  // first, then anything else, on subsequent update() calls).
  const showOtp = otpStep || unverifiedFields.includes(EMAIL_FIELD);

  const supportedMissing = missingFields.filter((f) => SUPPORTED_FIELDS.has(f));
  const unsupportedMissing = missingFields.filter((f) => !SUPPORTED_FIELDS.has(f));

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
          <Text style={styles.eyebrow}>One more step</Text>
          <Text style={styles.title}>
            {showOtp ? 'Verify your email' : 'Finish setting up your account'}
          </Text>
          <Text style={styles.body}>
            {showOtp
              ? `We sent a 6-digit code to ${values[EMAIL_FIELD] || 'your email address'}. Enter it below to confirm.`
              : method === 'apple'
                ? 'Apple didn’t share everything we need. Add the details below to finish creating your account.'
                : 'Add the details below to finish creating your account.'}
          </Text>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {!showOtp ? (
            <View style={styles.fields}>
              {supportedMissing.map((field) => (
                <View key={field} style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>{fieldLabel(field)}</Text>
                  <TextInput
                    style={styles.input}
                    value={values[field] || ''}
                    onChangeText={(t) => setValue(field, t)}
                    autoCapitalize={field === EMAIL_FIELD || field === 'username' ? 'none' : 'words'}
                    autoComplete={
                      field === EMAIL_FIELD
                        ? 'email'
                        : field === 'first_name'
                          ? 'given-name'
                          : field === 'last_name'
                            ? 'family-name'
                            : field === 'username'
                              ? 'username'
                              : 'off'
                    }
                    keyboardType={field === EMAIL_FIELD ? 'email-address' : 'default'}
                    textContentType={
                      field === EMAIL_FIELD
                        ? 'emailAddress'
                        : field === 'first_name'
                          ? 'givenName'
                          : field === 'last_name'
                            ? 'familyName'
                            : field === 'username'
                              ? 'username'
                              : 'none'
                    }
                    editable={!submitting}
                    placeholder={
                      field === EMAIL_FIELD
                        ? 'you@example.com'
                        : `Enter your ${fieldLabel(field).toLowerCase()}`
                    }
                    placeholderTextColor={Colors.textDim}
                  />
                </View>
              ))}

              {unsupportedMissing.length > 0 ? (
                <Text style={styles.helper}>
                  Note: this account also needs {unsupportedMissing.map(fieldLabel).join(', ')}.
                  We can’t collect those here. Please use email sign-up instead.
                </Text>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, submitting && styles.disabled]}
                activeOpacity={0.85}
                onPress={handleSubmit}
                disabled={submitting || unsupportedMissing.length > 0}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <Text style={styles.primaryButtonText}>Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.fields}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Verification code</Text>
                <TextInput
                  style={styles.input}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  autoCapitalize="characters"
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  editable={!verifying}
                  placeholder="123456"
                  placeholderTextColor={Colors.textDim}
                  maxLength={6}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, verifying && styles.disabled]}
                activeOpacity={0.85}
                onPress={handleVerifyOtp}
                disabled={verifying}
              >
                {verifying ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <Text style={styles.primaryButtonText}>Verify and continue</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.ghostButton}
                activeOpacity={0.7}
                onPress={handleResendOtp}
                disabled={otpResending}
              >
                <Text style={styles.ghostButtonText}>
                  {otpResending ? 'Resending…' : 'Resend code'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.linkButton}
            activeOpacity={0.7}
            onPress={() => router.replace('/auth/sign-up' as any)}
          >
            <Text style={styles.linkText}>Use a different sign-up method</Text>
          </TouchableOpacity>

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
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  eyebrow: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  title: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    marginBottom: Spacing.sm,
  },
  body: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  errorContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.warning + '14',
    borderWidth: 1,
    borderColor: Colors.warning + '40',
    marginBottom: Spacing.md,
  },
  errorText: {
    color: Colors.warning,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  fields: {
    gap: Spacing.md,
  },
  inputContainer: {
    gap: Spacing.xs,
  },
  inputLabel: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  input: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Glow.palette.glow,
    backgroundColor: Colors.glass,
    color: Glow.palette.ink,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
  },
  helper: {
    color: Colors.textDim,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 19,
  },
  primaryButton: {
    backgroundColor: Glow.palette.accent,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  primaryButtonText: {
    color: Colors.background,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  ghostButton: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  ghostButtonText: {
    color: Glow.palette.accent,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
  linkButton: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  linkText: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
  disabled: {
    opacity: 0.55,
  },
});
