import React from 'react';
import { render } from '@testing-library/react-native';
import { ScoreTile } from '../ScoreTile';

// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => <View {...props} />,
    Svg: (props: any) => <View {...props} />,
    Circle: (props: any) => <View {...props} />,
    Polyline: (props: any) => <View {...props} />,
  };
});

describe('ScoreTile', () => {
  it('renders the score value', () => {
    const { getByText } = render(
      <ScoreTile label="Acne" score={45} color="#D15A57" />
    );
    expect(getByText('45')).toBeTruthy();
  });

  it('renders the label', () => {
    const { getByText } = render(
      <ScoreTile label="Sun Damage" score={30} color="#B88C3E" />
    );
    expect(getByText('Sun Damage')).toBeTruthy();
  });

  it('displays positive delta', () => {
    const { getByText } = render(
      <ScoreTile label="Acne" score={50} delta={5} color="#D15A57" />
    );
    expect(getByText('+5')).toBeTruthy();
  });

  it('displays negative delta', () => {
    const { getByText } = render(
      <ScoreTile label="Acne" score={40} delta={-3} color="#D15A57" />
    );
    expect(getByText('-3')).toBeTruthy();
  });

  it('displays zero delta', () => {
    const { getByText } = render(
      <ScoreTile label="Acne" score={40} delta={0} color="#D15A57" />
    );
    expect(getByText('0')).toBeTruthy();
  });

  it('shows correct status label based on score', () => {
    const { getByText } = render(
      <ScoreTile label="Acne" score={20} color="#D15A57" />
    );
    expect(getByText('Calm')).toBeTruthy();
  });

  it('shows Elevated for higher scores', () => {
    const { getByText } = render(
      <ScoreTile label="Acne" score={60} color="#D15A57" />
    );
    expect(getByText('Elevated')).toBeTruthy();
  });

  it('shows custom status label when provided', () => {
    const { getByText } = render(
      <ScoreTile label="Acne" score={50} color="#D15A57" statusLabel="Custom" />
    );
    expect(getByText('Custom')).toBeTruthy();
  });
});
