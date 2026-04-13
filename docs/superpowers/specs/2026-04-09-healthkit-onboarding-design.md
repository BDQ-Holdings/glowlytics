# HealthKit Onboarding & Settings Integration — Design

**Date:** 2026-04-09
**Author:** Mustafa (brainstormed with Claude Code)
**Status:** Design approved, ready for implementation plan

## Summary

Add a new onboarding step that asks the user to grant HealthKit read access, then immediately uses the granted data to (a) seed the Pattern Engine with 14 days of backfill, (b) generate a Day-1 `firstLookInsight`, and (c) auto-skip the manual menstrual + cycle-details screens for female users whose period data already lives in HealthKit (via Clue, Flo, Natural Cycles, Apple Cycle Tracking, etc.). Also add a persistent Health Data row on the Profile tab so users who skip during onboarding can connect later, and users who granted can see sync status.

This makes three changes the current app lacks:

1. `connectHealthData()` has zero callers anywhere in the codebase — the Task 16 implementation is dead code until now.
2. Female users currently type `period_last_start_date` and `cycle_length_days` by hand on the `menstrual` and `cycle-details` onboarding screens, even when HealthKit already has accurate data from a tracker app.
3. The Pattern Engine feature (Phases 5-11 of the ultraplan) has no data source on Day 1, so `firstLookInsight` never populates and the Today tab's Pattern card shows only predicted/cold-start patterns.

## Motivation

The Pattern Engine is the differentiator for Glowlytics — turning scan data into correlation-based insights that are screenshottable and word-of-mouth-driven. But the engine needs health-context signals (sleep, HRV, RHR, steps, mindful minutes, cycle day) to find patterns worth showing. We shipped the engine, the store plumbing, and the sync triggers in Phases 5-6 of the ultraplan, but never built the entry point that asks the user for the data. This spec closes that gap.

"Seamless" here means two things: (1) the user grants once and immediately sees proof it worked, and (2) for female users, granting HealthKit automatically eliminates two manual data-entry screens the app previously required.

## Goals

- Every user who completes onboarding sees and dismisses-or-grants the HealthKit screen exactly once.
- Users who grant get 14 days of backfilled health data + a generated `firstLookInsight` before they land on the Today tab.
- Female users who grant and have cycle data in HealthKit skip the `menstrual` and `cycle-details` screens entirely.
- Users who grant see a proof-of-life confirmation within 4 seconds, even if HealthKit queries are slow.
- Users who skipped or denied during onboarding can connect later from the Profile tab Health Data card.
- Users who connected can see "Last synced X ago" and deep-link to iOS Settings to manage.
- No crashes, no blocking UI, no data silently dropped, on any supported iOS version.

## Non-Goals (v1)

- **Android / Health Connect support.** HealthKit only. Health Connect is a separate sprint.
- **In-app disconnect.** Apple doesn't expose programmatic permission revocation. iOS Settings deep-link is the only path and is clearly labeled.
- **Per-metric grant display.** Apple hides per-type read grants by design. The profile card just says "Connected" or not.
- **Background sync via BGTaskScheduler.** The foreground listener added in ultraplan Task 18 covers the refresh cadence.
- **Backend sync of HealthKit data.** Stays on-device. Matches the privacy disclosure ("never sent to our servers").
- **Custom HealthKit data export.** Users already have Apple Health for that.
- **iOS 19 `menstrualBleedingFlow` identifier.** Using the legacy `HKCategoryTypeIdentifierMenstrualFlow` identifier until it stops working (currently supported through at least iOS 18).
- **Ovulation or next-period prediction.** Out of scope — that's a fertility app feature and requires data we don't read (basal temp, LH).

## High-level architecture

Three layers touched, one new:

1. **Onboarding flow** (`src/services/onboardingFlow.ts`) — adds a new screen name, reorders existing screens, makes the menstrual branch conditional on a new flag.
2. **Health data layer** (`src/services/healthSync.ts`, `healthPermissions.ts`) — adds a menstrual flow query, a pure `deriveCycleDay()` helper, a one-shot `detectCycleFromHealthKit()` function, expands the `READ_IDENTIFIERS` list from 5 to 6.
3. **Store** (`src/store/useStore.ts`) — adds one new action `syncHealthDataInitial()` for the bootstrap 14-day pull.
4. **Screens** — one new file (`app/onboarding/health-permission.tsx`), one modified (`app/(tabs)/profile.tsx`).

No backend changes. No database changes. No new packages (`@kingstinct/react-native-healthkit` and `react-native-nitro-modules` already installed in Phase 6).

---

## Section 1: Onboarding flow change

**Before:**
```
welcome → age-range → sex → skin-goal
  → [menstrual → cycle-details]? (female)
  → camera-permission → preview → paywall
```

**After:**
```
welcome → age-range → sex → skin-goal
  → camera-permission
  → health-permission                   (NEW)
  → [menstrual → cycle-details]?        (female AND no HealthKit cycle data)
  → preview → paywall
```

### `buildOnboardingFlow` signature change

```typescript
export function buildOnboardingFlow(
  sex?: BiologicalSex,
  menstrualStatus?: MenstrualStatus,
  healthSyncedCycleDetected?: boolean,  // NEW
): OnboardingScreenName[]
```

When `sex === 'female'` AND `healthSyncedCycleDetected === true`, skip inserting `menstrual` and `cycle-details`. Otherwise insert them. Defaults to `false` when omitted (safe — keeps manual screens). The third argument is optional so existing callsites continue to compile.

### Dynamic flow rebuild

When the health-permission screen's post-grant handler resolves, it calls:

```typescript
setOnboardingFlow(buildOnboardingFlow(user.sex, user.menstrual_status, true))
```

…which updates the remaining flow in place. Because `onboardingFlowIndex` points at the current screen (health-permission), the *already-navigated* prefix of the flow is untouched — only the tail after health-permission gets shortened. The next `advance()` picks up the new flow correctly.

If the user skips or denies, we pass `false` (or don't call at all, since `false` is the default), and the manual screens remain in the tail.

---

## Section 2: Data types and state shape

### `src/types/index.ts` changes

```typescript
export type HealthDataType =
  | 'sleep'
  | 'resting_heart_rate'
  | 'heart_rate_variability'
  | 'steps'            // NEW
  | 'mindful_minutes'  // NEW
  | 'menstrual_flow';  // NEW

export type OnboardingScreenName =
  | 'welcome' | 'age-range' | 'sex' | 'location' | 'skin-goal'
  | 'products' | 'menstrual' | 'cycle-details' | 'supplements' | 'exercise'
  | 'shower-frequency' | 'hand-washing' | 'scan-reminder'
  | 'camera-permission' | 'health-permission'  // NEW
  | 'ready' | 'preview' | 'paywall';
```

### `HealthDailyRecord` — 2 new nullable fields

```typescript
export interface HealthDailyRecord {
  // ...existing 12 fields...
  menstrual_flow: 'none' | 'light' | 'medium' | 'heavy' | 'unspecified' | null;
  cycle_day_estimated: number | null;
  // ...synced_at, partial, etc.
}
```

`cycle_day_estimated` mirrors the same field on `DailyRecord`. The Pattern Engine already reads it — no engine changes needed. When both sources exist, HealthKit is source of truth (engine preference added in patternEngine.ts).

### `HealthConnectionState` — 1 new optional field

```typescript
export interface HealthConnectionState {
  // ...existing...
  cycle_detected?: boolean;  // NEW — true if HealthKit returned ≥1 menstrual sample in last 90 days
}
```

Persisted with the rest of `user.health_connection`. Drives the menstrual-skip decision.

### `READ_IDENTIFIERS` in `healthPermissions.ts` — expand from 5 to 6

```typescript
const READ_IDENTIFIERS = [
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKCategoryTypeIdentifierMindfulSession',
  'HKCategoryTypeIdentifierMenstrualFlow',        // NEW
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierStepCount',
] as const;
```

`REQUESTED_TYPES` also expands to match: `['sleep', 'resting_heart_rate', 'heart_rate_variability', 'steps', 'mindful_minutes', 'menstrual_flow']`.

### `AppState` — no new fields

`user.health_connection.cycle_detected` is the single source of truth. Nothing else in the store needs to know.

---

## Section 3: healthSync expansion + cycle derivation

### 3.1 Menstrual flow query inside `syncOneDay`

One additional try/catch block, parallel to the existing sleep/HRV/RHR/steps/mindful blocks:

```typescript
let menstrualFlow: HealthDailyRecord['menstrual_flow'] = null;
try {
  const samples = await queryCategorySamples(
    'HKCategoryTypeIdentifierMenstrualFlow',
    { limit: 0, filter: dateFilter },
  );
  if (samples.length > 0) {
    menstrualFlow = pickMaxSeverity(samples);
  }
} catch (e: any) {
  errors.push(`${dateStr} menstrual: ${e?.message ?? e}`);
}
```

`CategoryValueMenstrualFlow` enum: `unspecified=1, none=5, light=2, medium=3, heavy=4`. Build a lookup table to map enum → our string union. Note `none=5` is weirdly out of order — common HealthKit footgun; lookup table hides it.

`pickMaxSeverity()` = helper that picks heavy > medium > light > unspecified > none.

### 3.2 Pure helper: `deriveCycleDay()`

```typescript
export function deriveCycleDay(
  samples: { startDate: Date; endDate: Date; value: number }[],
  today: Date,
): number | null
```

Algorithm (plain English):

1. **Sort samples** by `startDate` ascending.
2. **Drop isolated 1-day samples** (no neighbor within 2 days) — spotting/intermenstrual bleeding.
3. **Group into episodes.** Start a new episode whenever the gap between consecutive samples exceeds 2 days (tolerance for missed logs mid-period).
4. **Take the most recent episode's start date** as cycle day 0.
5. **Return** `floor((today - cycleStart) / 24h) + 1`.
6. **Staleness cutoff:** if the most recent episode started more than 60 days ago, return `null` (pregnancy / menopause / hormonal BC / user stopped logging).

### 3.3 `detectCycleFromHealthKit()` — exported top-level

```typescript
export async function detectCycleFromHealthKit(): Promise<{
  detected: boolean;
  lastPeriodStart: Date | null;
  cycleLengthDays: number | null;
  menstrualStatus: 'regular' | 'irregular' | null;
}>
```

Called from exactly one place: the health-permission onboarding screen, right after `connectHealthData` resolves granted. Queries all menstrual samples in the last 90 days, runs the same episode-grouping logic as `deriveCycleDay`, computes:

- `detected`: `true` if any samples found in the 90-day window.
- `lastPeriodStart`: start date of the most recent episode (ISO date).
- `cycleLengthDays`: median gap between consecutive episode starts. Only computed with 2+ episodes; otherwise `null` (caller falls back to 28).
- `menstrualStatus`: `'regular'` if gaps are all within ±3 days of median, `'irregular'` if variance >7 days or only 1 episode, `null` if undetermined.

Returns fast (single HealthKit query, 90-day window) — safe to call from the UI path.

### 3.4 Integration into `syncOneDay`

The `HealthDailyRecord` shape gains `menstrual_flow` and `cycle_day_estimated`. Both are populated in `syncOneDay`:

- `menstrual_flow` — from the new query block (for THIS day only).
- `cycle_day_estimated` — computed by `deriveCycleDay(samples_from_last_90_days, today)`. This means `syncOneDay` needs to make ONE additional 90-day query per day it syncs OR — better — pull the 90-day menstrual window ONCE at the top of `pullLastNDays` and pass it down to `syncOneDay` for cycle day calculation. The latter saves 14-29 redundant queries per bootstrap. Use the latter.

### 3.5 Unchanged

- Sleep, HRV, RHR, steps, mindful handlers. Units already forced (`ms`, `count/min`, `count`).
- Reentrancy guard on `syncHealthData`.
- `partial` semantics (still "true only if sleep+hrv+rhr all null").

---

## Section 4: The health-permission screen + post-grant flow

### 4.1 New file: `app/onboarding/health-permission.tsx`

Structure mirrors `camera-permission.tsx`: `OnboardingTransition` wrapper, custom SVG illustration, handleConnect + handleSkip, progress dots. H2 hybrid layout from brainstorm:

- Headline: "See what's really affecting your skin."
- Sub: "Connect Apple Health to spot patterns like:"
- Pattern chip (example): "Your skin is 18% clearer on days after 7+ hours of sleep."
- Combined privacy + disclosure strip: "🔒 Reads sleep, heart rate, steps, cycle, mindful minutes. Stays on your device — never sent to our servers."
- Primary: "Connect Apple Health"
- Secondary: "Set up later"

Exact NSHealthShareUsageDescription string is already in app.json (matched to the Pattern Engine disclosure): `"Glowlytics reads sleep, heart rate, HRV, steps, and mindful minutes from Apple Health to find patterns in your skin. This data stays on your device."` — needs an update to mention cycle/menstrual data so the iOS dialog language matches what the user expects. New string:

```
"Glowlytics reads sleep, heart rate, HRV, steps, mindful minutes, and menstrual flow from Apple Health to find patterns in your skin. This data stays on your device."
```

### 4.2 Screen states

| State | Trigger | UI |
|---|---|---|
| `idle` | Initial render | Pattern chip + primary/secondary buttons |
| `connecting` | User tapped Connect, iOS dialog dismissed, sync running | Pattern chip replaced with rotating progress ("Reading sleep…" → "Reading cycle data…" every 400ms); spinner on primary button; 4s hard timeout |
| `success-full` | Sync returned ≥3/5 core metrics populated | Success card "✓ Connected · X days of data" + metric breakdown ("14 days sleep · 12 HRV samples · cycle day 12"); primary flips to "Continue"; auto-advance after 1.5s |
| `success-partial` | Sync returned <3/5 metrics OR timed out | Softer card "✓ Connected · We'll start pulling data as you use Apple Health"; primary "Continue"; auto-advance after 2s |
| `denied` | User denied on iOS dialog OR HealthKit unavailable | Neutral card "No problem — you can connect later in Settings."; primary "Continue without Apple Health" |

### 4.3 handleConnect logic

```
1. setState('connecting')
2. const conn = await connectHealthData()
3. if conn.status === 'denied': setState('denied'); return
4. const cycleResult = await detectCycleFromHealthKit()
5. if cycleResult.detected:
     updateUser({
       period_last_start_date: localDateStr(cycleResult.lastPeriodStart),
       cycle_length_days: cycleResult.cycleLengthDays ?? 28,
       menstrual_status: cycleResult.menstrualStatus ?? user.menstrual_status,
     })
     updateHealthConnection({ ...conn, cycle_detected: true })
     setOnboardingFlow(buildOnboardingFlow(user.sex, user.menstrual_status, true))
6. Race promise: [syncHealthDataInitial(), timeout(4000)]
7. const { added, errors } = await raced
8. const latestRecord = get().healthDailyRecords[get().healthDailyRecords.length - 1] ?? null
   const metricsPopulated = latestRecord
     ? [
         latestRecord.sleep_total_minutes,
         latestRecord.hrv_sdnn_ms,
         latestRecord.resting_hr_bpm,
         latestRecord.steps,
         latestRecord.mindful_minutes,
       ].filter((v) => v !== null).length
     : 0
9. if metricsPopulated >= 3:
     setState('success-full', { daysSynced: added, metricsPopulated, cycleDay: latestRecord?.cycle_day_estimated })
   else:
     setState('success-partial')
10. Generate firstLookInsight from latest store state (only if metricsPopulated >= 3)
11. setFirstLookInsight(insight)
12. Auto-advance: 1.5s delay on success-full, 2s on success-partial, or immediate on user tap of Continue
```

**Note on `metricsPopulated` threshold:** 3 out of 5 (sleep, HRV, RHR, steps, mindful) is the "enough data to be useful" bar. Menstrual flow is excluded from this count because a user who isn't currently menstruating legitimately has null flow for the day — it shouldn't drag the metric count down. Cycle data quality is separately captured via `cycle_detected` and surfaces in the success card if present.

**Note on `added` vs `metricsPopulated`:** `pullLastNDays(14)` returns one record per day (14 records), so `added` is almost always 14 on a successful call. That's a day-count, not a metric-count — which is why the success/partial classification keys off per-metric nullness on the most recent day, not off the record count.

### 4.4 handleSkip logic

```
1. updateHealthConnection({ status: 'not_requested', sync_skipped: true })
2. advance()
```

### 4.5 New store action: `syncHealthDataInitial()`

```typescript
syncHealthDataInitial: () => Promise<{ added: number; errors: string[] }>
```

Identical to `syncHealthData` except:
- Calls `pullLastNDays(14, user.user_id)` instead of 2.
- Bypasses the reentrancy guard (this is the bootstrap — nothing else should be running).
- Still updates `healthSyncStatus` (last_sync_at, last_success_at, last_error).
- Still triggers `runPatternDetection` on success.

### 4.6 Illustration: new `HealthIllustration` SVG component

Same technique as `CameraIllustration` in `camera-permission.tsx`: `<Svg>` with radial gradients, shapes, accent particles. Motif: stylized heart with radiating signal pulses (matches the Health app's iconography without copying it). Uses the same teal/cyan/green/purple palette as the camera illustration for visual consistency across the onboarding flow. Target: ~80 lines of JSX.

### 4.7 Analytics events

Two new PostHog events:
- `health_permission_shown` — fired on screen mount
- `health_permission_result` — fired on advance, with:
  - `result: 'granted' | 'denied' | 'skipped' | 'error'`
  - `days_synced: number` (0-14)
  - `cycle_detected: boolean`
  - `metrics_populated: number` (0-5, counts how many of sleep/HRV/RHR/steps/mindful came back with non-null values on the most recent day)
  - `cycle_length_days: number | null`

---

## Section 5: Settings card, edge cases, testing

### 5.1 Profile tab Health Data card

Inserted between "Account & Plan" and "Notifications" in `app/(tabs)/profile.tsx`.

**Disconnected state:**
```
♥  HEALTH DATA
───────────────
   🔌 Connect Apple Health  [button, primary]
```

**Connected state:**
```
♥  HEALTH DATA
───────────────
   Apple Health          ● CONNECTED
   Last synced           2 hours ago
   ⚙ Manage in iOS Settings
```

**Unavailable state** (iPad, sim, or HealthKit blocked): card is hidden entirely.

Tapping "Connect Apple Health" runs the same `handleConnect` flow as the onboarding screen. Tapping "Manage in iOS Settings" deep-links via `Linking.openURL('x-apple-health://')`, falling back to `app-settings:` if the first fails.

"Last synced" is computed from `healthSyncStatus.last_sync_at` using a `formatRelativeTime()` helper (e.g., "just now", "5 minutes ago", "2 hours ago", "yesterday", "3 days ago"). Helper lives in `src/utils/` and is testable in isolation.

### 5.2 Edge case catalog

| Scenario | Handling |
|---|---|
| User denies iOS dialog | `denied` state → "Continue without Apple Health" → flow falls through to manual menstrual screens for female users |
| User grants but has NO HealthKit data | `success-partial` state → no firstLookInsight generated → manual menstrual screens still shown (cycle_detected = false) |
| User grants, has sleep/HRV but no cycle data | `success-full` → manual menstrual screens still shown (cycle_detected = false) |
| User grants, has cycle data but irregular (>7 day variance) | `success-full` → menstrual_status auto-set to 'irregular' → cycle-details SKIPPED (period_last_start_date backfilled) |
| Sync times out at 4s | Force-transition to `success-partial` → background sync continues → firstLookInsight generated lazily on next foreground |
| iOS but HealthKit unavailable (MDM, iPad, sim) | `getHealthConnectionState()` returns `unavailable` on screen mount → auto-advance with `sync_skipped=true`, never shows the screen |
| User completes onboarding then revisits (safety net) | If `health_connection.status === 'granted'` on mount, auto-advance without re-asking |
| User revokes permission in iOS Settings after granting | Next foreground sync returns 0 records → `healthSyncStatus.last_error` populated → profile card still says "Connected" (no programmatic way to detect revocation) → known limitation, documented in code |
| User grants via profile card (post-onboarding) | Settings-card `handleConnect` runs identically to onboarding path, but stays on profile tab when done |
| `@kingstinct/react-native-healthkit` native module missing at runtime | Dynamic `require()` in useStore catches throw → `last_error` populated → UI shows `denied` state → flow continues without HealthKit. No crash. |
| User has female `sex` AND `menstrual_status === 'no'` (not tracking) | Existing flow already skips `cycle-details` in this case. HealthKit menstrual query still runs but finds nothing → `cycle_detected = false` → `menstrual` screen still appears (user can confirm 'no' again, consistent with current behavior) |

### 5.3 Testing strategy

**New unit tests — `__tests__/healthSync.test.ts`** (currently empty, populate):

- `deriveCycleDay()` — 8 cases:
  - Empty samples → `null`
  - Single episode 8 days ago → `9`
  - Ongoing period (samples through today) → `1`
  - Stale episode (70 days ago) → `null`
  - Two episodes, most recent used
  - Isolated 1-day sample dropped as spotting
  - Median length calc with 3 episodes
  - Back-to-back episodes (minimal gap)
- Menstrual flow severity mapping — 5 cases (one per enum value)
- `detectCycleFromHealthKit()` — 4 cases (mocked responses):
  - granted + data → detected: true
  - granted + no data → detected: false
  - denied → detected: false
  - single episode → cycleLengthDays: null, menstrualStatus: null

**New store tests — `__tests__/useStore.test.ts` additions:**

- `syncHealthDataInitial()` populates `added` count correctly
- `syncHealthDataInitial()` bypasses reentrancy guard (can run concurrent with `syncHealthData`)

**New onboarding flow tests — `__tests__/onboardingFlow.test.ts`:**

- `buildOnboardingFlow('female', 'regular', true)` → skips menstrual + cycle-details
- `buildOnboardingFlow('female', 'regular', false)` → includes both
- `buildOnboardingFlow('male', undefined, undefined)` → no menstrual screens (existing behavior preserved)
- `buildOnboardingFlow('female', 'regular', undefined)` → includes both (safe default)
- `health-permission` screen is present in all flow variants (between `camera-permission` and the menstrual branch / preview)

**New component smoke test — `__tests__/healthPermission.test.tsx`:**

- Renders `idle` state correctly
- `handleSkip` calls `updateHealthConnection` + `advance`
- Full `handleConnect` success path (mocked `connectHealthData` returns granted, mocked `detectCycleFromHealthKit` returns detected: true)
- `denied` path renders correct message + button
- Hard 4s timeout transitions from `connecting` to `success-partial`

**Target:** ~25 new tests total. No snapshots.

---

## Section 6: Future work (deferred)

Captured for a future sprint; NOT part of this spec:

1. **Cycle anomaly prompts.** Detect unusually long periods (>7 days beyond user's median) or stale cycles (>40 days since last period), surface in-app questionnaires asking about changes.
2. **Pregnancy-related features.** Read `HKCategoryTypeIdentifierBleedingDuringPregnancy`, `BleedingAfterPregnancy`, `Pregnancy`, `PregnancyTestResult` identifiers. Add a "pregnancy mode" that adapts the Pattern Engine inputs (hormones change skin radically) and hides cycle-day features.
3. **Contraception tracking.** Read `HKCategoryTypeIdentifierContraceptive`. Wire up the existing but unused `on_hormonal_birth_control` + `birth_control_type` fields in `UserProfile` — combined hormonal contraception suppresses cycles, so the Pattern Engine should disable cycle-day correlations for those users.

All three should be cross-referenced in `progress.txt` so they surface in future sessions.

---

## Rollout

- **EAS build required.** The `NSHealthShareUsageDescription` change in `app.json` means the existing build 82 dev client (and any TestFlight build shipped from earlier) cannot run this code — the iOS dialog would show the old disclosure text while the code expects the new one, which fails App Review. Rebuild with `eas build --profile development --platform ios` before testing.
- **No DB migration.** Everything persists client-side in AsyncStorage; `loadPersistedData` already falls back gracefully on missing fields.
- **No analytics pipeline changes.** Using existing PostHog events, two new event names.
- **Visual companion mockups** used during brainstorming are at `.superpowers/brainstorm/95374-1775711894/content/` — reference artifacts, not shipped.

## Open questions (resolved)

None. All placement, framing, cycle-data, post-grant UX, and settings decisions were made during brainstorming and approved inline.

## Success criteria

- Onboarding completion rate does not drop by more than 2% after this ships (measured via `health_permission_shown` / `onboarding_complete` funnel).
- Among users who grant, median `days_synced` is ≥10 (i.e., bootstrap pull usually finds real data).
- Female users who grant AND have cycle data skip both `menstrual` and `cycle-details` screens — verified by flow length drop in the funnel.
- Day-1 Pattern card on the Today tab shows a real `firstLookInsight` for ≥40% of granting users (the other ~60% will be cold-start or failed bootstraps).
- Zero crash reports attributed to the new screen in PostHog error tracking within 7 days of rollout.
