-- Migration 003: shared PostHog attribution contract for Glowlytics waitlist.
-- Apply remote:
--   wrangler d1 execute glowlytics-waitlist --remote --file=functions/api/_schema_003_posthog_attribution.sql
-- Apply local:
--   wrangler d1 execute glowlytics-waitlist --local --file=functions/api/_schema_003_posthog_attribution.sql

ALTER TABLE waitlist ADD COLUMN posthog_distinct_id TEXT;
ALTER TABLE waitlist ADD COLUMN acquisition_source TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE waitlist ADD COLUMN acquisition_medium TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE waitlist ADD COLUMN attribution_model TEXT NOT NULL DEFAULT 'first_touch';
ALTER TABLE waitlist ADD COLUMN attribution_quality TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE waitlist ADD COLUMN historical_backfill INTEGER NOT NULL DEFAULT 0;
ALTER TABLE waitlist ADD COLUMN form_placement TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE waitlist ADD COLUMN utm_source TEXT;
ALTER TABLE waitlist ADD COLUMN utm_medium TEXT;
ALTER TABLE waitlist ADD COLUMN utm_campaign TEXT;
ALTER TABLE waitlist ADD COLUMN utm_term TEXT;
ALTER TABLE waitlist ADD COLUMN utm_content TEXT;
ALTER TABLE waitlist ADD COLUMN google_click_id_present INTEGER NOT NULL DEFAULT 0;
ALTER TABLE waitlist ADD COLUMN referrer_host TEXT;
ALTER TABLE waitlist ADD COLUMN landing_path TEXT;

CREATE INDEX IF NOT EXISTS idx_waitlist_posthog_distinct_id ON waitlist(posthog_distinct_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_acquisition_source ON waitlist(acquisition_source);
CREATE INDEX IF NOT EXISTS idx_waitlist_form_placement ON waitlist(form_placement);
