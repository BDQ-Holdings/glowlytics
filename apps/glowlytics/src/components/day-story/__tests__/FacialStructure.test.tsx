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

// Mutable so each test can seed the model-output history the card reads.
const mockState: { modelOutputs: unknown[] } = { modelOutputs: [] };

describe('FacialStructure — clickable card', () => {
  beforeEach(() => {
    mockedRouter.router.push.mockClear();
    mockState.modelOutputs = [];
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
});
