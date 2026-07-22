-- Migration 006: serialize per-visitor daily abuse counters in D1.
-- The composite primary key and single-statement upsert prevent concurrent
-- requests from bypassing the configured cap. Only a keyed hash is stored;
-- raw IP addresses are never persisted.
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket TEXT NOT NULL CHECK (length(bucket) BETWEEN 1 AND 64),
  utc_day TEXT NOT NULL CHECK (length(utc_day) = 10),
  visitor_hash TEXT NOT NULL CHECK (length(visitor_hash) = 64),
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (bucket, utc_day, visitor_hash)
) WITHOUT ROWID;
