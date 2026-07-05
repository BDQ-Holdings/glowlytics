import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { useStore } from '../store/useStore';
import { screenToRoute } from '../services/onboardingFlow';
import type { OnboardingScreenName } from '../types';

const ONBOARDING_ROUTE_PREFIX = '/onboarding/';

/**
 * Derives the current onboarding screen NAME from the active route, e.g.
 * '/onboarding/sex' → 'sex'. Falls back to the raw pathname if it is not an
 * onboarding route (shouldn't happen while onboarding is mounted).
 */
function routeToScreen(pathname: string): string {
  return pathname.startsWith(ONBOARDING_ROUTE_PREFIX)
    ? pathname.slice(ONBOARDING_ROUTE_PREFIX.length)
    : pathname;
}

/**
 * Provides advance/back helpers for onboarding screens.
 *
 * Navigation is NAME-based, not positional. The current screen is derived from
 * the route (`usePathname`), and steps are taken relative to that screen's
 * position in the flow — never from the persisted `onboardingFlowIndex`, which
 * can drift out of sync when screens rebuild the flow mid-run (sex/menstrual/
 * health-permission) or when an iOS swipe-back pops the router without
 * decrementing the stored index. Under positional navigation, that drift
 * re-pushed already-answered screens ("asked me for my age twice"); deriving
 * from the route makes advance/back idempotent with respect to where the user
 * actually is.
 *
 * `onboardingFlowIndex` is still written to the store on every advance/goBack
 * (resume + ProgressDots read it) but is always computed as `indexOf(target)`,
 * and the value EXPOSED by this hook is the derived `indexOf(current)` so the
 * dots stay correct even when the persisted index has drifted.
 */
export function useOnboardingNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const onboardingFlow = useStore((s) => s.onboardingFlow);

  const current = routeToScreen(pathname);
  // Derived, name-based index (clamped ≥ 0). When the current route is not in
  // the flow (stale persisted flow / renamed screen) this is 0, so the dots
  // never render a negative step.
  const onboardingFlowIndex = Math.max(
    onboardingFlow.findIndex((screen) => screen === current),
    0,
  );

  // In-flight guards keyed on the route the nav fired FROM. usePathname updates
  // async, so a second Continue/Back tap before the router settles would push /
  // pop the same target twice — re-showing an already-answered screen on the
  // back-swipe ("asked twice"). Each guard holds the pathname it fired from and
  // is re-armed once the route actually changes.
  const advancedFromRef = useRef<string | null>(null);
  const wentBackFromRef = useRef<string | null>(null);

  // Marks the first [pathname] effect run (mount) apart from later route
  // changes: on cold resume AuthRedirector already routed to the stored index,
  // so route and index agree and must not be rewritten; genuine in-session
  // route changes (an iOS swipe-back) still heal the index below.
  const routeSyncedOnceRef = useRef(false);

  useEffect(() => {
    // A real route change means any in-flight advance/back has landed: re-arm.
    advancedFromRef.current = null;
    wentBackFromRef.current = null;

    if (!routeSyncedOnceRef.current) {
      routeSyncedOnceRef.current = true;
      return; // skip mount; only heal on genuine route changes
    }

    // Cold-resume drift heal: an iOS swipe-back pops the router without
    // decrementing the persisted index, leaving the stored index FORWARD of
    // where the user actually is (resume would land ahead). Whenever the
    // current route maps to a flow screen, rewrite the stored index to match so
    // a later resume (AuthRedirector) lands correctly — no _layout change.
    const {
      onboardingFlow: flow,
      onboardingFlowIndex: storedIndex,
      setOnboardingFlowIndex: setIndex,
    } = useStore.getState();
    const idx = flow.findIndex((screen) => screen === routeToScreen(pathname));
    if (idx >= 0 && idx !== storedIndex) setIndex(idx);
  }, [pathname]);

  const advance = () => {
    if (advancedFromRef.current === pathname) return; // in-flight double-tap
    const {
      onboardingFlow: flow,
      onboardingFlowIndex: storedIndex,
      setOnboardingFlowIndex: setIndex,
    } = useStore.getState();
    const i = flow.findIndex((screen) => screen === current);

    let target: OnboardingScreenName;
    if (i >= 0) {
      if (i + 1 >= flow.length) return; // already at the last screen: no-op
      target = flow[i + 1];
    } else {
      // Self-heal: `current` is not in the (possibly stale) flow — a persisted
      // mid-flow session from an older app version, or a renamed screen.
      // Rebuilding the flow is the caller's job; here we only pick a SAFE
      // forward target: step forward from the stored index, clamped to the
      // flow's end. Because we only ever move to storedIndex + 1 (never below
      // it), this can never navigate BACKWARD to an earlier, already-answered
      // screen — and since `current` is absent from `flow`, the clamped target
      // can never equal it.
      if (flow.length === 0) return;
      target = flow[Math.min(storedIndex + 1, flow.length - 1)];
    }

    advancedFromRef.current = pathname;
    setIndex(flow.findIndex((screen) => screen === target));
    router.push(screenToRoute(target));
  };

  const goBack = () => {
    if (wentBackFromRef.current === pathname) return; // in-flight double-tap
    const { onboardingFlow: flow, setOnboardingFlowIndex: setIndex } = useStore.getState();
    const i = flow.findIndex((screen) => screen === current);
    if (i <= 0) return; // at (or before) the first screen: no-op
    wentBackFromRef.current = pathname;
    setIndex(Math.max(i - 1, 0));
    router.back();
  };

  return {
    advance,
    goBack,
    onboardingFlow,
    onboardingFlowIndex,
  };
}
