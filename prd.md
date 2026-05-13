# Glowlytics - Product Requirements Document

## Overview
Glowlytics is a skin health tracking app that enables users to gain insights into their skin health via their phone camera (with optional biophotonic scanner support). The app tracks acne, sun damage, and skin age over time, correlating results with lifestyle factors, product usage, and menstrual cycle data to provide actionable, non-diagnostic insights.

**Domain:** glowlytics.ai
**Production v1.0 Target:** App Store-ready release with authentication, validated scoring algorithms, and backend data sync.

---

## Tech Stack

### Frontend
- **React Native (Expo SDK 54)** - cross-platform mobile app
- Device camera integration (front-facing)
- Flashlight integration (Android/iOS)
- HealthKit/HealthConnect permissions (mocked for Expo Go, native for EAS builds)
- Face detection bounding box overlay on camera UI
- **Glow design language** — three palettes (Dusk default, Meadow, Rose) with cream + dusk-plum accent; Switzer body + DancingScript italic word accents; SF-symbol monoline icon set (22 glyphs in `src/components/glow/`); BreathingGlow + GlowRing + GlowSpark + FadeUp primitives with the 150/280/380/480ms staggered cadence
- **Fortified API client** — `src/services/httpClient.ts` wraps every backend call with exponential backoff + jitter, `Retry-After` honoring, 50s Bearer-token cache, 401-driven token refresh, `X-Request-ID` correlation, and a structured `ApiError` class. `src/services/syncOutbox.ts` replaces fire-and-forget store mutations with a durable retry queue (up to 5 attempts, exp backoff to 30s)

### Backend
- **Express.js** API server with JWT authentication middleware
- **PostgreSQL** database
- **MCP (Model Context Protocol) server** — Streamable HTTP transport mounted at `/mcp` with JWKS Bearer auth, beta allowlist gate, per-user rate limiter (60/min + 10/sec burst), structured tool-call audit logging. Exposes 9 user-scoped tools to authenticated MCP clients (Claude.ai etc.): `get_latest_scan`, `get_scan_history`, `get_signal_trend`, `compare_scans`, `get_scan_report`, `get_current_routine`, `lookup_ingredient`, `search_ingredients`, `summarize_month`. Connected apps managed via `/api/mcp/clients` GET + DELETE; surfaced in the Profile → Connected Apps (Beta) section.
- **Open Beauty Facts API** - skincare product ingredients lookup via barcode (waterfall: Open Beauty Facts → Open Food Facts → UPCitemdb → NIH DailyMed; each source capped at 6s, telemetry on failure)
- **Vision LLM API** — Fine-tuned GPT-4o for skin image analysis with condition detection (9 types × 8 facial zones), personalized feedback, local fallback
- **3-layer parallel vision pipeline** — Layer 1: deterministic features (CIELAB, ITA, GLCM, LBP, Gabor, Frangi) + Layer 2: ONNX CV models (structure MobileNetV3, hydration/elasticity EfficientNet-B0, YOLOv8 lesion detector) + Layer 3: fine-tuned GPT-4o. Score merging: L2 overrides > L1+L3 blend.
- **On-device lesion detection** — YOLOv8 ONNX model via onnxruntime-react-native, CoreML on iOS. Downloads from HuggingFace on first use, cached locally. Real-time inference during camera scan.
- **RAG pipeline** — Pinecone vector DB + OpenAI text-embedding-3-small, 77 curated guideline chunks (AAD, ACOG, EADV, BAD, NICE, Cochrane, WHO, AFP), signal-filtered queries with evidence level badges and source citations
- **Routine builder** — Smart product ordering (cleanser→SPF), ingredient conflict detection (4 rules with resolutions), signal-driven adjustment tips referencing user's actual products
- **Real-time face tracking** — react-native-vision-camera with MLKit face detection frame processor (GPU-accelerated, zero disk I/O, ~15-30ms per frame). Replaced expo-face-detector (deprecated).
- **On-device photo quality** — MLKit face detection for fill %, centering, angle validation (via react-native-vision-camera frame processor)
- Scanner data: **deterministic simulation** with seeded PRNG for reproducible readings
- **Gamification engine** — XP system (6 levels), 15 achievement badges, weekly challenges, personal bests tracking

### Authentication & Authorization
- **Provider:** Clerk (3rd-party OAuth service)
- **Sign-in methods:** Sign in with Apple, Sign in with Google, Email/Password
- **Session management:** Clerk JWT tokens, SecureStore for token persistence
- **Backend auth:** JWT verification via Clerk JWKS endpoint
- **Required compliance:** Apple App Store Review Guidelines 4.0 (Sign in with Apple required when offering other social logins)

### Internal Prompt Rules (for LLM analysis)
- Product usage data (from Open Beauty Facts API) + start dates
- HealthKit/HealthConnect data (cycles, sleep, HRV, RHR, etc.)
- Outputs of image classification (Vision LLM)
- Trend of outputs from past 30 days
- User demographic + onboarding information

---

## User Journeys

### Journey 1: Onboarding — Progressive Profile Collection (< 90 seconds)
**Goal:** Collect comprehensive lifestyle and demographic context through a calming, one-question-per-page flow inspired by Headspace. Product scanning and baseline scan happen post-onboarding as guided first-actions.

**Design principles:**
- One question per screen (progressive disclosure)
- Max per screen: 1 heading, 1 subtext, 1 primary action, 1 alternative/skip
- Fade-with-rise transitions (no lateral slides)
- Geometric organic SVG illustrations per screen
- Dot progress indicator (adapts to dynamic flow length)
- Apple HIG compliant: permissions requested in-context with pre-permission screens

#### Screen 1 — Welcome
- "A few questions to make this yours."
- "Glowlytics adapts to your skin, your lifestyle, and your goals. This takes under two minutes."
- CTA: **Let's go** / Skip: "I'll set this up later"

#### Screen 2 — Age Range
- "How old are you?"
- 2×3 grid: Under 18 / 18-24 / 25-34 / 35-44 / 45-54 / 55+

#### Screen 3 — Biological Sex
- "What's your biological sex?"
- 3 cards: Male / Female / Intersex-Other
- Branching: Female → inserts menstrual screens into flow

#### Screen 4 — Location
- "Where are you located?"
- Options: "Use my location" (expo-location) or "Enter my region" (ZIP input)
- Privacy: "Only your region is stored."

#### Screen 5 — Skin Goal
- "What's your biggest skin concern?"
- 3 cards with descriptions: Acne & Breakouts / Sun Damage & Pigmentation / Aging & Texture
- Illustration changes per selection

#### Screen 6 — Menstrual Cycle (female only)
- "Do you have a menstrual cycle?"
- 4 cards: Yes regular / Yes irregular / No / Prefer not to say
- Branching: Yes → shows cycle details screen

#### Screen 7 — Cycle Details (if yes to Screen 6)
- "A bit more about your cycle."
- Last period date, cycle length (21-25 / 26-30 / 31+ / Not sure)
- Hormonal birth control: Yes/No + type selector (Pill/IUD/Patch/Ring/Injection/Implant)

#### Screen 8 — Supplements & HRT
- "Are you taking anything that affects your skin?"
- Multi-select chips: Vitamin D, Vitamin C/Retinol, Omega-3, Collagen, Biotin, Zinc, HRT, TRT, None, Other

#### Screen 9 — Exercise
- "How active are you?"
- 4 cards: Rarely / 1-2×/week / 3-4×/week / 5+×/week

#### Screen 10 — Shower Frequency
- "How often do you shower or wash your face?"
- 5 cards: Once daily / Twice / 3+ / Every other day / Less

#### Screen 11 — Hand Washing
- "How often do you wash your hands?"
- 4 cards: Rarely / A few times / After every meal / Very frequently

#### Screen 12 — Camera Permission
- "Glowlytics needs your camera to track your skin."
- Trust signal card explaining photo privacy
- CTA: **Enable camera access** (triggers system dialog)

#### Screen 12.5 — Scan Reminder (NEW)
- "When is your daily skin routine?"
- "We'll send a gentle reminder so you never miss a scan."
- Native scrollable time picker (default 8:00 AM)
- CTA: **Set reminder** (requests notification permissions, schedules daily) / **Skip**

#### Screen 13 — Ready
- "You're ready to start tracking."
- Luminous orb animation
- CTA: **Continue** → Paywall

#### Screen 14 — Paywall (NEW)
- Inline RevenueCatUI.Paywall component
- On purchase/restore → set onboarding_complete, navigate to tabs
- On dismiss/skip → start 7-day free trial, set onboarding_complete, navigate to tabs
- Tracks: `onboarding_paywall_purchased`, `onboarding_paywall_skipped`, `onboarding_paywall_restored`

---

### Journey 2: Daily Scan to Results to 1 Action (30-60 seconds)
**Goal:** Daily usage is frictionless; context is auto when possible.

#### Step 1 - Home
- CTA: **Today's Scan**
- Streak + last score snapshot

#### Step 2 - Scan
- "Scan the same region: [region name]"
- Photo capture with face mesh overlay + live quality check
- **Real-time on-device lesion detection** via YOLOv8 ONNX model (onnxruntime-react-native)
  - Sci-fi corner bracket bounding boxes with teal (#7DE7E1) aesthetic
  - Scanning line + glow pulse animations
  - Runs every 1.2s when face aligned, filtered to detected face region only
  - 6 lesion classes: comedone, papule, pustule, nodule, macule, patch
  - Crop-aware coordinate mapping (accounts for CameraView center-crop)
  - On-device confidence threshold: 0.1, server threshold: 0.25
- Auto-capture after 2s continuous face alignment
- After capture, navigates directly to analysis (no checkin step)

#### Step 2.5 - Analysis Progress
- Staged progress screen between capture and results
- 9 stages with timed advancement tied to 3-layer pipeline
- Stages 0-5 advance on timers (~4.1s), stage 6 holds until API resolves
- Dual-track timing: timer + API fire in parallel, handshake when both ready
- XP/badge overlay before navigation to results
- **Known limitation:** dailyContext (sunscreen, new product, sleep, stress) is hardcoded to defaults since checkin was removed. Needs future fix.

#### Step 3 - Results + 1 Best Next Step
- 3 scores with: today value, delta vs baseline, 7-day sparkline
- Confidence indicator (low/med/high)
- One action card (never more than one):
  - Acne up during cycle window -> "Likely cycle-related; keep routine stable"
  - Sun damage up + no sunscreen -> "Add sunscreen daily (AM)"
  - Skin age plateau -> "Maintain consistency; consider adding [ingredient type]"
- CTA: **Log done / Remind me tomorrow**

---

### Journey 3: Share Report (clinician-ready export)
**Goal:** Produce a credible, structured packet from trends + context.

#### Step 1 - Share Report
- Select time range: 7 / 14 / 30 days

#### Step 2 - Report Preview (auto-generated)
Includes:
- User summary: age range + coarse location
- Scan protocol: region + daily cadence + confidence stats
- Trend charts: Acne / Sun damage / Skin age scores
- Representative photos (first / middle / last) + timestamps
- Products used + ingredients + start/stop dates
- Context overlays (if available):
  - Period window markers
  - Sunscreen adherence
  - Sleep/stress trend
- Footer: "Non-diagnostic metrics; for clinician interpretation."

#### Step 3 - Share
- Export PDF / share link / email (prototype can stub with preview)

---

## Device Connection Flow (Simulated for Hackathon)

Since no physical scanner is available, the device connection flow will be **simulated**:
- Mock "Connect scanner" gate screen with simulated discovery
- Simulated Bluetooth pairing animation
- Mock scanner readings with realistic data
- "Scanner busy" and "Connection lost" states available for demo
- Disconnect/handoff flow after scan completion

### Data Association Rule
- Every scan session attached to current user's profile and selected face region
- Scanner transmits measurements but does not store identity
- App stores: scan_timestamp, region, scanner_quality, and user context

---

## Data Schema

### 1) User Profile (one-time + editable)
| Field | Type | Required |
|-------|------|----------|
| user_id | TEXT (Clerk ID) | Yes |
| age_range | string | Yes |
| location_coarse | string (ZIP3/city) | Yes |
| period_applicable | enum (yes/no/prefer_not) | Yes |
| period_last_start_date | date | If applicable |
| cycle_length_days | int (default 28) | If applicable |
| smoker_status | bool | No |
| drink_baseline_frequency | string | No |
| wearable_connected | bool | No |
| wearable_source | string | No |

### 2) Scan Protocol (one-time per program)
| Field | Type | Required |
|-------|------|----------|
| protocol_id | UUID | Yes |
| user_id | UUID | Yes |
| primary_goal | enum (acne/sun_damage/skin_age) | Yes |
| scan_region | string | Yes |
| scan_frequency | string (daily) | Yes |
| baseline_date | date | Yes |

### 3) Product Catalog Entry (per user product)
| Field | Type | Required |
|-------|------|----------|
| user_product_id | UUID | Yes |
| user_id | UUID | Yes |
| product_name | string | Yes |
| product_capture_method | enum (barcode/photo/search) | Yes |
| ingredients_list | text[] | Yes |
| usage_schedule | enum (AM/PM/both) | Yes |
| start_date | date | Yes |
| end_date | date | No |
| notes | string | No |

### 4) Daily Record (one row per day)
| Field | Type | Required |
|-------|------|----------|
| daily_id | UUID | Yes |
| user_id | UUID | Yes |
| date | date | Yes |
| scanner_reading_id | UUID | Yes |
| scanner_indices | JSON (inflammation, pigmentation, texture) | Yes |
| scanner_quality_flag | enum (pass/warn/fail) | Yes |
| scan_region | string | Yes |
| photo_uri | string | No |
| photo_quality_flag | enum (pass/warn/fail) | No |
| photo_angle_match_score | float | No |
| photo_lighting_score | float | No |
| sunscreen_used | bool | Yes |
| new_product_added | bool | Yes |
| period_status_confirmed | enum (accurate/not_accurate) | Yes |
| cycle_day_estimated | int | No |
| sleep_quality | enum (poor/ok/great) | No |
| stress_level | enum (low/med/high) | No |
| drinks_yesterday | string | No |
| sleep_duration_minutes | int | No |
| resting_hr | int | No |
| hrv | int | No |
| steps | int | No |

### 5) Model Outputs (per day)
| Field | Type | Required |
|-------|------|----------|
| output_id | UUID | Yes |
| daily_id | UUID | Yes |
| acne_score | int (0-100) | Yes |
| sun_damage_score | int (0-100) | Yes |
| skin_age_score | int (0-100 or years) | Yes |
| confidence | enum (low/med/high) | Yes |
| primary_driver | string | No |
| recommended_action | string | Yes |
| escalation_flag | bool | Yes |
| signal_scores | JSONB {structure, hydration, inflammation, sunDamage, elasticity} | No |
| signal_features | JSONB {inflammation_a_star, ita_variance, spot_count, pore_density, wrinkle_index, specular_ratio} | No |
| lesions | JSONB [{class, confidence, bbox, zone}] | No |

### 6) Report Artifact (generated on demand)
| Field | Type | Required |
|-------|------|----------|
| report_id | UUID | Yes |
| user_id | UUID | Yes |
| date_range | string | Yes |
| included_fields | string[] | Yes |
| report_uri | string | Yes |
| shared_at | timestamp | No |

---

## Results Explanation Templates

### Template A: Acne Tile
- **Improving + high confidence:** "Your acne metric is improving compared to your baseline. Routine adherence has been consistent, and there were no major confounders detected."
- **Worse + period window:** "Your acne metric rose during your predicted cycle window. This pattern often reflects hormonal variation. Consider keeping your routine stable for the next few days and avoid introducing new actives."
- **Worse + new product:** "Acne metric worsened soon after a new product was introduced. This may be a confounding change. Consider pausing the new product to isolate what's driving the shift."
- **Worse + poor sleep/stress:** "Acne metric increased on days with lower sleep / higher stress signals. This may indicate lifestyle-driven fluctuation rather than a product effect."

### Template B: Sun Damage Tile
- **No sunscreen + worse:** "Sun damage metric increased alongside low sunscreen use. The highest-impact change is daily AM sunscreen and reapplication on high-exposure days."
- **High UV location:** "Given your location, UV exposure is likely elevated right now. Protective steps (sunscreen + shade) will have outsized impact."

### Template C: Skin Age Tile
- **Texture improving:** "Skin age metric improved primarily due to texture/roughness changes compared to baseline."
- **Plateau + low adherence:** "Skin age metric hasn't shifted meaningfully yet. Inconsistent routine adherence can slow visible change -- consider simplifying to improve consistency."

### Escalation Language (non-diagnostic)
- "Your metrics changed rapidly and the trend is unusual for your baseline. This isn't a diagnosis, but it may be worth sharing a report with a clinician for context."

---

## Scoring Algorithms

### Design Principles
- All scores are deterministic given the same inputs (no randomness)
- Weights are grounded in established dermatology assessment methodologies
- Scores range 0-100 where higher = worse condition
- Context modifiers (sleep, stress, cycle) use evidence-based effect sizes

### Primary Score Derivation

#### Acne Score
Base = inflammation_index × 0.65 + texture_index × 0.20 + pigmentation_index × 0.15
- Weight rationale: GAGS (Global Acne Grading System) correlates inflammatory lesions as primary (~65%), comedonal texture secondary (~20%), PIH residual (~15%)
- Context modifiers: poor sleep (+6), high stress (+8), late luteal phase (+10), early follicular (+5), no sunscreen (+3), new product (+4)

#### Sun Damage Score
Base = pigmentation_index × 0.70 + inflammation_index × 0.15 + texture_index × 0.15
- Weight rationale: UV-induced pigmentation is primary photoaging marker (~70%), erythema (~15%), texture degradation (~15%)
- Context modifiers: no sunscreen (+8), poor sleep (+2), high stress (+3)

#### Skin Age Score
Base = texture_index × 0.55 + pigmentation_index × 0.25 + inflammation_index × 0.20
- Weight rationale: VISIA-type analysis prioritizes texture/roughness (~55%), solar lentigines (~25%), chronic inflammation (~20%)
- Context modifiers: no sunscreen (+4), poor sleep (+5), high stress (+3)

### Composite Signals (Overall Skin Health)
5 signals weighted to produce overall score:
- Structure (22%): inverse of texture + age risk
- Hydration (18%): inverse of texture + acne risk + lifestyle penalties
- Inflammation (20%): inverse of inflammation + acne risk
- Sun Damage (20%): inverse of sun + pigmentation risk
- Elasticity (20%): inverse of age + texture risk

### Signal-Specific Analysis Pipeline (3-Layer)
Each signal now has its own biologically grounded measurement via a 3-layer parallel pipeline:

**Layer 1 — Deterministic Image Processing** (~100ms, `backend/image-processing.js`):
- CIELAB a* erythema map → inflammation (validated: r=0.89 vs Mexameter, Stamatas 2004)
- ITA variance + solar lentigo count → sun damage (validated: Flament 2013)
- Specular reflection ratio + LBP entropy → hydration (validated: r=0.72 vs Corneometer, Batisse 2002)
- GLCM texture + green channel pore proxy → structure
- Forehead wrinkle energy (Frangi-inspired) → elasticity

**Layer 2 — Custom CV Models** (~200ms, `backend/signal-models.js`):
- Structure: MobileNetV3 (pore count + texture regularity)
- Hydration: EfficientNet-B0 (Gabor+LBP features)
- Elasticity: EfficientNet-B0 (Frangi wrinkle quantification)
- Lesion detection: YOLOv8-small (comedone, papule, pustule, nodule, macule, patch)
- Models loaded from ONNX; graceful fallback to Layer 1 when not available

**Layer 3 — Fine-tuned GPT-4o** (existing, ~3-5s):
- Holistic condition classification, pattern recognition, personalized feedback, RAG recommendations

Score merging: Layer 2 overrides > Layer 1 + Layer 3 weighted blend (0.6/0.4 for CV signals, 0.7/0.3 for deterministic-primary signals)

### Confidence Levels
- Low: < 3 scans (insufficient data for trend)
- Medium: 3-6 scans (emerging pattern)
- High: 7+ scans (reliable trend established)

### Escalation Threshold
- Flag triggered when any primary score changes > 20 points from previous reading
- Triggers non-diagnostic advisory: "Consider sharing a report with a clinician"

---

## Apple App Store Compliance

### Human Interface Guidelines (HIG)
- All screens use SafeAreaView for proper inset handling
- Light mode as primary (warm cream #FAFAF7) with WCAG AAA contrast ratios (7:1 target)
- Minimum touch target: 44x44pt per Apple HIG
- Native navigation patterns: back gestures, sheet presentations for modals
- Haptic feedback on key interactions (scan complete, score reveal)

### Health App Requirements
- Non-diagnostic disclaimer on every results screen and in onboarding
- Clear "This is not medical advice" language per App Store Review Guidelines 1.4.1
- Privacy policy URL required (linked in app settings and App Store listing)
- Data collection transparency: what data is collected, how it's used, how to delete
- No claims of diagnosis, treatment, or cure

### App Store Technical Requirements
- EAS Build for native binary generation
- Bundle identifier: com.glowlytics.app (production)
- Associated domains for Clerk universal links
- Privacy nutrition labels in App Store Connect
- Sign in with Apple required (when offering Google sign-in)

### Accessibility
- VoiceOver labels on all interactive elements
- Minimum contrast ratio 4.5:1 for all text

---

## Data Privacy & Security
- All auth via Clerk (no passwords stored in our database)
- JWT tokens stored in device SecureStore (not AsyncStorage)
- Backend validates JWT on every authenticated request
- User data scoped by Clerk user ID
- Health data is never shared with third parties
- Users can request full data deletion (GDPR/CCPA compliance)
- Camera photos stored locally on device only
- No analytics or tracking without explicit consent

---

## Implementation Status (as of 2026-05-11)

### Completed (Ship-Ready)
- All 3 user journeys fully implemented (onboarding, daily scan, report)
- **Mandatory auth flow** with Clerk sign-in gate, forgot password, sign-out
- **Auth token wiring** — Clerk getToken() injected into API client on app startup; cached for 50s in httpClient
- **Animated auth screens** with Headspace-inspired staggered entrances, error shake, success haptics; Glow palette skin (cream + dusk plum, DancingScript wordmark)
- **Clerk authentication** with Sign in with Apple, Google, and Email/Password
- **Glow design language redesign** — full app reskin: 3 palettes (Dusk default, Meadow, Rose); Switzer body + DancingScript italic accent; SF-symbol monoline icons; BreathingGlow + GlowRing + GlowSpark + FadeUp primitives; Today / Story / Shelf / Me tab structure with route files preserved for deep links; 4-facet UI (Hydrated/Calm/Even/Firm) mapped onto the existing 5-signal ML pipeline via `src/constants/facets.ts`. New screens: `app/story.tsx`, `app/today/ritual.tsx`, `app/account.tsx`, `app/routine.tsx`.
- **MCP server** — Streamable HTTP transport at `/mcp`, JWKS Bearer auth, beta allowlist, per-user rate limiter (60/min + 10/sec burst), 9 user-scoped tools (`get_latest_scan`, `get_scan_history`, `get_signal_trend`, `compare_scans`, `get_scan_report`, `get_current_routine`, `lookup_ingredient`, `search_ingredients`, `summarize_month`), structured tool-call audit logging, cross-tool user-scoping test suite. Connected Apps (Beta) section in Profile lists + revokes clients via `/api/mcp/clients` GET+DELETE.
- **Fortified API client** — `src/services/httpClient.ts` is the single fetch wrapper for every backend + 3rd-party call: exponential backoff with jitter, `Retry-After` honoring, 401 token refresh, `X-Request-ID` correlation, structured `ApiError`. `src/services/syncOutbox.ts` replaces the previous fire-and-forget pattern with a durable retry queue (up to 5 attempts, capped 30s backoff). 3rd-party product lookups capped at 6s with per-source telemetry.
- **RevenueCat subscription** — "Glow Pro" entitlement, 7-day free trial (started on onboarding paywall skip), monthly/yearly/lifetime products, native paywall UI via RevenueCatUI, Customer Center for subscription management. Error 23 (CONFIGURATION_ERROR) silenced.
- **Scan gating** — camera tab, camera screen, home scan buttons redirect to paywall when trial expired and not subscribed
- **Daily scan notifications** — expo-notifications with configurable time picker in onboarding + profile settings
- **Shelf tab (renamed from Products)** — full product management screen with tone-tinted cards + heart rating; routine score view (`app/routine.tsx`) reachable from "See routine score & conflicts" link
- **Report gating** — clinician reports require active "Glow Pro" subscription
- **PostHog analytics** — 20+ events tracked across auth, onboarding, scans, paywall conversion, engagement, sync-outbox drops, product-lookup failures, sign-out; user identification via Clerk userId
- **Vision API** — fine-tuned GPT-4o (`ft:gpt-4o-2024-08-06:personal:radianceiq-skin:DHBaOo20`) via backend proxy; API key server-side only
- **RAG pipeline** — Pinecone vector DB with 80 curated AAD/ACOG guideline chunks, semantic search via OpenAI text-embedding-3-small
- **Product intelligence** with 45-ingredient knowledge base, personalized effectiveness scoring, detail views (redesigned with Glow verdict card)
- **Signal detail screens** with animated gauges, trend charts, personalized recommendations (redesigned with breathing glow + facet copy)
- **Pattern detail** — 7-day correlation bar chart, side-by-side evidence, "Try this" tips
- **Photo persistence** — scan photos saved to documentDirectory, stored in DailyRecord.photo_uri
- **Representative photos in reports** — first/middle/last photos from selected time range
- **Privacy policy** — in-app screen (BDQ Holdings LLC, GDPR/CCPA, 11 sections)
- **Deterministic scoring algorithms** with validated dermatology heuristics (no Math.random())
- **Typed API service layer** wiring frontend to Express+PostgreSQL backend
- **Backend auth middleware** with JWT verification via Clerk JWKS
- **SQL injection fix** on PATCH /api/users/:id (field whitelisting)
- **Seeded PRNG** for reproducible scanner simulation in tests
- **EAS build configuration** in app.json
- **App icon** — gradient background (purple-to-cyan) with white G logo
- **App Store metadata** — description, keywords, screenshot specs for iPhone 15 Pro Max
- **Demo script** — 7-minute structured walkthrough with talking points
- **Production build submitted** — v1.1.6 build #106 uploaded to TestFlight 2026-05-09
- **361 mobile tests** (24 suites) + **285 backend tests** (24 suites) = 646 total, 0 TypeScript errors
- 56 screen files, 31 components (37 with nested), 31 services, 7 top-level backend modules (+23 nested), Zustand store
- EAS dev client + production builds succeeding (latest on TestFlight)

### SDK Migration (SDK 55 → 54)
- Downgraded to Expo SDK 54 (`expo ~54.0.0`, `react 19.1.0`, `react-native 0.81.5`)
- All expo-* packages aligned via `npx expo install --fix`
- Removed native health packages — replaced with pure mock in `src/services/healthPermissions.ts`
- App bundles and runs in Expo Go SDK 54 (1305 modules, <1s bundle)

### Known Issues Resolved
- **NitroModules crash in Expo Go**: Fixed by removing native packages entirely
- **Infinite re-render loop on web**: Fixed by deferring store hydration
- **Non-deterministic scoring**: Removed all Math.random() from analysis engine
- **SQL injection in user PATCH**: Fixed with field whitelisting
- **WorkletsError mismatch**: Pinned react-native-worklets to 0.5.1 with override
- **Duplicate navigator**: AuthGatedContent replaced with AuthRedirector (Redirect-only)

### Remaining Work (App Store Launch)
- **Clerk production keys**: swap pk_test_* → pk_live_* in eas.json, sk_test_* → sk_live_* on Railway
- **RevenueCat dashboard**: configure paywall template, create subscription products in App Store Connect, set up Customer Center paths
- **PostHog dashboard**: build funnels (auth→onboarding→scan, paywall conversion, retention)
- **Screenshots**: capture 5 screens on iPhone 15 Pro Max (1290x2796)
- **Privacy policy URL**: host privacy-policy content at https://glowlytics.ai/privacy
- **App Store Connect metadata**: paste description/keywords from app-store-metadata.json
- **Content rating questionnaire**: complete in App Store Connect (12+, medical info: no)
- **Seed Pinecone on production**: POST /api/rag/seed
- **TestFlight**: smoke test all 3 journeys + subscription flow
- **Submit for App Review**

### Completed (2026-03-16): Signal-Specific Analysis Pipeline
- **3-layer parallel pipeline** in `/api/vision/analyze` — deterministic image processing + ONNX CV models + GPT-4o
- **Layer 1**: CIELAB a*, ITA variance, GLCM, LBP, specular analysis via `sharp` (~100ms)
- **Layer 2**: ONNX model inference for structure/hydration/elasticity + YOLOv8 lesion detection
- **Layer 3**: Existing fine-tuned GPT-4o (unchanged)
- **Frontend**: Signal Breakdown section on results screen (per-signal bars + confidence badges), lesion bounding boxes on FacialMesh

### Completed (2026-03-17): HuggingFace Models + Real-Time Lesion Detection + Security Hardening
- **ONNX models wired**: All 4 model runners (`runStructureModel`, `runHydrationModel`, `runElasticityModel`, `runLesionDetector`) now perform real inference via `onnxruntime-node`
- **Handcrafted features**: Gabor filter bank (24-dim), LBP-uniform (18-dim), Frangi vesselness (9-dim), landmark geometry (5-dim) computed in `image-processing.js`
- **Feature builders**: `buildHydrationFeatures()` (44-dim) and `buildElasticityFeatures()` (14-dim) assembled for Layer 2 models
- **NMS post-processing**: YOLOv8 output transposed, confidence-filtered, NMS with IoU 0.45, mapped to 6 lesion classes + zones
- **Model download script**: `backend/scripts/download-models.sh` fetches from HuggingFace (`mufasabrownie/glowlytics-skin-models`)
- **Fast detection endpoint**: `POST /api/vision/detect-lesions` — public, rate-limited (10/10s), runs only YOLOv8
- **On-device detection**: `onDeviceLesionDetection.ts` service runs YOLOv8 on camera frames during alignment
- **Real-time overlay**: `LesionOverlay.tsx` — teal sci-fi corner brackets with scanning line, glow pulse, crop-aware coordinate mapping, face-rect filtering
- **Camera integration**: Detection every 1.2s while face aligned, clears on un-align, Hermes-compatible AbortController
- **Scan flow simplified**: Camera → Analyzing → Results (checkin screen removed)
- **Security hardening**: Authorization checks on all user-data endpoints, CORS restriction, rate limiting, safe error messages, SQL field validation, production auth guard
- **Codebase audit**: 4 critical + 8 high + 9 medium bugs identified; 11 critical/high fixed, 8 medium documented
- **Build #18** submitted to TestFlight with all fixes
- **DB schema**: Added signal_scores, signal_features, lesions JSONB columns to model_outputs
- **ML pipeline**: 5 new training notebooks (05-09) for structure, hydration, elasticity, lesion detection, evaluation
- **Tests**: 53 new tests (image processing unit, signal model merging, endpoint integration)
- **Dependencies**: sharp (backend), onnxruntime-node (optional), 6 new ML Python packages

### Completed (2026-03-17): RevenueCat Fix + Trial + Notifications + Products Tab
- **RevenueCat Error 23 fix**: `initRevenueCat()` catches CONFIGURATION_ERROR silently
- **7-day free trial**: `startTrial()`, `isTrialActive()`, `trialDaysRemaining()`, `canScan()` in subscription service
- **Onboarding paywall**: `app/onboarding/paywall.tsx` — inline RevenueCatUI, skip starts trial, purchase completes onboarding
- **Daily scan notifications**: `src/services/notifications.ts` + `app/onboarding/scan-reminder.tsx` — time picker, schedule/cancel daily reminders
- **Products tab**: replaced Trend tab with full product management — routine score ring, ProductCard with effectiveness rings, AddProductSheet (search/barcode/manual), FAB
- **Profile updates**: trial days remaining, notification settings section (enable/disable daily reminder)
- **New components**: `ProductCard.tsx`, `AddProductSheet.tsx`
- **Dependencies added**: `expo-notifications`, `@react-native-community/datetimepicker`
- **Build #24** submitted to TestFlight with all changes

### Completed (2026-03-22): UI Polish — Tab Bar, Splash Screen, Onboarding
- **Floating tab bar redesign**: SVG notch cutout path (10px depth, 74px width), camera button absolutely positioned above bar with teal glow shadow, glass fill `rgba(255,255,255,0.93)`, no scene padding/background so bar truly floats over content
- **Splash screen redesigned**: "Find your glow" DancingScript cursive handwriting reveal with left-to-right clip mask + teal ink glow. Minimum 1.5s display via `Promise.all` with app init. Old `index.tsx` landing page replaced with minimal bridge screen.
- **Onboarding trimmed**: 7-9 active screens (welcome, age-range, sex, skin-goal, [menstrual], [cycle-details], camera-permission, preview, paywall). Deferred screens (location, products, supplements, exercise, shower-frequency, hand-washing, scan-reminder) moved to post-first-scan collection.
- **Skin metric detail**: bolder metric cards, FaceAssessmentMap with metric-colored ambient glow
- **Analyzing screen**: fluid infinity loop animation
- **SkinScoreHero**: animated score counter with accent bar and coaching action statement
- **Analyzing screen**: Now waits for backend response before navigating to results
- **Backend refactoring**: `app.js` route organization cleanup, `rag.js` pipeline expansion (improved chunking/retrieval), `signal-models.js` improvements
- **Lesion constants**: New `src/constants/lesions.ts` module (6 classes with descriptions, colors, zone definitions)
- **Vision API service**: Expanded response parsing and error handling in `visionAPI.ts`
- **Results screen**: Enhanced signal display and lesion visualization
- **Latest build** submitted to TestFlight via local EAS build + `eas submit`

### Deferred (post-launch)
- **Fix dailyContext in analyzing**: sunscreen_used/new_product_added hardcoded to `false` since checkin removal — need to collect these before analysis
- HealthKit/Health Connect native integration (requires EAS bare workflow)
- PDF export for clinician reports (client-side generation works via expo-print; backend endpoint is DB-reference only)
- Session replay via PostHog (currently disabled)
- Deploy ONNX models to Railway (115MB total, needs LFS or external hosting)
- Remaining medium-priority bugs: streak duplication, TodayScreen dead code, duplicate DB schema (see memory/bugs_audit_20260317.md)

---

## Onboarding Implementation (Current)

### Onboarding flow (7-9 active screens, trimmed from 16)
1. Welcome
2. Age Range (2×3 grid)
3. Biological Sex (branching: female → inserts menstrual screens)
4. Skin Goal (3 cards with dynamic illustration)
5. Menstrual Cycle (female only)
6. Cycle Details (if yes to #5: date, length, birth control)
7. Camera Permission (pre-permission screen + system dialog)
8. Preview (shows what user gets after first scan)
9. Paywall (RevenueCatUI inline, skip starts 7-day trial)

**Deferred screens** (collected post-first-scan): location, products, supplements, exercise, shower-frequency, hand-washing, scan-reminder. Files still exist in `app/onboarding/`.

### Flow architecture
- Dynamic flow array via `buildOnboardingFlow(sex, menstrualStatus)` in `src/services/onboardingFlow.ts`
- Flow stored in Zustand: `onboardingFlow[]` + `onboardingFlowIndex`
- Conditional screens (menstrual/cycle-details) inserted based on sex answer
- Dot progress indicator adapts to actual flow length
- Product scanning and baseline scan moved to post-onboarding first-launch actions

### Design patterns (Headspace-inspired)
- One question per screen, max 1 heading + 1 subtext + 1 primary CTA + 1 skip
- Fade transitions between screens (no lateral slides)
- Staggered fade-with-rise entrance: illustration (0ms) → heading (120ms) → subtext (220ms) → content (300ms) → buttons (400ms)
- Geometric organic SVG illustrations per screen, teal-dominant on dark background
- `OnboardingTransition` wrapper component for consistent layout and animations
- `OnboardingOptionCard`, `OnboardingGridOption`, `OnboardingChip` for selections

### Permission timing
- **Camera:** Requested on Screen 12 after trust justification, persisted on user profile
- **Location:** Requested on Screen 4 when user chooses "Use my location"
- Both follow Apple HIG "explain before you request" pattern

### UserProfile extensions
- `sex`, `menstrual_status`, `on_hormonal_birth_control`, `birth_control_type`
- `supplements[]`, `exercise_frequency`, `shower_frequency`, `hand_washing_frequency`

## Authentication Flow

### Redirect Logic
- **Root layout** (`app/_layout.tsx`) contains `AuthRedirector` component that returns only `<Redirect>` components or `null` — never its own navigator
- When Clerk is configured:
  - `!appReady` → animated `SplashScreen` ("Find your glow" handwriting reveal, 1.5s min) in `_layout.tsx`
  - `!isSignedIn` → redirect to `/auth/sign-in`
  - `isSignedIn` + `!onboarding_complete` → redirect to `/onboarding/welcome`
  - `isSignedIn` + `onboarding_complete` → render normal tab navigation
- When Clerk is not configured: demo mode with onboarding/demo buttons

### Screen Inventory
- `app/auth/sign-in.tsx` — email/password + OAuth (Apple, Google) with staggered entrance animations
- `app/auth/sign-up.tsx` — account creation with email verification + 60s countdown timer
- `app/auth/forgot-password.tsx` — password reset via Clerk reset_password_email_code strategy
- `app/auth/_layout.tsx` — fade_from_bottom transitions, 400ms duration

### Animation Specs (Headspace-inspired)
- Staggered entrance: 400-600ms per element, `Easing.out(Easing.cubic)`
- Error shake: `withSequence(-6, 6, -3, 0)` on error container translateX
- Success: content fade out (400ms), orb scale to 1.2, haptic notification
- Orb entrance: scale 0.3→1 over 800ms, glow pulse with 2s cycle
- Shared animation utilities in `src/utils/animations.ts`

### Dependencies
- `expo-haptics` for success feedback

---

## Product Intelligence

### Ingredient Knowledge Base
- `src/services/ingredientDB.ts` contains ~45 ingredient profiles
- Categories: retinoid, AHA, BHA, antioxidant, humectant, emollient, sunscreen_active, peptide, surfactant, preservative, fragrance, other
- Each profile includes: clinical efficacy (0-100), side effect risk (0-100), goal relevance, signal relevance, description, evidence citation

### Effectiveness Scoring Algorithm
1. Base score: 50
2. Per-ingredient: `clinicalEfficacy * goalRelevance[goal] / 500` (scaled -5 to +10)
3. Side effect penalty: `sideEffectRisk * 0.08` per concerning ingredient
4. Personalization: +3 bonus when ingredient helps a struggling signal (<50), -3 extra penalty when ingredient hurts a struggling signal
5. Goal alignment bonus: +8 when 2+ goal-relevant ingredients present
6. Fragrance penalty: -5 unconditional
7. Clamped 0-100

### Product Detail View
- `app/product/[id].tsx` — full ingredient breakdown, goal alignment, usage tips, related signals
- Effectiveness badges shown on profile and onboarding product lists
- Color coding: >=75 success, >=55 primary, >=35 warning, <35 error

---

## Signal Detail Screens

### Five Signals
| Signal | Color | Measurement Basis | Fallback Weights |
|--------|-------|-------------------|-----------------|
| Structure | `#7DE7E1` | GLCM texture + pore proxy (Layer 1), MobileNetV3 (Layer 2) | texture_index 55%, skin_age 45% |
| Hydration | `#4DA6FF` | Specular ratio + LBP entropy (Layer 1), EfficientNet-B0 (Layer 2) | texture_index 50%, acne 20%, stress/sleep |
| Inflammation | `#FF7A78` | CIELAB a* erythema map (Layer 1, gold standard) | inflammation_index 80%, acne 20% |
| Sun Damage | `#F2B56A` | ITA variance + spot count (Layer 1, gold standard) | sun_damage 82%, pigmentation 18% |
| Elasticity | `#B68AFF` | Forehead wrinkle energy (Layer 1), EfficientNet-B0 (Layer 2) | skin_age 62%, texture_index 38% |

### Signal Detail Screen (`app/signal/[key].tsx`)
- Large animated SVG arc gauge (280px, signal-colored)
- Contributing factor bars showing weight distribution
- 14-day trend line chart from `computeSignalHistory()`
- Personalized recommendations based on level (Poor/Fair/Good/Excellent)
- Related products filtered by signal relevance

### Home Integration
- Signal rings on home screen are tappable → navigate to signal detail
- Tap any ring to see full breakdown, history, and recommendations

---

## Launch Readiness Milestones

### Milestone 1: Security & Compliance (DONE — 2026-03-23)
- [x] IDOR fix: all POST routes use req.auth.userId
- [x] Account deletion endpoint (Apple 5.1.1(v))
- [x] Input validation on user creation
- [x] Rate limiting on vision/analyze (10 req/min/user)
- [x] RAG seed endpoint admin-only (timing-safe secret)
- [x] Auth bypass hardened (NODE_ENV denylist)
- [x] Cascading delete wrapped in transaction
- [x] Android RECORD_AUDIO permission removed
- [x] Localhost API guard in production builds
- [x] Demo data hidden in production
- [x] Console.log gated behind __DEV__

### Milestone 2: Camera Pipeline Upgrade (DONE — 2026-03-23)
- [x] Replace expo-face-detector with react-native-vision-camera + MLKit
- [x] Frame processor for real-time face detection (~15ms vs ~200ms)
- [x] Remove takePictureAsync polling loop (useFaceTracking)
- [x] Update photoQuality to use VisionCamera face data
- [x] Integrate lesion detection with frame processor pipeline
- [x] Update tests for new camera module (23 face/photo tests rewritten as pure function tests)

### Milestone 3: Remaining Launch Blockers
- [ ] Clerk pk_live_ key in production EAS profile
- [ ] CORS_ORIGINS set on Railway
- [ ] SSL rejectUnauthorized: true with CA cert
- [ ] Sunscreen/product context collection before scan
- [x] Report generation — client-side via expo-print + buildReportHtml (backend endpoint is DB-reference only)
- [x] Backend log masking in production (safeErrorMessage + 9 error/warn sites masked)

### Milestone 4: App Store Submission
- [ ] EAS production build (iOS)
- [ ] TestFlight distribution
- [ ] App Store Connect metadata + screenshots
- [ ] App Review submission

---

## UX Plan Completion Verification

To ensure the frontend UX plan is tracked and auditable, the execution checklist is maintained in `ux_progress.txt`.

- The UX tracker maps completion status to each major journey and interaction design objective.
- MVP-critical UX flows are marked complete; placeholders and stretch integrations are explicitly called out as in-progress or pending.
- This separation prevents stretch-goal gaps from being mistaken as core plan failures during demo readiness reviews.
