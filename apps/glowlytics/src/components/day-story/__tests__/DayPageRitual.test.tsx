import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { DayPage } from '../DayPage';
import type { DayEntry } from '../dayModel';
import type { ProductEntry, UsageSchedule } from '../../../types';
import type * as RitualModule from '../../../services/ritual';
import { buildRitualSteps } from '../../../services/ritual';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

jest.mock('../FacialStructure', () => ({ FacialStructure: () => null }));

jest.mock('../../../services/ritual', () => {
  const actual = jest.requireActual<typeof RitualModule>('../../../services/ritual');
  return { __esModule: true, ...actual, buildRitualSteps: jest.fn(actual.buildRitualSteps) };
});

jest.mock('../../glow/GlowIcons', () => ({
  GlowIcon: () => null,
  GlowSpark: () => null,
}));

jest.mock('../../glow/GlowPrimitives', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    BreathingGlow: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    // Render both title AND hint so tests can assert the x/y count.
    SectionHead: ({ title, hint }: { title: string; hint?: string }) => (
      <View>
        <Text>{title}</Text>
        {hint != null && <Text>{hint}</Text>}
      </View>
    ),
  };
});

const toggleRitualStep = jest.fn();
const actualRitual = jest.requireActual<typeof RitualModule>('../../../services/ritual');
const mockedBuildRitualSteps = buildRitualSteps as jest.MockedFunction<typeof buildRitualSteps>;

jest.mock('../../../store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) => selector(mockState),
}));

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

const mockState = {
  modelOutputs: [],
  patterns: [],
  ritualCompletions: {},
  toggleRitualStep,
  getStreak: () => 4,
  products: [
    product('p1', 'Byoma Cleanser', 'AM'),
    product('p2', 'Vitamin C Serum', 'AM'),
    product('p3', 'Daily Moisturizer', 'AM'),
    product('p4', 'Eye Cream', 'AM'),
    product('p5', 'Retinol Night Serum', 'PM'),
  ],
};

const day: DayEntry = {
  date: '2026-06-28',
  day: 'Sun',
  d: 28,
  m: 'Jun',
  weekday: 'Sunday',
  isToday: true,
  hasScan: true,
  score: 82,
  delta: 3,
  summary: 'Steady',
  note: 'Hydration improved',
  outputIndex: 0,
};

describe('DayPage ritual mini', () => {
  beforeEach(() => {
    toggleRitualStep.mockClear();
    mockedBuildRitualSteps.mockReset();
    mockedBuildRitualSteps.mockImplementation(actualRitual.buildRitualSteps);
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('renders the real morning routine (more than 3 relevant steps, no fake data) in the AM', () => {
    // 08:00 local -> morning section.
    jest.setSystemTime(new Date('2026-06-28T08:00:00'));

    const { getByText, queryByText } = render(
      <DayPage day={day} index={0} width={390} arcSeries={[80, 82]} onOpenRitual={jest.fn()} />,
    );

    // Real product names from buildRitualSteps (>3 morning product steps).
    expect(getByText('Byoma Cleanser')).toBeTruthy();
    expect(getByText('Vitamin C Serum')).toBeTruthy();
    expect(getByText('Daily Moisturizer')).toBeTruthy();
    expect(getByText('Eye Cream')).toBeTruthy();

    // Habits from the builder are present in the AM / allday view.
    expect(getByText('SPF 50')).toBeTruthy();
    expect(getByText('Water, 8 glasses')).toBeTruthy();

    // Evening-only product is NOT shown in the morning.
    expect(queryByText('Retinol Night Serum')).toBeNull();

    // No fabricated slice data: the fake index time and the `· AM` composite title are gone.
    expect(queryByText('7:05 AM')).toBeNull();
    expect(queryByText(/·\s*AM/)).toBeNull();

    // Real times from the builder are used instead.
    expect(getByText('All day')).toBeTruthy();

    // Header count reflects the 6 relevant steps (4 AM products + SPF + water), not /3.
    expect(getByText('0/6')).toBeTruthy();
    expect(queryByText(/\/3$/)).toBeNull();
  });

  it('toggles the pressed step via toggleRitualStep(step.id, day.date)', () => {
    jest.setSystemTime(new Date('2026-06-28T08:00:00'));

    const { getByText } = render(
      <DayPage day={day} index={0} width={390} arcSeries={[80, 82]} onOpenRitual={jest.fn()} />,
    );

    fireEvent.press(getByText('Byoma Cleanser'));

    expect(toggleRitualStep).toHaveBeenCalledWith('product:p1:am', '2026-06-28');
  });

  it('shows the evening routine after 17:00', () => {
    jest.setSystemTime(new Date('2026-06-28T20:00:00'));

    const { getByText, queryByText } = render(
      <DayPage day={day} index={0} width={390} arcSeries={[80, 82]} onOpenRitual={jest.fn()} />,
    );

    expect(getByText('Retinol Night Serum')).toBeTruthy();
    expect(getByText('Water, 8 glasses')).toBeTruthy(); // allday still shown
    expect(queryByText('Byoma Cleanser')).toBeNull();   // AM-only hidden in PM
    expect(queryByText('SPF 50')).toBeNull();            // AM habit hidden in PM
  });

  it('shows the full built ritual (morning AND evening) for a non-today day, ignoring the clock', () => {
    // 20:00 would collapse Today to the evening section; a past day must show all
    // sections since completions/toggles target day.date, not the current hour.
    jest.setSystemTime(new Date('2026-06-28T20:00:00'));
    const pastDay: DayEntry = { ...day, isToday: false };

    const { getByText } = render(
      <DayPage day={pastDay} index={0} width={390} arcSeries={[80, 82]} onOpenRitual={jest.fn()} />,
    );

    // Morning products + morning habit render even though it is the evening.
    expect(getByText('Byoma Cleanser')).toBeTruthy();
    expect(getByText('SPF 50')).toBeTruthy();
    // Evening product renders too — the whole ritual for that date.
    expect(getByText('Retinol Night Serum')).toBeTruthy();
    expect(getByText('Water, 8 glasses')).toBeTruthy();

    // Header count reflects the full ritual: 4 AM products + SPF + water + 1 PM.
    expect(getByText('0/7')).toBeTruthy();
  });

  it('keeps the Open full ritual affordance in the empty shelf state', () => {
    jest.setSystemTime(new Date('2026-06-28T08:00:00'));
    mockedBuildRitualSteps.mockReturnValue([]);
    const onOpenRitual = jest.fn();

    const { getByText } = render(
      <DayPage day={day} index={0} width={390} arcSeries={[80, 82]} onOpenRitual={onOpenRitual} />,
    );

    // Empty-state copy is shown...
    expect(getByText('Build your shelf')).toBeTruthy();
    // ...and the link to the full ritual is still reachable.
    fireEvent.press(getByText('Open full ritual'));
    expect(onOpenRitual).toHaveBeenCalled();
  });
});
