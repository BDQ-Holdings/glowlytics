### Task 6: Focused Verification and Deployment Smoke Path

**Files:**
- Verify: all files from Tasks 1-5.
- Do not modify implementation files in this task unless a verification step fails and the fix belongs to a previous task.

**Interfaces:**
- Consumes the final dry-run artifacts under `data/posthog-backfill/glowlytics/`, with `artifactRunId` derived from runtime `GLOWLYTICS_CUTOVER_AT` as `lane-b-YYYYMMDDTHHMMSSZ-final` (reviewed final run: `lane-b-20260719123000Z-final`).
- Produces a handoff note with the verified 4 D1 + 36 Railway = 40 combined waitlist baseline, 142 profiles, zero historical UV matches/bypasses, source coverage, and dry-run counts.

- [ ] **Step 1: Run all focused automated checks for this lane**

Run:

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/landing
npm run test:attribution
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics
npm test -- src/services/__tests__/analytics.test.ts src/config/__tests__/env.test.ts --runInBand
cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend
npm test -- __tests__/uv-db.test.js __tests__/uv-endpoints.test.js __tests__/posthog-backfill-glowlytics.test.js --runInBand
```

Expected: all listed tests PASS.

- [ ] **Step 2: Verify the dry-run artifacts are safe for rollout review**

Use an OMP Eval JavaScript cell; do not use inline `node -e`, shell redirection, or ad-hoc cleanup. Derive `artifactRunId` from the same runtime `GLOWLYTICS_CUTOVER_AT` and verify `summary.json` matches it:

```js
const backend = "/Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend";
const cutoverAt = env("GLOWLYTICS_CUTOVER_AT");
if (!cutoverAt) throw new Error("GLOWLYTICS_CUTOVER_AT missing");
const root = `${backend}/data/posthog-backfill/glowlytics`;
const slug = `lane-b-${new Date(cutoverAt).toISOString().replace(/\D/g, "").slice(0, 14)}Z-final`;
const dir = `${root}/${slug}`;
const batch = JSON.parse(await Bun.file(`${dir}/batch.json`).text());
if (batch.sent_at) throw new Error("sent_at present");
if (!batch.historical_migration) throw new Error("historical_migration missing");
if (JSON.stringify(batch).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)) throw new Error("email leaked");
const summary = JSON.parse(await Bun.file(`${dir}/summary.json`).text());
if (summary.artifact_run_id !== slug) throw new Error("artifact_run_id mismatch");
if (summary.cutover_at !== cutoverAt || summary.source_cutoff_at !== cutoverAt) throw new Error("cutover/source cutoff mismatch");
if (summary.sources.glowlytics_d1_waitlist.baseline_pre_cutoff !== 4) throw new Error("D1 baseline ownership mismatch");
if (summary.sources.glowlytics_railway_waitlist.baseline_pre_cutoff !== 36) throw new Error("Railway waitlist baseline ownership mismatch");
if (summary.combined_waitlist.baseline_pre_cutoff !== 40) throw new Error("combined waitlist baseline ownership mismatch");
if (summary.sources.glowlytics_railway_user_profiles.baseline_pre_cutoff !== 142) throw new Error("profile baseline ownership mismatch");
if (summary.deferred_48h !== 0) throw new Error(`historical send blocked: ${summary.deferred_48h} rows are still within 48h; wait until ${summary.historical_send_ready_at}`);
if (Date.now() < Date.parse(summary.historical_send_ready_at)) throw new Error(`historical send blocked until ${summary.historical_send_ready_at}`);
if (summary.sources.glowlytics_d1_waitlist.eligible !== 4) throw new Error("D1 eligible count mismatch after send-ready gate");
if (summary.sources.glowlytics_railway_waitlist.eligible !== 36) throw new Error("Railway waitlist eligible count mismatch after send-ready gate");
if (summary.combined_waitlist.eligible !== 40) throw new Error("combined waitlist eligible count mismatch after send-ready gate");
if (summary.sources.glowlytics_railway_user_profiles.eligible !== 142) throw new Error("profile eligible count mismatch after send-ready gate");
if (summary.live_send_enabled !== false) throw new Error("live send enabled");
const historicalAccounts = batch.batch.filter((event) => event.event === "account_created");
for (const event of historicalAccounts) {
  if ("waitlist_match" in event.properties || "waitlist_bypassed" in event.properties) throw new Error("verified zero-UV historical accounts must omit waitlist booleans");
}
console.log(`safe batch ${batch.batch.length}`);
console.log(`counts ok ${summary.batch_events}`);
console.log(`historical account linkage ok ${historicalAccounts.length}`);
console.log(`cutover ${summary.source_cutoff_at} from ${summary.cutover_source}`);
console.log(`historical send ready after ${summary.historical_send_ready_at}`);
```

Expected:

```text
safe batch 182
counts ok 182
historical account linkage ok 142
cutover $GLOWLYTICS_CUTOVER_AT from glowlytics-forward-enable:$GLOWLYTICS_CUTOVER_AT
historical send ready after $GLOWLYTICS_CUTOVER_AT + 48h
```

- [ ] **Step 3: Landing deployment smoke path**

Use a staging or preview deployment with the shared project env vars set:
Persist the same scheduled future `GLOWLYTICS_CUTOVER_AT` value in Cloudflare Pages before deploy, deploy before that boundary, and submit the smoke lead only after the boundary has passed; this is the D1/landing cutoff that the dry-run importer must later reuse.
Before this build/deploy command, re-run the blocking remote D1 migration verification gate from Task 2 Step 4 and confirm it passes against the target D1 database.

```bash
cd /Users/mustafaboorenie/cornell-hackathon/apps/landing
GLOWLYTICS_CUTOVER_AT="$GLOWLYTICS_CUTOVER_AT" NEXT_PUBLIC_POSTHOG_API_KEY="$NEXT_PUBLIC_POSTHOG_API_KEY" NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com npm run build
npx wrangler pages deploy out --project-name glowlytics --branch posthog-attribution-glowlytics
```

Smoke scenario:

1. Visit preview URL with `?utm_source=ig&utm_medium=paid_social&utm_campaign=lane-b-smoke`.
2. Confirm browser network sends `$pageview` to PostHog with `product="glowlytics"`, `acquisition_source="instagram"`, `attribution_model="first_touch"`, `historical_backfill=false`, and no email property.
3. Submit a controlled test address to the waitlist form.
4. Confirm `/api/waitlist` request contains `form_placement` and `posthog_distinct_id`.
5. Confirm PostHog receives `waitlist_submitted` only after the API response is `ok: true, created: true`; duplicate-email `ok: true, created: false` responses must not emit another canonical business event.
6. Visit a second URL with `?utm_source=google`; confirm the stored first-touch remains Instagram for subsequent waitlist submission in the same browser profile.

Expected: first-touch immutability holds, `form_placement` is present, `form_placement` is not used as `acquisition_source`, and no plaintext email is in PostHog properties.

- [ ] **Step 4: Expo/Railway deployment smoke path**

Use staging env vars:

```bash
EXPO_PUBLIC_POSTHOG_API_KEY="$EXPO_PUBLIC_POSTHOG_API_KEY"
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_KEY="$POSTHOG_API_KEY"
POSTHOG_HOST=https://us.i.posthog.com
GLOWLYTICS_CUTOVER_AT="$GLOWLYTICS_CUTOVER_AT"
```

Smoke scenario:

1. Launch the app signed out and confirm no call identifies `anonymous`.
2. Sign in or create a Clerk account and confirm the first identify call uses `glowlytics:user:<clerk-user-id>`.
3. Complete onboarding so the mobile app calls Railway `POST /api/users`.
4. Confirm Railway emits `account_created` with `distinct_id="glowlytics:user:<clerk-user-id>"`, `product="glowlytics"`, `historical_backfill=false`, and either:
   - `waitlist_match=true`, `waitlist_bypassed=false`, and UV first-touch fields when a verified UV lead exists; or
   - `waitlist_match=false`, `waitlist_bypassed=true`, `acquisition_source="unknown"`, and `acquisition_medium="unknown"` when no verified lead exists.

Expected: server-confirmed `account_created` appears once per post-cutover profile creation flow, is absent for `created_at < GLOWLYTICS_CUTOVER_AT`, has product isolation, remains `reconciliation_pending` while Clerk/UV lookup is unavailable, sets bypass only after conclusive no-match, retries the exact frozen UUID/timestamp/distinct-ID/property tuple, marks `posthog_account_created_sent_at` only after successful PostHog HTTP delivery, and does not contain plaintext email.

- [ ] **Step 5: Handoff to live PostHog rollout lane**

Send the rollout lane these exact artifacts, variables, and contracts:

```text
Glowlytics lane B plan: /Users/mustafaboorenie/cornell-hackathon/docs/superpowers/plans/2026-07-20-posthog-attribution-glowlytics.md
Importer CLI: /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/scripts/posthog-backfill-glowlytics.js
Artifact root variable: artifactRoot=data/posthog-backfill/glowlytics
Artifact run variable: artifactRunId=summary.artifact_run_id, derived from runtime GLOWLYTICS_CUTOVER_AT as lane-b-YYYYMMDDTHHMMSSZ-final.
Artifact directory: /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/data/posthog-backfill/glowlytics/${artifactRunId}/
Dry-run manifest: /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/data/posthog-backfill/glowlytics/${artifactRunId}/manifest.jsonl
Dry-run batch: /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/data/posthog-backfill/glowlytics/${artifactRunId}/batch.json
Dry-run summary: /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/data/posthog-backfill/glowlytics/${artifactRunId}/summary.json
Dry-run rejects: /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend/data/posthog-backfill/glowlytics/${artifactRunId}/rejects.jsonl
Manifest schema version: glowlytics-posthog-backfill-v1
source_cutoff_at / cutover_at: summary.source_cutoff_at === summary.cutover_at === process.env.GLOWLYTICS_CUTOVER_AT
cutover_source: glowlytics-forward-enable:${process.env.GLOWLYTICS_CUTOVER_AT}
Expected ownership counts: 4 structurally valid pre-cutoff rows from glowlytics_d1_waitlist, 36 from glowlytics_railway_waitlist, 40 combined waitlist_submitted rows, and 142 account_created rows from glowlytics_railway_user_profiles; live_send_enabled=false.
Production historical send gate: rollout must not send the dry-run batch until summary.deferred_48h === 0, summary.coverage_error === null, and current time is at or after summary.historical_send_ready_at (GLOWLYTICS_CUTOVER_AT + 48h). At that point expected batch_events is 182; before then valid baseline rows may be deferred but still counted in baseline_pre_cutoff.
Source coverage: D1 waitlist, Railway waitlist, and Railway profiles must pass 4/36/142 source gates and the 40 combined waitlist gate. `uv_leads=0`; no cross-source dedupe/join is permitted and historical profiles omit waitlist booleans.
Unique lead semantics: 4 D1 rows use `glowlytics:lead:d1:<id>` and 36 Railway waitlist rows use `glowlytics:lead:railway:<id>`; there is no cross-source dedupe or profile join.
Historical account waitlist linkage: verified `uv_leads=0`, so all historical account_created rows omit both `waitlist_match` and `waitlist_bypassed`.
Retry-safe forward account contract: a post-cutover profile starts `reconciliation_pending`; missing Clerk config, lookup timeout/error, or other unavailable reconciliation leaves UUID/properties/match fields unset. Only conclusive `matched` or `unmatched` freezes `posthog_account_created_uuid`, original timestamp, canonical distinct ID, PII-free properties, and match state, then advances to `pending_delivery`. A bounded startup/interval worker retries independently of clients; all sends reuse the exact tuple; `delivered` and `posthog_account_created_sent_at` are written only after successful PostHog HTTP delivery. Historical dry-run rows remain `< GLOWLYTICS_CUTOVER_AT`, UUIDv5-deterministic, and omit `sent_at`.
Exact dry-run command reviewed:
  cd /Users/mustafaboorenie/cornell-hackathon/apps/glowlytics/backend
  GLOWLYTICS_CUTOVER_AT="$GLOWLYTICS_CUTOVER_AT" node scripts/posthog-backfill-glowlytics.js --dry-run --d1-waitlist-json data/posthog-backfill/glowlytics/source-d1-waitlist.json --railway-waitlist-json data/posthog-backfill/glowlytics/source-railway-waitlist.json --railway-profiles-json data/posthog-backfill/glowlytics/source-railway-user-profiles.json --railway-uv-leads-json data/posthog-backfill/glowlytics/source-railway-uv-leads.json --artifact-root data/posthog-backfill/glowlytics --cutover-source "glowlytics-forward-enable:$GLOWLYTICS_CUTOVER_AT"
```

- [ ] **Step 6: Commit any final verification-only test fixture changes**

If Task 6 created or adjusted only test fixtures, commit them:

```bash
cd /Users/mustafaboorenie/cornell-hackathon
 git add apps/glowlytics/backend/__tests__/fixtures/posthog-backfill-glowlytics
 git commit -m "test(glowlytics): lock posthog dry-run backfill fixtures"
```

If no files changed in Task 6, do not create an empty commit.

---

## Rollout Boundary

This Glowlytics plan deliberately stops before live historical ingestion. The only historical output is a dry-run manifest, dry-run raw `/batch` JSON, summary, and reject file in a unique non-overwriting artifact run directory derived from the scheduled `GLOWLYTICS_CUTOVER_AT`. The live PostHog rollout plan owns reading the runtime `artifactRunId` artifacts, honoring `summary.source_cutoff_at === summary.cutover_at === GLOWLYTICS_CUTOVER_AT`, preserving the boundary where historical rows are strictly `< cutover` and forward business events are `>= cutover`, keeping historical account waitlist linkage conditional (`waitlist_match=true`/`waitlist_bypassed=false` only for deterministic UV matches and both properties omitted when unlinked), extending dashboard `1800446`, updating existing insight IDs `9824227`, `9824229`, `9824230`, and `9824234`, validating PostHog API schemas, and deciding when to send historical events.
