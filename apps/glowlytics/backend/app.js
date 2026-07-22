// dotenv is a local-dev convenience only: in production (Railway) the platform
// injects env vars, and a stray .env baked into the image must never override them.
if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { randomUUID: uuidv4, timingSafeEqual, createHmac, randomBytes } = require('crypto');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const OpenAI = require('openai');
const { seedGuidelines, queryGuidelines, queryGuidelinesMulti } = require('./rag');
const imageProcessing = require('./image-processing');
const signalModels = require('./signal-models');
const boneStructure = require('./bone-structure-3d');
const { recommendInterventions } = require('./interventions');
const noLlmFallback = require('./no-llm-fallback');
const { searchCuratedProducts, lookupCuratedBarcode, enrichIngredients } = require('./curated-products');
const shoppingScan = require('./shopping-scan');
const scanQueries = require('./queries/scans');
const uvScan = require('./uv-scan');
const loops = require('./loops');
const uvReport = require('./uv-report');
const uvQueries = require('./queries/uv');
const posthog = require('./posthog');
const { attachPoolErrorHandler } = require('./pg-resilience');
const { getPool } = require('./db-pool');

const app = express();

// Behind Railway's single proxy hop: make req.ip the real client so the
// per-IP rate limiters key on the actual caller, not the proxy (BC-006).
app.set('trust proxy', 1);

// Baseline HTTP hardening (BC-007). helmet defaults suit a JSON API; no custom
// CSP (that would only matter for served HTML).
app.disable('x-powered-by');
app.use(helmet());

// Server-side logger. Full args are logged here (including an err.message passed
// as the 2nd arg) so production diagnostics aren't silently dropped. Client
// responses are sanitized separately via safeErrorMessage — this does NOT relax
// client-facing redaction.
const log = {
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

// CORS — restrict origins in production
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : undefined; // undefined = allow all (dev)
// Fail closed in production: a deploy that forgets CORS_ORIGINS must not
// silently reflect every origin (BC-003).
if (process.env.NODE_ENV === 'production' && (!ALLOWED_ORIGINS || ALLOWED_ORIGINS.length === 0)) {
  throw new Error('CORS_ORIGINS must be set in production');
}
app.use(cors(ALLOWED_ORIGINS ? { origin: ALLOWED_ORIGINS } : undefined));
app.use(express.json({ limit: '20mb' }));

// Sanitize API key — Railway env vars sometimes include trailing newlines
const openaiKey = (process.env.OPENAI_API_KEY || '').replace(/\s+/g, '');
const openai = new OpenAI({ apiKey: openaiKey });

// One shared pool for all app routes + query modules (see db-pool.js) — the
// old per-module pools doubled idle connections against Railway Postgres.
const pool = getPool();

if (!process.env.DATABASE_URL) {
  console.warn('[DB] DATABASE_URL not set — falling back to localhost:5432. Set DATABASE_URL to your Railway PostgreSQL URL.');
}

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'glowlytics-api',
    timestamp: new Date().toISOString(),
    // Informational only — /health must stay 200 when ONNX sessions are
    // missing (degraded, not dead); Railway's healthcheck gates deploys on it.
    models: signalModels.loadedModels?.() ?? undefined,
  });
});
function isForwardPostHogEvent(timestamp) {
  const cutoverMs = Date.parse(process.env.GLOWLYTICS_CUTOVER_AT || '');
  const eventMs = Date.parse(timestamp);
  if (!Number.isFinite(cutoverMs)) {
    throw new Error('GLOWLYTICS_CUTOVER_AT missing or invalid');
  }
  if (!Number.isFinite(eventMs)) {
    throw new Error('source row created_at missing or invalid');
  }
  return eventMs >= cutoverMs;
}

function publicWaitlistAttribution(body = {}) {
  return {
    acquisition_source: body.acquisition_source,
    acquisition_medium: body.acquisition_medium,
    attribution_quality: body.attribution_quality,
    utm_source: body.utm_source,
    utm_medium: body.utm_medium,
    utm_campaign: body.utm_campaign,
    utm_term: body.utm_term,
    utm_content: body.utm_content,
    google_click_id_present: body.google_click_id_present,
    referrer_host: body.referrer_host,
    landing_path: body.landing_path,
    form_placement: body.form_placement,
    posthog_session_id: body.posthog_session_id,
  };
}


// ==================== WAITLIST (public, no auth) ====================

// Public + DB-writing: per-IP rate limit keeps a curl loop from bloating the table.
app.post('/api/waitlist', detectRateLimit, async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO waitlist (email, source)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET source = waitlist.source
       RETURNING id, source, created_at`,
      [email.toLowerCase().trim(), req.body.source || 'landing']
    );
    const row = result.rows[0];
    if (!row) throw new Error('waitlist upsert returned no row');
    if (isForwardPostHogEvent(row.created_at)) {
      await posthog.captureWaitlistSubmitted({
        sourceKey: 'railway_waitlist',
        sourceIdentity: `glowlytics:lead:railway:${row.id}`,
        timestamp: row.created_at,
        attribution: publicWaitlistAttribution(req.body),
      });
    }
    res.json({ ok: true });
  } catch (err) {
    log.error('Waitlist insert error:', err.message);
    res.status(500).json({ error: 'Failed to save' });
  }
});

app.get('/api/waitlist/count', detectRateLimit, async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM waitlist');
    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch {
    res.json({ count: 0 });
  }
});

// ==================== AUTH MIDDLEWARE ====================

const CLERK_ISSUER_URL = process.env.CLERK_ISSUER_URL || '';

const client = CLERK_ISSUER_URL ? jwksClient({
  jwksUri: `${CLERK_ISSUER_URL}/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
}) : null;

function getKey(header, callback) {
  if (!client) return callback(null, null);
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

/**
 * Auth middleware: verifies Clerk JWT from Authorization header.
 * - CLERK_ISSUER_URL set: ALWAYS verifies the JWT, regardless of NODE_ENV.
 *   A dev box pointed at a real issuer must not silently admit anonymous
 *   callers as 'dev-user' (fail closed).
 * - CLERK_ISSUER_URL unset + NODE_ENV=development: passthrough with a
 *   synthetic user so the backend works without Clerk locally.
 * - CLERK_ISSUER_URL unset otherwise: 401 (no credentials) / 503 (credentials
 *   we have no way to verify).
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!client) {
    // No issuer configured at all — the only state where a passthrough is
    // acceptable, and only in explicit development mode.
    if (process.env.NODE_ENV === 'development') {
      // Dev mode passthrough — synthetic user so routes that need userId still work
      req.auth = { userId: 'dev-user' };
      return next();
    }
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // Deny access when JWKS is not configured and we're not explicitly in dev mode
    return res.status(503).json({ error: 'Auth service not configured' });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  // clockTolerance absorbs minor device/server clock skew and the iat/nbf
  // boundary so 60s Clerk session JWTs don't spuriously 401 mid-session.
  const verifyOptions = { algorithms: ['RS256'], issuer: CLERK_ISSUER_URL, clockTolerance: 30 };
  if (process.env.CLERK_AUDIENCE) {
    verifyOptions.audience = process.env.CLERK_AUDIENCE;
  }
  jwt.verify(token, getKey, verifyOptions, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.auth = { userId: decoded.sub, sessionId: decoded.sid };
    next();
  });
};

// ==================== PRODUCTION SAFETY ====================

// Warn loudly if production is misconfigured (auth bypass risk)
if (process.env.NODE_ENV === 'production' && !CLERK_ISSUER_URL) {
  console.error('[SECURITY] CLERK_ISSUER_URL is not set in production — auth verification disabled!');
}

/**
 * Safe error message for client responses.
 * In production, returns generic message; in development, returns full error.
 */
function safeErrorMessage(err) {
  if (process.env.NODE_ENV === 'production') {
    return 'Internal server error';
  }
  return err.message;
}

// ==================== INPUT VALIDATION ====================

/** Valid values for user profile fields */
// Must accept exactly what onboarding/age-range.tsx sends ('Under 18'…'55+');
// the prior list omitted 'Under 18' and '55+', so POST /api/users 400'd and those
// users' profiles were never created server-side (#7). Legacy buckets kept for
// backward-compat. (All fit age_range VARCHAR(10).)
const VALID_AGE_RANGES = ['Under 18', '13-17', '18-24', '25-34', '35-44', '45-54', '55+', '55-64', '65+'];
const VALID_PERIOD_APPLICABLE = ['yes', 'no', 'prefer_not'];
const VALID_DRINK_FREQUENCIES = ['none', '1-2', '3-5', '6+'];

/** Validate POST /api/users input. Returns error string or null if valid. */
function validateUserInput(body) {
  if (!body.age_range || !VALID_AGE_RANGES.includes(body.age_range)) {
    return `age_range must be one of: ${VALID_AGE_RANGES.join(', ')}`;
  }
  if (!body.location_coarse || typeof body.location_coarse !== 'string' || body.location_coarse.length < 1 || body.location_coarse.length > 100) {
    return 'location_coarse is required (1-100 characters)';
  }
  if (body.period_applicable && !VALID_PERIOD_APPLICABLE.includes(body.period_applicable)) {
    return `period_applicable must be one of: ${VALID_PERIOD_APPLICABLE.join(', ')}`;
  }
  if (body.cycle_length_days != null) {
    const days = Number(body.cycle_length_days);
    if (!Number.isInteger(days) || days < 15 || days > 60) {
      return 'cycle_length_days must be an integer between 15 and 60';
    }
  }
  if (body.drink_baseline_frequency && !VALID_DRINK_FREQUENCIES.includes(body.drink_baseline_frequency)) {
    return `drink_baseline_frequency must be one of: ${VALID_DRINK_FREQUENCIES.join(', ')}`;
  }
  return null;
}

/** Whitelist of columns that may be updated via PATCH /api/users/:id */
const ALLOWED_USER_FIELDS = [
  'age_range',
  'location_coarse',
  'period_applicable',
  'period_last_start_date',
  'cycle_length_days',
  'smoker_status',
  'drink_baseline_frequency',
  'wearable_connected',
  'wearable_source',
  'camera_permission_status',
  'health_connection',
  'onboarding_complete',
  'skin_goal',
  'sex',
  'menstrual_status',
];

// ==================== PUBLIC ROUTES (no auth) ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Simple in-memory rate limiters
const detectRateMap = new Map();
const DETECT_RATE_WINDOW = 10000; // 10s
const DETECT_RATE_MAX = 10; // max 10 requests per window per IP

// Photo identification rate limiter (declared here so cleanup interval can reference it)
const photoRateMap = new Map();
const PHOTO_RATE_WINDOW = 10000;
const PHOTO_RATE_MAX = 5;
function detectRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress;
  const now = Date.now();
  const entry = detectRateMap.get(ip);
  if (!entry || now - entry.start > DETECT_RATE_WINDOW) {
    detectRateMap.set(ip, { start: now, count: 1 });
    return next();
  }
  entry.count++;
  if (entry.count > DETECT_RATE_MAX) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  next();
}

// Periodic cleanup of stale rate limiter entries (prevents memory leak under sustained traffic)
const RATE_CLEANUP_INTERVAL = 60000; // sweep every 60s
const _rateCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of detectRateMap) {
    if (now - entry.start > DETECT_RATE_WINDOW) detectRateMap.delete(key);
  }
  for (const [key, entry] of analyzeRateMap) {
    if (now - entry.start > ANALYZE_RATE_WINDOW) analyzeRateMap.delete(key);
  }
  for (const [key, entry] of photoRateMap) {
    if (now - entry.start > PHOTO_RATE_WINDOW) photoRateMap.delete(key);
  }
}, RATE_CLEANUP_INTERVAL);
// Don't let the sweep timer keep the event loop (and Jest) alive on its own.
if (_rateCleanupTimer && typeof _rateCleanupTimer.unref === 'function') _rateCleanupTimer.unref();

// Per-user rate limiter for expensive authenticated endpoints (vision/analyze)
const analyzeRateMap = new Map();
const ANALYZE_RATE_WINDOW = 60000; // 1 minute
const ANALYZE_RATE_MAX = 10; // max 10 scans per minute per user/IP
function analyzeRateLimit(req, res, next) {
  const key = (req.auth && req.auth.userId) || req.ip || req.socket.remoteAddress;
  const now = Date.now();
  const entry = analyzeRateMap.get(key);
  if (!entry || now - entry.start > ANALYZE_RATE_WINDOW) {
    analyzeRateMap.set(key, { start: now, count: 1 });
    return next();
  }
  entry.count++;
  if (entry.count > ANALYZE_RATE_MAX) {
    return res.status(429).json({ error: 'Scan rate limit exceeded. Please wait before scanning again.' });
  }
  next();
}

// Fast lesion detection for real-time camera overlay (rate-limited, no auth — frames are ephemeral)
app.post('/api/vision/detect-lesions', detectRateLimit, async (req, res) => {
  const start = Date.now();
  try {
    const { image_base64 } = req.body;
    if (!image_base64 || typeof image_base64 !== 'string') {
      return res.status(400).json({ error: 'image_base64 is required' });
    }
    if (image_base64.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large (max 10MB)' });
    }

    const lesions = await signalModels.runAcneDetector(image_base64);
    res.json({ lesions, latency_ms: Date.now() - start });
  } catch (err) {
    log.warn('[detect-lesions] Error:', err.message);
    res.json({ lesions: [], latency_ms: Date.now() - start });
  }
});

// ==================== BARCODE PRODUCT LOOKUP (waterfall) ====================

// 5-second timeout for external API calls
function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
}

async function lookupOpenBeautyFacts(barcode) {
  const res = await fetchWithTimeout(
    `https://world.openbeautyfacts.org/api/v0/product/${barcode}.json`
  );
  const data = await res.json();
  if (data.status !== 1 || !data.product?.product_name) return null;
  const p = data.product;
  return {
    name: p.product_name || '',
    brands: p.brands || '',
    ingredients: p.ingredients_text || '',
    image_url: p.image_url || null,
    source: 'Open Beauty Facts',
  };
}

async function lookupOpenFoodFacts(barcode) {
  const res = await fetchWithTimeout(
    `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
  );
  const data = await res.json();
  if (data.status !== 1 || !data.product?.product_name) return null;
  const p = data.product;
  return {
    name: p.product_name || '',
    brands: p.brands || '',
    ingredients: p.ingredients_text || '',
    image_url: p.image_url || null,
    source: 'Open Food Facts',
  };
}

async function lookupUPCitemdb(barcode) {
  const res = await fetchWithTimeout(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.items || data.items.length === 0) return null;
  const item = data.items[0];
  return {
    name: item.title || '',
    brands: item.brand || '',
    ingredients: '',
    image_url: (item.images && item.images[0]) || null,
    source: 'UPCitemdb',
  };
}

async function lookupNIHDailyMed(barcode) {
  const res = await fetchWithTimeout(
    `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?ndc=${barcode}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.data || data.data.length === 0) return null;
  const spl = data.data[0];
  return {
    name: spl.title || spl.spl_name || '',
    brands: '',
    ingredients: spl.active_ingredients
      ? spl.active_ingredients.map((i) => i.name).join(', ')
      : '',
    image_url: null,
    source: 'NIH DailyMed',
  };
}

// Reusable barcode identification: curated DB first, then the external
// waterfall, enriching missing ingredients from the curated DB. Returns a
// normalized product or null. Shared by the public lookup route and the
// authenticated shopping-scan endpoint.
async function identifyByBarcode(barcode) {
  // Check curated DB first (instant, local)
  const curated = lookupCuratedBarcode(barcode);
  if (curated) {
    return {
      name: curated.name,
      brand: curated.brand,
      ingredients: curated.ingredients,
      image_url: curated.image_url || null,
      source: 'curated',
    };
  }

  // Waterfall through external sources
  const sources = [lookupOpenBeautyFacts, lookupOpenFoodFacts, lookupUPCitemdb, lookupNIHDailyMed];
  let bestResult = null;
  for (const lookup of sources) {
    try {
      const result = await lookup(barcode);
      if (result && result.name) {
        bestResult = result;
        if (result.ingredients) break;
      }
    } catch {
      // Source failed, try next
    }
  }

  if (!bestResult) return null;

  // Enrich missing ingredients from curated DB
  const existingIngredients = bestResult.ingredients
    ? bestResult.ingredients.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const enriched = enrichIngredients(bestResult.name, existingIngredients);
  const ingredients = enriched.length > existingIngredients.length ? enriched : existingIngredients;
  return {
    name: bestResult.name,
    brand: bestResult.brands || '',
    ingredients,
    image_url: bestResult.image_url || null,
    source: bestResult.source,
  };
}

// Barcode product lookup (public, rate-limited)
app.get('/api/products/lookup/:barcode', detectRateLimit, async (req, res) => {
  const barcode = req.params.barcode;

  // Validate barcode format (numeric, 6-14 digits)
  if (!/^[0-9]{6,14}$/.test(barcode)) {
    return res.status(400).json({ error: 'Invalid barcode format' });
  }

  const product = await identifyByBarcode(barcode);
  if (!product) {
    return res.status(404).json({ error: 'Product not found in any database' });
  }

  res.json({
    name: product.name,
    brands: product.brand,
    ingredients: product.ingredients.join(', '),
    image_url: product.image_url,
    source: product.source,
  });
});

// Product text search — multi-source (public, rate-limited).
//
// Strategy:
//  1. Curated DB hit first (synchronous, ~instant).
//  2. If curated already returns ≥ CURATED_FAST_PATH_MIN results, return them
//     immediately. This is the fast path — most user searches ("cerave",
//     "panoxyl", "byoma") hit the curated DB cleanly and don't need the slow
//     external calls.
//  3. Otherwise, race the external sources against a 2s timeout so a slow
//     OBF/OFF response can never block the user beyond that. The curated
//     fallback is folded in either way.
//
// Previously this endpoint blocked on `Promise.all([obf, off])` with no
// timeout, which made every keystroke wait for both external APIs to settle —
// the slow source set the floor at 2-5s per call.
const CURATED_FAST_PATH_MIN = 5;
const EXTERNAL_SEARCH_TIMEOUT_MS = 2_000;
const SEARCH_RESULT_CAP = 15;

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(() => resolve(null), ms)),
]);

const mergeSearchResults = (...lists) => {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    if (!list) continue;
    for (const result of list) {
      const key = result.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(result);
      if (merged.length >= SEARCH_RESULT_CAP) return merged;
    }
  }
  return merged;
};

app.get('/api/products/search', detectRateLimit, async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.status(400).json({ error: 'Query parameter "q" must be at least 2 characters' });
  }

  // 1. Curated DB (instant)
  const curatedResults = searchCuratedProducts(query).map(p => ({
    name: p.name,
    brands: p.brand,
    ingredients: p.ingredients.join(', '),
    image_url: p.image_url || null,
    source: 'curated',
  }));

  // Fast path: curated alone is enough.
  if (curatedResults.length >= CURATED_FAST_PATH_MIN) {
    return res.json(curatedResults.slice(0, SEARCH_RESULT_CAP));
  }

  try {
    // 2. Open Beauty Facts + Open Food Facts in parallel, each racing a
    //    timeout so the slowest source can't drag the response over 2s.
    const [obfResults, offResults] = await Promise.all([
      withTimeout(
        fetch(`https://world.openbeautyfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=10`)
          .then(r => r.ok ? r.json() : { products: [] })
          .then(data => (data.products || []).filter(p => p.product_name).map(p => ({
            name: p.product_name,
            brands: p.brands || '',
            ingredients: p.ingredients_text || '',
            image_url: p.image_url || null,
            source: 'Open Beauty Facts',
          })))
          .catch(() => []),
        EXTERNAL_SEARCH_TIMEOUT_MS,
      ),
      withTimeout(
        fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=5`)
          .then(r => r.ok ? r.json() : { products: [] })
          .then(data => (data.products || []).filter(p => p.product_name).map(p => ({
            name: p.product_name,
            brands: p.brands || '',
            ingredients: p.ingredients_text || '',
            image_url: p.image_url || null,
            source: 'Open Food Facts',
          })))
          .catch(() => []),
        EXTERNAL_SEARCH_TIMEOUT_MS,
      ),
    ]);

    // 3. Merge curated first, then external, dedup by normalized name.
    res.json(mergeSearchResults(curatedResults, obfResults, offResults));
  } catch {
    // Fallback to curated-only on total failure
    res.json(curatedResults.slice(0, SEARCH_RESULT_CAP));
  }
});

// Per-IP rate limiter for photo identification (the route itself is auth-required; see protected routes).
function photoRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress;
  const now = Date.now();
  const entry = photoRateMap.get(ip);
  if (!entry || now - entry.start > PHOTO_RATE_WINDOW) {
    photoRateMap.set(ip, { start: now, count: 1 });
    return next();
  }
  entry.count++;
  if (entry.count > PHOTO_RATE_MAX) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  next();
}

// ==================== ADMIN ROUTES (admin-secret auth, no JWT) ==============

// Seed guidelines into Pinecone (admin only — requires ADMIN_SECRET)
app.post('/api/rag/seed', async (req, res) => {
  try {
    const adminSecret = process.env.ADMIN_SECRET;
    const providedSecret = req.headers['x-admin-secret'];
    if (!adminSecret || !providedSecret ||
        adminSecret.length !== providedSecret.length ||
        !timingSafeEqual(Buffer.from(providedSecret), Buffer.from(adminSecret))) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!process.env.PINECONE_API_KEY) {
      return res.status(500).json({ error: 'PINECONE_API_KEY not configured' });
    }

    const result = await seedGuidelines();
    res.json({
      success: true,
      message: `Seeded ${result.seeded} guideline chunks`,
      categories: result.categories,
    });
  } catch (err) {
    log.error('RAG seed error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// ==================== MCP DISCOVERY + SERVER (public discovery, JWT-auth'd /mcp) ====================
// Mounted before authMiddleware so MCP discovery + transport use their own auth (Clerk JWT
// verified against JWKS), independent of the legacy session cookie middleware.
const { mcpConfig: _mcpCfg } = require('./mcp/config');
if (_mcpCfg().enabled) {
  // Order matters: oauth-proxy before well-known because well-known reads
  // isProxyEnabled() to decide which auth_server to advertise.
  require('./mcp/oauth-proxy').mountOAuthProxy(app);
  require('./mcp/well-known').mountWellKnown(app);
  require('./mcp/transport').mountMcp(app);
}

// ==================== UV MIRROR (public marketing scan tool) ====================
// Registered before authMiddleware so the public landing scanner stays
// unauthenticated, exactly like /api/vision/detect-lesions above. Persisted
// scans + leads feed the Loops nurture sequence and the lead -> customer hook
// in POST /api/users below.

const UV_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Module-level fallback so ip_hash stays keyed even when IP_HASH_SECRET is
// unset (dev / unconfigured deploys). ip_hash is write-only and opaque, so a
// static default is acceptable; set IP_HASH_SECRET in production for a real key.
const IP_HASH_DEFAULT_SECRET = 'glowlytics-uv-ip-hash-v1';

const FORM_PLACEMENT_ALIASES = new Map([
  ['hero', 'hero'],
  ['footer', 'footer'],
  ['final-cta', 'footer'],
  ['blog-newsletter', 'footer'],
  ['modal', 'modal'],
  ['pricing', 'pricing'],
  ['mobile_onboarding', 'mobile_onboarding'],
  ['uv-scan-web', 'unknown'],
  ['unknown', 'unknown'],
]);
const ACQUISITION_SOURCES = new Set(['instagram', 'tiktok', 'facebook', 'google', 'other_search', 'ai_search', 'direct', 'referral', 'unknown']);
const ATTRIBUTION_QUALITIES = new Set(['utm', 'referrer', 'unknown', 'backfilled']);
const UV_LEAD_SOURCES = new Set(['uv-scan-web', 'landing', 'test']);
const SENSITIVE_VALUE_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|((api[_-]?key|api|secret|password|credential|bearer|access|refresh|id)?[_-]?token=?)|\b(api[_-]?key|secret|password|credential|bearer)\b|((gclid|gbraid|wbraid)=?)/i;

function marketingField(value, max = 256) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed && !SENSITIVE_VALUE_RE.test(trimmed) ? trimmed : null;
}

function normalizeUvLeadSource(value) {
  if (typeof value !== 'string') return 'uv-scan-web';
  const trimmed = value.trim();
  return UV_LEAD_SOURCES.has(trimmed) ? trimmed : 'uv-scan-web';
}

function normalizeFormPlacement(value) {
  return typeof value === 'string' ? FORM_PLACEMENT_ALIASES.get(value) || 'unknown' : 'unknown';
}

function normalizeHost(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.includes('://') ? value : `https://${value}`);
    return parsed.hostname.toLowerCase().slice(0, 256) || null;
  } catch {
    return /^[a-z0-9.-]+$/i.test(value) && !value.includes('@') ? value.toLowerCase().slice(0, 256) : null;
  }
}

function normalizePath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = value.startsWith('/') ? new URL(value, 'https://glowlytics.ai') : new URL(value);
    return (parsed.pathname || '/').slice(0, 256);
  } catch {
    const path = value.split(/[?#]/, 1)[0];
    return path.startsWith('/') ? path.slice(0, 256) : null;
  }
}

// jsonb columns come back as parsed objects from pg, but a value read as text
// (or returned by a stubbed pool in tests) can arrive as a JSON string —
// normalise before handing it to consumers.
function uvParseJson(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

// Cheap pre-scan quality gate for live camera feedback.
app.post('/api/uv/screen', detectRateLimit, async (req, res) => {
  try {
    const { image_base64, landmarks } = req.body || {};
    if (!image_base64 || typeof image_base64 !== 'string') {
      return res.status(400).json({ error: 'image_base64 required' });
    }
    if (image_base64.length > 15 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large (max 15MB)' });
    }
    const result = await uvScan.screenImage(image_base64, landmarks);
    res.json(result);
  } catch (err) {
    if (err && err.code === 'UV_BAD_IMAGE') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// Full UV/sun-damage + asymmetry analysis; persists the scan for later claim.
app.post('/api/uv/analyze', analyzeRateLimit, async (req, res) => {
  try {
    const { image_base64, landmarks, source } = req.body || {};
    if (!image_base64 || typeof image_base64 !== 'string') {
      return res.status(400).json({ error: 'image_base64 required' });
    }
    if (image_base64.length > 15 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large (max 15MB)' });
    }
    const out = await uvScan.analyzeUv(image_base64, { landmarks, source });
    const id = uuidv4();
    // B1: issued to the scanning client and required to claim the report later.
    const claim_token = randomBytes(16).toString('hex');
    const ip_hash = createHmac('sha256', process.env.IP_HASH_SECRET || IP_HASH_DEFAULT_SECRET).update(String(req.ip || '')).digest('hex').slice(0, 32);
    const row = await uvQueries.insertScan(pool, {
      id,
      claim_token,
      overall: out.overall,
      regions: out.regions,
      asymmetry: out.asymmetry,
      heatmap: out.heatmap,
      screener: out.screener,
      source: source || 'uv-scan-web',
      ip_hash,
    });
    res.json({
      scan_id: id,
      claim_token,
      created_at: (row && row.created_at) || new Date().toISOString(),
      overall: out.overall,
      heatmap: out.heatmap,
      regions: out.regions,
      asymmetry: out.asymmetry,
      screener: out.screener,
    });
  } catch (err) {
    if (err && err.code === 'UV_UNUSABLE') {
      return res.status(422).json({ error: err.message, checks: err.checks });
    }
    if (err && err.code === 'UV_BAD_IMAGE') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// Capture a lead's email in exchange for the PDF report; idempotent on email.
app.post('/api/uv/lead', detectRateLimit, async (req, res) => {
  try {
    const {
      email: rawEmail, scan_id, source, claim_token,
      acquisition_source, acquisition_medium, attribution_quality,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      google_click_id_present, referrer_host, landing_path, form_placement,
      posthog_session_id,
    } = req.body || {};
    const email = typeof rawEmail === 'string' ? rawEmail.toLowerCase().trim() : rawEmail;
    if (!email || typeof email !== 'string' || !UV_EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'invalid email' });
    }
    if (!scan_id) {
      return res.status(400).json({ error: 'scan_id required' });
    }
    const scan = await uvQueries.getScan(pool, scan_id);
    if (!scan) {
      return res.status(400).json({ error: 'unknown scan_id' });
    }
    // B1: capability-token binding closes the scan_id IDOR. /api/uv/analyze
    // hands claim_token to the scanning client; only a caller presenting the
    // matching token may claim the report. Legacy scans created before the
    // column existed (null claim_token) stay claimable for back-compat.
    if (scan.claim_token && claim_token !== scan.claim_token) {
      return res.status(403).json({ error: 'invalid claim token' });
    }
    if (scan.claim_token == null) {
      log.warn('[uv/lead] legacy scan (no claim_token) claimed:', scan_id);
    }
    // One scan -> one lead. A re-claim by the SAME email is idempotent
    // (upsertLead keeps the original report_token + scan_id); once a scan has
    // been claimed, a DIFFERENT email cannot take it over.
    const existingLead = await uvQueries.getLeadByEmail(pool, email);
    if (scan.claimed && (!existingLead || existingLead.scan_id !== scan_id)) {
      return res.status(409).json({ error: 'scan already claimed' });
    }
    const safeSource = normalizeUvLeadSource(source);
    const safeAcquisitionSource = ACQUISITION_SOURCES.has(acquisition_source) ? acquisition_source : 'unknown';
    const safeAttributionQuality = ATTRIBUTION_QUALITIES.has(attribution_quality) ? attribution_quality : 'unknown';
    const lead = await uvQueries.upsertLead(pool, {
      id: uuidv4(),
      email,
      report_token: uuidv4().replace(/-/g, ''),
      scan_id,
      source: safeSource,
      acquisition_source: safeAcquisitionSource,
      acquisition_medium: marketingField(acquisition_medium, 64) || 'unknown',
      attribution_model: 'first_touch',
      attribution_quality: safeAttributionQuality,
      utm_source: marketingField(utm_source, 128)?.toLowerCase() || null,
      utm_medium: marketingField(utm_medium, 128)?.toLowerCase() || null,
      utm_campaign: marketingField(utm_campaign, 256),
      utm_term: marketingField(utm_term, 256),
      utm_content: marketingField(utm_content, 256),
      google_click_id_present: google_click_id_present === true,
      referrer_host: normalizeHost(referrer_host),
      landing_path: normalizePath(landing_path),
      form_placement: normalizeFormPlacement(form_placement),
    });
    if (isForwardPostHogEvent(lead.created_at)) {
      await posthog.captureWaitlistSubmitted({
        sourceKey: 'railway_uv_lead',
        sourceIdentity: `glowlytics:lead:railway:${lead.id}`,
        timestamp: lead.created_at,
        attribution: { ...lead, posthog_session_id },
      });
    }
    await uvQueries.claimScan(pool, scan_id);

    // Best-effort marketing side effect — loops.sendEvent already swallows its
    // own errors, but guard anyway so nothing can fail the lead response.
    try {
      const overall = uvParseJson(scan.overall) || {};
      const asymmetry = uvParseJson(scan.asymmetry) || {};
      await loops.sendEvent(email, 'uv_report_requested', {
        contactProperties: {
          source: safeSource,
          uvSunDamageScore: overall.sunDamageScore,
          uvSeverity: overall.severity,
          uvAsymmetryScore: asymmetry.score,
          reportToken: lead.report_token,
        },
      });
    } catch (loopErr) {
      log.warn('[uv/lead] Loops sendEvent failed:', loopErr?.message || loopErr);
    }

    res.json({ ok: true, report_token: lead.report_token });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// Serve the branded PDF report for a captured lead's token.
app.get('/api/uv/report/:token', async (req, res) => {
  try {
    const lead = await uvQueries.getLeadByToken(pool, req.params.token);
    if (!lead) {
      return res.status(404).json({ error: 'report not found' });
    }
    let scan = lead.scan_id ? await uvQueries.getScan(pool, lead.scan_id) : null;
    if (scan) {
      scan = {
        ...scan,
        overall: uvParseJson(scan.overall),
        regions: uvParseJson(scan.regions),
        asymmetry: uvParseJson(scan.asymmetry),
        heatmap: uvParseJson(scan.heatmap),
        screener: uvParseJson(scan.screener),
      };
    }
    const pdf = await uvReport.buildReportPdf(scan || {}, lead);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="glowlytics-uv-report.pdf"');
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// ==================== PROTECTED ROUTES (auth required) ====================

app.use(authMiddleware);

/**
 * Authorization helper — verifies the authenticated user matches the requested
 * resource owner. Fails CLOSED (B3): a request with no req.auth is denied, not
 * allowed. authMiddleware always sets req.auth (a verified user, or a synthetic
 * { userId: 'dev-user' } on the dev passthrough), so this only rejects callers
 * that reached the handler without authentication.
 */
function authorizeUser(req, res, userId) {
  if (!req.auth || req.auth.userId !== userId) {
    res.status(403).json({ error: 'Access denied' });
    return false;
  }
  return true;
}

// ==================== PHOTO PRODUCT IDENTIFICATION (auth required, rate-limited) ====================
// Triggers paid GPT-4o vision; moved below authMiddleware so unauthenticated
// callers can no longer drive OpenAI spend (BC-001). Mobile client sends a
// Bearer token via httpClient, so this is non-breaking.

// Reusable photo identification: GPT-4o vision -> parse -> enrich from curated
// DB. Returns { identified, name, brand, ingredients[], confidence, source } or
// { identified:false, error }. Callers handle input validation, the openaiKey
// guard, and the outer error response. Shared by the public identify-photo
// route and the authenticated shopping-scan endpoint.
async function identifyByPhoto(image_base64) {
  // 20s deadline + one retry: the SDK default (600s) would let a hung vision
  // call pin this request — and the caller's spinner — for ten minutes.
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a skincare product identification assistant. Identify the product in this photo and return its full name, brand, and complete ingredient list (INCI format). If you can read the ingredients from the packaging, list them exactly. If you can identify the product but cannot read ingredients, provide the known ingredients for that product. If you cannot identify the product with confidence, return identified: false. Return ONLY valid JSON matching this schema: { "identified": boolean, "name": string, "brand": string, "ingredients": string[], "confidence": "low" | "med" | "high" }`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${image_base64}`, detail: 'low' },
          },
          { type: 'text', text: 'Identify this skincare product. Return the product name, brand, and full ingredient list as JSON.' },
        ],
      },
    ],
    max_tokens: 800,
    temperature: 0.1,
  }, { timeout: 20_000, maxRetries: 1 });

  const raw = (completion.choices?.[0]?.message?.content || '').trim();

  // Parse JSON: try direct parse first, then extract from code fences
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try extracting from ```json ... ``` code fences
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try { parsed = JSON.parse(fenceMatch[1].trim()); } catch { /* fall through */ }
    }
    // Last resort: find first { and matching closing }
    if (!parsed) {
      const start = raw.indexOf('{');
      if (start >= 0) {
        try { parsed = JSON.parse(raw.slice(start)); } catch { /* fall through */ }
      }
    }
  }

  if (!parsed) {
    log.warn('[identify-photo] Could not parse GPT response:', raw.slice(0, 200));
    return { identified: false, error: 'Could not parse response' };
  }
  if (!parsed.identified) {
    log.warn('[identify-photo] GPT could not identify product');
    return { identified: false, error: 'Could not identify product' };
  }

  // Enrich/verify ingredients and images from curated DB
  const curatedMatch = searchCuratedProducts(parsed.name);
  if (curatedMatch.length > 0) {
    const curatedProduct = curatedMatch[0];
    if (curatedProduct.ingredients.length > (parsed.ingredients || []).length) {
      parsed.ingredients = curatedProduct.ingredients;
      parsed.brand = parsed.brand || curatedProduct.brand;
    }
    if (!parsed.image_url && curatedProduct.image_url) {
      parsed.image_url = curatedProduct.image_url;
    }
  }

  return {
    identified: true,
    name: parsed.name || '',
    brand: parsed.brand || '',
    ingredients: parsed.ingredients || [],
    confidence: parsed.confidence || 'med',
    image_url: parsed.image_url || null,
    source: 'gpt4o_vision',
  };
}

app.post('/api/products/identify-photo', photoRateLimit, async (req, res) => {
  try {
    const { image_base64 } = req.body;
    if (!image_base64 || typeof image_base64 !== 'string') {
      return res.status(400).json({ error: 'image_base64 is required' });
    }
    // Limit payload to ~10MB base64 (prevents abuse)
    if (image_base64.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large (max 10MB)' });
    }
    if (!openaiKey) {
      return res.status(503).json({ error: 'Product identification unavailable' });
    }

    const result = await identifyByPhoto(image_base64);
    res.json(result);
  } catch (err) {
    log.warn('[identify-photo] Error:', err.message);
    res.json({ identified: false, error: 'Product identification failed' });
  }
});

// ==================== SHOPPING SCAN (auth required) ====================
// Scan a product the user does NOT own and get a personalized Buy/Maybe/Skip
// verdict vs their skin goal + the products already on their shelf. Reuses the
// identification helpers above; adds the personalized verdict layer.
// Rate-limited via photoRateLimit (consistent with the vision identify path it
// can trigger). Never trusts body.user_id; parameterized queries only.
app.post('/api/products/shopping-scan', photoRateLimit, async (req, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { barcode, image_base64, name, ingredients } = req.body || {};

    // --- Identify the candidate product ---
    let candidateRaw = null;
    if (barcode !== undefined && barcode !== null && barcode !== '') {
      if (typeof barcode !== 'string' || !/^[0-9]{6,14}$/.test(barcode)) {
        return res.status(400).json({ error: 'Invalid barcode format' });
      }
      const product = await identifyByBarcode(barcode);
      if (!product) return res.json({ identified: false });
      candidateRaw = {
        name: product.name,
        brand: product.brand || '',
        ingredients: product.ingredients || [],
        image_url: product.image_url || null,
        source: product.source,
      };
    } else if (image_base64 !== undefined && image_base64 !== null && image_base64 !== '') {
      if (typeof image_base64 !== 'string') {
        return res.status(400).json({ error: 'image_base64 must be a string' });
      }
      if (image_base64.length > 10 * 1024 * 1024) {
        return res.status(413).json({ error: 'Image too large (max 10MB)' });
      }
      if (!openaiKey) {
        return res.status(503).json({ error: 'Product identification unavailable' });
      }
      const product = await identifyByPhoto(image_base64);
      if (!product || !product.identified) return res.json({ identified: false });
      candidateRaw = {
        name: product.name,
        brand: product.brand || '',
        ingredients: product.ingredients || [],
        image_url: product.image_url || null,
        source: product.source,
      };
    } else if (name && Array.isArray(ingredients)) {
      // Bound the manual list: cap count and per-element length to prevent an
      // event-loop DoS via a ~20MB body of millions of strings (matches the
      // barcode/image guards: reject with 400 on exceed).
      if (ingredients.length > 200) {
        return res.status(400).json({ error: 'Too many ingredients (max 200)' });
      }
      if (ingredients.some((ing) => typeof ing !== 'string' || ing.length > 200)) {
        return res.status(400).json({ error: 'Each ingredient must be a string of at most 200 characters' });
      }
      candidateRaw = {
        name: String(name),
        brand: '',
        ingredients: ingredients.map(String),
        image_url: null,
        source: 'manual',
      };
    } else {
      return res.status(400).json({ error: 'Provide a barcode, image_base64, or name + ingredients[]' });
    }

    const candidate = shoppingScan.analyzeProduct({ name: candidateRaw.name, ingredients: candidateRaw.ingredients });

    // --- Load the user's goal(s): scan_protocols.primary_goal, fallback user_profiles ---
    let goals = [];
    let profile = {};
    try {
      const protoRes = await pool.query(
        'SELECT primary_goal FROM scan_protocols WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId]
      );
      if (protoRes.rows[0]?.primary_goal) goals = [protoRes.rows[0].primary_goal];
    } catch (err) {
      log.warn('[shopping-scan] goal lookup failed:', err.message);
    }
    try {
      const profRes = await pool.query(
        'SELECT skin_goal, menstrual_status FROM user_profiles WHERE user_id = $1',
        [userId]
      );
      if (profRes.rows[0]) {
        profile = profRes.rows[0];
        if (goals.length === 0 && profRes.rows[0].skin_goal) goals = [profRes.rows[0].skin_goal];
      }
    } catch (err) {
      log.warn('[shopping-scan] profile lookup failed:', err.message);
    }

    // --- Load the active routine (products with no end_date) ---
    let routine = [];
    let shelfUnavailable = false;
    try {
      const routineRes = await pool.query(
        'SELECT product_name, ingredients_list FROM product_catalog WHERE user_id = $1 AND end_date IS NULL',
        [userId]
      );
      routine = (routineRes.rows || []).map((r) =>
        shoppingScan.analyzeProduct({ name: r.product_name, ingredients: r.ingredients_list || [] })
      );
    } catch (err) {
      shelfUnavailable = true;
      log.warn('[shopping-scan] routine lookup failed:', err.message);
    }

    const result = shoppingScan.computeVerdict({ candidate, routine, goals, profile });

    return res.json({
      identified: true,
      product: {
        name: candidateRaw.name,
        brand: candidateRaw.brand,
        ingredients: candidateRaw.ingredients,
        image_url: candidateRaw.image_url,
        source: candidateRaw.source,
      },
      ...result,
      ...(shelfUnavailable ? { partial: true } : {}),
    });
  } catch (err) {
    log.warn('[shopping-scan] Error:', err.message);
    return res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// ==================== VISION API PROXY ====================

app.post('/api/vision/analyze', analyzeRateLimit, async (req, res) => {
  try {
    const { image_base64, context, client_signal_scores, client_signal_confidence, client_lesions } = req.body;

    if (!image_base64 || typeof image_base64 !== 'string') {
      return res.status(400).json({ error: 'image_base64 is required' });
    }
    if (image_base64.length > 15 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large (max 15MB)' });
    }
    if (!context) {
      return res.status(400).json({ error: 'context object is required' });
    }

    // ==================== CLIENT-PROVIDED LAYER 2 ====================
    // Mobile clients run skin_signals_v2 + YOLOv8 on-device (CoreML / NNAPI)
    // and send the results in the request body. When present we trust them
    // and skip the server-side ONNX path entirely — that's the slowest
    // segment of this endpoint (~1-3s of shared-CPU work on Railway).
    //
    // We sanitize aggressively: any client-supplied value that isn't a
    // finite 0-100 number is replaced with 50 (neutral), and confidence
    // values must be from the enum or we default to 'med'.
    const clamp100 = (v) => {
      // NaN survives JSON as `null`, and a missing key arrives as `undefined`.
      // Either should fall back to the neutral 50, not to `Number(null) === 0`.
      if (v === null || v === undefined) return 50;
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50;
    };
    const CONF_VALUES = new Set(['low', 'med', 'high']);
    const sanitizeClientScores = (scores) => {
      if (!scores || typeof scores !== 'object') return null;
      return {
        structure: clamp100(scores.structure),
        hydration: clamp100(scores.hydration),
        inflammation: clamp100(scores.inflammation),
        sunDamage: clamp100(scores.sunDamage),
        elasticity: clamp100(scores.elasticity),
      };
    };
    const sanitizeClientConfidence = (conf) => {
      if (!conf || typeof conf !== 'object') return null;
      const pick = (v) => (CONF_VALUES.has(v) ? v : 'med');
      return {
        structure: pick(conf.structure),
        hydration: pick(conf.hydration),
        inflammation: pick(conf.inflammation),
        sunDamage: pick(conf.sunDamage),
        elasticity: pick(conf.elasticity),
      };
    };
    const sanitizeClientLesions = (raw) => {
      if (!Array.isArray(raw)) return null;
      // Trust the camera-side detector but cap to 50 entries and 4 decimal
      // places of bbox precision so a malicious client can't bloat the response.
      return raw.slice(0, 50).map((l) => ({
        class: typeof l.class === 'string' ? l.class.slice(0, 32) : 'acne',
        confidence: Number.isFinite(l.confidence) ? Math.max(0, Math.min(1, l.confidence)) : 0,
        bbox: Array.isArray(l.bbox) && l.bbox.length === 4
          ? l.bbox.map((v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0))
          : [0, 0, 0, 0],
        zone: typeof l.zone === 'string' ? l.zone.slice(0, 32) : 'unknown',
        tier: l.tier === 'confirmed' ? 'confirmed' : 'possible',
      })).filter((l) => l.confidence > 0);
    };

    const clientScores = sanitizeClientScores(client_signal_scores);
    const clientConfidence = sanitizeClientConfidence(client_signal_confidence) || {
      structure: 'high', hydration: 'high', inflammation: 'med', sunDamage: 'high', elasticity: 'high',
    };
    const clientLesions = sanitizeClientLesions(client_lesions);

    const modelId = process.env.VISION_MODEL_ID || 'gpt-4o';

    // ==================== RESTRUCTURED GPT-4o PROMPT ====================
    // Now requests 5 signal scores directly + zone_severity to eliminate
    // the lossy 3-proxy → 5-signal linear conversion.
    const systemPrompt = `You are a dermatology analysis assistant. Analyze the provided facial skin photo and return structured scores.

Score each of the 5 skin health signals 0-100 where 100 = optimal health and 0 = severe concern:
- structure: skin texture quality, pore visibility, surface smoothness, collagen integrity
- hydration: moisture levels, barrier function, dewy vs matte appearance, fine dehydration lines
- inflammation: redness, irritation, active breakouts, pustules, papules, erythema
- sunDamage: hyperpigmentation, sunspots, melasma, UV damage signs, uneven pigmentation
- elasticity: firmness, fine lines, wrinkles, skin laxity, bounce-back quality

Also provide legacy scores for backward compatibility (0-100 where 100 = severe concern):
- acne_score: inflammation + breakout severity
- sun_damage_score: UV damage severity
- skin_age_score: aging markers severity

Provide per-zone severity assessment:
zone_severity: for each facial zone, rate the dominant concern and severity (0-100).
Zones: forehead, left_cheek, right_cheek, nose, chin, jaw

Identify skin conditions with facial zones:
conditions: [{name, severity ("mild"|"moderate"|"severe"),
  zones: [{region, severity}], description}]

Conditions to check: acne, hyperpigmentation, fine_lines, rosacea,
dehydration, sun_spots, texture_irregularity, dark_circles, enlarged_pores

Also provide:
- confidence: "low", "med", or "high" based on image quality and clarity
- primary_driver: the main factor driving the scores
- recommended_action: one actionable sentence
- personalized_feedback: 2-3 actionable sentences about the user's skin

Context: User's primary goal is "${context.primary_goal || 'general tracking'}", scanning "${context.scan_region || 'full face'}" region.
Sunscreen used today: ${context.sunscreen_used ?? false}. Sleep: ${context.sleep_quality || 'unknown'}. Stress: ${context.stress_level || 'unknown'}.
Number of previous scans: ${context.scan_count ?? 0}.

Return ONLY valid JSON matching this schema:
{
  "signal_scores": {"structure": number, "hydration": number, "inflammation": number, "sunDamage": number, "elasticity": number},
  "acne_score": number, "sun_damage_score": number, "skin_age_score": number,
  "confidence": "low" | "med" | "high",
  "zone_severity": {"forehead": {"dominant_signal": string, "severity": number}, "left_cheek": {...}, "right_cheek": {...}, "nose": {...}, "chin": {...}, "jaw": {...}},
  "conditions": [{"name": string, "severity": "mild"|"moderate"|"severe", "zones": [{"region": string, "severity": "mild"|"moderate"|"severe"}], "description": string}],
  "primary_driver": string, "recommended_action": string, "personalized_feedback": string
}`;

    // ==================== 3-LAYER PARALLEL PIPELINE ====================
    // Layer 1: Deterministic image processing (~100ms)
    // Layer 2: Custom CV models via ONNX Runtime (~200ms)
    // Layer 3: Fine-tuned GPT-4o (~3-5s) — skipped or fallback-synthesised
    //   when OPENAI_DISABLED=true, no API key, or OpenAI returns a non-retryable
    //   error (429 quota / 401 invalid). The merge tolerates a null L3 by
    //   zeroing its weight (see signal-models.js mergeSignalScores).
    const llmDisabled = noLlmFallback.isLLMDisabled();

    // Layer 1 still runs locally even when the client provides L2 scores —
    // a*/ITA + Gabor features are cheap (~100ms) and we still want them
    // surfaced in the response's `signal_features`. Only the ONNX path
    // (`runAllModels`) is skipped when the client trusted-source is present.
    const layer1Promise = imageProcessing.extractFeatures(image_base64).then(async (features) => {
      const layer1Scores = imageProcessing.featuresToSignalScores(features);
      const summaryFeatures = imageProcessing.extractSummaryFeatures(features);
      let layer2Results;
      if (clientScores) {
        // Build a synthetic L2 result from the trusted client payload.
        // Shape mirrors `signalModels.runAllModels()` so the existing merge
        // math doesn't need to learn a new code path.
        layer2Results = {
          signalOverrides: {
            structure: clientScores.structure,
            hydration: clientScores.hydration,
            sunDamage: clientScores.sunDamage,
            elasticity: clientScores.elasticity,
          },
          lesions: clientLesions || [],
          signalConfidence: clientConfidence,
          source: 'client',
        };
      } else {
        layer2Results = await signalModels.runAllModels(image_base64, features);
        // If the client only sent lesions (e.g. older mobile build), merge
        // them into whatever the server detector produced.
        if (clientLesions && layer2Results) {
          layer2Results.lesions = clientLesions;
        }
      }
      return { features, layer1Scores, layer2Results, summaryFeatures };
    }).catch((err) => {
      log.warn('[vision] Layer 1/2 failed:', err.message);
      return null;
    });

    const layer3Promise = llmDisabled
      ? Promise.resolve(null)
      : Promise.race([
          openai.chat.completions.create({
            model: modelId,
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Analyze this facial skin photo and return the structured scores.' },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/jpeg;base64,${image_base64}`,
                      detail: 'high',
                    },
                  },
                ],
              },
            ],
            max_tokens: 1200,
            temperature: 0.2,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI request timed out after 30s')), 30_000)),
        ]).catch((err) => {
          // Quota / auth / non-retryable errors → fall back deterministically.
          // Transient transport errors fall back too; the alternative is failing
          // the entire scan, which is worse than a slightly-degraded result.
          if (noLlmFallback.isFatalOpenAIError(err)) {
            log.warn(`[vision] OpenAI fatal (${err.status || err.code}); falling back to L1+L2 only`);
          } else {
            log.warn(`[vision] OpenAI error: ${err.message}; falling back to L1+L2 only`);
          }
          return null;
        });

    const [layer1Result, layer3Result] = await Promise.all([layer1Promise, layer3Promise]);

    // ==================== PARSE OR SYNTHESISE LAYER 3 ====================
    let parsed;
    let layer3Synthesised = false;

    if (layer3Result) {
      const content = layer3Result.choices?.[0]?.message?.content;
      if (!content) {
        log.warn('[vision] Empty L3 response; synthesising from L1+L2');
        layer3Synthesised = true;
      } else {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          log.warn('[vision] L3 response not parseable as JSON; synthesising from L1+L2');
          layer3Synthesised = true;
        } else {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch (parseErr) {
            log.warn('[vision] L3 JSON malformed; synthesising from L1+L2');
            layer3Synthesised = true;
          }
        }
      }
    } else {
      layer3Synthesised = true;
    }

    if (layer3Synthesised) {
      if (!layer1Result) {
        // We need at least L1 to synthesise a sensible response.
        return res.status(502).json({ error: 'Vision pipeline unavailable (no LLM and no L1/L2 result)' });
      }
      parsed = noLlmFallback.buildLayer3FromDeterministic({
        layer1Scores: layer1Result.layer1Scores,
        layer2Results: layer1Result.layer2Results,
      });
    }

    const clamp = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50; };
    const validConfidence = ['low', 'med', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low';

    const VALID_SEVERITIES = ['mild', 'moderate', 'severe'];
    const validatedConditions = Array.isArray(parsed.conditions)
      ? parsed.conditions.filter((c) => {
          if (!c || typeof c.name !== 'string' || !c.name) return false;
          if (!VALID_SEVERITIES.includes(c.severity)) return false;
          if (!Array.isArray(c.zones)) return false;
          if (typeof c.description !== 'string') return false;
          return true;
        })
      : [];

    // ==================== EXTRACT LAYER 3 SIGNAL SCORES ====================
    // GPT-4o now outputs signal_scores directly — no more lossy linear conversion
    let layer3SignalScores;
    if (parsed.signal_scores && Number.isFinite(parsed.signal_scores.structure)) {
      layer3SignalScores = {
        structure: clamp(parsed.signal_scores.structure),
        hydration: clamp(parsed.signal_scores.hydration),
        inflammation: clamp(parsed.signal_scores.inflammation),
        sunDamage: clamp(parsed.signal_scores.sunDamage),
        elasticity: clamp(parsed.signal_scores.elasticity),
      };
    } else {
      // Fallback: derive from legacy 3-score format (backward compat with older model)
      const safeNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 50; };
      const legacyAcne = safeNum(parsed.acne_score);
      const legacySun = safeNum(parsed.sun_damage_score);
      const legacyAge = safeNum(parsed.skin_age_score);
      layer3SignalScores = {
        structure: clamp(100 - (legacyAge * 0.55 + legacyAcne * 0.15)),
        hydration: clamp(100 - (legacyAge * 0.5 + legacyAcne * 0.2)),
        inflammation: clamp(100 - (legacyAcne * 0.8 + legacySun * 0.1)),
        sunDamage: clamp(100 - (legacySun * 0.82 + legacyAcne * 0.08)),
        elasticity: clamp(100 - (legacyAge * 0.62 + legacyAcne * 0.1)),
      };
    }

    // Validate zone_severity from GPT-4o
    const zoneSeverity = parsed.zone_severity && typeof parsed.zone_severity === 'object'
      ? parsed.zone_severity
      : {};

    // ==================== MERGE SIGNAL SCORES ====================
    let signalScores, signalFeatures, lesions, signalConfidence;

    if (layer1Result) {
      // Full uncertainty-weighted merge. When L3 was synthesised from L1+L2
      // we pass null so the merge zeros L3's weight — otherwise we'd be
      // double-counting deterministic data through the "L3" lane.
      signalScores = signalModels.mergeSignalScores(
        layer1Result.layer1Scores,
        layer1Result.layer2Results,
        layer3Synthesised ? null : layer3SignalScores,
      );
      signalFeatures = layer1Result.summaryFeatures;
      lesions = layer1Result.layer2Results.lesions || [];
      signalConfidence = layer1Result.layer2Results.signalConfidence;

      // Apply lesion → signal score feedback loop
      signalScores = signalModels.applyLesionFeedback(signalScores, lesions);
    } else {
      // Layer 3 only fallback
      signalScores = layer3SignalScores;
      signalFeatures = {};
      lesions = [];
      signalConfidence = {
        structure: 'low',
        hydration: 'low',
        inflammation: 'low',
        sunDamage: 'low',
        elasticity: 'low',
      };
    }

    // ==================== MULTI-QUERY RAG ====================
    const primaryCondition = parsed.conditions?.[0]?.name || parsed.primary_driver || 'general skin health';
    let ragRecommendations = [];

    // Find weakest signals for targeted RAG queries
    const signalEntries = Object.entries(signalScores).sort((a, b) => a[1] - b[1]);
    const weakestSignal = signalEntries[0]?.[0] || 'structure';
    const secondWeakest = signalEntries[1]?.[0] || 'hydration';

    try {
      if (process.env.PINECONE_API_KEY) {
        const ragResults = await queryGuidelinesMulti({
          primaryCondition,
          userGoal: context.primary_goal || 'general tracking',
          weakestSignal,
          secondWeakestSignal: secondWeakest,
        });
        ragRecommendations = ragResults.map(r => ({
          text: r.text,
          category: r.category,
          relevance: r.score,
          signal: r.signal || 'general',
          evidence_level: r.evidence_level || 'C',
          source_citation: r.source_citation || '',
        }));
      }
    } catch (err) {
      log.warn('RAG query failed, continuing without recommendations:', err.message);
    }

    // ==================== BUILD RESPONSE ====================
    const result = {
      // Legacy fields (backward compatible)
      acne_score: clamp(parsed.acne_score),
      sun_damage_score: clamp(parsed.sun_damage_score),
      skin_age_score: clamp(parsed.skin_age_score),
      confidence: validConfidence,
      primary_driver: parsed.primary_driver || 'general tracking',
      recommended_action: parsed.recommended_action || 'Continue daily scans for more data.',
      conditions: validatedConditions,
      rag_recommendations: ragRecommendations,
      personalized_feedback: parsed.personalized_feedback || '',
      // Signal-specific fields
      signal_scores: signalScores,
      signal_features: signalFeatures,
      lesions,
      signal_confidence: signalConfidence,
      zone_severity: zoneSeverity,
    };

    res.json(result);
  } catch (err) {
    log.error(`Vision API error: ${err.message || err}`);
    if (err.status === 401 || err.code === 'invalid_api_key') {
      return res.status(502).json({ error: 'OpenAI API key is invalid or missing' });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: 'Vision API rate limit exceeded. Try again shortly.' });
    }
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// ==================== STAGE 2: STREAMING INSIGHT GENERATION ====================

/**
 * Build the system prompt for Stage 2 insight generation.
 * Receives all merged data from Stage 1 + RAG context + user profile.
 */
function buildInsightPrompt({ signal_scores, lesions, conditions, zone_severity, user_profile, user_goal, products, rag_context, scan_count, healthkit_context }) {
  const lesionSummary = lesions && lesions.length > 0
    ? lesions.reduce((acc, l) => {
        acc[l.class] = (acc[l.class] || 0) + 1;
        return acc;
      }, {})
    : {};
  const lesionText = Object.keys(lesionSummary).length > 0
    ? Object.entries(lesionSummary).map(([cls, count]) => `${count} ${cls}(s)`).join(', ')
    : 'No lesions detected';

  const ragText = (rag_context || []).map((r, i) => {
    const cite = r.source_citation ? ` (${r.source_citation})` : '';
    const grade = r.evidence_level ? ` [Grade ${r.evidence_level}]` : '';
    return `[${i + 1}]${grade}${cite} ${r.text}`;
  }).join('\n');
  const productText = (products || []).map(p => `- ${p.product_name} (${p.usage_schedule})`).join('\n') || 'No products logged';

  // HealthKit rollup — only render the block when at least one signal is
  // present so we don't pad the prompt with "unknown" lines (which the model
  // tends to over-emphasize as if they were meaningful absences).
  const hk = healthkit_context || null;
  const hkLines = [];
  if (hk) {
    const formatSleep = (mins) => {
      if (mins == null) return null;
      const h = Math.floor(mins / 60);
      const m = Math.round(mins % 60);
      return `${h}h ${m}m`;
    };
    if (hk.sleep_total_minutes_avg != null) {
      hkLines.push(`- Sleep (avg over last ${hk.window_days}d): ${formatSleep(hk.sleep_total_minutes_avg)}`
        + (hk.sleep_deep_minutes_avg != null ? `, ${formatSleep(hk.sleep_deep_minutes_avg)} deep` : '')
        + (hk.sleep_rem_minutes_avg != null ? `, ${formatSleep(hk.sleep_rem_minutes_avg)} REM` : ''));
    }
    if (hk.hrv_sdnn_ms_avg != null) hkLines.push(`- HRV (SDNN avg): ${hk.hrv_sdnn_ms_avg} ms`);
    if (hk.resting_hr_bpm_avg != null) hkLines.push(`- Resting heart rate (avg): ${hk.resting_hr_bpm_avg} bpm`);
    if (hk.steps_avg != null) hkLines.push(`- Daily steps (avg): ${Math.round(hk.steps_avg)}`);
    if (hk.mindful_minutes_avg != null) hkLines.push(`- Mindful minutes (avg): ${hk.mindful_minutes_avg}`);
    if (hk.menstrual_flow_last7) hkLines.push(`- Menstrual flow in window: ${hk.menstrual_flow_last7}`);
    if (hk.cycle_day != null) hkLines.push(`- Today's cycle day: ${hk.cycle_day}`);
  }
  const healthKitBlock = hkLines.length > 0
    ? `\n\nHealthKit signals (use these to ground pattern-level insights — reference specific values, do not fabricate trends if absent):\n${hkLines.join('\n')}`
    : '';

  const system = `You are Glowlytics AI, a personalized skin health advisor. Generate detailed, personalized insights based on the user's scan results and clinical guidelines.

IMPORTANT: Every insight MUST be personalized to THIS user's specific scores, detected conditions, and context. Never use generic advice. Ground recommendations in the clinical guidelines provided. When making a recommendation, cite the guideline number in brackets (e.g., "Based on [2]: ..."). Prefer Grade A evidence over B or C when available.

User context:
- Primary goal: ${user_goal || 'general tracking'}
- Age range: ${user_profile?.age_range || 'unknown'}
- Scan count: ${scan_count || 0}
- Menstrual cycle day: ${user_profile?.cycle_day || 'not tracked'}
- Products in routine:
${productText}${healthKitBlock}

Scan results:
- Structure: ${signal_scores?.structure ?? 'N/A'}/100
- Hydration: ${signal_scores?.hydration ?? 'N/A'}/100
- Inflammation: ${signal_scores?.inflammation ?? 'N/A'}/100
- Sun Damage: ${signal_scores?.sunDamage ?? 'N/A'}/100
- Elasticity: ${signal_scores?.elasticity ?? 'N/A'}/100
- Lesions detected: ${lesionText}
- Conditions: ${(conditions || []).map(c => `${c.name} (${c.severity})`).join(', ') || 'none identified'}

Clinical guidelines for reference (use these to ground your recommendations):
${ragText || 'No guidelines available'}

Return ONLY valid JSON matching this schema:
{
  "overall_summary": "2-3 sentences summarizing this user's skin status right now, referencing their specific scores and detected issues",
  "overall_score_context": "1-2 sentences explaining what their overall score means for their specific situation and goal",
  "signal_insights": {
    "structure": {"status": "1 sentence about their texture/pore status", "driver": "what is driving this score", "action": "specific recommendation grounded in guidelines"},
    "hydration": {"status": "...", "driver": "...", "action": "..."},
    "inflammation": {"status": "...", "driver": "...", "action": "..."},
    "sunDamage": {"status": "...", "driver": "...", "action": "..."},
    "elasticity": {"status": "...", "driver": "...", "action": "..."}
  },
  "zone_findings": [{"zone": "chin|forehead|left_cheek|right_cheek|nose|jaw", "finding": "what was observed in this zone", "recommendation": "zone-specific action"}],
  "product_guidance": {"stop": "product-specific stop rec or general guidance", "consider": "product-specific add rec", "continue": "what to maintain"},
  "action_plan": ["Priority 1: ...", "Priority 2: ...", "Priority 3: ..."]
}`;

  return { system, user: 'Generate personalized insights based on the scan results above.' };
}

app.post('/api/vision/generate-insights', analyzeRateLimit, async (req, res) => {
  try {
    const {
      signal_scores, signal_features, signal_confidence,
      lesions, conditions, zone_severity,
      user_profile, user_goal, products, scan_count,
      rag_context, healthkit_context,
    } = req.body;

    if (!signal_scores) {
      return res.status(400).json({ error: 'signal_scores is required' });
    }

    // SSE streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // No-LLM path — emit a structured template payload as a single SSE chunk.
    // The client treats SSE as append-only text, so we send the full insight
    // JSON serialised + a [DONE] marker. mobile streamInsights() collects the
    // text and parses on completion (same as the GPT-4o path).
    if (noLlmFallback.isLLMDisabled()) {
      const insights = noLlmFallback.buildInsightsFromDeterministic({
        signal_scores, lesions, conditions, scan_count,
      });
      res.write(`data: ${JSON.stringify({ text: JSON.stringify(insights) })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const modelId = process.env.VISION_MODEL_ID || 'gpt-4o';
    const insightPrompt = buildInsightPrompt({
      signal_scores, lesions, conditions, zone_severity,
      user_profile, user_goal, products, rag_context, scan_count,
      healthkit_context,
    });

    let stream;
    try {
      stream = await openai.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: insightPrompt.system },
          { role: 'user', content: insightPrompt.user },
        ],
        max_tokens: 1500,
        temperature: 0.3,
        stream: true,
      });
    } catch (err) {
      // OpenAI rejected before we started streaming — fall back to templates
      // so the client never sees a broken insights pane.
      if (noLlmFallback.isFatalOpenAIError(err)) {
        log.warn(`[generate-insights] OpenAI fatal (${err.status || err.code}); serving template insights`);
      } else {
        log.warn(`[generate-insights] OpenAI error: ${err.message}; serving template insights`);
      }
      const insights = noLlmFallback.buildInsightsFromDeterministic({
        signal_scores, lesions, conditions, scan_count,
      });
      res.write(`data: ${JSON.stringify({ text: JSON.stringify(insights) })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // Wall-clock guard: a stalled upstream stream must not pin this SSE
    // response open indefinitely (default SDK timeout is 10 minutes). On
    // expiry, abort the OpenAI request — which ends the for-await — and close
    // the SSE stream cleanly so the client can fall back.
    let streamTimedOut = false;
    const streamGuard = setTimeout(() => {
      streamTimedOut = true;
      try { stream.controller.abort(); } catch { /* stream already settled */ }
    }, 120_000);
    if (typeof streamGuard.unref === 'function') streamGuard.unref();

    try {
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
        }
      }
    } catch (err) {
      if (!streamTimedOut) throw err; // real stream failure → outer handler
    } finally {
      clearTimeout(streamGuard);
    }

    if (streamTimedOut) {
      log.warn('[generate-insights] stream exceeded 120s wall clock; aborted');
      res.write(`data: ${JSON.stringify({ error: 'Insight generation timed out' })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    log.error('[generate-insights] Error:', err.message);
    // If headers already sent (streaming started), just end
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: safeErrorMessage(err) })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.status(500).json({ error: safeErrorMessage(err) });
    }
  }
});

// ==================== BONE STRUCTURE (HARMONY) ANALYSIS ====================

// Pass-through "downsample" — preserves the vertex-index → anatomical-landmark
// contract that the viewer's measurement overlays + outline edges rely on.
//
// Earlier this function dropped every Nth vertex to keep DB rows small, but
// that destroys the contract: a viewer drawing an edge between indices 127
// and 234 (tragion → zygion in MediaPipe topology) would after downsample
// end up connecting random unmapped slots. The result on-device was a
// scattered "dot cloud" instead of a head outline.
//
// Canonical mesh is ~474 verts (5.7 KB JSON-encoded), ARKit's is 1220 verts
// (~15 KB). Both fit comfortably in Postgres JSONB; storage cost is not the
// bottleneck. If we ever need to compress, swap to a delta-encoding scheme
// or move full meshes to S3 — never index-stripping.
function downsampleMesh(vertices) {
  if (!vertices) return null;
  return Array.isArray(vertices) ? vertices : Array.from(vertices);
}

// Mesh size cap — derived from the largest source (ARKit's canonical face
// geometry has 1220 vertices). We accept up to that × 3 floats for safety.
const MAX_MESH_VERTICES = 1500;

app.post('/api/vision/bone-structure', analyzeRateLimit, async (req, res) => {
  const start = Date.now();
  try {
    const { mesh, daily_id, sex_override } = req.body || {};
    const userId = req.auth?.userId || null;

    // ----- Mesh shape + content validation -----
    if (!mesh || !Array.isArray(mesh.vertices) || mesh.vertices.length === 0) {
      return res.status(400).json({ error: 'mesh.vertices is required' });
    }
    if (mesh.vertices.length % 3 !== 0) {
      return res.status(400).json({ error: 'mesh.vertices must be a flat xyz array (length divisible by 3)' });
    }
    if (mesh.vertices.length > MAX_MESH_VERTICES * 3) {
      return res.status(413).json({ error: `Mesh too large (max ${MAX_MESH_VERTICES} vertices)` });
    }
    for (let i = 0; i < mesh.vertices.length; i++) {
      if (typeof mesh.vertices[i] !== 'number' || !Number.isFinite(mesh.vertices[i])) {
        return res.status(400).json({ error: 'mesh.vertices must contain only finite numbers' });
      }
    }

    const source = mesh.source === 'canonical' ? 'canonical' : mesh.source === 'mediapipe' ? 'mediapipe' : 'arkit';
    const indices = Array.isArray(mesh.indices) ? mesh.indices : null;
    const coherence = boneStructure.isSourceCoherent(source, mesh.vertices.length / 3, indices);
    if (!coherence.ok) {
      return res.status(400).json({ error: `mesh source/count mismatch: ${coherence.reason}` });
    }
    const blendShapes = mesh.blendShapes && typeof mesh.blendShapes === 'object' ? mesh.blendShapes : null;

    // ----- Authorization: verify daily_id ownership BEFORE running expensive math -----
    // Returns: 'owned' (proceed + persist), 'pending' (skip persist, still analyse),
    // 'forbidden' (reject), 'none' (no daily_id supplied, skip persist).
    let ownership = 'none';
    if (daily_id) {
      if (userId && userId !== 'dev-user') {
        try {
          const { rows } = await pool.query(
            'SELECT user_id FROM daily_records WHERE daily_id = $1',
            [daily_id]
          );
          if (rows.length === 0) {
            // daily_record hasn't synced yet — client should retry once the
            // sync outbox flushes the addDailyRecord write.
            ownership = 'pending';
          } else if (rows[0].user_id !== userId) {
            return res.status(403).json({ error: 'daily_id does not belong to the authenticated user' });
          } else {
            ownership = 'owned';
          }
        } catch (err) {
          log.warn('[bone-structure] ownership check failed:', err.message);
          ownership = 'pending';
        }
      } else {
        // Dev-mode passthrough — accept without DB check.
        ownership = 'owned';
      }
    }

    // ----- Resolve sex from explicit override or the user's profile -----
    let sex = sex_override === 'male' || sex_override === 'female' ? sex_override : null;
    if (!sex && userId && userId !== 'dev-user') {
      try {
        const { rows } = await pool.query('SELECT sex FROM user_profiles WHERE user_id = $1', [userId]);
        if (rows[0]?.sex === 'male' || rows[0]?.sex === 'female') sex = rows[0].sex;
      } catch (err) {
        log.warn('[bone-structure] sex lookup failed:', err.message);
      }
    }

    // ----- Run the analysis -----
    const result = boneStructure.analyzeBoneStructure({
      vertices: mesh.vertices,
      indices,
      blendShapes,
      sex,
      source,
    });

    if (result.status !== 'ok') {
      return res.status(200).json({
        ...result,
        interventions: { lifestyle: [], pharmacological: [], interventional: [], procedural_disclaimer: '' },
        downsampled_mesh: null,
        persisted: false,
        latency_ms: Date.now() - start,
        generated_at: new Date().toISOString(),
      });
    }

    const interventions = recommendInterventions(result.findings);
    const downsampled_mesh = {
      vertices: downsampleMesh(mesh.vertices),
      source,
    };

    const payload = {
      harmony: result.harmony,
      status: result.status,
      domain_scores: result.domainScores,
      scored_metrics: result.scored,
      metrics: result.metrics,
      estimate: result.estimate,
      confidence: result.confidence,
      landmark_source: result.landmark_source,
      findings: result.findings,
      interventions,
      dominant_driver: result.dominantDriver,
      downsampled_mesh,
      source,
      sex,
      generated_at: new Date().toISOString(),
      latency_ms: Date.now() - start,
    };

    // ----- Persist alongside the related scan -----
    // The skin pipeline (addModelOutput) and bone-structure run in parallel
    // from the client. If the model_outputs row hasn't synced yet, the UPDATE
    // matches zero rows. We surface this via `persisted` so the client can
    // queue a retry through syncOutbox.
    let persisted = false;
    if (daily_id && ownership === 'owned') {
      try {
        const upd = await pool.query(
          `UPDATE model_outputs SET bone_structure = $1 WHERE daily_id = $2`,
          [JSON.stringify(payload), daily_id]
        );
        persisted = upd.rowCount > 0;
        if (!persisted) {
          log.warn('[bone-structure] model_outputs row not yet on server:', daily_id);
        }
      } catch (err) {
        log.warn('[bone-structure] persist failed:', err.message);
      }
    } else if (daily_id && ownership === 'pending') {
      log.warn('[bone-structure] daily_record not yet on server:', daily_id);
    }

    res.json({ ...payload, persisted });
  } catch (err) {
    log.error('[bone-structure] Error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// ==================== USER PROFILES ====================

// Lead -> customer promotion and server-owned account_created delivery. The
// account event is emitted only after Clerk email lookup and UV reconciliation
// are conclusive; unavailable dependencies leave durable pending state for the
// bounded retry worker.
async function findRailwayWaitlistLeadByEmail(email) {
  try {
    const { rows } = await pool.query(
      `SELECT id, source
         FROM waitlist
        WHERE lower(email) = $1
        LIMIT 1`,
      [email]
    );
    const row = rows[0];
    const id = typeof row?.id === 'string' ? row.id.trim().toLowerCase() : '';
    if (!id) return { status: 'unmatched' };
    return {
      status: 'matched',
      lead: {
        source_identity: `glowlytics:lead:railway:${id}`,
      },
    };
  } catch (err) {
    log.warn('[waitlist] Railway lookup failed:', err?.message || err);
    return { status: 'unavailable' };
  }
}

async function findLandingWaitlistLeadByEmail(email) {
  const lookupUrl = process.env.GLOWLYTICS_WAITLIST_LOOKUP_URL;
  const lookupToken = process.env.GLOWLYTICS_WAITLIST_LOOKUP_TOKEN;
  if (!lookupUrl || !lookupToken) {
    return { status: 'unavailable' };
  }

  try {
    const response = await fetch(lookupUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lookupToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`landing waitlist lookup failed with status ${response.status}`);
    }
    const payload = await response.json();
    if (payload?.matched === false) return { status: 'unmatched' };
    if (payload?.matched === true && payload.lead && typeof payload.lead === 'object') {
      return { status: 'matched', lead: payload.lead };
    }
    throw new Error('landing waitlist lookup returned an invalid response');
  } catch (err) {
    log.warn('[waitlist] landing lookup failed:', err?.message || err);
    return { status: 'unavailable' };
  }
}

async function findWaitlistLeadByEmail(email) {
  const railwayLead = await findRailwayWaitlistLeadByEmail(email);
  const landingLead = await findLandingWaitlistLeadByEmail(email);
  if (landingLead.status === 'matched') return landingLead;
  if (railwayLead.status === 'matched') return railwayLead;
  if (landingLead.status === 'unavailable' || railwayLead.status === 'unavailable') {
    return { status: 'unavailable' };
  }
  return { status: 'unmatched' };
}

async function convertUvLeadToCustomer(userId) {
  try {
    if (!process.env.CLERK_SECRET_KEY) {
      return { status: 'unavailable' };
    }
    const clerkApiBase = process.env.CLERK_API_BASE || 'https://api.clerk.com';
    const clerkRes = await fetch(`${clerkApiBase}/v1/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!clerkRes.ok) return { status: 'unavailable' };
    const data = await clerkRes.json();
    const primaryEmail = data.email_addresses?.find(
      (entry) => entry.id === data.primary_email_address_id
    );
    if (
      typeof primaryEmail?.email_address !== 'string' ||
      primaryEmail.verification?.status !== 'verified'
    ) {
      return { status: 'unavailable' };
    }
    const email = primaryEmail.email_address.toLowerCase().trim();
    const transitionedLead = await uvQueries.markCustomer(pool, { email, clerk_user_id: userId });
    const row = transitionedLead || await uvQueries.findCustomerLead(pool, userId);
    if (row) {
      if (transitionedLead) {
        try {
          await loops.sendEvent(email, 'became_customer', {
            contactProperties: { clerkUserId: userId },
          });
        } catch (loopsErr) {
          log.warn('[uv] became_customer marketing event failed:', loopsErr?.message || loopsErr);
        }
      }
      const waitlistLead = await findWaitlistLeadByEmail(email);
      if (waitlistLead.status === 'unavailable') {
        return waitlistLead;
      }
      if (waitlistLead.status === 'matched') {
        return {
          status: 'matched',
          lead: {
            ...row,
            ...waitlistLead.lead,
          },
        };
      }
      const sourceIdentity =
        typeof row.id === 'string' && row.id.trim()
          ? `glowlytics:lead:railway:${row.id.trim().toLowerCase()}`
          : null;
      return {
        status: 'matched',
        lead: {
          ...row,
          ...(sourceIdentity ? { source_identity: sourceIdentity } : {}),
        },
      };
    }
    return await findWaitlistLeadByEmail(email);
  } catch (err) {
    log.warn('[uv] lead->customer conversion failed:', err?.message || err);
    return { status: 'unavailable' };
  }
}

const RETRYABLE_ACCOUNT_STATUSES = ['reconciliation_pending', 'pending_delivery'];

async function loadAccountCreatedDelivery(userId, cutoverAt) {
  const { rows } = await pool.query(
    `SELECT user_id, created_at,
            created_at >= ($2::timestamptz AT TIME ZONE 'UTC') AS forward_owned,
            posthog_account_created_status AS status,
            posthog_account_created_uuid AS uuid,
            posthog_account_created_timestamp AS timestamp,
            posthog_account_created_properties AS properties,
            posthog_account_created_waitlist_match AS waitlist_match,
            posthog_account_created_delivery_claimed_at AS delivery_claimed_at
       FROM user_profiles
      WHERE user_id = $1`,
    [userId, cutoverAt]
  );
  return rows[0] || null;
}

async function markRuntimePreCutoverProfileHistorical(userId, cutoverAt) {
  await pool.query(
    `UPDATE user_profiles
        SET posthog_account_created_sent_at = COALESCE(posthog_account_created_sent_at, NOW()),
            posthog_account_created_status = 'historical_backfill_owned'
      WHERE user_id = $1
        AND created_at < ($2::timestamptz AT TIME ZONE 'UTC')
        AND posthog_account_created_status = 'reconciliation_pending'
        AND posthog_account_created_uuid IS NULL`,
    [userId, cutoverAt]
  );
}

async function reserveAccountCreatedDelivery(userId, attribution, matchStatus) {
  if (!['matched', 'unmatched'].includes(matchStatus)) {
    throw new Error('account_created delivery requires conclusive waitlist reconciliation');
  }
  const waitlistMatch = matchStatus === 'matched';
  const uuid = posthog.accountCreatedUuid(userId);
  const cutoverAt = process.env.GLOWLYTICS_CUTOVER_AT;
  if (!cutoverAt) throw new Error('GLOWLYTICS_CUTOVER_AT missing');
  const properties = {
    distinct_id: posthog.canonicalGlowlyticsUserId(userId),
    ...posthog.accountAttributionProperties(attribution, waitlistMatch),
  };
  if (waitlistMatch && !properties.waitlist_source_identity) {
    throw new Error('matched account_created delivery requires a validated waitlist source identity');
  }
  const { rows } = await pool.query(
    `UPDATE user_profiles
        SET posthog_account_created_uuid = $2::uuid,
            posthog_account_created_timestamp = created_at,
            posthog_account_created_properties = $4::jsonb,
            posthog_account_created_waitlist_match = $5::boolean,
            posthog_account_created_delivery_claimed_at = NULL,
            posthog_account_created_retry_after = NULL,
            posthog_account_created_status = 'pending_delivery'
      WHERE user_id = $1
        AND created_at >= ($3::timestamptz AT TIME ZONE 'UTC')
        AND posthog_account_created_status = 'reconciliation_pending'
        AND posthog_account_created_uuid IS NULL
      RETURNING posthog_account_created_uuid AS uuid,
                posthog_account_created_timestamp AS timestamp,
                posthog_account_created_properties AS properties,
                posthog_account_created_waitlist_match AS waitlist_match,
                posthog_account_created_status AS status`,
    [userId, uuid, cutoverAt, JSON.stringify(properties), waitlistMatch]
  );
  return rows[0] || null;
}

async function markAccountCreatedSent(userId, uuid) {
  await pool.query(
    `UPDATE user_profiles
        SET posthog_account_created_sent_at = NOW(),
            posthog_account_created_delivery_claimed_at = NULL,
            posthog_account_created_retry_after = NULL,
            posthog_account_created_status = 'delivered'
      WHERE user_id = $1
        AND posthog_account_created_uuid = $2::uuid
        AND posthog_account_created_status = 'pending_delivery'`,
    [userId, uuid]
  );
}

async function claimAccountCreatedDelivery(userId, uuid, leaseMs = 300_000) {
  const { rows } = await pool.query(
    `UPDATE user_profiles
        SET posthog_account_created_delivery_claimed_at = NOW()
      WHERE user_id = $1
        AND posthog_account_created_uuid = $2::uuid
        AND posthog_account_created_status = 'pending_delivery'
        AND (
          posthog_account_created_delivery_claimed_at IS NULL
          OR posthog_account_created_delivery_claimed_at < NOW() - ($3::int * INTERVAL '1 millisecond')
        )
      RETURNING posthog_account_created_uuid AS uuid,
                posthog_account_created_timestamp AS timestamp,
                posthog_account_created_properties AS properties,
                posthog_account_created_waitlist_match AS waitlist_match,
                posthog_account_created_status AS status,
                posthog_account_created_delivery_claimed_at AS delivery_claimed_at`,
    [userId, uuid, leaseMs]
  );
  return rows[0] || null;
}

async function releaseAccountCreatedDeliveryClaim(userId, uuid) {
  await pool.query(
    `UPDATE user_profiles
        SET posthog_account_created_delivery_claimed_at = NULL,
            posthog_account_created_retry_after = NULL
      WHERE user_id = $1
        AND posthog_account_created_uuid = $2::uuid
        AND posthog_account_created_status = 'pending_delivery'`,
    [userId, uuid]
  );
}

async function deferUnavailableAccountReconciliation(userId) {
  await pool.query(
    `UPDATE user_profiles
        SET posthog_account_created_retry_after = NOW() + INTERVAL '60 seconds'
      WHERE user_id = $1
        AND posthog_account_created_status = 'reconciliation_pending'
        AND posthog_account_created_uuid IS NULL`,
    [userId]
  );
}

async function sendReservedAccountCreated(userId, delivery) {
  const claimed = await claimAccountCreatedDelivery(userId, delivery.uuid);
  if (!claimed) return false;
  const timestamp = new Date(claimed.timestamp).toISOString();
  try {
    await posthog.captureAccountCreated({
      userId,
      uuid: claimed.uuid,
      timestamp,
      properties: claimed.properties,
    });
  } catch (err) {
    await releaseAccountCreatedDeliveryClaim(userId, claimed.uuid).catch((releaseErr) => {
      log.warn('[posthog] account_created claim release failed:', releaseErr?.message || releaseErr);
    });
    throw err;
  }
  await markAccountCreatedSent(userId, claimed.uuid);
  return true;
}

async function reconcileAndDeliverAccountCreated(userId) {
  const cutoverMs = Date.parse(process.env.GLOWLYTICS_CUTOVER_AT || '');
  if (!Number.isFinite(cutoverMs)) throw new Error('GLOWLYTICS_CUTOVER_AT missing or invalid');
  const cutoverAt = new Date(cutoverMs).toISOString();
  const current = await loadAccountCreatedDelivery(userId, cutoverAt);
  if (!current || !RETRYABLE_ACCOUNT_STATUSES.includes(current.status)) return;
  if (!current.forward_owned) {
    await markRuntimePreCutoverProfileHistorical(userId, cutoverAt);
    return;
  }
  if (current.status === 'pending_delivery') {
    await sendReservedAccountCreated(userId, current);
    return;
  }
  const reconciliation = await convertUvLeadToCustomer(userId);
  if (reconciliation.status === 'unavailable') {
    await deferUnavailableAccountReconciliation(userId);
    return;
  }
  const delivery = await reserveAccountCreatedDelivery(
    userId,
    reconciliation.status === 'matched' ? reconciliation.lead : undefined,
    reconciliation.status
  );
  if (delivery) await sendReservedAccountCreated(userId, delivery);
}

async function retryPendingAccountCreatedDeliveries({ limit = 100 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('invalid retry limit');
  const { rows } = await pool.query(
    `SELECT user_id
       FROM user_profiles
      WHERE posthog_account_created_status IN ('reconciliation_pending', 'pending_delivery')
        AND (posthog_account_created_retry_after IS NULL OR posthog_account_created_retry_after <= NOW())
      ORDER BY CASE WHEN posthog_account_created_status = 'pending_delivery' THEN 0 ELSE 1 END,
               COALESCE(posthog_account_created_retry_after, created_at),
               created_at,
               user_id
      LIMIT $1`,
    [limit]
  );
  for (const { user_id: userId } of rows) {
    try {
      await reconcileAndDeliverAccountCreated(userId);
    } catch (err) {
      log.warn('[posthog] pending account_created retry failed:', err?.message || err);
    }
  }
}

app._retryPendingAccountCreatedDeliveries = retryPendingAccountCreatedDeliveries;

app.post('/api/users', async (req, res) => {
  try {
    // Issue #14: Validate input before touching the database
    const validationError = validateUserInput(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Issue #4: Use Clerk user_id (from auth token) as the primary key
    const userId = (req.auth && req.auth.userId) || null;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required to create user profile' });
    }

    const {
      age_range, location_coarse, period_applicable,
      period_last_start_date, cycle_length_days,
      smoker_status, drink_baseline_frequency,
    } = req.body;

    const cutoverMs = Date.parse(process.env.GLOWLYTICS_CUTOVER_AT || '');
    if (!Number.isFinite(cutoverMs)) {
      return res.status(500).json({ error: 'cutover_not_configured' });
    }

    const result = await pool.query(
      `INSERT INTO user_profiles
       (user_id, age_range, location_coarse, period_applicable, period_last_start_date,
        cycle_length_days, smoker_status, drink_baseline_frequency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, age_range, location_coarse, period_applicable || 'prefer_not',
       period_last_start_date, cycle_length_days || 28,
       smoker_status, drink_baseline_frequency]
    );
    await reconcileAndDeliverAccountCreated(userId)
      .catch((err) => log.warn('[posthog] account_created attempt failed:', err?.message || err));
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // Issue #4: Handle duplicate user_id (idempotent creation)
    if (err.code === '23505') {
      const duplicateUserId = (req.auth && req.auth.userId) || null;
      if (duplicateUserId) {
        await reconcileAndDeliverAccountCreated(duplicateUserId)
          .catch((retryErr) => log.warn('[posthog] duplicate account_created retry failed:', retryErr?.message || retryErr));
      }
      return res.status(409).json({ error: 'User profile already exists' });
    }
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// Issue #2: Account deletion (Apple App Store Guideline 5.1.1(v))
//
// Two-phase delete: app-data cascade in a transaction first, then a best-effort
// Clerk user delete. The Clerk delete is intentionally outside the DB transaction —
// if it fails (network blip, key rotation), the user's app data is still gone and
// we surface a 200 with a flag so the client can sign out cleanly. Apple 5.1.1(v)
// requires both auth identity and app data to be removable; the client also calls
// signOut() so the session is invalidated even if the Clerk DELETE retries later.
app.delete('/api/users/:id', async (req, res) => {
  if (!authorizeUser(req, res, req.params.id)) return;
  const userId = req.params.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Cascading delete inside transaction for atomicity
    await client.query(
      `DELETE FROM model_outputs WHERE daily_id IN
       (SELECT daily_id FROM daily_records WHERE user_id = $1)`,
      [userId]
    );
    await client.query('DELETE FROM daily_records WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM product_catalog WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM scan_protocols WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM report_artifacts WHERE user_id = $1', [userId]);
    // Apple 5.1.1(v) PII gap: UV Mirror lead-capture rows (email ↔ this Clerk
    // user) live outside the app tables above. Delete the user's leads and any
    // scans only those leads referenced (uv_scans has no user column of its
    // own — its sole user linkage is uv_leads.scan_id).
    const uvLeads = await client.query(
      'DELETE FROM uv_leads WHERE clerk_user_id = $1 RETURNING scan_id',
      [userId]
    );
    const uvScanIds = (uvLeads.rows || []).map((r) => r.scan_id).filter(Boolean);
    if (uvScanIds.length > 0) {
      // NOT EXISTS guards the FK: never drop a scan another (surviving) lead
      // still references.
      await client.query(
        `DELETE FROM uv_scans WHERE id = ANY($1::text[])
           AND NOT EXISTS (SELECT 1 FROM uv_leads l WHERE l.scan_id = uv_scans.id)`,
        [uvScanIds]
      );
    }
    const result = await client.query(
      'DELETE FROM user_profiles WHERE user_id = $1 RETURNING user_id',
      [userId]
    );
    await client.query('COMMIT');

    // rowCount === 0 means no app-data row existed (e.g. the profile never synced
    // server-side, P0 #7). We MUST still delete the Clerk auth identity below —
    // Apple 5.1.1(v) requires the account be removable even with no server data,
    // and the authenticated caller IS this user. The old 404-abort here left such
    // users permanently unable to delete their account (#41).
    const dataDeleted = result.rowCount > 0;

    // Phase 2: delete the Clerk user record so auth identity is gone too.
    // Best-effort — log and continue on failure rather than leaving partial state.
    let clerkDeleted = false;
    if (process.env.CLERK_SECRET_KEY) {
      try {
        const clerkApiBase = process.env.CLERK_API_BASE || 'https://api.clerk.com';
        const url = `${clerkApiBase}/v1/users/${encodeURIComponent(userId)}`;
        const clerkRes = await fetch(url, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
          signal: AbortSignal.timeout(5000),
        });
        // 200 = deleted, 404 = already gone (treat as success)
        clerkDeleted = clerkRes.ok || clerkRes.status === 404;
        if (!clerkDeleted) {
          log.warn('[delete-user]', `Clerk delete returned ${clerkRes.status} for ${userId}`);
        }
      } catch (e) {
        log.warn('[delete-user]', 'Clerk delete request failed:', e?.message || e);
      }
    }

    res.json({
      success: true,
      message: 'Account and all associated data deleted',
      clerk_deleted: clerkDeleted,
      data_deleted: dataDeleted,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: safeErrorMessage(err) });
  } finally {
    client.release();
  }
});

app.get('/api/users/:id', async (req, res) => {
  if (!authorizeUser(req, res, req.params.id)) return;
  try {
    const result = await pool.query(
      'SELECT * FROM user_profiles WHERE user_id = $1', [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

app.patch('/api/users/:id', async (req, res) => {
  if (!authorizeUser(req, res, req.params.id)) return;
  try {
    // Filter request body to only whitelisted fields to prevent SQL injection
    const safeFields = {};
    for (const key of Object.keys(req.body)) {
      if (ALLOWED_USER_FIELDS.includes(key)) {
        safeFields[key] = req.body[key];
      }
    }

    const fields = Object.keys(safeFields);
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Validate field names contain only safe identifier characters
    const SAFE_FIELD_RE = /^[a-z_]+$/;
    for (const f of fields) {
      if (!SAFE_FIELD_RE.test(f)) {
        return res.status(400).json({ error: 'Invalid field name' });
      }
    }

    const values = Object.values(safeFields);
    const setClause = fields.map((f, i) => `"${f}" = $${i + 2}`).join(', ');

    const result = await pool.query(
      `UPDATE user_profiles SET ${setClause}, updated_at = NOW()
       WHERE user_id = $1 RETURNING *`,
      [req.params.id, ...values]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// ==================== SCAN PROTOCOLS ====================

app.post('/api/protocols', async (req, res) => {
  try {
    // SECURITY: Use authenticated user ID, never trust body.user_id
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const { primary_goal, scan_region, baseline_date } = req.body;
    const result = await pool.query(
      `INSERT INTO scan_protocols (user_id, primary_goal, scan_region, baseline_date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, primary_goal, scan_region, baseline_date || new Date().toISOString().split('T')[0]]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

app.get('/api/protocols/:userId', async (req, res) => {
  if (!authorizeUser(req, res, req.params.userId)) return;
  try {
    const result = await pool.query(
      'SELECT * FROM scan_protocols WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.params.userId]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// ==================== PRODUCTS ====================

app.post('/api/products', async (req, res) => {
  try {
    // SECURITY: Use authenticated user ID, never trust body.user_id
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const {
      product_name, brand, product_capture_method,
      ingredients_list, usage_schedule, start_date, notes, image_url,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO product_catalog
       (user_id, product_name, brand, product_capture_method, ingredients_list,
        usage_schedule, start_date, notes, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [userId, product_name, brand || null, product_capture_method,
       ingredients_list, usage_schedule,
       start_date || new Date().toISOString().split('T')[0], notes, image_url || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

app.get('/api/products/:userId', async (req, res) => {
  if (!authorizeUser(req, res, req.params.userId)) return;
  try {
    const result = await pool.query(
      'SELECT * FROM product_catalog WHERE user_id = $1 AND end_date IS NULL ORDER BY start_date',
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    // SECURITY: Only allow deleting products owned by the authenticated user
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const result = await pool.query(
      'UPDATE product_catalog SET end_date = CURRENT_DATE WHERE user_product_id = $1 AND user_id = $2',
      [req.params.id, userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// ==================== DAILY RECORDS ====================

app.post('/api/daily-records', async (req, res) => {
  try {
    // SECURITY: Use authenticated user ID, never trust body.user_id
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const {
      date, scanner_reading_id, scanner_indices,
      scanner_quality_flag, scan_region, photo_uri,
      photo_quality_flag, sunscreen_used, new_product_added,
      period_status_confirmed, cycle_day_estimated,
      sleep_quality, stress_level, drinks_yesterday,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO daily_records
       (user_id, date, scanner_reading_id, scanner_indices,
        scanner_quality_flag, scan_region, photo_uri,
        photo_quality_flag, sunscreen_used, new_product_added,
        period_status_confirmed, cycle_day_estimated,
        sleep_quality, stress_level, drinks_yesterday)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (user_id, date) DO UPDATE SET
        scanner_indices = EXCLUDED.scanner_indices,
        scanner_quality_flag = EXCLUDED.scanner_quality_flag,
        sunscreen_used = EXCLUDED.sunscreen_used,
        new_product_added = EXCLUDED.new_product_added,
        period_status_confirmed = EXCLUDED.period_status_confirmed,
        sleep_quality = EXCLUDED.sleep_quality,
        stress_level = EXCLUDED.stress_level,
        drinks_yesterday = EXCLUDED.drinks_yesterday
       RETURNING *`,
      [userId, date || new Date().toISOString().split('T')[0],
       scanner_reading_id, JSON.stringify(scanner_indices),
       scanner_quality_flag || 'pass', scan_region,
       photo_uri, photo_quality_flag,
       sunscreen_used, new_product_added || false,
       period_status_confirmed, cycle_day_estimated,
       sleep_quality, stress_level, drinks_yesterday]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

app.get('/api/daily-records/:userId', async (req, res) => {
  if (!authorizeUser(req, res, req.params.userId)) return;
  try {
    const days = parseInt(req.query.days) || 30;
    const result = await pool.query(
      `SELECT * FROM daily_records
       WHERE user_id = $1 AND date >= CURRENT_DATE - $2::integer
       ORDER BY date`,
      [req.params.userId, days]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// ==================== MODEL OUTPUTS ====================

app.post('/api/model-outputs', async (req, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const {
      daily_id, acne_score, sun_damage_score, skin_age_score,
      confidence, primary_driver, recommended_action, escalation_flag,
      signal_scores, signal_features, lesions, signal_confidence,
      conditions, rag_recommendations, personalized_feedback,
      zone_severity, generated_insights,
    } = req.body;

    // SECURITY: verify the authenticated user owns this daily record
    const ownership = await pool.query(
      'SELECT 1 FROM daily_records WHERE daily_id = $1 AND user_id = $2',
      [daily_id, userId]
    );
    if (ownership.rowCount === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `INSERT INTO model_outputs
       (daily_id, acne_score, sun_damage_score, skin_age_score,
        confidence, primary_driver, recommended_action, escalation_flag,
        signal_scores, signal_features, lesions, signal_confidence,
        conditions, rag_recommendations, personalized_feedback,
        zone_severity, generated_insights)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
      [daily_id, acne_score, sun_damage_score, skin_age_score,
       confidence, primary_driver, recommended_action, escalation_flag || false,
       signal_scores ? JSON.stringify(signal_scores) : null,
       signal_features ? JSON.stringify(signal_features) : null,
       lesions ? JSON.stringify(lesions) : null,
       signal_confidence ? JSON.stringify(signal_confidence) : null,
       conditions ? JSON.stringify(conditions) : null,
       rag_recommendations ? JSON.stringify(rag_recommendations) : null,
       personalized_feedback || null,
       zone_severity ? JSON.stringify(zone_severity) : null,
       generated_insights ? JSON.stringify(generated_insights) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

app.get('/api/model-outputs/:userId', async (req, res) => {
  if (!authorizeUser(req, res, req.params.userId)) return;
  try {
    const days = parseInt(req.query.days) || 30;
    const rows = await scanQueries.getScanHistory(req.params.userId, { days, limit: 90 });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// ==================== REPORTS ====================

app.post('/api/reports', async (req, res) => {
  try {
    // SECURITY: Use authenticated user ID, never trust body.user_id
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const { date_range, included_fields } = req.body;
    const result = await pool.query(
      `INSERT INTO report_artifacts (user_id, date_range, included_fields, report_uri)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, date_range, included_fields || [],
       `report_${Date.now()}.pdf`]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

app.get('/api/reports/:userId', async (req, res) => {
  if (!authorizeUser(req, res, req.params.userId)) return;
  try {
    const result = await pool.query(
      'SELECT * FROM report_artifacts WHERE user_id = $1 ORDER BY created_at DESC',
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// ==================== RAG PIPELINE ====================

// Query relevant guideline excerpts
// Embeds via OpenAI + queries Pinecone on every call — rate-limited like the
// other LLM-backed endpoints so a client loop can't drive unbounded spend.
app.post('/api/rag/query', analyzeRateLimit, async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return res.status(400).json({ error: 'Query must be a string with at least 3 characters' });
    }

    if (!process.env.PINECONE_API_KEY) {
      return res.status(500).json({ error: 'PINECONE_API_KEY not configured' });
    }

    const topK = Math.min(parseInt(req.body.topK) || 3, 10);
    const results = await queryGuidelines(query.trim(), topK);

    res.json({
      query: query.trim(),
      results,
    });
  } catch (err) {
    log.error('RAG query error:', err.message);
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// ==================== MCP CLIENT MANAGEMENT (Clerk-session-authed) ====================
const _clerkClients = require('./mcp/clerk-clients');

app.get('/api/mcp/clients', async (req, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const grants = await _clerkClients.listGrantsForUser(userId);
    res.json(grants);
  } catch (err) {
    log.error('[mcp/clients GET]', err.message);
    res.status(500).json({ error: 'failed_to_list_clients' });
  }
});

app.delete('/api/mcp/clients/:clientId', async (req, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const { clientId } = req.params;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    const out = await _clerkClients.revokeGrant(userId, clientId);
    res.json(out);
  } catch (err) {
    log.error('[mcp/clients DELETE]', err.message);
    res.status(500).json({ error: 'failed_to_revoke_client' });
  }
});

// ==================== TERMINAL ERROR HANDLER ====================
// Registered last. Always returns a generic message and never leaks error
// internals or stack traces to clients, regardless of NODE_ENV (BC-008).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  log.error('[error-handler]', err && err.message);
  if (res.headersSent) {
    return next(err);
  }
  const status = Number.isInteger(err && err.status)
    ? err.status
    : (Number.isInteger(err && err.statusCode) ? err.statusCode : 500);
  res.status(status).json({ error: 'Internal server error' });
});

// Reset rate limiters — exposed for test cleanup
app._resetRateLimiters = () => {
  detectRateMap.clear();
  analyzeRateMap.clear();
  photoRateMap.clear();
};

// Exposed for unit tests (B3 fail-closed regression). Not part of the HTTP API.
app._authorizeUser = authorizeUser;

module.exports = app;
