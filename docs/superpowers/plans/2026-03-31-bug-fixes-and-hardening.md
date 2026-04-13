# Bug Fixes & User Flow Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 confirmed bugs (paywall bypass, incorrect trend baselines, IDOR on model-outputs, progress ring regression) and harden the scan-to-results user flow.

**Architecture:** All fixes are localized — no new files, no architectural changes. Each task touches 1-2 source files + their test file. The paywall bypass fix (Task 1) is already applied and only needs a test. Tasks are independent and can be executed in any order.

**Tech Stack:** TypeScript (Jest), Node.js (Jest), Express, PostgreSQL (mocked via `pg` in tests)

---

## File Map

| Task | Source File(s) | Test File(s) |
|------|---------------|--------------|
| 1 | `src/store/useStore.ts:458-465` | `src/store/__tests__/useStore.test.ts` |
| 2 | `src/services/skinInsights.ts:266-273` | `src/services/__tests__/skinInsights.test.ts` (new) |
| 3 | `backend/app.js:1283-1317` | `backend/__tests__/launch-blockers.test.js` |
| 4 | `app/scan/analyzing.tsx:228-233` | (visual-only, manual verification) |

All paths relative to `RadianceIQ/`.

---

### Task 1: Test the Paywall Bypass Fix (incrementFreeScansUsed persistence)

The code fix is already applied (added `debouncedPersist()` call at `src/store/useStore.ts:465`). This task adds the regression test.

**Files:**
- Verify: `src/store/useStore.ts:458-465`
- Test: `src/store/__tests__/useStore.test.ts`

- [ ] **Step 1: Write the failing test for persistence**

Add this test inside the existing `describe('subscription management')` block (after the `incrementFreeScansUsed increments the counter` test at line 263):

```typescript
it('incrementFreeScansUsed persists to AsyncStorage', async () => {
  useStore.getState().incrementFreeScansUsed();
  useStore.getState().incrementFreeScansUsed();

  // Wait for debounced persist (50ms timer + execution)
  await new Promise((r) => setTimeout(r, 100));

  const raw = await AsyncStorage.getItem('appState');
  expect(raw).not.toBeNull();
  const persisted = JSON.parse(raw!);
  expect(persisted.subscription.free_scans_used).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd RadianceIQ && npx jest src/store/__tests__/useStore.test.ts --testNamePattern="incrementFreeScansUsed persists" --no-coverage`

Expected: PASS (fix already applied)

- [ ] **Step 3: Verify the fix is in place**

Confirm `src/store/useStore.ts:465` contains `debouncedPersist(() => get().persistData());` after the `set()` call in `incrementFreeScansUsed`.

- [ ] **Step 4: Run full store test suite**

Run: `cd RadianceIQ && npx jest src/store/__tests__/useStore.test.ts --no-coverage`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add RadianceIQ/src/store/useStore.ts RadianceIQ/src/store/__tests__/useStore.test.ts
git commit -m "fix: persist free_scans_used to prevent paywall bypass on restart

incrementFreeScansUsed was the only state mutation missing debouncedPersist(),
allowing free scan count to reset on app restart — bypassing the paywall."
```

---

### Task 2: Fix Baseline Trend Calculation (skinInsights.ts)

The baseline signal derivation at line 266-273 hardcodes `acne_score` for `inflammationRisk` and `sun_damage_score` for `pigmentationRisk` instead of using the model output's signal scores. This makes `trendDelta` compare apples-to-oranges (current uses refined scanner indices, baseline uses raw proxies).

**Files:**
- Modify: `src/services/skinInsights.ts:266-273`
- Create: `src/services/__tests__/skinInsights.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/__tests__/skinInsights.test.ts`:

```typescript
import { buildOverallSkinInsight } from '../skinInsights';
import type { ModelOutput, DailyRecord } from '../../types';

const makeOutput = (overrides: Partial<ModelOutput> = {}): ModelOutput => ({
  output_id: 'out-1',
  daily_id: 'day-1',
  acne_score: 30,
  sun_damage_score: 25,
  skin_age_score: 20,
  confidence: 0.85,
  primary_driver: 'acne',
  recommended_action: 'cleanser',
  escalation_flag: false,
  created_at: '2026-03-31T00:00:00Z',
  signal_scores: null,
  signal_features: null,
  signal_confidence: null,
  lesions: null,
  conditions: null,
  rag_recommendations: null,
  personalized_feedback: null,
  zone_severity: null,
  generated_insights: null,
  ...overrides,
});

describe('buildOverallSkinInsight', () => {
  it('returns null when latestOutput is null', () => {
    const result = buildOverallSkinInsight({
      latestOutput: null,
      baselineOutput: null,
      latestDaily: null,
    });
    expect(result).toBeNull();
  });

  it('uses scanner_indices for baseline when available', () => {
    const baselineDaily: Partial<DailyRecord> = {
      scanner_indices: {
        inflammation_index: 50,
        pigmentation_index: 40,
        texture_index: 35,
      },
    };

    const baseline = makeOutput({
      output_id: 'out-baseline',
      daily_id: 'day-baseline',
      acne_score: 30,
      sun_damage_score: 25,
      skin_age_score: 20,
    });

    // With the bug: baseline uses acne_score (30) for inflammationRisk
    // instead of inflammation_index (50). This produces a different
    // baseline score, making trendDelta incorrect.
    const latest = makeOutput();
    const latestDaily = {
      daily_id: 'day-1',
      date: '2026-03-31',
      scanner_reading_id: 'scan-1',
      scanner_indices: {
        inflammation_index: 50,
        pigmentation_index: 40,
        texture_index: 35,
      },
      scanner_quality_flag: 'pass' as const,
    } as DailyRecord;

    const result = buildOverallSkinInsight({
      latestOutput: latest,
      baselineOutput: baseline,
      latestDaily,
      baselineDaily: baselineDaily as DailyRecord,
    });

    expect(result).not.toBeNull();

    // When baseline and current have identical inputs,
    // trendDelta should be 0 (or very close to 0)
    expect(Math.abs(result!.trendDelta)).toBeLessThanOrEqual(1);
  });

  it('computes trendDelta = 0 when latest and baseline are identical', () => {
    const output = makeOutput();
    const result = buildOverallSkinInsight({
      latestOutput: output,
      baselineOutput: output,
      latestDaily: null,
    });

    expect(result).not.toBeNull();
    expect(result!.trendDelta).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd RadianceIQ && npx jest src/services/__tests__/skinInsights.test.ts --no-coverage`

Expected: The "uses scanner_indices for baseline" test should FAIL because the function signature doesn't accept `baselineDaily` yet, and identical inputs may still produce trendDelta !== 0 due to the bug.

- [ ] **Step 3: Update function signature and fix baseline derivation**

In `src/services/skinInsights.ts`, update the `buildOverallSkinInsight` function:

Change the parameter type (around line 215-231) to add `baselineDaily`:

```typescript
export const buildOverallSkinInsight = ({
  latestOutput,
  baselineOutput,
  latestDaily,
  baselineDaily,
  serverSignalScores,
  serverSignalFeatures,
  serverSignalConfidence,
  serverLesions,
}: {
  latestOutput: ModelOutput | null;
  baselineOutput: ModelOutput | null;
  latestDaily: DailyRecord | null;
  baselineDaily?: DailyRecord | null;
  serverSignalScores?: SignalScores;
  serverSignalFeatures?: SignalFeatures;
  serverSignalConfidence?: SignalConfidence;
  serverLesions?: DetectedLesion[];
}): OverallSkinInsight | null => {
```

Then replace lines 266-275 (the baseline derivation):

```typescript
  const baselineSignals = baselineOutput
    ? deriveCompositeSignals({
        acneRisk: baselineOutput.acne_score,
        sunRisk: baselineOutput.sun_damage_score,
        ageRisk: baselineOutput.skin_age_score,
        inflammationRisk: baselineDaily?.scanner_indices?.inflammation_index ?? baselineOutput.acne_score,
        pigmentationRisk: baselineDaily?.scanner_indices?.pigmentation_index ?? baselineOutput.sun_damage_score,
        textureRisk: baselineDaily?.scanner_indices?.texture_index ?? baselineOutput.skin_age_score,
      })
    : null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd RadianceIQ && npx jest src/services/__tests__/skinInsights.test.ts --no-coverage`

Expected: All 3 tests PASS

- [ ] **Step 5: Check for callers that need updating**

Search for all calls to `buildOverallSkinInsight` and add `baselineDaily` where the baseline daily record is available:

Run: `grep -rn "buildOverallSkinInsight" RadianceIQ/src/ RadianceIQ/app/`

For each call site that has access to a baseline daily record, pass it as `baselineDaily`. If the daily record isn't available at the call site, the fallback (`?? baselineOutput.acne_score`) preserves existing behavior — no changes needed at those call sites.

- [ ] **Step 6: Run full test suite**

Run: `cd RadianceIQ && npx jest --no-coverage`

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add RadianceIQ/src/services/skinInsights.ts RadianceIQ/src/services/__tests__/skinInsights.test.ts
git commit -m "fix: use scanner_indices for baseline trend calculation

Baseline derivation was hardcoding acne_score for inflammationRisk and
sun_damage_score for pigmentationRisk, making trendDelta compare refined
scanner indices (current) against raw proxies (baseline). Now accepts
baselineDaily and uses its scanner_indices when available."
```

---

### Task 3: Fix IDOR on POST /api/model-outputs

The `POST /api/model-outputs` endpoint accepts `daily_id` from the request body without verifying the authenticated user owns that daily record. Every other protected endpoint uses `req.auth.userId` or `authorizeUser()`.

**Files:**
- Modify: `backend/app.js:1283-1317`
- Test: `backend/__tests__/launch-blockers.test.js`

- [ ] **Step 1: Write the failing test**

Add these tests to `backend/__tests__/launch-blockers.test.js` inside a new `describe('POST /api/model-outputs')` block:

```javascript
describe('POST /api/model-outputs', () => {
  beforeEach(() => mockQuery.mockReset());

  it('rejects when user does not own the daily_id', async () => {
    // Ownership check returns no rows — user doesn't own this daily record
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app)
      .post('/api/model-outputs')
      .set('Authorization', 'Bearer test-token')
      .send({
        daily_id: 'foreign-daily-id',
        acne_score: 50,
        sun_damage_score: 30,
        skin_age_score: 40,
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/access denied/i);
  });

  it('allows insert when user owns the daily_id', async () => {
    // Ownership check succeeds
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ daily_id: 'my-daily' }] });
    // INSERT succeeds
    mockQuery.mockResolvedValueOnce({
      rows: [{
        output_id: 'out-1',
        daily_id: 'my-daily',
        acne_score: 50,
      }],
    });

    const res = await request(app)
      .post('/api/model-outputs')
      .set('Authorization', 'Bearer test-token')
      .send({
        daily_id: 'my-daily',
        acne_score: 50,
        sun_damage_score: 30,
        skin_age_score: 40,
      });

    expect(res.status).toBe(201);
    // Verify the ownership query was called with the right params
    expect(mockQuery.mock.calls[0][1]).toEqual(['my-daily', 'test-user-id']);
  });
});
```

Note: Adjust `'test-user-id'` to match whatever the mock auth middleware injects as `req.auth.userId` in this test file. Check the existing `beforeAll` or mock setup.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd RadianceIQ/backend && npx jest __tests__/launch-blockers.test.js --testNamePattern="model-outputs" --no-coverage`

Expected: FAIL — endpoint currently does no ownership check, returns 201 for both cases.

- [ ] **Step 3: Add ownership check to POST /api/model-outputs**

In `backend/app.js`, replace lines 1283-1317:

```javascript
app.post('/api/model-outputs', async (req, res) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const {
      daily_id, acne_score, sun_damage_score, skin_age_score,
      confidence, primary_driver, recommended_action, escalation_flag,
      signal_scores, signal_features, lesions, signal_confidence,
      conditions, rag_recommendations, personalized_feedback,
      zone_severity, generated_insights,
    } = req.body;

    // SECURITY: verify the authenticated user owns this daily record
    const ownership = await pool.query(
      'SELECT 1 FROM daily_records WHERE daily_id = $1 AND user_id = $2',
      [daily_id, userId]
    );
    if (ownership.rowCount === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `INSERT INTO model_outputs
       (daily_id, acne_score, sun_damage_score, skin_age_score,
        confidence, primary_driver, recommended_action, escalation_flag,
        signal_scores, signal_features, lesions, signal_confidence,
        conditions, rag_recommendations, personalized_feedback,
        zone_severity, generated_insights)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
      [daily_id, acne_score, sun_damage_score, skin_age_score,
       confidence, primary_driver, recommended_action, escalation_flag || false,
       signal_scores ? JSON.stringify(signal_scores) : null,
       signal_features ? JSON.stringify(signal_features) : null,
       lesions ? JSON.stringify(lesions) : null,
       signal_confidence ? JSON.stringify(signal_confidence) : null,
       conditions ? JSON.stringify(conditions) : null,
       rag_recommendations ? JSON.stringify(rag_recommendations) : null,
       personalized_feedback || null,
       zone_severity ? JSON.stringify(zone_severity) : null,
       generated_insights ? JSON.stringify(generated_insights) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd RadianceIQ/backend && npx jest __tests__/launch-blockers.test.js --testNamePattern="model-outputs" --no-coverage`

Expected: Both tests PASS

- [ ] **Step 5: Run full backend test suite**

Run: `cd RadianceIQ/backend && npx jest --no-coverage`

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add RadianceIQ/backend/app.js RadianceIQ/backend/__tests__/launch-blockers.test.js
git commit -m "fix: add ownership check on POST /api/model-outputs (IDOR)

Endpoint accepted any daily_id without verifying the authenticated user
owns it. Now queries daily_records to confirm ownership before INSERT,
consistent with all other protected endpoints."
```

---

### Task 4: Fix Progress Ring Regression in Analyzing Screen

The `progressForStage()` function at line 228-233 causes the progress ring to go backwards from stage 5 (0.667) to stage 6 (0.66).

**Files:**
- Modify: `app/scan/analyzing.tsx:228-233`

- [ ] **Step 1: Verify the bug**

`STAGES.length` = 9.

| Stage | Current formula | Value |
|-------|----------------|-------|
| 0 | 1/9 | 0.111 |
| 1 | 2/9 | 0.222 |
| 2 | 3/9 | 0.333 |
| 3 | 4/9 | 0.444 |
| 4 | 5/9 | 0.556 |
| 5 | 6/9 | **0.667** |
| 6 | hardcoded | **0.660** ← regression |
| 7 | hardcoded | 0.850 |
| 8 | return 1 | 1.000 |

- [ ] **Step 2: Fix the progress function**

In `app/scan/analyzing.tsx`, replace lines 228-233:

```typescript
  const progressForStage = (stage: number) => {
    if (stage <= 5) return (stage + 1) / STAGES.length;
    if (stage === 6) return 0.70;
    if (stage === 7) return 0.85;
    return 1;
  };
```

This ensures monotonic progression: ... → 0.667 → 0.70 → 0.85 → 1.0.

- [ ] **Step 3: Verify visually**

Run the app (`npm start`), perform a scan, and watch the progress ring during the analyzing screen. Confirm it never moves backwards.

- [ ] **Step 4: Commit**

```bash
git add RadianceIQ/app/scan/analyzing.tsx
git commit -m "fix: progress ring no longer regresses at stage 6

Stage 5 returned 6/9=0.667 but stage 6 was hardcoded to 0.66, causing
a visible backward jump. Changed stage 6 to 0.70 for monotonic progress."
```

---

## Execution Order

Tasks are independent. Recommended priority:

1. **Task 1** (paywall bypass test) — highest revenue impact, fix already applied, just needs test
2. **Task 3** (IDOR fix) — security vulnerability
3. **Task 2** (baseline trend) — data accuracy for core feature
4. **Task 4** (progress ring) — visual polish
