import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
  type PurchasesOfferings,
  LOG_LEVEL,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { env } from '../config/env';
import type { SubscriptionState } from '../types';

const ENTITLEMENT_ID = 'Glow Pro';
const TRIAL_DAYS = 7;

export interface PaywallPackageSummary {
  title: string;
  priceString: string;
  pricePerMonthString: string | null;
  subscriptionPeriod: string | null;
}

/** Tracks whether RevenueCat is ready to present a paywall */
let _paywallReady = false;
export function isPaywallReady(): boolean { return _paywallReady; }
let _paywallPackageSummary: PaywallPackageSummary | null = null;
export function getPaywallPackageSummary(): PaywallPackageSummary | null {
  return _paywallPackageSummary;
}

export const defaultSubscription = (): SubscriptionState => ({
  tier: 'free',
  is_active: false,
  expires_at: null,
  product_id: null,
  free_scans_used: 0,
  trial_start_date: null,
  trial_end_date: null,
});

const TAG = '[RevenueCat]';
const log = (...args: unknown[]) => { if (__DEV__) console.log(...args); };
const warn = (...args: unknown[]) => { if (__DEV__) console.warn(...args); };
let revenueCatConfigured = false;

const summarizePackage = (pkg?: PurchasesPackage | null): PaywallPackageSummary | null => {
  if (!pkg) return null;
  return {
    title: pkg.product.title,
    priceString: pkg.product.priceString,
    pricePerMonthString: pkg.product.pricePerMonthString,
    subscriptionPeriod: pkg.product.subscriptionPeriod,
  };
};

const cachePaywallPackageSummary = (offerings?: PurchasesOfferings | null) => {
  _paywallPackageSummary = summarizePackage(offerings?.current?.availablePackages?.[0]);
};

export async function initRevenueCat(): Promise<void> {
  if (!env.REVENUECAT_API_KEY) {
    log(TAG, 'No API key — skipping init');
    return;
  }
  if (revenueCatConfigured) {
    log(TAG, 'Already configured — skipping');
    return;
  }
  log(TAG, 'Configuring SDK...');
  Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
  Purchases.configure({ apiKey: env.REVENUECAT_API_KEY });
  revenueCatConfigured = true;
  log(TAG, 'SDK configured successfully');

  // Check offerings to validate paywall readiness
  try {
    const offerings = await Purchases.getOfferings();
    cachePaywallPackageSummary(offerings);
    const current = offerings.current;
    log(TAG, 'Offerings loaded:', {
      hasCurrent: !!current,
      currentId: current?.identifier ?? 'NONE',
      packageCount: current?.availablePackages?.length ?? 0,
      allOfferingIds: Object.keys(offerings.all),
    });
    if (current && current.availablePackages.length > 0) {
      _paywallReady = true;
      log(TAG, 'Paywall READY — offerings available');
    } else {
      warn(TAG, 'Paywall NOT READY — no current offering or no packages. Check RevenueCat dashboard → Offerings.');
    }
  } catch (e: any) {
    warn(TAG, 'Failed to fetch offerings:', e?.message || e);
  }
}

export async function refreshPaywallPackageSummary(): Promise<PaywallPackageSummary | null> {
  if (!env.REVENUECAT_API_KEY) return null;
  try {
    const offerings = await Purchases.getOfferings();
    cachePaywallPackageSummary(offerings);
  } catch (e: any) {
    warn(TAG, 'Failed to refresh paywall package summary:', e?.message || e);
  }
  return _paywallPackageSummary;
}

export async function identifyUser(userId: string): Promise<CustomerInfo | null> {
  if (!env.REVENUECAT_API_KEY) return null;
  log(TAG, 'Identifying user:', userId);
  const { customerInfo } = await Purchases.logIn(userId);
  log(TAG, 'User identified');
  return customerInfo;
}

/**
 * Drop the RevenueCat identity on sign-out so the next account on a shared
 * device does not inherit the previous user's entitlements. No-op when the API
 * key is unset. Mirrors the guard pattern used by identifyUser/initRevenueCat.
 */
export async function logOutRevenueCat(): Promise<void> {
  if (!env.REVENUECAT_API_KEY) return;
  try {
    log(TAG, 'Logging out RevenueCat user');
    await Purchases.logOut();
  } catch (e) {
    warn(TAG, 'logOut failed', e);
  }
}

export function subscriptionFromCustomerInfo(
  info: CustomerInfo,
  current: SubscriptionState,
): SubscriptionState {
  // Defensive: RevenueCat mocks and edge-case responses can hand back a
  // CustomerInfo with no entitlements (or no info at all). Treat that as
  // "no change" instead of crashing the subscription refresh.
  if (!info?.entitlements) return current;
  const entitlement = info.entitlements.active[ENTITLEMENT_ID];
  if (entitlement) {
    return {
      tier: 'premium',
      is_active: true,
      expires_at: entitlement.expirationDate,
      product_id: entitlement.productIdentifier,
      free_scans_used: current.free_scans_used,
      trial_start_date: current.trial_start_date,
      trial_end_date: current.trial_end_date,
    };
  }
  return {
    ...current,
    tier: 'free',
    is_active: false,
    expires_at: null,
    product_id: null,
  };
}

export async function checkSubscriptionStatus(
  current: SubscriptionState,
): Promise<SubscriptionState> {
  if (!env.REVENUECAT_API_KEY) return current;
  log(TAG, 'Checking subscription status...');
  const info = await Purchases.getCustomerInfo();
  const result = subscriptionFromCustomerInfo(info, current);
  log(TAG, 'Subscription status:', result.tier, result.is_active ? '(active)' : '(inactive)');
  return result;
}

/**
 * Present the RevenueCat-managed paywall.
 * Only shows if the user does NOT already have the "Glow Pro" entitlement.
 * Returns true if the user purchased or restored.
 */
export async function presentPaywall(): Promise<boolean> {
  if (!env.REVENUECAT_API_KEY) return false;
  log(TAG, 'Presenting paywall...');
  const result = await RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: ENTITLEMENT_ID,
  });
  log(TAG, 'Paywall result:', result);
  return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
}

/**
 * Present the RevenueCat Customer Center for managing subscriptions.
 */
export async function presentCustomerCenter(): Promise<void> {
  if (!env.REVENUECAT_API_KEY) return;
  await RevenueCatUI.presentCustomerCenter();
}

export async function restorePurchases(
  current: SubscriptionState,
): Promise<SubscriptionState> {
  if (!env.REVENUECAT_API_KEY) return current;
  log(TAG, 'Restoring purchases...');
  const info = await Purchases.restorePurchases();
  const result = subscriptionFromCustomerInfo(info, current);
  log(TAG, 'Restore result:', result.tier, result.is_active ? '(active)' : '(inactive)');
  return result;
}

/** Start a 7-day free trial */
export function startTrial(): Partial<SubscriptionState> {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + TRIAL_DAYS);
  log(TAG, 'Starting trial — expires:', end.toISOString());
  return {
    trial_start_date: now.toISOString(),
    trial_end_date: end.toISOString(),
  };
}

/** Is the trial still active? */
export function isTrialActive(sub: SubscriptionState): boolean {
  if (!sub.trial_end_date) return false;
  return new Date(sub.trial_end_date) > new Date();
}

/** Days remaining in trial (0 if expired) */
export function trialDaysRemaining(sub: SubscriptionState): number {
  if (!sub.trial_end_date) return 0;
  const diff = new Date(sub.trial_end_date).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/** Pure — can the user start a scan? */
export function canScan(subscription: SubscriptionState): boolean {
  if (subscription.is_active) return true;
  return isTrialActive(subscription);
}

/**
 * Gate an action behind paywall. Presents the StoreKit-managed paywall if
 * the user does not currently have an active entitlement or trial; returns
 * true if the user can proceed (subscribed or trial active).
 *
 * Apple Guideline 3.1.2(a)/(b) — the trial must be initiated by the user
 * through Apple's StoreKit purchase sheet. We do NOT auto-grant a local
 * trial flag here; the only path to a trial is `Purchases.purchasePackage`
 * (via `RevenueCatUI.presentPaywallIfNeeded`).
 */
export async function gateWithPaywall(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useStore } = require('../store/useStore');
  if (useStore.getState().canPerformScan()) return true;
  try {
    const purchased = await presentPaywall();
    if (purchased) {
      const refreshed = await checkSubscriptionStatus(useStore.getState().subscription);
      useStore.getState().setSubscription(refreshed);
    }
  } catch {
    // RevenueCat config error — non-fatal
  }
  return useStore.getState().canPerformScan();
}

/**
 * Listen for server-side subscription changes (e.g. renewal, expiry, family sharing)
 * and auto-update Zustand state. Returns an unsubscribe function for cleanup.
 * Uses lazy require to avoid circular dependency (hoisted outside callback).
 */
export function setupCustomerInfoListener(): () => void {
  if (!env.REVENUECAT_API_KEY) return () => {};
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useStore } = require('../store/useStore');
  const listener = (info: CustomerInfo) => {
    const state = useStore.getState();
    const current = state.subscription;
    const updated = subscriptionFromCustomerInfo(info, current);
    // Skip no-op updates to avoid redundant persists
    if (
      updated.tier === current.tier &&
      updated.is_active === current.is_active &&
      updated.expires_at === current.expires_at &&
      updated.product_id === current.product_id
    ) return;
    state.setSubscription(updated);
  };
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}
