# Glow Task 5 Report

## Summary

Implemented the Glowlytics sendless historical PostHog backfill importer lane:

- Created `apps/glowlytics/backend/scripts/posthog-backfill-glowlytics.js`.
- Created `apps/glowlytics/backend/__tests__/posthog-backfill-glowlytics.test.js`.
- Created compact PII-free fixtures under `apps/glowlytics/backend/__tests__/fixtures/posthog-backfill-glowlytics/`.
- The importer reads Cloudflare D1 waitlist, Railway `waitlist`, Railway `user_profiles`, and enrichment-only Railway `uv_leads` JSON exports and writes a unique non-overwriting artifact directory containing:
  - `manifest.jsonl`
  - `batch.json`
  - `summary.json`
  - `rejects.jsonl`
  - `checksums.json`

No live PostHog call, D1/Railway export, production DB mutation, deploy, git stage, or git commit was performed.

## TDD Evidence

### RED

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Observed expected failure after adding tests/fixtures, before implementation (exit 1, artifact `artifact://404`):

- Jest failed with `Cannot find module '../scripts/posthog-backfill-glowlytics'`.
- No tests executed because the importer script did not exist yet.

### GREEN

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Observed pass (exit 0, artifact `artifact://417`):

- Test Suites: 1 passed, 1 total
- Tests: 16 passed, 16 total
- Snapshots: 0 total

### Focused Backend Regression Check

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Observed pass (exit 0, artifact `artifact://419`):

- Test Suites: 3 passed, 3 total
- Tests: 71 passed, 71 total
- Snapshots: 0 total

The focused regression command printed existing expected warning/log output from UV endpoint tests; it did not fail.

## Acceptance Coverage

- **Dry-run only / no send path:** CLI refuses execution unless `--dry-run` is present. The importer never imports `posthog.js`, never reads `POSTHOG_API_KEY`, and writes `api_key: "dry-run"` only to the raw batch artifact.
- **Raw historical batch shape:** `batch.json` has `historical_migration: true`, deterministic `uuid`, original ISO `timestamp`, and properties containing `distinct_id`, `product: "glowlytics"`, and `historical_backfill: true`; tests assert no `sent_at` key.
- **Deterministic IDs:** D1 leads use `glowlytics:lead:d1:<id>`, Railway waitlist leads use `glowlytics:lead:railway:<id>`, Railway profiles use `glowlytics:user:<user_id>`, and UUIDv5 names are stable by `glowlytics|<source>|<source_pk>|<event>`.
- **Source coverage gates:** Rehearsal mode enforces the verified 4 D1 waitlist / 36 Railway waitlist / 40 total waitlist / 142 Railway profile structurally valid pre-cutover baseline and writes diagnostic artifacts before throwing on mismatch.
- **Final artifact mode gates:** Sendless final mode enforces cutover + 48h readiness, current verified source counts (4 D1 waitlist, 36 Railway waitlist, 40 total waitlist, 142 Railway profiles), and exact deterministic UV match/bypass gates from the verified source. With current `uv_leads=0`, all historical profiles remain unlinked and omit both waitlist booleans.
- **Historical account linkage semantics:** UV enrichment can only match by `uv_leads.clerk_user_id -> user_profiles.user_id`; matched historical accounts receive `waitlist_match=true` / `waitlist_bypassed=false`. Current verified source has no UV rows, so historical accounts omit both booleans. Profile-side booleans do not create historical match ownership.
- **48-hour and cutover boundaries:** Rows at or after `cutover_at` reject as `at_or_after_cutover`; pre-cutover rows newer than 48 hours reject as `timestamp_within_48_hours` while still counting in the pre-cutover ownership baseline.
- **Reject handling:** Missing source PKs and invalid timestamps become reject rows with deterministic defer reasons; valid rows continue to emit artifacts.
- **PII/token safety:** Tests scan fixture/artifact text for emails, PostHog live keys, `POSTHOG_API_KEY`, `sent_at`, bearer/secret/token material, and unsafe `api_key=` values. Attribution fields strip or normalize unsafe UTM/referrer/path data.
- **Checksums and byte stability:** `checksums.json` records SHA-256 and byte counts for manifest, batch, rejects, and summary. Tests run identical inputs twice and shuffled D1/Railway waitlist/profile inputs with the same run ID/path after removing the first temp run, then assert every artifact byte is identical.
- **Non-overwrite isolation:** Existing artifact run directories are refused before output replacement.

## Artifact Notes

Only Jest-generated temporary artifact directories were created during verification. I did not generate reviewed production rehearsal artifacts under `apps/glowlytics/backend/data/posthog-backfill/glowlytics/` because the assignment forbids live D1/Railway access and says rehearsal evidence should only be generated if required.

## Review Follow-up

Independent review required four fixes:

- Final `waitlist_match=true` and the exact 4-match gate must come only from deterministic `uv_leads.clerk_user_id -> user_profiles.user_id`, never from profile-side boolean fallback.
- Duplicate D1 `id` and Railway `user_id` values must be rejected before a run can satisfy the 40/142 gates.
- D1 and profile inputs must be canonicalized before manifest/batch generation so shuffled source exports produce byte-identical artifacts.
- The report must record follow-up RED/GREEN evidence.

### Follow-up RED

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Observed expected failures after adding the review tests, before the follow-up implementation (exit 1, artifact `artifact://423`):

- Shuffled D1/profile inputs produced different artifact bytes.
- Duplicate D1 waitlist IDs resolved successfully instead of rejecting.
- Duplicate Railway profile `user_id` values resolved successfully instead of rejecting.
- A profile-side `posthog_account_created_waitlist_match=true` flag could satisfy the exact-4 final match gate without a UV `clerk_user_id` link.

### Follow-up GREEN

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Observed pass after the follow-up implementation (exit 0, artifact `artifact://425`):

- Test Suites: 1 passed, 1 total
- Tests: 20 passed, 20 total
- Snapshots: 0 total

### Follow-up Focused Backend Regression

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Observed pass (exit 0, artifact `artifact://427`):

- Test Suites: 3 passed, 3 total
- Tests: 75 passed, 75 total
- Snapshots: 0 total

### Follow-up Acceptance Additions

- Superseded by production-source verification below: final match ownership ignores profile-side true flags; only a UV row with `clerk_user_id` equal to `user_profiles.user_id` can emit `waitlist_match=true`.
- Superseded by production-source verification below: current historical source has no verified bypass rows; unlinked profiles omit both booleans and no bypass rows create additional `waitlist_submitted` events.
- Duplicate source primary keys are converted to deterministic `duplicate_source_pk` rejects, excluded from eligibility and baseline coverage, surfaced in `summary.source_integrity_error`, and thrown before success.
- D1 and Railway profile rows are canonicalized by source primary key, timestamp, and canonical row JSON before artifact generation; shuffled source exports now produce byte-identical manifest/batch/summary/rejects/checksum artifacts.

Cleanup evidence: removed the dead final-match fallback constant and reran `npm test -- __tests__/posthog-backfill-glowlytics.test.js --runInBand` (exit 0, artifact `artifact://438`; 1 suite / 20 tests passed).

## Production-Source Verification Follow-up

Read-only source verification at cutoff `2026-07-20T12:00:00Z` invalidated the original single-source D1 waitlist assumption. Counts only, no PII:

- Cloudflare D1 `waitlist`: 4 pre-cutoff / 0 post-cutoff.
- Railway PostgreSQL `waitlist`: 36 pre-cutoff / 0 post-cutoff.
- Combined unique waitlist emails across D1 + Railway: 40, with 0 cross-source overlap.
- Railway PostgreSQL `user_profiles`: 142 pre-cutoff / 0 post-cutoff.
- Railway PostgreSQL `uv_leads`: 0, so historical deterministic UV profile matches: 0.

### Production-Source Follow-up RED

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Observed expected failures after updating tests for the verified sources, before implementation (exit 1, artifact `artifact://448`):

- Importer still enforced old 40-D1/142-profile coverage and ignored the new Railway waitlist input.
- `manifestRowForRailwayWaitlistLead` was missing.
- Railway waitlist duplicate-ID and canonical-order tests could not pass.
- Final mode still expected historical UV match/bypass counts from the invalidated assumption instead of exact 0 deterministic matches.

### Production-Source Follow-up GREEN

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Observed pass after implementation (exit 0, artifact `artifact://450`):

- Test Suites: 1 passed, 1 total
- Tests: 22 passed, 22 total
- Snapshots: 0 total

### Production-Source Focused Backend Regression

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Observed pass (exit 0, artifact `artifact://452`):

- Test Suites: 3 passed, 3 total
- Tests: 77 passed, 77 total
- Snapshots: 0 total

### Production-Source Acceptance Additions

- Added `railwayWaitlistJson` / `--railway-waitlist-json` input and `glowlytics_railway_waitlist` manifest source.
- Railway waitlist `waitlist_submitted` identities are `glowlytics:lead:railway:<id>`; D1 waitlist identities remain `glowlytics:lead:d1:<id>`.
- The importer emits 4 D1 waitlist events + 36 Railway waitlist events = 40 total waitlist events, with no cross-source inferred join or dedupe.
- Coverage gates now enforce D1=4, Railway waitlist=36, total waitlist=40, Railway profiles=142, and deterministic UV matches=0 for the verified source.
- Duplicate source primary keys are checked independently per D1 waitlist, Railway waitlist, and Railway profile source.
- Final mode now expects 0 deterministic UV profile matches and 0 bypassed historical profiles; all 142 current historical profiles omit `waitlist_match` and `waitlist_bypassed`.
- Canonical source ordering covers D1 waitlist, Railway waitlist, and Railway profile inputs, and shuffled inputs produce byte-identical artifacts.

## Timezone Interpretation Follow-up

Whole-lane review found that Railway PostgreSQL `timestamp without time zone` exports are naive, for example `2026-03-17T11:50:54.314369`. The importer now interprets naive source timestamps as UTC, while preserving explicit `Z` or numeric offsets. Microsecond inputs are normalized to JavaScript/PostHog millisecond ISO timestamps without workstation timezone shifts.

### Timezone RED

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Observed expected failure after adding the non-UTC timezone regression, before implementation (exit 1, artifact `artifact://542`):

- With `TZ=America/Denver`, naive source timestamp `2026-03-17T11:50:54.314369` normalized to `2026-03-17T17:50:54.314Z` instead of the required UTC instant `2026-03-17T11:50:54.314Z`.

### Timezone GREEN

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Observed pass after implementation (exit 0, artifact `artifact://547`):

- Test Suites: 1 passed, 1 total
- Tests: 24 passed, 24 total
- Snapshots: 0 total

### Timezone Focused Backend Regression

Command:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend && npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Observed pass (exit 0, artifact `artifact://549`):

- Test Suites: 3 passed, 3 total
- Tests: 79 passed, 79 total
- Snapshots: 0 total

Timezone acceptance: naive source timestamps are UTC, explicit offsets are preserved, cutover/48h comparisons use the normalized UTC instant, UUID names remain source/source_pk/event based, and identical naive inputs produce byte-identical artifacts under `TZ=UTC` and `TZ=America/Denver`.
