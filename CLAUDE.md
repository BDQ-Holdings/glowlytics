# Glowlytics — Skin Health Tracking App

## Structure

```
RadianceIQ/
  app/           # 48 screens (Expo Router file-based)
    (tabs)/      # today, products, camera, reports, profile
    auth/        # sign-in, sign-up (Apple native + Google OAuth + email)
    onboarding/  # 8-10 screens (dynamic per sex/menstrual, includes scan-reminder)
    scan/        # camera → analyzing → results (story format)
  src/
    components/  # 24 files
    services/    # 21 services
    store/       # Zustand (useStore.ts)
    constants/   # theme.ts, signals.ts, lesions.ts, ingredients.ts
    utils/, hooks/, types/, config/
  backend/       # Express + PostgreSQL + ONNX + RAG (7 modules)
```

## Commands

```bash
cd RadianceIQ
npm start                    # Dev server
npx tsc --noEmit             # Type check
npm test                     # Tests (448 across 26 suites)
cd backend && npm test       # Backend tests (151 across 7 suites)
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | React Native, Expo SDK 54, TypeScript strict |
| Auth | Clerk v2 — Apple (`useSignInWithApple`), Google (`useOAuth`), email |
| Subscriptions | RevenueCat 9.15.2 ("Glow Pro", 7-day trial) |
| Vision | 3-layer parallel: deterministic + ONNX + fine-tuned GPT-4o |
| Backend | Express + PostgreSQL + Pinecone RAG (80 chunks) on Railway |
| Camera | react-native-vision-camera + MLKit face detection |

## Code Conventions

- Zustand selectors: `useStore((s) => s.field)` — never full subscription
- `scoreColor()` in `theme.ts` — unified score→color mapping
- `localDateStr()` in `utils/localDate.ts` — not `toISOString().split('T')[0]`
- `gateWithPaywall()` in `services/subscription.ts` — all scan/report gating

## Key Architecture

**Auth**: Clerk production (`clerk.glowlytics.ai`). Apple uses native iOS flow, Google uses web OAuth. `reconcileAuthUserId` syncs Clerk↔local. `DemoSeeder` auto-loads data for `test@test.com`.

**Vision**: `/api/vision/analyze` — L1 deterministic (~100ms) + L2 ONNX (~200ms) + L3 GPT-4o+RAG (~3-5s). Score merge: L2 > L1+L3 blend. See `backend/signal-models.js`.

**Design**: See `.impeccable.md`. Background `#FAFAF7`, primary `#3A9E8F`, WCAG AAA, Switzer font. Signal colors: structure `#7DE7E1`, hydration `#4DA6FF`, inflammation `#FF7A78`, sunDamage `#F2B56A`, elasticity `#B68AFF`.

**Security**: CORS, rate limiting, timing-safe admin secret, cascading deletion (Apple 5.1.1(v)). RAG seed endpoint above JWT wall (admin-secret only).

**Production**: Railway env vars configured. Pinecone seeded. ONNX models auto-downloaded. See [progress.txt](progress.txt) for full build history and [POST_LAUNCH_CHECKLIST.md](POST_LAUNCH_CHECKLIST.md) for post-ship items.
