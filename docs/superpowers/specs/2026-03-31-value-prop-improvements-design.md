# Value Proposition Improvements: Routine Builder + Live Lesion Labels

**Date:** 2026-03-31
**Status:** Design (revised)
**Goal:** Make Glowlytics feel like it truly knows the user's skin — actionable routines from their products + visible real-time lesion detection during scans.

---

## Problem Statement

Users report four gaps: results feel generic, progress visualization is minimal, trust deficit in the analysis, and the app isn't sticky enough. Two features address the highest-leverage issues:

1. **Personalized Routine Builder** — replaces the current Products tab with a smarter routine page that keeps all existing product management AND adds signal-driven ordering, conflict detection, and personalized timing adjustments.
2. **Live Lesion Labels** — makes the detection pipeline visible and tangible during the scan itself, building trust that the AI is actually analyzing their skin in real-time.

---

## Feature 1: Personalized Routine Page (replaces Products tab)

### What Changes

The current Products tab (`app/(tabs)/products.tsx`) already has AM/PM/All Day grouping, a routine score ring, product effectiveness scoring, coaching insights, and the AddProductSheet. **We are NOT removing any of this.** We are enhancing it with three new capabilities layered on top:

1. **Smart product ordering** within each AM/PM section (cleanser → serum → moisturizer → SPF)
2. **Ingredient conflict detection** with inline warnings
3. **Signal-driven adjustment tips** based on the latest scan results

### What We Keep (Legacy Functionality)

All existing functionality is preserved:

| Feature | Status |
|---------|--------|
| AM/PM/All Day grouping with color palette (amber/indigo/teal) | **Keep as-is** |
| `RoutineScoreRing` with score color | **Keep as-is** |
| `ProductCard` with effectiveness score + top contributor | **Keep as-is** |
| `AddProductSheet` (search/barcode/manual entry) | **Keep as-is** |
| Empty state with "Add your first product" CTA | **Keep as-is** |
| Dashed "Add product" inline row | **Keep as-is** |
| Product detail navigation (`/product/[id]`) | **Keep as-is** |
| `computeProductEffectiveness()` scoring | **Keep as-is** |
| Haptics on add button | **Keep as-is** |
| PostHog tracking (`product_add_sheet_opened`) | **Keep as-is** |
| Header with product count + add button | **Keep as-is** |
| Routine coaching insight (weakest product, score-based tips) | **Enhance** (see below) |

### What We Add

#### A. Smart Product Ordering

Within each schedule group (AM/PM), products are sorted by application sequence instead of insertion order:

| Category | Key Ingredients | AM Order | PM Order |
|----------|----------------|----------|----------|
| Cleanser | surfactants, SLS, cocamidopropyl | 1 | 1 |
| Toner | witch hazel, niacinamide (low%), glycolic (low%) | 2 | 2 |
| Serum (water) | hyaluronic acid, vitamin C, niacinamide | 3 | 3 |
| Treatment | benzoyl peroxide, salicylic acid, adapalene | — | 4 |
| Serum (oil) | retinol, squalane, rosehip | — | 5 |
| Moisturizer | ceramides, dimethicone, shea butter | 4 | 6 |
| SPF | avobenzone, zinc oxide, titanium dioxide | 5 | — |

Products that can't be classified keep their original position. Instead of abstract step numbers, show contextual timing labels: "after cleansing", "wait 1 min", "last step" — more useful than ordinal numbers.

When a product has both sunscreen and serum ingredients (e.g., SPF moisturizer), classify by highest-priority category (SPF wins over moisturizer).

For "All Day" products: show them in both AM and PM sections with a "used AM & PM" badge, rather than a separate third section.

#### B. Ingredient Conflict Detection (with resolution actions)

Below each AM/PM section, if conflicts exist, show a `ConflictBanner` with a **resolution action** — not just a warning:

```
⚠ Retinol Serum + AHA Toner on the same evening
  → Alternate nights for best results
  [Split to alternate nights]  ← tappable action
```

Conflict rules (from AAD/EADV guidelines), each with a resolution:
- Retinoid + AHA/BHA same session → resolution: "Alternate evenings" (offer to split)
- Vitamin C + benzoyl peroxide → resolution: "Move vitamin C to AM" (one-tap reassign)
- Retinoid + benzoyl peroxide (non-adapalene) → resolution: "Switch to adapalene or separate"
- Niacinamide + high-conc vitamin C → resolution: "Apply 10 min apart" (info only, no action)

Conflicts should also fire **at product-add time** in `AddProductSheet` — warn before confirming, not just after.

#### C. Signal-Driven Adjustment Tips (with product-awareness)

Below the conflict banners, show signal-driven tips that **check whether the user already has the recommended ingredient class** before suggesting:

**When the user HAS the product type:**
- Inflammation > 60 + has retinoid → "Your inflammation is elevated — consider pausing *[product name]* for 2 weeks"
- Hydration < 40 + has HA serum → "Apply *[product name]* to damp skin for better absorption"
- Sun Damage > 50 + has vitamin C → "Move *[product name]* to your AM routine for photoprotection"
- Structure < 40 + has retinoid → "Give *[product name]* 8-12 weeks for full effect"

**When the user DOESN'T have the product type:**
- Structure < 40 + no retinoid → "A retinoid in your PM routine could improve structure"
- Hydration < 40 + no HA → "A hyaluronic acid serum could help — add one to track its effect"

Never recommend adding a product the user already has.

#### D. Daily Routine Check-Off (Stickiness)

Each AM/PM section shows a "today's progress" mini-bar. Users tap each product to mark as "used today." This:
- Creates a daily habit loop (come back AM and PM)
- Feeds into scan context: `sunscreen_used` auto-populates when SPF is checked off
- Shows adherence over time: "You completed your PM routine 5 of the last 7 days"
- During analysis, the analyzing screen shows "Checking against your 6-step PM routine..."

Check-off state is stored in AsyncStorage (keyed by date), not synced to backend (privacy, simplicity).

### Data Flow

```
User's Products (store.products)
    + Latest Signal Scores (store.modelOutputs)
    + Product Ingredients (product.ingredients_list)
    ↓
routineBuilder.ts
    ├── categorizeProduct(product) → category + order
    ├── detectConflicts(amProducts, pmProducts) → Conflict[]
    └── generateAdjustments(products, signalScores) → Adjustment[]
    ↓
products.tsx (enhanced)
    ├── Sort products within each group by order
    ├── Render step numbers on ProductCard
    ├── Render ConflictBanner per section
    └── Render AdjustmentTip per section
```

### Component Changes

**`app/(tabs)/products.tsx`** — Modify (not replace):
- Import `routineBuilder` service
- After `groupBySchedule`, call `sortByApplicationOrder` on each group
- After each section's product list, render `ConflictBanner` if conflicts exist
- After the score card, render `AdjustmentTip` components
- Add step number prop to `ProductCard`

**`src/services/routineBuilder.ts`** — Create:
- `categorizeProduct(product): { category, amOrder, pmOrder }`
- `sortByApplicationOrder(products, schedule): ProductDatum[]`
- `detectConflicts(products): Conflict[]`
- `generateAdjustments(products, signalScores): Adjustment[]`

**`src/constants/ingredients.ts`** — Create:
- `CATEGORY_PATTERNS`: ingredient → category mapping
- `CONFLICT_RULES`: pairs of ingredient classes that conflict

**`src/components/ProductCard.tsx`** — Modify:
- Add optional `stepNumber` prop, render as a small teal circle before the product name

### Files Summary

| File | Action |
|------|--------|
| `app/(tabs)/products.tsx` | **Modify** — add ordering, conflicts, adjustments, daily check-off |
| `src/services/routineBuilder.ts` | **Create** — categorize, sort, detect, adjust, check-off state |
| `src/constants/ingredients.ts` | **Create** — patterns, conflict rules with resolutions |
| `src/components/ProductCard.tsx` | **Modify** — add timing label + check-off toggle |
| `src/components/AddProductSheet.tsx` | **Modify** — conflict warning at add time |
| `src/components/ConflictBanner.tsx` | **Create** — warning with resolution action |

---

## Feature 2: Live Lesion-Specific Labels

### Current State

The infrastructure is 80% built:
- `LesionOverlay.tsx` renders bounding boxes with corner brackets, a telemetry bar, and class labels
- `onDeviceLesionDetection.ts` runs YOLOv8 inference on camera frames
- `lesionTracker.ts` provides temporal smoothing across frames
- Camera captures frames every 350ms for detection
- Server fallback at `/api/vision/detect-lesions` with ONNX models on Railway
- Count badge already added to camera top bar

### What's Missing

1. **Label readability** — labels are small (9.5px) and use clinical jargon
2. **Post-capture summary** — lesion count from camera session isn't on results
3. **Detection pipeline verification** — server fallback untested end-to-end

### Changes

**A. User-friendly lesion labels:**

| Clinical Class | Primary Label | Subtitle |
|---------------|--------------|----------|
| papule | Papule | inflammatory bump |
| comedone | Comedone | clogged pore |
| pustule | Pustule | pus-filled bump |
| nodule | Nodule | deep inflammation |
| macule | Macule | flat discoloration |
| patch | Patch | skin patch |

Show the clinical term as the primary label (builds trust, educates the user) with a plain-language subtitle in muted text below. Users who google "papule" find real dermatology resources — this positions the app as a clinical tool, not a toy.

- Increase label font from 9.5 to 12 for the clinical name
- Subtitle in FontSize.xxs, muted color
- Add background pill behind labels for readability on varied skin tones
- Show confidence as a simple bar instead of raw percentage

**B. Post-capture lesion summary on results page:**
- Results Page 2 (Signals): add a lesion summary row if lesions were detected
- Format: "3 lesions detected" with type breakdown
- Tapping navigates to deep dive page

**C. Pipeline hardening:**
- Verify server fallback end-to-end
- Add `__DEV__` diagnostic showing source + latency
- Ensure coordinate mapping is correct for front camera

### Files to Modify

| File | Action |
|------|--------|
| `src/components/LesionOverlay.tsx` | **Modify** — larger labels, user-friendly names, confidence bar |
| `src/constants/lesions.ts` | **Modify** — add `userFriendlyLabel` field |
| `app/scan/results.tsx` | **Modify** — lesion summary on signals page |

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Products tab preserves all existing functionality | 100% |
| Products sorted by application order within AM/PM | Yes |
| Conflict detection catches retinoid + AHA | Yes |
| Signal-driven tips reference user's actual product names | Yes |
| Lesion labels use user-friendly names | Yes |
| Lesion count shown on results page | Yes |
| No new TS errors | 0 |
| All existing tests pass | 421+ |

---

## Out of Scope (v1)

- Product recommendations from curated DB (suggest products to fill gaps)
- Drag-and-drop routine reordering
- Before/after photo timeline
- Weekly push notification reports
- Pixel-level heatmap overlay
- Routine sharing / export
- Full product marketplace with affiliate links
