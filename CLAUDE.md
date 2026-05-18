# Glowlytics — Skin Health Tracking App

## Structure

```
apps/
  glowlytics/    # Mobile app (Expo + React Native)
    app/         # 74 screens (63 + 11 _layout, Expo Router file-based)
      (tabs)/    # today, reports (→ Story), camera, products (→ Shelf), profile (→ Me)
      auth/      # sign-in, sign-up, forgot-password (Apple native + Google OAuth + email)
      onboarding/# 8-10 screens (dynamic per sex/menstrual, includes scan-reminder)
      scan/      # camera -> analyzing -> results (story format) + bone-capture, bone-results + face-map, zone-detail, method (Scan Flow design)
      settings/  # hub + skin-profile, notifications, privacy, camera, appearance, export, help, about, delete-account (Settings Flow design)
      architecture/  # bone-structure finding detail screens
      story.tsx, account.tsx, routine.tsx, ritual.tsx  # split out of tab files; ritual moved from /today/ritual in v1.2.0
    modules/         # local Expo native modules (expo-arkit-face for FaceAnchor capture)
    src/
      components/    # 40 top-level (.tsx) incl. Face3DViewer, DomainRadialChart, DomainHistoryStrip, HarmonyScoreReveal, HarmonyTrendCard, HarmonyFocusCard, HarmonyIntroOverlay, BoneCaptureSexPrompt, StoryCarousel + glow/ + navigation/ + scan/ + settings/
      components/glow/  # GlowIcons, GlowPrimitives (BreathingGlow, GlowRing, GlowSpark, FadeUp)
      components/scan/  # FaceMapZones (SVG zone primitive), ScanAtoms (Chip, Dot, StagePills) — Scan Flow design
      components/settings/  # SettingsPrimitives (SettingsPage, Header, ListGroup, Row, Toggle, Chip, Pill, PrimaryButton, GhostButton) — Settings Flow design
      services/      # 35 services incl. httpClient.ts, syncOutbox.ts, mcpClients.ts, faceMeshCapture.ts, boneStructure.ts, ritual.ts
      store/         # Zustand (useStore.ts) — sync via outbox, not fire-and-forget; persists ritualCompletions keyed by local date
      constants/     # theme.ts (incl. Glow palettes), signals.ts, facets.ts, lesions.ts, ingredients.ts, boneStructure.ts
      utils/, hooks/, types/, config/
    backend/         # Express + PostgreSQL + ONNX + RAG + MCP server (10 top-level modules)
      mcp/           # MCP Streamable HTTP transport + tools + auth + rate limiter + OAuth DCR proxy (12 modules)
      queries/       # reusable scan/routine/ingredient/bone-structure query helpers (5 modules)
      bone-structure-3d.js  # 16-metric Harmony scoring across 6 domains
      interventions.js      # finding → three-tier (Lifestyle/Pharma/Procedural) lookup
      no-llm-fallback.js    # OPENAI_DISABLED / empty key → deterministic L1+L2 + template insights
  landing/       # Marketing website (Next.js)
research/
  ml/            # Training/data notebooks and model tooling
```

## Commands

```bash
cd apps/glowlytics
npm start                    # Dev server
npx tsc --noEmit             # Type check (0 errors)
npm test                     # 747 tests across 56 suites (mobile + backend combined when run from apps/glowlytics)
cd backend && npm test       # Backend tests only
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | React Native, Expo SDK 54, TypeScript strict |
| Auth | Clerk v2 — Apple (`useSignInWithApple`), Google (`useOAuth`), email |
| Subscriptions | RevenueCat 9.15.2 ("Glow Pro", 7-day trial) |
| Vision | 3-layer parallel: deterministic + ONNX + fine-tuned GPT-4o |
| Backend | Express + PostgreSQL + Pinecone RAG (80 chunks) + MCP server on Railway |
| Camera | react-native-vision-camera + MLKit face detection |
| API client | httpClient with retry/backoff/jitter + syncOutbox durable queue |
| Design | Glow language — Dusk/Meadow/Rose palettes, Switzer + DancingScript |

## Code Conventions

- Zustand selectors: `useStore((s) => s.field)` — never full subscription
- `scoreColor()` in `theme.ts` — unified score→color mapping
- `localDateStr()` in `utils/localDate.ts` — not `toISOString().split('T')[0]`
- `gateWithPaywall()` in `services/subscription.ts` — all scan/report gating
- **API calls always go through `httpClient.httpJson`** — never bare `fetch` for backend or 3rd-party APIs. `api.ts` wraps every endpoint; `productLookup` uses `fetchThirdPartyJson` for 3rd-party with 6s timeout.
- **Mutations route through `enqueueSync`** (via `syncToBackend` helper in `useStore.ts`) — gives durable retry on offline/5xx/429. Pass `isTerminalError` predicate for 409s so they don't keep retrying.
- **Errors**: prefer `ApiError` + `isApiError(err, status)` from `httpClient`. Legacy `isApiStatus` still works.
- **Glow facets**: UI surfaces 4 facets (Hydrated/Calm/Even/Firm) but ML pipeline keeps 5 signals — adapter in `src/constants/facets.ts`. Never change the ML mapping without updating the adapter.

## Key Architecture

**Auth**: Clerk production (`clerk.glowlytics.ai`). Apple uses native iOS flow, Google uses web OAuth. `reconcileAuthUserId` syncs Clerk↔local. `DemoSeeder` auto-loads data for `test@test.com`.

> **App Review constraint:** the `test@test.com` user in Clerk must have **Bypass Client Trust** enabled and **no MFA**. Re-enabling either breaks login for reviewers (Apple rejected v1.0.1 for exactly this — password verified but `status: needs_client_trust` blocked session creation).

**Vision**: `/api/vision/analyze` — L1 deterministic (~100ms) + L2 ONNX (~200ms) + L3 GPT-4o+RAG (~3-5s). Score merge: L2 > L1+L3 blend. See `backend/signal-models.js`.

**MCP server**: `/mcp` exposes 11 user-scoped tools to authenticated MCP clients (Claude.ai). Auth via Clerk JWKS Bearer + beta allowlist + per-user rate limiter (60/min, 10/sec burst). Tools: `get_latest_scan`, `get_scan_history`, `get_signal_trend`, `compare_scans`, `get_scan_report`, `get_current_routine`, `lookup_ingredient`, `search_ingredients`, `summarize_month`, `get_bone_structure`, `get_harmony_trend`. Profile → Connected Apps (Beta) lists + revokes clients via `/api/mcp/clients`.

**Bone structure (Harmony)**: `/api/vision/bone-structure` accepts a captured 3D face mesh (`{ vertices, blendShapes?, source }`) and returns a weighted Harmony composite (0–100) across 6 domains — Symmetry 25, Periorbital 20, Mandibular 20, Midface 15, Nose 10, Brow 10. 16 metrics (canthal tilt, gonial angle, bizygomatic/bitemporal width, facial thirds & fifths, scleral show, eye aperture, IPD ratio, chin projection, nasolabial angle, brow position, …). Sex-aware ideals for `gonial_angle`, `nasolabial_angle`, `brow_position`. Findings map to a three-tier intervention bundle (Lifestyle / Pharma / Procedural) with a strong procedural disclaimer. Persistence via `model_outputs.bone_structure JSONB` (migration v4). Capture: `expo-arkit-face` native module (Swift) for TrueDepth devices; canonical-mesh fallback (`src/services/canonicalFaceMesh.ts` — 32 Hyper3D Rodin-sampled anatomical landmarks via Blender MCP, axis-swapped + symmetry-enforced, ~65 outline edges, 42 triangle faces) keeps the pipeline runnable without a native rebuild. Renderer: `Face3DViewer.tsx` (SVG + JS perspective projection with `w = distance - z2` + x-mirror so the camera renders the front of the face; pan/pinch/orbit; RAF idle auto-rotate; clay-sculpt triangle fills behind the wireframe with painter's-algorithm sort + back-half culling; screen-fixed fake key-light from upper-left; depth-graded edges; revealProgress prop; replaces the old 2D `FacialMesh.tsx`). Bone-results screen always passes the canonical mesh to the viewer because ARKit captures arrive in metres and collapse to a single pixel — the captured mesh's role is the backend metric pipeline only. Results is a 5-page vertical story carousel (hero · by area · measurements · findings · interventions) using `StoryCarousel` primitives. `HarmonyTrendCard` and `HarmonyFocusCard` surface on Today once ≥2 scans exist; `ArchitectureLauncher` in `account.tsx` shows the latest Harmony as a trailing badge; Story tab has a "Facial architecture" section.

> **Stable-ref pattern (load-bearing):** consumers of `s.modelOutputs` that derive arrays or objects (HarmonyTrendCard, HarmonyFocusCard, DomainHistoryStrip, architecture launcher) MUST pull the primitive reference and derive via `useMemo`, not return a fresh array/object from the Zustand selector. v1.1.6 build 116 shipped with the latter pattern and crashed during sign-in when the store churned through user/dailies/modelOutputs/gamification in quick succession (each consumer re-ran its selector, render-stormed the consumer tree). Build 117 (commit `342ed8c`) refactored to the stable-ref pattern with `?? []` / `?.` guards.

**OAuth DCR proxy** (`backend/mcp/oauth-proxy.js`): Clerk has no `registration_endpoint`, so claude.ai's MCP connector can't dynamically register. The proxy fronts Clerk with RFC 7591 DCR + RFC 8414 metadata: `/oauth/register` returns a static pre-registered Clerk `client_id`, `/oauth/authorize` 302s to Clerk with opaque proxy state + our callback URL, `/oauth/token` Basic-auths to Clerk and rewrites `redirect_uri`. Feature-flagged on `MCP_OAUTH_PROXY_ENABLED` + `MCP_OAUTH_PROXY_CLIENT_ID` + `MCP_OAUTH_PROXY_CLIENT_SECRET`; `well-known.js` advertises our backend as auth_server when enabled, falls back to Clerk otherwise. `/mcp` 401 carries RFC 9728 `WWW-Authenticate` with `resource_metadata`.

**API client**: `src/services/httpClient.ts` is the only place fetch is called for backend traffic. Exponential backoff with jitter, honors `Retry-After`, 50s token cache, 401-driven token refresh, `X-Request-ID` on every call, AbortSignal compose polyfill for RN. `src/services/syncOutbox.ts` queues fire-and-forget mutations with up-to-5-attempt retry — replaces the old fire-and-forget pattern that silently dropped writes.

**Design**: See `.impeccable.md`. Background `#FAFAF7`, primary `#3A9E8F` (legacy — Glow accent is `#5A3A5E` dusk plum), WCAG AAA, Switzer font + DancingScript word accent. Signal colors: structure `#7DE7E1`, hydration `#4DA6FF`, inflammation `#FF7A78`, sunDamage `#F2B56A`, elasticity `#B68AFF`. UI surfaces facets (Hydrated/Calm/Even/Firm) but ML pipeline stays on 5 signals.

**Security**: CORS, rate limiting (per-user MCP + per-IP detect/analyze/photo), timing-safe admin secret, cascading deletion (Apple 5.1.1(v)). RAG seed endpoint above JWT wall (admin-secret only).

**Production**: Railway env vars configured (incl. `MCP_OAUTH_PROXY_*`). Pinecone seeded (80 chunks). ONNX models auto-downloaded (pinned to `BDQ-Holdings/glowlytics` HEAD via `signal-models.js` GH_BASE). TestFlight: v1.2.0 (build 1) is the next planned submission after the local-appVersionSource switch in `ba09974`; v1.1.6 build #120 (commit `546efda`, 2026-05-17) shipped the AuthRedirector route-allowlist fix on top of #119 (commits `a6401d5` + `d0e15eb`: Scan Flow + Settings Flow design hand-offs). ASC ID 6760600635 / bundle `com.glowlytics.app`. Repo moved to `BDQ-Holdings/glowlytics` (old `RadianceIQ/glowlytics` remote still works). See [progress.txt](progress.txt) for full build history and [POST_LAUNCH_CHECKLIST.md](POST_LAUNCH_CHECKLIST.md) for post-ship items.

> **AuthRedirector route allowlist (load-bearing):** `app/_layout.tsx`'s `inLoggedInRoute` whitelist gates which top-level segments a signed-in/onboarded user may stay on. Any pushed route NOT in the list triggers the trailing `<Redirect href="/(tabs)/today" />`, producing "screen opens → lags → bounces to Today". Build #120 (`546efda`) fixed this for `settings`, `architecture`, `account`, `routine`, `story`, and `today`. When adding a new top-level app route, append its segment root to this list.

**HealthKit → pattern engine pipeline**: `src/services/healthSync.ts pullLastNDays(n, userId)` pulls 7 signals from HealthKit (sleep total/deep/REM, HRV SDNN, resting HR, steps, mindful, menstrual flow) plus a 90-day-window cycle-day derivation. `useStore.syncHealthData` (2-day delta on foreground + post-scan) and `syncHealthDataInitial` (14-day backfill on first grant) upsert into `healthDailyRecords`, then call `runPatternDetection()`. `patternEngine.detectPatterns` joins health + daily + model-output by date in `buildDaySlices` and runs three detectors: `detectHealthSignalLag` (7 drivers × 4 signals lag-correlations, min N=10), `detectLifestyleSignalCorr` (drinks/stress/sleep_quality from daily logs, min N=14), `detectCycleSignalPhase` (inflammation peak by cycle day, requires female + regular cycle + 1.2 cycles of paired data). The post-onboarding HealthKit grant path in `app/account.tsx` branches: empty `healthDailyRecords` → `syncHealthDataInitial` (14-day backfill); otherwise → `syncHealthData` (2-day). `src/services/healthSync.ts buildHealthkitRollup(records, windowDays)` computes 7-day averages of each signal + most-severe flow + cycle day; `scan/analyzing.tsx` passes the rollup to `streamInsights({ healthkit_context })`, and `backend/app.js buildInsightPrompt` renders a conditional `HealthKit signals` block in the L3 GPT-4o prompt so generated insights can ground pattern-level copy in real averages instead of fabricating trends.
