import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { BorderRadius, Colors, FontFamily, FontSize } from '../../constants/theme';
import { Button } from '../Button';

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return {
    LinearGradient: (props: any) => <View {...props} />,
  };
});

describe('Button', () => {
  it('renders with the given title', () => {
    const { getByText } = render(
      <Button title="Click Me" onPress={() => {}} />
    );
    expect(getByText('Click Me')).toBeTruthy();
  });

  it('renders the canonical primary gradient and large sizing', () => {
    const { getByTestId, getByText } = render(
      <Button title="Primary" onPress={() => {}} size="lg" />
    );

    expect(getByTestId('button-primary-gradient').props.colors).toEqual([
      '#3A9E8F',
      '#2B8C7E',
      '#258070',
    ]);
    expect(getByTestId('button-primary-gradient').props.start).toEqual({ x: 0, y: 0 });
    expect(getByTestId('button-primary-gradient').props.end).toEqual({ x: 1, y: 1 });
    expect(getByTestId('button-primary-gradient').props.style).toEqual(
      expect.objectContaining({
        borderRadius: BorderRadius.full,
        overflow: 'hidden',
      })
    );
    expect(getByText('Primary').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fontFamily: FontFamily.sansSemiBold,
          letterSpacing: 0.3,
        }),
        expect.objectContaining({
          color: Colors.textOnDark,
          fontSize: FontSize.lg,
        }),
      ])
    );
  });

  it('uses the disabled primary fill', () => {
    const { getByTestId } = render(
      <Button title="Disabled primary" onPress={() => {}} disabled />
    );

    expect(getByTestId('button-primary-gradient').props.colors).toEqual([
      Colors.surfaceHighlight,
      Colors.surface,
    ]);
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button title="Press" onPress={onPress} />
    );
    fireEvent.press(getByText('Press'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button title="Disabled" onPress={onPress} disabled />
    );
    fireEvent.press(getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders secondary variant without gradient', () => {
    const { getByText } = render(
      <Button title="Secondary" onPress={() => {}} variant="secondary" />
    );
    expect(getByText('Secondary')).toBeTruthy();
  });

  it('renders ghost variant', () => {
    const { getByText } = render(
      <Button title="Ghost" onPress={() => {}} variant="ghost" />
    );
    expect(getByText('Ghost')).toBeTruthy();
  });
});
