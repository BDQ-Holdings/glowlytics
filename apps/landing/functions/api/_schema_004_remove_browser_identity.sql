-- Migration 004: retire stored browser identities from waitlist attribution.
-- Apply remote:
--   wrangler d1 execute glowlytics-waitlist --remote --file=functions/api/_schema_004_remove_browser_identity.sql
-- Apply local:
--   wrangler d1 execute glowlytics-waitlist --local --file=functions/api/_schema_004_remove_browser_identity.sql

DROP INDEX IF EXISTS idx_waitlist_posthog_distinct_id;
UPDATE waitlist
   SET posthog_distinct_id = NULL
 WHERE posthog_distinct_id IS NOT NULL;
