# Glow Task 4 Report

## Summary

Implemented Railway/Clerk server-owned `account_created` reconciliation for Glowlytics backend:

- Added additive V7 DDL for immutable UV attribution columns and retry-safe `user_profiles` PostHog delivery state.
- Added fatal schema verification plus idempotent pre-cutover historical ownership marking.
- Extended UV lead storage to preserve first-touch attribution fields without overwriting them on duplicate email.
- Added `posthog.js` with deterministic account UUIDs, canonical distinct IDs, sanitized product-scoped attribution properties, and batch capture.
- Replaced best-effort account creation side effects with a durable tri-state reconciliation state machine and bounded retry worker.
- Exported guarded `startServer()` so schema/cutover failures reject before listen; startup triggers a bounded retry pass and non-overlapping interval.
- Added focused DB, endpoint, retry, and startup tests.

`package.json` did not need a dependency/script change; Node runtime already provides `fetch`/`AbortSignal`.

## TDD Evidence

### RED

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/server-startup.test.js --runInBand
```

Observed expected failure after adding the focused tests (exit 1, artifact `artifact://297`):

- `dbInit.migrationV7` was undefined.
- `dbInit.markPreCutoverProfilesHistorical` was not exported.
- `upsertLead` SQL did not include `posthog_distinct_id`/attribution fields.
- `findCustomerLead` was not exported.
- `posthog.captureAccountCreated` was never called from `POST /api/users`.
- `app._retryPendingAccountCreatedDeliveries` did not exist.
- pre-cutover runtime rows remained `reconciliation_pending` instead of historical-owned.
- missing `GLOWLYTICS_CUTOVER_AT` still allowed profile insert/201.
- `startServer` was not exported.

An earlier RED attempt exposed a Jest mock-factory naming issue in the new startup test; I fixed the test harness and reran RED before production implementation.

### GREEN

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/server-startup.test.js --runInBand
```

Observed pass (exit 0, artifact `artifact://328`):

- Test Suites: 3 passed, 3 total
- Tests: 51 passed, 51 total
- Snapshots: 0 total

## Acceptance Coverage

- Startup fails before listen on schema/cutover errors: covered by `server-startup.test.js` schema failure and missing cutover tests.
- Duplicate/retry emits the same tuple: covered by `POST /api/users retries account_created with the same UUID/timestamp/properties after a failed capture`.
- Unavailable reconciliation sets neither match nor bypass: covered by the temporary Railway lookup failure test; row remains `reconciliation_pending` with null UUID/match until worker retry.
- Successful capture marks delivered: covered by endpoint tests asserting `posthog_account_created_sent_at = NOW()` and final `delivered` state.
- Pre-cutover rows remain historical-owned: covered by DB idempotent pre-cutover marking and runtime future-cutover endpoint test.
- PII-free/product-scoped telemetry: covered by sanitized attribution assertions; captured payload excludes email, `api_key`, `Bearer`, and `secret`.
- Durable worker: covered by bounded worker tests that process only retryable rows and skip historical/delivered rows.


## Review Follow-up Evidence

Independent review requested five Task 4 fixes: atomic pre-transport delivery claim, worker starvation prevention, source/form-placement sanitization, UTC-safe cutover boundaries, and retry timer cleanup on server close.

### Follow-up RED

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/server-startup.test.js --runInBand
```

Observed expected failures after adding focused review tests (exit 1, artifact `artifact://341`):

- dirty `source` was stored/sent to Loops as `api_key=secret` instead of `uv-scan-web`;
- dirty persisted `form_placement` reached `account_created` properties;
- concurrent duplicate account delivery called `captureAccountCreated` twice;
- unavailable reconciliation rows did not get a retry deferral;
- V7 lacked delivery claim/retry scheduling columns;
- pre-cutover marking SQL lacked explicit UTC boundary semantics;
- server close did not clear the retry interval.

### Follow-up GREEN

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/server-startup.test.js --runInBand
```

Observed pass (exit 0, artifact `artifact://348`):

- Test Suites: 3 passed, 3 total
- Tests: 59 passed, 59 total
- Snapshots: 0 total

### Follow-up Coverage

- Atomic claim: `posthog_account_created_delivery_claimed_at` CAS/lease is taken before network capture; failed transport releases the claim, and a crashed claimant recovers after the lease expires.
- Worker starvation: unavailable reconciliation rows receive `posthog_account_created_retry_after`; worker prioritizes `pending_delivery` and skips deferred rows so later rows get turns.
- Sanitization: UV `source` is whitelisted before DB/Loops use; PostHog `form_placement` is whitelisted again for dirty persisted/backfilled rows.
- Cutover boundaries: runtime and startup cutover SQL compare `created_at` against `timestamptz AT TIME ZONE 'UTC'`; exact-boundary rows remain forward-owned.
- Shutdown: `startServer()` wraps `server.close()` to clear the retry interval.


### Final Concurrency Follow-up

- RED: `npm test -- __tests__/uv-endpoints.test.js -t "concurrent workers that both read reconciliation_pending reserve and send only once" --runInBand` failed as expected against the stale reserve SQL, artifact `artifact://383`; duplicate stale reconcilers could emit twice.
- GREEN: `npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/server-startup.test.js --runInBand` passed, artifact `artifact://385`.
- Final result: Test Suites: 3 passed, 3 total; Tests: 59 passed, 59 total; Snapshots: 0 total.
- Fix: reservation now advances only rows still in `reconciliation_pending` with no account-created UUID, so a stale reconciler cannot clear another worker's delivery claim or replace/send an already reserved tuple.

## Production Mutation

No production data, Railway deployment, staging, git staging, or commit was performed. Only local files and local focused Jest tests were used.
