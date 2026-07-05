// StreakCard grammar: a 1-day streak must not render "1 ... mornings in a row".
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));
jest.mock('uuid', () => ({ v4: () => 'test-id' }));
jest.mock('react-native-get-random-values', () => ({}));
// useStore transitively imports react-native-purchases (untranspiled ESM) via
// the subscription service — mock it like subscription.test.ts does.
jest.mock('react-native-purchases', () => ({
  setLogLevel: jest.fn(),
  configure: jest.fn(),
  logIn: jest.fn(),
  logOut: jest.fn(),
  getCustomerInfo: jest.fn(),
  getOfferings: jest.fn(),
  restorePurchases: jest.fn(),
  addCustomerInfoUpdateListener: jest.fn(),
  LOG_LEVEL: { ERROR: 0 },
}));
jest.mock('react-native-purchases-ui', () => ({
  presentPaywallIfNeeded: jest.fn(),
  presentCustomerCenter: jest.fn(),
  PAYWALL_RESULT: { PURCHASED: 'PURCHASED', RESTORED: 'RESTORED', CANCELLED: 'CANCELLED', ERROR: 'ERROR', NOT_PRESENTED: 'NOT_PRESENTED' },
}));

import { useStore } from '../../../../store/useStore';
import { localDateStr } from '../../../../utils/localDate';
import { StreakCard } from '../StreakCard';

const day = { date: localDateStr(new Date()), isToday: true } as never;
const today = localDateStr(new Date());
const yesterday = localDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));

describe('StreakCard', () => {
  it('uses singular copy for a 1-day streak', () => {
    useStore.setState({ dailyRecords: [{ daily_id: 'd1', user_id: 'u', date: today } as never] });
    const { queryByText, getByText } = render(<StreakCard day={day} />);
    expect(queryByText(/mornings in a row/)).toBeNull();
    expect(getByText(/one morning of paying attention/i)).toBeTruthy();
  });

  it('keeps plural copy for multi-day streaks', () => {
    useStore.setState({
      dailyRecords: [
        { daily_id: 'd1', user_id: 'u', date: yesterday } as never,
        { daily_id: 'd2', user_id: 'u', date: today } as never,
      ],
    });
    const { getByText } = render(<StreakCard day={day} />);
    expect(getByText(/mornings in a row/)).toBeTruthy();
  });

  it('shrinks the streak number for shorter aspects and clamps it to one line', () => {
    useStore.setState({
      dailyRecords: [
        { daily_id: 'd1', user_id: 'u', date: yesterday } as never,
        { daily_id: 'd2', user_id: 'u', date: today } as never,
      ],
    });
    const story = render(<StreakCard day={day} aspect="story" />);
    expect(story.getByText('2')).toHaveStyle({ fontSize: 200 });
    expect(story.getByText('2')).toHaveProp('numberOfLines', 1);

    const tweet = render(<StreakCard day={day} aspect="tweet" />);
    expect(tweet.getByText('2')).toHaveStyle({ fontSize: 76 });
  });
});
