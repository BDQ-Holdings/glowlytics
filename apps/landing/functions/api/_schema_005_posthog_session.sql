-- Migration 005: store an optional, sanitized PostHog session ID as
-- correlation metadata for source-owned waitlist events.
-- Apply remote:
--   wrangler d1 execute glowlytics-waitlist --remote --file=functions/api/_schema_005_posthog_session.sql
-- Apply local:
--   wrangler d1 execute glowlytics-waitlist --local --file=functions/api/_schema_005_posthog_session.sql

ALTER TABLE waitlist ADD COLUMN posthog_session_id TEXT;
