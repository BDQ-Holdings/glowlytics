import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { DayPage } from '../DayPage';
import type { DayEntry } from '../dayModel';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

const mockedRouter = jest.requireMock('expo-router') as { router: { push: jest.Mock } };

jest.mock('../FacialStructure', () => ({
  FacialStructure: () => null,
}));

jest.mock('../../glow/GlowIcons', () => ({
  GlowIcon: () => null,
  GlowSpark: () => null,
}));

jest.mock('../../glow/GlowPrimitives', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    BreathingGlow: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    SectionHead: ({ title }: { title: string }) => <Text>{title}</Text>,
  };
});

jest.mock('../../../store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const day: DayEntry = {
  date: '2026-06-28',
  day: 'Sun',
  d: 28,
  m: 'Jun',
  weekday: 'Sunday',
  isToday: false,
  hasScan: true,
  score: 82,
  delta: 3,
  summary: 'Looking steady',
  note: 'Hydration improved',
  outputIndex: 0,
};

const mockState = {
  modelOutputs: [],
  patterns: [
    {
      id: 'pattern-123',
      type: 'driver_correlation',
      signal: 'hydration',
      driver: 'sleep_total_minutes',
      driverLabel: 'Sleep',
      confidence: 'strong',
      correlationCoefficient: 0.7,
      sampleSize: 8,
      lagDays: 0,
      insightText: 'Sleep is tracking with hydration',
      detailText: 'Better sleep has coincided with higher hydration scores.',
      chartData: [],
      detectedAt: '2026-06-28T00:00:00.000Z',
      firstSeenAt: '2026-06-28T00:00:00.000Z',
      isPredicted: false,
    },
  ],
  ritualCompletions: {},
  products: [],
  getStreak: () => 4,
};

describe('DayPage evidence CTA', () => {
  beforeEach(() => mockedRouter.router.push.mockClear());

  it('opens the pattern evidence screen when pressed', () => {
    const { getByText } = render(
      <DayPage day={day} index={0} width={390} arcSeries={[80, 82]} />,
    );

    fireEvent.press(getByText('See the evidence'));

    expect(mockedRouter.router.push).toHaveBeenCalledWith({
      pathname: '/pattern/[id]',
      params: { id: 'pattern-123' },
    });
  });
});
