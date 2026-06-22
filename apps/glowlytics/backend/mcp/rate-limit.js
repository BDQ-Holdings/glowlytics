const BURST_WINDOW_MS = 1_000;
const BURST_MAX = 10;
const MINUTE_WINDOW_MS = 60_000;
const MINUTE_MAX = 60;

const buckets = new Map();

function sweep(arr, cutoff) {
  while (arr.length && arr[0] < cutoff) arr.shift();
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

  const now = Date.now();
  let bucket = buckets.get(req.userId);
  if (!bucket) {
    bucket = { burst: [], minute: [] };
    buckets.set(req.userId, bucket);
  }

  sweep(bucket.burst, now - BURST_WINDOW_MS);
  sweep(bucket.minute, now - MINUTE_WINDOW_MS);

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
  buckets.clear();
}

module.exports = { mcpRateLimit, _resetRateLimitForTest };
