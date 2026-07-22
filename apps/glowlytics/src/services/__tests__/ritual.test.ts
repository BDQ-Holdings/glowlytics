import { activeProducts, buildRitualSteps, isProductActive, ritualSectionForHour } from '../ritual';
import type { ProductEntry, UsageSchedule } from '../../types';

function product(id: string, name: string, usage: UsageSchedule): ProductEntry {
  return {
    user_product_id: id,
    user_id: 'u1',
    product_name: name,
    product_capture_method: 'search',
    ingredients_list: [],
    usage_schedule: usage,
    start_date: '2026-01-01',
  };
}

describe('ritualSectionForHour', () => {
  it('returns "morning" for early hours', () => {
    expect(ritualSectionForHour(8)).toBe('morning');
    expect(ritualSectionForHour(0)).toBe('morning');
    expect(ritualSectionForHour(16)).toBe('morning');
  });

  it('returns "evening" from 17:00 on', () => {
    expect(ritualSectionForHour(17)).toBe('evening');
    expect(ritualSectionForHour(20)).toBe('evening');
    expect(ritualSectionForHour(23)).toBe('evening');
  });
});

describe('buildRitualSteps sectioning', () => {
  it('sections AM / PM / both products and adds habits', () => {
    const steps = buildRitualSteps([
      product('p1', 'Gentle Cleanser', 'AM'),
      product('p2', 'Night Serum', 'PM'),
      product('p3', 'Daily Moisturizer', 'both'),
    ], '2026-01-02');

    const bySection = (s: string) => steps.filter((st) => st.section === s);

    // morning: AM product + both product (am leg) + SPF habit (no sunscreen on shelf)
    expect(bySection('morning').map((s) => s.title)).toEqual(
      expect.arrayContaining(['Gentle Cleanser', 'Daily Moisturizer', 'SPF 50']),
    );
    // evening: PM product + both product (pm leg)
    expect(bySection('evening').map((s) => s.title)).toEqual(
      expect.arrayContaining(['Night Serum', 'Daily Moisturizer']),
    );
    // allday: water habit
    expect(bySection('allday').map((s) => s.title)).toEqual(['Water, 8 glasses']);

    // `both` product yields two independently-checkable step ids
    expect(steps.find((s) => s.id === 'product:p3:am')).toBeDefined();
    expect(steps.find((s) => s.id === 'product:p3:pm')).toBeDefined();

    // real times, never the fake slice value
    expect(steps.some((s) => s.time === '7:05 AM')).toBe(false);
  });

  it('uses the shelf that was active on the requested date', () => {
    const steps = buildRitualSteps([
      { ...product('future', 'Future Serum', 'AM'), start_date: '2026-01-10' },
      { ...product('past', 'Past Cleanser', 'AM'), start_date: '2025-12-01', end_date: '2026-01-05' },
      { ...product('ended', 'Ended Toner', 'PM'), start_date: '2025-12-01', end_date: '2026-01-01' },
    ], '2026-01-04');

    expect(steps.some((s) => s.id === 'product:future:am')).toBe(false);
    expect(steps.some((s) => s.id === 'product:past:am')).toBe(true);
    expect(steps.some((s) => s.id === 'product:ended:pm')).toBe(false);
  });

  it('reconstructs recorded completion steps that are not derivable from that date shelf', () => {
    const steps = buildRitualSteps(
      [product('current', 'Current Serum', 'AM')],
      '2026-01-04',
      ['product:removed:pm', 'habit:water'],
    );

    expect(steps.find((s) => s.id === 'product:removed:pm')).toMatchObject({
      title: 'Previously used product',
      section: 'evening',
      source: 'product',
    });
    expect(steps.filter((s) => s.id === 'habit:water')).toHaveLength(1);
  });
});

describe('shelf date boundaries', () => {
  it('treats start_date and end_date as inclusive boundaries', () => {
    const starting = { ...product('s', 'Starter', 'AM'), start_date: '2026-01-04' };
    const ending = { ...product('e', 'Ender', 'AM'), start_date: '2026-01-01', end_date: '2026-01-04' };

    // Exactly on the boundary date: both are on the shelf.
    expect(isProductActive(starting, '2026-01-04')).toBe(true);
    expect(isProductActive(ending, '2026-01-04')).toBe(true);
    // One day either side.
    expect(isProductActive(starting, '2026-01-03')).toBe(false);
    expect(isProductActive(ending, '2026-01-05')).toBe(false);

    const steps = buildRitualSteps([starting, ending], '2026-01-04');
    expect(steps.some((s) => s.id === 'product:s:am')).toBe(true);
    expect(steps.some((s) => s.id === 'product:e:am')).toBe(true);
  });
});

describe('activeProducts', () => {
  it('excludes soft-removed products so forward-looking surfaces stay truthful', () => {
    const shelf = [
      product('live', 'Live Serum', 'AM'),
      { ...product('gone', 'Removed Toner', 'PM'), end_date: '2026-01-01' },
    ];
    const active = activeProducts(shelf, '2026-02-01');
    expect(active.map((p) => p.user_product_id)).toEqual(['live']);
  });

  it('drops a product removed TODAY from the shelf immediately, while today\u2019s ritual keeps it', () => {
    const removedToday = { ...product('rt', 'Removed Today', 'AM'), end_date: '2026-01-04' };

    // Forward-looking surfaces (shelf, scoring, duplicate guard): gone now.
    expect(activeProducts([removedToday], '2026-01-04')).toEqual([]);
    // Ritual history for the same date: still present — it was used today.
    expect(isProductActive(removedToday, '2026-01-04')).toBe(true);
    const steps = buildRitualSteps([removedToday], '2026-01-04');
    expect(steps.some((s) => s.id === 'product:rt:am')).toBe(true);
  });
});
