import type { ProductEntry } from '../types';
import { localDateStr } from '../utils/localDate';

export type RitualSection = 'morning' | 'evening' | 'allday';

export interface RitualStep {
  id: string;
  title: string;
  subtitle?: string;
  time: string;
  section: RitualSection;
  source: 'product' | 'habit';
}

const SUNSCREEN_HINTS = ['spf', 'sunscreen', 'sun screen', 'sun protect', 'mineral sun'];

function looksLikeSunscreen(p: ProductEntry): boolean {
  const hay = `${p.product_name} ${p.brand ?? ''}`.toLowerCase();
  return SUNSCREEN_HINTS.some((h) => hay.includes(h));
}

function isActive(p: ProductEntry, todayStr: string): boolean {
  if (!p.end_date) return true;
  return p.end_date >= todayStr;
}

/**
 * Build today's ritual from the user's shelf.
 *
 * Order: morning products → SPF (if no sunscreen on shelf) → water → evening products.
 * Products tagged `both` appear once in the morning and once in the evening with
 * distinct step IDs so each can be checked off independently.
 */
export function buildRitualSteps(products: ProductEntry[]): RitualStep[] {
  const today = localDateStr(new Date());
  const active = products.filter((p) => isActive(p, today));

  const morning = active.filter((p) => p.usage_schedule === 'AM' || p.usage_schedule === 'both');
  const evening = active.filter((p) => p.usage_schedule === 'PM' || p.usage_schedule === 'both');
  const hasSunscreen = active.some(looksLikeSunscreen);

  const steps: RitualStep[] = [];

  morning.forEach((p) => {
    steps.push({
      id: `product:${p.user_product_id}:am`,
      title: p.product_name,
      subtitle: p.brand,
      time: '7:00 AM',
      section: 'morning',
      source: 'product',
    });
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
    steps.push({
      id: `product:${p.user_product_id}:pm`,
      title: p.product_name,
      subtitle: p.brand,
      time: '9:30 PM',
      section: 'evening',
      source: 'product',
    });
  });

  return steps;
}

export function ritualStepDone(
  completions: Record<string, Record<string, boolean>> | undefined,
  stepId: string,
  dateStr: string = localDateStr(new Date()),
): boolean {
  return Boolean(completions?.[dateStr]?.[stepId]);
}
