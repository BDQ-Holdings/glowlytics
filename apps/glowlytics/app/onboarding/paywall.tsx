import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, Glow, FontFamily, FontSize, Spacing, BorderRadius } from '../../src/constants/theme';
import { OnboardingTransition } from '../../src/components/OnboardingTransition';
import { PaywallDisclosure } from '../../src/components/PaywallDisclosure';
import { useStore } from '../../src/store/useStore';
import {
  checkSubscriptionStatus,
  getPaywallPackageSummary,
  isPaywallReady,
  refreshPaywallPackageSummary,
} from '../../src/services/subscription';
import { trackEvent } from '../../src/services/analytics';
import { useOnboardingNavigation } from '../../src/hooks/useOnboardingNavigation';

const TAG = '[OnboardingPaywall]';

const ENTITLEMENT_ID = 'Glow Pro';

// Hero illustration — premium glow with gold + teal halos. Matches ready.tsx visual language
// but warmer, with a brighter core to read as "unlocked / Pro".
function PaywallIllustration() {
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.0, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={pulseStyle}>
      <Svg width={220} height={180} viewBox="0 0 220 180">
        <Defs>
          <RadialGradient id="pwOuter" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#F2B56A" stopOpacity={0.42} />
            <Stop offset="40%" stopColor="#F2B56A" stopOpacity={0.16} />
            <Stop offset="80%" stopColor="#3A9E8F" stopOpacity={0.08} />
            <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="pwMid" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#3A9E8F" stopOpacity={0.85} />
            <Stop offset="40%" stopColor="#3A9E8F" stopOpacity={0.5} />
            <Stop offset="100%" stopColor="#39B5BF" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="pwCore" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.95} />
            <Stop offset="35%" stopColor="#5DBCAE" stopOpacity={0.55} />
            <Stop offset="100%" stopColor="#3A9E8F" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={110} cy={90} rx={104} ry={88} fill="url(#pwOuter)" />
        <Circle cx={110} cy={90} r={62} fill="url(#pwMid)" />
        <Circle cx={110} cy={90} r={56} fill="none" stroke="#F2B56A" strokeWidth={1} strokeOpacity={0.32} />
        <Circle cx={110} cy={90} r={42} fill="none" stroke="#3A9E8F" strokeWidth={1.2} strokeOpacity={0.32} />
        <Circle cx={110} cy={90} r={28} fill="url(#pwCore)" />
        <Circle cx={110} cy={90} r={6} fill="#FFFFFF" fillOpacity={0.95} />
        {/* Sparkles */}
        <Circle cx={48} cy={50} r={2.5} fill="#F2B56A" fillOpacity={0.6} />
        <Circle cx={172} cy={56} r={3} fill="#F2B56A" fillOpacity={0.5} />
        <Circle cx={56} cy={134} r={2} fill="#3A9E8F" fillOpacity={0.5} />
        <Circle cx={170} cy={130} r={2.5} fill="#3A9E8F" fillOpacity={0.55} />
        <Circle cx={110} cy={26} r={1.8} fill="#5DBCAE" fillOpacity={0.5} />
        <Circle cx={110} cy={158} r={1.6} fill="#5DBCAE" fillOpacity={0.4} />
      </Svg>
    </Animated.View>
  );
}

interface BenefitProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
}

const Benefit: React.FC<BenefitProps> = ({ icon, title, description }) => (
  <View style={styles.benefitRow}>
    <View style={styles.benefitIconWrap}>
      <Feather name={icon} size={18} color={Colors.primary} />
    </View>
    <View style={styles.benefitText}>
      <Text style={styles.benefitTitle}>{title}</Text>
      <Text style={styles.benefitDescription}>{description}</Text>
    </View>
  </View>
);

export default function OnboardingPaywall() {
  const router = useRouter();
  const setSubscription = useStore((s) => s.setSubscription);
  const updateUser = useStore((s) => s.updateUser);
  const startTrial = useStore((s) => s.startTrial);
  const { goBack, onboardingFlow, onboardingFlowIndex } = useOnboardingNavigation();

  const [summary, setSummary] = useState(getPaywallPackageSummary());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPaywallReady() && !summary) return;
    refreshPaywallPackageSummary()
      .then((next) => {
        if (next) setSummary(next);
      })
      .catch(() => {});
  }, []);

  const completeOnboarding = () => {
    console.log(TAG, 'Completing onboarding → tabs');
    updateUser({ onboarding_complete: true });
    if (router.canDismiss()) router.dismissAll();
    router.replace('/(tabs)/today' as any);
  };

  const refreshSubscription = async () => {
    try {
      const currentSub = useStore.getState().subscription;
      const sub = await checkSubscriptionStatus(currentSub);
      setSubscription(sub);
    } catch (e: any) {
      console.warn(TAG, 'Sub check failed:', e?.message);
    }
  };

  const handleStartTrial = async () => {
    if (busy) return;
    setBusy(true);
    trackEvent('onboarding_paywall_trial_started');
    try {
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: ENTITLEMENT_ID,
      });
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        trackEvent('onboarding_paywall_purchased');
        await refreshSubscription();
        // RevenueCat's customer-info listener will set trial_start_date/end_date
        // via subscriptionFromCustomerInfo; the local startTrial() fallback is
        // only used if the listener races us, which is rare in the onboarding flow.
        startTrial();
        completeOnboarding();
        return;
      }
      if (result === PAYWALL_RESULT.NOT_PRESENTED) {
        // User already entitled (e.g. restored on prior install). Treat as success.
        await refreshSubscription();
        completeOnboarding();
        return;
      }
      // CANCELLED / ERROR — stay on screen, user can retry.
    } catch (e: any) {
      console.warn(TAG, 'Paywall present failed:', e?.message);
      Alert.alert(
        'Subscription unavailable',
        'We couldn\u2019t load plans right now. Please check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingTransition
      illustration={<PaywallIllustration />}
      heading="Try Glow Pro free for 7 days"
      subtext="Daily clinical-grade skin scans, pattern detection, and a routine that adapts to your data. Cancel anytime."
      primaryLabel="Start 7-day free trial"
      primaryOnPress={handleStartTrial}
      primaryDisabled={busy}
      showProgress
      totalSteps={onboardingFlow.length}
      currentStep={onboardingFlowIndex}
      showBack
      onBack={goBack}
    >
      <View style={styles.benefits}>
        <Benefit
          icon="activity"
          title="Daily skin score"
          description="Five clinical signals — hydration, elasticity, inflammation, sun damage, structure — measured every scan."
        />
        <Benefit
          icon="trending-up"
          title="Pattern detection"
          description="See what your routine, sleep, and cycle are actually doing to your skin over time."
        />
        <Benefit
          icon="award"
          title="Routine that adapts"
          description="Product and ingredient guidance grounded in dermatology research, tuned to what your data shows."
        />
      </View>
      <PaywallDisclosure summary={summary} freeTrialDays={7} />
    </OnboardingTransition>
  );
}

const styles = StyleSheet.create({
  benefits: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  benefitIconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(58, 158, 143, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  benefitText: {
    flex: 1,
  },
  benefitTitle: {
    color: Glow.palette.ink,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    marginBottom: 2,
  },
  benefitDescription: {
    color: Glow.palette.muted,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
