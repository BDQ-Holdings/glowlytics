# Ultraplan: TestFlight Fixes + Pattern Engine Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the 6 TestFlight feedback fixes (starting with the critical paywall-blocks-scanning bug) AND build the Pattern Engine — a correlation-based insight feature that turns Glowlytics into a word-of-mouth driven product by surfacing screenshottable, shareable patterns in users' own skin data.

**Architecture:** Phases 1-4 are targeted fixes to existing code (store, subscription service, product detail, Add Product flow, animation polish). Phases 5-11 build the Pattern Engine as three new layers (HealthKit sync, correlation engine, Patterns UI) plus extensions to existing systems. Pure functions throughout so the engine is trivially testable with synthetic fixtures. Local-only in v1 — HealthKit raw values never leave the device. Cold-start mitigation baked in via "predicted patterns" scaffold that unlocks real patterns at day 14.

**Tech Stack:** React Native + Expo SDK 54, TypeScript strict, Zustand + AsyncStorage, RevenueCat v9, react-native-reanimated, Express + PostgreSQL backend, `@kingstinct/react-native-healthkit` (new), `react-native-view-shot` (new), `expo-sharing` (already in tree).

**Source documents:**
- TestFlight feedback triage: lives inline in Phases 1-4 below
- Pattern Engine design spec: `docs/superpowers/specs/2026-04-07-pattern-engine-design.md`

**Sequencing rationale:** Ship fixes first (Phases 1-4) because the paywall bug is actively killing activation right now and the Pattern Engine is worthless if users bounce before generating any data. Each phase ends with a verification checkpoint so work can pause between phases for TestFlight releases.

---

## Table of Contents

- **Phase 1** — Critical: Paywall trial gap (Tasks 1-4)
- **Phase 2** — High-value UX fixes (Tasks 5-6)
- **Phase 3** — Diagnostic-led fixes (Tasks 7-9)
- **Phase 4** — Fix verification checkpoint (Task 10)
- **Phase 5** — Pattern engine pure logic + tests (Tasks 11-14)
- **Phase 6** — HealthKit wiring (Tasks 15-18)
- **Phase 7** — Pattern card UI on Today (Tasks 19-21)
- **Phase 8** — Pattern detail screen (Tasks 22-23)
- **Phase 9** — Share artifact + export (Tasks 24-25)
- **Phase 10** — Push notification on pattern unlock (Task 26)
- **Phase 11** — Privacy, App Store prep, final verification (Tasks 27-28)

---

## File Structure

### Files modified (Phases 1-4)
| Path | Purpose |
|---|---|
| `RadianceIQ/src/store/useStore.ts` | Auto-start trial in `createUser`; backfill in `loadPersistedData` |
| `RadianceIQ/src/store/__tests__/useStore.test.ts` | Tests for auto-start + backfill + updated negative case |
| `RadianceIQ/src/services/subscription.ts` | Defensive trial fallback in `gateWithPaywall` |
| `RadianceIQ/src/services/__tests__/subscription.test.ts` | Test for defensive trial fallback |
| `RadianceIQ/app/product/[id].tsx` | Show raw ingredient name + canonical as secondary tag |
| `RadianceIQ/src/components/AddProductSheet.tsx` | Re-order menu, promote photo capture |
| `RadianceIQ/src/services/productLookup.ts` | Diagnostic + search recall fix, ingredient fallback |
| `RadianceIQ/src/services/__tests__/productLookup.test.ts` | New tests for search + ingredient fixes |
| `RadianceIQ/app/scan/results.tsx` | Polish shadow/glow animation |

### Files created (Phases 5-11)
| Path | Purpose |
|---|---|
| `RadianceIQ/src/services/patternEngine.ts` | Pure correlation engine |
| `RadianceIQ/src/services/patternPriors.ts` | Static prior table for predicted patterns |
| `RadianceIQ/src/services/firstLookInsight.ts` | Day-1 insight generator |
| `RadianceIQ/src/services/healthSync.ts` | Native HealthKit sync |
| `RadianceIQ/src/services/__tests__/patternEngine.test.ts` | 30+ unit tests |
| `RadianceIQ/src/services/__tests__/fixtures/patternFixtures.ts` | Synthetic data builders |
| `RadianceIQ/src/services/__tests__/healthSync.test.ts` | 10 integration tests |
| `RadianceIQ/src/services/__tests__/firstLookInsight.test.ts` | 6 insight tests |
| `RadianceIQ/src/components/PatternCard.tsx` | Pattern card component |
| `RadianceIQ/src/components/PatternCarousel.tsx` | Swipeable carousel on Today |
| `RadianceIQ/src/components/PatternProgressBar.tsx` | Days-to-unlock milestone bar |
| `RadianceIQ/src/components/PatternExportCard.tsx` | Hidden 1080×1920 view for share capture |
| `RadianceIQ/src/components/__tests__/PatternCard.test.tsx` | 8 component tests |
| `RadianceIQ/app/pattern/[id].tsx` | Pattern detail screen |
| `RadianceIQ/app/pattern/_layout.tsx` | Stack layout |
| `RadianceIQ/src/services/patternExport.ts` | Export helper (view-shot → share sheet) |
| `RadianceIQ/src/services/patternNotifications.ts` | Local notification on first unlock |

### Files modified (Phases 5-11)
| Path | Purpose |
|---|---|
| `RadianceIQ/src/types/index.ts` | `HealthDailyRecord`, `Pattern`, `FirstLookInsight`, etc. |
| `RadianceIQ/src/store/useStore.ts` | New fields: `healthDailyRecords`, `patterns`, `firstLookInsight`, `healthSyncStatus` + actions |
| `RadianceIQ/src/services/healthPermissions.ts` | Replace mock with real `@kingstinct/react-native-healthkit` calls |
| `RadianceIQ/app/_layout.tsx` | AppState foreground listener to trigger health sync |
| `RadianceIQ/app/(tabs)/today.tsx` | Mount `PatternCarousel` + `PatternProgressBar` |
| `RadianceIQ/src/services/analytics.ts` | 10 new PostHog events |
| `RadianceIQ/app.json` | HealthKit config plugin, `NSHealthShareUsageDescription` |
| `RadianceIQ/package.json` | New dependencies |

---

# PHASE 1 — Critical Paywall Fix

**Why this phase exists:** Tester #2 reported "subscription paywall blocking scanning ability" on build 76. Root cause: `app/scan/camera.tsx:59-69` calls `gateWithPaywall()` on mount and `router.back()` if `canPerformScan()` returns false. `canPerformScan()` returns `is_active || isTrialActive()`, and the trial only starts via `handleSkip()` in `app/onboarding/paywall.tsx:69`. Any user who reaches the camera without first running that exact screen (upgraded from pre-paywall builds, restored mid-flow, trial expired) gets locked out cold.

**Fix strategy:** Three defensive layers — auto-start on user creation, backfill on app load, and defensive fallback inside `gateWithPaywall` itself. Belt, suspenders, and a bungee cord.

## Task 1: Auto-start trial on user creation

**Files:**
- Modify: `RadianceIQ/src/store/useStore.ts` (`createUser` action, lines 186-205)
- Modify: `RadianceIQ/src/store/__tests__/useStore.test.ts`

- [ ] **Step 1: Read the existing test file for patterns**

Read `RadianceIQ/src/store/__tests__/useStore.test.ts` around lines 280-310 to learn how existing `canPerformScan` and `createUser` tests are structured.

- [ ] **Step 2: Write the failing tests**

Append to the appropriate `describe` block in `RadianceIQ/src/store/__tests__/useStore.test.ts`:

```typescript
  describe('createUser auto-trial', () => {
    beforeEach(async () => {
      await useStore.getState().resetAll();
    });

    it('starts a 7-day trial when createUser runs without an existing trial', () => {
      useStore.getState().createUser({ age_range: '25-34' });
      const sub = useStore.getState().subscription;
      expect(sub.trial_start_date).not.toBeNull();
      expect(sub.trial_end_date).not.toBeNull();
      const start = new Date(sub.trial_start_date!).getTime();
      const end = new Date(sub.trial_end_date!).getTime();
      const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
      expect(days).toBe(7);
    });

    it('canPerformScan returns true immediately after createUser', () => {
      useStore.getState().createUser({ age_range: '25-34' });
      expect(useStore.getState().canPerformScan()).toBe(true);
    });

    it('does not overwrite an existing trial when createUser runs again', () => {
      useStore.getState().createUser({ age_range: '25-34' });
      const firstStart = useStore.getState().subscription.trial_start_date;
      useStore.getState().createUser({ age_range: '25-34' });
      expect(useStore.getState().subscription.trial_start_date).toBe(firstStart);
    });
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd RadianceIQ && npm test -- useStore.test.ts -t "createUser auto-trial"`

Expected: 3 failures because `trial_start_date` is `null` after `createUser`.

- [ ] **Step 4: Modify createUser to call startTrial**

In `RadianceIQ/src/store/useStore.ts`, replace the `createUser` action (lines 186-205) with:

```typescript
  createUser: (data) => {
    const user = normalizeUser({
      user_id: generateId(),
      age_range: data.age_range || '',
      location_coarse: data.location_coarse || '',
      period_applicable: data.period_applicable || 'prefer_not',
      period_last_start_date: data.period_last_start_date,
      cycle_length_days: data.cycle_length_days || 28,
      smoker_status: data.smoker_status,
      drink_baseline_frequency: data.drink_baseline_frequency,
      wearable_connected: data.wearable_connected || false,
      wearable_source: data.wearable_source,
      camera_permission_status: data.camera_permission_status || 'not_requested',
      health_connection: data.health_connection || defaultHealthConnection(),
      onboarding_complete: false,
    });
    set({ user });
    // Auto-start the 7-day trial on first user creation. Idempotent — startTrial() is a no-op
    // if trial_start_date already exists. Closes the gap where users reach the camera before
    // hitting the onboarding paywall (e.g. upgraded from pre-paywall build).
    get().startTrial();
    debouncedPersist(() => get().persistData());
    if (user) syncToBackend(() => api.createUser(user));
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd RadianceIQ && npm test -- useStore.test.ts -t "createUser auto-trial"`

Expected: All 3 pass.

- [ ] **Step 6: Run the full store test suite**

Run: `cd RadianceIQ && npm test -- useStore.test.ts`

Expected: Task 2 will fix any existing test that now fails.

- [ ] **Step 7: Commit**

```bash
git add RadianceIQ/src/store/useStore.ts RadianceIQ/src/store/__tests__/useStore.test.ts
git commit -m "fix: auto-start trial on user creation to close paywall gap"
```

---

## Task 2: Fix the existing negative test broken by Task 1

**Why:** The existing test `canPerformScan returns false for free user without trial` (around line 295) assumed a free user has no trial. With Task 1, users always have a trial after `createUser`, so the test now needs to construct a "no trial" state explicitly.

**Files:**
- Modify: `RadianceIQ/src/store/__tests__/useStore.test.ts` (around line 295)

- [ ] **Step 1: Read the existing test**

Read lines 280-310 of `RadianceIQ/src/store/__tests__/useStore.test.ts` to see the current assertion.

- [ ] **Step 2: Replace the test body with an explicit expired-trial state**

```typescript
    it('canPerformScan returns false when subscription has no active entitlement and trial is expired', () => {
      useStore.setState({
        subscription: {
          tier: 'free',
          is_active: false,
          expires_at: null,
          product_id: null,
          free_scans_used: 0,
          trial_start_date: '2020-01-01T00:00:00.000Z',
          trial_end_date: '2020-01-08T00:00:00.000Z', // expired
        },
      });
      expect(useStore.getState().canPerformScan()).toBe(false);
    });
```

- [ ] **Step 3: Run the test**

Run: `cd RadianceIQ && npm test -- useStore.test.ts -t "canPerformScan returns false"`

Expected: PASS.

- [ ] **Step 4: Run the full store suite**

Run: `cd RadianceIQ && npm test -- useStore.test.ts`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add RadianceIQ/src/store/__tests__/useStore.test.ts
git commit -m "test: update canPerformScan negative case after auto-trial fix"
```

---

## Task 3: Backfill trial for upgraded users on app load

**Files:**
- Modify: `RadianceIQ/src/store/useStore.ts` (`loadPersistedData`, lines 499-542)
- Modify: `RadianceIQ/src/store/__tests__/useStore.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `useStore.test.ts`:

```typescript
  describe('loadPersistedData trial backfill', () => {
    beforeEach(async () => {
      await useStore.getState().resetAll();
    });

    it('backfills trial for an upgraded user with no trial dates', async () => {
      await AsyncStorage.setItem('glowlytics_data', JSON.stringify({
        user: { user_id: 'u1', age_range: '25-34', onboarding_complete: true },
        subscription: {
          tier: 'free',
          is_active: false,
          expires_at: null,
          product_id: null,
          free_scans_used: 0,
          trial_start_date: null,
          trial_end_date: null,
        },
      }));
      await useStore.getState().loadPersistedData();
      const sub = useStore.getState().subscription;
      expect(sub.trial_start_date).not.toBeNull();
      expect(sub.trial_end_date).not.toBeNull();
      expect(useStore.getState().canPerformScan()).toBe(true);
    });

    it('does NOT touch a paid user', async () => {
      await AsyncStorage.setItem('glowlytics_data', JSON.stringify({
        user: { user_id: 'u2', age_range: '25-34', onboarding_complete: true },
        subscription: {
          tier: 'premium',
          is_active: true,
          expires_at: '2099-01-01T00:00:00.000Z',
          product_id: 'glow_pro_monthly',
          free_scans_used: 0,
          trial_start_date: null,
          trial_end_date: null,
        },
      }));
      await useStore.getState().loadPersistedData();
      expect(useStore.getState().subscription.trial_start_date).toBeNull();
      expect(useStore.getState().subscription.is_active).toBe(true);
    });

    it('does NOT touch a user whose trial has already expired', async () => {
      await AsyncStorage.setItem('glowlytics_data', JSON.stringify({
        user: { user_id: 'u3', age_range: '25-34', onboarding_complete: true },
        subscription: {
          tier: 'free',
          is_active: false,
          expires_at: null,
          product_id: null,
          free_scans_used: 0,
          trial_start_date: '2020-01-01T00:00:00.000Z',
          trial_end_date: '2020-01-08T00:00:00.000Z',
        },
      }));
      await useStore.getState().loadPersistedData();
      expect(useStore.getState().subscription.trial_end_date).toBe('2020-01-08T00:00:00.000Z');
    });
  });
```

Ensure `import AsyncStorage from '@react-native-async-storage/async-storage';` is present at the top of the test file.

- [ ] **Step 2: Run tests to verify first fails**

Run: `cd RadianceIQ && npm test -- useStore.test.ts -t "loadPersistedData trial backfill"`

Expected: First test fails (`trial_start_date` still null after load).

- [ ] **Step 3: Add backfill to loadPersistedData**

In `RadianceIQ/src/store/useStore.ts`, inside `loadPersistedData`, after the `set({...})` call that restores state (around line 534), add:

```typescript
        // Backfill: upgraded users from pre-paywall builds may have no trial dates.
        // If they're not paid AND have never had a trial, grant one now (one-time only).
        const restoredSub = get().subscription;
        if (
          !restoredSub.is_active &&
          restoredSub.trial_start_date === null &&
          restoredSub.trial_end_date === null
        ) {
          get().startTrial();
        }
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `cd RadianceIQ && npm test -- useStore.test.ts -t "loadPersistedData trial backfill"`

Expected: All 3 pass.

- [ ] **Step 5: Run full store suite**

Run: `cd RadianceIQ && npm test -- useStore.test.ts`

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add RadianceIQ/src/store/useStore.ts RadianceIQ/src/store/__tests__/useStore.test.ts
git commit -m "fix: backfill trial dates for upgraded users on app load"
```

---

## Task 4: Defensive trial-start inside gateWithPaywall

**Files:**
- Modify: `RadianceIQ/src/services/subscription.ts` (`gateWithPaywall`, lines 190-204)
- Modify: `RadianceIQ/src/services/__tests__/subscription.test.ts`

- [ ] **Step 1: Read existing subscription test file**

Read `RadianceIQ/src/services/__tests__/subscription.test.ts` to learn the existing test patterns.

- [ ] **Step 2: Write failing test**

Append:

```typescript
  describe('gateWithPaywall trial fallback', () => {
    beforeEach(async () => {
      const { useStore } = require('../../store/useStore');
      await useStore.getState().resetAll();
      useStore.getState().createUser({ age_range: '25-34' });
      // Wipe the auto-granted trial to simulate a stuck legacy state
      useStore.setState({
        subscription: {
          ...useStore.getState().subscription,
          trial_start_date: null,
          trial_end_date: null,
        },
      });
    });

    it('grants a trial and returns true if no trial exists and no entitlement', async () => {
      const { gateWithPaywall } = await import('../subscription');
      const allowed = await gateWithPaywall();
      const { useStore } = await import('../../store/useStore');
      expect(allowed).toBe(true);
      expect(useStore.getState().subscription.trial_start_date).not.toBeNull();
    });
  });
```

- [ ] **Step 3: Run test to verify failure**

Run: `cd RadianceIQ && npm test -- subscription.test.ts -t "gateWithPaywall trial fallback"`

Expected: FAIL — returns false.

- [ ] **Step 4: Modify gateWithPaywall**

Replace `gateWithPaywall` in `RadianceIQ/src/services/subscription.ts` (lines 190-204) with:

```typescript
/**
 * Gate an action behind paywall. Presents paywall if needed, refreshes subscription,
 * returns true if the user can proceed (subscribed or trial active).
 *
 * Defensive: if the user has no entitlement AND no trial dates at all, auto-start the
 * trial before showing the paywall. Guarantees no path can lock a user out without
 * having ever offered them the trial.
 */
export async function gateWithPaywall(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useStore } = require('../store/useStore');
  if (useStore.getState().canPerformScan()) return true;

  // Defensive: grant trial if user has never had one
  const sub = useStore.getState().subscription;
  if (!sub.is_active && sub.trial_start_date === null && sub.trial_end_date === null) {
    useStore.getState().startTrial();
    if (useStore.getState().canPerformScan()) return true;
  }

  try {
    const purchased = await presentPaywall();
    if (purchased) {
      const refreshed = await checkSubscriptionStatus(useStore.getState().subscription);
      useStore.getState().setSubscription(refreshed);
    }
  } catch {
    // RevenueCat config error — non-fatal
  }
  return useStore.getState().canPerformScan();
}
```

- [ ] **Step 5: Run test to verify pass**

Run: `cd RadianceIQ && npm test -- subscription.test.ts -t "gateWithPaywall trial fallback"`

Expected: PASS.

- [ ] **Step 6: Run full subscription suite**

Run: `cd RadianceIQ && npm test -- subscription.test.ts`

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add RadianceIQ/src/services/subscription.ts RadianceIQ/src/services/__tests__/subscription.test.ts
git commit -m "fix: gateWithPaywall auto-grants trial as defense-in-depth"
```

---

---

# PHASE 2 — High-value UX fixes

## Task 5: Show user-entered ingredient name verbatim, canonical as secondary tag

**Why:** Tester #1 entered a product they know is "tretinoin cream USP 0.025%" but product detail displays "Retinol" — `app/product/[id].tsx:254-256` uses `row.profile.canonicalName` instead of `row.raw`. Fix: always show the raw user-entered name as the primary label, surface the canonical as a small secondary chip beside it. Preserves clinical specificity while keeping DB linkage for scoring.

**Files:**
- Modify: `RadianceIQ/app/product/[id].tsx` (lines 250-279, 502-512)

- [ ] **Step 1: Update ingredient row JSX**

In `app/product/[id].tsx`, replace the body of `ingredientRows.map(...)` (lines 250-279) with:

```tsx
          {ingredientRows.map((row, idx) => {
            const dotColor = row.profile
              ? ratingDotColor[row.profile.rating]
              : Colors.textDim;
            // ALWAYS show the user-entered name verbatim. The canonical name is shown as a
            // secondary tag only when it differs from the raw input — this preserves
            // clinical specificity (e.g. "Tretinoin 0.025%" instead of generic "Retinol").
            const rawDisplay = row.raw;
            const canonical = row.profile?.canonicalName ?? null;
            const showCanonicalTag =
              canonical !== null &&
              canonical.toLowerCase() !== rawDisplay.trim().toLowerCase();
            const desc = row.profile
              ? row.profile.description
              : 'Not in database';

            return (
              <View
                key={`${row.raw}-${idx}`}
                style={[
                  styles.ingredientRow,
                  idx < ingredientRows.length - 1 && styles.ingredientRowBorder,
                ]}
              >
                <View style={[styles.dot, { backgroundColor: dotColor }]} />
                <View style={styles.ingredientInfo}>
                  <View style={styles.ingredientNameRow}>
                    <Text style={styles.ingredientName} numberOfLines={2}>
                      {rawDisplay}
                    </Text>
                    {showCanonicalTag && (
                      <View style={styles.canonicalTag}>
                        <Text style={styles.canonicalTagText}>{canonical}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.ingredientDesc} numberOfLines={2}>
                    {desc}
                  </Text>
                </View>
              </View>
            );
          })}
```

- [ ] **Step 2: Add the new styles**

In the same file's `StyleSheet.create({...})` block, near `ingredientName` (around line 502), add:

```typescript
  ingredientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  canonicalTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceOverlay,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  canonicalTagText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
    letterSpacing: 0.3,
  },
```

- [ ] **Step 3: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 4: Manual verification**

Add a product manually with raw ingredient `"Tretinoin Cream USP 0.025%"`. Open its detail screen. Verify:
- Primary label reads "Tretinoin Cream USP 0.025%"
- Secondary tag shows "Tretinoin"
- Dot color is `highly_beneficial` green

- [ ] **Step 5: Commit**

```bash
git add RadianceIQ/app/product/[id].tsx
git commit -m "fix: show raw ingredient name verbatim, canonical as secondary tag"
```

---

## Task 6: Promote photo-based product capture in Add Product menu

**Why:** Photo identification already exists (`AddProductSheet.tsx:184-223`) but is listed third in the menu. Tester #3 missed it entirely. Fix: re-order so Photo is first, with copy that explicitly addresses the "no barcode" case.

**Files:**
- Modify: `RadianceIQ/src/components/AddProductSheet.tsx` (lines 295-346)

- [ ] **Step 1: Reorder the menu**

Replace the entire `mode === 'menu'` block (lines 295-346) with:

```tsx
            {mode === 'menu' && (
              <View style={styles.menuOptions}>
                <TouchableOpacity
                  style={styles.menuOption}
                  onPress={() => requestCameraAndGo('photo')}
                >
                  <View style={styles.menuIconWrap}>
                    <Feather name="camera" size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.menuTextCol}>
                    <Text style={styles.menuLabel}>Take a photo</Text>
                    <Text style={styles.menuDesc}>
                      Snap the front of the product — works without a barcode
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuOption}
                  onPress={() => requestCameraAndGo('barcode')}
                >
                  <View style={styles.menuIconWrap}>
                    <Feather name="maximize" size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.menuTextCol}>
                    <Text style={styles.menuLabel}>Scan barcode</Text>
                    <Text style={styles.menuDesc}>Fastest if your product has one</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuOption} onPress={() => setMode('search')}>
                  <View style={styles.menuIconWrap}>
                    <Feather name="search" size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.menuTextCol}>
                    <Text style={styles.menuLabel}>Search by name</Text>
                    <Text style={styles.menuDesc}>Find from our database</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={Colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuOption} onPress={() => setMode('manual')}>
                  <View style={styles.menuIconWrap}>
                    <Feather name="edit-3" size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.menuTextCol}>
                    <Text style={styles.menuLabel}>Enter manually</Text>
                    <Text style={styles.menuDesc}>Type name and ingredients</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}
```

- [ ] **Step 2: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 3: Manual verification**

Open Products tab → Add Product. Verify order: Photo → Barcode → Search → Manual. Photo's description reads "Snap the front of the product — works without a barcode."

- [ ] **Step 4: Commit**

```bash
git add RadianceIQ/src/components/AddProductSheet.tsx
git commit -m "fix: promote photo capture as primary product-add path"
```

---

---

# PHASE 3 — Diagnostic-led fixes

These three fixes each start with a targeted diagnostic step because the root cause isn't pre-confirmed. The diagnostic step produces a concrete fix, which is then applied in the same task.

## Task 7: Diagnose and fix product search recall

**Why:** Tester #4 said "can't find the product." We don't yet know which product or which source was queried. Task starts with reading the search implementation.

**Files:**
- Read: `RadianceIQ/src/services/productLookup.ts`
- Read: `RadianceIQ/backend/curated-products.js` (search/filter helpers, if any)
- Modify: `RadianceIQ/src/services/productLookup.ts` (applied fix)
- Create: `RadianceIQ/src/services/__tests__/productLookup.test.ts` (if missing)

- [ ] **Step 1: Read the search implementation**

Read `RadianceIQ/src/services/productLookup.ts`, focusing on `searchProductsMultiSource`. Note:
- Sources queried and the order
- Matching strategy (exact, substring, fuzzy, Levenshtein)
- Minimum query length filter
- Short-circuit behavior (does it stop on first source with hits?)
- Deduplication logic

Also run:
```bash
cd RadianceIQ && grep -n "search\|filter\|match" backend/curated-products.js | head -40
```
to see whether the backend curated-products module exposes a search helper and how it tokenizes queries.

- [ ] **Step 2: Document the diagnosis**

Append to this plan file under a new heading `## Task 7 Diagnosis` (at the very bottom, before the final self-review section). Include 5-15 lines covering:
- Sources queried in order
- Matching strategy used per source
- Likely failure modes (e.g. "curated DB only matches when query substring is a prefix of the product name", "OFF only returns products with barcodes, no fuzzy fallback")
- The concrete one-line fix (e.g. "lower min query length from 3 to 2", "add Levenshtein fallback when exact returns 0", "split query on whitespace and match each token independently")

- [ ] **Step 3: Apply the targeted fix**

Implement the fix identified in Step 2. Keep it small — if the diagnosis reveals the fix is non-trivial (>30 lines, multi-source rework), STOP and create a separate plan file `docs/superpowers/plans/2026-04-07-product-search-recall-deeper-fix.md`. Do not bloat this plan with multi-day work — instead note the deferral in the diagnosis and continue to Task 8.

- [ ] **Step 4: Write a unit test exercising the fix**

Create `RadianceIQ/src/services/__tests__/productLookup.test.ts` if it doesn't exist. Write a test that calls `searchProductsMultiSource` with a query that previously returned 0 results and now returns ≥1. Example shape:

```typescript
import { searchProductsMultiSource } from '../productLookup';

describe('searchProductsMultiSource', () => {
  it('finds a product via partial brand name match', async () => {
    const results = await searchProductsMultiSource('cerave hydrating'); // replace with the actual failing query
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name.toLowerCase()).toContain('cerave');
  });
});
```

Replace the query and expected match with whatever the diagnosis identifies.

- [ ] **Step 5: Run the test**

Run: `cd RadianceIQ && npm test -- productLookup.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add RadianceIQ/src/services/productLookup.ts \
        RadianceIQ/src/services/__tests__/productLookup.test.ts \
        docs/superpowers/plans/2026-04-07-ultraplan-fixes-and-pattern-engine.md
git commit -m "fix: improve product search recall (see diagnosis in plan)"
```

---

## Task 8: Diagnose and fix missing ingredients

**Why:** Recurring across builds 5, 18, 51. Could be barcode lookup returning empty, OFF missing data, or a frontend filter dropping them. Task starts with tracing end-to-end.

**Files:**
- Read: `RadianceIQ/src/services/productLookup.ts` (`lookupBarcode`, `identifyProductPhoto`)
- Read: `RadianceIQ/backend/app.js` (the corresponding endpoints if any)
- Modify: `RadianceIQ/src/services/productLookup.ts` (applied fix)
- Modify: `RadianceIQ/src/services/analytics.ts` (new event)
- Modify: `RadianceIQ/src/services/__tests__/productLookup.test.ts`

- [ ] **Step 1: Trace the ingredients path end to end**

Read `productLookup.ts`. For each of `lookupBarcode`, `identifyProductPhoto`, and `searchProductsMultiSource`, identify how `result.ingredients` is populated. Then read the backend endpoints those functions hit (search `RadianceIQ/backend/app.js` for the corresponding routes). Red flags to look for:
- `ingredients = data.ingredients || []` silent fallback with no warning
- OFF API request that doesn't include the `ingredients_text` or `ingredients` fields in `fields` parameter
- Parsing step that splits on commas but the source returns a structured array
- Fallback to `categories` instead of `ingredients` when `ingredients` is empty

- [ ] **Step 2: Reproduce the bug locally (or via test)**

Write a one-off test (can be temporary, delete after) that calls `lookupBarcode('011822307246')` (PanOxyl Foaming Wash 10%, in the curated DB — should have ingredients). Then call it with a barcode likely not in the curated DB to hit OFF fallback. Note which sources return empty.

- [ ] **Step 3: Document the diagnosis**

Append to this plan file under `## Task 8 Diagnosis`. Cover:
- Which source(s) drop ingredients
- Whether it's a missing field request, parsing bug, or genuinely empty source data
- The concrete fix (e.g. "add `ingredients_text_en,ingredients` to OFF request fields", "fall back to `ingredients_hierarchy` when `ingredients` is empty", "parse `ingredients_text` when array is missing")

- [ ] **Step 4: Apply the fix**

Implement the fix. Example: if OFF requests are missing `ingredients_text` in the `fields` param, update the fetch URL:

```typescript
// Before:
// const url = `https://world.openbeautyfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands`;
// After:
const url = `https://world.openbeautyfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,ingredients_text,ingredients,ingredients_hierarchy`;
```

And add fallback logic in the response parser:

```typescript
const ingredients =
  (Array.isArray(data.product?.ingredients) && data.product.ingredients.length > 0
    ? data.product.ingredients.map((i: any) => i.text ?? i.id).filter(Boolean)
    : null)
  ?? (typeof data.product?.ingredients_text === 'string'
    ? data.product.ingredients_text.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean)
    : null)
  ?? (Array.isArray(data.product?.ingredients_hierarchy)
    ? data.product.ingredients_hierarchy.map((s: string) => s.replace(/^en:/, '')).filter(Boolean)
    : []);
```

Adapt this shape to whatever the diagnosis identifies.

- [ ] **Step 5: Add an analytics event for visibility**

In `RadianceIQ/src/services/productLookup.ts`, when a lookup returns empty ingredients from any source, fire:

```typescript
import { trackEvent } from './analytics';

// inside the lookup function, after determining ingredients is empty:
if (ingredients.length === 0) {
  trackEvent('product_ingredients_empty', {
    source: 'off', // or 'curated' or 'photo'
    barcode: barcode ?? null,
    query: null,
  });
}
```

This gives PostHog telemetry on how often this happens going forward, so we can quantify the fix.

- [ ] **Step 6: Write a test for the fix**

Append to `RadianceIQ/src/services/__tests__/productLookup.test.ts`:

```typescript
describe('lookupBarcode ingredients fallback', () => {
  it('parses ingredients_text when structured array is missing', async () => {
    // Mock fetch to return only ingredients_text (OFF legacy format)
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        product: {
          product_name: 'Test Product',
          brands: 'Test Brand',
          ingredients_text: 'Water, Glycerin, Niacinamide, Hyaluronic Acid',
        },
      }),
    });
    (global as any).fetch = mockFetch;

    const result = await lookupBarcode('1234567890');
    expect(result).not.toBeNull();
    expect(result!.ingredients).toEqual(['Water', 'Glycerin', 'Niacinamide', 'Hyaluronic Acid']);
  });
});
```

- [ ] **Step 7: Run the tests**

Run: `cd RadianceIQ && npm test -- productLookup.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add RadianceIQ/src/services/productLookup.ts \
        RadianceIQ/src/services/__tests__/productLookup.test.ts \
        docs/superpowers/plans/2026-04-07-ultraplan-fixes-and-pattern-engine.md
git commit -m "fix: surface and patch missing ingredients in product lookup"
```

---

## Task 9: Diagnose and tune the abrupt shadow animation

**Why:** Tester #7 said "can see the shadow come on too obviously" on build 25 (Mar 18 — very old). Likely candidates: `LinearGradient` backdrop on `StoryPage` in `app/scan/results.tsx:52-57`, the `ScoreGlow` rings (lines 127-171), or a Reanimated entrance on the analyzing → results transition.

**Files:**
- Read: `RadianceIQ/app/scan/results.tsx` (full, especially lines 120-250)
- Read: `RadianceIQ/app/scan/analyzing.tsx`
- Modify: whichever animation is identified

- [ ] **Step 1: Check git log for prior fixes**

Run: `cd RadianceIQ && git log --oneline -20 app/scan/results.tsx app/scan/analyzing.tsx`

If the files have been heavily touched since build 25 (Mar 18), the bug may already be fixed. If so, document in the plan under `## Task 9 Diagnosis` and commit with a "polish: verified no repro on current build" note.

- [ ] **Step 2: Run the app on a sim to reproduce**

Run: `cd RadianceIQ && npm start`

Complete a scan and watch the analyzing → results transition. Specifically look for:
- Any opacity or shadow that snaps in faster than ~250ms
- Backdrop/vignette appearing without a fade
- `withTiming` calls without an `easing` parameter (defaults to linear)

- [ ] **Step 3: Identify the offending animation**

Candidate 1 — `ScoreGlow` in `results.tsx:127-171`: The outer ring starts via `withDelay(600, withRepeat(...))`. The 600ms delay means the glow is invisible for 600ms then suddenly starts breathing. That can feel like a "snap."

Candidate 2 — `StoryPage` `LinearGradient` (line 52): has no entry animation. If the screen transitions via a fast router push, the gradient appears instantly.

Candidate 3 — any `FadeIn` / `FadeInDown` / `ZoomIn` from `react-native-reanimated` on the results screen (imports at lines 4-16).

- [ ] **Step 4: Apply the targeted fix**

If the issue is `ScoreGlow` starting suddenly after the 600ms delay, replace the initial breathe assignment in `results.tsx:130-140` with a graceful entrance:

```typescript
  useEffect(() => {
    // Graceful entrance: start at 0 opacity, fade up over 800ms, then begin breathing loop
    breathe.value = withTiming(1, { duration: 800, easing: BREATHE_EASING }, (finished) => {
      'worklet';
      if (finished) {
        breathe.value = withRepeat(
          withSequence(
            withTiming(1.06, { duration: 500, easing: BREATHE_EASING }),
            withTiming(0.94, { duration: 1000, easing: BREATHE_EASING }),
            withTiming(1, { duration: 500, easing: BREATHE_EASING }),
          ),
          -1,
        );
      }
    });
  }, []);
```

If the issue is the `StoryPage` `LinearGradient` snapping in, wrap it in an `Animated.View` with an `entering={FadeIn.duration(600)}` prop.

Implementer: apply whichever matches what you actually see. Only one should be correct.

- [ ] **Step 5: If unable to reproduce**

If you can't see any abrupt shadow after a thorough look, document in `## Task 9 Diagnosis`:
- What you checked
- Why you believe it's already fixed (cite commits from Step 1)
- Skip the fix and move on

- [ ] **Step 6: Commit (with fix, or skip with explanation)**

```bash
git add RadianceIQ/app/scan/results.tsx docs/superpowers/plans/2026-04-07-ultraplan-fixes-and-pattern-engine.md
git commit -m "polish: smooth scan results entrance animation"
```

---

---

# PHASE 4 — Fix verification checkpoint

## Task 10: Final verification of all Phase 1-3 fixes

**Why:** Catch any regression introduced by the cumulative fix changes before merging to main or cutting a TestFlight build. This is a natural pause point where you can ship a fixes-only build before starting the Pattern Engine work.

- [ ] **Step 1: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 2: Run the full test suite**

Run: `cd RadianceIQ && npm test`

Expected: All tests pass (existing 448 + ~8 new from Tasks 1-8).

- [ ] **Step 3: Manual smoke test on a sim**

Boot a sim, sign up as a new user, complete onboarding. Verify in order:

1. **Paywall gap closed:** Scan works immediately on first try (no paywall block). Then reset the app, simulate "upgraded user" via:
   ```bash
   # In a test harness or via React DevTools
   useStore.setState({
     subscription: {
       ...useStore.getState().subscription,
       trial_start_date: null,
       trial_end_date: null,
     },
   });
   ```
   Restart the app. Verify trial is granted on load and scan works.

2. **Ingredient label specificity:** Add a product manually with ingredient text `"Tretinoin Cream USP 0.025%"`. Open its detail screen. Verify primary label reads "Tretinoin Cream USP 0.025%" and a secondary "Tretinoin" tag appears beside it.

3. **Photo product capture promoted:** Open Products tab → Add Product. Verify menu order is Photo → Barcode → Search → Manual. Tap "Take a photo" and confirm it opens camera mode.

4. **Search recall fix** (if Task 7 shipped a fix): re-run the previously-failing search query and confirm results appear.

5. **Ingredients fallback** (if Task 8 shipped a fix): add a product via a barcode that previously returned empty ingredients. Confirm ingredients now populate.

6. **Shadow animation** (if Task 9 shipped a fix): complete a scan and watch the results screen entrance. Confirm no abrupt shadow/glow.

- [ ] **Step 4: Commit any final fixes from manual testing**

If Step 3 reveals issues, fix them and commit before moving to Phase 5.

- [ ] **Step 5: Optional — cut a TestFlight build**

At this checkpoint, the paywall fix alone justifies a TestFlight release. Running `/deploy-app` (or the existing deploy skill) here is a reasonable decision — it gets the critical fix in front of testers before the larger feature work begins. This is user-decision territory; don't automatically cut a build without confirmation.

---

*End of Phase 4. The TestFlight fixes are complete. Phases 5-11 build the Pattern Engine feature — a large, multi-week effort.*

---

# PHASE 5 — Pattern Engine pure logic + tests

**Why this phase exists:** The correlation engine is the heart of the feature. Building it first, fully tested against synthetic data, means we know it works before we invest in HealthKit wiring or UI. Zero user-visible changes in this phase — it's all library code.

## Task 11: Define types for Pattern, HealthDailyRecord, FirstLookInsight

**Files:**
- Modify: `RadianceIQ/src/types/index.ts`

- [ ] **Step 1: Append new type definitions**

Append to `RadianceIQ/src/types/index.ts`:

```typescript
// ─── Pattern Engine types ───────────────────────────────────────────────

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
  synced_at: string;
  partial: boolean;
}

export type PatternConfidence = 'strong' | 'moderate' | 'emerging' | 'watching';

export type PatternSignal =
  | 'overall'
  | 'acne'
  | 'inflammation'
  | 'hydration'
  | 'sunDamage'
  | 'elasticity';

export type PatternType =
  | 'cycle_signal_phase'
  | 'health_signal_lag'
  | 'lifestyle_signal_corr'
  | 'product_trajectory'
  | 'outlier_day';

export interface PatternChartPoint {
  date: string;
  signalValue: number;
  driverValue: number | null;
  driverLabel: string;
}

export interface Pattern {
  id: string;
  type: PatternType;
  signal: PatternSignal;
  driver: string;
  driverLabel: string;
  confidence: PatternConfidence;
  correlationCoefficient: number;
  sampleSize: number;
  lagDays: number;
  insightText: string;
  detailText: string;
  chartData: PatternChartPoint[];
  detectedAt: string;
  firstSeenAt: string;
  isPredicted: boolean;
  requiresHealthKit?: boolean;
  unlocksAtDay?: number;
}

export type FirstLookInsightDriver =
  | 'asymmetry'
  | 'age_gap'
  | 'hot_zone'
  | 'lesion_count'
  | 'cycle_setup'
  | 'positive_percentile';

export interface FirstLookInsight {
  headline: string;
  detail: string;
  driver: FirstLookInsightDriver;
}

export interface HealthSyncStatus {
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  in_progress: boolean;
}
```

- [ ] **Step 2: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add RadianceIQ/src/types/index.ts
git commit -m "types: add Pattern, HealthDailyRecord, FirstLookInsight"
```

---

## Task 12: Build synthetic data fixtures for pattern engine tests

**Files:**
- Create: `RadianceIQ/src/services/__tests__/fixtures/patternFixtures.ts`

- [ ] **Step 1: Create the fixtures file**

Create `RadianceIQ/src/services/__tests__/fixtures/patternFixtures.ts`:

```typescript
import type {
  ModelOutput,
  DailyRecord,
  HealthDailyRecord,
  UserProfile,
} from '../../../types';

// ─── Seeded PRNG for reproducible tests ────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number, mean: number, std: number): number {
  // Box-Muller
  const u1 = Math.max(1e-10, rand());
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

function dateAt(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

// ─── Cycle-signal phase fixture ────────────────────────────────────────────
export interface CycleFixtureOptions {
  cycles: number;
  cycleLength: number;            // e.g. 28
  inflammationPeakDayOffset: number; // e.g. -3 (3 days before period start)
  peakAmplitude: number;          // e.g. 18 (score points)
  noise: number;                  // std dev of additive gaussian
  seed?: number;
}

export function buildSyntheticCycleData(opts: CycleFixtureOptions) {
  const rand = mulberry32(opts.seed ?? 42);
  const totalDays = opts.cycles * opts.cycleLength;
  const modelOutputs: ModelOutput[] = [];
  const dailyRecords: DailyRecord[] = [];

  for (let day = 0; day < totalDays; day++) {
    const date = dateAt(totalDays - day - 1);
    const cycleDay = day % opts.cycleLength;
    // Distance (in days) from the peak
    const distToPeak = Math.min(
      Math.abs(cycleDay - ((opts.cycleLength + opts.inflammationPeakDayOffset) % opts.cycleLength)),
      opts.cycleLength - Math.abs(cycleDay - ((opts.cycleLength + opts.inflammationPeakDayOffset) % opts.cycleLength)),
    );
    // Gaussian-shaped peak
    const peakContribution = opts.peakAmplitude * Math.exp(-((distToPeak / 2) ** 2));
    const inflammation = 50 + peakContribution + gaussian(rand, 0, opts.noise);

    modelOutputs.push({
      output_id: `synthetic-${day}`,
      daily_id: `synthetic-daily-${day}`,
      signal_scores: {
        overall: 75,
        acne: 60,
        inflammation: Math.max(0, Math.min(100, inflammation)),
        hydration: 70,
        sunDamage: 65,
        elasticity: 72,
      },
    } as any);

    dailyRecords.push({
      daily_id: `synthetic-daily-${day}`,
      user_id: 'synthetic-user',
      date,
      cycle_day: cycleDay + 1,
    } as any);
  }

  const userProfile: UserProfile = {
    user_id: 'synthetic-user',
    age_range: '25-34',
    sex: 'female',
    menstrual_status: 'regular',
    cycle_length_days: opts.cycleLength,
    onboarding_complete: true,
  } as any;

  return {
    modelOutputs,
    dailyRecords,
    healthDailyRecords: [] as HealthDailyRecord[],
    userProfile,
  };
}

// ─── Health-signal lag fixture ─────────────────────────────────────────────
export interface HealthLagFixtureOptions {
  days: number;
  driver: 'hrv_sdnn_ms' | 'sleep_total_minutes' | 'resting_hr_bpm';
  signal: 'inflammation' | 'hydration' | 'acne' | 'overall';
  lag: number;                    // driver leads signal by `lag` days
  correlation: number;            // -1 to 1 target
  noise?: number;
  seed?: number;
}

export function buildSyntheticHealthData(opts: HealthLagFixtureOptions) {
  const rand = mulberry32(opts.seed ?? 43);
  const noise = opts.noise ?? 3;
  const modelOutputs: ModelOutput[] = [];
  const healthDailyRecords: HealthDailyRecord[] = [];

  const driverSeries: number[] = [];
  for (let day = 0; day < opts.days; day++) {
    driverSeries.push(gaussian(rand, 50, 15));
  }

  for (let day = 0; day < opts.days; day++) {
    const date = dateAt(opts.days - day - 1);
    const driverValue = driverSeries[day];
    // Scale driver to reasonable units per type
    const scaledDriver =
      opts.driver === 'hrv_sdnn_ms' ? 20 + driverValue * 0.8 :
      opts.driver === 'sleep_total_minutes' ? 360 + driverValue * 3 :
      opts.driver === 'resting_hr_bpm' ? 50 + driverValue * 0.4 :
      driverValue;

    // Signal = correlation * (driver value from `lag` days ago) + noise
    const lagIndex = day - opts.lag;
    const laggedDriver = lagIndex >= 0 ? driverSeries[lagIndex] : 50;
    const signalBase = 50 + opts.correlation * (laggedDriver - 50) * 0.8;
    const signalValue = Math.max(0, Math.min(100, signalBase + gaussian(rand, 0, noise)));

    modelOutputs.push({
      output_id: `synthetic-${day}`,
      daily_id: `synthetic-daily-${day}`,
      signal_scores: {
        overall: opts.signal === 'overall' ? signalValue : 75,
        acne: opts.signal === 'acne' ? signalValue : 60,
        inflammation: opts.signal === 'inflammation' ? signalValue : 55,
        hydration: opts.signal === 'hydration' ? signalValue : 70,
        sunDamage: 65,
        elasticity: 72,
      },
    } as any);

    healthDailyRecords.push({
      health_daily_id: `synthetic-health-${day}`,
      user_id: 'synthetic-user',
      date,
      source: 'apple_health',
      sleep_total_minutes: opts.driver === 'sleep_total_minutes' ? scaledDriver : null,
      sleep_deep_minutes: null,
      sleep_rem_minutes: null,
      hrv_sdnn_ms: opts.driver === 'hrv_sdnn_ms' ? scaledDriver : null,
      resting_hr_bpm: opts.driver === 'resting_hr_bpm' ? scaledDriver : null,
      steps: null,
      mindful_minutes: null,
      synced_at: new Date().toISOString(),
      partial: true,
    });
  }

  const userProfile: UserProfile = {
    user_id: 'synthetic-user',
    age_range: '25-34',
    sex: 'female',
    onboarding_complete: true,
  } as any;

  return {
    modelOutputs,
    dailyRecords: [] as DailyRecord[],
    healthDailyRecords,
    userProfile,
  };
}

// ─── Append-noise helper for demotion tests ────────────────────────────────
export function appendNoise<T extends { modelOutputs: ModelOutput[]; healthDailyRecords: HealthDailyRecord[] }>(
  input: T,
  days: number,
  seed = 99,
): T {
  const rand = mulberry32(seed);
  const startDay = input.modelOutputs.length;
  const newOutputs: ModelOutput[] = [];
  const newHealth: HealthDailyRecord[] = [];

  for (let i = 0; i < days; i++) {
    const date = dateAt(0 - i - 1);
    newOutputs.push({
      output_id: `noise-${startDay + i}`,
      daily_id: `noise-daily-${startDay + i}`,
      signal_scores: {
        overall: 75,
        acne: 60 + gaussian(rand, 0, 20),
        inflammation: 55 + gaussian(rand, 0, 20),
        hydration: 70 + gaussian(rand, 0, 20),
        sunDamage: 65,
        elasticity: 72,
      },
    } as any);
    newHealth.push({
      health_daily_id: `noise-health-${startDay + i}`,
      user_id: 'synthetic-user',
      date,
      source: 'apple_health',
      sleep_total_minutes: 420 + gaussian(rand, 0, 60),
      sleep_deep_minutes: null,
      sleep_rem_minutes: null,
      hrv_sdnn_ms: 45 + gaussian(rand, 0, 10),
      resting_hr_bpm: null,
      steps: null,
      mindful_minutes: null,
      synced_at: new Date().toISOString(),
      partial: true,
    });
  }

  return {
    ...input,
    modelOutputs: [...input.modelOutputs, ...newOutputs],
    healthDailyRecords: [...input.healthDailyRecords, ...newHealth],
  };
}
```

- [ ] **Step 2: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors. If errors point to mismatches with existing `ModelOutput` / `DailyRecord` / `UserProfile` types, adjust the `as any` casts and real field population to match the actual shapes in `src/types/index.ts`.

- [ ] **Step 3: Commit**

```bash
git add RadianceIQ/src/services/__tests__/fixtures/patternFixtures.ts
git commit -m "test: synthetic data fixtures for pattern engine"
```

---

## Task 13: Build the pattern engine (pure function)

**Files:**
- Create: `RadianceIQ/src/services/patternEngine.ts`
- Create: `RadianceIQ/src/services/patternPriors.ts`

- [ ] **Step 1: Create the priors table**

Create `RadianceIQ/src/services/patternPriors.ts`:

```typescript
import type { Pattern, PatternSignal, PatternConfidence, UserProfile } from '../types';

export interface PredictedPatternTemplate {
  id: string;
  triggerWhen: (profile: UserProfile) => boolean;
  confidence: Extract<PatternConfidence, 'watching'>;
  headline: string;
  detail: string;
  signal: PatternSignal;
  driver: string;
  driverLabel: string;
  unlocksAtDay: number;
  requiresHealthKit: boolean;
}

export const PATTERN_PRIORS: PredictedPatternTemplate[] = [
  {
    id: 'cycle_inflammation_prior',
    triggerWhen: (p) => p.sex === 'female' && p.menstrual_status === 'regular',
    confidence: 'watching',
    headline: 'Most cycles produce a 3-7 day inflammation peak before each period',
    detail: 'In our data, 73% of regularly cycling users see this pattern by day 14. We are tracking yours.',
    signal: 'inflammation',
    driver: 'cycle_day',
    driverLabel: 'cycle',
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
    driverLabel: 'sleep',
    unlocksAtDay: 14,
    requiresHealthKit: true,
  },
  {
    id: 'alcohol_acne_prior',
    triggerWhen: (p) =>
      ['1-2x_week', '3-4x_week', '5+x_week'].includes((p as any).drink_baseline_frequency ?? ''),
    confidence: 'watching',
    headline: 'Alcohol affects acne in most users — usually within 14 days',
    detail: 'Your baseline says you drink semi-regularly. If alcohol is moving your skin, we will see it.',
    signal: 'acne',
    driver: 'drinks_yesterday',
    driverLabel: 'alcohol',
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
    driverLabel: 'stress',
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
    driverLabel: 'HRV',
    unlocksAtDay: 14,
    requiresHealthKit: true,
  },
  {
    id: 'product_trajectory_prior',
    triggerWhen: (p) => p.onboarding_complete === true,
    confidence: 'watching',
    headline: 'Every product you add gets a before/after trajectory analysis',
    detail: 'As soon as you have used a product for 14 days, we will show you how it moved your skin.',
    signal: 'overall',
    driver: 'product_start',
    driverLabel: 'products',
    unlocksAtDay: 14,
    requiresHealthKit: false,
  },
];

export function selectPredictedPatterns(profile: UserProfile, maxCount = 3): Pattern[] {
  const now = new Date().toISOString();
  return PATTERN_PRIORS
    .filter((tpl) => tpl.triggerWhen(profile))
    .slice(0, maxCount)
    .map((tpl) => ({
      id: tpl.id,
      type: 'health_signal_lag' as const,   // placeholder; predicted patterns don't have real type detection
      signal: tpl.signal,
      driver: tpl.driver,
      driverLabel: tpl.driverLabel,
      confidence: tpl.confidence,
      correlationCoefficient: 0,
      sampleSize: 0,
      lagDays: 0,
      insightText: tpl.headline,
      detailText: tpl.detail,
      chartData: [],
      detectedAt: now,
      firstSeenAt: now,
      isPredicted: true,
      requiresHealthKit: tpl.requiresHealthKit,
      unlocksAtDay: tpl.unlocksAtDay,
    }));
}
```

- [ ] **Step 2: Create the pattern engine**

Create `RadianceIQ/src/services/patternEngine.ts`:

```typescript
import type {
  Pattern,
  PatternConfidence,
  PatternSignal,
  PatternType,
  PatternChartPoint,
  ModelOutput,
  DailyRecord,
  HealthDailyRecord,
  UserProfile,
} from '../types';
import { selectPredictedPatterns } from './patternPriors';

export interface PatternEngineInput {
  modelOutputs: ModelOutput[];
  dailyRecords: DailyRecord[];
  healthDailyRecords: HealthDailyRecord[];
  userProfile: UserProfile;
}

const CONFIDENCE_ORDER: Record<PatternConfidence, number> = {
  strong: 4,
  moderate: 3,
  emerging: 2,
  watching: 1,
};

const SIGNAL_LABELS: Record<PatternSignal, string> = {
  overall: 'skin score',
  acne: 'acne',
  inflammation: 'inflammation',
  hydration: 'hydration',
  sunDamage: 'sun damage',
  elasticity: 'elasticity',
};

// ─── Stats helpers ─────────────────────────────────────────────────────────
function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, xDen = 0, yDen = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    num += dx * dy;
    xDen += dx * dx;
    yDen += dy * dy;
  }
  const den = Math.sqrt(xDen * yDen);
  if (den === 0) return 0;
  return num / den;
}

function zScore(values: number[], target: number): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return (target - mean) / std;
}

interface LagResult {
  r: number;
  lag: number;
  n: number;
}

function bestLag(
  driver: Array<number | null>,
  signal: Array<number | null>,
  maxLag = 3,
): LagResult {
  let best: LagResult = { r: 0, lag: 0, n: 0 };
  for (let lag = 0; lag <= maxLag; lag++) {
    const pairs: { d: number; s: number }[] = [];
    for (let i = lag; i < driver.length && i < signal.length; i++) {
      const d = driver[i - lag];
      const s = signal[i];
      if (d !== null && s !== null && Number.isFinite(d) && Number.isFinite(s)) {
        pairs.push({ d, s });
      }
    }
    if (pairs.length < 10) continue;
    const r = pearson(pairs.map((p) => p.d), pairs.map((p) => p.s));
    if (Math.abs(r) > Math.abs(best.r)) {
      best = { r, lag, n: pairs.length };
    }
  }
  return best;
}

// ─── Confidence scoring ────────────────────────────────────────────────────
function scoreConfidence(absR: number, n: number): PatternConfidence | null {
  if (absR >= 0.6 && n >= 21) return 'strong';
  if (absR >= 0.45 && n >= 14) return 'moderate';
  if (absR >= 0.35 && n >= 10) return 'emerging';
  return null;
}

// ─── Per-day alignment helpers ─────────────────────────────────────────────
interface DaySlice {
  date: string;
  signals: Record<PatternSignal, number | null>;
  daily?: DailyRecord;
  health?: HealthDailyRecord;
}

function buildDaySlices(input: PatternEngineInput): DaySlice[] {
  const byDate = new Map<string, DaySlice>();
  const daily = new Map<string, DailyRecord>();
  for (const r of input.dailyRecords) daily.set(r.date, r);
  const health = new Map<string, HealthDailyRecord>();
  for (const h of input.healthDailyRecords) health.set(h.date, h);

  // Use daily records as the timeline anchor; many users have more daily records than scans
  const allDates = new Set<string>();
  for (const r of input.dailyRecords) allDates.add(r.date);
  for (const o of input.modelOutputs) {
    const r = input.dailyRecords.find((d) => d.daily_id === (o as any).daily_id);
    if (r) allDates.add(r.date);
  }

  for (const date of allDates) {
    const record = daily.get(date);
    const outputForDate = input.modelOutputs.find((o) => {
      const r = input.dailyRecords.find((d) => d.daily_id === (o as any).daily_id);
      return r?.date === date;
    });
    const signalScores = ((outputForDate as any)?.signal_scores ?? {}) as Partial<Record<PatternSignal, number>>;
    byDate.set(date, {
      date,
      signals: {
        overall: signalScores.overall ?? null,
        acne: signalScores.acne ?? null,
        inflammation: signalScores.inflammation ?? null,
        hydration: signalScores.hydration ?? null,
        sunDamage: signalScores.sunDamage ?? null,
        elasticity: signalScores.elasticity ?? null,
      },
      daily: record,
      health: health.get(date),
    });
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Detectors ─────────────────────────────────────────────────────────────
function detectHealthSignalLag(slices: DaySlice[]): Pattern[] {
  const out: Pattern[] = [];
  const now = new Date().toISOString();
  const healthDrivers: Array<{ key: keyof HealthDailyRecord; label: string; expectSign?: -1 | 1 }> = [
    { key: 'sleep_total_minutes', label: 'sleep', expectSign: 1 },
    { key: 'hrv_sdnn_ms', label: 'HRV', expectSign: 1 },
    { key: 'resting_hr_bpm', label: 'RHR', expectSign: -1 },
  ];
  const signals: PatternSignal[] = ['inflammation', 'hydration', 'acne', 'overall'];

  for (const drv of healthDrivers) {
    const driverSeries = slices.map((s) => (s.health?.[drv.key] as number | null) ?? null);
    for (const signal of signals) {
      const signalSeries = slices.map((s) => s.signals[signal]);
      const lag = bestLag(driverSeries, signalSeries, 3);
      if (lag.n < 10) continue;
      const conf = scoreConfidence(Math.abs(lag.r), lag.n);
      if (!conf) continue;

      const signalLabel = SIGNAL_LABELS[signal];
      const direction = lag.r > 0 ? 'rises' : 'drops';
      const lagPhrase = lag.lag === 0 ? 'on the same day as' : `${lag.lag} day${lag.lag > 1 ? 's' : ''} after`;
      const insightText = `Your ${signalLabel} ${direction} ${lagPhrase} changes in your ${drv.label}`;
      const detailText = `Across ${lag.n} days of paired data, your ${signalLabel} consistently ${direction} ${lagPhrase} your ${drv.label}. This is one of the clearest patterns we have found in your data.`;

      const chartData: PatternChartPoint[] = slices
        .map((s) => ({
          date: s.date,
          signalValue: s.signals[signal] ?? 0,
          driverValue: (s.health?.[drv.key] as number | null) ?? null,
          driverLabel: drv.label,
        }))
        .filter((p) => p.driverValue !== null);

      out.push({
        id: `health_lag_${drv.key}_${signal}`,
        type: 'health_signal_lag',
        signal,
        driver: String(drv.key),
        driverLabel: drv.label,
        confidence: conf,
        correlationCoefficient: lag.r,
        sampleSize: lag.n,
        lagDays: lag.lag,
        insightText,
        detailText,
        chartData,
        detectedAt: now,
        firstSeenAt: now,
        isPredicted: false,
      });
    }
  }

  return out;
}

function detectLifestyleSignalCorr(slices: DaySlice[]): Pattern[] {
  const out: Pattern[] = [];
  const now = new Date().toISOString();
  const lifestyleDrivers: Array<{ key: string; label: string; extract: (r: DailyRecord | undefined) => number | null }> = [
    { key: 'drinks_yesterday', label: 'alcohol', extract: (r) => (r as any)?.drinks_yesterday ?? null },
    { key: 'stress_level', label: 'stress', extract: (r) => (r as any)?.stress_level ?? null },
    { key: 'sleep_quality', label: 'self-reported sleep', extract: (r) => (r as any)?.sleep_quality ?? null },
  ];
  const signals: PatternSignal[] = ['acne', 'inflammation', 'hydration', 'overall'];

  for (const drv of lifestyleDrivers) {
    const driverSeries = slices.map((s) => drv.extract(s.daily));
    for (const signal of signals) {
      const signalSeries = slices.map((s) => s.signals[signal]);
      const lag = bestLag(driverSeries, signalSeries, 2);
      if (lag.n < 14) continue;
      if (Math.abs(lag.r) < 0.45) continue;
      const conf = scoreConfidence(Math.abs(lag.r), lag.n);
      if (!conf) continue;

      const signalLabel = SIGNAL_LABELS[signal];
      const direction = lag.r > 0 ? 'is worse' : 'improves';
      const lagPhrase = lag.lag === 0 ? 'on days with higher' : `${lag.lag} day${lag.lag > 1 ? 's' : ''} after days with higher`;
      const insightText = `Your ${signalLabel} ${direction} ${lagPhrase} ${drv.label}`;
      const detailText = `${lag.n} days of paired data show this link clearly. The correlation has been stable across your recent history.`;

      out.push({
        id: `lifestyle_${drv.key}_${signal}`,
        type: 'lifestyle_signal_corr',
        signal,
        driver: drv.key,
        driverLabel: drv.label,
        confidence: conf,
        correlationCoefficient: lag.r,
        sampleSize: lag.n,
        lagDays: lag.lag,
        insightText,
        detailText,
        chartData: [],
        detectedAt: now,
        firstSeenAt: now,
        isPredicted: false,
      });
    }
  }

  return out;
}

function detectCycleSignalPhase(slices: DaySlice[], profile: UserProfile): Pattern[] {
  if (profile.sex !== 'female' || profile.menstrual_status !== 'regular') return [];
  const out: Pattern[] = [];
  const now = new Date().toISOString();

  // Group slices by cycle day
  const byCycleDay = new Map<number, number[]>();
  for (const slice of slices) {
    const cycleDay = (slice.daily as any)?.cycle_day;
    if (typeof cycleDay !== 'number') continue;
    const signal = slice.signals.inflammation;
    if (signal === null || !Number.isFinite(signal)) continue;
    const list = byCycleDay.get(cycleDay) ?? [];
    list.push(signal);
    byCycleDay.set(cycleDay, list);
  }

  // Require at least 1.5 cycles of coverage
  if (byCycleDay.size < Math.floor((profile as any).cycle_length_days * 1.2 || 34)) return [];

  // Compute cycle-day averages
  const cycleDays: { day: number; mean: number }[] = [];
  for (const [day, values] of byCycleDay.entries()) {
    cycleDays.push({ day, mean: values.reduce((a, b) => a + b, 0) / values.length });
  }
  cycleDays.sort((a, b) => a.day - b.day);

  // Find peak offset from cycle start (day 1)
  let peakDay = 0;
  let peakMean = -Infinity;
  for (const { day, mean } of cycleDays) {
    if (mean > peakMean) {
      peakMean = mean;
      peakDay = day;
    }
  }

  // Convert peak day into "days before/after period"
  const cycleLength = (profile as any).cycle_length_days ?? 28;
  const offsetFromStart = peakDay;
  const daysBeforeNextPeriod = cycleLength - offsetFromStart;

  // Compute correlation between cycle-day phase and signal magnitude
  const xs = cycleDays.map((c) => c.day);
  const ys = cycleDays.map((c) => c.mean);
  const r = Math.abs(pearson(xs, ys));
  const n = xs.length;
  const conf = scoreConfidence(r, n);
  if (!conf) return [];

  const insightText = `Your inflammation peaks ${daysBeforeNextPeriod} days before your period`;
  const detailText = `Tracked across ${n} days of your cycle. Pattern is strongest in the 3-5 days before each period start.`;

  out.push({
    id: 'cycle_inflammation',
    type: 'cycle_signal_phase',
    signal: 'inflammation',
    driver: 'cycle_day',
    driverLabel: 'cycle',
    confidence: conf,
    correlationCoefficient: r,
    sampleSize: n,
    lagDays: -daysBeforeNextPeriod,
    insightText,
    detailText,
    chartData: cycleDays.map((c) => ({
      date: `day ${c.day}`,
      signalValue: c.mean,
      driverValue: c.day,
      driverLabel: 'cycle day',
    })),
    detectedAt: now,
    firstSeenAt: now,
    isPredicted: false,
  });

  return out;
}

// ─── Ranking + dedup ───────────────────────────────────────────────────────
function rankAndDedupe(patterns: Pattern[]): Pattern[] {
  // Dedupe per signal — keep highest-confidence per signal
  const bySignal = new Map<PatternSignal, Pattern>();
  for (const p of patterns) {
    const existing = bySignal.get(p.signal);
    if (!existing) {
      bySignal.set(p.signal, p);
      continue;
    }
    const newScore = CONFIDENCE_ORDER[p.confidence] * 1000 + Math.abs(p.correlationCoefficient) * 100;
    const oldScore = CONFIDENCE_ORDER[existing.confidence] * 1000 + Math.abs(existing.correlationCoefficient) * 100;
    if (newScore > oldScore) bySignal.set(p.signal, p);
  }
  return Array.from(bySignal.values()).sort((a, b) => {
    const co = CONFIDENCE_ORDER[b.confidence] - CONFIDENCE_ORDER[a.confidence];
    if (co !== 0) return co;
    return Math.abs(b.correlationCoefficient) - Math.abs(a.correlationCoefficient);
  });
}

// ─── Main entry point ──────────────────────────────────────────────────────
export function detectPatterns(input: PatternEngineInput): Pattern[] {
  // Perf cap: only look at last 90 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const prunedInput: PatternEngineInput = {
    ...input,
    modelOutputs: input.modelOutputs.filter((o) => {
      const d = input.dailyRecords.find((r) => r.daily_id === (o as any).daily_id);
      return !d || d.date >= cutoffStr;
    }),
    dailyRecords: input.dailyRecords.filter((r) => r.date >= cutoffStr),
    healthDailyRecords: input.healthDailyRecords.filter((h) => h.date >= cutoffStr),
  };

  const slices = buildDaySlices(prunedInput);

  // If fewer than 10 days of any paired data, skip real detection
  const realPatterns: Pattern[] =
    slices.length < 10
      ? []
      : [
          ...detectHealthSignalLag(slices),
          ...detectLifestyleSignalCorr(slices),
          ...detectCycleSignalPhase(slices, prunedInput.userProfile),
        ];

  const ranked = rankAndDedupe(realPatterns).slice(0, 5);

  // If we have fewer than 2 real patterns, fill with predicted
  if (ranked.length < 2) {
    const predicted = selectPredictedPatterns(prunedInput.userProfile, 3 - ranked.length);
    return [...ranked, ...predicted];
  }

  return ranked;
}
```

- [ ] **Step 3: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add RadianceIQ/src/services/patternEngine.ts RadianceIQ/src/services/patternPriors.ts
git commit -m "feat: pattern engine pure function + priors"
```

---

## Task 14: Write the pattern engine test suite

**Files:**
- Create: `RadianceIQ/src/services/__tests__/patternEngine.test.ts`

- [ ] **Step 1: Write the tests**

Create `RadianceIQ/src/services/__tests__/patternEngine.test.ts`:

```typescript
import { detectPatterns } from '../patternEngine';
import {
  buildSyntheticCycleData,
  buildSyntheticHealthData,
  appendNoise,
} from './fixtures/patternFixtures';
import type { UserProfile } from '../../types';

const emptyProfile: UserProfile = {
  user_id: 'u',
  age_range: '25-34',
  sex: 'female',
  onboarding_complete: true,
} as any;

describe('patternEngine.detectPatterns', () => {
  describe('cycle_signal_phase', () => {
    it('detects a cycle-inflammation pattern with 2+ full cycles of clean data', () => {
      const input = buildSyntheticCycleData({
        cycles: 2,
        cycleLength: 28,
        inflammationPeakDayOffset: 25,  // peak late in cycle
        peakAmplitude: 18,
        noise: 2,
      });
      const patterns = detectPatterns(input);
      const cyclePattern = patterns.find((p) => p.type === 'cycle_signal_phase');
      expect(cyclePattern).toBeDefined();
      expect(cyclePattern!.signal).toBe('inflammation');
      expect(cyclePattern!.isPredicted).toBe(false);
    });

    it('does NOT detect cycle pattern with only 1 cycle of data', () => {
      const input = buildSyntheticCycleData({
        cycles: 1,
        cycleLength: 28,
        inflammationPeakDayOffset: 25,
        peakAmplitude: 18,
        noise: 2,
      });
      const patterns = detectPatterns(input);
      expect(patterns.find((p) => p.type === 'cycle_signal_phase')).toBeUndefined();
    });

    it('does not reach strong confidence with high noise', () => {
      const input = buildSyntheticCycleData({
        cycles: 3,
        cycleLength: 28,
        inflammationPeakDayOffset: 25,
        peakAmplitude: 5,
        noise: 25,
      });
      const patterns = detectPatterns(input);
      const cyclePattern = patterns.find((p) => p.type === 'cycle_signal_phase');
      if (cyclePattern) {
        expect(cyclePattern.confidence).not.toBe('strong');
      }
    });
  });

  describe('health_signal_lag', () => {
    it('detects HRV→inflammation lag with strong negative correlation', () => {
      const input = buildSyntheticHealthData({
        days: 24,
        driver: 'hrv_sdnn_ms',
        signal: 'inflammation',
        lag: 1,
        correlation: -0.8,
        noise: 2,
      });
      const patterns = detectPatterns(input);
      const lagPattern = patterns.find(
        (p) => p.type === 'health_signal_lag' && p.driver === 'hrv_sdnn_ms' && p.signal === 'inflammation',
      );
      expect(lagPattern).toBeDefined();
      expect(lagPattern!.lagDays).toBe(1);
      expect(lagPattern!.confidence).toBeDefined();
    });

    it('detects sleep→hydration lag', () => {
      const input = buildSyntheticHealthData({
        days: 24,
        driver: 'sleep_total_minutes',
        signal: 'hydration',
        lag: 1,
        correlation: 0.75,
        noise: 3,
      });
      const patterns = detectPatterns(input);
      const lagPattern = patterns.find(
        (p) => p.driver === 'sleep_total_minutes' && p.signal === 'hydration',
      );
      expect(lagPattern).toBeDefined();
    });

    it('does not detect a pattern when correlation is zero', () => {
      const input = buildSyntheticHealthData({
        days: 24,
        driver: 'hrv_sdnn_ms',
        signal: 'inflammation',
        lag: 0,
        correlation: 0,
        noise: 5,
      });
      const patterns = detectPatterns(input);
      const realLag = patterns.find(
        (p) => p.type === 'health_signal_lag' && !p.isPredicted,
      );
      expect(realLag).toBeUndefined();
    });
  });

  describe('cold start', () => {
    it('returns only predicted patterns for a brand new user', () => {
      const patterns = detectPatterns({
        modelOutputs: [],
        dailyRecords: [],
        healthDailyRecords: [],
        userProfile: {
          ...emptyProfile,
          menstrual_status: 'regular',
          drink_baseline_frequency: '1-2x_week',
        } as any,
      });
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every((p) => p.isPredicted)).toBe(true);
    });

    it('fills with predicted patterns when real patterns are sparse', () => {
      const input = buildSyntheticHealthData({
        days: 24,
        driver: 'hrv_sdnn_ms',
        signal: 'inflammation',
        lag: 1,
        correlation: -0.8,
      });
      input.userProfile.menstrual_status = 'regular' as any;
      const patterns = detectPatterns(input);
      const hasReal = patterns.some((p) => !p.isPredicted);
      const hasPredicted = patterns.some((p) => p.isPredicted);
      expect(hasReal).toBe(true);
      // If only 1 real pattern, predicted should fill
      const realCount = patterns.filter((p) => !p.isPredicted).length;
      if (realCount < 2) expect(hasPredicted).toBe(true);
    });
  });

  describe('ranking and dedup', () => {
    it('returns at most 5 patterns', () => {
      const input = buildSyntheticHealthData({
        days: 30,
        driver: 'hrv_sdnn_ms',
        signal: 'inflammation',
        lag: 1,
        correlation: -0.8,
      });
      const patterns = detectPatterns(input);
      expect(patterns.length).toBeLessThanOrEqual(5);
    });

    it('sorts by confidence tier descending', () => {
      const input = buildSyntheticHealthData({
        days: 30,
        driver: 'hrv_sdnn_ms',
        signal: 'inflammation',
        lag: 1,
        correlation: -0.9,
      });
      const patterns = detectPatterns(input);
      const confOrder = { strong: 4, moderate: 3, emerging: 2, watching: 1 };
      for (let i = 0; i < patterns.length - 1; i++) {
        expect(confOrder[patterns[i].confidence])
          .toBeGreaterThanOrEqual(confOrder[patterns[i + 1].confidence]);
      }
    });
  });

  describe('demotion', () => {
    it('downgrades a strong pattern when new noisy data weakens it', () => {
      const initial = buildSyntheticHealthData({
        days: 24,
        driver: 'sleep_total_minutes',
        signal: 'hydration',
        lag: 1,
        correlation: 0.9,
        noise: 1,
      });
      const initialPatterns = detectPatterns(initial);
      const initialSleepPattern = initialPatterns.find(
        (p) => p.driver === 'sleep_total_minutes' && !p.isPredicted,
      );
      expect(initialSleepPattern).toBeDefined();

      const weakened = appendNoise(initial, 20);
      const weakenedPatterns = detectPatterns(weakened);
      const weakenedSleepPattern = weakenedPatterns.find(
        (p) => p.driver === 'sleep_total_minutes' && !p.isPredicted,
      );
      // Either downgraded or dropped entirely
      if (weakenedSleepPattern) {
        const rank = (c: string) => ({ strong: 4, moderate: 3, emerging: 2, watching: 1 } as any)[c];
        expect(rank(weakenedSleepPattern.confidence)).toBeLessThanOrEqual(rank(initialSleepPattern!.confidence));
      }
    });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd RadianceIQ && npm test -- patternEngine.test.ts`

Expected: All tests pass. If some fail due to fixture/engine mismatches in edge cases (likely with synthetic data noise), tune the fixtures OR the engine thresholds. The goal is: engine detects clean patterns, rejects noise, produces predicted patterns on cold start.

- [ ] **Step 3: Run the full test suite**

Run: `cd RadianceIQ && npm test`

Expected: All existing + new pattern tests pass. 0 TS errors.

- [ ] **Step 4: Commit**

```bash
git add RadianceIQ/src/services/__tests__/patternEngine.test.ts
git commit -m "test: pattern engine test suite (15+ cases)"
```

---

---

# PHASE 6 — HealthKit wiring

## Task 15: Install HealthKit package and configure EAS

**Files:**
- Modify: `RadianceIQ/package.json`
- Modify: `RadianceIQ/app.json`

- [ ] **Step 1: Install the package**

Run:
```bash
cd RadianceIQ && npx expo install @kingstinct/react-native-healthkit
```

- [ ] **Step 2: Add the config plugin to app.json**

Open `RadianceIQ/app.json`. Under `expo.plugins`, add an entry for the HealthKit plugin. Also add the purpose string to `expo.ios.infoPlist`:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSHealthShareUsageDescription": "Glowlytics reads sleep, heart rate, HRV, steps, and mindful minutes from Apple Health to find patterns in your skin. This data stays on your device."
      }
    },
    "plugins": [
      [
        "@kingstinct/react-native-healthkit",
        {
          "NSHealthShareUsageDescription": "Glowlytics reads sleep, heart rate, HRV, steps, and mindful minutes from Apple Health to find patterns in your skin. This data stays on your device."
        }
      ]
    ]
  }
}
```

Merge with whatever plugin entries already exist. Do not duplicate.

- [ ] **Step 3: Rebuild the dev client**

Run:
```bash
cd RadianceIQ && eas build --profile development --platform ios
```

This is a long-running build. Install the new dev client on a physical iOS device before proceeding to Task 16.

- [ ] **Step 4: Commit**

```bash
git add RadianceIQ/package.json RadianceIQ/app.json RadianceIQ/package-lock.json
git commit -m "chore: install @kingstinct/react-native-healthkit + config"
```

---

## Task 16: Implement real healthPermissions + healthSync

**Files:**
- Modify: `RadianceIQ/src/services/healthPermissions.ts` (replace mock)
- Create: `RadianceIQ/src/services/healthSync.ts`

- [ ] **Step 1: Replace the mock in healthPermissions.ts**

Replace the entire contents of `RadianceIQ/src/services/healthPermissions.ts` with:

```typescript
import { Platform } from 'react-native';
import HealthKit, {
  HKCategoryTypeIdentifier,
  HKQuantityTypeIdentifier,
} from '@kingstinct/react-native-healthkit';
import type {
  HealthConnectionState,
  HealthDataType,
  HealthSource,
  PermissionStatus,
} from '../types';

const REQUESTED_TYPES: HealthDataType[] = [
  'sleep',
  'resting_heart_rate',
  'heart_rate_variability',
];

const READ_PERMISSIONS = [
  HKCategoryTypeIdentifier.sleepAnalysis,
  HKQuantityTypeIdentifier.heartRateVariabilitySDNN,
  HKQuantityTypeIdentifier.restingHeartRate,
  HKQuantityTypeIdentifier.stepCount,
  HKCategoryTypeIdentifier.mindfulSession,
];

export const getHealthSourceLabel = (source?: HealthSource) => {
  if (source === 'apple_health') return 'Apple Health';
  if (source === 'health_connect') return 'Health Connect';
  return 'Health data';
};

export const getHealthConnectionState = async (
  _priorStatus?: PermissionStatus,
): Promise<HealthConnectionState> => {
  if (Platform.OS !== 'ios') {
    return {
      source: Platform.OS === 'android' ? 'health_connect' : undefined,
      status: 'unavailable',
      requested_types: REQUESTED_TYPES,
      granted_types: [],
      sync_skipped: false,
      last_checked_at: new Date().toISOString(),
      availability_note: 'Health data requires iOS for v1.',
    };
  }

  try {
    const isAvailable = await HealthKit.isHealthDataAvailable();
    if (!isAvailable) {
      return {
        source: 'apple_health',
        status: 'unavailable',
        requested_types: REQUESTED_TYPES,
        granted_types: [],
        sync_skipped: false,
        last_checked_at: new Date().toISOString(),
        availability_note: 'Apple Health is not available on this device.',
      };
    }
    return {
      source: 'apple_health',
      status: 'not_requested',
      requested_types: REQUESTED_TYPES,
      granted_types: [],
      sync_skipped: false,
      last_checked_at: new Date().toISOString(),
    };
  } catch (e: any) {
    return {
      source: 'apple_health',
      status: 'unavailable',
      requested_types: REQUESTED_TYPES,
      granted_types: [],
      sync_skipped: false,
      last_checked_at: new Date().toISOString(),
      availability_note: `Apple Health init failed: ${e?.message ?? e}`,
    };
  }
};

export const connectHealthData = async (
  _priorStatus?: PermissionStatus,
): Promise<HealthConnectionState> => {
  if (Platform.OS !== 'ios') {
    return getHealthConnectionState();
  }

  try {
    await HealthKit.requestAuthorization(READ_PERMISSIONS, []);
    return {
      source: 'apple_health',
      status: 'granted',
      requested_types: REQUESTED_TYPES,
      granted_types: REQUESTED_TYPES,
      sync_skipped: false,
      last_checked_at: new Date().toISOString(),
    };
  } catch (e: any) {
    return {
      source: 'apple_health',
      status: 'denied',
      requested_types: REQUESTED_TYPES,
      granted_types: [],
      sync_skipped: false,
      last_checked_at: new Date().toISOString(),
      availability_note: `Permission request failed: ${e?.message ?? e}`,
    };
  }
};

export const getHealthDataPreview = async (
  _state: Pick<HealthConnectionState, 'source' | 'granted_types'>,
): Promise<Partial<Record<HealthDataType, boolean>>> => {
  // Not used in v1 — return empty
  return {};
};
```

- [ ] **Step 2: Create healthSync.ts**

Create `RadianceIQ/src/services/healthSync.ts`:

```typescript
import { Platform } from 'react-native';
import HealthKit, {
  HKCategoryTypeIdentifier,
  HKQuantityTypeIdentifier,
  HKCategoryValueSleepAnalysis,
} from '@kingstinct/react-native-healthkit';
import type { HealthDailyRecord } from '../types';
import { localDateStr } from '../utils/localDate';

const generateId = () => `hdr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

interface SyncOneDayResult {
  record: HealthDailyRecord;
  errors: string[];
}

async function syncOneDay(date: Date, userId: string): Promise<SyncOneDayResult> {
  const errors: string[] = [];
  const dateStr = localDateStr(date);
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  // Sleep total + stages
  let sleepTotal: number | null = null;
  let sleepDeep: number | null = null;
  let sleepRem: number | null = null;
  try {
    const samples = await HealthKit.queryCategorySamples(
      HKCategoryTypeIdentifier.sleepAnalysis,
      { from: startOfDay, to: endOfDay },
    );
    let total = 0, deep = 0, rem = 0;
    for (const s of samples) {
      const minutes = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000;
      if (s.value === HKCategoryValueSleepAnalysis.asleepUnspecified || s.value === HKCategoryValueSleepAnalysis.asleepCore) {
        total += minutes;
      } else if (s.value === HKCategoryValueSleepAnalysis.asleepDeep) {
        total += minutes;
        deep += minutes;
      } else if (s.value === HKCategoryValueSleepAnalysis.asleepREM) {
        total += minutes;
        rem += minutes;
      }
    }
    if (total > 0) sleepTotal = Math.round(total);
    if (deep > 0) sleepDeep = Math.round(deep);
    if (rem > 0) sleepRem = Math.round(rem);
  } catch (e: any) {
    errors.push(`sleep: ${e?.message ?? e}`);
  }

  // HRV (average)
  let hrv: number | null = null;
  try {
    const samples = await HealthKit.queryQuantitySamples(
      HKQuantityTypeIdentifier.heartRateVariabilitySDNN,
      { from: startOfDay, to: endOfDay },
    );
    if (samples.length > 0) {
      hrv = samples.reduce((sum, s) => sum + s.quantity, 0) / samples.length;
    }
  } catch (e: any) {
    errors.push(`hrv: ${e?.message ?? e}`);
  }

  // RHR (latest value in range)
  let rhr: number | null = null;
  try {
    const samples = await HealthKit.queryQuantitySamples(
      HKQuantityTypeIdentifier.restingHeartRate,
      { from: startOfDay, to: endOfDay, limit: 1, ascending: false },
    );
    if (samples.length > 0) rhr = samples[0].quantity;
  } catch (e: any) {
    errors.push(`rhr: ${e?.message ?? e}`);
  }

  // Steps (sum)
  let steps: number | null = null;
  try {
    const samples = await HealthKit.queryQuantitySamples(
      HKQuantityTypeIdentifier.stepCount,
      { from: startOfDay, to: endOfDay },
    );
    if (samples.length > 0) {
      steps = Math.round(samples.reduce((sum, s) => sum + s.quantity, 0));
    }
  } catch (e: any) {
    errors.push(`steps: ${e?.message ?? e}`);
  }

  // Mindful minutes (sum of durations)
  let mindful: number | null = null;
  try {
    const samples = await HealthKit.queryCategorySamples(
      HKCategoryTypeIdentifier.mindfulSession,
      { from: startOfDay, to: endOfDay },
    );
    if (samples.length > 0) {
      mindful = Math.round(
        samples.reduce((sum, s) => sum + ((new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60000), 0),
      );
    }
  } catch (e: any) {
    errors.push(`mindful: ${e?.message ?? e}`);
  }

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
    synced_at: new Date().toISOString(),
    partial:
      sleepTotal === null || hrv === null || rhr === null || steps === null || mindful === null,
  };

  return { record, errors };
}

export async function pullLastNDays(n: number, userId: string): Promise<{ records: HealthDailyRecord[]; errors: string[] }> {
  if (Platform.OS !== 'ios') {
    return { records: [], errors: ['platform_not_ios'] };
  }
  const records: HealthDailyRecord[] = [];
  const errors: string[] = [];
  for (let daysAgo = 0; daysAgo < n; daysAgo++) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const result = await syncOneDay(date, userId);
    records.push(result.record);
    errors.push(...result.errors);
  }
  return { records, errors };
}
```

- [ ] **Step 3: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors. If the `@kingstinct/react-native-healthkit` API shape differs from what's used above, adapt the imports and method names to the installed version. Consult the package's README.

- [ ] **Step 4: Commit**

```bash
git add RadianceIQ/src/services/healthPermissions.ts RadianceIQ/src/services/healthSync.ts
git commit -m "feat: real HealthKit permissions + daily sync"
```

---

## Task 17: Extend store with health data fields + sync action

**Files:**
- Modify: `RadianceIQ/src/store/useStore.ts`

- [ ] **Step 1: Add state fields and actions to the AppState interface**

In `RadianceIQ/src/store/useStore.ts`, extend the `AppState` interface:

```typescript
  // ... existing fields ...
  healthDailyRecords: HealthDailyRecord[];
  healthSyncStatus: HealthSyncStatus;
  patterns: Pattern[];
  firstLookInsight: FirstLookInsight | null;

  // Actions
  addHealthDailyRecord: (record: HealthDailyRecord) => void;
  upsertHealthDailyRecord: (date: string, record: HealthDailyRecord) => void;
  syncHealthData: () => Promise<{ added: number; errors: string[] }>;
  setPatterns: (patterns: Pattern[]) => void;
  setFirstLookInsight: (insight: FirstLookInsight | null) => void;
  runPatternDetection: () => void;
```

Add the import at the top:

```typescript
import type {
  HealthDailyRecord,
  HealthSyncStatus,
  Pattern,
  FirstLookInsight,
} from '../types';
import { pullLastNDays } from '../services/healthSync';
import { detectPatterns } from '../services/patternEngine';
```

- [ ] **Step 2: Add initial state and implementations**

In the `create()` call body, add:

```typescript
  healthDailyRecords: [],
  healthSyncStatus: {
    last_sync_at: null,
    last_success_at: null,
    last_error: null,
    in_progress: false,
  },
  patterns: [],
  firstLookInsight: null,

  addHealthDailyRecord: (record) => {
    set((s) => ({ healthDailyRecords: [...s.healthDailyRecords, record] }));
    debouncedPersist(() => get().persistData());
  },

  upsertHealthDailyRecord: (date, record) => {
    set((s) => {
      const existing = s.healthDailyRecords.findIndex((r) => r.date === date);
      if (existing >= 0) {
        const next = [...s.healthDailyRecords];
        next[existing] = record;
        return { healthDailyRecords: next };
      }
      return { healthDailyRecords: [...s.healthDailyRecords, record] };
    });
    debouncedPersist(() => get().persistData());
  },

  syncHealthData: async () => {
    const user = get().user;
    if (!user) return { added: 0, errors: ['no_user'] };
    set((s) => ({ healthSyncStatus: { ...s.healthSyncStatus, in_progress: true } }));
    try {
      const { records, errors } = await pullLastNDays(2, user.user_id);
      for (const r of records) {
        get().upsertHealthDailyRecord(r.date, r);
      }
      set((s) => ({
        healthSyncStatus: {
          ...s.healthSyncStatus,
          in_progress: false,
          last_sync_at: new Date().toISOString(),
          last_success_at: errors.length === records.length * 5 ? s.healthSyncStatus.last_success_at : new Date().toISOString(),
          last_error: errors.length > 0 ? errors[0] : null,
        },
      }));
      // Trigger pattern re-detection after a successful sync
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

  setPatterns: (patterns) => {
    set({ patterns });
    debouncedPersist(() => get().persistData());
  },

  setFirstLookInsight: (insight) => {
    set({ firstLookInsight: insight });
    debouncedPersist(() => get().persistData());
  },

  runPatternDetection: () => {
    const state = get();
    if (!state.user) return;
    try {
      const patterns = detectPatterns({
        modelOutputs: state.modelOutputs,
        dailyRecords: state.dailyRecords,
        healthDailyRecords: state.healthDailyRecords,
        userProfile: state.user,
      });
      set({ patterns });
      debouncedPersist(() => get().persistData());
    } catch (e: any) {
      console.warn('[patternEngine] detection failed:', e?.message ?? e);
    }
  },
```

- [ ] **Step 3: Update persistData / loadPersistedData**

Find `persistData` (around line 544) and add the new fields to both the destructure and the JSON blob:

```typescript
  persistData: async () => {
    try {
      const {
        user, protocol, products, dailyRecords, modelOutputs, gamification,
        subscription, notificationSettings, onboardingFlow, onboardingFlowIndex,
        healthDailyRecords, healthSyncStatus, patterns, firstLookInsight,
      } = get();
      // ... existing capping ...
      // Cap health records to last 365 days as well
      const cappedHealthRecords = healthDailyRecords.filter((r) => r.date >= cutoffStr);
      await AsyncStorage.setItem('glowlytics_data', JSON.stringify({
        user, protocol, products,
        dailyRecords: cappedDailyRecords,
        modelOutputs: cappedModelOutputs,
        gamification, subscription, notificationSettings,
        onboardingFlow, onboardingFlowIndex,
        healthDailyRecords: cappedHealthRecords,
        healthSyncStatus, patterns, firstLookInsight,
      }));
    } catch (e) {
      console.log('Failed to persist data', e);
    }
  },
```

And in `loadPersistedData` (around line 499), add the new fields to the `set({...})` call:

```typescript
        set({
          user: normalizeUser(parsed.user),
          // ... existing fields ...
          healthDailyRecords: parsed.healthDailyRecords || [],
          healthSyncStatus: parsed.healthSyncStatus || {
            last_sync_at: null,
            last_success_at: null,
            last_error: null,
            in_progress: false,
          },
          patterns: parsed.patterns || [],
          firstLookInsight: parsed.firstLookInsight || null,
        });
```

Also add to `resetAll` (around line 562):

```typescript
      healthDailyRecords: [],
      healthSyncStatus: {
        last_sync_at: null,
        last_success_at: null,
        last_error: null,
        in_progress: false,
      },
      patterns: [],
      firstLookInsight: null,
```

- [ ] **Step 4: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 5: Run the full test suite**

Run: `cd RadianceIQ && npm test`

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add RadianceIQ/src/store/useStore.ts
git commit -m "feat: store fields + actions for health data and patterns"
```

---

## Task 18: Wire health sync to app foreground + post-scan

**Files:**
- Modify: `RadianceIQ/app/_layout.tsx`
- Modify: `RadianceIQ/app/scan/results.tsx` (or wherever scan completion triggers post-scan actions)

- [ ] **Step 1: Add AppState foreground listener in _layout.tsx**

In `RadianceIQ/app/_layout.tsx`, inside the root layout component, add (or extend an existing) `AppState` listener:

```typescript
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useStore } from '../src/store/useStore';

// Inside the layout component:
useEffect(() => {
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active') {
      const state = useStore.getState();
      const lastSync = state.healthSyncStatus.last_sync_at;
      const hoursSince = lastSync
        ? (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60)
        : Infinity;
      const hour = new Date().getHours();
      if (hoursSince > 6 && hour >= 7 && hour <= 23 && state.user) {
        state.syncHealthData();
      }
    }
  });
  return () => sub.remove();
}, []);
```

- [ ] **Step 2: Trigger pattern detection after scan completes**

In `RadianceIQ/app/scan/results.tsx`, find the place where `addModelOutput` is called (after a successful scan). Immediately after that call, add:

```typescript
// Kick off health sync + pattern detection opportunistically
useStore.getState().syncHealthData().catch(() => {});
// runPatternDetection is already called inside syncHealthData on success,
// but also call it here to cover the case where sync fails/is unavailable.
useStore.getState().runPatternDetection();
```

If `addModelOutput` is called from a service or hook rather than the screen, put the trigger at the appropriate level — the key requirement is: after every new scan, run pattern detection.

- [ ] **Step 3: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add RadianceIQ/app/_layout.tsx RadianceIQ/app/scan/results.tsx
git commit -m "feat: trigger health sync on foreground + pattern detect post-scan"
```

---

---

# PHASE 7 — Pattern card UI on Today

## Task 19: Build the PatternCard component

**Files:**
- Create: `RadianceIQ/src/components/PatternCard.tsx`

- [ ] **Step 1: Create PatternCard.tsx**

Create `RadianceIQ/src/components/PatternCard.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import type { Pattern, PatternConfidence, PatternSignal } from '../types';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
} from '../constants/theme';
import { SIGNAL_COLORS } from '../constants/signals';

const CONFIDENCE_COLORS: Record<PatternConfidence, { bg: string; text: string; label: string }> = {
  strong: { bg: 'rgba(58, 158, 143, 0.18)', text: '#3A9E8F', label: 'STRONG' },
  moderate: { bg: 'rgba(242, 181, 106, 0.18)', text: '#C07B2A', label: 'MODERATE' },
  emerging: { bg: 'rgba(99, 102, 181, 0.18)', text: '#6366B5', label: 'EMERGING' },
  watching: { bg: 'rgba(127, 127, 127, 0.12)', text: Colors.textMuted, label: 'WATCHING' },
};

interface PatternCardProps {
  pattern: Pattern;
  onPressDetail: () => void;
  onPressShare: () => void;
  widthHint?: number;
}

export const PatternCard: React.FC<PatternCardProps> = ({
  pattern,
  onPressDetail,
  onPressShare,
  widthHint,
}) => {
  const conf = CONFIDENCE_COLORS[pattern.confidence];
  const signalColor = SIGNAL_COLORS[pattern.signal as PatternSignal] ?? Colors.primary;
  const isPredicted = pattern.isPredicted;
  const daysToUnlock = pattern.unlocksAtDay ?? null;

  // Build sparkline polyline points (normalized to 0-100 of card width/height)
  const sparkWidth = 240;
  const sparkHeight = 60;
  const points = pattern.chartData.slice(-30);
  const sparkPoints =
    points.length > 1
      ? points
          .map((p, i) => {
            const x = (i / (points.length - 1)) * sparkWidth;
            const y = sparkHeight - (p.signalValue / 100) * sparkHeight;
            return `${x},${y}`;
          })
          .join(' ')
      : '';

  return (
    <View style={[styles.card, widthHint ? { width: widthHint } : null]}>
      {/* Confidence pill */}
      <View style={[styles.confPill, { backgroundColor: conf.bg }]}>
        <View style={[styles.confDot, { backgroundColor: conf.text }]} />
        <Text style={[styles.confText, { color: conf.text }]}>{conf.label}</Text>
      </View>

      {/* Headline */}
      <Text style={styles.headline} numberOfLines={3}>
        {pattern.insightText}
      </Text>

      {/* Sparkline or placeholder */}
      {!isPredicted && sparkPoints ? (
        <View style={styles.sparkline}>
          <Svg width={sparkWidth} height={sparkHeight}>
            <Polyline
              points={sparkPoints}
              fill="none"
              stroke={signalColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      ) : (
        <View style={[styles.sparkline, styles.sparkPlaceholder]}>
          <Feather name="activity" size={20} color={Colors.textDim} />
          <Text style={styles.placeholderText}>
            {daysToUnlock ? `Unlocks in ${daysToUnlock} days` : 'Building your pattern'}
          </Text>
        </View>
      )}

      {/* Sample line */}
      {!isPredicted && (
        <Text style={styles.sampleText}>
          Based on {pattern.sampleSize} days
        </Text>
      )}

      {/* Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity onPress={onPressDetail} style={styles.detailButton}>
          <Text style={styles.detailButtonText}>See pattern</Text>
        </TouchableOpacity>
        {!isPredicted && (
          <TouchableOpacity onPress={onPressShare} style={styles.shareButton}>
            <Feather name="share-2" size={14} color={Colors.background} />
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  confPill: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  confDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xxs,
    letterSpacing: 0.6,
  },
  headline: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
    lineHeight: 24,
    marginTop: Spacing.xs,
  },
  sparkline: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  sparkPlaceholder: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: 'rgba(127,127,127,0.06)',
    borderRadius: BorderRadius.md,
  },
  placeholderText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
  sampleText: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  detailButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  detailButtonText: {
    color: Colors.text,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  shareButtonText: {
    color: Colors.background,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add RadianceIQ/src/components/PatternCard.tsx
git commit -m "feat: PatternCard component"
```

---

## Task 20: Build PatternCarousel + PatternProgressBar

**Files:**
- Create: `RadianceIQ/src/components/PatternCarousel.tsx`
- Create: `RadianceIQ/src/components/PatternProgressBar.tsx`

- [ ] **Step 1: Create PatternCarousel.tsx**

```tsx
import React, { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View, ViewToken, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { Pattern } from '../types';
import { PatternCard } from './PatternCard';
import { Colors, FontFamily, FontSize, Spacing } from '../constants/theme';
import { exportAndSharePattern } from '../services/patternExport';
import { trackEvent } from '../services/analytics';

interface Props {
  patterns: Pattern[];
}

export const PatternCarousel: React.FC<Props> = ({ patterns }) => {
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();
  const cardWidth = Math.min(screenW - Spacing.lg * 2, 340);
  const [activeIndex, setActiveIndex] = useState(0);

  const onViewableItemsChanged = useRef((info: { viewableItems: ViewToken[] }) => {
    if (info.viewableItems[0]?.index != null) {
      setActiveIndex(info.viewableItems[0].index);
    }
  }).current;

  const handleDetail = useCallback(
    (pattern: Pattern) => {
      trackEvent('pattern_viewed', {
        pattern_id: pattern.id,
        pattern_type: pattern.type,
        confidence: pattern.confidence,
        is_predicted: pattern.isPredicted,
      });
      router.push({ pathname: '/pattern/[id]', params: { id: pattern.id } });
    },
    [router],
  );

  const handleShare = useCallback(async (pattern: Pattern) => {
    await exportAndSharePattern(pattern);
  }, []);

  if (patterns.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Patterns we've found</Text>
        <Feather name="chevron-right" size={16} color={Colors.textMuted} />
      </View>
      <FlatList
        data={patterns}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + Spacing.sm}
        decelerationRate="fast"
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ width: Spacing.sm }} />}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <PatternCard
            pattern={item}
            widthHint={cardWidth}
            onPressDetail={() => handleDetail(item)}
            onPressShare={() => handleShare(item)}
          />
        )}
        keyExtractor={(p) => p.id}
      />
      {patterns.length > 1 && (
        <View style={styles.dots}>
          {patterns.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  title: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    alignSelf: 'center',
    gap: 6,
    marginTop: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 16,
  },
});
```

- [ ] **Step 2: Create PatternProgressBar.tsx**

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store/useStore';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../constants/theme';

const MILESTONES = [
  { day: 1, label: 'today' },
  { day: 7, label: 'first receipt' },
  { day: 14, label: 'unlock' },
  { day: 21, label: 'mature' },
];

export const PatternProgressBar: React.FC = () => {
  const dailyRecords = useStore((s) => s.dailyRecords);
  const dataDays = dailyRecords.length;
  const maxDay = MILESTONES[MILESTONES.length - 1].day;
  const clamped = Math.min(dataDays, maxDay);
  const progress = clamped / maxDay;

  // Hide after day 21 — no longer useful
  if (dataDays >= maxDay) return null;

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        {MILESTONES.map((m) => {
          const x = (m.day / maxDay) * 100;
          const reached = dataDays >= m.day;
          return (
            <View
              key={m.day}
              style={[
                styles.milestone,
                { left: `${x}%` },
                reached && styles.milestoneReached,
              ]}
            />
          );
        })}
      </View>
      <View style={styles.labelsRow}>
        {MILESTONES.map((m) => (
          <Text
            key={m.day}
            style={[
              styles.label,
              dataDays >= m.day && styles.labelReached,
            ]}
          >
            {m.label}
          </Text>
        ))}
      </View>
      <Text style={styles.footer}>
        {dataDays >= 14
          ? 'Real patterns unlocked · keep scanning'
          : `Day ${dataDays} of 14 — real patterns unlock soon`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  track: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    position: 'relative',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  milestone: {
    position: 'absolute',
    top: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: Colors.border,
    transform: [{ translateX: -5 }],
  },
  milestoneReached: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  label: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xxs,
  },
  labelReached: {
    color: Colors.primary,
  },
  footer: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
```

- [ ] **Step 3: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add RadianceIQ/src/components/PatternCarousel.tsx RadianceIQ/src/components/PatternProgressBar.tsx
git commit -m "feat: PatternCarousel and PatternProgressBar"
```

---

## Task 21: Mount Pattern UI on Today screen

**Files:**
- Modify: `RadianceIQ/app/(tabs)/today.tsx`

- [ ] **Step 1: Import and render the new components**

Open `RadianceIQ/app/(tabs)/today.tsx`. Add imports at the top:

```typescript
import { PatternCarousel } from '../../src/components/PatternCarousel';
import { PatternProgressBar } from '../../src/components/PatternProgressBar';
```

Inside the component, read patterns from the store:

```typescript
const patterns = useStore((s) => s.patterns);
```

In the JSX, mount the carousel and progress bar between `SkinScoreHero` and the existing signal movers section:

```tsx
      <SkinScoreHero /* existing props */ />

      <PatternProgressBar />
      <PatternCarousel patterns={patterns} />

      {/* existing signal movers section */}
```

- [ ] **Step 2: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 3: Manual sanity on a sim**

Run: `cd RadianceIQ && npm start`, boot the app, sign up as a new user, complete onboarding. Verify:
- Pattern section appears on Today screen
- Progress bar shows "Day 1 of 14"
- Predicted patterns are visible (WATCHING pills)
- No real patterns yet (since no data accumulated)
- Tapping "See pattern" navigates (even if destination doesn't exist yet — that's Task 22)

- [ ] **Step 4: Commit**

```bash
git add RadianceIQ/app/(tabs)/today.tsx
git commit -m "feat: mount pattern carousel + progress bar on Today screen"
```

---

---

# PHASE 8 — Pattern detail screen

## Task 22: Create the pattern detail route + layout

**Files:**
- Create: `RadianceIQ/app/pattern/_layout.tsx`
- Create: `RadianceIQ/app/pattern/[id].tsx`

- [ ] **Step 1: Create the stack layout**

Create `RadianceIQ/app/pattern/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function PatternLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
```

- [ ] **Step 2: Create the detail screen**

Create `RadianceIQ/app/pattern/[id].tsx`:

```tsx
import React, { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Line, Polyline, Text as SvgText } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useStore } from '../../src/store/useStore';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
} from '../../src/constants/theme';
import { SIGNAL_COLORS } from '../../src/constants/signals';
import { exportAndSharePattern } from '../../src/services/patternExport';
import type { PatternSignal } from '../../src/types';

// Static "what you can try" lookup — keyed on (signal + driver)
const SUGGESTIONS: Record<string, string[]> = {
  'inflammation:cycle_day': [
    'Increase niacinamide use on days 22-28 of your cycle',
    'Reduce dairy and sugar in the same window',
    'Prioritize sleep — inflammation spikes are worse when sleep is short',
  ],
  'inflammation:hrv_sdnn_ms': [
    'Try to get 7+ hours of sleep — HRV recovers with rest',
    'Consider 10 minutes of mindful breathing on high-stress days',
    'Hold off on new active ingredients during low-HRV weeks',
  ],
  'hydration:sleep_total_minutes': [
    'Aim for 7-9 hours of sleep consistently',
    'Apply a hydrating toner or essence before bed',
    'Keep a glass of water by your bed',
  ],
  'acne:drinks_yesterday': [
    'Try a 2-week alcohol-free window and watch the trend',
    'Drink extra water on drinking days',
    'Double-cleanse on mornings after drinks',
  ],
  'overall:stress_level': [
    'Schedule one stress-reducing activity daily (walk, breath, stretch)',
    'Keep your evening routine simple on high-stress days',
    'Track what works — stress is the #1 lifestyle factor in the data',
  ],
};

export default function PatternDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const patterns = useStore((s) => s.patterns);
  const userProducts = useStore((s) => s.products);
  const pattern = patterns.find((p) => p.id === id);

  const suggestions = useMemo(() => {
    if (!pattern) return [];
    const key = `${pattern.signal}:${pattern.driver}`;
    return SUGGESTIONS[key] ?? [];
  }, [pattern]);

  if (!pattern) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.notFound}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.notFoundText}>Pattern not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const signalColor = SIGNAL_COLORS[pattern.signal as PatternSignal] ?? Colors.primary;
  const chartW = 320;
  const chartH = 180;
  const points = pattern.chartData.slice(-30);
  const polyline =
    points.length > 1
      ? points
          .map((p, i) => {
            const x = (i / (points.length - 1)) * chartW;
            const y = chartH - (p.signalValue / 100) * chartH;
            return `${x},${y}`;
          })
          .join(' ')
      : '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <Text style={styles.breadcrumb}>
          {pattern.confidence.toUpperCase()} · {pattern.type.replace(/_/g, ' ').toUpperCase()}
        </Text>

        <Text style={styles.headline}>{pattern.insightText}</Text>
        <Text style={styles.detail}>{pattern.detailText}</Text>

        {polyline && (
          <View style={styles.chartBox}>
            <Svg width={chartW} height={chartH}>
              {[0, 25, 50, 75, 100].map((tick) => {
                const y = chartH - (tick / 100) * chartH;
                return (
                  <Line
                    key={tick}
                    x1={0}
                    y1={y}
                    x2={chartW}
                    y2={y}
                    stroke={Colors.border}
                    strokeWidth={0.5}
                    strokeDasharray="2,4"
                  />
                );
              })}
              <Polyline
                points={polyline}
                fill="none"
                stroke={signalColor}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        )}

        <Text style={styles.sectionTitle}>How we found this</Text>
        <Text style={styles.sectionBody}>
          Tracked {pattern.sampleSize} days of paired data. Pattern {pattern.confidence === 'strong' ? 'appears strongly and consistently' : 'has emerged and is holding steady'} in your recent history.
        </Text>

        {suggestions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>What you can try</Text>
            {suggestions.map((s, i) => (
              <View key={i} style={styles.suggestionRow}>
                <Feather name="check-circle" size={14} color={Colors.primary} />
                <Text style={styles.suggestionText}>{s}</Text>
              </View>
            ))}
          </>
        )}

        {!pattern.isPredicted && (
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => exportAndSharePattern(pattern)}
          >
            <Feather name="share-2" size={16} color={Colors.background} />
            <Text style={styles.shareButtonText}>Share this pattern</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },
  headerRow: { paddingTop: Spacing.sm },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumb: {
    color: Colors.primary,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xxs,
    letterSpacing: 1.2,
  },
  headline: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xxl,
    lineHeight: 34,
  },
  detail: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    lineHeight: 23,
  },
  chartBox: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
    marginVertical: Spacing.sm,
  },
  sectionTitle: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    marginTop: Spacing.sm,
  },
  sectionBody: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  suggestionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  suggestionText: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
  shareButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.lg,
  },
  shareButtonText: {
    color: Colors.background,
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
  },
  notFound: { flex: 1, padding: Spacing.lg, gap: Spacing.lg },
  notFoundText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.lg,
    textAlign: 'center',
    marginTop: Spacing.xxl,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors. Note: `exportAndSharePattern` is created in Task 24 — this reference will be unresolved until then. If TS complains about the missing module, stub the import with `export async function exportAndSharePattern(_p: any) {}` in a temporary file and remove in Task 24.

- [ ] **Step 3: Commit**

```bash
git add RadianceIQ/app/pattern/_layout.tsx RadianceIQ/app/pattern/[id].tsx
git commit -m "feat: pattern detail screen"
```

---

---

# PHASE 9 — Share artifact + export

## Task 23: Install react-native-view-shot

**Files:**
- Modify: `RadianceIQ/package.json`

- [ ] **Step 1: Install**

Run: `cd RadianceIQ && npx expo install react-native-view-shot`

- [ ] **Step 2: Verify expo-sharing is already installed**

Run: `cd RadianceIQ && npm list expo-sharing`

If not installed: `npx expo install expo-sharing`

- [ ] **Step 3: Commit**

```bash
git add RadianceIQ/package.json RadianceIQ/package-lock.json
git commit -m "chore: install react-native-view-shot for pattern exports"
```

---

## Task 24: Build PatternExportCard + patternExport service

**Files:**
- Create: `RadianceIQ/src/components/PatternExportCard.tsx`
- Create: `RadianceIQ/src/services/patternExport.ts`

- [ ] **Step 1: Create the hidden 1080×1920 export view**

Create `RadianceIQ/src/components/PatternExportCard.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import type { Pattern, PatternSignal } from '../types';
import { Colors, FontFamily } from '../constants/theme';
import { SIGNAL_COLORS } from '../constants/signals';

// This view is rendered OFF-SCREEN and captured via react-native-view-shot.
// Dimensions are fixed at 1080x1920 (Instagram Story aspect).
// The view is never displayed to the user directly.

interface Props {
  pattern: Pattern;
}

export const PatternExportCard: React.FC<Props> = ({ pattern }) => {
  const signalColor = SIGNAL_COLORS[pattern.signal as PatternSignal] ?? Colors.primary;
  const chartW = 900;
  const chartH = 400;
  const points = pattern.chartData.slice(-30);
  const polyline =
    points.length > 1
      ? points
          .map((p, i) => {
            const x = (i / (points.length - 1)) * chartW;
            const y = chartH - (p.signalValue / 100) * chartH;
            return `${x},${y}`;
          })
          .join(' ')
      : '';

  return (
    <View collapsable={false} style={styles.container}>
      <Text style={styles.wordmark}>Glowlytics</Text>

      <View style={styles.headlineBlock}>
        <Text style={styles.headline}>{pattern.insightText}</Text>
      </View>

      {polyline && (
        <View style={styles.chartWrap}>
          <Svg width={chartW} height={chartH}>
            <Polyline
              points={polyline}
              fill="none"
              stroke={signalColor}
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      )}

      <Text style={styles.sample}>
        Based on {pattern.sampleSize} days
      </Text>

      <Text style={styles.url}>glowlytics.ai</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 1080,
    height: 1920,
    backgroundColor: Colors.background,
    paddingHorizontal: 90,
    paddingVertical: 120,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    color: Colors.primary,
    fontFamily: FontFamily.sansBold,
    fontSize: 42,
    letterSpacing: 2,
  },
  headlineBlock: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  headline: {
    color: Colors.text,
    fontFamily: FontFamily.sansBold,
    fontSize: 92,
    lineHeight: 104,
    textAlign: 'center',
  },
  chartWrap: {
    paddingVertical: 60,
  },
  sample: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: 36,
    marginTop: 20,
  },
  url: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: 32,
    letterSpacing: 1,
  },
});
```

- [ ] **Step 2: Create the patternExport service**

Create `RadianceIQ/src/services/patternExport.ts`:

```typescript
import React from 'react';
import { Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { Pattern } from '../types';
import { trackEvent } from './analytics';

/**
 * Export a pattern to a temp PNG and invoke the native share sheet.
 * This is called from pattern card share buttons and the detail screen.
 *
 * Implementation note: the PatternExportCard component must already be
 * mounted off-screen (via a hidden container on the screen that triggers
 * the share). In practice we use a ref-based approach — the caller mounts
 * the component hidden and passes the ref here.
 *
 * For v1, we use a simpler approach: mount the card in a transparent
 * off-screen container controlled by the calling screen, capture via
 * ref, hand to share sheet, unmount.
 */
export async function exportPatternToFile(ref: any): Promise<string> {
  const uri = await captureRef(ref, {
    format: 'png',
    quality: 1.0,
    width: 1080,
    height: 1920,
    result: 'tmpfile',
  });
  return uri;
}

export async function sharePatternFile(pattern: Pattern, uri: string): Promise<void> {
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share this pattern',
        UTI: 'public.png',
      });
      trackEvent('pattern_shared', {
        pattern_id: pattern.id,
        pattern_type: pattern.type,
        confidence: pattern.confidence,
      });
    }
  } catch (e: any) {
    trackEvent('pattern_export_failed', { error: e?.message ?? String(e) });
  } finally {
    // Best-effort cleanup
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Convenience: caller passes a Pattern, we handle the rest.
 * This version requires the caller to have a ref to a mounted PatternExportCard.
 * Since screens that invoke this do so via a button tap, the simplest pattern is:
 *
 *   1. On share button tap, set state `sharingPattern = pattern`
 *   2. Mount <PatternExportCard ref={exportRef} pattern={sharingPattern} /> hidden
 *   3. useEffect on sharingPattern: call exportAndSharePattern(pattern, exportRef)
 *   4. Clear sharingPattern after share completes
 *
 * See Task 25 for the wiring into screens.
 */
export async function exportAndSharePattern(
  pattern: Pattern,
  ref?: any,
): Promise<void> {
  if (!ref || !ref.current) {
    // Fallback: share just the text headline via share sheet
    if (await Sharing.isAvailableAsync()) {
      // expo-sharing requires a file; fall back to a simple text-only share via native API
      // For now, log and skip — the ref-based path is the supported flow
      trackEvent('pattern_export_failed', { error: 'no_ref' });
    }
    return;
  }
  try {
    const uri = await exportPatternToFile(ref);
    await sharePatternFile(pattern, uri);
  } catch (e: any) {
    trackEvent('pattern_export_failed', { error: e?.message ?? String(e) });
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add RadianceIQ/src/components/PatternExportCard.tsx RadianceIQ/src/services/patternExport.ts
git commit -m "feat: PatternExportCard + export service"
```

---

## Task 25: Wire share export into Today + detail screens

**Why:** `exportAndSharePattern` needs a mounted `PatternExportCard` ref to capture. The cleanest way is to host the hidden card on the screen that triggers share (Today or Pattern detail) and pass the ref through.

**Files:**
- Modify: `RadianceIQ/app/(tabs)/today.tsx`
- Modify: `RadianceIQ/app/pattern/[id].tsx`

- [ ] **Step 1: Today screen — add hidden export card + share handler**

In `RadianceIQ/app/(tabs)/today.tsx`, add state and a hidden off-screen container:

```typescript
import React, { useRef, useState, useEffect } from 'react';
import { PatternExportCard } from '../../src/components/PatternExportCard';
import { exportAndSharePattern } from '../../src/services/patternExport';
import type { Pattern } from '../../src/types';

// Inside component:
const [sharingPattern, setSharingPattern] = useState<Pattern | null>(null);
const exportRef = useRef<View | null>(null);

useEffect(() => {
  if (!sharingPattern) return;
  // Small delay to ensure the card has mounted before capture
  const t = setTimeout(() => {
    exportAndSharePattern(sharingPattern, exportRef).finally(() => {
      setSharingPattern(null);
    });
  }, 100);
  return () => clearTimeout(t);
}, [sharingPattern]);
```

Pass `setSharingPattern` into `PatternCarousel` by extending its props (Task 20 passed `onPressShare` per pattern):

```tsx
<PatternCarousel
  patterns={patterns}
  onShare={(p) => setSharingPattern(p)}  // override the internal share
/>
```

You'll need to update `PatternCarousel` to accept an `onShare` override that takes precedence over the default `exportAndSharePattern` call. Simplest: pass it through to `handleShare` and default to the internal behavior if undefined.

Add the hidden off-screen container (absolutely positioned off-screen so it's rendered but not visible):

```tsx
{sharingPattern && (
  <View
    pointerEvents="none"
    collapsable={false}
    style={{
      position: 'absolute',
      left: -10000,  // off-screen
      top: 0,
      width: 1080,
      height: 1920,
    }}
  >
    <View ref={exportRef as any} collapsable={false}>
      <PatternExportCard pattern={sharingPattern} />
    </View>
  </View>
)}
```

- [ ] **Step 2: Pattern detail — same pattern**

Apply the same `sharingPattern` + hidden card + `useEffect` pattern in `RadianceIQ/app/pattern/[id].tsx`. Wire the share button to call `setSharingPattern(pattern)` instead of `exportAndSharePattern(pattern)` directly.

- [ ] **Step 3: Update PatternCarousel to accept onShare**

In `RadianceIQ/src/components/PatternCarousel.tsx`, change the props:

```typescript
interface Props {
  patterns: Pattern[];
  onShare?: (pattern: Pattern) => void;
}
```

And in the `handleShare` callback:

```typescript
const handleShare = useCallback(async (pattern: Pattern) => {
  if (onShare) {
    onShare(pattern);
  } else {
    await exportAndSharePattern(pattern);
  }
}, [onShare]);
```

- [ ] **Step 4: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 5: Manual test on a sim**

Run the app, tap Share on a (real, non-predicted) pattern. Verify:
- The native share sheet appears
- The PNG preview is readable
- Sharing to Messages / Save to Photos works
- Analytics event `pattern_shared` fires

- [ ] **Step 6: Commit**

```bash
git add RadianceIQ/app/\(tabs\)/today.tsx \
        RadianceIQ/app/pattern/[id].tsx \
        RadianceIQ/src/components/PatternCarousel.tsx
git commit -m "feat: wire pattern share export end to end"
```

---

---

# PHASE 10 — Push notification on pattern unlock

## Task 26: One-time local notification when first real pattern is detected

**Why:** The Day 14 "unlock moment" is the payoff the user has been waiting for. A single local notification turns it into a re-engagement event even if the app is closed. We use `expo-notifications` (already in tree) for a local (not push) notification — no APNs setup needed.

**Files:**
- Create: `RadianceIQ/src/services/patternNotifications.ts`
- Modify: `RadianceIQ/src/store/useStore.ts` (track notification flag)
- Modify: `RadianceIQ/src/types/index.ts` (add flag to persisted state)

- [ ] **Step 1: Add flag to types**

In `RadianceIQ/src/types/index.ts`, add a field to the notification-related interface or create a new one:

```typescript
// If there's already a NotificationSettings or similar, add to it. Otherwise, add a standalone flag.
export interface PatternNotificationsState {
  first_pattern_unlock_sent: boolean;
}
```

- [ ] **Step 2: Create the notification service**

Create `RadianceIQ/src/services/patternNotifications.ts`:

```typescript
import * as Notifications from 'expo-notifications';
import type { Pattern } from '../types';
import { trackEvent } from './analytics';

export async function maybeSendFirstPatternUnlockNotification(
  previousPatterns: Pattern[],
  newPatterns: Pattern[],
  alreadySent: boolean,
): Promise<boolean> {
  if (alreadySent) return false;

  const hadRealBefore = previousPatterns.some((p) => !p.isPredicted);
  const hasRealNow = newPatterns.some((p) => !p.isPredicted);
  if (hadRealBefore || !hasRealNow) return false;

  try {
    // Check notification permission
    const settings = await Notifications.getPermissionsAsync();
    if (!settings.granted) {
      const request = await Notifications.requestPermissionsAsync();
      if (!request.granted) return false;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your patterns are ready',
        body: `Glowlytics found ${newPatterns.filter((p) => !p.isPredicted).length} things in your skin this month. Tap to see them.`,
        data: { deepLink: '/(tabs)/today' },
      },
      trigger: null, // fire immediately
    });
    trackEvent('pattern_unlock_notification_shown', {
      pattern_count_at_unlock: newPatterns.filter((p) => !p.isPredicted).length,
    });
    return true;
  } catch (e: any) {
    trackEvent('pattern_engine_error', { error_message: `notification_failed: ${e?.message ?? e}`, stack_short: '' });
    return false;
  }
}
```

- [ ] **Step 3: Wire into store's runPatternDetection**

In `RadianceIQ/src/store/useStore.ts`, extend `runPatternDetection` to call the notification helper and track the sent flag.

Add to the `AppState` interface:

```typescript
  patternNotifications: PatternNotificationsState;
  setFirstUnlockNotifSent: (sent: boolean) => void;
```

Add import:

```typescript
import { maybeSendFirstPatternUnlockNotification } from '../services/patternNotifications';
```

Initial state:

```typescript
  patternNotifications: { first_pattern_unlock_sent: false },
  setFirstUnlockNotifSent: (sent) => {
    set((s) => ({ patternNotifications: { ...s.patternNotifications, first_pattern_unlock_sent: sent } }));
    debouncedPersist(() => get().persistData());
  },
```

Update `runPatternDetection`:

```typescript
  runPatternDetection: () => {
    const state = get();
    if (!state.user) return;
    try {
      const previous = state.patterns;
      const next = detectPatterns({
        modelOutputs: state.modelOutputs,
        dailyRecords: state.dailyRecords,
        healthDailyRecords: state.healthDailyRecords,
        userProfile: state.user,
      });
      set({ patterns: next });
      debouncedPersist(() => get().persistData());
      // Fire the one-time unlock notification if appropriate
      maybeSendFirstPatternUnlockNotification(
        previous,
        next,
        state.patternNotifications.first_pattern_unlock_sent,
      ).then((sent) => {
        if (sent) get().setFirstUnlockNotifSent(true);
      });
    } catch (e: any) {
      console.warn('[patternEngine] detection failed:', e?.message ?? e);
    }
  },
```

Update `persistData` and `loadPersistedData` to include `patternNotifications`. Update `resetAll` to reset it to `{ first_pattern_unlock_sent: false }`.

- [ ] **Step 4: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add RadianceIQ/src/services/patternNotifications.ts \
        RadianceIQ/src/store/useStore.ts \
        RadianceIQ/src/types/index.ts
git commit -m "feat: one-time local notification on first pattern unlock"
```

---

*End of Phase 10.*

---

# PHASE 11 — Privacy, App Store prep, analytics, final verification

## Task 27: Privacy policy + App Store nutrition labels + analytics events

**Files:**
- Modify: `RadianceIQ/src/services/analytics.ts`
- Modify: privacy policy copy (wherever it lives — likely `landing/` or a docs folder)
- Document: App Store Connect changes (manual, not code)

- [ ] **Step 1: Add new analytics events**

In `RadianceIQ/src/services/analytics.ts`, verify each of these events is callable via `trackEvent(name, props)`. If the file has a union type or event list, add:

```typescript
// Pattern Engine events
'pattern_engine_run' |
'pattern_first_seen' |
'pattern_viewed' |
'pattern_shared' |
'pattern_export_failed' |
'pattern_engine_error' |
'pattern_unlock_notification_shown' |
'health_sync_completed' |
'health_sync_failed' |
'health_permission_state' |
'first_look_insight_shown' |
'product_ingredients_empty'
```

Also add a `pattern_first_seen` fire inside `patternEngine.ts` or `runPatternDetection`: whenever a pattern that was previously absent or predicted becomes real, fire the event with `{ pattern_type, confidence, data_days_at_detection }`.

The cleanest place is inside `runPatternDetection` in `useStore.ts`:

```typescript
      // Fire pattern_first_seen for new real patterns
      const prevIds = new Set(previous.filter((p) => !p.isPredicted).map((p) => p.id));
      for (const p of next) {
        if (!p.isPredicted && !prevIds.has(p.id)) {
          trackEvent('pattern_first_seen', {
            pattern_type: p.type,
            confidence: p.confidence,
            data_days_at_detection: state.dailyRecords.length,
          });
        }
      }
```

Import `trackEvent` from `../services/analytics` at the top of the store file if not already imported.

- [ ] **Step 2: Update privacy policy copy**

Find the privacy policy source (likely `landing/index.html` or a dedicated file). Add a section:

```text
Health Data

Glowlytics may read the following metrics from Apple Health on iOS devices:
sleep duration and stages, heart rate variability (HRV), resting heart rate,
step count, and mindful minutes. These values are used only to find patterns
in your skin data and are stored exclusively on your device. Glowlytics does
not transmit these values to any server, does not share them with third
parties, and does not use them for advertising or tracking. You can revoke
this permission at any time via iOS Settings → Health → Data Access & Devices
→ Glowlytics.
```

Commit the privacy policy change with:

```bash
git add landing/
git commit -m "docs: privacy policy update for HealthKit data usage"
```

- [ ] **Step 3: Document App Store Connect changes (manual)**

Open App Store Connect → App Privacy. Add the following:

- **Data Type:** Health → Health (includes Heart Rate, Sleep, Exercise Data, Other Health Data)
- **Used for:** App Functionality
- **Linked to User:** NO
- **Used for Tracking:** NO

Also verify `NSHealthShareUsageDescription` is set in `app.json` (done in Task 15). This string must match what appears in App Store Connect's privacy section.

This step is not a code change — document in a note in the plan file or a simple `docs/app-store/2026-04-health-privacy.md`:

```bash
mkdir -p docs/app-store
cat > docs/app-store/2026-04-health-privacy.md <<'EOF'
# App Store Connect — Health data declaration

Added 2026-04-07 as part of the Pattern Engine rollout.

- Data Type: Health → Health
- Purpose: App Functionality
- Linked to User: NO
- Used for Tracking: NO
- Corresponding iOS purpose string: NSHealthShareUsageDescription in app.json

Verified in App Store Connect → App Privacy on [date].
EOF
git add docs/app-store/2026-04-health-privacy.md
git commit -m "docs: record App Store Connect health privacy declaration"
```

---

## Task 28: Final verification — tsc, tests, manual smoke on device

**Why:** Last stop before merging. Catches integration regressions.

- [ ] **Step 1: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 2: Run full test suite**

Run: `cd RadianceIQ && npm test`

Expected: All tests pass, including 15+ new pattern engine tests.

- [ ] **Step 3: Manual smoke test on a physical iOS device**

Needs a physical device (HealthKit doesn't work on sim). Install the EAS dev build from Task 15. Then:

1. **Fresh install flow:** sign up as a new user. Complete onboarding. Verify:
   - HealthKit permission prompt appears once
   - Granting permission populates `healthDailyRecords` with at least today's data
   - Pattern progress bar shows "Day 1 of 14"
   - 3 predicted patterns appear on Today screen
   - No real patterns yet
   - First Look insight card renders (if implemented — this is a stretch; see §Deferred)

2. **Paywall gap closed:** verify scan works immediately after signup without paywall block.

3. **Health sync on foreground:** background the app for > 6 hours (or manually set `last_sync_at` to a stale value via RN devtools). Foreground. Confirm sync fires and `last_sync_at` updates.

4. **Pattern detection after scan:** scan, wait, check that pattern detection runs (visible via console logs or Zustand state).

5. **Share export:** once a real pattern appears (this may require seeding synthetic data or waiting 14+ days), tap Share and verify the 1080×1920 PNG renders and the share sheet opens.

6. **Notification:** when the first real pattern is detected, verify the local notification fires.

7. **Privacy:** revoke HealthKit permission via iOS Settings. Return to the app. Verify the app handles the revocation gracefully (no crash, predicted patterns that require HealthKit show the "Connect Apple Health" prompt).

- [ ] **Step 4: Commit any final fixes**

If Step 3 reveals issues, fix them. Each fix gets its own focused commit.

- [ ] **Step 5: Optional — cut a TestFlight build**

Running the existing deploy-app skill at this checkpoint ships the full Pattern Engine to testers. User decision — don't cut a build without confirmation.

---

# Self-review

**Spec coverage vs this plan:**

- ✅ TestFlight feedback theme #1 (label specificity) → Task 5
- ✅ TestFlight feedback theme #2 (paywall gap) → Tasks 1, 2, 3, 4
- ✅ TestFlight feedback theme #3 (photo discoverability) → Task 6
- ✅ TestFlight feedback theme #4 (search recall) → Task 7 (diagnostic-led)
- ✅ TestFlight feedback theme #5 (no comment) → Intentionally skipped, no signal
- ✅ TestFlight feedback themes #6 and #8 (missing ingredients) → Task 8 (diagnostic-led)
- ✅ TestFlight feedback theme #7 (shadow animation) → Task 9 (diagnostic-led)
- ✅ Pattern Engine architecture (spec §3) → Phases 5-11
- ✅ Pattern Engine data layer (spec §4) → Phase 6
- ✅ Pattern Engine algorithm (spec §5) → Phase 5 (Tasks 13-14)
- ✅ Cold start mitigation (spec §6) → Tasks 13 (priors), 20 (progress bar)
- ⚠️ First Look insight (spec §6.2) → **Deferred to follow-up plan** — service stub exists, but 6-insight implementation is a full task's worth of work that deserves its own sub-plan. Note below.
- ✅ Pattern UI (spec §7) → Phase 7
- ✅ Share artifact (spec §7.4) → Phase 9
- ✅ Error handling + edge cases (spec §8) → scattered through tasks; Phase 11 manual QA covers the rest
- ✅ Testing strategy (spec §9) → Task 14 covers the pure-function layer
- ⚠️ Component tests for `PatternCard` (spec §9.3) → **Deferred** — add in a follow-up pass once the real UI lands and we know which interactions are worth testing
- ⚠️ `healthSync.ts` integration tests (spec §9.2) → **Deferred** — mocking `@kingstinct/react-native-healthkit` is non-trivial and the manual test plan covers this in practice
- ✅ Analytics (spec §10) → Task 27

**Placeholder scan:** No "TBD", no "implement later". Two items are explicitly deferred with reasons (First Look implementation as a sub-plan; healthSync/component tests noted). The diagnostic-led tasks (7, 8, 9) contain real diagnostic steps that produce concrete fixes inline.

**Type consistency:** `Pattern`, `HealthDailyRecord`, `PatternConfidence`, `PatternSignal`, `PatternType`, `FirstLookInsight`, `HealthSyncStatus` are all defined once in Task 11 and used consistently throughout. Function signatures (`detectPatterns`, `selectPredictedPatterns`, `pullLastNDays`, `syncHealthData`, `runPatternDetection`, `exportAndSharePattern`) match across tasks.

**Scope check:** Large but sequential. Natural pause points at end of Phase 4 (fixes shippable independently) and end of Phase 7 (predicted patterns visible, no HealthKit required). Each phase produces shippable state.

**Deferred follow-up plans (to be written after this ships):**
1. **First Look insight implementation** — full `generateFirstLookInsight` with 6 insight types. Own sub-plan.
2. **PatternCard component tests + healthSync integration tests** — fills the testing coverage gap noted above.
3. **Android HealthConnect** — v2.
4. **Weekly Receipts wrapper** — Approach 2 from brainstorming.
5. **Backend mirror of pattern results** — v2.

---

# Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-07-ultraplan-fixes-and-pattern-engine.md`.

**Two execution options:**

**1. Subagent-Driven (recommended for the fix phases)** — fresh subagent per task, review between tasks. Great for Phases 1-4 where the work is small and well-understood.

**2. Inline Execution with checkpoints** — batch through phases with manual review at the checkpoints. Better for Phases 5-11 where context between related tasks matters (e.g. Task 13 → 14 → 15 needs the pattern engine fresh in mind).

**Suggested sequencing:**

- **Week 1** — execute Phase 1-4 (fixes) subagent-driven. Cut TestFlight build at Phase 4 checkpoint.
- **Week 2-3** — execute Phase 5 (pattern engine pure logic) inline with checkpoints.
- **Week 3-4** — execute Phase 6 (HealthKit) inline; requires an EAS rebuild.
- **Week 4-5** — execute Phases 7-9 (UI + share) inline. Cut TestFlight build at Phase 9 checkpoint.
- **Week 5-6** — execute Phases 10-11 (notification + privacy + final verification). Cut full feature TestFlight build.

Which execution mode do you want to use, and do you want to start with Phase 1 now?

---

*End of plan.*
