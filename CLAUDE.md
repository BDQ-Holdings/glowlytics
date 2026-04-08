# Glowlytics - Skin Health Tracking App

## Project Structure

```
cornell-hackathon/
  CLAUDE.md, progress.txt, prd.md
  RadianceIQ/                     # Main app (Expo + React Native)
    app/                          # 48 screens (Expo Router, file-based)
      (tabs)/                     # today, products, camera, reports, profile
      auth/                       # sign-in, sign-up, forgot-password
      onboarding/                 # 7-9 active screens (dynamic per sex/menstrual)
      scan/                       # camera → analyzing → results (story format)
      signal/, skin-metric/, product/, report/, paywall.tsx
    src/
      components/   # 24 files (see §Components below)
      constants/    # theme.ts, signals.ts, lesions.ts, ingredients.ts
      services/     # 21 services + routineBuilder.ts (see §Services below)
      store/        # Zustand (useStore.ts)
      utils/        # localDate.ts, cycleDay.ts, animations.ts
      hooks/, types/, config/
    backend/        # 7 modules: app.js, server.js, db-init.js, rag.js,
                    #   curated-products.js, image-processing.js, signal-models.js
    assets/, ml/
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | React Native, Expo SDK 54, TypeScript strict |
| Navigation | Expo Router (file-based) |
| State | Zustand + AsyncStorage |
| Auth | Clerk (`@clerk/clerk-expo` v2) |
| Subscriptions | RevenueCat v9.12.0 ("Glow Pro", 7-day trial) |
| Analytics | PostHog (posthog-react-native, 20 events) |
| Vision | 3-layer: deterministic + ONNX CV + GPT-4o (`ft:gpt-4o-2024-08-06:personal:radianceiq-skin:DHBaOo20`) |
| Camera | react-native-vision-camera + MLKit face detection frame processor |
| Backend | Express + PostgreSQL + sharp + onnxruntime-node |
| RAG | Pinecone + OpenAI embeddings (77 guideline chunks, signal-filtered) |

## Commands

```bash
cd RadianceIQ
npm start                    # Dev server
npx tsc --noEmit             # Type check
npm test                     # Tests
cd backend && node server.js # Backend
cd backend && npm test       # Backend tests
```

## Code Conventions

- Targeted Zustand selectors: `useStore((s) => s.field)` — never `useStore()` full subscription
- `useStore.getState()` for imperative reads in callbacks
- Shared `scoreColor()` in `theme.ts` — do not define locally (was duplicated 4x, now unified)
- `localDateStr()` in `utils/localDate.ts` — use instead of `toISOString().split('T')[0]` (UTC bug)
- `gateWithPaywall()` in `services/subscription.ts` — shared paywall flow for all scan/report gating

## Scan Flow

Camera → Analyzing → Results (story format)

1. **Camera**: MLKit face tracking, auto-capture after 4s aligned, real-time lesion overlay (YOLOv8 every 350ms), direction indicators, coaching tooltip
2. **Analyzing**: Infinity loop animation, 9-stage pipeline messages, streamed insights, 45s hard timeout, XP overlay
3. **Results**: Paginated story pages (swipe up): Score reveal → Signal bars → Insights/action plan → Deep dive → Done

## 3-Layer Vision Pipeline

`/api/vision/analyze` runs in parallel:
- **L1**: Deterministic (CIELAB, ITA, GLCM, LBP, specular) via `image-processing.js` (~100ms)
- **L2**: ONNX models (structure, hydration, elasticity, lesion YOLOv8) via `signal-models.js` (~200ms)
- **L3**: Fine-tuned GPT-4o + RAG guidelines (~3-5s)

Score merge: L2 > L1+L3 blend. See `backend/signal-models.js` for details.

## Design System

See `.impeccable.md` for full context. Key tokens:
- Background `#FAFAF7` (cream), primary `#3A9E8F` (teal), `scoreColor()` for score-to-color mapping
- 3-tier surfaces: hero (elevated+shadow), standard (glass+border), recessed (surfaceOverlay)
- Signal colors: structure `#7DE7E1`, hydration `#4DA6FF`, inflammation `#FF7A78`, sunDamage `#F2B56A`, elasticity `#B68AFF`
- Typography: Switzer (sans), DancingScript (splash), WCAG AAA contrast

## Components

Key redesigned components (this session):
- `SkinScoreHero`: 104pt animated counter + accent bar — no gauge, no card wrapper
- `FaceAssessmentMap`: Triangulated mesh wireframe, tappable severity markers, metric-colored glow, `React.memo` (428 edges)
- `ProductCard`: Score accent bar (3px left strip), score-tinted bg, `scoreColor()` from theme
- `AnimatedFillBar`: Reanimated shared-value bar, extracted for reuse (results + signal detail)
- Products page: AM/PM/All Day grouping, routine coaching insight, inline add row (no FAB)
- Profile: colored section icons, tier badge (gold/teal/gray), 2x2 personal bests grid
- Metric detail: per-metric personality (acne=coral, sun damage=amber, skin age=blue), color-coded Stop/Consider/Continue guidance

## Important Context

**Architecture**: Vision API key server-side only (30s timeout). `POST /api/vision/detect-lesions` is public + rate-limited. Backend auth: `req.auth.userId` on all user-data endpoints. DB `user_id` is TEXT (Clerk ID).

**Subscriptions**: 7-day trial on onboarding skip. `gateWithPaywall()` handles all gating. RevenueCat Error 23 silenced. Guards on missing API keys (RevenueCat, PostHog).

**Camera**: `useFaceTracking` hook → MLKit GPU frame processor. Thresholds: 20% fill, 15° max angle. On-device lesion detection: confidence 0.1, NMS IoU 0.45.

**State**: 0 TS errors, 48 screens, 24 components, 21 services, 7 backend modules, 448 tests. Splash: "Find your glow" DancingScript reveal, 1.5s min. Tab bar: SVG notch + floating camera.

**Security**: CORS, rate limiting, `safeErrorMessage()`, timing-safe admin secret, cascading account deletion (Apple 5.1.1(v)).
