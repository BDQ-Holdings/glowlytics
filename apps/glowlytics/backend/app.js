require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { randomUUID: uuidv4, timingSafeEqual } = require('crypto');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const OpenAI = require('openai');
const { seedGuidelines, queryGuidelines, queryGuidelinesMulti } = require('./rag');
const imageProcessing = require('./image-processing');
const signalModels = require('./signal-models');
const { searchCuratedProducts, lookupCuratedBarcode, enrichIngredients } = require('./curated-products');
const scanQueries = require('./queries/scans');

const app = express();

// Production-safe logger — masks potentially sensitive error details
const isProd = process.env.NODE_ENV === 'production';
const log = {
  info: (...args) => console.log(...args),
  warn: (...args) => isProd ? console.warn(args[0]) : console.warn(...args),
  error: (...args) => isProd ? console.error(args[0]) : console.error(...args),
};

// CORS — restrict origins in production
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : undefined; // undefined = allow all (dev)
app.use(cors(ALLOWED_ORIGINS ? { origin: ALLOWED_ORIGINS } : undefined));
app.use(express.json({ limit: '20mb' }));

// Sanitize API key — Railway env vars sometimes include trailing newlines
const openaiKey = (process.env.OPENAI_API_KEY || '').replace(/\s+/g, '');
const openai = new OpenAI({ apiKey: openaiKey });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/glowlytics',
  ...(process.env.DATABASE_URL ? { ssl: { rejectUnauthorized: false } } : {}),
});

if (!process.env.DATABASE_URL) {
  console.warn('[DB] DATABASE_URL not set — falling back to localhost:5432. Set DATABASE_URL to your Railway PostgreSQL URL.');
}

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'glowlytics-api', timestamp: new Date().toISOString() });
});

// ==================== WAITLIST (public, no auth) ====================

app.post('/api/waitlist', async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  try {
    await pool.query(
      'INSERT INTO waitlist (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
      [email.toLowerCase().trim(), req.body.source || 'landing']
    );
    res.json({ ok: true });
  } catch (err) {
    log.error('Waitlist insert error:', err.message);
    res.status(500).json({ error: 'Failed to save' });
  }
});

app.get('/api/waitlist/count', async (req, res) => {
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
 * - Production: rejects requests without a valid token (401).
 * - Development (NODE_ENV=development): allows unauthenticated requests
 *   through with req.auth = null so the backend works without Clerk.
 * - If CLERK_ISSUER_URL is not set, tokens are accepted but not verified
 *   (dev-mode passthrough).
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (process.env.NODE_ENV === 'development') {
      // Dev mode passthrough — synthetic user so routes that need userId still work
      req.auth = { userId: 'dev-user' };
      return next();
    }
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  if (!client) {
    if (process.env.NODE_ENV !== 'development') {
      // Deny access when JWKS is not configured and we're not explicitly in dev mode
      return res.status(503).json({ error: 'Auth service not configured' });
    }
    // No JWKS configured -- dev mode passthrough with a synthetic user
    req.auth = { userId: 'dev-user' };
    return next();
  }

  jwt.verify(token, getKey, { issuer: CLERK_ISSUER_URL }, (err, decoded) => {
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
const VALID_AGE_RANGES = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
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
  'trial_start_date',
  'trial_end_date',
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
setInterval(() => {
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

// Barcode product lookup (public, rate-limited)
app.get('/api/products/lookup/:barcode', detectRateLimit, async (req, res) => {
  const barcode = req.params.barcode;

  // Validate barcode format (numeric, 6-14 digits)
  if (!/^[0-9]{6,14}$/.test(barcode)) {
    return res.status(400).json({ error: 'Invalid barcode format' });
  }

  // Check curated DB first (instant, local)
  const curated = lookupCuratedBarcode(barcode);
  if (curated) {
    return res.json({
      name: curated.name,
      brands: curated.brand,
      ingredients: curated.ingredients.join(', '),
      image_url: null,
      source: 'curated',
    });
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

  if (bestResult) {
    // Enrich missing ingredients from curated DB
    const existingIngredients = bestResult.ingredients
      ? bestResult.ingredients.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const enriched = enrichIngredients(bestResult.name, existingIngredients);
    if (enriched.length > existingIngredients.length) {
      bestResult.ingredients = enriched.join(', ');
    }
    return res.json(bestResult);
  }

  res.status(404).json({ error: 'Product not found in any database' });
});

// Product text search — multi-source (public, rate-limited)
app.get('/api/products/search', detectRateLimit, async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string' || query.length < 2) {
    return res.status(400).json({ error: 'Query parameter "q" must be at least 2 characters' });
  }

  try {
    // 1. Curated DB (instant)
    const curatedResults = searchCuratedProducts(query).map(p => ({
      name: p.name,
      brands: p.brand,
      ingredients: p.ingredients.join(', '),
      image_url: null,
      source: 'curated',
    }));

    // 2. Open Beauty Facts + Open Food Facts in parallel
    const [obfResults, offResults] = await Promise.all([
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
    ]);

    // 3. Merge: curated first, then external, deduplicated by normalized name
    const seen = new Set();
    const merged = [];
    for (const result of [...curatedResults, ...obfResults, ...offResults]) {
      const key = result.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(result);
      if (merged.length >= 15) break;
    }

    res.json(merged);
  } catch {
    // Fallback to curated-only on total failure
    const fallback = searchCuratedProducts(query).slice(0, 15).map(p => ({
      name: p.name,
      brands: p.brand,
      ingredients: p.ingredients.join(', '),
      image_url: null,
      source: 'curated',
    }));
    res.json(fallback);
  }
});

// Photo-based product identification (public, rate-limited)
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
    });

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
      return res.json({ identified: false, error: 'Could not parse response' });
    }
    if (!parsed.identified) {
      log.warn('[identify-photo] GPT could not identify product');
      return res.json({ identified: false, error: 'Could not identify product' });
    }

    // Enrich/verify ingredients from curated DB
    const curatedMatch = searchCuratedProducts(parsed.name);
    if (curatedMatch.length > 0 && curatedMatch[0].ingredients.length > (parsed.ingredients || []).length) {
      parsed.ingredients = curatedMatch[0].ingredients;
      parsed.brand = parsed.brand || curatedMatch[0].brand;
    }

    res.json({
      identified: true,
      name: parsed.name || '',
      brand: parsed.brand || '',
      ingredients: parsed.ingredients || [],
      confidence: parsed.confidence || 'med',
      source: 'gpt4o_vision',
    });
  } catch (err) {
    log.warn('[identify-photo] Error:', err.message);
    res.json({ identified: false, error: 'Product identification failed' });
  }
});

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
  require('./mcp/well-known').mountWellKnown(app);
  require('./mcp/transport').mountMcp(app);
}

// ==================== PROTECTED ROUTES (auth required) ====================

app.use(authMiddleware);

/**
 * Authorization helper — verifies the authenticated user matches the requested resource owner.
 * In development mode (req.auth === null), access is allowed for dev convenience.
 */
function authorizeUser(req, res, userId) {
  if (req.auth && req.auth.userId !== userId) {
    res.status(403).json({ error: 'Access denied' });
    return false;
  }
  return true;
}

// ==================== VISION API PROXY ====================

app.post('/api/vision/analyze', analyzeRateLimit, async (req, res) => {
  try {
    const { image_base64, context } = req.body;

    if (!image_base64 || typeof image_base64 !== 'string') {
      return res.status(400).json({ error: 'image_base64 is required' });
    }
    if (image_base64.length > 15 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large (max 15MB)' });
    }
    if (!context) {
      return res.status(400).json({ error: 'context object is required' });
    }

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
    // Layer 3: Fine-tuned GPT-4o (~3-5s)
    // All 3 layers run in PARALLEL → results merged → single response

    const [layer1Result, layer3Result] = await Promise.all([
      // Layer 1 + Layer 2: deterministic features → CV model scoring
      imageProcessing.extractFeatures(image_base64).then(async (features) => {
        const layer1Scores = imageProcessing.featuresToSignalScores(features);
        const layer2Results = await signalModels.runAllModels(image_base64, features);
        const summaryFeatures = imageProcessing.extractSummaryFeatures(features);
        return { features, layer1Scores, layer2Results, summaryFeatures };
      }).catch((err) => {
        log.warn('[vision] Layer 1/2 failed, continuing with Layer 3 only:', err.message);
        return null;
      }),

      // Layer 3: GPT-4o (30s timeout to prevent hung connections)
      Promise.race([
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
      ]),
    ]);

    // ==================== PARSE LAYER 3 (GPT-4o) RESPONSE ====================
    const content = layer3Result.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'Empty response from Vision model' });
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(502).json({ error: 'Could not parse JSON from Vision model response', raw: content });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      return res.status(502).json({ error: 'Vision model returned malformed JSON' });
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
      // Full 3-layer uncertainty-weighted merge
      signalScores = signalModels.mergeSignalScores(
        layer1Result.layer1Scores,
        layer1Result.layer2Results,
        layer3SignalScores,
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
function buildInsightPrompt({ signal_scores, lesions, conditions, zone_severity, user_profile, user_goal, products, rag_context, scan_count }) {
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

  const system = `You are Glowlytics AI, a personalized skin health advisor. Generate detailed, personalized insights based on the user's scan results and clinical guidelines.

IMPORTANT: Every insight MUST be personalized to THIS user's specific scores, detected conditions, and context. Never use generic advice. Ground recommendations in the clinical guidelines provided. When making a recommendation, cite the guideline number in brackets (e.g., "Based on [2]: ..."). Prefer Grade A evidence over B or C when available.

User context:
- Primary goal: ${user_goal || 'general tracking'}
- Age range: ${user_profile?.age_range || 'unknown'}
- Scan count: ${scan_count || 0}
- Menstrual cycle day: ${user_profile?.cycle_day || 'not tracked'}
- Products in routine:
${productText}

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

app.post('/api/vision/generate-insights', async (req, res) => {
  try {
    const {
      signal_scores, signal_features, signal_confidence,
      lesions, conditions, zone_severity,
      user_profile, user_goal, products, scan_count,
      rag_context,
    } = req.body;

    if (!signal_scores) {
      return res.status(400).json({ error: 'signal_scores is required' });
    }

    const modelId = process.env.VISION_MODEL_ID || 'gpt-4o';

    // SSE streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const insightPrompt = buildInsightPrompt({
      signal_scores, lesions, conditions, zone_severity,
      user_profile, user_goal, products, rag_context, scan_count,
    });

    const stream = await openai.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: insightPrompt.system },
        { role: 'user', content: insightPrompt.user },
      ],
      max_tokens: 1500,
      temperature: 0.3,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    log.error('[generate-insights] Error:', err.message);
    // If headers already sent (streaming started), just end
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.status(500).json({ error: safeErrorMessage(err) });
    }
  }
});

// ==================== USER PROFILES ====================

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
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // Issue #4: Handle duplicate user_id (idempotent creation)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'User profile already exists' });
    }
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

// Issue #2: Account deletion (Apple App Store Guideline 5.1.1(v))
app.delete('/api/users/:id', async (req, res) => {
  if (!authorizeUser(req, res, req.params.id)) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Cascading delete inside transaction for atomicity
    await client.query(
      `DELETE FROM model_outputs WHERE daily_id IN
       (SELECT daily_id FROM daily_records WHERE user_id = $1)`,
      [req.params.id]
    );
    await client.query('DELETE FROM daily_records WHERE user_id = $1', [req.params.id]);
    await client.query('DELETE FROM product_catalog WHERE user_id = $1', [req.params.id]);
    await client.query('DELETE FROM scan_protocols WHERE user_id = $1', [req.params.id]);
    await client.query('DELETE FROM report_artifacts WHERE user_id = $1', [req.params.id]);
    const result = await client.query(
      'DELETE FROM user_profiles WHERE user_id = $1 RETURNING user_id',
      [req.params.id]
    );
    await client.query('COMMIT');

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: 'Account and all associated data deleted' });
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
      ingredients_list, usage_schedule, start_date, notes,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO product_catalog
       (user_id, product_name, brand, product_capture_method, ingredients_list,
        usage_schedule, start_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, product_name, brand || null, product_capture_method,
       ingredients_list, usage_schedule,
       start_date || new Date().toISOString().split('T')[0], notes]
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
app.post('/api/rag/query', async (req, res) => {
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

// Reset rate limiters — exposed for test cleanup
app._resetRateLimiters = () => {
  detectRateMap.clear();
  analyzeRateMap.clear();
  photoRateMap.clear();
};

module.exports = app;
