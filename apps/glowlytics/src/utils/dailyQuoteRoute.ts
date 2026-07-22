import type { AuthRouteDecision } from './authRoute';

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

/** The two screens a settled, tabs-bound user can land on at launch. */
export type EntryTarget = '/quote' | '/(tabs)/today';

export interface EntryTargetParams {
  /** The `resolveAuthRoute` verdict for this render. */
  authDecision: AuthRouteDecision;
  /** Whether the daily quote is due (see `shouldRouteToDailyQuote`). */
  quoteDue: boolean;
}

/**
 * Folds the first-open-of-day quote decision into the auth redirect so the
 * quote arrives as the FIRST screen after the splash instead of flashing the
 * home tabs first. Only a `tabs` decision may divert to /quote; every other
 * decision keeps its own destination (this helper is a no-op for them).
 */
export function resolveEntryTarget({ authDecision, quoteDue }: EntryTargetParams): EntryTarget {
  return authDecision === 'tabs' && quoteDue ? '/quote' : '/(tabs)/today';
}

export interface QuoteRedirectRenderedParams {
  /** The `resolveAuthRoute` verdict for this render. */
  authDecision: AuthRouteDecision;
  /** The folded entry target (see `resolveEntryTarget`). */
  entryTarget: EntryTarget;
  /**
   * True when the __DEV__ onboarding review hatch is active — AuthRedirector
   * returns null (renders NOTHING, so no navigation happens) even though the
   * decision is `tabs`. Passed in so the daily-quote guard is never claimed on
   * a render that doesn't actually mount the /quote Redirect.
   */
  devOnboardingHatchActive: boolean;
}

/**
 * Whether AuthRedirector actually renders the `/quote` Redirect on this pass.
 *
 * The daily-quote session guard must be claimed ONLY when this is true — not
 * merely when the entry target resolved to `/quote`. The __DEV__ onboarding
 * hatch can short-circuit AuthRedirector to `null` (no navigation) first, and
 * claiming the guard there would silently swallow the real first-open-of-day
 * quote on the next render.
 */
export function isQuoteRedirectRendered({
  authDecision,
  entryTarget,
  devOnboardingHatchActive,
}: QuoteRedirectRenderedParams): boolean {
  if (devOnboardingHatchActive) return false;
  return authDecision === 'tabs' && entryTarget === '/quote';
}
