# Glowlytics — "UV Mirror" marketing scan tool

Driver-side acquisition tool: a public web scanner that assesses UV/sun damage +
left/right facial asymmetry from a single photo, then converts the visitor via an
email-for-PDF-report CTA into a Loops nurture sequence, and finally into a
"customer" sequence once they create a Clerk account in the app.

## Architecture decision (load-bearing)

- **All backend logic lives in the Express backend** `apps/glowlytics/backend`.
  Cloudflare Pages Functions (the landing `functions/api/*`) run on V8 isolates and
  **cannot** run `sharp` / ONNX — so every pixel-level vision function must be Express.
- **Frontend is a lo-fi Next.js prototype** in `apps/landing/app/uv-scan/` that calls
  the public Express endpoints. Minimal Dusk-palette styling; final design comes later.
- Public endpoints register **before `app.use(authMiddleware)` (app.js line 608)** so
  they stay unauthenticated, exactly like `/api/vision/detect-lesions` (line 302).
- Reuse ITA primitives `srgbToLab` / `computeITA` (exported from `image-processing.js`).
- Loops sequences are wired in the Loops dashboard, keyed on event names we fire
  (`uv_report_requested`, `became_customer`). We never build email sequences in code.

## HTTP contract (frozen — frontend + backend agree on this)

### POST /api/uv/screen   (public, detectRateLimit)
Cheap pre-scan quality gate for live feedback.
Body: `{ image_base64: string, landmarks?: Landmarks }`
200: `{ ok: boolean, canProceed: boolean, confidence: number,
        checks: Array<{ id, label, pass, value, message }> }`
checks ids: `brightness`, `lighting_symmetry`, `highlight_clipping`,
            `face_coverage`, `face_angle` (face_angle.pass=null/skipped when no landmarks)
400: `{ error }` on missing/oversized/undecodable image.

### POST /api/uv/analyze  (public, analyzeRateLimit)
Runs screener internally; hard-fails garbage with 422.
Body: `{ image_base64: string, landmarks?: Landmarks, source?: string }`
200: `{ scan_id, created_at, overall, heatmap, regions, asymmetry, screener }`
422: `{ error, checks }` when image unusable (too dark/bright/clipped).
- `overall`: `{ sunDamageScore: 0-100, severity: 'low'|'moderate'|'high', confidence: 0..1 }`
   (sunDamageScore: higher = MORE damage, matching marketing framing — note this is the
    inverse of the app's internal sunDamage signal where higher=better; keep them separate.)
- `heatmap`: `{ cols, rows, bounds:{x,y,w,h}, cells:number[] }`
   row-major, len = cols*rows, each 0..1 damage intensity rounded to 3 decimals.
   `bounds` = normalized face bbox in [0,1] of original image; cell (c,r) maps to a
   normalized sub-rect of bounds → pixel-accurate overlay at ANY display size.
- `regions`: `Array<{ id, label, side:'left'|'right'|'center', score:0-100,
   intensity:0..1, spotCount, polygon:[[x,y],...] normalized }>`
   ids: forehead, periorbital_left, periorbital_right, cheek_left, cheek_right, nose, perioral_chin
- `asymmetry`: `{ score:0-100, dominantSide:'left'|'right'|'balanced',
   leftMean:0..1, rightMean:0..1, perRegionDelta:[{pair,delta}] }`
- `screener`: same shape as /screen response.
- "left"/"right" are the SUBJECT's anatomical sides (mirror of image x).

### POST /api/uv/lead     (public, detectRateLimit)
Body: `{ email, scan_id, source?, consent?:boolean }`
200: `{ ok: true, report_token }`  (idempotent on email)
400: `{ error }` invalid email / unknown scan_id.
Side effects: upsert `uv_leads`, mark `uv_scans.claimed=true`, fire Loops
`events/send` eventName=`uv_report_requested` with contactProperties carrying
{ source, uvSunDamageScore, uvSeverity, uvAsymmetryScore, reportToken }.

### GET /api/uv/report/:token   (public)
200: `application/pdf` (pdfkit) — branded report: overall score+severity gauge,
region table, asymmetry summary, heatmap rendered as colored grid (pdfkit rects),
methodology + disclaimer, app-download CTA.
404: unknown token.

### Lead → customer (hook inside POST /api/users, app.js ~1451, authed)
After user profile insert (or 23505 idempotent), resolve the Clerk user's email
(Clerk API GET /v1/users/:id using CLERK_SECRET_KEY; body.email fallback in dev).
If a `uv_leads` row matches email and status!='customer': set status='customer',
clerk_user_id, converted_at; fire Loops event `became_customer`. Best-effort,
never blocks user creation. Skip silently when CLERK_SECRET_KEY/LOOPS unset.

## Modules (file ownership — avoid parallel collisions)

- `uv-scan.js`              — screenImage(), analyzeUv(); pure, sharp-based, deterministic.
- `loops.js`               — loopsEnabled(), sendEvent(), updateContact(); LOOPS_API_KEY
                             gated, no-op `{skipped:true}` fallback. LOOPS_API_BASE override.
- `queries/uv.js`          — insertScan, getScan, claimScan, upsertLead, getLeadByEmail,
                             getLeadByToken, markCustomer.
- `db-init.js`             — add migrationV5 (uv_scans, uv_leads tables + indexes).
- `uv-report.js`           — buildReportPdf(scan, lead) -> Buffer (pdfkit).
- `app.js`                 — register 4 public routes + /api/users hook (SINGLE owner).
- `apps/landing/app/uv-scan/page.tsx` (+ css) — lo-fi prototype.

## Vision method (robust + precise, deterministic, TDD-friendly)

Pre-scan screener (`screenImage`, no model needed, operates on raw pixels):
- brightness: mean luma in [40,225] band else fail (too dark/bright).
- highlight_clipping: %pixels luma>250 or <5 above ~12% fails.
- lighting_symmetry: |meanLuma(left half) - meanLuma(right half)| / overallMean > 0.18 fails.
- face_coverage: skin-tone pixel mass fraction in [0.12,0.92]; too low = no face / too far.
- face_angle: when landmarks present, yaw proxy = horizontal balance of eye–nose; |yaw|>~18° fails.
  No landmarks → check skipped (pass:null), confidence reduced.

UV analysis (`analyzeUv`):
- Decode via sharp to raw RGB (cap longest side ~512). Per-pixel CIELAB + ITA.
- damageIntensity(px) blends: low ITA (more pigment) + local b* contrast (LoG spot response)
  + local luminance darkening, normalized 0..1.
- Downsample to cols×rows grid (default 48×64-ish, keep aspect) -> heatmap cells.
- Region polygons: landmark-derived if present, else proportional boxes inside a centered
  face bbox derived from skin-tone centroid (lower confidence, landmarksUsed:false).
- Per-region mean intensity, spotCount, score 0-100.
- Asymmetry: reflect grid across landmark/geometric midline, compare L vs R region means.
- overall.sunDamageScore = weighted region mean; severity bands low<33<=moderate<66<=high.
- Deterministic: synthetic gradient/half-shaded images yield predictable region+asymmetry.

## DB (migrationV5)

uv_scans(id TEXT PK, created_at TIMESTAMPTZ default now(), overall JSONB, regions JSONB,
  asymmetry JSONB, heatmap JSONB, screener JSONB, source TEXT, ip_hash TEXT,
  claimed BOOL default false)
uv_leads(id TEXT PK, email TEXT UNIQUE, report_token TEXT UNIQUE, scan_id TEXT REFERENCES
  uv_scans(id), status TEXT default 'lead', clerk_user_id TEXT, source TEXT,
  loops_synced BOOL default false, created_at TIMESTAMPTZ default now(),
  converted_at TIMESTAMPTZ)
indexes on uv_leads(email), uv_leads(report_token).

## Loops API (confirmed)
- POST https://app.loops.so/api/v1/events/send  { email, eventName, eventProperties?, contactProperties? }  Bearer LOOPS_API_KEY
- POST https://app.loops.so/api/v1/contacts/update { email, ...props }
- Event auto-creates contact if missing + triggers the dashboard-configured loop.

## Testing (jest + supertest; mock pg/openai/rag like __tests__/vision.test.js)
- uv-scan: synthetic buffers (sharp.create) → assert screener verdicts + heatmap/region/asymmetry invariants.
- loops: mock global.fetch → assert payload shape, disabled no-op, error swallow.
- uv-report: assert Buffer starts with %PDF, non-trivial size, no throw on missing regions.
- endpoints: supertest — 200/400/422/404/429 paths, persistence, Loops fired (mocked), lead idempotency, customer transition.
- Run ONLY new suites during dev; full `cd apps/glowlytics/backend && npm test` at the end.
