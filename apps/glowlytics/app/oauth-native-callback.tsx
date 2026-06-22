import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
} from '../src/constants/theme';

// When the OAuth deep link lands here but Clerk never activates a session
// (trust-gate, expired ticket, dropped network), AuthRedirector keeps the user
// pinned to this route because `!isSignedIn` resolves to "hold" — turning the
// screen into an inescapable full-screen spinner. After this window with no
// session we surface a recovery state that routes back to sign-in so a stuck
// callback always offers a way out.
const RECOVERY_TIMEOUT_MS = 8000;

export default function OAuthNativeCallback() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    // Once Clerk reports a live session, AuthRedirector takes over routing (it
    // honors onboarding state), so we cancel the recovery timer and keep the
    // calm spinner up until the redirector navigates away.
    if (isSignedIn) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      if (__DEV__) {
        console.warn(
          `[OAuthCallback] No session after ${RECOVERY_TIMEOUT_MS}ms (isLoaded=${isLoaded}) — showing recovery`,
        );
      }
      setTimedOut(true);
    }, RECOVERY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isSignedIn, isLoaded]);

  if (timedOut && !isSignedIn) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>We couldn't finish sign-in</Text>
        <Text style={styles.subtitle}>
          Something interrupted the secure hand-off. Let's head back to the
          sign-in screen and try again.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/auth/sign-in')}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>Back to sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={Colors.primary} />
      <Text style={styles.title}>Finishing sign-in...</Text>
      <Text style={styles.subtitle}>Please wait while Glowlytics returns to your account.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  title: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.lg,
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.textOnDark,
    textAlign: 'center',
  },
});
