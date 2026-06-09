# App Review Reply — Guideline 2.1(a), Login (demo / Apple / Google)

> Paste into App Store Connect under Guideline 2.1(a). Reviewer device on the
> rejection: iPad Air 11-inch (M3), iPadOS 26.4.1.
>
> ⚠️ BEFORE sending: complete the Clerk dashboard changes in the checklist at the
> bottom and confirm a fresh-device login on all three methods. This reply is only
> true once those are done.

---

Thank you for the detailed reproduction and the two screenshots ("There is no
account to transfer" on the create-account screen, and "Additional verification
required. Please try again." on the sign-in screen). They let us pinpoint the
exact cause.

**Root cause.** Both failures came from a single server-side issue in our
authentication provider, not from the app binary. Our identity provider's
device-trust / bot-protection layer was rejecting the review device before a
session could be created:

- On the sign-in screen, the demo account's password was accepted, but the
  provider declined to create a session because the device was not yet trusted —
  surfaced to the reviewer as "Additional verification required."
- On the Apple / Google buttons, the provider validated the Apple and Google
  tokens successfully, then blocked the same device at the trust step, which left
  the new-account handoff with nothing to complete — surfaced as "There is no
  account to transfer."

Because the tokens themselves validated, this confirms our Sign in with Apple and
Google configurations are correct; the failure was purely the device-trust gate.

**What we fixed.**

1. **Server-side (the actual fix).** We reconfigured our authentication instance
   so the device-trust / bot-protection layer no longer blocks legitimate
   first-time devices on sign-in, Apple, and Google. We re-verified that the
   reviewer demo account has device-trust bypass enabled and has no MFA, so it
   signs in with email and password only.

2. **In-app hardening (defense in depth).** Even though the dead-end is resolved
   server-side, the app no longer shows raw provider strings. Any residual
   device-trust or verification error now renders a single actionable message —
   "We couldn't verify this device for sign-in. Please use email sign-in below, or
   try again on a different network." — and the email sign-in path is always
   available as a fallback. This is covered by automated tests in the new build.

**To verify in this build (please uninstall any previous version first):**

- **Demo account (email):** On the sign-in screen, enter `test@test.com` /
  `Test1234!` and tap **Sign in**. Sign-in completes and lands on the Today tab.
- **Sign in with Apple:** Tap **Continue with Apple** and complete the Apple
  prompt. A first-time Apple sign-in creates the account and lands on Today; if
  Apple withholds your email (e.g. "Hide My Email"), the app now shows a short
  completion screen to finish, instead of erroring.
- **Google:** Tap **Continue with Google** and complete the Google prompt; it
  lands on Today.

The demo credentials remain `test@test.com` / `Test1234!`. If any login still
fails on your device, please paste the exact on-screen message and the time
(with time zone) and we will trace that specific attempt immediately.

---

## Pre-send checklist (do these first — only you can; they are not in the binary)

In the **production** Clerk instance (`clerk.glowlytics.ai`, the `pk_live` key):

- [ ] **Client Trust / device attestation → disabled or report-only** at the
      instance level. (Per-user bypass alone does NOT cover Apple/Google, because
      the reviewer signs in with their own Apple/Google identity — a brand-new
      user.)
- [ ] **Bot protection** on sign-in/sign-up → off or invisible/smart.
- [ ] **`test@test.com`** → Bypass Client Trust **ON**, MFA **OFF** (this
      regressed once before — re-confirm).
- [ ] On a **fresh device** (or after deleting the app), confirm all three:
      email demo, Apple, Google each reach the Today tab.
- [ ] Ship the new build (code hardening + bumped buildNumber) so the reply's
      "in-app hardening" claim is backed by the binary under review.

After approval, you can re-tighten security by configuring iOS **App Attest** so
real devices pass the trust gate while bots are still blocked.
