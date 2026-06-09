/**
 * Shared helpers for OAuth (Apple/Google) auth flows that surface inside
 * sign-in.tsx, sign-up.tsx, and complete-signup.tsx.
 *
 * The big things this file owns:
 *
 *   1. `SignUpCompletionRequiredError` — thrown by `ensureOAuthSession` when the
 *      OAuth provider (typically Apple) didn't hand us everything Clerk needs to
 *      create a user. The catching handler routes the user to /auth/complete-signup
 *      instead of dead-ending with an error toast.
 *
 *   2. `friendlyAuthErrorMessage` — strips truly opaque infra noise (network
 *      failures, redirect-URL diagnostics, Clerk-host hints) while letting
 *      Clerk's actual validation messages ("Email address is required", "That
 *      email is taken") through. The previous build collapsed all OAuth errors
 *      to a single generic line, which is exactly why end-users couldn't tell
 *      what to do next.
 */
import type { SignUpResource } from '@clerk/types';

export interface SignUpCompletionContext {
  /** Fields Clerk still wants before it will create the user. e.g. ['email_address'] */
  missingFields: string[];
  /** Fields Clerk has values for but still needs to verify (typically email_address). */
  unverifiedFields: string[];
  /** The OAuth method that initiated this flow. */
  method: 'apple' | 'google';
}

export class SignUpCompletionRequiredError extends Error {
  readonly context: SignUpCompletionContext;
  constructor(context: SignUpCompletionContext) {
    super(`Signup completion required (missing=${context.missingFields.join(',') || 'none'}, unverified=${context.unverifiedFields.join(',') || 'none'})`);
    this.name = 'SignUpCompletionRequiredError';
    this.context = context;
  }
}

export const isSignUpCompletionRequiredError = (
  err: unknown,
): err is SignUpCompletionRequiredError =>
  err instanceof Error && err.name === 'SignUpCompletionRequiredError';

/**
 * Decide whether the OAuth-resource state means "we need to collect more from
 * the user before Clerk will finish creating their account".
 *
 * Returns the context to throw, or null if the resource state is complete
 * enough that the caller should keep going (i.e. setActive).
 */
export function detectSignUpCompletion(
  signUp: SignUpResource | null | undefined,
  method: 'apple' | 'google',
): SignUpCompletionContext | null {
  if (!signUp) return null;
  const status = signUp.status;
  const missing = (signUp.missingFields || []).map(String);
  const unverified = (signUp.unverifiedFields || []).map(String);

  // missing_requirements always needs human input.
  if (status === 'missing_requirements' && (missing.length > 0 || unverified.length > 0)) {
    return { missingFields: missing, unverifiedFields: unverified, method };
  }
  // Some Clerk instances return status='missing_requirements' with empty arrays
  // when the OAuth token didn't include an identifier at all — surface that too
  // so the user can type their email.
  if (status === 'missing_requirements') {
    return { missingFields: ['email_address'], unverifiedFields: [], method };
  }
  // Status is null/complete/abandoned and createdSessionId is null — let the
  // caller throw its own generic error; we can't recover via completion.
  return null;
}

/**
 * Extract a sensible string from any thrown error (Clerk or otherwise).
 * Mirrors the duplicated helpers that existed inline in sign-in.tsx / sign-up.tsx.
 */
export const extractAuthErrorMessage = (err: unknown, fallback = 'An error occurred.'): string => {
  const clerkMessage =
    (err as any)?.errors?.[0]?.longMessage ?? (err as any)?.errors?.[0]?.message;
  if (typeof clerkMessage === 'string' && clerkMessage.trim().length > 0) {
    return clerkMessage;
  }
  return err instanceof Error ? err.message : fallback;
};

/**
 * True for opaque infrastructure errors that mean "the network or the
 * provider's redirect plumbing failed". Production should never show these
 * to the user verbatim — they leak hostnames, redirect URLs, and HTTP codes
 * that App Review (rightly) reads as developer debug strings.
 *
 * Clerk validation errors like "Email address is required" or
 * "Identifier already exists" do NOT match these patterns, so they pass
 * through `friendlyAuthErrorMessage` untouched.
 */
const INFRA_NOISE_PATTERNS = [
  /missing external verification redirect url/i,
  /failed to fetch/i,
  /network (request )?failed/i,
  /timed out/i,
  /\bECONN/i,
  /\b503\b/i,
  /\b504\b/i,
  /TypeError: Network/i,
  /sso flow/i,
  /redirect url/i,
];

const isInfraNoise = (msg: string): boolean =>
  INFRA_NOISE_PATTERNS.some((rx) => rx.test(msg));

/**
 * Clerk auth-gate errors that mean "the device / client could not be trusted to
 * complete this attempt". The root cause is server-side (Clerk Client Trust +
 * bot protection blocking the device) — see the auth flow notes. The two strings
 * App Review hit on iPad both land here:
 *
 *   - "Additional verification required. Please try again."  (email + OAuth: the
 *     sign-in returned needs_client_trust / a bot challenge)
 *   - "There is no account to transfer"  (Apple/Google: the native hook's internal
 *     `signUp.create({ transfer: true })` ran with no transferable ticket because
 *     the preceding sign-in was blocked at the same trust gate)
 *
 * Neither is recoverable from inside the app, and both read as developer debug
 * text to a reviewer. Collapse them to one actionable line that points at the
 * always-available email path. Clerk's genuine validation messages ("Email
 * address is required", "That email is taken") do NOT match, so they still pass
 * through untouched.
 */
const DEVICE_TRUST_PATTERNS = [
  /no account to transfer/i,
  /additional verification required/i,
  /client[ _-]?trust/i,
  /\b(bot|captcha)\b/i,
];

export function mapOpaqueAuthError(rawMessage: string | null | undefined): string | null {
  if (!rawMessage) return null;
  if (DEVICE_TRUST_PATTERNS.some((rx) => rx.test(rawMessage))) {
    return 'We couldn’t verify this device for sign-in. Please use email sign-in below, or try again on a different network.';
  }
  return null;
}

/**
 * Produce the user-facing error string after an OAuth failure.
 *
 * Rules:
 *   - In `__DEV__` mode: return the full message including any redirect URL /
 *     Clerk-host context the caller wants to append (we keep this verbose for
 *     local debugging).
 *   - In production: strip infra noise, but let Clerk validation messages
 *     (the most useful thing for end-users) pass through untouched.
 *   - User-cancelled flows always return the original message ("user cancelled
 *     the Apple sign-in") so we can skip showing a toast for them.
 */
export function friendlyAuthErrorMessage(
  err: unknown,
  options: { redirectUrl?: string; clerkHost?: string } = {},
): string {
  const base = extractAuthErrorMessage(err);
  if (__DEV__) {
    if (!options.redirectUrl && !options.clerkHost) return base;
    const trailers: string[] = [];
    if (options.redirectUrl) trailers.push(`Redirect URL: ${options.redirectUrl}`);
    if (options.clerkHost) trailers.push(`Clerk instance: ${options.clerkHost}`);
    return `${base}\n${trailers.join('\n')}`;
  }
  if (/cancel/i.test(base)) return base;
  const trustHint = mapOpaqueAuthError(base);
  if (trustHint) return trustHint;
  if (isInfraNoise(base)) {
    return 'Network error while signing in. Check your connection and try again.';
  }
  return base;
}

/**
 * Map Clerk's machine-readable field names to user-facing labels used by the
 * completion form. Falls back to a humanised version of the snake_case name.
 */
export const fieldLabel = (field: string): string => {
  switch (field) {
    case 'email_address':
      return 'Email address';
    case 'first_name':
      return 'First name';
    case 'last_name':
      return 'Last name';
    case 'username':
      return 'Username';
    case 'phone_number':
      return 'Phone number';
    default:
      return field
        .split('_')
        .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
        .join(' ');
  }
};
