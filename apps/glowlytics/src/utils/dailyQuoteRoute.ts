/**
 * Pure decision for the root `DailyQuoteRouter` (app/_layout.tsx): whether to
 * route the user to /quote on this render.
 *
 * Extracted so the gating is unit-testable and the #44 fix is locked in: the
 * router must ONLY hijack to /quote from the home surface. Routing away from an
 * in-flight flow (scan/settings/account/paywall/report/product/…) when the local
 * day rolls over mid-session destroyed the active screen — so every non-home root
 * is left untouched.
 */
export interface DailyQuoteRouteParams {
  /** Clerk `useAuth().isLoaded`. */
  isLoaded: boolean;
  /** Clerk `useAuth().isSignedIn`. */
  isSignedIn: boolean;
  /** `user.onboarding_complete` from the persisted store. */
  onboardingComplete: boolean;
  /** Session guard — already routed to /quote this launch. */
  alreadyRouted: boolean;
  /** First path segment, i.e. `useSegments()[0]`. */
  root: string | undefined;
  /** Persisted local date the quote was last seen (`localDateStr`), or null. */
  dailyQuoteSeenDate: string | null;
  /** Today's local date (`localDateStr(new Date())`). */
  today: string;
}

export function shouldRouteToDailyQuote(p: DailyQuoteRouteParams): boolean {
  if (p.alreadyRouted) return false;
  // Wait for auth + onboarding to settle (AuthRedirector owns those redirects).
  if (!p.isLoaded || !p.isSignedIn || !p.onboardingComplete) return false;
  // Only from the home surface — never hijack an in-flight flow (#44).
  const onHome = p.root === '(tabs)' || p.root === 'home' || p.root === 'today';
  if (!onHome) return false;
  // Already shown today.
  if (p.dailyQuoteSeenDate === p.today) return false;
  return true;
}
