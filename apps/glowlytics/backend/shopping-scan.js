'use strict';

/**
 * Scan-while-shopping verdict engine — PURE functions only (no DB, no network).
 *
 * Given a candidate product the user is considering buying, their skin goal(s),
 * and the products already on their shelf, produce a personalized Buy / Maybe /
 * Skip verdict. All scoring is deterministic so the unit tests stay stable.
 */

const CATEGORY = {
  RETINOID: 'retinoid',
  AHA: 'aha',
  BHA: 'bha',
  VITAMIN_C: 'vitamin_c',
  NIACINAMIDE: 'niacinamide',
  BENZOYL_PEROXIDE: 'benzoyl_peroxide',
  AZELAIC: 'azelaic',
  SUNSCREEN: 'sunscreen_active',
  FRAGRANCE: 'fragrance',
  HUMECTANT: 'humectant',
  ANTIOXIDANT: 'antioxidant',
  PEPTIDE: 'peptide',
  SURFACTANT: 'surfactant',
  OTHER: 'other',
};

// Categories that count as "actives" for conflict / goal / redundancy logic.
// Humectant, fragrance, surfactant and other are excluded.
const ACTIVE_CATEGORIES = new Set([
  CATEGORY.RETINOID,
  CATEGORY.AHA,
  CATEGORY.BHA,
  CATEGORY.VITAMIN_C,
  CATEGORY.NIACINAMIDE,
  CATEGORY.BENZOYL_PEROXIDE,
  CATEGORY.AZELAIC,
  CATEGORY.SUNSCREEN,
  CATEGORY.ANTIOXIDANT,
  CATEGORY.PEPTIDE,
]);

// Ordered keyword rules. First match wins — order matters: the 'ascorb' family
// (ascorbic / ascorbyl / tetrahexyldecyl ascorbate) is tested as vitamin C before
// the surfactant rule could catch 'ascorbyl glucoside', and BHA (salicyl / salix /
// willow) is tested before surfactant so willow-bark and salicylate forms
// categorize as BHA.
const CATEGORY_RULES = [
  [/retinoid|retinol|retinal|tretinoin|adapalene|retinyl|retinoate/, CATEGORY.RETINOID],
  [/glycolic|lactic|mandelic|\baha\b/, CATEGORY.AHA],
  [/salicyl|salix|willow|\bbha\b/, CATEGORY.BHA],
  [/ascorb|vitamin c/, CATEGORY.VITAMIN_C],
  [/niacinamide|nicotinamide/, CATEGORY.NIACINAMIDE],
  [/benzoyl peroxide/, CATEGORY.BENZOYL_PEROXIDE],
  [/azelaic/, CATEGORY.AZELAIC],
  [/avobenzone|homosalate|octinoxate|octisalate|octocrylene|zinc oxide|titanium dioxide|oxybenzone/, CATEGORY.SUNSCREEN],
  [/fragrance|parfum|linalool|limonene/, CATEGORY.FRAGRANCE],
  [/glycerin|hyaluron|sodium pca|panthenol/, CATEGORY.HUMECTANT],
  [/tocopherol|ferulic|resveratrol|green tea/, CATEGORY.ANTIOXIDANT],
  [/peptide|matrixyl|argireline/, CATEGORY.PEPTIDE],
  [/sulfate|sulfonate|cocamidopropyl|glucoside/, CATEGORY.SURFACTANT],
];

// Which active categories benefit each primary goal.
const GOAL_BENEFITS = {
  acne: [CATEGORY.BHA, CATEGORY.BENZOYL_PEROXIDE, CATEGORY.RETINOID, CATEGORY.AZELAIC, CATEGORY.NIACINAMIDE],
  sun_damage: [CATEGORY.SUNSCREEN, CATEGORY.VITAMIN_C, CATEGORY.NIACINAMIDE, CATEGORY.RETINOID, CATEGORY.ANTIOXIDANT],
  skin_age: [CATEGORY.RETINOID, CATEGORY.VITAMIN_C, CATEGORY.PEPTIDE, CATEGORY.AHA, CATEGORY.ANTIOXIDANT],
};

const GOAL_LABELS = { acne: 'acne', sun_damage: 'sun damage', skin_age: 'skin aging' };
function goalLabel(goal) {
  return GOAL_LABELS[goal] || String(goal || '').replace(/_/g, ' ');
}

/**
 * Map a raw ingredient name to a single category string. Lowercases / trims,
 * then applies the ordered keyword rules. Unknown -> 'other'.
 */
function categorizeIngredient(rawName) {
  const s = String(rawName == null ? '' : rawName).toLowerCase().trim();
  if (!s) return CATEGORY.OTHER;
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(s)) return cat;
  }
  return CATEGORY.OTHER;
}

function inferType(name, actives, hasSunscreen) {
  const n = String(name || '').toLowerCase();
  if (/cleanser|cleansing|face wash|\bwash\b|foaming/.test(n)) return 'cleanser';
  if (/sunscreen|sunblock|\bspf\b/.test(n)) return 'sunscreen';
  if (/toner|essence|\bmist\b/.test(n)) return 'toner';
  if (/serum/.test(n)) return 'serum';
  if (/moistur|cream|lotion|balm/.test(n)) return 'moisturizer';
  if (/treatment|spot|peel|mask|exfoliant/.test(n)) return 'treatment';
  // Fall back to actives.
  if (hasSunscreen) return 'sunscreen';
  if (actives.some((a) => [CATEGORY.RETINOID, CATEGORY.AHA, CATEGORY.BHA, CATEGORY.BENZOYL_PEROXIDE, CATEGORY.AZELAIC].includes(a))) return 'treatment';
  if (actives.some((a) => [CATEGORY.VITAMIN_C, CATEGORY.NIACINAMIDE, CATEGORY.PEPTIDE, CATEGORY.ANTIOXIDANT].includes(a))) return 'serum';
  return 'unknown';
}

/**
 * Analyze a product into a summary used by every downstream rule.
 * @param {{name?:string, ingredients?:string[]}} input
 */
function analyzeProduct(input) {
  const name = (input && input.name) || '';
  const rawIngredients = input && Array.isArray(input.ingredients) ? input.ingredients : [];
  const cats = rawIngredients.map(categorizeIngredient);
  const categories = [...new Set(cats)];
  const actives = [...new Set(cats.filter((c) => ACTIVE_CATEGORIES.has(c)))];
  const hasFragrance = cats.includes(CATEGORY.FRAGRANCE);
  const hasSunscreen = cats.includes(CATEGORY.SUNSCREEN);
  const inferredType = inferType(name, actives, hasSunscreen);
  return { name, categories, actives, hasFragrance, hasSunscreen, inferredType };
}

function hasActive(prod, cat) {
  return !!prod && Array.isArray(prod.actives) && prod.actives.includes(cat);
}
function routineWith(routine, cat) {
  return routine.find((r) => hasActive(r, cat)) || null;
}
function routineWithAny(routine, cats) {
  for (const c of cats) {
    const m = routineWith(routine, c);
    if (m) return m;
  }
  return null;
}

/**
 * Detect ingredient conflicts between a candidate and the analyzed routine.
 * @returns {Array<{code,severity,message,withProduct?}>}
 */
function detectConflicts(candidate, routine) {
  const conflicts = [];
  const r = Array.isArray(routine) ? routine : [];
  const candRetinoid = hasActive(candidate, CATEGORY.RETINOID);
  const candAHA = hasActive(candidate, CATEGORY.AHA);
  const candBHA = hasActive(candidate, CATEGORY.BHA);
  const candAcid = candAHA || candBHA;
  const candBPO = hasActive(candidate, CATEGORY.BENZOYL_PEROXIDE);
  const candVitC = hasActive(candidate, CATEGORY.VITAMIN_C);

  const routineRetinoid = routineWith(r, CATEGORY.RETINOID);
  const routineAcid = routineWithAny(r, [CATEGORY.AHA, CATEGORY.BHA]);
  const routineBPO = routineWith(r, CATEGORY.BENZOYL_PEROXIDE);

  if (candRetinoid && routineRetinoid) {
    conflicts.push({
      code: 'second_retinoid',
      severity: 'high',
      message: `You already use a retinoid (${routineRetinoid.name}); two retinoids at once raises irritation risk.`,
      withProduct: routineRetinoid.name,
    });
  }

  if (candAcid && routineRetinoid) {
    conflicts.push({
      code: 'exfoliant_stack',
      severity: 'high',
      message: `Layering an exfoliating acid over your retinoid (${routineRetinoid.name}) can over-exfoliate and damage your barrier.`,
      withProduct: routineRetinoid.name,
    });
  } else if (candRetinoid && routineAcid) {
    conflicts.push({
      code: 'exfoliant_stack',
      severity: 'high',
      message: `Adding a retinoid on top of your exfoliating acid (${routineAcid.name}) can over-exfoliate and damage your barrier.`,
      withProduct: routineAcid.name,
    });
  }

  if (candAcid && routineAcid) {
    conflicts.push({
      code: 'double_exfoliant',
      severity: 'med',
      message: `You already exfoliate with ${routineAcid.name}; doubling up can irritate.`,
      withProduct: routineAcid.name,
    });
  }

  if (candBPO && routineRetinoid) {
    conflicts.push({
      code: 'bpo_retinoid',
      severity: 'med',
      message: `Benzoyl peroxide can deactivate your retinoid (${routineRetinoid.name}) and increase dryness.`,
      withProduct: routineRetinoid.name,
    });
  } else if (candRetinoid && routineBPO) {
    conflicts.push({
      code: 'bpo_retinoid',
      severity: 'med',
      message: `Your benzoyl peroxide (${routineBPO.name}) can deactivate this retinoid and increase dryness.`,
      withProduct: routineBPO.name,
    });
  }

  if (candVitC && routineRetinoid) {
    conflicts.push({
      code: 'vitc_retinoid',
      severity: 'low',
      message: `Vitamin C and your retinoid (${routineRetinoid.name}) are best used at different times of day.`,
      withProduct: routineRetinoid.name,
    });
  }

  return conflicts;
}

/**
 * Detect whether the routine already contains a product of the same type.
 * @returns {{category,withProduct}|null}
 */
function detectRedundancy(candidate, routine) {
  const r = Array.isArray(routine) ? routine : [];
  const type = candidate && candidate.inferredType;
  if (!type || type === 'unknown') return null;
  const match = r.find((p) => p && p.inferredType === type);
  if (!match) return null;
  return { category: type, withProduct: match.name };
}

/**
 * Score how well the candidate fits the user's goal(s).
 * @returns {{score:number, beneficial:string[], label:string}}
 */
function goalFit(candidate, goals) {
  const list = Array.isArray(goals) ? goals.filter(Boolean) : [];
  const benefitSet = new Set();
  for (const g of list) {
    for (const c of GOAL_BENEFITS[g] || []) benefitSet.add(c);
  }
  const actives = (candidate && candidate.actives) || [];
  const beneficial = actives.filter((a) => benefitSet.has(a));
  const score = beneficial.length === 0 ? 0 : Math.min(100, 40 + beneficial.length * 30);

  let label;
  if (score === 0) label = list.length ? 'Limited fit' : 'No goal set';
  else if (score >= 100) label = 'Excellent fit';
  else if (score >= 50) label = 'Good fit';
  else label = 'Some benefit';

  return { score, beneficial, label };
}

/**
 * Sensitivity / irritation flags for the candidate alone.
 * @returns {Array<{code,severity,message}>}
 */
function sensitivityFlags(candidate, profile) {
  const flags = [];
  if (candidate && candidate.hasFragrance) {
    flags.push({
      code: 'fragrance',
      severity: 'low',
      message: 'Contains fragrance, which can irritate sensitive or reactive skin.',
    });
  }
  const actives = (candidate && candidate.actives) || [];
  const strongIrritants = [CATEGORY.RETINOID, CATEGORY.AHA, CATEGORY.BHA, CATEGORY.BENZOYL_PEROXIDE].filter((c) => actives.includes(c));
  if (strongIrritants.length >= 2) {
    flags.push({
      code: 'irritant_stack',
      severity: 'med',
      message: 'This product itself combines multiple strong actives — introduce it slowly.',
    });
  }
  if (profile && typeof profile.menstrual_status === 'string' && /pregnan/i.test(profile.menstrual_status) && actives.includes(CATEGORY.RETINOID)) {
    flags.push({
      code: 'retinoid_pregnancy',
      severity: 'high',
      message: 'Retinoids are generally avoided during pregnancy — check with your clinician first.',
    });
  }
  return flags;
}

/**
 * Combine every signal into a final verdict.
 * @returns {{verdict,score,headline,reasons,goalFit,conflicts,redundancy,flags}}
 */
function computeVerdict({ candidate, routine, goals, profile } = {}) {
  const cand = candidate || analyzeProduct({});
  const r = Array.isArray(routine) ? routine : [];
  const g = Array.isArray(goals) ? goals.filter(Boolean) : [];

  const gf = goalFit(cand, g);
  const conflicts = detectConflicts(cand, r);
  const redundancy = detectRedundancy(cand, r);
  const flags = sensitivityFlags(cand, profile || {});

  let score = 55 + gf.score * 0.4;
  for (const c of conflicts) {
    if (c.severity === 'high') score -= 25;
    else if (c.severity === 'med') score -= 12;
    else score -= 5;
  }
  if (redundancy) score -= 8;
  // Sensitivity flags now move the score too. Fragrance keeps its own -6 special-case
  // below; every other flag is penalized generically by severity (no double-count).
  for (const f of flags) {
    if (f.code === 'fragrance') continue;
    if (f.severity === 'high') score -= 25;
    else if (f.severity === 'med') score -= 12;
    else score -= 5;
  }
  if (flags.some((f) => f.code === 'fragrance')) score -= 6;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const hasHigh = conflicts.some((c) => c.severity === 'high');
  let verdict = score >= 68 ? 'buy' : score >= 42 ? 'maybe' : 'skip';
  // A high-severity conflict OR a high-severity sensitivity flag caps a would-be buy at maybe.
  if ((hasHigh || flags.some((f) => f.severity === 'high')) && verdict === 'buy') verdict = 'maybe';

  // Reasons.
  const reasons = [];
  if (gf.beneficial.length > 0 && g.length > 0) {
    reasons.push({ kind: 'goal', tone: 'good', text: `Targets your ${goalLabel(g[0])} goal (${gf.beneficial.join(', ')}).` });
  } else if (g.length > 0) {
    reasons.push({ kind: 'goal', tone: 'warn', text: `Doesn't directly target your ${goalLabel(g[0])} goal.` });
  } else {
    reasons.push({ kind: 'neutral', tone: 'warn', text: 'No skin goal set — judged on routine fit only.' });
  }
  for (const c of conflicts) {
    reasons.push({ kind: 'conflict', tone: c.severity === 'high' ? 'bad' : 'warn', text: c.message });
  }
  if (redundancy) {
    reasons.push({
      kind: 'redundancy',
      tone: 'warn',
      text: `You already own a ${redundancy.category}${redundancy.withProduct ? ` (${redundancy.withProduct})` : ''}.`,
    });
  }
  for (const f of flags) {
    reasons.push({ kind: 'flag', tone: 'warn', text: f.message });
  }

  // Headline.
  let headline;
  const secondRetinoid = conflicts.find((c) => c.code === 'second_retinoid');
  if (hasHigh) {
    headline = secondRetinoid
      ? 'You already use a retinoid — adding this risks irritation.'
      : 'This stacks strong actives you already use — high irritation risk.';
  } else if (verdict === 'buy') {
    headline = g.length > 0 ? `Great fit for your ${goalLabel(g[0])} goal.` : 'Solid addition to your routine.';
  } else if (verdict === 'maybe') {
    headline = redundancy
      ? `You already own a ${redundancy.category} — only worth it as an upgrade.`
      : "Could work, but it's a modest fit for your routine.";
  } else {
    headline = 'Limited fit; you can skip this.';
  }

  return { verdict, score, headline, reasons, goalFit: gf, conflicts, redundancy, flags };
}

module.exports = {
  CATEGORY,
  categorizeIngredient,
  analyzeProduct,
  detectConflicts,
  detectRedundancy,
  goalFit,
  sensitivityFlags,
  computeVerdict,
};
