import { shouldRouteToDailyQuote, type DailyQuoteRouteParams } from '../dailyQuoteRoute';

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
