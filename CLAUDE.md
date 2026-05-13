# Glowlytics — Skin Health Tracking App

## Structure

```
apps/
  glowlytics/    # Mobile app (Expo + React Native)
    app/         # 56 screens (Expo Router file-based)
      (tabs)/    # today, reports (→ Story), camera, products (→ Shelf), profile (→ Me)
      auth/      # sign-in, sign-up, forgot-password (Apple native + Google OAuth + email)
      onboarding/# 8-10 screens (dynamic per sex/menstrual, includes scan-reminder)
      scan/      # camera -> analyzing -> results (story format)
      today/     # ritual checklist
      story.tsx, account.tsx, routine.tsx  # split out of tab files for Glow redesign
    src/
      components/    # 31 top-level (.tsx) + glow/ + navigation/ = 37 total
      components/glow/  # GlowIcons, GlowPrimitives (BreathingGlow, GlowRing, GlowSpark, FadeUp)
      services/      # 31 services incl. httpClient.ts, syncOutbox.ts, mcpClients.ts
      store/         # Zustand (useStore.ts) — sync via outbox, not fire-and-forget
      constants/     # theme.ts (incl. Glow palettes), signals.ts, facets.ts, lesions.ts, ingredients.ts
      utils/, hooks/, types/, config/
    backend/         # Express + PostgreSQL + ONNX + RAG + MCP server
      mcp/           # MCP Streamable HTTP transport + tools + auth + rate limiter
      queries/       # reusable scan/routine/ingredient query helpers
  landing/       # Marketing website (Next.js)
research/
  ml/            # Training/data notebooks and model tooling
```

## Commands

```bash
cd apps/glowlytics
npm start                    # Dev server
npx tsc --noEmit             # Type check (0 errors)
npm test                     # Mobile tests (361 across 24 suites)
cd backend && npm test       # Backend tests (285 across 24 suites)
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

**MCP server**: `/mcp` exposes 9 user-scoped tools to authenticated MCP clients (Claude.ai). Auth via Clerk JWKS Bearer + beta allowlist + per-user rate limiter (60/min, 10/sec burst). Tools: `get_latest_scan`, `get_scan_history`, `get_signal_trend`, `compare_scans`, `get_scan_report`, `get_current_routine`, `lookup_ingredient`, `search_ingredients`, `summarize_month`. Profile → Connected Apps (Beta) lists + revokes clients via `/api/mcp/clients`.

**API client**: `src/services/httpClient.ts` is the only place fetch is called for backend traffic. Exponential backoff with jitter, honors `Retry-After`, 50s token cache, 401-driven token refresh, `X-Request-ID` on every call, AbortSignal compose polyfill for RN. `src/services/syncOutbox.ts` queues fire-and-forget mutations with up-to-5-attempt retry — replaces the old fire-and-forget pattern that silently dropped writes.

**Design**: See `.impeccable.md`. Background `#FAFAF7`, primary `#3A9E8F` (legacy — Glow accent is `#5A3A5E` dusk plum), WCAG AAA, Switzer font + DancingScript word accent. Signal colors: structure `#7DE7E1`, hydration `#4DA6FF`, inflammation `#FF7A78`, sunDamage `#F2B56A`, elasticity `#B68AFF`. UI surfaces facets (Hydrated/Calm/Even/Firm) but ML pipeline stays on 5 signals.

**Security**: CORS, rate limiting (per-user MCP + per-IP detect/analyze/photo), timing-safe admin secret, cascading deletion (Apple 5.1.1(v)). RAG seed endpoint above JWT wall (admin-secret only).

**Production**: Railway env vars configured. Pinecone seeded (80 chunks). ONNX models auto-downloaded. TestFlight: v1.1.6 build #106 (2026-05-09). ASC ID 6760600635 / bundle `com.glowlytics.app`. See [progress.txt](progress.txt) for full build history and [POST_LAUNCH_CHECKLIST.md](POST_LAUNCH_CHECKLIST.md) for post-ship items.
