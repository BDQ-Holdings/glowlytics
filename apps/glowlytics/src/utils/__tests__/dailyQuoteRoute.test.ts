import {
  shouldRouteToDailyQuote,
  resolveEntryTarget,
  isQuoteRedirectRendered,
  type DailyQuoteRouteParams,
} from '../dailyQuoteRoute';

const base: DailyQuoteRouteParams = {
  isLoaded: true,
  isSignedIn: true,
  onboardingComplete: true,
  alreadyRouted: false,
  root: '(tabs)',
  dailyQuoteSeenDate: '2026-06-20',
  today: '2026-06-21',
};

describe('shouldRouteToDailyQuote', () => {
  it('routes on the first home open of a new local day', () => {
    expect(shouldRouteToDailyQuote(base)).toBe(true);
    expect(shouldRouteToDailyQuote({ ...base, root: 'home' })).toBe(true);
    expect(shouldRouteToDailyQuote({ ...base, root: 'today' })).toBe(true);
  });

  it('does NOT hijack an in-flight non-home flow (#44)', () => {
    for (const root of ['scan', 'settings', 'account', 'paywall', 'report', 'product', 'ritual', 'architecture']) {
      expect(shouldRouteToDailyQuote({ ...base, root })).toBe(false);
    }
  });

  it('does not route twice in one launch (session guard)', () => {
    expect(shouldRouteToDailyQuote({ ...base, alreadyRouted: true })).toBe(false);
  });

  it('does not route when the quote was already seen today', () => {
    expect(shouldRouteToDailyQuote({ ...base, dailyQuoteSeenDate: '2026-06-21' })).toBe(false);
  });

  it('waits for auth + onboarding to settle', () => {
    expect(shouldRouteToDailyQuote({ ...base, isLoaded: false })).toBe(false);
    expect(shouldRouteToDailyQuote({ ...base, isSignedIn: false })).toBe(false);
    expect(shouldRouteToDailyQuote({ ...base, onboardingComplete: false })).toBe(false);
  });

  it('routes when the quote has never been seen (null)', () => {
    expect(shouldRouteToDailyQuote({ ...base, dailyQuoteSeenDate: null })).toBe(true);
  });
});

describe('resolveEntryTarget', () => {
  it('sends a tabs-bound user straight to /quote when the quote is due', () => {
    expect(resolveEntryTarget({ authDecision: 'tabs', quoteDue: true })).toBe('/quote');
  });

  it('sends a tabs-bound user to /(tabs)/today when no quote is due', () => {
    expect(resolveEntryTarget({ authDecision: 'tabs', quoteDue: false })).toBe('/(tabs)/today');
  });

  it('never diverts to /quote for a non-tabs decision, even if a quote is due', () => {
    for (const authDecision of ['hold', 'sign-in', 'onboarding'] as const) {
      expect(resolveEntryTarget({ authDecision, quoteDue: true })).toBe('/(tabs)/today');
    }
  });
});

describe('isQuoteRedirectRendered', () => {
  it('claims the guard when a tabs decision folds into a /quote redirect', () => {
    expect(
      isQuoteRedirectRendered({
        authDecision: 'tabs',
        entryTarget: '/quote',
        devOnboardingHatchActive: false,
      }),
    ).toBe(true);
  });

  it('does NOT claim when the entry target stays on the tabs home', () => {
    expect(
      isQuoteRedirectRendered({
        authDecision: 'tabs',
        entryTarget: '/(tabs)/today',
        devOnboardingHatchActive: false,
      }),
    ).toBe(false);
  });

  it('does NOT claim when the __DEV__ onboarding hatch swallows the render (no navigation)', () => {
    // decision is tabs and the quote is due (entryTarget === '/quote'), but the
    // dev hatch returns null so the /quote Redirect is never actually rendered.
    expect(
      isQuoteRedirectRendered({
        authDecision: 'tabs',
        entryTarget: '/quote',
        devOnboardingHatchActive: true,
      }),
    ).toBe(false);
  });

  it('never claims for a non-tabs decision', () => {
    for (const authDecision of ['hold', 'sign-in', 'onboarding'] as const) {
      expect(
        isQuoteRedirectRendered({
          authDecision,
          entryTarget: '/(tabs)/today',
          devOnboardingHatchActive: false,
        }),
      ).toBe(false);
    }
  });
});
