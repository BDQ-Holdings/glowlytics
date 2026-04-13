# Pattern Engine — Design Spec

**Date:** 2026-04-07
**Status:** Design approved, ready for implementation plan
**Author:** Brainstormed with Claude via `superpowers:brainstorming`
**Implementation plan:** (to be written next via `superpowers:writing-plans`)

---

## 1. Overview

### 1.1 Goal

Build a new core feature, **Patterns**, that produces uncannily personal, statistically defensible correlations between a user's skin signals and their cycle / sleep / HRV / lifestyle data — surfaced as screenshottable, shareable cards. The feature is the primary vehicle for Glowlytics to reach product-market fit via word-of-mouth referral.

### 1.2 PMF Thesis

Glowlytics today competes on score quality and product recommendations — the same axis as every skincare app in the market. The Pattern Engine moves the app onto a different axis:

> **Glowlytics is the app that connects your face to the things no one else has ever connected it to — your cycle, your sleep, your drinks, your stress — and shows you the patterns. You don't get a "skincare score." You get the receipts.**

The share moment is:
> *"Look at this — my skin app figured out my inflammation peaks 3 days before my period. Every single cycle. How does it know."*

That message is the referral mechanism. Every user who shares a pattern is pulling a friend into the funnel. PMF = `pattern_shared` events per user per week, trending up.

### 1.3 Non-goals

- **Not a "weekly wrapped" feature.** That's a delivery wrapper (Approach 2 from brainstorming) and is deferred. The Pattern Engine is foundational; the wrapper can come later.
- **Not a social feature.** No in-app feed, no pair mode, no friend comparison. Sharing is strictly outbound to users' existing channels (Messages, IG Stories, AirDrop) via the iOS share sheet.
- **Not a medical claim layer.** Patterns are observational, not diagnostic. Language in every pattern avoids prescriptive medical guidance.
- **Not a cross-platform v1.** iOS HealthKit only. Android HealthConnect is a v2 concern.
- **Not backend-heavy.** All pattern logic runs on-device in v1. Backend mirror of pattern results is a v2 concern.

### 1.4 Scope check

This spec is large but single-system — it describes one coherent feature built from multiple cooperating layers. It does not need further decomposition. The implementation plan that follows will break it into 12-18 bite-sized tasks.

---

## 2. User-facing behavior

### 2.1 The daily ritual (days 1-21)

| Day | What the user experiences |
|---|---|
| **Day 1** | After first scan: a "First Look" card with one surprising observation (asymmetry, skin age gap, hot zone, lesion count, cycle setup, or positive percentile). 3 "Predicted Patterns" marked `WATCHING` on Today screen. Progress bar: `Days of data: 1 / 14 → Real patterns unlock`. |
| **Days 2-6** | Same predictions, progress bar advances. Each predicted pattern gains a daily annotation underneath: *"Yesterday: cycle day 18, inflammation 64. 11 days to unlock."* |
| **Day 5** | First `emerging` real pattern possible if signal is very strong (e.g. outlier day from heavy drinking). |
| **Day 7** | A "first week receipt" mid-journey reward card. |
| **Days 8-13** | More `emerging` patterns possible. Predicted patterns refresh. |
| **Day 14** | **The unlock moment.** Push notification: *"Your patterns are ready. Glowlytics found 3 things in your skin this month."* Patterns screen now shows `STRONG` / `MODERATE` patterns with full share artifacts. |
| **Day 14+** | Continuous detection. New patterns surface; old patterns evolve or drop. |

### 2.2 The share moment

1. User opens Patterns section on Today screen
2. Sees a pattern card with: confidence pill, insight headline, sparkline chart, sample size line, `See pattern` and `Share ↗` buttons
3. Taps `Share ↗`
4. App renders a 1080×1920 PNG export of the pattern (headline + proof chart + wordmark), hands to iOS share sheet
5. User posts to IG Story / sends via iMessage / AirDrops
6. Recipient sees the pattern, gets curious, downloads Glowlytics
7. Analytics fires `pattern_shared`

---

## 3. Architecture

Three new layers plus extensions to existing systems:

```
┌─────────────────────────────────────────────────────────────┐
│  PATTERNS UI                                                │
│  - New "Patterns" section on Today screen                   │
│  - Pattern detail screen (full chart + "What you can try")  │
│  - Share sheet → 1080x1920 PNG export                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ reads patterns
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PATTERN ENGINE  (src/services/patternEngine.ts)            │
│  - Runs on app foreground + after every scan                │
│  - Pure function: (data) => Pattern[]                       │
│  - Correlation + lag analysis + confidence scoring          │
│  - Cold-start fallback: predicted patterns from priors      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ reads from
                         ▼
┌──────────────────────────────────┬──────────────────────────┐
│  HEALTH DATA SYNC                │  EXISTING DAILY RECORDS  │
│  - src/services/healthSync.ts    │  - DailyRecord[]         │
│  - @kingstinct/react-native-     │    (self-reported sleep, │
│    healthkit via EAS build       │    stress, drinks, mood) │
│  - Pulls sleep, sleep stages,    │  - Cycle data            │
│    HRV, RHR, steps, mindful      │  - Existing scan signals │
│  - Writes HealthDailyRecord[]    │    (ModelOutput[])       │
│    to Zustand store              │                          │
└──────────────────────────────────┴──────────────────────────┘
```

### 3.1 Data flow

1. **On app foreground**, if `healthSyncStatus.last_sync_at` is more than 6 hours old AND time is between 7am-11pm local, kick off `healthSync.syncHealthData()` in the background (non-blocking).
2. **After every scan completes**, opportunistic sync of just yesterday's health data if missing.
3. **After every scan OR after health sync completes**, `patternEngine.detectPatterns()` runs on the full (last 90 days of) data and returns a ranked Pattern[].
4. Results are stored in Zustand under `patterns` field. Today screen subscribes via a selector.
5. On app open, if new patterns appeared since last open, a dot indicator shows on the Patterns header with light haptic feedback when the card scrolls into view.
6. When user taps Share, `patternEngine.exportPatternImage(pattern)` renders a hidden view via `react-native-view-shot`, returns a temp PNG path, hands to `expo-sharing.shareAsync`, then deletes the temp file.

### 3.2 Why this shape

- The Pattern Engine is a **pure function** of `(ModelOutput[], DailyRecord[], HealthDailyRecord[], UserProfile)` → `Pattern[]`. This makes it trivially testable with synthetic fixtures and means we can re-run the engine on historical data whenever we tweak the algorithm.
- HealthKit sync is isolated so it can fail gracefully (Android, permission denied, network, module unavailable in Expo Go) without breaking patterns. Patterns still work on self-reported data alone, just less powerfully.
- Cold start lives inside the engine itself, not as a separate code path. When real patterns aren't yet available, the engine returns predicted patterns from priors. UI doesn't need to know the difference (other than the `isPredicted` flag).

### 3.3 What's explicitly NOT in v1

- No background fetch / silent push notifications. iOS background restrictions make this unreliable; we sync on foreground.
- No Android HealthConnect. iOS only.
- No backend mirror of HealthKit data or pattern results. Local-only.
- No in-app social features (pair mode, leaderboards, feed).
- No Weekly Receipts (deferred — Approach 2 from brainstorming).
- No editable share text. The app controls the voice.

---

## 4. Data layer

### 4.1 HealthKit package choice

**`@kingstinct/react-native-healthkit` v9+**

- TypeScript-first, modern API
- Supports sleep, HRV (SDNN), RHR, steps, mindful minutes out of the box
- Compatible with EAS managed workflow via config plugin — no ejection needed
- Active maintenance, production-grade

Install:
```bash
npx expo install @kingstinct/react-native-healthkit
```

App config updates:
- Add to `app.json` plugins array with `permissionStrings` for each metric
- Add `NSHealthShareUsageDescription` to `ios.infoPlist`: `"Glowlytics reads sleep, heart rate, HRV, steps, and mindful minutes from Apple Health to find patterns in your skin. This data stays on your device."`
- Rebuild EAS dev client after config plugin is added

### 4.2 HealthKit metrics (v1 set — 6 metrics)

| Metric | HK Identifier | Purpose | Sync |
|---|---|---|---|
| Sleep total | `HKCategoryTypeIdentifierSleepAnalysis` | Correlate with hydration, inflammation | Daily, last 24h |
| Sleep stages (deep/REM) | Same, filtered by value | Stronger predictor than total sleep | Daily, last 24h |
| HRV (SDNN) | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | Stress proxy → strongest inflammation predictor | Daily, last 24h average |
| Resting HR | `HKQuantityTypeIdentifierRestingHeartRate` | Recovery proxy | Daily, last 24h |
| Steps | `HKQuantityTypeIdentifierStepCount` | Activity, circulation → hydration | Daily, last 24h sum |
| Mindful Minutes | `HKCategoryTypeIdentifierMindfulSession` | Alternative stress proxy | Daily sum |

v2 expansion candidates (NOT in v1): workouts, body temperature, oxygen saturation, hydration logs, weight.

### 4.3 New types (`src/types/index.ts`)

```typescript
export interface HealthDailyRecord {
  health_daily_id: string;
  user_id: string;
  date: string;                          // YYYY-MM-DD, via localDateStr()
  source: 'apple_health' | 'health_connect' | 'manual';
  // Sleep
  sleep_total_minutes: number | null;
  sleep_deep_minutes: number | null;
  sleep_rem_minutes: number | null;
  // Cardiovascular
  hrv_sdnn_ms: number | null;
  resting_hr_bpm: number | null;
  // Activity
  steps: number | null;
  mindful_minutes: number | null;
  // Sync metadata
  synced_at: string;                     // ISO timestamp
  partial: boolean;                      // true if any field is null
}

export type PatternConfidence = 'strong' | 'moderate' | 'emerging' | 'watching';
export type PatternSignal = 'overall' | 'acne' | 'inflammation' | 'hydration' | 'sunDamage' | 'elasticity';
export type PatternType =
  | 'cycle_signal_phase'
  | 'health_signal_lag'
  | 'lifestyle_signal_corr'
  | 'product_trajectory'
  | 'outlier_day';

export interface Pattern {
  id: string;
  type: PatternType;
  signal: PatternSignal;
  driver: string;                        // e.g. 'hrv_sdnn_ms', 'cycle_day', 'drinks_yesterday'
  driverLabel: string;                   // e.g. 'HRV', 'cycle', 'alcohol'
  confidence: PatternConfidence;
  correlationCoefficient: number;        // -1.0 to 1.0; never shown to user
  sampleSize: number;                    // n of paired data points
  lagDays: number;                       // 0 same-day; positive = driver leads signal
  insightText: string;                   // human-voice headline, <=80 chars
  detailText: string;                    // 2-3 sentence explanation, <=200 chars
  chartData: PatternChartPoint[];
  detectedAt: string;                    // ISO
  firstSeenAt: string;                   // ISO
  isPredicted: boolean;                  // true for cold-start placeholder patterns
  requiresHealthKit?: boolean;
  unlocksAtDay?: number;                 // for predicted patterns only
}

export interface PatternChartPoint {
  date: string;                          // YYYY-MM-DD
  signalValue: number;                   // 0-100
  driverValue: number | null;            // raw driver value
  driverLabel: string;                   // pre-formatted for axis
}

export interface FirstLookInsight {
  headline: string;                      // <=80 chars
  detail: string;                        // <=200 chars
  driver: 'asymmetry' | 'age_gap' | 'hot_zone' | 'lesion_count' | 'cycle_setup' | 'positive_percentile';
}
```

### 4.4 New store fields (`src/store/useStore.ts`)

```typescript
// State
healthDailyRecords: HealthDailyRecord[];        // capped to 365 days
healthSyncStatus: {
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  in_progress: boolean;
};
patterns: Pattern[];                             // capped to 5 displayed; full set kept internally
firstLookInsight: FirstLookInsight | null;       // day 1 hook

// Actions
addHealthDailyRecord: (record: HealthDailyRecord) => void;
upsertHealthDailyRecord: (date: string, partial: Partial<HealthDailyRecord>) => void;
syncHealthData: () => Promise<{ added: number; errors: string[] }>;
setPatterns: (patterns: Pattern[]) => void;
setFirstLookInsight: (insight: FirstLookInsight | null) => void;
runPatternDetection: () => void;                 // pure wrapper; calls patternEngine.detectPatterns
```

The existing `persistData()` function must be updated to include `healthDailyRecords`, `healthSyncStatus`, `patterns`, `firstLookInsight` in the AsyncStorage blob. `loadPersistedData()` likewise.

### 4.5 Sync trigger strategy

**No background fetch in v1.** Instead, three trigger points, each wired at a specific call site:

1. **On app foreground** — in `RadianceIQ/app/_layout.tsx`, add an `AppState` listener (or reuse the existing one) that, when state transitions to `'active'`, checks `useStore.getState().healthSyncStatus.last_sync_at`. If it's more than 6 hours old AND local time is between 7am-11pm, calls `useStore.getState().syncHealthData()`. Non-blocking.
2. **After every scan completes** — in `RadianceIQ/app/scan/results.tsx` (or wherever `addModelOutput` is called post-scan), kick off an opportunistic sync for just yesterday's data if that day is missing from `healthDailyRecords`.
3. **Manual trigger** — a "Sync now" button in a settings drawer on the Patterns section, wired directly to `syncHealthData()`.

The `syncHealthData()` action itself (defined in `useStore.ts`) sets `in_progress: true`, calls `healthSync.pullLastNDays(2)` under the hood, writes results via `upsertHealthDailyRecord`, updates `last_sync_at` on success, and sets `last_error` on failure.

Coverage target: ~95% of daily-active users get fresh data by the time they open the app each morning.

### 4.6 Privacy guarantees (non-negotiable)

1. **HealthKit raw values never leave the device.** `HealthDailyRecord[]` is stored in AsyncStorage only. No POST to backend in v1.
2. **Pattern results may sync to backend in v2**, but only the computed Pattern objects (correlation coefficient, label, confidence) — not the raw inputs.
3. **No export of HealthKit data**, even on user request. Users get their data from Apple Health directly.
4. **Minimal permission scope**: only the 6 metrics above. No HKWorkouts in v1. No writing to HealthKit, ever.
5. **Privacy policy update**: one paragraph describing the 6 metrics, where they're stored (device-only), and how they're used (local pattern detection only).
6. **App Store privacy nutrition labels**: add "Health & Fitness → Health" with "Used for app functionality" + "Linked to user" = NO + "Used for tracking" = NO.
7. **Share artifact contains zero raw data** — no scores, health values, or demographic info. Just the pattern headline + the correlation chart.

---

## 5. Pattern engine (algorithm)

### 5.1 Design principles

1. **Confidence over coverage.** Better to surface one rock-solid pattern than five maybes. Users only share what they trust.
2. **Temporal causality matters.** Same-day correlation is weak. Lag analysis (does X precede Y by 1-3 days?) is what makes patterns feel uncanny.
3. **Plain English, not p-values.** Users see *"Your inflammation goes up the day after nights with low HRV — clear pattern over the last 23 days"*, never `r=0.71, p<0.05`.

### 5.2 Pattern types

| ID | Pattern | Algorithm | Min sample | Min confidence |
|---|---|---|---|---|
| `cycle_signal_phase` | Signal peaks/troughs N days from cycle event | Phase alignment + Pearson on cycle-phase aggregates | 1.5 cycles (≈45 days) or 2+ logged cycles | `\|r\|` ≥ 0.5, n ≥ 14 paired |
| `health_signal_lag` | HRV/sleep/RHR change *precedes* signal change | Cross-correlation with lag 0/1/2/3 days, take max | 14 days paired | `\|r\|` ≥ 0.4, n ≥ 14 |
| `lifestyle_signal_corr` | Self-reported (drinks, stress) vs signal | Pearson on day-aligned pairs | 14 days paired | `\|r\|` ≥ 0.45, n ≥ 14 |
| `product_trajectory` | Signal trajectory after product start date | Pre/post mean comparison + slope analysis | 14 days post, 7 days pre | `\|delta\|` ≥ 8 points OR slope flip |
| `outlier_day` | Single-day anomaly with attributable cause | Z-score on signal + correlated lifestyle anomaly same day | 14 days history | z ≥ 2.0, paired anomaly |

### 5.3 Confidence tiers

- **Strong** (`|r| ≥ 0.6`, `n ≥ 21`): voice is confident — *"Your inflammation **always** spikes 3 days before your period. Like clockwork."* Big share button.
- **Moderate** (`|r| ≥ 0.45`, `n ≥ 14`): voice is hedged — *"Your hydration tends to drop on nights you sleep less than 6 hours."* Still share-worthy.
- **Emerging** (`|r| ≥ 0.35`, `n ≥ 10`): voice is provisional — *"Early signal: alcohol may be linked to your acne. Need 5 more data points to be sure."* Promotes engagement to confirm.
- **Watching** (predicted patterns only, days 1-13): not yet computed; shown as a promise — *"We're tracking yours. Real pattern unlocks in 11 days."*

### 5.4 Pure function interface (`src/services/patternEngine.ts`)

```typescript
export interface PatternEngineInput {
  modelOutputs: ModelOutput[];           // scan signals over time
  dailyRecords: DailyRecord[];           // self-reported daily data
  healthDailyRecords: HealthDailyRecord[]; // HealthKit-pulled data
  userProfile: UserProfile;              // for prior selection
}

export function detectPatterns(input: PatternEngineInput): Pattern[] {
  // 1. Slice inputs to last 90 days (perf cap).
  // 2. If paired data count < 10, skip real patterns, return predicted only.
  // 3. Run each pattern type detector independently.
  // 4. Apply confidence thresholds.
  // 5. Deduplicate by signal (highest-confidence driver wins).
  // 6. Rank by: confidence tier, |r|, sampleSize, recency.
  // 7. Cap displayed list at 5.
  // 8. If fewer than 2 real patterns, fill with up to 3 predicted patterns.
  // 9. Return ranked Pattern[].
}

export function generateFirstLookInsight(
  scan: ModelOutput,
  profile: UserProfile,
): FirstLookInsight | null {
  // Try insight types in priority order, return the first that fits.
  // Priority: lesion_count > hot_zone > asymmetry > age_gap > positive_percentile > cycle_setup
}

export function exportPatternImage(
  pattern: Pattern,
): Promise<string>;                       // returns temp file path to 1080x1920 PNG
```

### 5.5 Lag analysis (the differentiator)

Most apps that do correlation just compute same-day Pearson. That misses causality. The lag step:

```typescript
function bestLag(
  driver: number[],
  signal: number[],
  maxLag = 3,
): { r: number; lag: number } {
  let best = { r: 0, lag: 0 };
  for (let lag = 0; lag <= maxLag; lag++) {
    const aligned = alignWithLag(driver, signal, lag);
    if (aligned.length < 10) continue;
    const r = pearson(
      aligned.map(p => p.driver),
      aligned.map(p => p.signal),
    );
    if (Math.abs(r) > Math.abs(best.r)) best = { r, lag };
  }
  return best;
}
```

This lets us produce claims like *"the day after low HRV nights"* instead of *"correlates with HRV"* — dramatically more credible.

### 5.6 Ranking + deduplication

After all 5 pattern detectors run, the raw list passes through:

1. **Threshold filter** — drop anything below `emerging` thresholds
2. **Per-signal dedup** — for each signal (acne, inflammation, ...), keep only the highest-confidence pattern. We don't show `HRV → acne` AND `stress → acne` simultaneously.
3. **Rank** by `(confidence_tier_ordinal, |r|, sampleSize, detectedAt_desc)`
4. **Cap at 5** displayed; full set stored internally for analytics
5. **Cold-start fill** — if fewer than 2 real patterns, append up to 3 predicted patterns so the user always has at least something to see

### 5.7 Performance budget

- Pattern engine on 90 days of data: **<100ms** target on iPhone 12
- If it exceeds 100ms, move to a JS worker via `react-native-worklets-core` (already in project for camera frame processor)

---

## 6. Cold-start mitigation

### 6.1 Why this section exists

The math of cold start is brutal:
- Real patterns need ~14 days of paired data
- Mobile health apps typically lose ~60% of users by day 7
- If a user churns before day 14, they never see the magic → no share → no referral → no PMF

The cold-start scaffold gives users something meaningful every day from day 1 to day 14+.

### 6.2 The Day 1 "First Look" insight (most important element)

A function that produces ONE uncanny observation from the user's first scan + onboarding answers.

**The six insight types:**

1. **Left-right asymmetry** — *"Your left cheek is 18% less hydrated than your right. Most people sleep on one side — that's probably why."* Triggers if zone delta > 12%.
2. **Skin age gap** — *"Glowlytics estimates your skin age at 24. You told us you're 28. That's 4 years of glow you've earned."* Triggers if delta > 2 years.
3. **Inflammation hot zone** — *"Your inflammation is concentrated in your T-zone — 2.3× higher than your cheeks. Classic combination skin signature."* Triggers if any zone is ≥2× another zone's inflammation.
4. **Hidden lesion count** — *"We found 7 lesions you might not have noticed — 5 are in the early/healing phase."* Triggers if `lesions.length ≥ 3`.
5. **Cycle setup** — *"Based on your cycle, you're on day 17. Your hormones peak around day 21 — we'll watch your inflammation closely from then."* Triggers if user logged cycle data.
6. **Positive percentile** — *"Your hydration is in the top 30% for users your age. Let's protect that."* Triggers if any signal is ≥ 70th percentile for the user's age range.

Priority order: `lesion_count` > `hot_zone` > `asymmetry` > `age_gap` > `positive_percentile` > `cycle_setup`. We pick the first one that fires. If none fire (unlikely), fall back to a generic welcome.

Every insight must be **true** (derived from real scan data) and **surprising** (says something a derm might charge $200 to point out).

### 6.3 Predicted Patterns (days 1-13)

Static lookup table in `src/services/patternPriors.ts`:

```typescript
export const PATTERN_PRIORS: PredictedPatternTemplate[] = [
  {
    id: 'cycle_inflammation_prior',
    triggerWhen: (p) =>
      p.sex === 'female' && p.menstrual_status === 'regular',
    confidence: 'watching',
    headline: 'Most cycles produce a 3-7 day inflammation peak before each period',
    detail: 'In our data, 73% of regularly cycling users see this pattern by day 14. We\'re tracking yours.',
    signal: 'inflammation',
    driver: 'cycle_day',
    unlocksAtDay: 14,
    requiresHealthKit: false,
  },
  {
    id: 'sleep_hydration_prior',
    triggerWhen: () => true,
    confidence: 'watching',
    headline: 'Sleep is the strongest predictor of next-day hydration',
    detail: 'Most users see this within 2 weeks once they sync Apple Health. Connect Health to unlock yours.',
    signal: 'hydration',
    driver: 'sleep_total_minutes',
    unlocksAtDay: 14,
    requiresHealthKit: true,
  },
  {
    id: 'alcohol_acne_prior',
    triggerWhen: (p) =>
      ['1-2x_week', '3-4x_week', '5+x_week']
        .includes(p.drink_baseline_frequency ?? ''),
    confidence: 'watching',
    headline: 'Alcohol affects acne in most users — usually within 14 days',
    detail: 'Your baseline says you drink semi-regularly. If alcohol is moving your skin, we\'ll see it.',
    signal: 'acne',
    driver: 'drinks_yesterday',
    unlocksAtDay: 14,
    requiresHealthKit: false,
  },
  {
    id: 'stress_overall_prior',
    triggerWhen: () => true,
    confidence: 'watching',
    headline: 'High-stress days correlate with skin score drops the next day',
    detail: 'Stress is the #1 lifestyle factor in our data. Track it daily to see your version.',
    signal: 'overall',
    driver: 'stress_level',
    unlocksAtDay: 10,
    requiresHealthKit: false,
  },
  {
    id: 'hrv_inflammation_prior',
    triggerWhen: () => true,
    confidence: 'watching',
    headline: 'Low HRV nights often precede inflammation spikes',
    detail: 'HRV is the most sensitive signal for upcoming flares. Requires Apple Health.',
    signal: 'inflammation',
    driver: 'hrv_sdnn_ms',
    unlocksAtDay: 14,
    requiresHealthKit: true,
  },
  {
    id: 'product_trajectory_prior',
    triggerWhen: (p) => p.onboarding_complete === true,
    confidence: 'watching',
    headline: 'Every product you add gets a before/after trajectory analysis',
    detail: 'As soon as you\'ve used a product for 14 days, we\'ll show you exactly how it moved your skin.',
    signal: 'overall',
    driver: 'product_start',
    unlocksAtDay: 14,
    requiresHealthKit: false,
  },
  // v1 ships with approximately 10-15 priors total;
  // additional priors cover sun damage, exercise, supplements, cycle-hydration,
  // cycle-sun-damage, stress-inflammation, sleep-acne, mindful-inflammation
];
```

The Day 1 Patterns UI shows the **3 most relevant priors** for that user (based on which `triggerWhen` predicates fire). They render like real patterns but with:
- `WATCHING` chip (muted indigo)
- Greyed-out chart template
- Days-remaining counter: *"Real pattern unlocks in 13 days · keep scanning"*
- No share button (you can't share a prediction)

### 6.4 The progress bar

```
─────────────────────────────────────────
 ◆━━━━━━━○━━━━━━━━━━━━━━━━━━━━○━━━━━━━━━○
 1             7              14         21
 (today)  (first receipt)  (unlock)   (mature)
─────────────────────────────────────────
```

Three milestones, visible from day 1:
- **Day 7**: first week receipt card (small celebration)
- **Day 14**: real patterns unlock (the payoff)
- **Day 21**: "mature data" tier — full-confidence patterns available

Persistent element at the top of the Patterns section. Same Duolingo trick: a visible finish line just out of reach is a stronger retention force than a vague promise.

### 6.5 Daily annotations

Each day after day 1, predicted patterns gain a small line underneath showing what the engine observed:

> **Cycle inflammation prior** — `WATCHING`
> *Most cycles produce a 3-7 day inflammation peak before each period.*
>
> **Yesterday:** cycle day 18, inflammation 64. Within normal range. *11 days to unlock.*

Three purposes: reinforces the engine is working, shows the user their data is being watched, creates a tiny daily moment worth opening the app for.

### 6.6 Safety rails

- Predicted patterns **never** show a share button
- Predicted copy uses *"in our data"* / *"most users"* language — never claims to know the specific user's case
- Progress bar and "unlocks at day 14" copy is repeated everywhere — users are told upfront this is a build-up
- If a user has 14+ days of data AND still no real patterns (low variance, missing daily data), predicted patterns transition to a **"Need more data" nudge**: *"Your data is too steady to find patterns yet. Try logging stress and drinks daily — that's where most patterns hide."*

---

## 7. UI specification

### 7.1 Three UI surfaces

1. **Patterns section on Today screen** — compact carousel between `SkinScoreHero` and signal movers
2. **Pattern detail screen** — `app/pattern/[id].tsx`, full-screen scrollable
3. **Share artifact** — 1080×1920 PNG generated on-demand via `react-native-view-shot`

### 7.2 Pattern card (Today screen carousel)

```
┌─────────────────────────────────────────┐
│  Patterns we've found                  →│
├─────────────────────────────────────────┤
│  ╭───────────────────────────────────╮ │
│  │ 🔵 [STRONG]                        │ │
│  │ Your inflammation peaks            │ │
│  │ 3 days before your period          │ │
│  │                                    │ │
│  │ ╭─sparkline───────────────────╮  │ │
│  │ │  ◊      ◊      ◊      ◊     │  │ │
│  │ │ ╱ ╲    ╱ ╲    ╱ ╲    ╱ ╲    │  │ │
│  │ ╰─────────────────────────────╯  │ │
│  │                                    │ │
│  │ Based on 23 days · last 6 weeks    │ │
│  │                                    │ │
│  │  [ See pattern ]   [ Share ↗ ]    │ │
│  ╰───────────────────────────────────╯ │
│  ● ○ ○                                  │
└─────────────────────────────────────────┘
```

- **Confidence pill** (top-left): `STRONG` teal / `MODERATE` amber / `EMERGING` muted indigo / `WATCHING` textMuted
- **Headline** = `insightText`, ≤80 chars, 2 lines, `FontSize.lg`, `sansBold` — this is the screenshot-worthy line
- **Sparkline** 60-80px tall, Reanimated, color-matched to signal (inflammation `#FF7A78`, hydration `#4DA6FF`, etc.)
- For `cycle_signal_phase` patterns, sparkline shows 2-3 cycles overlaid on the same x-axis
- For `health_signal_lag` patterns, sparkline shows two lines (driver + signal)
- For `outlier_day` patterns, sparkline marks the anomalous day
- **Sample line** establishes credibility without showing math
- **Two CTA buttons**: `See pattern` → detail screen; `Share ↗` → export + share sheet
- **Swipe carousel** if > 1 pattern
- **WATCHING patterns** show "Real pattern unlocks in X days" in place of the Share button

### 7.3 Pattern detail screen (`app/pattern/[id].tsx`)

Full-screen, scrollable:

```
┌────────────────────────────────────┐
│  ←                            ⋯    │
│                                    │
│  [STRONG · CYCLE]                  │
│                                    │
│  Your inflammation peaks           │
│  3 days before your period.        │
│                                    │
│  Like clockwork. Across the last   │
│  6 weeks, your inflammation        │
│  signal has risen 12-18 points     │
│  in the 72 hours before each       │
│  period start.                     │
│                                    │
│  ╭─────FULL CHART──────────────╮  │
│  │  (multi-cycle overlay,       │  │
│  │   x-axis = cycle day,        │  │
│  │   y-axis = inflammation)     │  │
│  ╰──────────────────────────────╯  │
│                                    │
│  ── How we found this              │
│  Tracked 23 days across 2.5 of     │
│  your menstrual cycles. Pattern    │
│  appeared by day 14, strengthened  │
│  with each cycle.                  │
│                                    │
│  ── What you can try               │
│  • Increase niacinamide days       │
│    22-28 of your cycle             │
│  • Reduce dairy and sugar in       │
│    the same window                 │
│  • Prioritize sleep                │
│                                    │
│  ╭──[ Share this pattern ↗ ]──╮   │
│  ╰─────────────────────────────╯   │
└────────────────────────────────────┘
```

- **Confidence + type breadcrumb** at top
- **Full detailText** as prose
- **Full chart** (larger than sparkline, readable)
- **"How we found this"** short prose about sample + detection timeline
- **"What you can try"** 1-3 actionable suggestions from a static lookup table keyed on `(pattern.signal, pattern.driver)`. If the user has matching products in their routine, those get name-checked.
- **Share button** — same export flow

### 7.4 Share artifact (the screenshot)

**Format:** 1080×1920 PNG, generated via `react-native-view-shot` capturing a hidden `<View>`.

```
┌────────────────────────────┐ 1080w × 1920h
│                            │
│   ╭──Glowlytics──╮          │
│                            │
│                            │
│   YOUR INFLAMMATION        │
│   PEAKS 3 DAYS             │
│   BEFORE YOUR PERIOD.      │
│                            │
│                            │
│   ╭──LARGE CHART──────╮   │
│   │                    │   │
│   │   ◊╲    ◊╲    ◊╲   │   │
│   │  ╱  ╲  ╱  ╲  ╱  ╲  │   │
│   │ ╱    ╲╱    ╲╱    ╲ │   │
│   │                    │   │
│   ╰────────────────────╯   │
│                            │
│   Based on 23 days         │
│   across 2.5 cycles        │
│                            │
│   glowlytics.ai            │
└────────────────────────────┘
```

- **Solid `Colors.background` cream** — no gradients, crisp on iMessage and IG
- **Signal color as headline accent** (e.g. "INFLAMMATION" in `#FF7A78`)
- **Massive headline** — `FontSize.display`, `sansBold`, centered, hero
- **Chart is the proof** — readable at iMessage thumbnail size
- **Credibility line** at small size
- **Wordmark + URL** as soft footer branding
- **No personal data** beyond the pattern — no name, no scores, no demographics, no streak. Clean for recipient, avoids privacy weirdness when the screenshot circulates.
- **Generated on-demand** via `exportPatternImage(pattern)`, handed to `expo-sharing.shareAsync`, then deleted

### 7.5 Share sheet flow

```
[ Share ↗ ] tapped
   ↓
exportPatternImage(pattern) → file:///tmp/pattern-<id>.png
   ↓
expo-sharing.shareAsync(uri, { dialogTitle: 'Share this pattern' })
   ↓
iOS/Android system share sheet
   ↓
trackEvent('pattern_shared', { pattern_id, pattern_type, share_target? })
   ↓
FileSystem.deleteAsync(uri)
```

No custom share UI. Native iOS share sheet is what users expect.

### 7.6 Discoverability nudges

- **First pattern detected** → one-time push notification: *"Glowlytics found a pattern in your skin. Open the app to see it."* Fires once per user; flag in store.
- **New pattern** → red dot on Patterns header on Today + light haptic when card scrolls into view.
- **Weekly digest** (Sunday) → if 2+ patterns exist, show the strongest in a slightly larger card with copy *"Your strongest pattern this week →"*. (Seed of future Weekly Receipts feature.)

---

## 8. Error handling and edge cases

### 8.1 Failure modes

| Failure | Handling | User sees |
|---|---|---|
| HealthKit permission denied | `healthSync` returns `{ added: 0, errors: ['permission_denied'] }`. Pattern engine runs on self-reported data only. Predicted patterns with `requiresHealthKit: true` show a "Connect Apple Health" prompt. | Soft prompt on Patterns screen: *"Connect Apple Health to unlock 3 more patterns"* — never blocking, not repeated more than once per week. |
| HealthKit returns partial data (sleep yes, HRV no) | Each metric stored independently. `partial: true` flag. Patterns using missing metrics skip that day. | Nothing. |
| Pattern engine throws | Wrapped in try/catch. Logs to PostHog as `pattern_engine_error`. Returns previous pattern set from store cache. | Nothing — stale patterns remain visible. Engine retries on next scan. |
| No patterns found after 14 days | "Need more data" nudge fires. | Encouragement to log more daily data. |
| Stale pattern (correlation weakened) | Pattern recomputed; if confidence drops below `emerging`, removed. `firstSeenAt` preserved to prevent re-surfacing after dismissal. | Pattern disappears silently. |
| HealthKit sync fails mid-batch | Whatever was written is preserved. Next sync resumes from last successful date. | Nothing. |
| Backend offline (v2 mirror) | All pattern logic runs locally. Backend retries on foreground. | Nothing. |
| Photo export fails | Catch + `pattern_export_failed` analytics. Toast: *"Couldn't generate share image. Try again?"* | Toast + retry. |
| 100+ days of data — engine slow | Cap input at last 90 days. | Nothing. |

### 8.2 Edge cases that must be tested

1. Brand new user, first scan, no daily records → First Look insight + 3 predicted patterns. No errors.
2. User with 14 days of scans but no daily records → Predicted patterns only + "log daily data" nudge.
3. User with 14 days of daily records but no scans → Engine handles gracefully, returns empty patterns (shouldn't happen but must not crash).
4. User with one strong outlier day → `outlier_day` pattern fires by day 5.
5. User with regular cycle, 1.5 cycles logged → `cycle_signal_phase` eligible. Correct cycle-day alignment across cycles.
6. User stopped scanning for 10 days, resumed → Gap treated as null days, no extrapolation.
7. User revoked HealthKit permission after granting → Sync fails gracefully, existing data preserved, new data stops, health-dependent patterns age out.
8. User in Expo Go (no native HealthKit module) → `healthPermissions.ts` returns `'unavailable'`. Pattern engine runs on self-reported data only. No errors, no nag.
9. User scans 3× in one day → Use latest scan per day. No double-counting.
10. User with extremely consistent signals (zero variance) → Correlations impossible. "Too steady" message instead of fake patterns.

---

## 9. Testing strategy

### 9.1 Layer 1: Pure unit tests on `patternEngine.ts`

Target file: `RadianceIQ/src/services/__tests__/patternEngine.test.ts`

Fixture-based. Synthetic data builders in `RadianceIQ/src/services/__tests__/fixtures/patternFixtures.ts` use a seeded PRNG for reproducibility.

**Target: 30+ unit tests.** Coverage:
- Each of the 5 pattern types has at least 3 tests: happy path, insufficient data, noisy/washed-out
- All 4 confidence tiers (strong, moderate, emerging, watching)
- Lag analysis correctness (lag 0, lag 1, lag 2, lag 3)
- Cold-start returns 3 predicted patterns for a new user with cycle + drink profile
- Per-signal dedup works (two competing drivers → highest-confidence one wins)
- Pattern demotion when new noisy data weakens an existing pattern
- Exactly 5 patterns returned when more exist

Example:

```typescript
describe('patternEngine.detectPatterns', () => {
  describe('cycle_signal_phase', () => {
    it('detects strong cycle-inflammation pattern with 2 full cycles of clean data', () => {
      const input = buildSyntheticCycleData({
        cycles: 2,
        cycleLength: 28,
        inflammationPeakDayOffset: -3,
        peakAmplitude: 18,
        noise: 2,
      });
      const patterns = detectPatterns(input);
      const cyclePattern = patterns.find(p => p.type === 'cycle_signal_phase');
      expect(cyclePattern).toBeDefined();
      expect(cyclePattern!.confidence).toBe('strong');
      expect(cyclePattern!.lagDays).toBe(-3);
      expect(cyclePattern!.signal).toBe('inflammation');
    });

    it('does NOT detect with only 1 cycle', () => {
      const input = buildSyntheticCycleData({
        cycles: 1,
        cycleLength: 28,
        inflammationPeakDayOffset: -3,
        peakAmplitude: 18,
        noise: 2,
      });
      const patterns = detectPatterns(input);
      expect(patterns.find(p => p.type === 'cycle_signal_phase')).toBeUndefined();
    });

    it('does NOT reach strong confidence with high noise', () => {
      const input = buildSyntheticCycleData({
        cycles: 3,
        cycleLength: 28,
        inflammationPeakDayOffset: -3,
        peakAmplitude: 5,
        noise: 20,
      });
      const patterns = detectPatterns(input);
      const cyclePattern = patterns.find(p => p.type === 'cycle_signal_phase');
      expect(cyclePattern?.confidence).not.toBe('strong');
    });
  });
});
```

### 9.2 Layer 2: Integration tests on `healthSync.ts`

Target file: `RadianceIQ/src/services/__tests__/healthSync.test.ts`

Mock the `@kingstinct/react-native-healthkit` module. **Target: 10 tests.** Verify:
- Sync writes correct shapes to store
- Partial data flagged correctly
- Sync errors don't corrupt existing data
- Last-sync timestamp updates only on success
- Duplicate sync (same date twice) doesn't create duplicate records
- Deep/REM sleep stages parsed correctly from HKCategoryValueSleepAnalysis

### 9.3 Layer 3: Component tests on `PatternCard`

Target file: `RadianceIQ/src/components/__tests__/PatternCard.test.tsx`

React Native Testing Library. **Target: 8 tests.** Verify:
- Renders correctly for each confidence tier
- Renders correctly for each pattern type
- Predicted vs real rendering
- Share button only appears for real patterns, never predicted
- Tapping See pattern calls navigation with correct params
- Tapping Share calls `exportPatternImage` + `shareAsync`

### 9.4 Layer 4: Manual test plan

Save as `docs/superpowers/specs/2026-04-07-pattern-engine-manual-tests.md` alongside this spec.

Manual test plan covers the device-only stuff that can't be unit-tested:
- HealthKit permission flow on a real device (request, grant, deny, re-request)
- Share sheet flow (export → iMessage, export → IG Stories, export → AirDrop)
- Push notification on pattern unlock (real device, real APNs)
- Cold start scaffold visual check
- Background sync on app resume (simulate stale state, foreground app, verify sync fires)
- First Look insight rendering on different data shapes

### 9.5 Performance testing

- Pattern engine on 90 days of synthetic data: assert `duration_ms < 100` in a perf test
- Pattern card render in carousel: verify 60fps via Reanimated devtools during manual testing
- Share image generation: assert `< 800ms` from tap to share sheet in manual testing

---

## 10. Analytics (PostHog events)

Wire into `RadianceIQ/src/services/analytics.ts`:

| Event | Properties | Purpose |
|---|---|---|
| `pattern_engine_run` | `run_duration_ms`, `pattern_count`, `predicted_count`, `data_days` | Perf + cold-start ratio |
| `pattern_first_seen` | `pattern_type`, `confidence`, `data_days_at_detection` | **Time-to-first-pattern (key metric)** |
| `pattern_viewed` | `pattern_id`, `pattern_type`, `confidence`, `is_predicted` | Engagement |
| `pattern_shared` | `pattern_id`, `pattern_type`, `share_target?` | **PMF metric — referral attempts** |
| `pattern_engine_error` | `error_message`, `stack_short` | Reliability |
| `health_sync_completed` | `metrics_synced`, `partial`, `duration_ms` | HealthKit reliability |
| `health_sync_failed` | `error_code`, `error_message` | HealthKit debugging |
| `health_permission_state` | `state`, `metrics_granted` | Permission funnel |
| `first_look_insight_shown` | `insight_driver` | Day 1 engagement |
| `pattern_unlock_notification_shown` | `pattern_count_at_unlock` | Day 14 funnel |

**The north-star metric: `pattern_shared` events per user per week.** This is the PMF signal.

---

## 11. Rollout plan

1. **Stage 1 — Engine only** (no UI, no HealthKit)
   - Build `patternEngine.ts` + tests
   - Build prior table + `generateFirstLookInsight`
   - Run engine on synthetic data in tests
   - No user impact

2. **Stage 2 — HealthKit wiring** (no UI)
   - Add `@kingstinct/react-native-healthkit` config plugin
   - Replace `healthPermissions.ts` mocks with real implementation
   - Build `healthSync.ts`
   - Add new store fields + persistence
   - Extend `healthPermissions` onboarding screen flow

3. **Stage 3 — Pattern card UI** (Today screen only, no detail, no share)
   - Build `PatternCard` component
   - Wire into Today screen between `SkinScoreHero` and signal movers
   - Progress bar + cold-start scaffold UI
   - Predicted patterns visible

4. **Stage 4 — Detail screen**
   - Build `app/pattern/[id].tsx`
   - Full chart rendering
   - "What you can try" static lookup table

5. **Stage 5 — Share artifact**
   - Hidden export view
   - `react-native-view-shot` integration
   - `expo-sharing` wiring
   - Analytics events

6. **Stage 6 — Push notification on pattern unlock**
   - One-time notification the first time a real pattern is detected
   - Store flag to prevent re-firing

7. **Stage 7 — Privacy + App Store prep**
   - Privacy policy update
   - App Store nutrition label update
   - HealthKit purpose strings

**Each stage is its own implementation sub-plan.** The writing-plans skill should decompose accordingly.

---

## 12. Open questions (accepted for v1)

Resolved during brainstorming:
- ~~HealthKit metric set~~ → 6 metrics (sleep, sleep stages, HRV, RHR, steps, mindful)
- ~~Local vs backend mirror~~ → Local-only in v1
- ~~Sync strategy~~ → On foreground if stale
- ~~Pattern type set~~ → All 5 (cycle, health-lag, lifestyle, product, outlier)
- ~~Confidence thresholds~~ → As specified in §5.3
- ~~Share artifact format~~ → 1080×1920 Story format
- ~~"What you can try" section~~ → Keep in v1
- ~~First Look insights~~ → All 6 (the 5 original + the positive percentile addition)

Deferred to v2:
- Android HealthConnect integration
- Backend mirror of pattern results (for cross-device continuity)
- Weekly Receipts wrapper (Approach 2)
- Background fetch / silent push for sync
- Additional HealthKit metrics (workouts, body temp, oxygen)
- Pair mode / social features (Approach 3)

---

## 13. Success criteria for v1

- **Technical:** pattern engine runs in <100ms on 90 days of data; 30+ passing unit tests; 0 TS errors
- **Product:** `pattern_first_seen` event fires for >80% of users by day 14 of use (engine works at scale)
- **PMF signal:** `pattern_shared` events per weekly-active user trending up over 4 weeks post-launch
- **Retention:** D14 retention improves vs the pre-Pattern baseline by at least 15%
- **Privacy:** zero HealthKit raw values transmitted to backend; App Store review passes with updated nutrition labels

---

*End of spec.*
