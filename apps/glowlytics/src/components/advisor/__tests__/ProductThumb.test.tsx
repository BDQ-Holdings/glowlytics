import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Glow } from '../../../constants/theme';
import { ProductThumb } from '../ProductThumb';

const palette = Glow.palette;

describe('ProductThumb', () => {
  it('renders the real image when a valid imageUrl is supplied', () => {
    const { queryByTestId } = render(
      <ProductThumb imageUrl="https://images.example/ok.png" palette={palette} />,
    );
    expect(queryByTestId('product-thumb-image')).toBeTruthy();
    expect(queryByTestId('product-thumb-fallback')).toBeNull();
  });

  it('renders the gradient placeholder when no imageUrl is supplied', () => {
    const { queryByTestId } = render(<ProductThumb palette={palette} />);
    expect(queryByTestId('product-thumb-image')).toBeNull();
    expect(queryByTestId('product-thumb-fallback')).toBeTruthy();
  });

  // B-fix: a broken/expired image URL previously left a blank box. The <Image>
  // onError must flip the thumb to the existing gradient placeholder.
  it('degrades to the gradient placeholder when the image URL fails to load', () => {
    const { getByTestId, queryByTestId } = render(
      <ProductThumb imageUrl="https://images.example/broken.png" palette={palette} />,
    );

    fireEvent(getByTestId('product-thumb-image'), 'error', {
      nativeEvent: { error: 'not found' },
    });

    expect(queryByTestId('product-thumb-image')).toBeNull();
    expect(queryByTestId('product-thumb-fallback')).toBeTruthy();
  });
});
