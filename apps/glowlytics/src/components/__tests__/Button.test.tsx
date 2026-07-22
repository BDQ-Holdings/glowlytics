import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { BorderRadius, FontFamily, FontSize, Glow } from '../../constants/theme';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with the given title', () => {
    const { getByText } = render(
      <Button title="Click Me" onPress={() => {}} />
    );
    expect(getByText('Click Me')).toBeTruthy();
  });

  it('renders the canonical solid-ink primary pill with large sizing', () => {
    const { getByTestId, getByText } = render(
      <Button title="Primary" onPress={() => {}} size="lg" />
    );

    const shell = getByTestId('button-shell-primary');
    expect(shell.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          borderRadius: BorderRadius.full,
          overflow: 'hidden',
        }),
        expect.objectContaining({ backgroundColor: Glow.palette.ink }),
      ])
    );
    expect(getByText('Primary').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fontFamily: FontFamily.sansSemiBold,
          letterSpacing: 0.3,
        }),
        expect.objectContaining({
          color: Glow.palette.surface,
          fontSize: FontSize.lg,
        }),
      ])
    );
  });

  it('uses the muted disabled fill', () => {
    const { getByTestId, getByText } = render(
      <Button title="Disabled primary" onPress={() => {}} disabled />
    );

    expect(getByTestId('button-shell-primary').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: Glow.palette.glow + '55' }),
      ])
    );
    expect(getByText('Disabled primary').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: Glow.palette.muted }),
      ])
    );
  });

  it('renders the glow (accent2) shutter CTA', () => {
    const { getByTestId } = render(
      <Button title="Take your first read" onPress={() => {}} variant="glow" />
    );
    expect(getByTestId('button-shell-glow').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: Glow.palette.accent2 }),
      ])
    );
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

  it('renders secondary variant with the glow hairline', () => {
    const { getByTestId, getByText } = render(
      <Button title="Secondary" onPress={() => {}} variant="secondary" />
    );
    expect(getByText('Secondary')).toBeTruthy();
    expect(getByTestId('button-shell-secondary').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ borderColor: Glow.palette.glow, borderWidth: 1.5 }),
      ])
    );
  });

  it('renders ghost variant', () => {
    const { getByText } = render(
      <Button title="Ghost" onPress={() => {}} variant="ghost" />
    );
    expect(getByText('Ghost')).toBeTruthy();
  });
});
