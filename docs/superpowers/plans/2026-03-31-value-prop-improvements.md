# Value Prop Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the Products tab with smart ordering, conflict detection, signal-driven tips, and daily check-off. Improve lesion labels with clinical naming + subtitles and add post-capture summary to results.

**Architecture:** Two independent features. Feature 1 adds a `routineBuilder` service and `ingredients` constants to power the enhanced Products tab. Feature 2 modifies `lesions.ts` and `LesionOverlay.tsx` for better labels, plus adds a summary row to results. No shared dependencies between features.

**Tech Stack:** React Native, TypeScript, Zustand, AsyncStorage, react-native-svg

---

## Task 1: Create Ingredient Constants

**Files:**
- Create: `RadianceIQ/src/constants/ingredients.ts`

- [ ] **Step 1: Create the ingredient category patterns and conflict rules**

```typescript
// src/constants/ingredients.ts

export type ProductCategory =
  | 'cleanser'
  | 'toner'
  | 'serum_water'
  | 'serum_oil'
  | 'treatment'
  | 'moisturizer'
  | 'spf'
  | 'unknown';

export interface CategoryDef {
  category: ProductCategory;
  /** Ingredients that indicate this category (case-insensitive substring match) */
  patterns: string[];
  amOrder: number;   // 0 = not used in AM
  pmOrder: number;   // 0 = not used in PM
  timingLabel: string;
  /** Higher priority wins when a product matches multiple categories */
  priority: number;
}

export const CATEGORY_DEFS: CategoryDef[] = [
  {
    category: 'spf',
    patterns: ['spf', 'avobenzone', 'zinc oxide', 'titanium dioxide', 'octisalate', 'homosalate', 'octocrylene', 'sunscreen', 'uv filter'],
    amOrder: 5,
    pmOrder: 0,
    timingLabel: 'last step',
    priority: 10,
  },
  {
    category: 'cleanser',
    patterns: ['surfactant', 'sodium lauryl', 'cocamidopropyl', 'cleanser', 'face wash', 'micellar'],
    amOrder: 1,
    pmOrder: 1,
    timingLabel: 'first step',
    priority: 9,
  },
  {
    category: 'treatment',
    patterns: ['benzoyl peroxide', 'salicylic acid', 'adapalene', 'azelaic acid', 'clindamycin', 'metronidazole'],
    amOrder: 0,
    pmOrder: 4,
    timingLabel: 'on clean skin',
    priority: 8,
  },
  {
    category: 'serum_oil',
    patterns: ['retinol', 'retinal', 'tretinoin', 'retinoid', 'squalane', 'rosehip', 'bakuchiol', 'jojoba oil'],
    amOrder: 0,
    pmOrder: 5,
    timingLabel: 'after treatments',
    priority: 7,
  },
  {
    category: 'serum_water',
    patterns: ['hyaluronic acid', 'vitamin c', 'ascorbic acid', 'niacinamide', 'peptide', 'centella', 'snail mucin'],
    amOrder: 3,
    pmOrder: 3,
    timingLabel: 'on damp skin',
    priority: 6,
  },
  {
    category: 'toner',
    patterns: ['witch hazel', 'toner', 'glycolic acid', 'lactic acid', 'mandelic acid', 'pha', 'exfoli'],
    amOrder: 2,
    pmOrder: 2,
    timingLabel: 'after cleansing',
    priority: 5,
  },
  {
    category: 'moisturizer',
    patterns: ['ceramide', 'dimethicone', 'shea butter', 'moisturizer', 'cream', 'lotion', 'petrolatum', 'squalane'],
    amOrder: 4,
    pmOrder: 6,
    timingLabel: 'seal it in',
    priority: 4,
  },
];

/** Ingredient class identifiers for conflict detection */
export type IngredientClass =
  | 'retinoid'
  | 'aha_bha'
  | 'vitamin_c'
  | 'benzoyl_peroxide'
  | 'niacinamide';

export const INGREDIENT_CLASS_PATTERNS: Record<IngredientClass, string[]> = {
  retinoid: ['retinol', 'retinal', 'tretinoin', 'retinoid', 'adapalene', 'tazarotene', 'bakuchiol'],
  aha_bha: ['glycolic acid', 'lactic acid', 'salicylic acid', 'mandelic acid', 'aha', 'bha'],
  vitamin_c: ['ascorbic acid', 'vitamin c', 'l-ascorbic'],
  benzoyl_peroxide: ['benzoyl peroxide'],
  niacinamide: ['niacinamide', 'nicotinamide', 'vitamin b3'],
};

export interface ConflictRule {
  classA: IngredientClass;
  classB: IngredientClass;
  message: string;
  resolution: string;
  /** If true, show an actionable button; if false, info-only */
  actionable: boolean;
  /** Adapalene is safe with BP — skip conflict if product contains adapalene */
  exemptIngredient?: string;
}

export const CONFLICT_RULES: ConflictRule[] = [
  {
    classA: 'retinoid',
    classB: 'aha_bha',
    message: 'Retinoid + AHA/BHA on the same evening can cause irritation',
    resolution: 'Alternate evenings for best results',
    actionable: true,
  },
  {
    classA: 'vitamin_c',
    classB: 'benzoyl_peroxide',
    message: 'Benzoyl peroxide oxidizes vitamin C, reducing its effectiveness',
    resolution: 'Move vitamin C to AM',
    actionable: true,
  },
  {
    classA: 'retinoid',
    classB: 'benzoyl_peroxide',
    message: 'Benzoyl peroxide degrades tretinoin',
    resolution: 'Switch to adapalene (BP-safe) or separate AM/PM',
    actionable: false,
    exemptIngredient: 'adapalene',
  },
  {
    classA: 'niacinamide',
    classB: 'vitamin_c',
    message: 'High-concentration niacinamide + vitamin C may cause flushing',
    resolution: 'Apply 10 minutes apart or separate AM/PM',
    actionable: false,
  },
];
```

- [ ] **Step 2: Verify file compiles**

Run: `cd RadianceIQ && npx tsc --noEmit --pretty 2>&1 | head -5`
Expected: no output (0 errors)

- [ ] **Step 3: Commit**

```bash
git add src/constants/ingredients.ts
git commit -m "feat: add ingredient category patterns and conflict rules"
```

---

## Task 2: Create Routine Builder Service

**Files:**
- Create: `RadianceIQ/src/services/routineBuilder.ts`
- Create: `RadianceIQ/src/services/__tests__/routineBuilder.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/services/__tests__/routineBuilder.test.ts
import {
  categorizeProduct,
  sortByApplicationOrder,
  detectConflicts,
  generateAdjustments,
} from '../routineBuilder';
import type { ProductEntry } from '../../types';

const makeProduct = (name: string, ingredients: string[], schedule: 'AM' | 'PM' | 'both' = 'AM'): ProductEntry => ({
  user_product_id: name,
  user_id: 'test',
  product_name: name,
  product_capture_method: 'manual',
  ingredients_list: ingredients,
  usage_schedule: schedule,
  start_date: '2026-01-01',
});

describe('routineBuilder', () => {
  describe('categorizeProduct', () => {
    it('classifies SPF products', () => {
      const p = makeProduct('Sunscreen', ['zinc oxide', 'titanium dioxide']);
      expect(categorizeProduct(p).category).toBe('spf');
    });

    it('classifies retinol as serum_oil', () => {
      const p = makeProduct('Retinol', ['retinol', 'squalane']);
      expect(categorizeProduct(p).category).toBe('serum_oil');
    });

    it('SPF wins over moisturizer when both match', () => {
      const p = makeProduct('SPF Moisturizer', ['ceramide', 'zinc oxide']);
      expect(categorizeProduct(p).category).toBe('spf');
    });

    it('returns unknown for unrecognized products', () => {
      const p = makeProduct('Mystery', ['xylitol']);
      expect(categorizeProduct(p).category).toBe('unknown');
    });
  });

  describe('sortByApplicationOrder', () => {
    it('sorts AM products: cleanser → serum → moisturizer → SPF', () => {
      const products = [
        makeProduct('SPF', ['zinc oxide']),
        makeProduct('Cleanser', ['face wash']),
        makeProduct('Serum', ['hyaluronic acid']),
        makeProduct('Moisturizer', ['ceramide']),
      ];
      const sorted = sortByApplicationOrder(products, 'AM');
      expect(sorted.map(p => p.product.product_name)).toEqual([
        'Cleanser', 'Serum', 'Moisturizer', 'SPF',
      ]);
    });
  });

  describe('detectConflicts', () => {
    it('detects retinoid + AHA conflict', () => {
      const products = [
        makeProduct('Retinol', ['retinol'], 'PM'),
        makeProduct('AHA Toner', ['glycolic acid'], 'PM'),
      ];
      const conflicts = detectConflicts(products);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].message).toContain('Retinoid + AHA/BHA');
    });

    it('returns empty when no conflicts', () => {
      const products = [
        makeProduct('Cleanser', ['face wash'], 'PM'),
        makeProduct('Moisturizer', ['ceramide'], 'PM'),
      ];
      expect(detectConflicts(products)).toEqual([]);
    });

    it('exempts adapalene from BP conflict', () => {
      const products = [
        makeProduct('Adapalene', ['adapalene'], 'PM'),
        makeProduct('BP Wash', ['benzoyl peroxide'], 'PM'),
      ];
      expect(detectConflicts(products)).toEqual([]);
    });
  });

  describe('generateAdjustments', () => {
    it('suggests pausing retinoid when inflammation is high', () => {
      const products = [makeProduct('Retinol Serum', ['retinol'], 'PM')];
      const signals = { structure: 50, hydration: 50, inflammation: 70, sunDamage: 30, elasticity: 50 };
      const tips = generateAdjustments(products, signals);
      expect(tips.some(t => t.text.includes('Retinol Serum'))).toBe(true);
    });

    it('suggests adding retinoid when structure is low and none present', () => {
      const products = [makeProduct('Cleanser', ['face wash'], 'PM')];
      const signals = { structure: 30, hydration: 50, inflammation: 30, sunDamage: 30, elasticity: 50 };
      const tips = generateAdjustments(products, signals);
      expect(tips.some(t => t.text.includes('retinoid'))).toBe(true);
    });

    it('does not suggest adding what user already has', () => {
      const products = [makeProduct('Retinol', ['retinol'], 'PM')];
      const signals = { structure: 30, hydration: 50, inflammation: 30, sunDamage: 30, elasticity: 50 };
      const tips = generateAdjustments(products, signals);
      expect(tips.every(t => !t.text.includes('A retinoid in your PM'))).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd RadianceIQ && npx jest src/services/__tests__/routineBuilder.test.ts --no-coverage 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Implement routineBuilder.ts**

```typescript
// src/services/routineBuilder.ts
import type { ProductEntry } from '../types';
import {
  CATEGORY_DEFS,
  INGREDIENT_CLASS_PATTERNS,
  CONFLICT_RULES,
  type ProductCategory,
  type IngredientClass,
  type ConflictRule,
} from '../constants/ingredients';

export interface CategorizedProduct {
  product: ProductEntry;
  category: ProductCategory;
  amOrder: number;
  pmOrder: number;
  timingLabel: string;
  score?: number;
  topContributor?: string;
}

export interface DetectedConflict {
  productA: string;
  productB: string;
  message: string;
  resolution: string;
  actionable: boolean;
}

export interface AdjustmentTip {
  text: string;
  signal: string;
  color: 'success' | 'warning' | 'info';
}

/** Check if a product's ingredients contain any pattern from a list */
function hasIngredient(product: ProductEntry, patterns: string[]): boolean {
  const lower = product.ingredients_list.map(i => i.toLowerCase());
  const nameLower = product.product_name.toLowerCase();
  return patterns.some(p => lower.some(i => i.includes(p)) || nameLower.includes(p));
}

/** Classify a product into a skincare category */
export function categorizeProduct(product: ProductEntry): CategorizedProduct {
  let best: CategorizedProduct = {
    product,
    category: 'unknown',
    amOrder: 99,
    pmOrder: 99,
    timingLabel: '',
  };
  let bestPriority = -1;

  for (const def of CATEGORY_DEFS) {
    if (hasIngredient(product, def.patterns) && def.priority > bestPriority) {
      bestPriority = def.priority;
      best = {
        product,
        category: def.category,
        amOrder: def.amOrder || 99,
        pmOrder: def.pmOrder || 99,
        timingLabel: def.timingLabel,
      };
    }
  }

  return best;
}

/** Sort products by their application order for a given schedule */
export function sortByApplicationOrder(
  products: ProductEntry[],
  schedule: 'AM' | 'PM',
): CategorizedProduct[] {
  const categorized = products.map(categorizeProduct);
  const orderKey = schedule === 'AM' ? 'amOrder' : 'pmOrder';
  return categorized.sort((a, b) => a[orderKey] - b[orderKey]);
}

/** Get which ingredient classes a product contains */
function getIngredientClasses(product: ProductEntry): IngredientClass[] {
  const classes: IngredientClass[] = [];
  for (const [cls, patterns] of Object.entries(INGREDIENT_CLASS_PATTERNS)) {
    if (hasIngredient(product, patterns)) {
      classes.push(cls as IngredientClass);
    }
  }
  return classes;
}

/** Detect ingredient conflicts among products in the same schedule */
export function detectConflicts(products: ProductEntry[]): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];
  const productClasses = products.map(p => ({
    product: p,
    classes: getIngredientClasses(p),
  }));

  for (const rule of CONFLICT_RULES) {
    const hasA = productClasses.filter(pc => pc.classes.includes(rule.classA));
    const hasB = productClasses.filter(pc => pc.classes.includes(rule.classB));

    for (const a of hasA) {
      for (const b of hasB) {
        if (a.product.user_product_id === b.product.user_product_id) continue;
        // Check exemption (e.g., adapalene is safe with BP)
        if (rule.exemptIngredient && hasIngredient(a.product, [rule.exemptIngredient])) continue;
        if (rule.exemptIngredient && hasIngredient(b.product, [rule.exemptIngredient])) continue;

        // Deduplicate: only add if this pair hasn't been seen
        const key = [a.product.user_product_id, b.product.user_product_id].sort().join('|');
        if (!conflicts.some(c => [c.productA, c.productB].sort().join('|') === key)) {
          conflicts.push({
            productA: a.product.product_name,
            productB: b.product.product_name,
            message: rule.message,
            resolution: rule.resolution,
            actionable: rule.actionable,
          });
        }
      }
    }
  }

  return conflicts;
}

/** Generate signal-driven adjustment tips, aware of what products the user has */
export function generateAdjustments(
  products: ProductEntry[],
  signals: Record<string, number>,
): AdjustmentTip[] {
  const tips: AdjustmentTip[] = [];
  const hasRetinoid = products.find(p => hasIngredient(p, INGREDIENT_CLASS_PATTERNS.retinoid));
  const hasHA = products.find(p => hasIngredient(p, ['hyaluronic acid']));
  const hasVitC = products.find(p => hasIngredient(p, INGREDIENT_CLASS_PATTERNS.vitamin_c));

  // Inflammation checks
  if (signals.inflammation > 60 && hasRetinoid) {
    tips.push({
      text: `Your inflammation is elevated \u2014 consider pausing ${hasRetinoid.product_name} for 2 weeks`,
      signal: 'inflammation',
      color: 'warning',
    });
  }

  // Hydration checks
  if (signals.hydration < 40) {
    if (hasHA) {
      tips.push({
        text: `Apply ${hasHA.product_name} to damp skin for better absorption`,
        signal: 'hydration',
        color: 'info',
      });
    } else {
      tips.push({
        text: 'A hyaluronic acid serum could help \u2014 add one to track its effect',
        signal: 'hydration',
        color: 'info',
      });
    }
  }

  // Sun damage checks
  if (signals.sunDamage > 50 && hasVitC) {
    const schedule = hasVitC.usage_schedule;
    if (schedule !== 'AM') {
      tips.push({
        text: `Move ${hasVitC.product_name} to your AM routine for photoprotection`,
        signal: 'sunDamage',
        color: 'warning',
      });
    }
  }

  // Structure checks
  if (signals.structure < 40) {
    if (hasRetinoid) {
      tips.push({
        text: `Give ${hasRetinoid.product_name} 8\u201312 weeks for full effect`,
        signal: 'structure',
        color: 'info',
      });
    } else {
      tips.push({
        text: 'A retinoid in your PM routine could improve structure',
        signal: 'structure',
        color: 'info',
      });
    }
  }

  return tips;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd RadianceIQ && npx jest src/services/__tests__/routineBuilder.test.ts --no-coverage 2>&1 | tail -5`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/routineBuilder.ts src/services/__tests__/routineBuilder.test.ts
git commit -m "feat: add routine builder service with ordering, conflicts, and adjustments"
```

---

## Task 3: Add Lesion Subtitles to Constants

**Files:**
- Modify: `RadianceIQ/src/constants/lesions.ts`

- [ ] **Step 1: Add `subtitle` field to LesionInfo interface and all entries**

Add `subtitle: string` to the `LesionInfo` interface, then add it to each entry:

```
acne:     subtitle: 'detected blemish'
comedone: subtitle: 'clogged pore'
papule:   subtitle: 'inflammatory bump'
pustule:  subtitle: 'pus-filled bump'
nodule:   subtitle: 'deep inflammation'
macule:   subtitle: 'flat discoloration'
patch:    subtitle: 'skin patch'
```

Also add to FALLBACK_INFO: `subtitle: 'detected lesion'`

- [ ] **Step 2: Verify compiles**

Run: `cd RadianceIQ && npx tsc --noEmit --pretty 2>&1 | head -5`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/constants/lesions.ts
git commit -m "feat: add clinical subtitles to lesion info constants"
```

---

## Task 4: Enhance LesionOverlay Labels

**Files:**
- Modify: `RadianceIQ/src/components/LesionOverlay.tsx`

- [ ] **Step 1: Update the label rendering in the SVG bounding box section**

Find the label rendering (around line 360 where `const label = ...`) and change:

Before: `const label = \`\${lesion.class.toUpperCase()} \${conf}%\`;`

After:
```typescript
const info = LESION_INFO[lesion.class as LesionClass] ?? FALLBACK_INFO;
const primaryLabel = info.label.toUpperCase();
const subtitle = info.subtitle;
```

Update the SVG text rendering to show both the clinical name (12px, bright) and subtitle (8px, muted) with a background pill.

- [ ] **Step 2: Import LESION_INFO and FALLBACK_INFO**

Add to imports: `import { LESION_INFO, FALLBACK_INFO } from '../constants/lesions';`
Add: `import type { LesionClass } from '../types';`

- [ ] **Step 3: Verify compiles and run existing tests**

Run: `cd RadianceIQ && npx tsc --noEmit --pretty 2>&1 | grep -v LesionOverlay && npm test 2>&1 | tail -3`

- [ ] **Step 4: Commit**

```bash
git add src/components/LesionOverlay.tsx
git commit -m "feat: clinical name + subtitle labels on lesion overlay"
```

---

## Task 5: Add Lesion Summary to Results Page

**Files:**
- Modify: `RadianceIQ/app/scan/results.tsx`

- [ ] **Step 1: Add a lesion summary row to the signals page (Page 2)**

After the signal list `</View>`, before the `</StoryPage>` closing, add a conditional lesion summary:

```tsx
{latestOutput.lesions && latestOutput.lesions.length > 0 && (
  <Animated.View entering={FadeInDown.duration(300).delay(600)} style={styles.lesionSummary}>
    <Feather name="target" size={14} color={Colors.primary} />
    <Text style={styles.lesionSummaryText}>
      {latestOutput.lesions.length} lesion{latestOutput.lesions.length !== 1 ? 's' : ''} detected during scan
    </Text>
  </Animated.View>
)}
```

- [ ] **Step 2: Add the styles**

```typescript
lesionSummary: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: Spacing.sm,
  marginTop: Spacing.lg,
  paddingVertical: Spacing.sm,
  paddingHorizontal: Spacing.md,
  backgroundColor: Colors.surfaceOverlay,
  borderRadius: BorderRadius.full,
  alignSelf: 'flex-start',
},
lesionSummaryText: {
  color: Colors.primary,
  fontFamily: FontFamily.sansMedium,
  fontSize: FontSize.sm,
},
```

- [ ] **Step 3: Verify compiles**

Run: `cd RadianceIQ && npx tsc --noEmit --pretty 2>&1 | head -5`

- [ ] **Step 4: Commit**

```bash
git add app/scan/results.tsx
git commit -m "feat: lesion summary pill on results signals page"
```

---

## Task 6: Integrate Routine Builder into Products Tab

**Files:**
- Modify: `RadianceIQ/app/(tabs)/products.tsx`
- Modify: `RadianceIQ/src/components/ProductCard.tsx`

- [ ] **Step 1: Import routineBuilder in products.tsx**

Add imports:
```typescript
import {
  sortByApplicationOrder,
  detectConflicts,
  generateAdjustments,
  type DetectedConflict,
  type AdjustmentTip,
} from '../../src/services/routineBuilder';
```

- [ ] **Step 2: Add sorting + conflict detection + adjustment generation**

After `const grouped = useMemo(...)`, add:

```typescript
const sortedGrouped = useMemo(() => {
  const result = new Map<ScheduleGroup, ProductDatum[]>();
  for (const [schedule, items] of grouped) {
    if (!items) continue;
    const products = items.map(d => d.product);
    const sorted = sortByApplicationOrder(products, schedule === 'PM' ? 'PM' : 'AM');
    result.set(schedule, sorted.map(cat => {
      const original = items.find(d => d.product.user_product_id === cat.product.user_product_id);
      return { ...original!, timingLabel: cat.timingLabel };
    }));
  }
  return result;
}, [grouped]);

const conflicts = useMemo(() => {
  const pmProducts = (grouped.get('PM') || []).map(d => d.product);
  return detectConflicts(pmProducts);
}, [grouped]);

const adjustments = useMemo(() => {
  if (!overallInsight?.signals) return [];
  return generateAdjustments(
    products,
    overallInsight.signals as unknown as Record<string, number>,
  );
}, [products, overallInsight]);
```

- [ ] **Step 3: Replace `grouped.get(schedule)` with `sortedGrouped.get(schedule)` in the render**

- [ ] **Step 4: Add ConflictBanner after PM section's product list**

```tsx
{schedule === 'PM' && conflicts.length > 0 && (
  <View style={styles.conflictSection}>
    {conflicts.map((c, i) => (
      <View key={i} style={styles.conflictBanner}>
        <Feather name="alert-triangle" size={14} color={Colors.warning} />
        <View style={styles.conflictText}>
          <Text style={styles.conflictMessage}>{c.productA} + {c.productB}</Text>
          <Text style={styles.conflictResolution}>{c.resolution}</Text>
        </View>
      </View>
    ))}
  </View>
)}
```

- [ ] **Step 5: Add AdjustmentTip section after the score card**

```tsx
{adjustments.length > 0 && (
  <View style={styles.adjustmentSection}>
    {adjustments.map((tip, i) => (
      <View key={i} style={styles.adjustmentTip}>
        <Feather name="info" size={14} color={Colors.primary} />
        <Text style={styles.adjustmentText}>{tip.text}</Text>
      </View>
    ))}
  </View>
)}
```

- [ ] **Step 6: Add timing label to ProductCard**

In `ProductCard.tsx`, add optional `timingLabel` prop:
```typescript
interface Props {
  product: ProductEntry;
  score?: number;
  topContributor?: string;
  timingLabel?: string;
  onPress: () => void;
}
```

Render it as muted text below the product name when present.

- [ ] **Step 7: Add all new styles to products.tsx**

```typescript
conflictSection: { gap: Spacing.sm, marginTop: Spacing.sm },
conflictBanner: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: Spacing.sm,
  backgroundColor: Colors.warning + '10',
  borderRadius: BorderRadius.lg,
  padding: Spacing.md,
  borderLeftWidth: 3,
  borderLeftColor: Colors.warning,
},
conflictText: { flex: 1, gap: Spacing.xxs },
conflictMessage: {
  color: Colors.text,
  fontFamily: FontFamily.sansSemiBold,
  fontSize: FontSize.sm,
},
conflictResolution: {
  color: Colors.textSecondary,
  fontFamily: FontFamily.sans,
  fontSize: FontSize.xs,
},
adjustmentSection: { gap: Spacing.sm, marginBottom: Spacing.lg },
adjustmentTip: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: Spacing.sm,
  backgroundColor: Colors.surfaceOverlay,
  borderRadius: BorderRadius.lg,
  padding: Spacing.md,
},
adjustmentText: {
  flex: 1,
  color: Colors.textSecondary,
  fontFamily: FontFamily.sansMedium,
  fontSize: FontSize.sm,
  lineHeight: 20,
},
```

- [ ] **Step 8: Verify compiles and all tests pass**

Run: `cd RadianceIQ && npx tsc --noEmit --pretty 2>&1 | head -5 && npm test 2>&1 | tail -3`

- [ ] **Step 9: Commit**

```bash
git add app/(tabs)/products.tsx src/components/ProductCard.tsx
git commit -m "feat: integrate routine builder — smart ordering, conflicts, signal tips"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Full type check**

Run: `cd RadianceIQ && npx tsc --noEmit --pretty`
Expected: 0 errors

- [ ] **Step 2: Full test suite**

Run: `cd RadianceIQ && npm test`
Expected: all suites pass, 0 failures

- [ ] **Step 3: Commit all remaining changes**

```bash
git add -A && git status
git commit -m "feat: value prop improvements — routine builder + lesion labels"
```
