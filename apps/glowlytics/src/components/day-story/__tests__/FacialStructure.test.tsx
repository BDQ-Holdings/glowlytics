import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { FacialStructure } from '../FacialStructure';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

const mockedRouter = jest.requireMock('expo-router') as { router: { push: jest.Mock } };

// Stub the SVG wireframe + icon + section head so the test exercises only the
// card's press behaviour, not native svg/vector-icon rendering.
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Stub = ({ children }: { children?: unknown }) =>
    ReactLib.createElement(View, null, children ?? null);
  return {
    __esModule: true,
    default: Stub,
    Svg: Stub, Circle: Stub, Line: Stub, Path: Stub,
    G: Stub, Polygon: Stub, Defs: Stub, ClipPath: Stub,
  };
});

jest.mock('../../glow/GlowIcons', () => ({
  GlowIcon: () => null,
  GlowSpark: () => null,
}));

jest.mock('../../glow/GlowPrimitives', () => {
  const ReactLib = require('react');
  const { Text } = require('react-native');
  return {
    SectionHead: ({ title }: { title: string }) => ReactLib.createElement(Text, null, title),
  };
});

jest.mock('../../../store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) => selector(mockState),
}));

const mockTrueDepthSupported = jest.fn<boolean, []>(() => false);
jest.mock('../../../hooks/useTrueDepthSupported', () => ({
  useTrueDepthSupported: () => mockTrueDepthSupported(),
}));

// Mutable so each test can seed the model-output history the card reads.
const mockState: { modelOutputs: unknown[] } = { modelOutputs: [] };

describe('FacialStructure — clickable card', () => {
  beforeEach(() => {
    mockedRouter.router.push.mockClear();
    mockState.modelOutputs = [];
    // Default: non-TrueDepth device (native module unlinked) — the estimate
    // badge's "scan on a Face ID device" CTA is meaningful there.
    mockTrueDepthSupported.mockReturnValue(false);
  });

  it('uses facial_index for the face ratio cell and marks fallback thirds as estimated', () => {
    mockState.modelOutputs = [
      {
        output_id: 'o1',
        daily_id: 'day-with-bone',
        bone_structure: {
          status: 'ok',
          estimate: true,
          harmony: 82,
          domain_scores: { symmetry: 91 },
          scored_metrics: { zygomatic_projection: 82, gonial_angle: 62 },
          metrics: {
            facial_index: { value: 1.61 },
            ipd_ratio: { value: 2.08 },
          },
          dominant_driver: 'midface',
        },
      },
    ];

    const { getByText, getAllByText } = render(<FacialStructure onShare={jest.fn()} />);

    expect(getByText('FACE RATIO')).toBeTruthy();
    expect(getByText('1.61')).toBeTruthy();
    expect(getByText('Symmetry 91/100')).toBeTruthy();
    expect(getByText(/Estimated from a reference model/i)).toBeTruthy();
    expect(getAllByText(/estimate/i).length).toBeGreaterThanOrEqual(1);
  });

  it('navigates with the dailyId of the bone read the card is displaying', () => {
    // The OLDER output carries the bone read shown on the card; a NEWER
    // skin-only output has no bone_structure. Navigating param-less would land
    // bone-results on that newer (empty) output — so the card must pass the
    // owning output's daily_id.
    mockState.modelOutputs = [
      { output_id: 'o1', daily_id: 'day-with-bone', bone_structure: { status: 'ok' } },
      { output_id: 'o2', daily_id: 'day-skin-only' },
    ];

    const { getByLabelText } = render(<FacialStructure onShare={jest.fn()} />);

    fireEvent.press(getByLabelText('Open your full facial structure read'));

    expect(mockedRouter.router.push).toHaveBeenCalledWith({
      pathname: '/scan/bone-results',
      params: { dailyId: 'day-with-bone' },
    });
  });

  it('navigates without a dailyId when no bone read exists yet', () => {
    // modelOutputs empty (default) → keep the param-less path so bone-results
    // shows its own "awaiting scan" empty state.
    const { getByLabelText } = render(<FacialStructure onShare={jest.fn()} />);

    fireEvent.press(getByLabelText('Open your full facial structure read'));

    expect(mockedRouter.router.push).toHaveBeenCalledWith('/scan/bone-results');
  });

  it('fires onShare and does NOT navigate when the Share button is tapped', () => {
    const onShare = jest.fn();
    const { getByLabelText } = render(<FacialStructure onShare={onShare} />);

    fireEvent.press(getByLabelText('Share my face read'));

    expect(onShare).toHaveBeenCalledTimes(1);
    expect(mockedRouter.router.push).not.toHaveBeenCalled();
  });

  it('hides the estimate badge on a TrueDepth device (user is already on a Face ID device)', () => {
    mockTrueDepthSupported.mockReturnValue(true);
    mockState.modelOutputs = [
      {
        output_id: 'o1',
        daily_id: 'day-with-bone',
        bone_structure: {
          status: 'ok',
          estimate: true,
          harmony: 82,
          domain_scores: { symmetry: 91 },
          scored_metrics: { zygomatic_projection: 82, gonial_angle: 62 },
          metrics: {
            facial_index: { value: 1.61 },
            ipd_ratio: { value: 2.08 },
          },
          dominant_driver: 'midface',
        },
      },
    ];

    const { getByText, queryByText } = render(<FacialStructure onShare={jest.fn()} />);

    // The read still renders; only the "scan on a Face ID device" CTA is gone.
    expect(getByText('FACE RATIO')).toBeTruthy();
    expect(queryByText(/Estimated from a reference model/i)).toBeNull();
  });
});
