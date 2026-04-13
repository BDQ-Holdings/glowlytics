# HealthKit Onboarding & Settings Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a HealthKit onboarding screen that asks for health data access, seeds the Pattern Engine with 14 days of data, auto-skips manual menstrual screens for female users whose cycle data is in HealthKit, and adds a Health Data card to the Profile tab.

**Architecture:** Types + config first (Task 1), then the flow builder (Task 2), then pure cycle-derivation helpers (Task 3), then HealthKit sync expansion (Task 4), then store (Task 5), then the two screens (Tasks 6-7). Each task produces a commit. TDD throughout — tests before implementation.

**Tech Stack:** React Native + Expo SDK 54, TypeScript strict, Zustand, `@kingstinct/react-native-healthkit@13.4.0` (already installed), PostHog analytics.

**Source spec:** `docs/superpowers/specs/2026-04-09-healthkit-onboarding-design.md`

---

## Table of Contents

- **Task 1** — Types, permissions config, app.json (foundation)
- **Task 2** — Onboarding flow builder rewrite + tests
- **Task 3** — Cycle derivation helpers: `deriveCycleDay`, `pickMaxSeverity`, `groupEpisodes` + tests
- **Task 4** — `detectCycleFromHealthKit` + menstrual query in `syncOneDay` + `syncHealthDataInitial`
- **Task 5** — `firstLookInsight` generator service + tests
- **Task 6** — `health-permission.tsx` onboarding screen
- **Task 7** — Profile Health Data card + `formatRelativeTime` utility

---

## File Structure

### Files modified
| Path | Purpose |
|---|---|
| `RadianceIQ/src/types/index.ts` | Expand `HealthDataType`, `OnboardingScreenName`, `HealthDailyRecord`, `HealthConnectionState` |
| `RadianceIQ/src/services/healthPermissions.ts` | Add menstrual to `READ_IDENTIFIERS` + `REQUESTED_TYPES` |
| `RadianceIQ/app.json` | Update `NSHealthShareUsageDescription` to mention menstrual flow |
| `RadianceIQ/src/services/onboardingFlow.ts` | Add `healthSyncedCycleDetected` param, reorder flow |
| `RadianceIQ/src/services/__tests__/onboardingFlow.test.ts` | Update existing tests + add new ones |
| `RadianceIQ/src/services/healthSync.ts` | Add menstrual query, `deriveCycleDay`, `pickMaxSeverity`, `groupEpisodes`, `detectCycleFromHealthKit` |
| `RadianceIQ/src/store/useStore.ts` | Add `syncHealthDataInitial` action |
| `RadianceIQ/app/(tabs)/profile.tsx` | Add Health Data card between Account and Notifications |

### Files created
| Path | Purpose |
|---|---|
| `RadianceIQ/src/services/__tests__/healthSync.test.ts` | Unit tests for cycle helpers and menstrual sync |
| `RadianceIQ/src/services/firstLookInsight.ts` | Day-1 insight generator |
| `RadianceIQ/src/services/__tests__/firstLookInsight.test.ts` | Tests for insight generator |
| `RadianceIQ/app/onboarding/health-permission.tsx` | New onboarding screen |
| `RadianceIQ/src/utils/formatRelativeTime.ts` | "2 hours ago" relative time formatter |
| `RadianceIQ/src/utils/__tests__/formatRelativeTime.test.ts` | Tests for relative time formatter |

---

## Task 1: Types, permissions config, app.json

**Files:**
- Modify: `RadianceIQ/src/types/index.ts` (lines 12, 22-26, 307-325, 28-37)
- Modify: `RadianceIQ/src/services/healthPermissions.ts` (lines 13-17, 21-27)
- Modify: `RadianceIQ/app.json` (lines 26, 97)

- [ ] **Step 1: Expand `HealthDataType` union**

In `RadianceIQ/src/types/index.ts`, replace line 12:

```typescript
export type HealthDataType = 'sleep' | 'resting_heart_rate' | 'heart_rate_variability';
```

with:

```typescript
export type HealthDataType =
  | 'sleep'
  | 'resting_heart_rate'
  | 'heart_rate_variability'
  | 'steps'
  | 'mindful_minutes'
  | 'menstrual_flow';
```

- [ ] **Step 2: Add `'health-permission'` to `OnboardingScreenName`**

In `RadianceIQ/src/types/index.ts`, replace lines 22-26:

```typescript
export type OnboardingScreenName =
  | 'welcome' | 'age-range' | 'sex' | 'location' | 'skin-goal'
  | 'products' | 'menstrual' | 'cycle-details' | 'supplements' | 'exercise'
  | 'shower-frequency' | 'hand-washing' | 'scan-reminder'
  | 'camera-permission' | 'ready' | 'preview' | 'paywall';
```

with:

```typescript
export type OnboardingScreenName =
  | 'welcome' | 'age-range' | 'sex' | 'location' | 'skin-goal'
  | 'products' | 'menstrual' | 'cycle-details' | 'supplements' | 'exercise'
  | 'shower-frequency' | 'hand-washing' | 'scan-reminder'
  | 'camera-permission' | 'health-permission' | 'ready' | 'preview' | 'paywall';
```

- [ ] **Step 3: Add 2 new fields to `HealthDailyRecord`**

In `RadianceIQ/src/types/index.ts`, after line 321 (`mindful_minutes: number | null;`), add:

```typescript
  // Menstrual (HKCategoryTypeIdentifierMenstrualFlow)
  menstrual_flow: 'none' | 'light' | 'medium' | 'heavy' | 'unspecified' | null;
  // Derived cycle day (1-based, from detected period starts within last 90 days)
  cycle_day_estimated: number | null;
```

- [ ] **Step 4: Add `cycle_detected` to `HealthConnectionState`**

In `RadianceIQ/src/types/index.ts`, after line 36 (`availability_note?: string;`), add:

```typescript
  cycle_detected?: boolean;
```

- [ ] **Step 5: Expand `READ_IDENTIFIERS` in healthPermissions.ts**

In `RadianceIQ/src/services/healthPermissions.ts`, replace lines 21-27:

```typescript
const READ_IDENTIFIERS = [
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKCategoryTypeIdentifierMindfulSession',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierStepCount',
] as const;
```

with:

```typescript
const READ_IDENTIFIERS = [
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKCategoryTypeIdentifierMindfulSession',
  'HKCategoryTypeIdentifierMenstrualFlow',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierStepCount',
] as const;
```

- [ ] **Step 6: Expand `REQUESTED_TYPES`**

In `RadianceIQ/src/services/healthPermissions.ts`, replace lines 13-17:

```typescript
const REQUESTED_TYPES: HealthDataType[] = [
  'sleep',
  'resting_heart_rate',
  'heart_rate_variability',
];
```

with:

```typescript
const REQUESTED_TYPES: HealthDataType[] = [
  'sleep',
  'resting_heart_rate',
  'heart_rate_variability',
  'steps',
  'mindful_minutes',
  'menstrual_flow',
];
```

- [ ] **Step 7: Update NSHealthShareUsageDescription in app.json**

In `RadianceIQ/app.json`, replace the two occurrences of:

```
Glowlytics reads sleep, heart rate, HRV, steps, and mindful minutes from Apple Health to find patterns in your skin. This data stays on your device.
```

with:

```
Glowlytics reads sleep, heart rate, HRV, steps, mindful minutes, and menstrual flow from Apple Health to find patterns in your skin. This data stays on your device.
```

This appears at line 26 (`expo.ios.infoPlist.NSHealthShareUsageDescription`) and line 97 (inside the `@kingstinct/react-native-healthkit` plugin config).

- [ ] **Step 8: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: Type errors in `healthSync.ts` because `HealthDailyRecord` now requires `menstrual_flow` and `cycle_day_estimated` fields. That's expected — Task 4 fixes them. For now, verify the NEW type definitions themselves are syntactically valid (no missing commas, no duplicate keys). If more than the expected `healthSync.ts` errors appear, fix.

- [ ] **Step 9: Commit**

```bash
git add RadianceIQ/src/types/index.ts RadianceIQ/src/services/healthPermissions.ts RadianceIQ/app.json
git commit -m "types: expand HealthKit types + menstrual flow + health-permission screen name"
```

---

## Task 2: Onboarding flow builder rewrite + tests

**Files:**
- Modify: `RadianceIQ/src/services/onboardingFlow.ts`
- Modify: `RadianceIQ/src/services/__tests__/onboardingFlow.test.ts`

- [ ] **Step 1: Update the existing onboarding flow tests for the new screen**

In `RadianceIQ/src/services/__tests__/onboardingFlow.test.ts`, the existing tests check flow lengths and content. They will BREAK because we're adding `'health-permission'` to every flow (+1 to all lengths) and reordering the menstrual branch. Update the existing tests and add new ones.

Replace the ENTIRE file contents with:

```typescript
import {
  buildOnboardingFlow,
  screenToRoute,
  getNextScreen,
  getPreviousScreen,
} from '../onboardingFlow';

describe('onboardingFlow', () => {
  describe('buildOnboardingFlow', () => {
    it('builds base flow with essential screens including health-permission', () => {
      const flow = buildOnboardingFlow();
      expect(flow).toContain('welcome');
      expect(flow).toContain('age-range');
      expect(flow).toContain('sex');
      expect(flow).toContain('skin-goal');
      expect(flow).toContain('camera-permission');
      expect(flow).toContain('health-permission');
      expect(flow).toContain('preview');
      expect(flow).toContain('paywall');
      expect(flow).not.toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
    });

    it('does not include deferred screens', () => {
      const flow = buildOnboardingFlow();
      expect(flow).not.toContain('location');
      expect(flow).not.toContain('products');
      expect(flow).not.toContain('supplements');
      expect(flow).not.toContain('exercise');
      expect(flow).not.toContain('shower-frequency');
      expect(flow).not.toContain('hand-washing');
      expect(flow).not.toContain('scan-reminder');
      expect(flow).not.toContain('ready');
    });

    it('places health-permission immediately after camera-permission', () => {
      const flow = buildOnboardingFlow();
      const cameraIndex = flow.indexOf('camera-permission');
      const healthIndex = flow.indexOf('health-permission');
      expect(healthIndex).toBe(cameraIndex + 1);
    });

    it('places camera-permission after skin-goal for base flow', () => {
      const flow = buildOnboardingFlow();
      const goalIndex = flow.indexOf('skin-goal');
      const cameraIndex = flow.indexOf('camera-permission');
      expect(cameraIndex).toBe(goalIndex + 1);
    });

    it('builds male flow without menstrual screens', () => {
      const flow = buildOnboardingFlow('male');
      expect(flow).not.toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
    });

    it('inserts menstrual screen for female users after health-permission', () => {
      const flow = buildOnboardingFlow('female');
      expect(flow).toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
      const healthIndex = flow.indexOf('health-permission');
      const menstrualIndex = flow.indexOf('menstrual');
      expect(menstrualIndex).toBe(healthIndex + 1);
    });

    it('inserts cycle-details for female with regular cycle', () => {
      const flow = buildOnboardingFlow('female', 'regular');
      expect(flow).toContain('menstrual');
      expect(flow).toContain('cycle-details');
      const menstrualIndex = flow.indexOf('menstrual');
      const cycleIndex = flow.indexOf('cycle-details');
      expect(cycleIndex).toBe(menstrualIndex + 1);
    });

    it('inserts cycle-details for female with irregular cycle', () => {
      const flow = buildOnboardingFlow('female', 'irregular');
      expect(flow).toContain('cycle-details');
    });

    it('does not insert cycle-details when menstrual status is no', () => {
      const flow = buildOnboardingFlow('female', 'no');
      expect(flow).toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
    });

    it('does not insert cycle-details for prefer_not', () => {
      const flow = buildOnboardingFlow('female', 'prefer_not');
      expect(flow).toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
    });

    it('does not insert menstrual screens for other sex', () => {
      const flow = buildOnboardingFlow('other');
      expect(flow).not.toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
    });

    it('always starts with welcome and ends with paywall', () => {
      const flows = [
        buildOnboardingFlow(),
        buildOnboardingFlow('male'),
        buildOnboardingFlow('female'),
        buildOnboardingFlow('female', 'regular'),
        buildOnboardingFlow('female', 'regular', true),
      ];
      for (const flow of flows) {
        expect(flow[0]).toBe('welcome');
        expect(flow[flow.length - 1]).toBe('paywall');
      }
    });

    it('has correct length for each path', () => {
      expect(buildOnboardingFlow().length).toBe(8);              // base (+health-permission)
      expect(buildOnboardingFlow('male').length).toBe(8);        // same as base
      expect(buildOnboardingFlow('female').length).toBe(9);      // +menstrual
      expect(buildOnboardingFlow('female', 'regular').length).toBe(10);  // +menstrual +cycle-details
      expect(buildOnboardingFlow('female', 'irregular').length).toBe(10);
      expect(buildOnboardingFlow('female', 'no').length).toBe(9);       // +menstrual only
    });

    // NEW: healthSyncedCycleDetected = true skips menstrual screens
    it('skips menstrual + cycle-details for female when HealthKit cycle detected', () => {
      const flow = buildOnboardingFlow('female', 'regular', true);
      expect(flow).not.toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
      expect(flow).toContain('health-permission');
    });

    it('skips menstrual for female with no menstrualStatus when HealthKit cycle detected', () => {
      const flow = buildOnboardingFlow('female', undefined, true);
      expect(flow).not.toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
    });

    it('keeps menstrual for female when healthSyncedCycleDetected is false', () => {
      const flow = buildOnboardingFlow('female', 'regular', false);
      expect(flow).toContain('menstrual');
      expect(flow).toContain('cycle-details');
    });

    it('keeps menstrual for female when healthSyncedCycleDetected is undefined (default)', () => {
      const flow = buildOnboardingFlow('female', 'regular', undefined);
      expect(flow).toContain('menstrual');
      expect(flow).toContain('cycle-details');
    });

    it('ignores healthSyncedCycleDetected for male users', () => {
      const flow = buildOnboardingFlow('male', undefined, true);
      expect(flow).not.toContain('menstrual');
      expect(flow).not.toContain('cycle-details');
      expect(flow.length).toBe(8);
    });

    it('has correct length when HealthKit skips menstrual', () => {
      expect(buildOnboardingFlow('female', 'regular', true).length).toBe(8);  // same as base
      expect(buildOnboardingFlow('female', 'irregular', true).length).toBe(8);
    });
  });

  describe('screenToRoute', () => {
    it('converts screen name to route path', () => {
      expect(screenToRoute('welcome')).toBe('/onboarding/welcome');
      expect(screenToRoute('age-range')).toBe('/onboarding/age-range');
      expect(screenToRoute('camera-permission')).toBe('/onboarding/camera-permission');
      expect(screenToRoute('health-permission')).toBe('/onboarding/health-permission');
      expect(screenToRoute('preview')).toBe('/onboarding/preview');
      expect(screenToRoute('paywall')).toBe('/onboarding/paywall');
    });
  });

  describe('getNextScreen', () => {
    it('returns next screen in flow', () => {
      const flow = buildOnboardingFlow();
      expect(getNextScreen(flow, 0)).toBe('age-range');
      expect(getNextScreen(flow, 1)).toBe('sex');
    });

    it('returns null at end of flow', () => {
      const flow = buildOnboardingFlow();
      expect(getNextScreen(flow, flow.length - 1)).toBeNull();
    });
  });

  describe('getPreviousScreen', () => {
    it('returns previous screen in flow', () => {
      const flow = buildOnboardingFlow();
      expect(getPreviousScreen(flow, 1)).toBe('welcome');
      expect(getPreviousScreen(flow, 2)).toBe('age-range');
    });

    it('returns null at start of flow', () => {
      const flow = buildOnboardingFlow();
      expect(getPreviousScreen(flow, 0)).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd RadianceIQ && npm test -- --testPathPattern=onboardingFlow`

Expected: Multiple failures because the flow builder hasn't been updated yet. Specifically: length mismatches (expecting 8, getting 7), missing `'health-permission'`, menstrual placed before camera-permission.

- [ ] **Step 3: Rewrite buildOnboardingFlow**

Replace the entire contents of `RadianceIQ/src/services/onboardingFlow.ts`:

```typescript
import type { BiologicalSex, MenstrualStatus, OnboardingScreenName } from '../types';

/**
 * Builds the onboarding screen flow based on user answers.
 *
 * Flow order:
 *   welcome → age-range → sex → skin-goal → camera-permission → health-permission
 *     → [menstrual → cycle-details]? (female AND !healthSyncedCycleDetected)
 *     → preview → paywall
 *
 * The third argument `healthSyncedCycleDetected` is set by the health-permission
 * screen after granting HealthKit access. When true AND user is female, the manual
 * menstrual + cycle-details screens are skipped because HealthKit already provides
 * the cycle data.
 */
export function buildOnboardingFlow(
  sex?: BiologicalSex,
  menstrualStatus?: MenstrualStatus,
  healthSyncedCycleDetected?: boolean,
): OnboardingScreenName[] {
  const flow: OnboardingScreenName[] = [
    'welcome',
    'age-range',
    'sex',
    'skin-goal',
    'camera-permission',
    'health-permission',
  ];

  // Female users who did NOT get cycle data from HealthKit: show manual screens.
  if (sex === 'female' && !healthSyncedCycleDetected) {
    flow.push('menstrual');
    if (menstrualStatus === 'regular' || menstrualStatus === 'irregular') {
      flow.push('cycle-details');
    }
  }

  flow.push('preview', 'paywall');

  return flow;
}

/**
 * Maps an OnboardingScreenName to the Expo Router path.
 */
export function screenToRoute(screen: OnboardingScreenName): string {
  return `/onboarding/${screen}`;
}

/**
 * Returns the next screen in the flow, or null if at the end.
 */
export function getNextScreen(
  flow: OnboardingScreenName[],
  currentIndex: number,
): OnboardingScreenName | null {
  if (currentIndex + 1 >= flow.length) return null;
  return flow[currentIndex + 1];
}

/**
 * Returns the previous screen in the flow, or null if at the start.
 */
export function getPreviousScreen(
  flow: OnboardingScreenName[],
  currentIndex: number,
): OnboardingScreenName | null {
  if (currentIndex <= 0) return null;
  return flow[currentIndex - 1];
}
```

- [ ] **Step 4: Run the tests**

Run: `cd RadianceIQ && npm test -- --testPathPattern=onboardingFlow`

Expected: All tests pass.

- [ ] **Step 5: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: Same errors from Task 1 Step 8 (healthSync.ts missing new HealthDailyRecord fields) — no NEW errors from this task.

- [ ] **Step 6: Commit**

```bash
git add RadianceIQ/src/services/onboardingFlow.ts RadianceIQ/src/services/__tests__/onboardingFlow.test.ts
git commit -m "feat: reorder onboarding flow — health-permission + conditional menstrual skip"
```

---

## Task 3: Cycle derivation helpers + tests

**Files:**
- Create: `RadianceIQ/src/services/__tests__/healthSync.test.ts`
- Modify: `RadianceIQ/src/services/healthSync.ts` (add exported helpers ONLY — not the HealthKit query changes yet)

These are PURE functions with no HealthKit dependency, so they can be tested directly without mocks.

- [ ] **Step 1: Write the tests**

Create `RadianceIQ/src/services/__tests__/healthSync.test.ts`:

```typescript
import { deriveCycleDay, pickMaxSeverity, groupEpisodes } from '../healthSync';

// Helper: build a menstrual sample for a given date + flow level
function buildSample(dateStr: string, value: number) {
  const d = new Date(`${dateStr}T12:00:00`);
  return { startDate: d, endDate: d, value };
}

// Flow enum values from @kingstinct/react-native-healthkit CategoryValueMenstrualFlow
const FLOW = { unspecified: 1, light: 2, medium: 3, heavy: 4, none: 5 };

describe('pickMaxSeverity', () => {
  it('returns null for empty array', () => {
    expect(pickMaxSeverity([])).toBeNull();
  });

  it('picks heavy when present', () => {
    expect(pickMaxSeverity([
      { value: FLOW.light },
      { value: FLOW.heavy },
      { value: FLOW.medium },
    ])).toBe('heavy');
  });

  it('maps unspecified correctly', () => {
    expect(pickMaxSeverity([{ value: FLOW.unspecified }])).toBe('unspecified');
  });

  it('maps none (enum 5) correctly', () => {
    expect(pickMaxSeverity([{ value: FLOW.none }])).toBe('none');
  });

  it('picks medium over light', () => {
    expect(pickMaxSeverity([
      { value: FLOW.light },
      { value: FLOW.medium },
    ])).toBe('medium');
  });
});

describe('groupEpisodes', () => {
  it('returns empty for no samples', () => {
    expect(groupEpisodes([])).toEqual([]);
  });

  it('groups consecutive days into one episode', () => {
    const samples = [
      buildSample('2026-03-01', FLOW.heavy),
      buildSample('2026-03-02', FLOW.medium),
      buildSample('2026-03-03', FLOW.light),
    ];
    const episodes = groupEpisodes(samples);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].startDate.toISOString()).toContain('2026-03-01');
    expect(episodes[0].days).toBe(3);
  });

  it('splits episodes with >2 day gap', () => {
    const samples = [
      buildSample('2026-03-01', FLOW.heavy),
      buildSample('2026-03-02', FLOW.medium),
      // 3-day gap
      buildSample('2026-03-06', FLOW.heavy),
      buildSample('2026-03-07', FLOW.medium),
    ];
    const episodes = groupEpisodes(samples);
    expect(episodes).toHaveLength(2);
  });

  it('tolerates 1-day gap within an episode (user forgot to log)', () => {
    const samples = [
      buildSample('2026-03-01', FLOW.heavy),
      // 1-day gap (Mar 2 missing)
      buildSample('2026-03-03', FLOW.light),
    ];
    const episodes = groupEpisodes(samples);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].days).toBe(3);
  });

  it('drops isolated 1-day samples (spotting)', () => {
    const samples = [
      buildSample('2026-03-15', FLOW.light),  // isolated — no neighbors within 2 days
    ];
    const episodes = groupEpisodes(samples);
    expect(episodes).toHaveLength(0);
  });
});

describe('deriveCycleDay', () => {
  it('returns null for empty samples', () => {
    expect(deriveCycleDay([], new Date('2026-04-09'))).toBeNull();
  });

  it('returns correct day for single episode 8 days ago', () => {
    const samples = [
      buildSample('2026-04-01', FLOW.heavy),
      buildSample('2026-04-02', FLOW.medium),
      buildSample('2026-04-03', FLOW.light),
    ];
    const today = new Date('2026-04-09T12:00:00');
    expect(deriveCycleDay(samples, today)).toBe(9); // Apr 1 → Apr 9 = 8 days elapsed + 1
  });

  it('returns 1 for ongoing period (samples include today)', () => {
    const samples = [
      buildSample('2026-04-08', FLOW.heavy),
      buildSample('2026-04-09', FLOW.medium),
    ];
    const today = new Date('2026-04-09T12:00:00');
    expect(deriveCycleDay(samples, today)).toBe(2); // Apr 8 start → Apr 9 = 1 day + 1
  });

  it('returns null for stale episode (>60 days ago)', () => {
    const samples = [
      buildSample('2026-01-15', FLOW.heavy),
      buildSample('2026-01-16', FLOW.medium),
    ];
    const today = new Date('2026-04-09T12:00:00');
    expect(deriveCycleDay(samples, today)).toBeNull();
  });

  it('uses most recent episode when multiple present', () => {
    const samples = [
      buildSample('2026-03-01', FLOW.heavy),
      buildSample('2026-03-02', FLOW.medium),
      buildSample('2026-03-29', FLOW.heavy),
      buildSample('2026-03-30', FLOW.medium),
    ];
    const today = new Date('2026-04-09T12:00:00');
    // Most recent episode starts Mar 29 → Apr 9 = 11 days + 1 = 12
    expect(deriveCycleDay(samples, today)).toBe(12);
  });

  it('drops isolated spotting and uses real episode', () => {
    const samples = [
      buildSample('2026-03-20', FLOW.light),  // isolated spotting
      buildSample('2026-04-01', FLOW.heavy),
      buildSample('2026-04-02', FLOW.medium),
    ];
    const today = new Date('2026-04-09T12:00:00');
    expect(deriveCycleDay(samples, today)).toBe(9);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd RadianceIQ && npm test -- --testPathPattern=healthSync`

Expected: Failures — `deriveCycleDay`, `pickMaxSeverity`, `groupEpisodes` not exported from `healthSync.ts`.

- [ ] **Step 3: Implement the pure helpers**

In `RadianceIQ/src/services/healthSync.ts`, add the following BEFORE the `syncOneDay` function (after the `generateId` line, around line 10):

```typescript
// ─── Menstrual flow severity mapping ─────────────────────────────
// CategoryValueMenstrualFlow enum: unspecified=1, light=2, medium=3, heavy=4, none=5.
// Note: none=5 is weirdly out of order — common HealthKit footgun.
type MenstrualFlowLevel = 'none' | 'light' | 'medium' | 'heavy' | 'unspecified';
const FLOW_SEVERITY: Record<number, { label: MenstrualFlowLevel; rank: number }> = {
  1: { label: 'unspecified', rank: 1 },
  2: { label: 'light', rank: 2 },
  3: { label: 'medium', rank: 3 },
  4: { label: 'heavy', rank: 4 },
  5: { label: 'none', rank: 0 },
};

export function pickMaxSeverity(
  samples: { value: number }[],
): MenstrualFlowLevel | null {
  if (samples.length === 0) return null;
  let maxRank = -1;
  let maxLabel: MenstrualFlowLevel = 'none';
  for (const s of samples) {
    const entry = FLOW_SEVERITY[s.value];
    if (entry && entry.rank > maxRank) {
      maxRank = entry.rank;
      maxLabel = entry.label;
    }
  }
  return maxLabel;
}

// ─── Cycle episode grouping ──────────────────────────────────────

interface Episode {
  startDate: Date;
  endDate: Date;
  days: number;
}

export function groupEpisodes(
  samples: { startDate: Date; endDate: Date; value: number }[],
): Episode[] {
  if (samples.length === 0) return [];

  // Sort ascending by startDate
  const sorted = [...samples].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );

  const episodes: Episode[] = [];
  let episodeStart = new Date(sorted[0].startDate);
  let episodeEnd = new Date(sorted[0].startDate);
  let sampleCount = 1;

  for (let i = 1; i < sorted.length; i++) {
    const current = new Date(sorted[i].startDate);
    const gapDays =
      (current.getTime() - new Date(episodeEnd).getTime()) / (1000 * 60 * 60 * 24);

    if (gapDays <= 2) {
      // Same episode (≤2 day gap tolerance)
      episodeEnd = current;
      sampleCount++;
    } else {
      // Flush previous episode (only if ≥2 samples — drop isolated spotting)
      if (sampleCount >= 2) {
        const days =
          Math.round(
            (new Date(episodeEnd).getTime() - new Date(episodeStart).getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1;
        episodes.push({ startDate: new Date(episodeStart), endDate: new Date(episodeEnd), days });
      }
      // Start new episode
      episodeStart = current;
      episodeEnd = current;
      sampleCount = 1;
    }
  }

  // Flush last episode
  if (sampleCount >= 2) {
    const days =
      Math.round(
        (new Date(episodeEnd).getTime() - new Date(episodeStart).getTime()) /
          (1000 * 60 * 60 * 24),
      ) + 1;
    episodes.push({ startDate: new Date(episodeStart), endDate: new Date(episodeEnd), days });
  }

  return episodes;
}

// ─── Cycle day derivation ────────────────────────────────────────

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export function deriveCycleDay(
  samples: { startDate: Date; endDate: Date; value: number }[],
  today: Date,
): number | null {
  const episodes = groupEpisodes(samples);
  if (episodes.length === 0) return null;

  const lastEpisode = episodes[episodes.length - 1];
  const elapsed = today.getTime() - lastEpisode.startDate.getTime();

  // Staleness: if the most recent episode started >60 days ago, don't guess.
  if (elapsed > SIXTY_DAYS_MS) return null;

  return Math.floor(elapsed / (1000 * 60 * 60 * 24)) + 1;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd RadianceIQ && npm test -- --testPathPattern=healthSync`

Expected: All 16 tests pass.

- [ ] **Step 5: Commit**

```bash
git add RadianceIQ/src/services/healthSync.ts RadianceIQ/src/services/__tests__/healthSync.test.ts
git commit -m "feat: cycle derivation helpers — groupEpisodes, deriveCycleDay, pickMaxSeverity"
```

---

## Task 4: detectCycleFromHealthKit + menstrual query in syncOneDay + syncHealthDataInitial

**Files:**
- Modify: `RadianceIQ/src/services/healthSync.ts`
- Modify: `RadianceIQ/src/store/useStore.ts`

This task modifies files that import `@kingstinct/react-native-healthkit`, so tests can only verify types (via `tsc`). Runtime testing requires a physical device.

- [ ] **Step 1: Add menstrual query + cycle_day to `syncOneDay`**

In `RadianceIQ/src/services/healthSync.ts`, modify `syncOneDay` to accept an optional pre-fetched menstrual samples array (for the cycle day computation) and add the menstrual flow query. Also add `CategoryValueMenstrualFlow` to the imports from `@kingstinct/react-native-healthkit` at line 5.

Update the import block at the top of the file (lines 2-6):

```typescript
import {
  queryCategorySamples,
  queryQuantitySamples,
  CategoryValueSleepAnalysis,
  CategoryValueMenstrualFlow,
} from '@kingstinct/react-native-healthkit';
```

Change the `syncOneDay` signature to accept menstrual samples for cycle computation:

```typescript
async function syncOneDay(
  date: Date,
  userId: string,
  menstrualSamples90d?: { startDate: Date; endDate: Date; value: number }[],
): Promise<SyncOneDayResult> {
```

After the mindful minutes block (after line 123), add the menstrual flow query:

```typescript
  // Menstrual flow (classify by most-severe sample for this day).
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
    errors.push(`menstrual: ${e?.message ?? e}`);
  }

  // Cycle day: derive from pre-fetched 90-day menstrual samples.
  const cycleDay = menstrualSamples90d
    ? deriveCycleDay(menstrualSamples90d, date)
    : null;
```

Update the record construction to include the two new fields:

```typescript
  const record: HealthDailyRecord = {
    health_daily_id: generateId(),
    user_id: userId,
    date: dateStr,
    source: 'apple_health',
    sleep_total_minutes: sleepTotal,
    sleep_deep_minutes: sleepDeep,
    sleep_rem_minutes: sleepRem,
    hrv_sdnn_ms: hrv,
    resting_hr_bpm: rhr,
    steps,
    mindful_minutes: mindful,
    menstrual_flow: menstrualFlow,
    cycle_day_estimated: cycleDay,
    synced_at: new Date().toISOString(),
    partial:
      sleepTotal === null && hrv === null && rhr === null,
  };
```

- [ ] **Step 2: Pre-fetch menstrual 90-day window in `pullLastNDays`**

Modify `pullLastNDays` to query the 90-day menstrual window ONCE and pass it down:

```typescript
export async function pullLastNDays(
  n: number,
  userId: string,
): Promise<{ records: HealthDailyRecord[]; errors: string[] }> {
  if (Platform.OS !== 'ios') {
    return { records: [], errors: ['platform_not_ios'] };
  }

  // Pre-fetch 90-day menstrual window once (used for cycle day derivation).
  let menstrualSamples90d: { startDate: Date; endDate: Date; value: number }[] = [];
  try {
    const now = new Date();
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const samples = await queryCategorySamples(
      'HKCategoryTypeIdentifierMenstrualFlow',
      { limit: 0, filter: { date: { startDate: ninetyDaysAgo, endDate: now } } },
    );
    menstrualSamples90d = samples.map((s) => ({
      startDate: new Date(s.startDate),
      endDate: new Date(s.endDate),
      value: s.value as number,
    }));
  } catch {
    // Non-fatal: cycle_day_estimated will be null for all days.
  }

  const records: HealthDailyRecord[] = [];
  const errors: string[] = [];
  for (let daysAgo = 0; daysAgo < n; daysAgo++) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const result = await syncOneDay(date, userId, menstrualSamples90d);
    records.push(result.record);
    errors.push(...result.errors);
  }
  return { records, errors };
}
```

- [ ] **Step 3: Add `detectCycleFromHealthKit` export**

At the bottom of `RadianceIQ/src/services/healthSync.ts`, add:

```typescript
export async function detectCycleFromHealthKit(): Promise<{
  detected: boolean;
  lastPeriodStart: Date | null;
  cycleLengthDays: number | null;
  menstrualStatus: 'regular' | 'irregular' | null;
}> {
  if (Platform.OS !== 'ios') {
    return { detected: false, lastPeriodStart: null, cycleLengthDays: null, menstrualStatus: null };
  }
  try {
    const now = new Date();
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const samples = await queryCategorySamples(
      'HKCategoryTypeIdentifierMenstrualFlow',
      { limit: 0, filter: { date: { startDate: ninetyDaysAgo, endDate: now } } },
    );
    const typedSamples = samples.map((s) => ({
      startDate: new Date(s.startDate),
      endDate: new Date(s.endDate),
      value: s.value as number,
    }));
    const episodes = groupEpisodes(typedSamples);
    if (episodes.length === 0) {
      return { detected: false, lastPeriodStart: null, cycleLengthDays: null, menstrualStatus: null };
    }

    const lastPeriodStart = episodes[episodes.length - 1].startDate;

    // Cycle length: median gap between consecutive episode starts (needs 2+ episodes).
    let cycleLengthDays: number | null = null;
    let menstrualStatus: 'regular' | 'irregular' | null = null;
    if (episodes.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < episodes.length; i++) {
        const gap = Math.round(
          (episodes[i].startDate.getTime() - episodes[i - 1].startDate.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        gaps.push(gap);
      }
      // Median
      const sorted = [...gaps].sort((a, b) => a - b);
      cycleLengthDays = sorted[Math.floor(sorted.length / 2)];
      // Regularity: all gaps within ±3 days of median = regular, else irregular.
      const maxDeviation = Math.max(...gaps.map((g) => Math.abs(g - cycleLengthDays!)));
      menstrualStatus = maxDeviation <= 3 ? 'regular' : 'irregular';
    }

    return { detected: true, lastPeriodStart, cycleLengthDays, menstrualStatus };
  } catch {
    return { detected: false, lastPeriodStart: null, cycleLengthDays: null, menstrualStatus: null };
  }
}
```

- [ ] **Step 4: Add `syncHealthDataInitial` to the store**

In `RadianceIQ/src/store/useStore.ts`, add the new action signature to the `AppState` interface (after `syncHealthData` at line 97):

```typescript
  syncHealthDataInitial: () => Promise<{ added: number; errors: string[] }>;
```

Add the implementation after the `syncHealthData` action (after line 414):

```typescript
  syncHealthDataInitial: async () => {
    const user = get().user;
    if (!user) return { added: 0, errors: ['no_user'] };
    // No reentrancy guard — this is the bootstrap call, invoked once during onboarding.
    set((s) => ({ healthSyncStatus: { ...s.healthSyncStatus, in_progress: true } }));
    try {
      const pullLastNDays: typeof PullLastNDays = require('../services/healthSync').pullLastNDays;
      const { records, errors } = await pullLastNDays(14, user.user_id);
      for (const r of records) {
        get().upsertHealthDailyRecord(r.date, r);
      }
      set((s) => ({
        healthSyncStatus: {
          ...s.healthSyncStatus,
          in_progress: false,
          last_sync_at: new Date().toISOString(),
          last_success_at:
            records.length > 0 ? new Date().toISOString() : s.healthSyncStatus.last_success_at,
          last_error: errors.length > 0 ? errors[0] : null,
        },
      }));
      get().runPatternDetection();
      return { added: records.length, errors };
    } catch (e: any) {
      set((s) => ({
        healthSyncStatus: {
          ...s.healthSyncStatus,
          in_progress: false,
          last_sync_at: new Date().toISOString(),
          last_error: e?.message ?? String(e),
        },
      }));
      return { added: 0, errors: [e?.message ?? String(e)] };
    }
  },
```

- [ ] **Step 5: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors — the HealthDailyRecord type now has `menstrual_flow` and `cycle_day_estimated`, and the record construction in `syncOneDay` populates both.

- [ ] **Step 6: Run the full test suite**

Run: `cd RadianceIQ && npm test`

Expected: All tests pass (existing 472 + new cycle helper tests from Task 3).

- [ ] **Step 7: Commit**

```bash
git add RadianceIQ/src/services/healthSync.ts RadianceIQ/src/store/useStore.ts
git commit -m "feat: menstrual query + detectCycleFromHealthKit + syncHealthDataInitial"
```

---

## Task 5: firstLookInsight generator service + tests

**Files:**
- Create: `RadianceIQ/src/services/firstLookInsight.ts`
- Create: `RadianceIQ/src/services/__tests__/firstLookInsight.test.ts`

The spec calls for generating a `firstLookInsight` during the onboarding health-permission post-grant flow. The store already has `setFirstLookInsight` and the type `FirstLookInsight { headline: string, detail: string, driver: FirstLookInsightDriver }`. The ultraplan file structure listed this file but it was never created.

This is a minimal v1: generate a simple insight based on whichever health metric has the most data.

- [ ] **Step 1: Write the tests**

Create `RadianceIQ/src/services/__tests__/firstLookInsight.test.ts`:

```typescript
import { generateFirstLookInsight } from '../firstLookInsight';
import type { HealthDailyRecord, UserProfile } from '../../types';

const makeRecord = (
  date: string,
  overrides: Partial<HealthDailyRecord> = {},
): HealthDailyRecord => ({
  health_daily_id: `test_${date}`,
  user_id: 'u1',
  date,
  source: 'apple_health',
  sleep_total_minutes: null,
  sleep_deep_minutes: null,
  sleep_rem_minutes: null,
  hrv_sdnn_ms: null,
  resting_hr_bpm: null,
  steps: null,
  mindful_minutes: null,
  menstrual_flow: null,
  cycle_day_estimated: null,
  synced_at: new Date().toISOString(),
  partial: true,
  ...overrides,
});

describe('generateFirstLookInsight', () => {
  it('returns null when no health records', () => {
    expect(generateFirstLookInsight([])).toBeNull();
  });

  it('returns null when all records are fully partial', () => {
    const records = [makeRecord('2026-04-01'), makeRecord('2026-04-02')];
    expect(generateFirstLookInsight(records)).toBeNull();
  });

  it('generates sleep insight when sleep data is present', () => {
    const records = [
      makeRecord('2026-04-01', { sleep_total_minutes: 420, partial: false }),
      makeRecord('2026-04-02', { sleep_total_minutes: 380, partial: false }),
      makeRecord('2026-04-03', { sleep_total_minutes: 450, partial: false }),
    ];
    const insight = generateFirstLookInsight(records);
    expect(insight).not.toBeNull();
    expect(insight!.headline.length).toBeLessThanOrEqual(80);
    expect(insight!.detail.length).toBeLessThanOrEqual(200);
    expect(insight!.driver).toBeDefined();
  });

  it('generates cycle insight when cycle data is present', () => {
    const records = [
      makeRecord('2026-04-01', { cycle_day_estimated: 1, menstrual_flow: 'heavy', partial: false }),
      makeRecord('2026-04-02', { cycle_day_estimated: 2, menstrual_flow: 'medium', partial: false }),
    ];
    const insight = generateFirstLookInsight(records);
    expect(insight).not.toBeNull();
    expect(insight!.driver).toBe('cycle_setup');
  });

  it('prefers cycle insight over sleep when both present', () => {
    const records = [
      makeRecord('2026-04-01', {
        sleep_total_minutes: 420,
        cycle_day_estimated: 5,
        menstrual_flow: 'light',
        partial: false,
      }),
    ];
    const insight = generateFirstLookInsight(records);
    expect(insight).not.toBeNull();
    expect(insight!.driver).toBe('cycle_setup');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd RadianceIQ && npm test -- --testPathPattern=firstLookInsight`

Expected: `Cannot find module '../firstLookInsight'`.

- [ ] **Step 3: Implement the generator**

Create `RadianceIQ/src/services/firstLookInsight.ts`:

```typescript
import type { FirstLookInsight, HealthDailyRecord } from '../types';

/**
 * Generates a Day-1 insight from HealthKit bootstrap data.
 * Minimal v1: picks the most interesting metric and writes a simple headline.
 */
export function generateFirstLookInsight(
  healthRecords: HealthDailyRecord[],
): FirstLookInsight | null {
  if (healthRecords.length === 0) return null;

  // Check for cycle data first (highest value — most personal/novel).
  const withCycle = healthRecords.filter(
    (r) => r.cycle_day_estimated !== null && r.menstrual_flow !== null,
  );
  if (withCycle.length >= 2) {
    const latest = withCycle[withCycle.length - 1];
    return {
      headline: `Cycle day ${latest.cycle_day_estimated} — tracking started.`,
      detail:
        'Glowlytics will correlate your cycle with skin changes over the next few weeks. Patterns typically emerge after 2-3 cycles.',
      driver: 'cycle_setup',
    };
  }

  // Check for sleep data.
  const withSleep = healthRecords.filter((r) => r.sleep_total_minutes !== null);
  if (withSleep.length >= 3) {
    const avg = Math.round(
      withSleep.reduce((sum, r) => sum + r.sleep_total_minutes!, 0) / withSleep.length,
    );
    const hours = Math.floor(avg / 60);
    const mins = avg % 60;
    return {
      headline: `You average ${hours}h ${mins}m of sleep.`,
      detail:
        'Sleep is one of the strongest predictors of skin health. We\'ll track how your scores change with your sleep patterns.',
      driver: 'positive_percentile',
    };
  }

  // Check for HRV.
  const withHrv = healthRecords.filter((r) => r.hrv_sdnn_ms !== null);
  if (withHrv.length >= 3) {
    const avg = Math.round(
      withHrv.reduce((sum, r) => sum + r.hrv_sdnn_ms!, 0) / withHrv.length,
    );
    return {
      headline: `Your average HRV is ${avg} ms.`,
      detail:
        'Heart rate variability reflects your stress and recovery — both affect skin. Higher HRV often correlates with clearer skin.',
      driver: 'positive_percentile',
    };
  }

  // Not enough data for any insight.
  return null;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd RadianceIQ && npm test -- --testPathPattern=firstLookInsight`

Expected: All 5 tests pass.

- [ ] **Step 5: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add RadianceIQ/src/services/firstLookInsight.ts RadianceIQ/src/services/__tests__/firstLookInsight.test.ts
git commit -m "feat: firstLookInsight generator — Day-1 insight from HealthKit bootstrap"
```

---

## Task 6: health-permission.tsx onboarding screen

**Files:**
- Create: `RadianceIQ/app/onboarding/health-permission.tsx`

This is the largest task. The screen uses `OnboardingTransition` (same wrapper as `camera-permission.tsx`), has 5 states (`idle`, `connecting`, `success-full`, `success-partial`, `denied`), and includes a custom SVG illustration.

Dependencies on prior tasks: `connectHealthData` (Task 1), `detectCycleFromHealthKit` (Task 4), `syncHealthDataInitial` (Task 4), `generateFirstLookInsight` (Task 5), `buildOnboardingFlow` (Task 2).

- [ ] **Step 1: Create the screen file**

Create `RadianceIQ/app/onboarding/health-permission.tsx`. The complete implementation should include:

1. **Imports**: React + hooks, RN components, Animated, Svg for illustration, `OnboardingTransition`, `useOnboardingNavigation`, `useStore`, `connectHealthData` from healthPermissions, `getHealthConnectionState` from healthPermissions, `trackEvent` from analytics, `buildOnboardingFlow` from onboardingFlow, `generateFirstLookInsight` from firstLookInsight, theme constants, `localDateStr`.

2. **`HealthIllustration` component**: SVG with radial gradients (teal + cyan heart motif with pulse lines), animated pulse via `useSharedValue` + `withRepeat`. Match the technique from `camera-permission.tsx:17-125`. ~80 lines of JSX.

3. **State machine** via `useState<'idle' | 'connecting' | 'success-full' | 'success-partial' | 'denied'>('idle')`.

4. **`handleConnect` async function** following the spec's Section 4.3 pseudocode:
   - Set state to `connecting`.
   - Call `connectHealthData()`.
   - If denied: set state to `denied`, track event, return.
   - Call `detectCycleFromHealthKit()` (dynamic require to avoid Jest issues, same pattern as `syncHealthData` in useStore.ts).
   - If `cycleResult.detected`: update user profile with period data, update health connection with `cycle_detected: true`, rebuild onboarding flow.
   - Race `syncHealthDataInitial()` against a 4-second timeout.
   - Count `metricsPopulated` from the latest health record.
   - Set state to `success-full` or `success-partial` based on ≥3 metrics.
   - Generate and store `firstLookInsight` if enough data.
   - Track `health_permission_result` event.
   - Auto-advance after 1.5s (full) or 2s (partial).

5. **`handleSkip` function**: `updateHealthConnection({ status: 'not_requested', sync_skipped: true })`, track event, `advance()`.

6. **Auto-advance on mount if already granted**: `useEffect` that checks `user.health_connection.status === 'granted'` → skip the screen entirely.

7. **Auto-skip if unavailable**: `useEffect` that calls `getHealthConnectionState()` and if `status === 'unavailable'`, auto-advance with `sync_skipped: true`.

8. **Render**: Switch on screen state to show different content via `OnboardingTransition`:
   - `idle`: Pattern chip + buttons.
   - `connecting`: Progress text rotating through "Reading sleep…" / "Reading heart rate…" / "Reading cycle data…" / "Reading steps…" / "Reading mindful minutes…".
   - `success-full`: Success card with data stats.
   - `success-partial`: Softer success card.
   - `denied`: Neutral "No problem" card.

9. **PostHog events**: `health_permission_shown` on mount, `health_permission_result` on advance.

**IMPORTANT**: `detectCycleFromHealthKit` and `syncHealthDataInitial` must be loaded via dynamic `require()` inside `handleConnect`, NOT at module top level. This matches the pattern used in `useStore.ts` (dynamic require to avoid pulling HealthKit native module into the Jest graph).

The screen must call `setOnboardingFlow(buildOnboardingFlow(user.sex, user.menstrual_status, true))` from the `useStore` action (not from a selector hook) after detecting cycle data, so the flow rebuilds in the same render cycle.

- [ ] **Step 2: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 3: Run the full test suite**

Run: `cd RadianceIQ && npm test`

Expected: All tests pass (existing + new from Tasks 2, 3, 5). The new screen file doesn't have its own test file in v1 — the flow-level tests from Task 2 cover that the screen name is in the flow; the screen's internal logic is tested via the store + service tests from Tasks 3-5. A dedicated component test can be added in a follow-up.

- [ ] **Step 4: Manual verification on device**

This step requires the EAS dev client on a physical iPhone:
1. Open Glowlytics, sign in, go through onboarding.
2. After camera-permission, the health-permission screen should appear.
3. Tap "Connect Apple Health" → iOS dialog appears.
4. Grant → progress text → success card → auto-advance.
5. If female + cycle data: `menstrual` and `cycle-details` screens should NOT appear.
6. Verify `useStore.getState().healthSyncStatus` shows populated data.
7. Verify `useStore.getState().firstLookInsight` is non-null (if enough data).

- [ ] **Step 5: Commit**

```bash
git add "RadianceIQ/app/onboarding/health-permission.tsx"
git commit -m "feat: health-permission onboarding screen — HealthKit grant + cycle detection"
```

---

## Task 7: Profile Health Data card + formatRelativeTime utility

**Files:**
- Create: `RadianceIQ/src/utils/formatRelativeTime.ts`
- Create: `RadianceIQ/src/utils/__tests__/formatRelativeTime.test.ts`
- Modify: `RadianceIQ/app/(tabs)/profile.tsx`

- [ ] **Step 1: Write formatRelativeTime tests**

Create `RadianceIQ/src/utils/__tests__/formatRelativeTime.test.ts`:

```typescript
import { formatRelativeTime } from '../formatRelativeTime';

describe('formatRelativeTime', () => {
  const now = new Date('2026-04-09T12:00:00Z');

  it('returns "just now" for <1 minute ago', () => {
    const ts = new Date(now.getTime() - 30 * 1000).toISOString();
    expect(formatRelativeTime(ts, now)).toBe('just now');
  });

  it('returns "5 minutes ago" for 5 min', () => {
    const ts = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts, now)).toBe('5 minutes ago');
  });

  it('returns "1 hour ago" for 60-119 min', () => {
    const ts = new Date(now.getTime() - 90 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts, now)).toBe('1 hour ago');
  });

  it('returns "2 hours ago" for 2h', () => {
    const ts = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts, now)).toBe('2 hours ago');
  });

  it('returns "yesterday" for 24-47h ago', () => {
    const ts = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts, now)).toBe('yesterday');
  });

  it('returns "3 days ago" for 3 days', () => {
    const ts = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts, now)).toBe('3 days ago');
  });

  it('returns null for null input', () => {
    expect(formatRelativeTime(null, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd RadianceIQ && npm test -- --testPathPattern=formatRelativeTime`

Expected: Module not found.

- [ ] **Step 3: Implement formatRelativeTime**

Create `RadianceIQ/src/utils/formatRelativeTime.ts`:

```typescript
export function formatRelativeTime(
  isoString: string | null,
  now: Date = new Date(),
): string | null {
  if (!isoString) return null;
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  if (diffDay < 2) return 'yesterday';
  return `${diffDay} days ago`;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd RadianceIQ && npm test -- --testPathPattern=formatRelativeTime`

Expected: All 7 tests pass.

- [ ] **Step 5: Add Health Data card to profile.tsx**

In `RadianceIQ/app/(tabs)/profile.tsx`, add the Health Data card between the "Account & Plan" card (ends around line 320 with `</View>`) and the "Notifications" card (starts at line 322 with `{/* Notifications */}`).

Add imports at the top of the file:
- `Linking` from `react-native` (add to existing import)
- `formatRelativeTime` from `../../src/utils/formatRelativeTime`
- `connectHealthData`, `getHealthConnectionState` from `../../src/services/healthPermissions`
- `isHealthDataAvailableAsync` from `@kingstinct/react-native-healthkit` — NO, use dynamic require pattern like useStore. Instead, use `getHealthConnectionState` which already handles the availability check.

Add store selectors:
```typescript
const healthConnection = useStore((s) => s.user?.health_connection);
const healthSyncStatus = useStore((s) => s.healthSyncStatus);
const updateHealthConnection = useStore((s) => s.updateHealthConnection);
```

Add state for connecting status:
```typescript
const [healthConnecting, setHealthConnecting] = useState(false);
```

Add the handleHealthConnect handler:
```typescript
const handleHealthConnect = async () => {
  setHealthConnecting(true);
  try {
    const conn = await connectHealthData();
    updateHealthConnection(conn);
    if (conn.status === 'granted') {
      useStore.getState().syncHealthData().catch(() => {});
    }
  } catch {
    // Non-fatal
  }
  setHealthConnecting(false);
};
```

Insert the card JSX (between the Account card's closing `</View>` and the `{/* Notifications */}` comment). The card renders three states:

1. **Hidden**: if `healthConnection?.status === 'unavailable'` (or platform !== iOS) — render nothing.
2. **Disconnected**: "🔌 Connect Apple Health" button.
3. **Connected**: Two `InfoRow`s (Apple Health + Last synced) + "Manage in iOS Settings" button.

```tsx
{/* Health Data */}
{Platform.OS === 'ios' && healthConnection?.status !== 'unavailable' && (
  <View style={styles.card}>
    <View style={styles.cardTitleRow}>
      <Feather name="heart" size={15} color="#FF7A78" />
      <Text style={styles.cardTitle}>Health Data</Text>
    </View>
    {healthConnection?.status === 'granted' ? (
      <>
        <InfoRow label="Apple Health" value="Connected" />
        <InfoRow
          label="Last synced"
          value={formatRelativeTime(healthSyncStatus.last_sync_at) ?? 'Never'}
        />
        <TouchableOpacity
          style={styles.modeButton}
          onPress={() => {
            Linking.openURL('x-apple-health://').catch(() => {
              Linking.openURL('app-settings:').catch(() => {});
            });
          }}
          activeOpacity={0.7}
        >
          <Feather name="settings" size={16} color={Colors.primaryLight} />
          <Text style={styles.modeButtonText}>Manage in iOS Settings</Text>
        </TouchableOpacity>
      </>
    ) : (
      <TouchableOpacity
        style={styles.modeButton}
        onPress={handleHealthConnect}
        disabled={healthConnecting}
        activeOpacity={0.7}
      >
        <Feather name="activity" size={16} color={Colors.primary} />
        <Text style={[styles.modeButtonText, { color: Colors.primary }]}>
          {healthConnecting ? 'Connecting...' : 'Connect Apple Health'}
        </Text>
      </TouchableOpacity>
    )}
  </View>
)}
```

- [ ] **Step 6: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 7: Run the full test suite**

Run: `cd RadianceIQ && npm test`

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add RadianceIQ/src/utils/formatRelativeTime.ts RadianceIQ/src/utils/__tests__/formatRelativeTime.test.ts "RadianceIQ/app/(tabs)/profile.tsx"
git commit -m "feat: Profile Health Data card + formatRelativeTime utility"
```

---

## Verification Checkpoint

After all 7 tasks:

- [ ] Run `cd RadianceIQ && npx tsc --noEmit` — 0 errors
- [ ] Run `cd RadianceIQ && npm test` — all pass (baseline + ~30 new)
- [ ] On device: complete onboarding with HealthKit grant → verify health-permission screen appears, post-grant flow works, cycle-detected users skip menstrual screens
- [ ] On device: go to Profile → Health Data card shows "Connected" + "Last synced X ago"
- [ ] On device: reset all data, re-onboard, tap "Set up later" → verify flow falls through to menstrual screens for female users

---

## Summary

| Task | Files | Tests | Description |
|---|---|---|---|
| 1 | types, healthPermissions, app.json | — | Foundation: type expansions + permission config |
| 2 | onboardingFlow, tests | 22 tests | Reorder flow, add healthSyncedCycleDetected |
| 3 | healthSync, tests | 16 tests | Pure cycle helpers: groupEpisodes, deriveCycleDay, pickMaxSeverity |
| 4 | healthSync, useStore | — | HealthKit menstrual query, detectCycleFromHealthKit, syncHealthDataInitial |
| 5 | firstLookInsight, tests | 5 tests | Day-1 insight generator |
| 6 | health-permission.tsx | — | Onboarding screen with 5 states + SVG illustration |
| 7 | profile.tsx, formatRelativeTime, tests | 7 tests | Profile Health Data card + relative time utility |
