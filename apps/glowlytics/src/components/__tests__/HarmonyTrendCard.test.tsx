jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../store/useStore', () => ({
  useStore: jest.fn(),
}));

import React from 'react';
import { render } from '@testing-library/react-native';
import { HarmonyTrendCard } from '../HarmonyTrendCard';
import { useStore } from '../../store/useStore';

const useStoreMock = useStore as jest.MockedFunction<typeof useStore>;

function mockStoreOutputs(scores: Array<number | null>) {
  const outputs = scores.map((s, i) => ({
    daily_id: `d${i}`,
    bone_structure: s == null ? undefined : { harmony: s },
  }));
  // useStore is called with a selector; route it through the fake store shape
  useStoreMock.mockImplementation((selector: (state: any) => any) =>
    selector({ modelOutputs: outputs }),
  );
}

beforeEach(() => {
  useStoreMock.mockReset();
});

describe('HarmonyTrendCard', () => {
  it('returns null when there are fewer than 2 scans with bone-structure data', () => {
    mockStoreOutputs([null, 78]); // only one real bone-structure entry
    const { toJSON } = render(<HarmonyTrendCard />);
    expect(toJSON()).toBeNull();
  });

  it('renders score, status, and delta when ≥2 scans exist', () => {
    mockStoreOutputs([60, 65, 70, 78]); // up across four scans
    const { getByText } = render(<HarmonyTrendCard />);
    expect(getByText('78')).toBeTruthy(); // latest
    expect(getByText('Harmony trend')).toBeTruthy();
    expect(getByText('+18 since first scan')).toBeTruthy();
  });

  it('shows "Steady" copy when delta is exactly 0', () => {
    mockStoreOutputs([70, 72, 70]); // round-trip same value
    const { getByText } = render(<HarmonyTrendCard />);
    expect(getByText(/Steady across \d+ scans/)).toBeTruthy();
  });

  it('ignores model outputs without bone-structure data', () => {
    mockStoreOutputs([null, 70, null, 80]); // two real, two skin-only
    const { getByText } = render(<HarmonyTrendCard />);
    expect(getByText('80')).toBeTruthy();
    expect(getByText('+10 since first scan')).toBeTruthy();
  });
});
