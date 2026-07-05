import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

const mockPush = jest.fn();
const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);

interface ProfileStoreState {
  user: { created_at?: string } | null;
  dailyRecords: unknown[];
  products: unknown[];
  modelOutputs: Array<{ signal_scores?: Record<string, number> }>;
  getStreak: () => number;
}

let mockState: ProfileStoreState;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({ user: { firstName: 'Ada', primaryEmailAddress: { emailAddress: 'ada@example.com' } } }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-linear-gradient', () => {
  const ReactLib = require('react');
  const { View: NativeView } = require('react-native');
  return {
    LinearGradient: (props: { children?: React.ReactNode }) => ReactLib.createElement(NativeView, props, props.children),
  };
});

jest.mock('../../../src/components/FocusFade', () => {
  const ReactLib = require('react');
  const { View: NativeView } = require('react-native');
  return {
    FocusFade: ({ children }: { children?: React.ReactNode }) => ReactLib.createElement(NativeView, null, children),
  };
});

jest.mock('../../../src/components/glow/GlowPrimitives', () => {
  const ReactLib = require('react');
  const { Text: NativeText, View: NativeView } = require('react-native');
  return {
    FadeUp: ({ children }: { children?: React.ReactNode }) => ReactLib.createElement(NativeView, null, children),
    SectionHead: ({ title }: { title: string }) => ReactLib.createElement(NativeText, null, title),
  };
});

jest.mock('../../../src/components/glow/GlowIcons', () => {
  const ReactLib = require('react');
  const { View: NativeView } = require('react-native');
  return {
    GlowIcon: () => ReactLib.createElement(NativeView),
  };
});

jest.mock('../../../src/services/skinInsights', () => ({
  buildOverallSkinInsight: () => ({ score: 0 }),
  getLatestDailyForOutput: () => null,
}));

jest.mock('../../../src/services/ritual', () => ({
  activeProducts: (products: unknown[]) => products,
}));

jest.mock('../../../src/store/useStore', () => ({
  useStore: (selector: (state: ProfileStoreState) => unknown) => selector(mockState),
}));

const Profile = require('../profile').default as React.ComponentType;

const EXPECTED_SETTINGS_ROUTES = [
  ['Skin profile', '/settings/skin-profile'],
  ['Notifications', '/settings/notifications'],
  ['Privacy & data', '/settings/privacy'],
  ['Appearance', '/settings/appearance'],
  ['Export your data', '/settings/export'],
  ['Help & feedback', '/settings/help'],
  ['Clinical sources', '/settings/clinical-sources'],
  ['About', '/settings/about'],
] as const;

beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    user: { created_at: '2024-01-15T00:00:00.000Z' },
    dailyRecords: [],
    products: [],
    modelOutputs: [],
    getStreak: () => 0,
  };
});

describe('Profile settings rows', () => {
  it('omits the redundant all-settings entry while preserving distinct destination rows', () => {
    const { getByText, queryByText } = render(<Profile />);

    expect(queryByText('All settings')).toBeNull();

    for (const [label, route] of EXPECTED_SETTINGS_ROUTES) {
      fireEvent.press(getByText(label));
      expect(mockPush).toHaveBeenLastCalledWith(route);
    }

    const pushedRoutes = mockPush.mock.calls.map(([route]) => route);
    expect(new Set(pushedRoutes).size).toBe(EXPECTED_SETTINGS_ROUTES.length);
  });

  it('opens the OS settings for camera & photos instead of a dead in-app route', () => {
    const { getByText } = render(<Profile />);

    fireEvent.press(getByText('Camera & photos'));

    // The old /settings/camera route file was removed — a push there 404s.
    expect(openSettingsSpy).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalledWith('/settings/camera');
  });
});
