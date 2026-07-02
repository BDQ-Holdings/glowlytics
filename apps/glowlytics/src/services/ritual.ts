import type { ProductEntry } from '../types';
import { localDateStr } from '../utils/localDate';
import { categorizeProduct, sortByApplicationOrder } from './routineBuilder';

export type RitualSection = 'morning' | 'evening' | 'allday';

export interface RitualStep {
  id: string;
  title: string;
  subtitle?: string;
  time: string;
  section: RitualSection;
  source: 'product' | 'habit';
}

/** Product is on the shelf for `dateStr`, INCLUSIVE of the end date — a
 *  product removed today was still used today, so today's ritual (and all
 *  history) keeps it. removeProduct sets end_date instead of deleting. */
export function isProductActive(p: ProductEntry, dateStr: string): boolean {
  return p.start_date <= dateStr && (!p.end_date || p.end_date >= dateStr);
}

/** The shelf as the user thinks of it NOW. Every forward-looking surface
 *  (shelf tab, routine scoring, counts, recommendations, duplicate guard)
 *  must use this instead of the raw products array. STRICT end-date compare:
 *  removing a product today removes it from these surfaces immediately —
 *  only ritual history (isProductActive) keeps the inclusive semantics. */
export function activeProducts(products: ProductEntry[], dateStr: string = localDateStr()): ProductEntry[] {
  return products.filter((p) => p.start_date <= dateStr && (!p.end_date || p.end_date > dateStr));
}

function productStep(p: ProductEntry, leg: 'am' | 'pm'): RitualStep {
  return {
    id: `product:${p.user_product_id}:${leg}`,
    title: p.product_name,
    subtitle: p.brand,
    time: leg === 'am' ? '7:00 AM' : '9:30 PM',
    section: leg === 'am' ? 'morning' : 'evening',
    source: 'product',
  };
}

function historicalProductStep(stepId: string, products: ProductEntry[]): RitualStep | null {
  const [, productId, leg] = stepId.split(':');
  if ((leg !== 'am' && leg !== 'pm') || !productId) return null;
  const product = products.find((p) => p.user_product_id === productId);
  if (product) return productStep(product, leg);
  return {
    id: stepId,
    title: 'Previously used product',
    time: leg === 'am' ? '7:00 AM' : '9:30 PM',
    section: leg === 'am' ? 'morning' : 'evening',
    source: 'product',
  };
}

/**
 * Build the ritual for a specific local date from the user's shelf.
 *
 * Order: morning products → SPF (if no sunscreen on that date's shelf) → water → evening products.
 * Products tagged `both` appear once in the morning and once in the evening with
 * distinct step IDs so each can be checked off independently.
 */
export function buildRitualSteps(
  products: ProductEntry[],
  dateStr: string,
  recordedStepIds: string[] = [],
): RitualStep[] {
  const active = products.filter((p) => isProductActive(p, dateStr));

  const morning = sortByApplicationOrder(
    active.filter((p) => p.usage_schedule === 'AM' || p.usage_schedule === 'both'),
    'AM',
  ).map((p) => p.product);
  const evening = sortByApplicationOrder(
    active.filter((p) => p.usage_schedule === 'PM' || p.usage_schedule === 'both'),
    'PM',
  ).map((p) => p.product);
  const hasSunscreen = active.some((p) => categorizeProduct(p).category === 'spf');

  const steps: RitualStep[] = [];

  morning.forEach((p) => {
    steps.push(productStep(p, 'am'));
  });

  if (!hasSunscreen) {
    steps.push({
      id: 'habit:spf',
      title: 'SPF 50',
      subtitle: 'Two finger lengths, neck included',
      time: '7:10 AM',
      section: 'morning',
      source: 'habit',
    });
  }

  steps.push({
    id: 'habit:water',
    title: 'Water, 8 glasses',
    subtitle: 'Hydration helps the barrier',
    time: 'All day',
    section: 'allday',
    source: 'habit',
  });

  evening.forEach((p) => {
    steps.push(productStep(p, 'pm'));
  });

  const seen = new Set(steps.map((step) => step.id));
  for (const stepId of recordedStepIds) {
    if (seen.has(stepId)) continue;
    const restored = stepId.startsWith('product:')
      ? historicalProductStep(stepId, products)
      : null;
    if (!restored) continue;
    steps.push(restored);
    seen.add(stepId);
  }

  return steps;
}

export function ritualStepDone(
  completions: Record<string, Record<string, boolean>> | undefined,
  stepId: string,
  dateStr: string = localDateStr(new Date()),
): boolean {
  return Boolean(completions?.[dateStr]?.[stepId]);
}

/**
 * Which routine section the Today mini should surface for a given local hour.
 * Before 17:00 we show the morning routine; from 17:00 on, the evening one.
 * `allday` habits are shown alongside whichever section is active — callers
 * OR this result against 'allday' when filtering.
 */
export function ritualSectionForHour(hour: number): 'morning' | 'evening' {
  return hour < 17 ? 'morning' : 'evening';
}
