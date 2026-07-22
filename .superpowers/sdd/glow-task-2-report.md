# Glow Task 2 Report

Status: DONE

## Scope completed
- Modified `apps/landing/package.json`.
- Modified `apps/landing/components/WaitlistForm.tsx`.
- Modified `apps/landing/functions/api/waitlist.ts`.
- Created `apps/landing/functions/api/_schema_003_posthog_attribution.sql`.
- Created `apps/landing/functions/api/__tests__/waitlist-attribution.test.ts`.
- Created `apps/landing/components/__tests__/WaitlistForm.attribution.test.ts`.

## RED proof
Command run from `apps/landing` before production edits:

```bash
node --import ./scripts/seo-engine/node_modules/tsx/dist/loader.mjs --test ./functions/api/__tests__/waitlist-attribution.test.ts ./components/__tests__/WaitlistForm.attribution.test.ts
```

Observed expected RED failures:
- `shouldCaptureWaitlistSubmitted` was not exported.
- `normalizeFormPlacement` was not exported.
- `buildWaitlistSubmittedProperties` was not exported.
- Handler response lacked `created`, `created_at`, and `tracking_enabled` for new inserts.
- Duplicate path returned `{ ok: true }` instead of `{ ok: true, created: false }`.
- Missing `GLOWLYTICS_CUTOVER_AT` did not fail before insert.

Result: exit code 1, 7 failing focused tests.

## GREEN proof
Command run from `apps/landing` after implementation:

```bash
npm run test:attribution
```

Result: PASS, exit code 0. Node test summary: 15 tests, 3 suites, 15 pass, 0 fail.

## Acceptance self-review
- Task 1 interfaces were inspected: `getCurrentFirstTouch()` and `getPostHogDistinctId()` from `components/PostHogAttribution.tsx` are consumed by the form.
- Additive D1 migration `_schema_003_posthog_attribution.sql` adds all required attribution columns and indexes.
- `/api/waitlist` keeps the duplicate-email read before insert, returns `{ ok: true, created: false }`, and performs no insert/update on duplicates.
- New D1 inserts write the canonical attribution snapshot, normalized placement, sanitized legacy `attribution_referrer` hostname, sanitized UTM/referrer/path fields, server `created_at`, and return `{ ok: true, created: true, created_at, tracking_enabled }`.
- Missing or invalid `GLOWLYTICS_CUTOVER_AT` returns `{ error: "cutover_not_configured" }` with no insert.
- `WaitlistForm` sends first-touch attribution plus `posthog_distinct_id` and normalized `form_placement` with the waitlist request.
- `waitlist_submitted` capture is gated by the server response: only `{ ok: true, created: true, tracking_enabled: true }` captures. Duplicate, pre-cutover, and error responses do not capture.
- PostHog event properties are canonical and exclude `email` and `posthog_distinct_id`.
- No Cloudflare preview/production deploy was run. No remote D1 mutation was performed; the remote preflight gate from the brief remains a required pre-deploy step outside this no-mutation task.
- No git add/commit was performed per assignment constraints.
