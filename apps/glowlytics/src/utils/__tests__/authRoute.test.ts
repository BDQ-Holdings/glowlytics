import { resolveAuthRoute, type AuthRouteParams } from '../authRoute';

const base: AuthRouteParams = {
  isLoaded: true,
  isSignedIn: true,
  onboardingComplete: true,
  authHydrating: false,
  root: '(tabs)',
};

describe('resolveAuthRoute', () => {
  it('holds while Clerk is still booting, regardless of other state', () => {
    expect(resolveAuthRoute({ ...base, isLoaded: false, isSignedIn: false, root: 'scan' })).toBe('hold');
  });

  it('redirects a signed-out user to sign-in from a non-auth route', () => {
    expect(resolveAuthRoute({ ...base, isSignedIn: false, root: '(tabs)' })).toBe('sign-in');
  });

  it('holds a signed-out user already on an auth route (no bounce off sign-in/oauth)', () => {
    expect(resolveAuthRoute({ ...base, isSignedIn: false, root: 'auth' })).toBe('hold');
    expect(resolveAuthRoute({ ...base, isSignedIn: false, root: 'oauth-native-callback' })).toBe('hold');
  });

  it('holds during hydration before deciding onboarding (#37 — no forced re-onboarding)', () => {
    expect(
      resolveAuthRoute({ ...base, onboardingComplete: false, authHydrating: true, root: '(tabs)' }),
    ).toBe('hold');
  });

  it('holds a not-yet-onboarded user already in the onboarding flow', () => {
    expect(
      resolveAuthRoute({ ...base, onboardingComplete: false, authHydrating: false, root: 'onboarding' }),
    ).toBe('hold');
  });

  it('routes a settled not-onboarded user into onboarding', () => {
    expect(
      resolveAuthRoute({ ...base, onboardingComplete: false, authHydrating: false, root: '(tabs)' }),
    ).toBe('onboarding');
  });

  it('holds an authed+onboarded user on a valid logged-in route', () => {
    for (const root of ['(tabs)', 'scan', 'settings', 'account', 'ritual', 'quote', 'story', 'paywall']) {
      expect(resolveAuthRoute({ ...base, root })).toBe('hold');
    }
  });

  it('self-corrects an authed+onboarded user off a stale auth/onboarding route to tabs', () => {
    // The post-sign-in case: user just authenticated while still on /auth.
    expect(resolveAuthRoute({ ...base, root: 'auth' })).toBe('tabs');
    expect(resolveAuthRoute({ ...base, root: 'onboarding' })).toBe('tabs');
    expect(resolveAuthRoute({ ...base, root: undefined })).toBe('tabs');
  });
});
