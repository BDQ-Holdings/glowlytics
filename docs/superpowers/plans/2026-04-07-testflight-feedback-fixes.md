# TestFlight Feedback Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 distinct issues surfaced by TestFlight testers across 8 feedback items between Mar 17 and Apr 3 2026, restoring activation funnel and product-data trust.

**Architecture:** Targeted fixes scoped to specific files. The most critical fix (paywall gap) hardens trial activation in 3 layers: store-level auto-start, defensive fallback in `gateWithPaywall`, and a one-time migration for upgraded users. Product-detail credibility fix surfaces the user-entered name verbatim while keeping canonical category as a secondary tag. Discoverability fix promotes the existing photo-identification path. Search and missing-ingredient fixes are diagnostic-led with a follow-up implementation step. Polish fix tunes a single animation easing.

**Tech Stack:** React Native, Expo SDK 54, TypeScript strict, Zustand, RevenueCat v9, react-native-reanimated, Express (backend).

---

## Source Feedback (TestFlight, Mar 17 → Apr 3 2026)

| # | Tester | Build | Comment | Theme |
|---|--------|-------|---------|-------|
| 1 | Mustafa | 1.1.2 (78) | "it says this is a retinol i mean it is but it's specifically tretinoin cream 0.025%" | Label specificity |
| 2 | Anonymous | 1.1.2 (76) | "subscription paywall blocking scanning ability" | **Paywall blocks activation (CRITICAL)** |
| 3 | Anonymous | 1.1.2 (51) | "i wish i could take a picture of the product instead of the barcode, this product doesn't have a barcode" | Photo-capture discoverability |
| 4 | Anonymous | 1.1.2 (51) | "can't find the product" | Search recall |
| 5 | Anonymous | 1.1.2 (51) | (screenshot only, no comment) | Unknown — defer |
| 6 | Mustafa | 1.1.0 (5) | "some products ingredients aren't showing up" | Missing ingredients |
| 7 | Mustafa | 1.0.0 (25) | "can see the shadow come on too obviously" | Animation polish |
| 8 | Mustafa | 1.0.0 (18) | "ingredients not present" | Missing ingredients (recurring) |

## Diagnostic Findings (already gathered, do not re-investigate)

- **Theme #2 (paywall):** `app/scan/camera.tsx:59-69` runs `gateWithPaywall()` on mount and calls `router.back()` if `canPerformScan()` returns false. `canPerformScan()` (`src/store/useStore.ts:468`) delegates to `canScanPure(subscription)` which returns `is_active || isTrialActive(subscription)`. Trial only starts via `handleSkip()` in `app/onboarding/paywall.tsx:69`. **Any user who reaches the camera without first running through the onboarding paywall screen will be locked out** — this includes upgraded users from pre-paywall builds, users whose onboarding state was restored mid-flow, and users whose 7-day trial expired without paying. Same gate exists in `app/(tabs)/_layout.tsx:17-20`, `app/home.tsx:88`, `app/skin-metrics.tsx:78`, `app/report/generate.tsx:44`.
- **Theme #1 (label specificity):** `app/product/[id].tsx:254-256` displays `row.profile.canonicalName` (canonical) instead of `row.raw` (what the user entered). When the user has a product whose actual ingredient is "tretinoin 0.025%" but the source returned "Retinol", we lose the specificity. `matchIngredient()` in `src/services/ingredientDB.ts:674-697` does exact-then-substring matching, so the upstream lookup is the cause of the wrong name — but the display fix is to always show the user-facing name verbatim.
- **Theme #3 (photo discoverability):** Photo identification *exists* — `src/components/AddProductSheet.tsx:184-223` already implements `handlePhotoCapture` calling `identifyProductPhoto()`. There's a "Take a photo" option in the menu (`AddProductSheet.tsx:322-334`) and a fallback link inside barcode mode (`AddProductSheet.tsx:411-417`). Build 51 may not have shipped this; either way, the fix is to make the photo path the *primary* recommendation and re-order the menu so users see it before the barcode option.
- **Theme #4 (search recall):** `searchProductsMultiSource()` is called from `AddProductSheet.tsx:140`. Source not yet read — diagnostic step required.
- **Themes #6/#8 (missing ingredients):** Recurring across multiple builds (5, 18). Could be barcode lookup returning empty array, OFF source missing data, or a frontend filter dropping them. Diagnostic step required.
- **Theme #7 (shadow animation):** No `shadow` keyword in `app/scan/results.tsx`. The "shadow" the tester refers to is probably the `LinearGradient` backdrop on `StoryPage` (`results.tsx:52-57`) or the score-glow `Animated.View` rings (`results.tsx:127-171`) — both fade in. Build 25 was Mar 18, very old; possibly already addressed. Diagnostic step required.

---

## File Structure

| Path | Action | Responsibility |
|------|--------|----------------|
| `RadianceIQ/src/store/useStore.ts` | Modify | Auto-start trial in `createUser`; add migration in `loadPersistedData` |
| `RadianceIQ/src/services/subscription.ts` | Modify | Add `ensureTrialStarted()` defensive helper; have `gateWithPaywall` call it before checking |
| `RadianceIQ/src/store/__tests__/useStore.test.ts` | Modify | Add tests for auto-start + migration |
| `RadianceIQ/src/services/__tests__/subscription.test.ts` | Modify | Add tests for `ensureTrialStarted` |
| `RadianceIQ/app/product/[id].tsx` | Modify | Show raw ingredient name + secondary canonical tag (lines 250-279) |
| `RadianceIQ/src/components/AddProductSheet.tsx` | Modify | Re-order menu, add "no barcode?" copy, promote photo path |
| `RadianceIQ/src/services/productLookup.ts` | Read + Modify | Diagnose search recall and missing-ingredient sources; tune ranking and ingredient fallback |
| `RadianceIQ/backend/curated-products.js` | Read | Sanity-check curated DB indexing for search recall |
| `RadianceIQ/app/scan/results.tsx` | Modify | Soften gradient or glow easing once identified |

---

## Task 1: Auto-start trial on user creation

**Why:** Closes the paywall gap at the source. Every new user gets a trial the moment they create their profile, regardless of which onboarding path they take. This is the most defensive single change.

**Files:**
- Modify: `RadianceIQ/src/store/useStore.ts` — `createUser` action (lines 186-205)
- Modify: `RadianceIQ/src/store/__tests__/useStore.test.ts`

- [ ] **Step 1: Read existing test file to learn the test patterns**

Run: `Read RadianceIQ/src/store/__tests__/useStore.test.ts` and look at how `createUser` and `canPerformScan` are tested already (existing tests at lines 284-309).

- [ ] **Step 2: Write the failing test**

Append to `RadianceIQ/src/store/__tests__/useStore.test.ts` inside the appropriate `describe` block:

```typescript
  describe('createUser auto-trial', () => {
    beforeEach(() => {
      useStore.getState().resetAll();
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
      // Simulate a re-run (e.g. profile re-creation flow)
      useStore.getState().createUser({ age_range: '25-34' });
      expect(useStore.getState().subscription.trial_start_date).toBe(firstStart);
    });
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd RadianceIQ && npm test -- useStore.test.ts -t "createUser auto-trial"`

Expected: 3 tests fail because `trial_start_date` is `null` after `createUser`.

- [ ] **Step 4: Modify createUser to call startTrial after setting the user**

Open `RadianceIQ/src/store/useStore.ts`. In `createUser` (lines 186-205), after `set({ user })` and before `debouncedPersist`, add a call to `get().startTrial()`. The action should now read:

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

- [ ] **Step 5: Run test to verify it passes**

Run: `cd RadianceIQ && npm test -- useStore.test.ts -t "createUser auto-trial"`

Expected: All 3 tests pass.

- [ ] **Step 6: Run full store test suite to ensure no regression**

Run: `cd RadianceIQ && npm test -- useStore.test.ts`

Expected: All tests pass. If existing `canPerformScan returns false for free user without trial` (line 295) breaks, that's expected — see Task 2.

- [ ] **Step 7: Commit**

```bash
git add RadianceIQ/src/store/useStore.ts RadianceIQ/src/store/__tests__/useStore.test.ts
git commit -m "fix: auto-start trial on user creation to close paywall gap"
```

---

## Task 2: Fix existing test broken by auto-trial change

**Why:** The test `canPerformScan returns false for free user without trial` (line 295) was written assuming a free user has no trial. With Task 1, a user always has a trial after creation, so this test needs to reflect the new expected state — the only "no trial" case is a fresh `subscription` object before any user creation, or after an explicit reset/expiry.

**Files:**
- Modify: `RadianceIQ/src/store/__tests__/useStore.test.ts:295`

- [ ] **Step 1: Read the existing test**

Look at lines 280-310 of `RadianceIQ/src/store/__tests__/useStore.test.ts` to confirm what state setup it does.

- [ ] **Step 2: Update the test to reflect the new contract**

Replace the test body with:

```typescript
    it('canPerformScan returns false when subscription has no trial and no active entitlement', () => {
      // Force a "no trial" state (simulates trial expired)
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

- [ ] **Step 3: Run the test to verify it passes**

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

**Why:** Task 1 only helps NEW users. Existing users already have a `user` row with `trial_start_date: null` — they need a one-time backfill the next time they open the app. This runs in `loadPersistedData` so it fires once on app start.

**Files:**
- Modify: `RadianceIQ/src/store/useStore.ts` — `loadPersistedData` (lines 499-542)
- Modify: `RadianceIQ/src/store/__tests__/useStore.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `useStore.test.ts`:

```typescript
  describe('loadPersistedData trial backfill', () => {
    beforeEach(async () => {
      await useStore.getState().resetAll();
    });

    it('backfills trial for an upgraded user with no trial dates', async () => {
      // Simulate persisted state from a pre-paywall build: user exists, no trial dates
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
          trial_start_date: null, // never used trial — went straight to paid
          trial_end_date: null,
        },
      }));
      await useStore.getState().loadPersistedData();
      const sub = useStore.getState().subscription;
      expect(sub.trial_start_date).toBeNull();
      expect(sub.is_active).toBe(true);
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
      const sub = useStore.getState().subscription;
      expect(sub.trial_end_date).toBe('2020-01-08T00:00:00.000Z');
    });
  });
```

Make sure `import AsyncStorage from '@react-native-async-storage/async-storage';` is at the top of the test file (it likely already is).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd RadianceIQ && npm test -- useStore.test.ts -t "loadPersistedData trial backfill"`

Expected: First test fails (`trial_start_date` is still null after load).

- [ ] **Step 3: Add the backfill logic to loadPersistedData**

In `RadianceIQ/src/store/useStore.ts`, modify `loadPersistedData`. After the `set({...})` block (around line 534), add:

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

The `restoredSub` read uses `get()` after `set()` so the trial logic operates on the just-restored subscription state.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd RadianceIQ && npm test -- useStore.test.ts -t "loadPersistedData trial backfill"`

Expected: All 3 tests pass.

- [ ] **Step 5: Run the full store test suite**

Run: `cd RadianceIQ && npm test -- useStore.test.ts`

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add RadianceIQ/src/store/useStore.ts RadianceIQ/src/store/__tests__/useStore.test.ts
git commit -m "fix: backfill trial dates for upgraded users on app load"
```

---

## Task 4: Defensive trial-start in gateWithPaywall

**Why:** Belt and suspenders. Even if Tasks 1 and 3 cover 99% of users, a code path could still exist that mounts the camera before either trigger fires. Adding the check inside `gateWithPaywall` itself guarantees no user gets locked out.

**Files:**
- Modify: `RadianceIQ/src/services/subscription.ts` (lines 190-204)
- Modify: `RadianceIQ/src/services/__tests__/subscription.test.ts`

- [ ] **Step 1: Read the existing subscription test file**

Look at `RadianceIQ/src/services/__tests__/subscription.test.ts` to understand the existing patterns for `startTrial` (line 116) and how subscription tests mock state.

- [ ] **Step 2: Write the failing test**

Append to `subscription.test.ts`:

```typescript
  describe('gateWithPaywall trial fallback', () => {
    beforeEach(() => {
      // Reset store state — adapt this to whatever pattern the existing tests use
      const { useStore } = require('../../store/useStore');
      useStore.getState().resetAll();
      useStore.getState().createUser({ age_range: '25-34' });
      // Wipe the trial that createUser auto-grants, simulating a stuck legacy state
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

- [ ] **Step 3: Run test to verify it fails**

Run: `cd RadianceIQ && npm test -- subscription.test.ts -t "gateWithPaywall trial fallback"`

Expected: FAIL — `gateWithPaywall` currently returns false because trial is null.

- [ ] **Step 4: Modify gateWithPaywall to grant a trial when missing**

In `RadianceIQ/src/services/subscription.ts`, replace `gateWithPaywall` (lines 190-204) with:

```typescript
/**
 * Gate an action behind paywall. Presents paywall if needed, refreshes subscription,
 * returns true if the user can proceed (subscribed or trial active).
 *
 * Defensive: if the user has no entitlement AND no trial dates at all, auto-start the
 * trial before showing the paywall. This guarantees no path can lock a user out without
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

- [ ] **Step 5: Run test to verify it passes**

Run: `cd RadianceIQ && npm test -- subscription.test.ts -t "gateWithPaywall trial fallback"`

Expected: PASS.

- [ ] **Step 6: Run the full subscription test suite**

Run: `cd RadianceIQ && npm test -- subscription.test.ts`

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add RadianceIQ/src/services/subscription.ts RadianceIQ/src/services/__tests__/subscription.test.ts
git commit -m "fix: gateWithPaywall auto-grants trial as defense-in-depth"
```

---

## Task 5: Show user-entered ingredient name verbatim, demote canonical to secondary tag

**Why:** Tester #1 added a product they know is "tretinoin cream USP 0.025%" but our product detail screen says "Retinol" — that's because we replace `row.raw` with `row.profile.canonicalName` in display (line 254 of `app/product/[id].tsx`). Fix: always show the raw user-facing name as the primary label, and surface the canonical category as a small secondary chip beside it. This preserves clinical specificity while keeping our DB linkage for scoring.

**Files:**
- Modify: `RadianceIQ/app/product/[id].tsx` (lines 250-279, 502-512)

- [ ] **Step 1: Update the ingredient row JSX**

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

In the same file's `StyleSheet.create({...})` block, add these style entries (place them near `ingredientName` around line 502):

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

Add a manual test product on a sim or device with raw ingredient `"Tretinoin Cream USP 0.025%"`. Open its detail screen. Verify:
- Primary label reads "Tretinoin Cream USP 0.025%" (not "Tretinoin")
- Secondary tag shows "Tretinoin" (the canonical name)
- Dot color is highly_beneficial green (the canonical match still drives the rating)

- [ ] **Step 5: Commit**

```bash
git add RadianceIQ/app/product/[id].tsx
git commit -m "fix: show raw ingredient name verbatim, canonical as secondary tag"
```

---

## Task 6: Promote photo-based product capture in Add Product menu

**Why:** Photo identification is implemented (`AddProductSheet.tsx:184-223`) but listed *third* in the menu — after Search and Barcode. Tester #3 missed it entirely and thought it didn't exist. Fix: re-order so Photo is first, with copy that explicitly addresses the "no barcode" case.

**Files:**
- Modify: `RadianceIQ/src/components/AddProductSheet.tsx` (lines 295-346)

- [ ] **Step 1: Reorder the menu so Photo is first**

In `AddProductSheet.tsx`, replace the entire `mode === 'menu'` block (lines 295-346) with:

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

Open the Products tab on a sim, tap "Add Product." Verify:
- "Take a photo" is the **first** option
- Description reads "Snap the front of the product — works without a barcode"
- Order is: Photo → Barcode → Search → Manual

- [ ] **Step 4: Commit**

```bash
git add RadianceIQ/src/components/AddProductSheet.tsx
git commit -m "fix: promote photo capture as primary product-add path"
```

---

## Task 7: Diagnose product search recall

**Why:** Tester #4 said "can't find the product." We don't yet know which product, but the diagnostic can be done without the specific product by reading the search source code and checking for obvious gaps: short-query cutoff, source order, fuzzy matching, weighting.

**Files:**
- Read: `RadianceIQ/src/services/productLookup.ts`
- Read: `RadianceIQ/backend/curated-products.js` (already partly read — check the search/filter functions)

- [ ] **Step 1: Read the search implementation**

Run: `Read RadianceIQ/src/services/productLookup.ts` and study `searchProductsMultiSource`. Note:
- What sources it queries (curated DB? Open Beauty Facts? backend RAG?)
- Whether it does fuzzy matching or exact substring
- Whether it applies a minimum-query-length filter
- The order it queries sources and whether it short-circuits on first hit
- How it deduplicates results

Run: `Grep "search" RadianceIQ/backend/curated-products.js -n` to see if curated products has a search function.

- [ ] **Step 2: Document the diagnosis in this plan file**

Append to this plan file (`docs/superpowers/plans/2026-04-07-testflight-feedback-fixes.md`) under a new heading `## Task 7 Diagnosis`. Write 5-15 lines covering:
- Sources queried, in order
- Matching strategy (exact, substring, fuzzy?)
- Likely failure modes (e.g. "OFF only returns products with EAN, no fuzzy fallback for partial brand names")
- Concrete one-line fix (e.g. "lower min query length from 3 to 2", "add Levenshtein fallback when exact returns 0")

- [ ] **Step 3: Implement the fix identified in Step 2**

Apply the targeted fix. If the diagnosis reveals the fix is non-trivial (>20 lines, multi-source rework), STOP and create a new plan file `2026-04-07-product-search-recall-fix.md` with a dedicated task breakdown — do not bloat this plan with multi-day work.

- [ ] **Step 4: Add a test that exercises the fix**

If the fix is small enough to keep in this plan, write a unit test that calls `searchProductsMultiSource` with a query that previously returned 0 results and now returns ≥1. Place the test in `RadianceIQ/src/services/__tests__/productLookup.test.ts` (create file if missing).

- [ ] **Step 5: Run the test**

Run: `cd RadianceIQ && npm test -- productLookup.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add RadianceIQ/src/services/productLookup.ts RadianceIQ/src/services/__tests__/productLookup.test.ts docs/superpowers/plans/2026-04-07-testflight-feedback-fixes.md
git commit -m "fix: improve product search recall (see plan diagnosis)"
```

---

## Task 8: Diagnose missing-ingredients pipeline

**Why:** Recurring complaint across builds 5, 18, 51 ("ingredients not present", "some products ingredients aren't showing up"). Need to find which step is dropping data.

**Files:**
- Read: `RadianceIQ/src/services/productLookup.ts` (the `lookupBarcode` and `identifyProductPhoto` functions)
- Read: `RadianceIQ/backend/app.js` (the corresponding endpoints)
- Read: `RadianceIQ/src/components/AddProductSheet.tsx:154-182` (already read — confirms `result.ingredients` is what gets stored)

- [ ] **Step 1: Trace the ingredients path end to end**

Read `productLookup.ts` and identify how `result.ingredients` is populated for each source (barcode, photo, search). Then read the corresponding backend endpoints. Look for any of these red flags:
- `ingredients = data.ingredients || []` — silent fallback to empty array, no warning
- A call to OFF that requests only product name + brand and not the `ingredients_text` field
- A parsing step that splits on commas but the source returns a structured array
- A fallback to `categories` instead of `ingredients` when `ingredients` is empty

- [ ] **Step 2: Reproduce the bug locally**

On a sim or via a unit test, call `lookupBarcode('011822307246')` (PanOxyl Foaming Wash 10% — known to be in the curated DB). Confirm it returns ingredients. Then call it with a barcode that's NOT in the curated DB to test the OFF fallback. Note which ones return empty.

- [ ] **Step 3: Document the diagnosis**

Append to this plan file under `## Task 8 Diagnosis`. Cover:
- Which source(s) drop ingredients
- Whether it's a missing field request, parsing bug, or genuinely empty source data
- Concrete fix (e.g. "add `ingredients_text_en` to OFF request fields", "fall back to `ingredients_hierarchy` when `ingredients` is empty", "log a `product_ingredients_empty` event so we can quantify which sources fail")

- [ ] **Step 4: Apply the fix and add a test**

Implement the fix. Add a test to `RadianceIQ/src/services/__tests__/productLookup.test.ts` (or `backend/__tests__/`) that asserts a known previously-empty barcode now returns ingredients.

- [ ] **Step 5: Add an analytics event for visibility**

In `productLookup.ts`, when ingredients come back empty from any source, fire:

```typescript
trackEvent('product_ingredients_empty', { source: 'off', barcode, query });
```

Import `trackEvent` from `'./analytics'` if not already imported. This gives us telemetry on how often this happens going forward.

- [ ] **Step 6: Run tests**

Run: `cd RadianceIQ && npm test -- productLookup.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add RadianceIQ/src/services/productLookup.ts RadianceIQ/src/services/__tests__/productLookup.test.ts docs/superpowers/plans/2026-04-07-testflight-feedback-fixes.md
git commit -m "fix: surface and patch missing ingredients in product lookup"
```

---

## Task 9: Diagnose and tune the abrupt shadow animation

**Why:** Tester #7 said "can see the shadow come on too obviously" on build 25 (very old). Likely candidates: the `LinearGradient` backdrop on `StoryPage` in `app/scan/results.tsx:52-57`, the `ScoreGlow` rings (`results.tsx:127-171`), or a Reanimated entrance on the analyzing → results transition.

**Files:**
- Read: `RadianceIQ/app/scan/results.tsx` (full file, particularly lines 127-200)
- Read: `RadianceIQ/app/scan/analyzing.tsx`
- Modify: whichever animation is identified

- [ ] **Step 1: Run the app and reproduce on a sim**

Run: `cd RadianceIQ && npm start`

On a sim, complete a scan and watch the analyzing → results transition. Specifically watch for:
- Any opacity/shadow that snaps in faster than ~250ms
- Any backdrop or vignette that appears without a fade
- Any `withTiming` call without an `easing` parameter (defaults to linear)

- [ ] **Step 2: If reproduced, identify the offending animation**

Use Read and Grep to locate the animation. Look at:
- `results.tsx` lines 122-171 (the `ScoreGlow` outer ring fades in via `withDelay(600, withRepeat(...))` — this delays start by 600ms which can feel like a "snap")
- The `StoryPage` `LinearGradient` (line 52) — this has no animation, instant visible. Could be the culprit.
- Any `FadeIn` / `FadeInDown` / `ZoomIn` from `react-native-reanimated` (imported at line 10-15)

- [ ] **Step 3: Apply the targeted fix**

If the issue is `ScoreGlow` starting suddenly after 600ms delay: replace the initial breathe assignment with a graceful entrance:

```typescript
  useEffect(() => {
    // Graceful entrance: start at 0 opacity, fade up over 800ms, then breathe
    breathe.value = withTiming(1, { duration: 800, easing: BREATHE_EASING }, () => {
      breathe.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 500, easing: BREATHE_EASING }),
          withTiming(0.94, { duration: 1000, easing: BREATHE_EASING }),
          withTiming(1, { duration: 500, easing: BREATHE_EASING }),
        ),
        -1,
      );
    });
  }, []);
```

If the issue is the `StoryPage` `LinearGradient` snapping in: wrap it in `Animated.View` with a `FadeIn.duration(600)` entry. (Implementer: pick the change that matches what you actually see — only one of these is correct.)

- [ ] **Step 4: If unable to reproduce**

Build 25 was Mar 18 2026. Many builds have shipped since. Run `git log --oneline app/scan/results.tsx app/scan/analyzing.tsx | head -20` to see if results/analyzing has been touched since then. If yes, the bug is likely already fixed by a prior commit. Document this in the plan file and move on.

- [ ] **Step 5: Commit (or skip with explanation)**

```bash
git add RadianceIQ/app/scan/results.tsx
git commit -m "polish: smooth scan results entrance animation"
```

---

## Task 10: Final verification — run full test suite + tsc

**Why:** Catch any regression introduced by the cumulative changes before merging.

- [ ] **Step 1: Type-check**

Run: `cd RadianceIQ && npx tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 2: Run full test suite**

Run: `cd RadianceIQ && npm test`

Expected: All tests pass.

- [ ] **Step 3: Manual smoke test on a sim**

Boot a sim, sign up as a new user, complete onboarding. Verify:
1. Scan works immediately on first try (no paywall block)
2. Add a product via "Take a photo" — confirm it's the top menu option
3. Add a product manually with ingredient "Tretinoin 0.025%" — confirm detail page shows that text verbatim with "Tretinoin" tag beside it
4. Reset the app, simulate "upgraded user" by setting `subscription.trial_start_date: null` in store, restart — confirm trial is granted and scan works

- [ ] **Step 4: Commit any final fixes from manual testing**

If Step 3 reveals issues, fix them and commit.

---

## Self-Review

**Spec coverage:**
- ✅ Theme #1 (label specificity) → Task 5
- ✅ Theme #2 (paywall) → Tasks 1, 2, 3, 4
- ✅ Theme #3 (photo capture discoverability) → Task 6
- ✅ Theme #4 (search recall) → Task 7
- ⚠️ Theme #5 (no comment, screenshot only) → Intentionally deferred — no actionable signal
- ✅ Themes #6/#8 (missing ingredients) → Task 8
- ✅ Theme #7 (shadow animation) → Task 9

**Placeholder scan:** No "TBD", no "implement later", no "similar to Task N." Tasks 7, 8, 9 contain explicit diagnostic steps that produce concrete fixes inline; the diagnosis is documented in the plan file as the work proceeds.

**Type consistency:** `startTrial`, `canPerformScan`, `gateWithPaywall`, `subscription.trial_start_date`, `subscription.trial_end_date`, `is_active` — all consistent with what's in `useStore.ts` and `subscription.ts` as of 2026-04-07.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-07-testflight-feedback-fixes.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session, batch with checkpoints for review

Which approach?
