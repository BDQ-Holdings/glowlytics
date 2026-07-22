# Glow Task 3 Report

## Scope
Implemented the Expo/Clerk identity transition fix in the five brief-targeted Glowlytics files only:

- `apps/glowlytics/src/services/analytics.ts`
- `apps/glowlytics/app/_layout.tsx`
- `apps/glowlytics/src/config/env.ts`
- `apps/glowlytics/src/services/__tests__/analytics.test.ts`
- `apps/glowlytics/src/config/__tests__/env.test.ts`

No commit, stage, deploy, mobile binary build, formatting, linting, or project-wide suite was run.

## RED verification

1. `cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics && npm test -- src/services/__tests__/analytics.test.ts --runInBand`
   - Result: FAIL, 5 failed / 10 total.
   - Expected failures observed:
     - `canonicalGlowlyticsUserId is not a function`
     - `identifyGlowlyticsUser is not a function`
     - product enrichment expectation failed because the old `trackEvent` did not initialize/capture as required.

2. `cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics && npm test -- src/config/__tests__/env.test.ts --runInBand`
   - Result: FAIL, 1 failed / 5 total.
   - Expected failure observed:
     - `env.env.POSTHOG_HOST` was `undefined`, expected `https://us.i.posthog.com`.

## Implementation

- Added `canonicalGlowlyticsUserId(userId)` returning `glowlytics:user:${userId}`.
- Changed `initAnalytics()` to return `Promise<boolean>`, reuse an init promise, and configure PostHog with `env.POSTHOG_HOST`.
- Added `identifyGlowlyticsUser(userId)` that only identifies the namespaced Clerk ID with `{ product: 'glowlytics' }` and returns whether identify happened.
- Kept `identifyUser(userId)` as the existing compatibility helper, but it ignores literal `anonymous` and delegates to the canonical product-namespaced identity path without accepting traits.
- Enriched `trackEvent` and `trackScreen` with `product: 'glowlytics'`, while allowing an explicitly supplied product property to remain untouched.
- Added `POSTHOG_HOST` to env config with default `https://us.i.posthog.com`.
- Changed `_layout.tsx` so deferred analytics initialization no longer identifies `userId || 'anonymous'`.
- Added a Clerk identity transition effect that:
  - waits for Clerk to load;
  - calls `initAnalytics()` before identifying;
  - identifies only when `userId` differs from the last identified Clerk user;
  - records the last identified user only after `identifyGlowlyticsUser()` returns true;
  - cancels stale pending init/identify work across identity changes;
  - calls `resetAnalytics()` and clears the ref on logout.

## GREEN verification

Fresh focused verification command:

`cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics && npm test -- src/services/__tests__/analytics.test.ts src/config/__tests__/env.test.ts --runInBand`

Result: PASS.

- Test Suites: 2 passed, 2 total
- Tests: 15 passed, 15 total
- Snapshots: 0 total

The npm command also printed the pre-existing npm warning: `npm WARN ignoring workspace config at /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/.npmrc`.

Additional focused logout-reset regression check:

`cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics && npm test -- src/services/__tests__/session.test.ts src/services/__tests__/accountDeletion.test.ts --runInBand`

Result: PASS.

- Test Suites: 2 passed, 2 total
- Tests: 8 passed, 8 total
- Snapshots: 0 total

## Self-review

- Auth sequencing: `_layout.tsx` no longer identifies during one-shot deferred init. Identity now changes in a separate `useEffect` after Clerk is loaded and after `initAnalytics()` resolves ready.
- Exactly-once transition behavior: `lastAnalyticsUserId` gates duplicate identifies for the same Clerk user; cleanup cancellation prevents stale pending identification after a user change; the ref updates only after PostHog identify succeeds.
- Logout behavior: when Clerk becomes loaded with no `userId` after a previously identified user, `_layout.tsx` calls `resetAnalytics()` and clears `lastAnalyticsUserId`.
- Privacy: the only PostHog identify call is `posthog.identify(canonicalGlowlyticsUserId(userId), { product: 'glowlytics' })`; grep found no email/phone/name traits sent through analytics identify.
- Existing analytics behavior: pre-init no-op behavior remains covered; app init tracking remains in place; event/screen tracking now only adds the Glowlytics product namespace required by the brief.
