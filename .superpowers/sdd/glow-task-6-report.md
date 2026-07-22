# Glowlytics Task 6 Report: Production Attribution Closeout

## Status

PASS. Glowlytics web, Railway API, and Expo attribution/identity paths are deployed and independently reviewed. Historical PostHog ingestion and the shared dashboard are complete.

## Historical ownership and import

- Approved sources: D1 waitlist `4`, Railway waitlist `36`, combined unique waitlist `40`, Railway profiles/accounts `142`, UV leads `0`.
- Imported PostHog counts: `40 waitlist_submitted`, `142 account_created`.
- Latest historical timestamp: `2026-06-25T01:23:17.117000Z`, strictly before cutover `2026-07-19T12:30:00Z`.
- Historical quality query: zero missing product, acquisition source/medium, attribution model/quality, or historical-backfill fields; zero synthetic historical pageviews.
- Railway timestamps without an explicit zone are normalized as UTC before cutoff comparison and emission. The corrected frozen dry-run evidence was regenerated and reviewed before production ingestion.

## Forward web attribution

- One immutable first-touch snapshot is stored under `glowlytics:first-touch:v1`.
- Stored and emitted data excludes email, raw click IDs, full URLs, and referrer paths/query strings.
- The D1 waitlist row is insert-only for attribution; duplicates do not overwrite the canonical tuple.
- `waitlist_submitted` is emitted only for a newly inserted post-cutover row using the server response timestamp/cutover decision.
- Explicit Facebook UTM aliases, campaign, medium, `facebook.com`, and `fb.com` referrers classify to `acquisition_source=facebook` with `paid_social` or `organic_social` medium. Ambiguous generic `meta` remains unchanged.

## Forward account creation and identity

- Canonical identity is `glowlytics:user:<id>` across browser/mobile and Railway server events.
- Browser anonymous activity is merged by sending PostHog `$identify` with `$anon_distinct_id` immediately before terminal `account_created`; no PII is added to that event.
- Railway account delivery remains durable: ownership is reserved by compare-and-set state, retries are bounded and recoverable, inconclusive reconciliation remains pending, and delivered is terminal.
- Expo initializes PostHog with the production project configuration and uses the same canonical identified ID.

## Production deployment

- Landing: Cloudflare Pages project `glowlytics`, custom domain `https://glowlytics.ai`; production bundle contains PostHog, first-touch, and Facebook classifier contracts.
- API: Railway `glowlytics-api`, deployment `f49d088c-7ef2-43a9-bb39-a3cfdaa08342`, status `SUCCESS`; `https://glowlytics-api-production.up.railway.app/health` returned `status=ok`.
- Mobile: Expo EAS production update group `58a8af5f-c50b-4776-9332-43c0a5572f67`, runtime `1.2.0`, Android and iOS.

## Final verification

- Landing attribution suites: `18` tests passed.
- Railway backend attribution/reconciliation/identity suites: `84` tests passed.
- Expo analytics/config suite: `10` tests passed.
- Landing production build compiled, type-checked, and generated `163/163` static pages.
- Independent final review: `Glowlytics final: PASS; Quality: APPROVED; Findings: none`.

## Durable evidence

Production and PostHog closeout evidence is under:

`/Users/mustafaboorenie/arakis/var/posthog/rollout/run-20260722T022127Z/verification/`

Key files: `final-railway-deployments.json`, `final-production-capture-config.json`, `production-custom-domain-bundles.json`, `glowlytics-eas-update.json`, `final-aggregate-sql.json`, `final-dashboard-run.txt`, and `artifact-privacy-audit.json`.
