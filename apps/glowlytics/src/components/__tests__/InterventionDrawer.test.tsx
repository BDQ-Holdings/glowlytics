import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { InterventionDrawer } from '../InterventionDrawer';
import type { InterventionBundle } from '../../types';

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

const bundle: InterventionBundle = {
  lifestyle: [
    {
      id: 'daily_spf',
      tier: 'lifestyle',
      title: 'Daily broad-spectrum SPF',
      body: 'UV is the largest extrinsic driver of dermal-elastin loss.',
    },
  ],
  pharmacological: [],
  interventional: [],
  procedural_disclaimer: '',
};

describe('InterventionDrawer', () => {
  it('keeps clinical citations reachable behind a collapsed Sources disclosure', () => {
    const { getByText, queryByText, getAllByText } = render(<InterventionDrawer bundle={bundle} />);

    // Collapsed by default: summary chip present, links hidden.
    expect(getByText('Sources (3)')).toBeTruthy();
    expect(queryByText('AAD Sunscreen Guidance')).toBeNull();
    expect(queryByText('Open source')).toBeNull();

    // Expands to reveal the reachable citations (App Review 1.4.1).
    fireEvent.press(getByText('Sources (3)'));
    expect(getByText('AAD Sunscreen Guidance')).toBeTruthy();
    expect(getAllByText('Open source').length).toBeGreaterThan(0);
  });
});
