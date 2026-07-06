# App Review Reply — Guideline 2.1(a), Login (demo / Apple / Google)

> Rejection context: reviewer device iPad Air 11-inch (M3), iPadOS 26.4.1.
> Two screenshots: "There is no account to transfer" (create-account) and
> "Additional verification required. Please try again." (sign-in).
>
> ⚠️ THIS REPLY IS ONLY TRUE ONCE THE CLERK DASHBOARD STEPS IN PART B ARE DONE.
> The real fix is server-side and lives in the Clerk dashboard, which is not in
> the app binary — only you can do it. Do Part B, confirm a fresh-device login on
> all three methods, then paste Part A. Build 27 (1.2.0) carries the in-app
> hardening the reply references.

---

## PART A — paste into App Store Connect under Guideline 2.1(a)

Thank you for the detailed reproduction and the two screenshots ("There is no
account to transfer" on the create-account screen, and "Additional verification
required. Please try again." on the sign-in screen). They let us pinpoint the
exact cause.

**Root cause.** Both failures came from a single server-side setting in our
authentication provider, not from the app binary. Our provider's device-trust /
bot-protection layer was declining to create a session on the review device
before login could complete:

- On the sign-in screen, the demo account's password was accepted, but the
  provider declined to issue a session because the device was not yet "trusted" —
  surfaced to the reviewer as "Additional verification required."
- On the Apple / Google buttons, the provider validated the Apple and Google
  tokens successfully, then blocked the same untrusted device at the session
  step, leaving the new-account handoff with nothing to complete — surfaced as
  "There is no account to transfer."

Because the Apple and Google tokens themselves validated, our Sign in with Apple
and Google configurations are correct; the failure was purely the device-trust
gate refusing first-time review devices.

**What we changed.**

1. **Server-side (the actual fix).** We reconfigured our authentication instance
   so the device-trust / bot-protection layer no longer blocks legitimate
   first-time devices on email, Apple, or Google sign-in. We re-verified that the
   reviewer demo account signs in with email and password only (no MFA, no
   device-trust challenge).

2. **In-app hardening (defense in depth), in this build.** The app no longer
   surfaces raw provider strings. Any residual device-trust or verification
   response now renders one actionable message — "We couldn't verify this device
   for sign-in. Please use email sign-in below, or try again on a different
   network." — and the email sign-in path is always available as a fallback. When
   Apple withholds the email address (e.g. "Hide My Email"), the app now shows a
   short completion screen to finish account creation instead of erroring. These
   paths are covered by automated tests in the submitted build.

**To verify in this build (please delete any previous version first):**

- **Demo account (email):** On the sign-in screen, enter `test@test.com` /
  `Test1234!` and tap **Sign in**. Sign-in completes and lands on the Today tab.
- **Sign in with Apple:** Tap **Continue with Apple** and complete the Apple
  prompt. A first-time Apple sign-in creates the account and lands on Today; if
  Apple hides your email, the app shows a short completion screen to finish.
- **Continue with Google:** Tap **Continue with Google** and complete the Google
  prompt; it lands on Today.

The demo credentials remain `test@test.com` / `Test1234!`. If any login still
fails on your device, please paste the exact on-screen message and the time (with
time zone) and we will trace that specific attempt immediately.

---

## PART B — do these FIRST (human-only; not in the binary)

In the **production** Clerk instance (`clerk.glowlytics.ai`, the `pk_live` key):

- [ ] **Client Trust / device attestation → disabled or report-only** at the
      instance level. Per-user bypass alone does NOT cover Apple/Google — the
      reviewer signs in with their own Apple/Google identity, i.e. a brand-new
      user, so the gate must be off at the instance level.
- [ ] **Bot protection** on sign-in/sign-up → off, or invisible/smart mode.
- [ ] **`test@test.com`** → Bypass Client Trust **ON**, MFA **OFF** (this
      regressed once before — re-confirm).
- [ ] On a **fresh device** (or after deleting the app), confirm all three reach
      the Today tab: email demo, Apple, Google.
- [ ] Confirm build 27 (1.2.0) is the build attached to the review (it carries
      the in-app hardening Part A references).

After approval you can re-tighten security by configuring iOS **App Attest** so
real devices pass the trust gate while bots stay blocked.

---

## Grounding (why Part A is accurate to the binary)

- Device-trust/bot copy: `src/services/oauthCompletion.ts` `mapOpaqueAuthError`
  → "We couldn't verify this device…"; tested in
  `src/services/__tests__/oauthCompletion.test.ts` (`needs_client_trust`,
  `Additional verification required`, bot-challenge → mapped).
- Apple "Hide My Email" / `missing_requirements` → completion screen:
  `app/auth/complete-signup.tsx`; transfer + `missing_requirements` handling in
  `app/auth/sign-in.tsx` and `app/auth/sign-up.tsx`.
- `setActive` failures caught in all three auth screens; email fallback always
  rendered.
