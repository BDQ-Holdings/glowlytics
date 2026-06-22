/**
 * Pure auth-routing decision for the root `AuthRedirector` (app/_layout.tsx).
 *
 * Extracted from the component so the rules are unit-testable and locked in:
 *  - cold-start hold while Clerk is still booting (`!isLoaded`) — redirecting on
 *    that racy half-loaded state was the "logs me out for a flash on cold start";
 *  - hold on an auth route while signed out (don't bounce off sign-in/oauth);
 *  - hold while the persisted store is still hydrating before deciding onboarding
 *    (onboarding_complete defaults false until the user is restored — #37);
 *  - self-correct an authed+onboarded user off a stale auth/onboarding route.
 *
 * The component maps the decision to a <Redirect> (and computes the onboarding
 * resume screen from the store); this function owns only the branch logic.
 */
export type AuthRouteDecision = 'hold' | 'sign-in' | 'onboarding' | 'tabs';

/**
 * Roots a fully-authenticated, fully-onboarded user may remain on without being
 * bounced back to /(tabs)/today. Mirrors the file-based routes under app/.
 */
export const LOGGED_IN_ROOTS: Record<string, true> = {
  '(tabs)': true,
  scan: true,
  product: true,
  signal: true,
  pattern: true,
  report: true,
  'skin-metric': true,
  'skin-metrics': true,
  paywall: true,
  'privacy-policy': true,
  home: true,
  settings: true,
  architecture: true,
  account: true,
  routine: true,
  ritual: true,
  story: true,
  today: true,
  quote: true,
};

export interface AuthRouteParams {
  /** Clerk `useAuth().isLoaded`. */
  isLoaded: boolean;
  /** Clerk `useAuth().isSignedIn`. */
  isSignedIn: boolean;
  /** `user.onboarding_complete` from the persisted store (false until restored). */
  onboardingComplete: boolean;
  /** True while `hydrateForUser` is awaiting the backend. */
  authHydrating: boolean;
  /** First path segment, i.e. `useSegments()[0]`. */
  root: string | undefined;
}

export function resolveAuthRoute({
  isLoaded,
  isSignedIn,
  onboardingComplete,
  authHydrating,
  root,
}: AuthRouteParams): AuthRouteDecision {
  // Clerk still booting — never redirect on a racy half-loaded state.
  if (!isLoaded) return 'hold';

  const inAuthRoute = root === 'auth' || root === 'oauth-native-callback';
  if (!isSignedIn) return inAuthRoute ? 'hold' : 'sign-in';

  if (!onboardingComplete) {
    // Hold while the store is still hydrating, or while already in onboarding, so
    // an already-onboarded offline/slow-hydrate user is not forced back through it.
    if (authHydrating) return 'hold';
    if (root === 'onboarding') return 'hold';
    return 'onboarding';
  }

  // Authed + onboarded: stay on any valid logged-in route, else self-correct.
  return root != null && LOGGED_IN_ROOTS[root] === true ? 'hold' : 'tabs';
}
