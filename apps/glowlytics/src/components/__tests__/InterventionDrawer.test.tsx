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

  it('defaults to the first non-empty tier and disables empty tabs with zero badges', () => {
    const proceduralOnly: InterventionBundle = {
      lifestyle: [],
      pharmacological: [],
      interventional: [
        {
          id: 'consult',
          tier: 'interventional',
          title: 'Discuss in-office options',
          body: 'A procedural consult can review fit, tradeoffs, recovery, and risks.',
        },
      ],
      procedural_disclaimer: 'Procedures require clinician review.',
    };

    const { getByText, queryByText, getByLabelText, getAllByText } = render(<InterventionDrawer bundle={proceduralOnly} />);

    expect(getByText('Discuss in-office options')).toBeTruthy();
    expect(queryByText('No lifestyle suggestions for this scan.')).toBeNull();
    expect(getByLabelText('Lifestyle tab (0 suggestions)')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
    expect(getAllByText('0')).toHaveLength(2);
    expect(getByText('Procedures require clinician review.')).toBeTruthy();
  });

  it('keeps suggestion bodies compact until a row is expanded', () => {
    const longBody = 'This row starts compact so the card stays short by default, then expands in place only when the user asks to read the full recommendation copy.';
    const compactBundle: InterventionBundle = {
      lifestyle: [
        {
          id: 'sleep',
          tier: 'lifestyle',
          title: 'Improve sleep regularity',
          body: longBody,
        },
      ],
      pharmacological: [],
      interventional: [],
      procedural_disclaimer: '',
    };

    const { getByText, getByLabelText } = render(<InterventionDrawer bundle={compactBundle} />);
    expect(getByText(longBody)).toHaveProp('numberOfLines', 2);

    fireEvent.press(getByLabelText('Expand suggestion: Improve sleep regularity'));
    expect(getByText(longBody)).not.toHaveProp('numberOfLines', 2);
  });

  it('collapses all-empty bundles to one quiet line', () => {
    const emptyBundle: InterventionBundle = {
      lifestyle: [],
      pharmacological: [],
      interventional: [],
      procedural_disclaimer: '',
    };

    const { getByText, queryByText } = render(<InterventionDrawer bundle={emptyBundle} />);

    expect(getByText('No suggestions for this scan.')).toBeTruthy();
    expect(queryByText('Sources (3)')).toBeNull();
  });
});
