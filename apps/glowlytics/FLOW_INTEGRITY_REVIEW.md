# Flow Integrity Review — 2026-06-10

Deep structural review of six key flows: **onboarding, scan capture, settings UI, sign-in/up & auth, post-scan analysis & results, ritual** — plus the cross-cutting surfaces they share (store persistence, Today hub, paywall/subscription, mobile↔backend contract, backend analysis pipeline).

**Method:** 5 review waves, 17 focused agents (flow reviewers → adversarial verifiers → fresh-lens finders), headline claims re-verified directly against source. Baseline: `npx tsc --noEmit` = 0 errors; test suite = 37 suites / 506 tests, all green. **Every bug below lives under the test-coverage line.**

Branch reviewed: `feature/glowlytics-mcp-server` working tree (incl. uncommitted diffs).

---

## Verdict by flow

| Flow | State |
|---|---|
| Auth / sign-in/up | Core flow works; **cross-account isolation fix (224c7d4) is incomplete** — 4 identity surfaces still bleed |
| Onboarding | Works happy-path; flow-resume, back-nav, and several answers are silently lost or wrong server-side |
| Scan capture | Works; camera/ARKit session lifecycle leaks, bricked-screen state, standalone bone-capture discards results |
| Post-scan analysis/results | Works happy-path; race conditions, hook-order crashes, and the **Harmony math is wrong on every device class** |
| Settings UI | **Largely non-functional mockups shipping as live settings** (delete-account, export, notifications, privacy, skin-profile, help, about-legal, camera) |
| Ritual / Today | Works; date-boundary and key-mismatch bugs make progress display wrong for common cases |

---

## P0 — Ship-blockers / rejection-class

1. **Settings → Delete account never deletes anything** — `app/settings/delete-account.tsx:26-42`: final destructive confirm just does `router.replace('/account')`; promises a "24-hour countdown" that doesn't exist; screen shows fabricated data ("47 scans", "124 MB") for every user. Apple 5.1.1(v) exposure. The real cascade lives in `app/account.tsx:171-203` but nothing connects them.
2. **Privacy screen makes a false claim** — `app/settings/privacy.tsx:33-36`: "Your face never leaves your phone. Photos are processed on-device." Verified false: `visionAPI.ts:86-94` POSTs the full face photo (`image_base64`) to `/api/vision/analyze` → GPT-4o. All 4 privacy toggles are local `useState` wired to nothing. App Review / FTC-grade misrepresentation.
3. **About → all 5 Legal rows are dead** (`app/settings/about.tsx:57-61`, `onPress={() => undefined}`) — functional Terms/Privacy links are mandatory for auto-renewing subscription apps. The URLs exist in `externalLinks.ts`; they're just not wired.
4. **Harmony (bone structure) computes garbage on every device class:**
   - ARKit path: `backend/bone-structure-3d.js:64-67` (mirrored in `src/services/onDeviceBoneStructure.ts:99-102`) — the "ARKit" landmark table is a mislabeled copy of the MediaPipe index set; `tragion_R === zygion_L` (454), canthus labels swapped. Every metric dereferences wrong anatomical points on the 1220-vertex ARKit topology; no error is raised.
   - Non-TrueDepth path: the canonical fallback mesh deterministically scores **Harmony ≈ 32** with 10 findings incl. `nasolabial_obtuse → rhinoplasty_consult` and `canthal_tilt_negative → lateral canthopexy` for **every** user (verified by executing the backend math against the exact mesh the client sends). `captureFaceMesh()` is always called with no args (`analyzing.tsx:494`, `bone-capture.tsx:135`), so `deformCanonicalMesh` is dead code — all non-TrueDepth users of the same sex get bit-identical results.
   - Degenerate input: an all-zero mesh passes validation and scores **78, status "ok"** (`app.js:1295-1299`, `bone-structure-3d.js:201-219`).
   This feature recommends surgical consults off meaningless numbers — pull or fix before it's user-visible.
5. **Cross-account isolation (224c7d4) is incomplete** — four surfaces survive sign-out/account-switch:
   - **Sync outbox**: `resetSyncOutbox` (`syncOutbox.ts:171`) has zero production callers — user A's queued mutations replay under user B's token (verified by grep).
   - **JWT cache**: `clearAuthTokenCache` (`httpClient.ts:82`) never called on sign-out; B's first requests (incl. `hydrateForUser`) can carry A's still-valid token for up to ~55s.
   - **RevenueCat**: no `Purchases.logOut` anywhere; `identifyUser` only runs in the once-per-launch ref-guarded boot effect (`_layout.tsx:303-342`) — so A→B same-launch keeps A's entitlement (B scans free on A's sub), and **a cold-start signed-out → sign-in session never calls `Purchases.logIn` at all** (the ref-guard defeats the `userId` dep).
   - **Analytics**: settings sign-out (`app/settings/index.tsx:66-77`) skips `resetAnalytics()` (account.tsx does it).
6. **Pre-upgrade migration hole re-opens the original bleed** — `useStore.ts:1007` restores `authedUserId ?? null`; every device upgrading from builds ≤ #120 has `null` over user A's data. B signs in → `reconcileAuthUserId` can't detect the switch (`:311`) → claim branch (`:318-342`) stamps A's profile/products/records with B's id **and syncs A's profile to B's backend account**. (Adversarially confirmed; shipped TestFlight builds predate the fix.)
7. **Backend rejects core onboarding data forever:**
   - `age_range`: mobile offers `Under 18`/`55+` (`age-range.tsx:17-24`); backend enum (`app.js:162`) only has `13-17`/`55-64`/`65+`. `POST /api/users` 400s → outbox burns 5 retries → **no server profile is ever created** for those users; every later PATCH 404s, the 404-recovery re-creates and 400s again, forever. Total silent backend data loss for that account.
   - `ALLOWED_USER_FIELDS` (`app.js:190-208`) lacks `skin_goals`, `supplements`, `exercise_frequency`, `shower_frequency`, `hand_washing_frequency`, birth-control fields — those onboarding screens PATCH payloads consisting *entirely* of rejected fields → deterministic 400 ×5 retries → dropped. Answers exist only on-device; gone on reinstall.
   - Bonus: skipping age fabricates `25-34` server-side (`useStore.ts:224`).
8. **`test@test.com` demo-account wipe risk (App Review)** — DemoSeeder seeds via raw `setState` (`_layout.tsx:112-117`), never synced; on reinstall/cold-start-with-restored-Clerk-session, `hydrateForUser` resolves with empty backend arrays and overwrites the seeded data (`useStore.ts:352-366` has no skip-if-empty), and `seeded.current` blocks re-seeding. Can chain into the analyzing-screen infinite spinner (P1 #4). Same class as the v1.0.1 rejection.

---

## P1 — High: crashes, data loss, lockouts

### Store / persistence
9. **In-flight `hydrateForUser` has no identity/cancel guard** (`useStore.ts:359-366`) — resolves after sign-out `resetAll` → resurrects wiped data into store **and disk** (its `debouncedPersist` re-writes after `removeItem`); A→B switch with slow hydrate(A) overwrites B's session with A's data.
10. **Cold-start ordering race** — `reconcileAuthUserId` (`_layout.tsx:348-351`) is not ordered after `loadPersistedData`; if Clerk's cached session wins, reconcile sees a pristine store (fresh-install path), then `loadPersistedData`'s unconditional `set()` clobbers the hydrate with the stale disk snapshot — including a different account's data on shared devices — and reconcile never re-runs.
11. **`healthSyncStatus.in_progress: true` can be persisted and is never cleared on launch** (`useStore.ts:1023`, mutex at `:604-606`) — kill during the 14-day initial pull → every future health sync short-circuits forever. Pattern engine silently dies.
12. **Full ARKit mesh persisted per scan** — `boneStructure.ts:72` stores all 3660 doubles (nothing downsamples despite the name); ~70-100KB/scan into the single AsyncStorage snapshot. Growth → JS-thread stringify jank per mutation; on Android the 2MB CursorWindow limit makes `getItem` fail → caught → **total local data loss presented as fresh install**. Persist failures only `console.log` (`:1092-1094`).
13. **Health upsert replaces good records with all-null ones** — `healthSync.ts` `syncOneDay` returns a record even when every query threw (`partial` computed, never consulted); `upsertHealthDailyRecord` (`useStore.ts:586-597`) wholesale-replaces by date. One transient HealthKit failure permanently destroys that day's local-only data.
14. **Hydration ordering inverts "latest"** — backend `GET /api/model-outputs` is `ORDER BY dr.date DESC` (`queries/scans.js:30-34`) but the client treats `modelOutputs[length-1]` as latest everywhere (`TodayScreen.tsx:26`, `profile.tsx:82-83,127`, `skin-metrics.tsx:27`, `routine.tsx:161`, `bone-results.tsx:61`, `account.tsx:59-66`, `useStore.ts:829`). After reinstall/new device: Today/Profile show the **oldest** scan as current, profile "Glow gained" renders with **inverted sign**, Harmony badge shows the first-ever score. (daily-records comes back ASC — the two arrays disagree.)
15. **Postgres `DATE` serializes as ISO midnight timestamps** (no `pg.types.setTypeParser` anywhere; `db-init.js:59`) vs client `localDateStr()` keys — every equality/map-key join fails for hydrated rows: streak 0, "scanned today" false, day-story can't attach records, pattern engine loses all pre-reinstall pairs.
16. **`daily_id` reconciliation race kills bone-structure persistence** — `analyzing.tsx:488` closes over the client-generated `daily_id`; backend INSERT generates its own (`app.js:1689-1714`, `db-init.js:57`), the outbox remap (`useStore.ts:512-525`) renames store records, and both `attachBoneStructure` and the backend POST (`SELECT … WHERE daily_id`, `app.js:1314`) then miss → `model_outputs.bone_structure` is never written from mobile; the retry reuses the same stale closure. MCP `get_bone_structure`/`get_harmony_trend` return nothing.

### Crashes (Rules-of-Hooks)
17. **`HarmonyTrendCard.tsx:53 vs 67`** — `if (points.length < 2) return null;` before `useMemo`. Crossing 1→2 scans while Today is mounted (async `attachBoneStructure`) throws "Rendered more hooks…" → error boundary. (Confirmed in source.)
18. **`bone-results.tsx:101 vs 330`** — same pattern; background attach while sitting on the empty state crashes.
19. **`results.tsx:246 vs 276/525`** — same pattern, rarer trigger (store cleared/seeded while mounted).

### Scan flow
20. **Standalone bone-capture always discards its result** — both real entry points (`account.tsx:356`, `bone-results.tsx:133` empty state) pass no `dailyId`; `bone-capture.tsx:151` and `boneStructure.ts:81` both skip persistence. First-time users loop capture → empty state forever; repeat users are shown the **previous** scan's result as if fresh (`bone-results.tsx:60-62` falls back to latest output). Also un-gated by paywall (if Harmony is Pro).
21. **Camera session never released under analyzing/results** — `camera.tsx:537` `isActive` has no focus binding; `router.push` keeps it mounted. Then `analyzing.tsx:494` starts an **ARKit session on the same front camera** → iOS session contention; on exactly the TrueDepth devices, in-scan capture likely fails all 15 polls and silently falls back to canonical (compounding P0 #4). Green indicator stays on through results.
22. **Backing into camera bricks it** — `capturing` never reset on the success path (`camera.tsx:412-452`); results allows swipe-back (`results` has no `gestureEnabled:false` in `scan/_layout.tsx`) and `router.back()` from its empty state → capture button disabled, tracking off, permanently.
23. **Analyzing: signed-in user with null `protocol` = infinite spinner with Android back blocked** — main effect bails on `!user || !protocol` (`analyzing.tsx:605`) so the 45s hard timeout never arms; the 5s bail-out only covers missing user (`:572`); back handler returns true while `error===null` (`:594`). Reachable: `hydrateForUser` **nulls a locally-persisted protocol on one transient fetch failure** (`useStore.ts:354,362` `.catch(() => null)` + unconditional set).
24. **Late-API navigation hijack** — after the 45s timeout + user leaves, the in-flight `.then` (`analyzing.tsx:757-775`) has no aborted/unmount guard; `runPostApiStages` schedules fresh timers post-cleanup and `persistAndNavigate` `router.replace('/scan/results')` teleports the user from wherever they are, silently persisting a scan they saw fail. Related: `handleRetry` (`:811-831`) can't cancel the old attempt — duplicate paid backend call, raced result.
25. **Results page renders the raw ARKit mesh** — `results.tsx:417` passes `downsampled_mesh.vertices` (metres) to `Face3DViewer`, violating the documented canonical-mesh rule; on TrueDepth devices pages 4-5 render a dot/blob with lesion markers floating detached. (`bone-results.tsx:141-149` documents exactly why this is wrong.)
26. **Lesion-detect loop fires `takePhoto()` ~3×/s with shutter sound on** — `camera.tsx:315` + `setInterval(detect, 350)` (`:378`); vision-camera 4.7.3 defaults `enableShutterSound: true` (verified in node_modules). Repeated clicks for the whole framing session on ringer-on devices; cannot be silenced in JP/KR. Also bare `fetch` to backend (`:291`, `:146`) — no retry/backoff/request-ID, 429s silently swallowed while the loop hammers a per-IP limited endpoint.
27. **Streamed insights attach positionally to `modelOutputs[length-1]` at resolution time** (`analyzing.tsx:398-457`) — a second scan before the first stream resolves gets scan #1's insights stamped onto scan #2's record. In no-backend builds the ordering bug is synchronous and corrupts the *previous* scan unconditionally (`:458-464`).
28. **SSE parser drops chunk-boundary lines** — `visionAPI.ts:204-225` has no carry-over buffer; split `data:` lines are discarded → intermittent silent downgrade of real GPT-4o insights to local templates. (Backend framing is fine; fix is a line buffer or re-parse in `onload`.)

### Paywall / subscription
29. **`NOT_PRESENTED` treated as failure** — `subscription.ts:162` returns `PURCHASED || RESTORED` only; `presentPaywallIfNeeded` returns `NOT_PRESENTED` precisely when the user is **already entitled**. With stale local state (reinstall, the RC-identify gap in P0 #5), gate returns false → paying subscriber taps scan FAB → silent nothing (`(tabs)/_layout.tsx:30`), or camera pops (`camera.tsx:93`). The uncommitted onboarding-paywall diff fixed this case locally but not in the shared service.
30. **Onboarding unfinishable when RC can't present** — paywall is the terminal step; after the uncommitted diff there's no escape on `ERROR` (silently swallowed dead button, `onboarding/paywall.tsx:161`) or `CANCELLED`, and `:142` calls `RevenueCatUI.presentPaywallIfNeeded` **without the `env.REVENUECAT_API_KEY` guard** every other entry point has — unconfigured Purchases throws on every tap.
31. **Local trial auto-grant contradicts the uncommitted Apple-3.1.2 fix** — `useStore.ts:1043-1051` still `startTrial()`s any persisted user without trial dates on cold start (no StoreKit involved); `startTrial()` on RESTORED/PURCHASED (`onboarding/paywall.tsx:148-151`) fabricates 7-day windows for paid users (refund inside 7 days still scans via `isTrialActive`); re-trial is purely local (`resetAll` wipes it → sign-out/in = fresh 7 days indefinitely). The updated tests assert `createUser` (which never auto-trialed) and skip `loadPersistedData`, where the violation lives — suite stays green while the bypass ships.
32. **`/paywall` dead for the session after one failed offerings fetch** — `_paywallReady` set only in `initRevenueCat` (`subscription.ts:84-89`); `paywall.tsx:50` `if (!ready && !summary) return;` never refetches. Launch offline → "try again later" forever. No restore path in the fallback state.
33. **`PaywallDisclosure` hardcodes "7-day free trial, then {price}"** for users who already consumed the trial (no `introPrice` eligibility check) — the 3.1.2(a) accuracy problem the diff aims to fix. RC failure = silent hard-lock at every gate (`subscription.ts:235-237` swallows; call sites bare-return).

### Onboarding / auth
34. **Persisted onboarding flow discarded on every cold start** — `useStore.ts:999-1001` rebuild condition checks `!restoredFlow.includes('products')`, but `buildOnboardingFlow` never emits `'products'` → always rebuilds (dropping the `healthSyncedCycleDetected` arg), re-inserting menstrual screens HealthKit already answered and desyncing the persisted index → resume lands on the wrong screen.
35. **`router.replace` in sex/menstrual breaks `goBack()`** (`sex.tsx:111,126`, `menstrual.tsx:105,123` vs `useOnboardingNavigation.ts:22-27`) — back from the next screen decrements the flow index but reveals a different screen; sex/menstrual become unreachable to edit; progress dots desync; Continue then skips a screen.
36. **Re-pressing "Let's go" on welcome wipes the profile** — `welcome.tsx:121-128` unconditionally `createUser` → defaults; loses sex/age/menstrual + granted `health_connection`.
37. **AuthRedirector sends a returning user into onboarding while hydrate is in flight** — no "hydrating" gate (`_layout.tsx:128,174-181`); offline = forced re-onboarding of an existing account; tapping through can overwrite their server profile.
38. **`oauth-native-callback` is an inescapable spinner** when the deep link fires but session creation fails (trust-gate, expired ticket) — `oauth-native-callback.tsx:5-13` has no timeout/error/back; AuthRedirector holds `!isSignedIn` there forever (`:168-169`).
39. **Sign-up verification non-`complete` status silently swallowed** (`sign-up.tsx:581-589`, no else) — correct code + trust-gate = spinner clears, nothing happens. The 14b5c57 sign-in fix wasn't mirrored.
40. **`complete-signup` opens on "We sent a 6-digit code" without sending one** — `complete-signup.tsx:298,320`: `unverifiedFields` seeds the OTP step from route params, but neither caller ever calls `prepareEmailAddressVerification`; first send only happens on "Resend code".
41. **Account deletion edge** — backend 404 aborts before Clerk deletion (`app.js:1491-1493`) → users whose profile row never made it server-side (see P0 #7) **can never delete their account** (5.1.1(v)); and the client ignores `clerk_deleted` + swallows `signOut` throw (`account.tsx:186-190`) → a half-deleted signed-in user is dropped into onboarding, resurrecting the identity.

### Today / ritual
42. **Today's ritual card reads wrong keys + marks rows by index** — `DayPage.tsx:66-73,211` hardcodes `:am` for the first 3 shelf products and strikes the first N rows; PM completions never show; counts disagree with the ritual screen (which includes habit steps and the `end_date` filter).
43. **Ritual screen date frozen at mount; writes go to tap-time date** (`ritual.tsx:38,40` vs `useStore.ts:691-692`) — open across midnight: taps silently toggle *tomorrow's* record while the UI reads yesterday's; checkbox never moves. Same staleness in `dayModel`/`DayPager` (memo keyed only on data) and `home.tsx` past-day pages route to `/ritual` with no date param → back-filling Monday stamps **today**.
44. **DailyQuoteRouter hijacks active flows after midnight** — exclusion list (`_layout.tsx:213-215`) lacks `scan` (and everything else); corrected repro: any non-first launch of the day (quote already seen → `routedRef` false) kept open past midnight → next navigation, including into an active scan, gets `router.replace('/quote')`, destroying the in-flight analysis. Also clobbers deep-links/notification taps twice (`/quote` replace + dismiss → always Today), and the seen-date is stamped at *dismiss* time (`quote.tsx:65,91`) so a cross-midnight dismissal eats the new day's quote.
45. **Streak resets to 0 every morning until first scan** — `useStore.ts:807-824` walk starts at today and breaks immediately; flame chip vanishes overnight.
46. **Repeat scans same day duplicate dailyRecords + farm XP** — `addDailyRecord` has no upsert by date; each re-awards full streak-bonus XP. (Backend dedupes via `ON CONFLICT (user_id, date)` — local store doesn't.)
47. **Harmony Today surfaces are dead** — `HarmonyFocusCard` imported nowhere; `HarmonyTrendCard` only in `app/story.tsx`, and nothing navigates to `/story` (reports tab `href: null`). The documented "surface on Today once ≥2 scans" behavior no longer exists.
48. **DayPager first frames invisible** — `scrollX` shared value starts 0 while list mounts at index 13 → today's page renders at opacity 0 until first scroll event (`DayPager.tsx:95,141,172-183`). Init to `todayIdx * width`.

---

## P2 — Medium: broken settings screens, wrong displays, races

### Settings screens are mockups (beyond P0 items)
49. **Notifications screen controls nothing** (`settings/notifications.tsx:17-29`) — 10 local-state toggles; the *real* daily reminder (scheduled from onboarding/account) keeps firing after "off"; hardcoded "7:30 AM" and `Push permissions: Allowed` regardless of OS state.
50. **Skin-profile edits silently discarded** (`settings/skin-profile.tsx:37-41,106`) — seeds hardcoded local state (never reads the store), "Save changes" has **no onPress**; "Brooklyn · May" environment shown to everyone.
51. **Export screen dead** (`settings/export.tsx:126`) — "Request export" has no onPress; literal `you@email.com`; fabricated sizes. It's also the delete-flow's "export first" off-ramp.
52. **Help: Send discards the message** (`settings/help.tsx:76-82`, no onPress); FAQ rows `() => undefined`; "Email a person" row isn't pressable (no mailto).
53. **Camera settings: "Delete all photos" (danger) is inert** (`settings/camera.tsx:94-98`, no onPress → renders as static View); stats/toggles fake.
54. **Settings hub hardcodes `v1.1.6`** (`settings/index.tsx:182`) vs app.json 1.2.0 — contradicts the About screen it opens.
55. Settings sign-out swallows `signOut()` throw silently (no feedback) — `settings/index.tsx:66-77`.

### Account screen
56. **HealthKit "Connected" shown even when all toggles denied/revoked** — `healthPermissions.ts:118-137` returns granted when the dialog completes; the documented downstream inference is implemented nowhere; UI renders the persisted flag forever.
57. **Any connect error permanently hides the Health card** — catch sets `status:'unavailable'` (persisted) for *any* error (`account.tsx:253-260,467`) while the alert says "try again" — no retry affordance ever returns.
58. **"Last synced" shows the last *attempt*** — store catch sets `last_sync_at` on failure (`useStore.ts:633`); `last_success_at` exists unused; `last_error` never surfaced.
59. **iOS reminder spinner: unserialized cancelAll/schedule per detent** (`account.tsx:542-553`) — interleaving can leave duplicate reminders at stale times.
60. **`scheduleDailyReminder` silently no-ops on denied permission** (`notifications.ts:20-24`) but callers set `notifications_enabled: true` anyway — UI claims an active reminder that never fires.
61. Connected-apps error copy says "Pull to retry" — no RefreshControl exists (`ConnectedAppsSection.tsx:43`).

### Onboarding details
62. **Scan-reminder: denial swallowed** (`scan-reminder.tsx:59-68`) — advances exactly like success; no settings link; user believes a reminder exists. **Android:** the `DateTimePicker` modal ambushes on mount and can never be reopened (`:92-100`) — stuck with 8:00 AM.
63. **Camera-permission: blocked state unhandled** (`camera-permission.tsx:131-137`) — previously-denied users silently advance marked denied; no `canAskAgain` check, no try/catch.
64. **"Prefer not to say" menstrual recorded as `period_applicable:'no'`** (`menstrual.tsx:90`) though backend accepts `'prefer_not'`; Skip leaves stale prior answers feeding cycle-pattern detection (`patternEngine.ts:304`). Intersex/Other hard-sets non-menstruating (`sex.tsx:99`).
65. **Multi-goal selection silently narrows to first-tapped goal's region** (`skin-goal.tsx:222-230`) vs copy "we'll tailor… to all of them".
66. **health-permission (uncommitted): UTC date lookup** — `toISOString().slice(0,10)` (`:325-327`) vs records keyed by `localDateStr` → wrong success-state/cycle-day after ~4-7pm US time; auto-advance timer not cancelled on manual Continue → duplicate scan-reminder push (`:366-370,423-434`); availability-check `advance()` lacks the `mountedRef` guard → second double-advance path (`:215-234`).
67. **`goBack()` decrements with nothing to pop** (`useOnboardingNavigation.ts:22-27`, no `canGoBack`) — deep-link resume + back chevron desyncs index. Flow/index mutations never persisted on their own (`useStore.ts:298-299`) — kill after a Skip resumes on an answered screen. `cycle-details` accepts `2026-13-45`/future dates (`:82`).

### Auth details
68. Google OAuth back-gesture shows raw "OAuth flow dismiss" (`sign-in.tsx:101-103,559`; `oauthCompletion.ts:171` only matches /cancel/i).
69. Forgot-password: signs the user in then navigates to sign-in (`forgot-password.tsx:96-100`, redirect-flash); non-complete statuses (incl. `needs_second_factor`) collapse to a generic message — MFA users can never reset and aren't told why; no resend on the code step; back abandons the flow.
70. Sign-up "Resend code" has no busy guard (`sign-up.tsx:599-610`; `disabled={loading}` is dead) — double-tap invalidates the first code.
71. `complete-signup` Continue looks enabled while functionally disabled (`:383-387`).

### Backend pipeline
72. **Server L3 timeout 30s vs mobile 15s + retry** (`app.js:878` vs `visionAPI.ts:107-108`; no `req.on('close')`/AbortSignal) — up to 2 ghost GPT-4o calls per scan, both consuming the user's 10/min budget → legit retries 429.
73. **No `trust proxy`** — `req.ip` is Railway's edge for everyone; the 10-per-10s `detectRateLimit` is a single global bucket: any concurrent usage 429s the live camera lesion overlay and product search.
74. **Prompt injection** — `context.*`, Shelf product names, and the entire client-supplied `rag_context` are interpolated into GPT-4o system prompts as trusted "clinical guidelines" (`app.js:794-796,1093,1128-1145`); no length caps (20MB body limit).
75. `/api/vision/generate-insights` has **no rate limiter** (`app.js:1166`) — unlimited GPT-4o streaming per authed user.
76. **EXIF orientation never applied** (no `.rotate()` in any sharp pipeline) — L1 ROIs and YOLO zone mapping compute on rotated pixels for typical iOS JPEGs; L1/L2 silently disagree with L3.
77. Acne "confirmed" tier at 8% confidence (`signal-models.js:332-335`) vs documented 0.30 — phantom lesions drive penalties and clinical copy.
78. Partial `client_signal_scores` defaulted to 50 at the dominant 0.9 beta (`app.js:708-725`); `client_lesions: []` **erases** server detections (`:843-846`, assignment not merge).
79. Non-idempotent POSTs retried at two layers with no server dedupe — `model_outputs` has no unique constraint on `daily_id` → duplicate rows per scan surfacing in history/MCP.
80. Hydrate asks 365 days but scan history is silently capped at 90 (`app.js:1790`, `queries/scans.js:8,27`) — older analyses permanently lost client-side; days with records but no scores.
81. Client never sends `user_profile`/`products` to generate-insights though both sides support them (`analyzing.tsx:424-439`) — product guidance is always generic.

### Misc lifecycle
82. Camera paywall-gate IIFE: trailing `router.back()` after unguarded await can pop a different screen (`camera.tsx:86-96`).
83. In-flight detection `takePhoto` races the capture `takePhoto` (`detectingRef` not consulted by `handleCapture`) → "capture in progress" rejection swallowed → capture silently does nothing (`camera.tsx:309-386,412-462`). Auto-capture timer vs manual tap double-fire window is real but ~one frame (ref-based guard closes it).
84. `faceMeshCapture.ts:53-72` missing `finally` for `stopTracking` (latent ARSession leak; Swift `captureFrame` currently never rejects); Swift delegate never clears `latestAnchor` → first poll after restart can return the previous session's face (shared-device).
85. `syncHealthDataInitial` lacks the reentrancy mutex its sibling has (`useStore.ts:641-647` vs `:604-606`).
86. Gamification is device-local only (no API, not hydrated) — reinstall resets XP/level and re-awards scan-count badges with fresh timestamps.
87. Schema-evolution hazard: `gamification`/`healthSyncStatus`/`notificationSettings`/`patternNotifications` restored whole-object with no field-level default merge — future fields read `undefined` → NaN XP persists (`:843`). #11 is the live instance.
88. Reconcile claim path doesn't remap `healthDailyRecords.user_id` (`useStore.ts:325-331`).

---

## P3 — Low / polish

89. zone-detail sparkline divides by zero for 1-point series → NaN SVG path; `Number(params.score)` unvalidated → "NaN/100" hero (`zone-detail.tsx:115,157,168`). "See the pattern →" primary CTA is just `router.back()` (`:286-294`).
90. face-map zone colors hardcoded (always shows forehead as "Glowing" regardless of scores) + unconditional "You look well-rested" (`face-map.tsx:156-167,235-259`) — exact pattern zone-detail's own comment says was removed.
91. FacialStructure hero hardcodes "softly tapered" beside a computed jawline that can read "Round" (`FacialStructure.tsx:364,393-398`).
92. ActionCard sources chip claims "AAD · ACOG · WHO" but always opens the AAD acne URL, on every driver (uncommitted diff).
93. bone-capture reveal RAF spins at 60fps on the error stage (stale-closure exit, `bone-capture.tsx:106`).
94. Appearance unsupported-device copy says the icon choice is saved; `setAppearance` reverts it (`appearance.tsx:401-404` vs `useStore.ts:724-729`).
95. delete-account header claims "Step 2 of 3" (no steps exist); "Pause for 30 days" is a back button; reason chips discarded.
96. Account avatar can render a digit (falls back to `age_range[0]`, `account.tsx:274`); email rendered with `textTransform:'capitalize'` (`:316,781`).
97. Free-scan limit is dead code (`incrementFreeScansUsed` never called; `canScan` ignores it); backend fully trusts client-PATCHed trial dates (no receipt validation) and nothing server-side gates the paid L3 path.
98. Seven orphaned onboarding screens (products/supplements/exercise/…) + dead `TodayScreen.tsx`; `_checkin/_processing` dead code (the latter injects mock data if ever resurrected); `onboardingStep` is a write-only store field.
99. account.tsx upgrade/restore buttons lack in-flight guards (stacked alerts on double-tap).
100. Quote flow: cold-start deep-link destination discarded by the quote interstitial chain (by-design-ish, noted).

---

## Verified-clean highlights (checked, not bugs)

- AuthRedirector allowlist: `quote`, `scan`, `ritual`, `routine`, `settings` all present; every settings/account `router.push` target exists.
- No fresh-array/object Zustand selector violations anywhere in the reviewed flows (the build-116 crash class) — the new crash class is conditional hooks (#17-19).
- Backend authz is sound: every user-scoped route compares the path param to the verified token `sub`; writes derive `user_id` from the token.
- `mergeSignalScores` math is NaN/zero-beta safe; L2/L3 failures degrade gracefully; no-LLM fallback shapes match the client parser; healthkit_context fields match 1:1.
- httpClient 401 single-refresh guard correct; complete-signup mid-kill recovery exists; splash correctly gates on `appReady && clerkLoaded`.
- tsc 0 errors; 506 tests green (they exercise none of the above paths).

## Wave 6 addendum (fresh-angle re-sweep)

### P1
101. **HealthKit cycle-skip defeated by stale closure** — `health-permission.tsx:302-307,366-370` + `useOnboardingNavigation.ts:15-20`: after `setOnboardingFlow(newFlow)` (menstrual screens removed), the auto-advance timer fires the *render-time* `advance` closed over the **old** flow → pushes `/onboarding/menstrual` anyway for every cycle-detected female user (the feature's target case); index now points at scan-reminder (dots desync), and answering menstrual rebuilds the flow *without* the cycle flag, letting manual guesses overwrite HealthKit-derived cycle data.
102. **Sign-up "Continue with Google" is invisible** — `sign-up.tsx:929-947,746`: label, icon, and spinner all use `Glow.palette.surface` on a surface background (light *and* dark palettes) → unlabeled blank pill for every new user. Sign-in got it right (`ink`).
103. **`method.tsx` ("How we read this", from face-map) is 100% fabricated provenance** — hardcoded "16 zones · 2.4s · 13 of 14 check-ins · Sleep 7h 20m from Apple Health" shown identically to everyone (`method.tsx:20-42`), plus a second false "We never share your photos. They live on your phone." claim (`:126`) — same class as P0 #2, missed surface.

### P2
104. **Pattern engine direction copy inverted for every signal** — `patternEngine.ts:272` (`r > 0 ? 'is worse' : 'improves'`) ignores the 100-=-optimal score convention → every lifestyle card asserts the inverse of the measured relationship ("inflammation improves … with higher alcohol"). Same class: `:181` 'rises/drops with' wrong for the inflammation label.
105. **Cycle detector names the calmest day as the inflammation peak** — `patternEngine.ts:336-343` takes the **max** mean inflammation *score* (= least inflamed) as "peak"; should be min.
106. **Lag correlations computed over sparse array indices, not calendar days** — `patternEngine.ts:71-79` pairs entries N *slots* apart; gaps (scan-day-only records, 2-day delta sync holes) make "drops 2 days after" claims untested by the math.
107. **zone-detail trends derive from `scanner_indices` that are always `{0,0,0}`** — camera passes only `photoUri` (`camera.tsx:449`), analyzing defaults the indices to 0 (`analyzing.tsx:654-660,376`); `computeSignalHistory` (`skinInsights.ts:495-508`) never reads real `signal_scores` → sparkline/"range this fortnight"/trend verdict are fiction contradicting the hero score on the same screen; also corrupts `buildOverallSkinInsight`'s baseline.
108. **Stale `pendingLesions` stamped onto the next scan** — error/bail paths in analyzing clear the photo but never `setPendingLesions(null)` (`analyzing.tsx:795,858,591`) → a later scan with zero detections sends and locally attaches the *previous* scan's lesions (`analyzing.tsx:733,359-364`).
109. **Routine conflict detection skips `both`-schedule products** — `routine.tsx:216-220` only scans the AM and PM buckets; `'both'` products (applied twice daily) are never passed to `detectConflicts` → retinol-"both" + AHA-"PM" never flagged.
110. **Sign-up verification step has no escape for a mistyped email** — `sign-up.tsx:622-680`: no back/change-email affordance, `pendingVerification` never resets, sign-up is the only stack entry (footer uses `router.replace`) → kill the app or verify a wrong address.
111. **OS back (Android hardware / iOS swipe) pops onboarding screens without decrementing the flow index** — no back-handler/gesture lock in `app/onboarding/` → next Continue skips a screen (e.g. camera permission never requested); mirror of #67, different trigger, not fixed by its guard.

### P3
112. Analyzing shows fabricated "live findings" chips ("No new redness", "Hydration +4") on every scan regardless of outcome (`analyzing.tsx:208-213,886-901`).
113. Capture quality gate is a hardcoded pass — `photoQuality.ts:108-124` returns `overallPass: true` unconditionally; the real `checkPhotoQualityFromFaces` has zero callers; Retake UI is dead code; `scanner_quality_flag: 'pass'` always → clinician report "confidence rate" is always 100%.
114. Scan photos stored as absolute `documentDirectory` URIs — iOS container UUID changes on every app update → all stored `photo_uri`s dangle; clinician reports silently ship without photos (`camera.tsx:48-55`, `analyzing.tsx:279-294`, `report/generate.tsx:102-108`); cleanup deletes files at 90 days while records keep URIs 365.
115. Routine screen renders **0/100 + "Time to edit"** when `protocol` is null (`routine.tsx:176,143`) — reachable via #23's protocol-nulling; a no-goal state shown as a failing grade.
116. DayPage pattern card "See the evidence →" has no `onPress` (`DayPage.tsx:178`) — with the Story tab dead (#47), pattern detail is unreachable from the live UI.
117. `resolveMedicalSourceUrl` first-match ordering opens wrong guidelines — "WHO UV index" → AAD sunscreen; "AAD" → acne page; ACOG pregnancy → menstrual infographic (`externalLinks.ts:11-45`; consumed by ClinicalSourcesCard "Open source").
118. Appearance: "Serif italics" toggle has zero consumers (persists, renders nothing); **every appearance tap remounts the entire app tree** — `AppearanceHost.tsx:127` keys the root Fragment on `version` → backstack state/scroll lost per tap, and `DailyQuoteRouter.routedRef` re-arms (another #44 trigger).
119. "Member since" reads `(user as any).created_at` which is never set (always hidden) — `settings/index.tsx:54-60`, `profile.tsx:72-78`; settings hub labels active trialists "Free plan" (`settings/index.tsx:62-63`) contradicting account's "Trial".

## Wave 7 addendum

### P1
120. **Appearance switching (dark mode + Meadow/Rose) structurally broken across ~30 surfaces** — `applyPalette` mutates `Glow.palette` in place (`appearance.ts:199-201`) and relies on the AppearanceHost remount, but every module-scope `StyleSheet.create({ … P.ink … })` baked the *values* at module evaluation and never re-runs (remount ≠ re-evaluate). 30 files bake `P.*` statically: the entire settings suite (SettingsPrimitives + all screens), the entire Today day-story (home.tsx, DayPage, CalendarStrip, FacialStructure), ScanAtoms, Pattern/Product cards, share cards. Repro on the appearance screen itself: tap Dark → live text flips to near-white ink while the baked `SettingsPage` background stays cream → illegible. Dark-on-light patchwork app; invisible controls (DayPage share button white-on-white). Cold start with persisted dark is equally broken (modules evaluate before async hydration).

### P2
121. **Sign-up "Resend code" countdown freezes forever after first resend** — `sign-up.tsx:318-335` interval clears itself at 0 and `handleResendCode` (`:599-610`) sets `countdown=60` without re-arming any interval → footer reads "Resend code in 60s" permanently; combined with #110, hard lockout.
122. **health-permission consent copy false** — `health-permission.tsx:455` "never shared with third parties" while the HealthKit rollup (incl. menstrual flow + cycle day) is interpolated into the GPT-4o prompt (OpenAI = third party). Apple 5.1.3 territory. Same class: `camera-permission.tsx:148,181-183` "Photos are processed privately and never shared" / "Photos stay yours".
123. **`buildOverallSkinInsight` trendDelta compares two different formulas** — latest uses server `signal_scores` (`skinInsights.ts:242-249`) but baseline always re-derives locally from proxy indices (`:269-278`; `baselineOutput.signal_scores` never read) → with ONE scan, latest===baseline yet delta≠0. profile.tsx works around it manually; results/skin-metrics/SkinScoreHero/routine/products/story/signal/product all use the broken path → fabricated ± deltas and "Damage noted, increase scans" copy.
124. **Acne card tells users to stop an arbitrary product** — `skinInsights.ts:198-207,361-363`: `'oil'` substring flags "Oil-Free" products; no match → falls back to the most recently added product → "Stop using {your sunscreen} for 7 days" with clinical confidence. Surfaces at `skin-metric/[metric].tsx:245` whenever GPT guidance is absent (stream failure #28, no-LLM builds).
125. **Ingredient matcher `'pha'` substring false-positives** — `routineBuilder.ts:42` raw `includes`; `'pha'` matches "…phosphate", "Alpha-Isomethyl Ionone", "sulphate" → fragranced moisturizers classed as AHA/BHA → bogus "Retinoid + AHA/BHA" conflict cards and toner mis-categorization corrupting smart ordering (`ingredients.ts:114,154`).
126. **First pattern-unlock fires a raw OS notification-permission prompt mid-session** — `patternNotifications.ts:18-21` calls `requestPermissionsAsync()` directly from `runPatternDetection` (post-scan/foreground sync) → system dialog with zero context right as results appear. Also: notification deep-link data has no response listener anywhere → tap performs no routing.

### P3
127. Sign-in Google spinner `#FFFFFF` on near-white surface (`sign-in.tsx:696,887`) — invisible during the whole OAuth handoff (#102 covered sign-up's label/icon; the sign-in spinner is the same class). Dark-palette hardcoded hexes also blank several auth spinners/labels in the remote-session-expiry path.
128. Sign-up verification code not trimmed (`sign-up.tsx:581-583`) — pasted codes with whitespace fail; both sibling screens trim. Sign-up + forgot-password OTP fields lack `textContentType="oneTimeCode"` (complete-signup has it).
129. Clinician PDF builder has zero HTML escaping — `reportHtml.ts:92-93` interpolates user/OCR product names + ingredients raw; "<1%" swallows the row; arbitrary markup flows into a clinician-facing PDF.
130. Report window + dates computed in UTC (`report/generate.tsx:68-70,86` `toISOString()`) — evening US users get a future-dated PDF/filename/email and the oldest local day silently dropped from the window.
131. Results "What to do" page: `action`/`supportingText` have no `numberOfLines` (`ActionCard.tsx:62-64`) on a fixed-height non-scrolling story page → long GPT summaries overflow into the Apple-1.4.1 disclaimer bar on SE-class devices.
132. Weekly challenges are dead code seeded only on the demo account — `generateWeeklyChallenges` has zero callers; progress/`completed` never written; `challenge_completed` XP unreachable; reviewers see a frozen progress bar (`useStore.ts:916-926`, `demoData.ts:257-259`). `sunscreen_champion`/`perfect_week` check 7 most-recent records, not consecutive days.
133. Ritual SPF habit: name-substring detection only (`ritual.ts:15-20`) → unlabeled sunscreens get a duplicate synthetic SPF row; a PM-scheduled SPF suppresses the *morning* habit (`:40`). Ritual copy says add/remove affects "tomorrow's ritual" but steps derive live from `products` → today's ring changes instantly (`ritual.tsx:83,258,39`).

## Wave 8 addendum

### P1
134. **Live lesion overlay geometrically wrong on iOS** — bboxes are normalized against the EXIF-upright image (`onDeviceLesionDetection.ts:180,396-406`) but `LesionOverlay` cover-fit uses `photo.width/height` from VisionCamera EXIF = raw **landscape** buffer dims (`camera.tsx:322-325,558`; verified in PhotoCaptureDelegate.swift) → horizontal positions/widths scaled ~1.78× around center; off-center lesions draw off-face or are culled entirely while the "N detected" badge still counts them.

### P2
135. **Face-alignment hints are perpendicular/flipped** — MLKit face bounds arrive in sensor-landscape buffer space (plugin non-autoMode returns raw coords); `useFaceTracking.ts:49-52` mirrors the wrong axis and `analyzeAlignment` (`faceTracking.ts:79-86`) emits "Move left/right" from the vertical axis and vice versa → guidance steers misaligned users the wrong way.
136. **Full-res photo uploaded as ~3-5MB base64 against a hard 12s race** — `visionAPI.ts:56-63` no resize (the camera detect loop resizes to 640px "~100KB vs 4MB"; backend downsamples to 256px anyway); on slow uplinks L3 deterministically times out → template insights while the paid GPT-4o call still burns server-side; the raced-out promise has no rejection handler → unhandled rejection.
137. **Native Apple sign-in cancel shows a failure error + fires fabricated `auth_sign_in_failed`** — Clerk's iOS hook swallows `ERR_REQUEST_CANCELED` and returns a null session (verified in node_modules); `ensureOAuthSession` then throws the generic "Sign-in couldn't finish" which doesn't match the cancel regex → error + shake + bogus analytics on every Apple-sheet back-out, both sign-in and sign-up (`sign-in.tsx:192-217,500-522`, `sign-up.tsx` mirror). The `isAppleAuthCancelError` guard is dead code on iOS. Dirty-signUp variant routes cancels into complete-signup.
138. **Barcode scanner goes dead for a barcode after one failed lookup** — `AddProductSheet.tsx:230` dedup ref never cleared on failure paths or barcode-mode re-entry; re-scanning the same product silently does nothing until the sheet is closed (`:241-253,323-331`).
139. **Product detail's "Re-order from {brand}" and "Pause for a week" CTAs have no `onPress`** (`product/[id].tsx:445-458`) — mockup-shipped-live class on a new surface; "pause" feature doesn't exist anywhere.
140. **Account deletion never mentions the active auto-renewing subscription** — no warning, no `apps.apple.com/account/subscriptions` link anywhere in either delete flow (grep: 0 hits) → deleted users keep getting billed; App Review guidance gap adjacent to 5.1.1(v).

### P3
141. Onboarding "Continue" has no double-tap guard — `advance()` re-entrant during the 400ms fade → index +2, a question screen (incl. camera-permission) silently never shown (`useOnboardingNavigation.ts:15-20`).
142. `onboarding_paywall_trial_started` fires before/regardless of outcome (every retry tap), and the NOT_PRESENTED success path skips `onboarding_paywall_purchased` → funnel fiction both directions (`onboarding/paywall.tsx:137-161`).
143. Shelf header: `spelledCount(workingCount || products.length) + ' things working'` — zero working products renders "Five things working" (`products.tsx:88,111-113`).
144. Pattern detail "The evidence" chart labels bars Mon-Sun by array index, ignoring the real `date` field; cycle-day points get weekday labels (`pattern/[id].tsx:78-79`).
145. ShareSheet Pattern card defaults to a fabricated "+11 points in three weeks" stat for every pattern-less user (`ShareSheet.tsx:322-323`, `home.tsx:64,77`).
146. Every settings `Toggle` is an unlabeled "switch, off" for VoiceOver (no accessibilityLabel, label/switch nodes never merged; 34pt target) — `SettingsPrimitives.tsx:155,183,189-201`; on the appearance screen a blind user can't tell Dark mode from Serif italics.

## Wave 9 addendum

### P2
147. **On-device camera lesions never carry a `tier`, so every `tier === 'confirmed'` consumer silently discards them** — the YOLO detector emits class/confidence/bbox/zone only (`onDeviceLesionDetection.ts:437-446`); `tier` is optional (`types/index.ts:394`) and never set. Consequences: (a) `applyLesionFeedback` no-ops on every scan (`onDeviceSignalFusion.ts:202` skips non-confirmed) → the documented acne→inflammation/structure penalty never fires for anyone; (b) local insight fallback (offline / 12s L3 race / no-LLM) renders "No active concerns flagged this scan" (`onDeviceInsightsFallback.ts:120,199,210,230`) while the same record stores the lesions and results shows "N lesions located" (`results.tsx:368`) — self-contradicting story; (c) the live overlay treats undefined tier as confirmed-grade (`LesionOverlay.tsx:38`), so the user saw them marked confidently seconds earlier. Backend also demotes tier-less client lesions to `'possible'` (`app.js:748`). Distinct from #77/#78/#108/#134. One-line fix: band the tier at emission like the backend does.

### P2 (wave 9 cont.)
148. **`/api/products/identify-photo` is unauthenticated while making paid GPT-4o Vision calls** — registered with only `photoRateLimit` *before* `app.use(authMiddleware)` (`app.js:539` vs `:669`; comment marks it "public"); handler calls `openai.chat.completions.create({ model: 'gpt-4o' })` (`:553-573`). The only guard is `req.ip` rate limiting, collapsed to one global 5-req/10s bucket by the no-`trust-proxy` issue (#73) → any unauthenticated caller can POST arbitrary images and burn GPT-4o spend indefinitely. Distinct from #73 (auth'd vision endpoints) and #75 (auth'd generate-insights).

## Wave 10 addendum

Wave 10 ran three independent agents (scan/results, settings/ritual/today, onboarding/auth/backend); all three returned **NO NEW FINDINGS** for the six in-scope flows after hand-tracing the remaining un-traced math/state paths (LesionOverlay mirrored cover-fit, bone-results partial-domain pages, Face3DViewer degenerate projection, gamification XP thresholds, patternEngine min-N gating, routine zero-score ring, authMiddleware JWT, all pre-auth routes, cascade-delete ordering). One out-of-scope-adjacent security finding surfaced and was verified directly:

### Security (auth flow — MCP OAuth proxy)
149. **OAuth proxy open-redirect → Clerk auth-code exfiltration** — `backend/mcp/oauth-proxy.js:148-150` accepts an arbitrary `redirect_uri` (only checks non-empty string; no allowlist of registered URIs), stores it, and `/oauth/callback` (`:191-200`) 302s the Clerk authorization `code` to it. PKCE is not mandatory (`:152-154`), and the attacker initiates the flow so they simply omit `code_challenge` → no PKCE binding. An attacker who gets a victim to open `/oauth/authorize?client_id=<public>&response_type=code&redirect_uri=https://evil.com` receives the victim's auth code after they authenticate, then exchanges it at `/oauth/token` (proxy injects the client_secret) for tokens scoped to the victim's MCP tools (scan history, reports, etc.). Feature-flagged on `MCP_OAUTH_PROXY_ENABLED` — **enabled in production** per CLAUDE.md. Fix: validate `redirect_uri` against an allowlist and/or require PKCE.

## Suggested fix order

1. **Hard App-Review blockers:** wire or remove the mockup settings screens (delete-account → real cascade, legal links, privacy copy/toggles, export/help/notifications), fix demo-account wipe (#8), paywall NOT_PRESENTED (#29) + onboarding paywall escapes (#30).
2. **Identity/data integrity:** finish 224c7d4 (outbox/token/RC/analytics + migration heuristic for null `authedUserId`), hydrate identity guard + ordering (#9-10), backend whitelist + age enum (#7), DATE serialization + DESC ordering (#14-15).
3. **Crash + lockout fixes:** hoist hooks above early returns (#17-19), analyzing protocol-null timeout + abort guards (#23-24), camera lifecycle (#21-22, #26).
4. **Decide Harmony's fate** (#4, #16, #20): the feature needs a real ARKit landmark table and a per-user capture path before any of its numbers mean anything; until then consider feature-flagging it off.
5. Everything else per severity.
