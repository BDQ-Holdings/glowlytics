const BURST_WINDOW_MS = 1_000;
const BURST_MAX = 10;
const MINUTE_WINDOW_MS = 60_000;
const MINUTE_MAX = 60;
// How often the background sweep evicts stale (fully-expired) buckets.
const SWEEP_INTERVAL_MS = 60_000;

const buckets = new Map();
let sweepTimer = null;

function trim(arr, cutoff) {
  while (arr.length && arr[0] < cutoff) arr.shift();
}

// MCP-M2: evict empty buckets so the module-level `buckets` Map can't grow
// unbounded — one entry per distinct userId is a slow memory-leak / DoS vector.
// Trim every bucket's burst+minute arrays against the current windows, then
// delete any bucket left with no live timestamps in EITHER window.
function sweepBuckets(now = Date.now()) {
  const burstCutoff = now - BURST_WINDOW_MS;
  const minuteCutoff = now - MINUTE_WINDOW_MS;
  for (const [userId, bucket] of buckets) {
    trim(bucket.burst, burstCutoff);
    trim(bucket.minute, minuteCutoff);
    if (bucket.burst.length === 0 && bucket.minute.length === 0) {
      buckets.delete(userId);
    }
  }
}

// Lazily start the periodic eviction sweep on first use (mirrors the OAuth
// proxy's startStateCleanup). unref() so this timer never keeps the process
// (or a jest run) alive on its own.
function startSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweepBuckets, SWEEP_INTERVAL_MS);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
}

function mcpRateLimit(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: 'missing_user' });
  }
  // MCP-05: the kill-switch is honored only in non-production. In production
  // (NODE_ENV==='production') it is ignored so abuse/cost protection can't be
  // silently disabled via an env var.
  if (process.env.MCP_DISABLE_RATE_LIMIT === '1' && process.env.NODE_ENV !== 'production') {
    return next();
  }

  startSweep();

  const now = Date.now();
  let bucket = buckets.get(req.userId);
  if (!bucket) {
    bucket = { burst: [], minute: [] };
    buckets.set(req.userId, bucket);
  }

  trim(bucket.burst, now - BURST_WINDOW_MS);
  trim(bucket.minute, now - MINUTE_WINDOW_MS);

  if (bucket.burst.length >= BURST_MAX) {
    const retryAfter = Math.ceil((bucket.burst[0] + BURST_WINDOW_MS - now) / 1000) || 1;
    return res.status(429).json({ error: 'rate_limited', retryAfter });
  }
  if (bucket.minute.length >= MINUTE_MAX) {
    const retryAfter = Math.ceil((bucket.minute[0] + MINUTE_WINDOW_MS - now) / 1000) || 1;
    return res.status(429).json({ error: 'rate_limited', retryAfter });
  }

  bucket.burst.push(now);
  bucket.minute.push(now);
  return next();
}

function _resetRateLimitForTest() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  buckets.clear();
}

module.exports = {
  mcpRateLimit,
  sweepBuckets,
  _resetRateLimitForTest,
  _bucketsForTest: buckets,
};
