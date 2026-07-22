export interface RateLimitEnv {
  WAITLIST_DB: D1Database;
  TRACK_SALT?: string;
}

const RATE_LIMIT_SQL = `
  INSERT INTO rate_limit_counters
         (bucket, utc_day, visitor_hash, request_count)
  VALUES (?, ?, ?, 1)
  ON CONFLICT (bucket, utc_day, visitor_hash)
  DO UPDATE SET request_count = rate_limit_counters.request_count + 1
  WHERE rate_limit_counters.request_count < ?
  RETURNING request_count`;

let configurationWarned = false;
let unavailableWarned = false;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Atomically consumes one request from a per-IP UTC-day allowance.
 *
 * D1 executes the upsert as one SQLite statement, so concurrent requests cannot
 * all observe and overwrite the same prior count. Only a keyed hash is stored;
 * the raw client IP never enters D1. Missing configuration and storage failures
 * reject the request rather than disabling the enforcement boundary.
 */
export async function rateLimited(
  env: RateLimitEnv,
  request: Request,
  bucket: string,
  maxPerDay: number,
): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip");
  if (
    !env.WAITLIST_DB ||
    !env.TRACK_SALT ||
    !ip ||
    !/^[a-z0-9_-]{1,64}$/i.test(bucket) ||
    !Number.isSafeInteger(maxPerDay) ||
    maxPerDay < 1
  ) {
    if (!configurationWarned) {
      configurationWarned = true;
      console.error("Atomic rate limiter is not fully configured — rejecting public writes.");
    }
    return true;
  }


  try {
    const day = new Date().toISOString().slice(0, 10);
    const visitorHash = await sha256Hex(`${env.TRACK_SALT}\0${day}\0${ip}`);
    const row = await env.WAITLIST_DB.prepare(RATE_LIMIT_SQL)
      .bind(bucket, day, visitorHash, maxPerDay)
      .first<{ request_count: number }>();
    return !row;
  } catch (error) {
    if (!unavailableWarned) {
      unavailableWarned = true;
      console.error("Atomic rate limiter unavailable — rejecting public writes.", error);
    }
    return true;
  }
}
