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

  // Rules-of-hooks regression: the `projected` useMemo used to sit AFTER the
  // `if (points.length < 2) return null` early return. When an async
  // attachBoneStructure took the card from 1 → 2 points while mounted, the
  // second render reached an extra hook and React threw "Rendered more hooks
  // than during the previous render", tripping the AppErrorBoundary. Every
  // hook is now hoisted above the early return, so the count is constant.
  it('survives a 1 → 2 point transition in the same mounted instance', () => {
    mockStoreOutputs([78]); // single bone-structure point → below threshold → null
    const { rerender, toJSON, getByText } = render(<HarmonyTrendCard />);
    expect(toJSON()).toBeNull();

    // Async attach adds a second point to the SAME mounted card.
    mockStoreOutputs([78, 82]);
    expect(() => rerender(<HarmonyTrendCard />)).not.toThrow();
    expect(getByText('82')).toBeTruthy();
  });

  it('survives an empty → populated transition in the same mounted instance', () => {
    mockStoreOutputs([]); // no points → null
    const { rerender, toJSON, getByText } = render(<HarmonyTrendCard />);
    expect(toJSON()).toBeNull();

    mockStoreOutputs([70, 80]);
    expect(() => rerender(<HarmonyTrendCard />)).not.toThrow();
    expect(getByText('80')).toBeTruthy();
  });
});
