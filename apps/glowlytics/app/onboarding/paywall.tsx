import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import RevenueCatUI from 'react-native-purchases-ui';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../../src/constants/theme';
import { useStore } from '../../src/store/useStore';
import { checkSubscriptionStatus, isPaywallReady } from '../../src/services/subscription';
import { trackEvent } from '../../src/services/analytics';

const TAG = '[OnboardingPaywall]';

class PaywallErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: (error: Error) => void },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error(TAG, 'ErrorBoundary caught:', error.message);
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return null; // Parent handles fallback
    }
    return this.props.children;
  }
}

export default function OnboardingPaywall() {
  const router = useRouter();
  const subscription = useStore((s) => s.subscription);
  const setSubscription = useStore((s) => s.setSubscription);
  const updateUser = useStore((s) => s.updateUser);
  const startTrial = useStore((s) => s.startTrial);

  const [paywallCrashed, setPaywallCrashed] = React.useState(false);
  const ready = isPaywallReady();

  console.log(TAG, 'Rendering — paywallReady:', ready, 'paywallCrashed:', paywallCrashed);

  const completeOnboarding = () => {
    console.log(TAG, 'Setting onboarding_complete = true');
    updateUser({ onboarding_complete: true });
    console.log(TAG, 'Dismissing onboarding stack, navigating to tabs');
    if (router.canDismiss()) router.dismissAll();
    router.replace('/(tabs)/today' as any);
  };

  const refreshSubscription = async () => {
    try {
      const currentSub = useStore.getState().subscription;
      const sub = await checkSubscriptionStatus(currentSub);
      setSubscription(sub);
      console.log(TAG, 'Sub updated:', sub.tier, sub.is_active);
    } catch (e: any) {
      console.warn(TAG, 'Sub check failed:', e?.message);
    }
  };

  const handleSkip = () => {
    console.log(TAG, 'User skipped — starting trial');
    trackEvent('onboarding_paywall_skipped');
    startTrial();
    completeOnboarding();
  };

  // If paywall isn't ready or crashed, show a skip-only fallback
  if (!ready || paywallCrashed) {
    console.warn(TAG, 'Showing fallback UI — ready:', ready, 'crashed:', paywallCrashed);
    return (
      <View style={styles.container}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>Start your free trial</Text>
          <Text style={styles.fallbackSubtitle}>
            Get 7 days of unlimited scans to explore your skin health.
          </Text>
          <TouchableOpacity style={styles.fallbackButton} onPress={handleSkip}>
            <Text style={styles.fallbackButtonText}>Start 7-day free trial</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PaywallErrorBoundary onError={(err) => {
        console.error(TAG, 'Paywall crashed:', err.message);
        setPaywallCrashed(true);
      }}>
        <RevenueCatUI.Paywall
          onPurchaseCompleted={async () => {
            console.log(TAG, 'Purchase completed');
            trackEvent('onboarding_paywall_purchased');
            await refreshSubscription();
            completeOnboarding();
          }}
          onRestoreCompleted={async () => {
            console.log(TAG, 'Restore completed');
            trackEvent('onboarding_paywall_restored');
            await refreshSubscription();
            completeOnboarding();
          }}
          onPurchaseError={({ error }) => {
            console.error(TAG, 'Purchase error:', error.message, error.code);
            Alert.alert('Purchase failed', error.message || 'Please try again.');
          }}
          onRestoreError={({ error }) => {
            console.error(TAG, 'Restore error:', error.message, error.code);
            Alert.alert('Restore failed', error.message || 'Please try again.');
          }}
          onDismiss={handleSkip}
        />
      </PaywallErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  fallbackTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    textAlign: 'center',
  },
  fallbackSubtitle: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  fallbackButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
  fallbackButtonText: {
    color: Colors.background,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
});
