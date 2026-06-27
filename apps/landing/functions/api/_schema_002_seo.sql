-- Migration 002: SEO outcome tracking.
--
-- Apply:
--   wrangler d1 execute glowlytics-waitlist --remote --file=functions/api/_schema_002_seo.sql
-- Local:
--   wrangler d1 execute glowlytics-waitlist --local  --file=functions/api/_schema_002_seo.sql
--
-- ALTER TABLE ... ADD COLUMN is not idempotent in SQLite; run this file once
-- per environment. CREATE statements are idempotent (IF NOT EXISTS).

-- One row per article pageview. Visitor identity is a daily-rotated salted hash
-- so we can count uniques without storing IPs or any cookie.
CREATE TABLE IF NOT EXISTS pageviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  path          TEXT NOT NULL,
  referrer_host TEXT,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  country       TEXT,
  visitor_hash  TEXT NOT NULL,
  day           TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pageviews_slug          ON pageviews(slug);
CREATE INDEX IF NOT EXISTS idx_pageviews_day           ON pageviews(day);
CREATE INDEX IF NOT EXISTS idx_pageviews_slug_day      ON pageviews(slug, day);
CREATE INDEX IF NOT EXISTS idx_pageviews_visitor_slug  ON pageviews(visitor_hash, slug, day);

-- Attribution: which article was the visitor last reading when they joined the
-- waitlist? Captured from sessionStorage at submit time; nullable for direct
-- conversions on the marketing pages.
ALTER TABLE waitlist ADD COLUMN attribution_slug     TEXT;
ALTER TABLE waitlist ADD COLUMN attribution_referrer TEXT;
