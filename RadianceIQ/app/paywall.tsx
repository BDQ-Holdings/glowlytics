import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import RevenueCatUI from 'react-native-purchases-ui';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../src/constants/theme';
import { useStore } from '../src/store/useStore';
import { checkSubscriptionStatus, isPaywallReady } from '../src/services/subscription';
import { trackEvent } from '../src/services/analytics';

const TAG = '[Paywall]';

class PaywallErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: (error: Error) => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error(TAG, 'ErrorBoundary caught:', error.message);
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default function PaywallScreen() {
  const router = useRouter();
  const setSubscription = useStore((s) => s.setSubscription);

  const [paywallCrashed, setPaywallCrashed] = React.useState(false);
  const ready = isPaywallReady();

  console.log(TAG, 'Rendering — paywallReady:', ready, 'paywallCrashed:', paywallCrashed);

  const refreshSubscription = async () => {
    try {
      const currentSub = useStore.getState().subscription;
      const sub = await checkSubscriptionStatus(currentSub);
      setSubscription(sub);
      console.log(TAG, 'Sub refreshed:', sub.tier, sub.is_active);
    } catch (e: any) {
      console.warn(TAG, 'Sub refresh failed:', e?.message);
    }
  };

  if (!ready || paywallCrashed) {
    console.warn(TAG, 'Showing fallback — ready:', ready, 'crashed:', paywallCrashed);
    return (
      <View style={styles.container}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>Upgrade unavailable</Text>
          <Text style={styles.fallbackSubtitle}>
            Unable to load subscription options. Please try again later.
          </Text>
          <TouchableOpacity style={styles.fallbackButton} onPress={() => router.back()}>
            <Text style={styles.fallbackButtonText}>Go back</Text>
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
            trackEvent('paywall_purchase_completed');
            await refreshSubscription();
            router.back();
          }}
          onRestoreCompleted={async () => {
            console.log(TAG, 'Restore completed');
            trackEvent('paywall_restore_completed');
            await refreshSubscription();
            router.back();
          }}
          onPurchaseError={({ error }) => {
            console.error(TAG, 'Purchase error:', error.message, error.code);
            Alert.alert('Purchase failed', error.message || 'Please try again.');
          }}
          onRestoreError={({ error }) => {
            console.error(TAG, 'Restore error:', error.message, error.code);
            Alert.alert('Restore failed', error.message || 'Please try again.');
          }}
          onDismiss={() => {
            console.log(TAG, 'Dismissed');
            trackEvent('paywall_dismissed');
            router.back();
          }}
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
