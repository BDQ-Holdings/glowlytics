import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo';
import Animated from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  BorderRadius,
} from '../../src/constants/theme';
import { useStaggeredEntrance, useShakeAnimation } from '../../src/utils/animations';
import { trackEvent } from '../../src/services/analytics';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const staggerStyles = useStaggeredEntrance(5, 100);
  const { style: shakeStyle, trigger: triggerShake } = useShakeAnimation();

  const handleRequestCode = useCallback(async () => {
    if (!isLoaded || !signIn) return;

    const trimmed = email.trim();
    if (!trimmed) {
      setError('Please enter your email address.');
      triggerShake();
      return;
    }

    try {
      setError(null);
      setLoading(true);
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: trimmed,
      });
      trackEvent('forgot_password_requested');
      setStep('reset');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to send reset code.';
      setError(message);
      triggerShake();
    } finally {
      setLoading(false);
    }
  }, [isLoaded, signIn, email, triggerShake]);

  const handleReset = useCallback(async () => {
    if (!isLoaded || !signIn) return;

    if (!code.trim() || !newPassword) {
      setError('Please enter the code and your new password.');
      triggerShake();
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      triggerShake();
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
        password: newPassword,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        trackEvent('forgot_password_completed');
        setSuccess(true);
        setTimeout(() => router.replace('/auth/sign-in'), 1500);
      } else {
        setError('Unable to reset password. Please try again.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid code or password.';
      setError(message);
      triggerShake();
    } finally {
      setLoading(false);
    }
  }, [isLoaded, signIn, setActive, code, newPassword, router, triggerShake]);

  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.checkCircle}>
            <Feather name="check" size={40} color={Colors.success} />
          </View>
          <Text style={styles.successTitle}>Password reset!</Text>
          <Text style={styles.successSubtitle}>Redirecting to sign in...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.content}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={Colors.text} />
          </TouchableOpacity>

          <Animated.View style={staggerStyles[0]}>
            <Text style={styles.title}>
              {step === 'email' ? 'Reset your password' : 'Enter reset code'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 'email'
                ? "Enter your email and we'll send you a reset code."
                : `We sent a code to ${email}. Enter it below with your new password.`}
            </Text>
          </Animated.View>

          {error ? (
            <Animated.View style={[styles.errorContainer, shakeStyle]}>
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          ) : null}

          {step === 'email' ? (
            <Animated.View style={[styles.formSection, staggerStyles[1]]}>
              <View style={styles.inputContainer}>
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
                  editable={!loading}
                  autoFocus
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.buttonDisabled]}
                onPress={handleRequestCode}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <Text style={styles.submitButtonText}>Send reset code</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <Animated.View style={[styles.formSection, staggerStyles[2]]}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Verification code</Text>
                <TextInput
                  style={styles.codeInput}
                  placeholder="Enter code"
                  placeholderTextColor={Colors.textDim}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  editable={!loading}
                  autoFocus
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>New password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="At least 8 characters"
                  placeholderTextColor={Colors.textDim}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  editable={!loading}
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.buttonDisabled]}
                onPress={handleReset}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <Text style={styles.submitButtonText}>Reset password</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  backButton: {
    position: 'absolute',
    top: Spacing.lg,
    left: Spacing.lg,
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  title: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 22,
  },
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
  formSection: {
    gap: Spacing.md,
  },
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
  submitButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  submitButtonText: {
    color: Colors.background,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(52, 167, 123, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  successTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
  },
  successSubtitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
  },
});
