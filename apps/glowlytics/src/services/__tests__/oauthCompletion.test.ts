import {
  detectSignUpCompletion,
  friendlyAuthErrorMessage,
  isSignUpCompletionRequiredError,
  mapOpaqueAuthError,
  SignUpCompletionRequiredError,
} from '../oauthCompletion';

// Clerk throws an error shaped like { errors: [{ message, longMessage }] }.
const clerkError = (message: string) => ({ errors: [{ message, longMessage: message }] });

const withDev = (value: boolean, fn: () => void) => {
  const g = global as any;
  const prev = g.__DEV__;
  g.__DEV__ = value;
  try {
    fn();
  } finally {
    g.__DEV__ = prev;
  }
};

describe('mapOpaqueAuthError', () => {
  it('maps the Apple/Google "no account to transfer" handoff failure to actionable copy', () => {
    const mapped = mapOpaqueAuthError('There is no account to transfer');
    expect(mapped).toMatch(/email sign-in/i);
    expect(mapped).not.toMatch(/transfer/i);
  });

  it('maps the client-trust / bot-challenge gate to actionable copy', () => {
    expect(mapOpaqueAuthError('Additional verification required. Please try again.')).toMatch(/different network/i);
    expect(mapOpaqueAuthError('needs_client_trust')).toMatch(/verify this device/i);
    expect(mapOpaqueAuthError('Bot detected, challenge required')).toMatch(/verify this device/i);
  });

  it('lets genuine Clerk validation messages pass through (returns null)', () => {
    expect(mapOpaqueAuthError('Email address is required.')).toBeNull();
    expect(mapOpaqueAuthError('That email address is taken. Please try another.')).toBeNull();
    expect(mapOpaqueAuthError('Password is incorrect.')).toBeNull();
  });

  it('handles empty / nullish input', () => {
    expect(mapOpaqueAuthError('')).toBeNull();
    expect(mapOpaqueAuthError(null)).toBeNull();
    expect(mapOpaqueAuthError(undefined)).toBeNull();
  });
});

describe('friendlyAuthErrorMessage (production)', () => {
  it('collapses the trust-gate Clerk strings to the actionable line', () => {
    withDev(false, () => {
      expect(friendlyAuthErrorMessage(clerkError('There is no account to transfer'))).toMatch(/email sign-in/i);
      expect(friendlyAuthErrorMessage(clerkError('Additional verification required. Please try again.')))
        .toMatch(/verify this device/i);
    });
  });

  it('still strips raw infra noise', () => {
    withDev(false, () => {
      expect(friendlyAuthErrorMessage(clerkError('Network request failed'))).toMatch(/check your connection/i);
    });
  });

  it('passes Clerk validation messages through untouched', () => {
    withDev(false, () => {
      expect(friendlyAuthErrorMessage(clerkError('That email address is taken. Please try another.')))
        .toBe('That email address is taken. Please try another.');
    });
  });

  it('never leaks the redirect URL / Clerk host in production', () => {
    withDev(false, () => {
      const msg = friendlyAuthErrorMessage(clerkError('There is no account to transfer'), {
        redirectUrl: 'glowlytics://oauth-native-callback',
        clerkHost: 'clerk.glowlytics.ai',
      });
      expect(msg).not.toMatch(/glowlytics:\/\//);
      expect(msg).not.toMatch(/clerk\.glowlytics\.ai/);
    });
  });
});

describe('detectSignUpCompletion', () => {
  it('routes missing_requirements with explicit missing fields to completion', () => {
    const ctx = detectSignUpCompletion(
      { status: 'missing_requirements', missingFields: ['email_address'], unverifiedFields: [] } as any,
      'apple',
    );
    expect(ctx).toEqual({ missingFields: ['email_address'], unverifiedFields: [], method: 'apple' });
  });

  it('falls back to email_address when missing_requirements has empty arrays', () => {
    const ctx = detectSignUpCompletion({ status: 'missing_requirements' } as any, 'apple');
    expect(ctx?.missingFields).toEqual(['email_address']);
  });

  it('returns null for complete / unrecoverable states', () => {
    expect(detectSignUpCompletion({ status: 'complete' } as any, 'google')).toBeNull();
    expect(detectSignUpCompletion(null, 'google')).toBeNull();
  });
});

describe('SignUpCompletionRequiredError', () => {
  it('is identifiable via the type guard', () => {
    const err = new SignUpCompletionRequiredError({ missingFields: ['email_address'], unverifiedFields: [], method: 'apple' });
    expect(isSignUpCompletionRequiredError(err)).toBe(true);
    expect(isSignUpCompletionRequiredError(new Error('nope'))).toBe(false);
  });
});
