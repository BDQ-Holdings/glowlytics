import React, { useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { GlowPalette } from '../../constants/theme';

/**
 * Product thumbnail — the design's `Bottle`. Renders the real `image_url` when
 * the backend supplies one, otherwise a soft tinted gradient placeholder
 * (`linear-gradient(160deg, tone, surface)` in the design) bounded by the glow
 * border. Pure presentational.
 */
export interface ProductThumbProps {
  imageUrl?: string | null;
  tone?: string;
  w?: number;
  h?: number;
  r?: number;
  palette: GlowPalette;
}

export const ProductThumb: React.FC<ProductThumbProps> = ({
  imageUrl,
  tone,
  w = 52,
  h = 68,
  r = 10,
  palette,
}) => {
  // A truthy imageUrl can still 404 / expire; without this the <Image> renders
  // a blank box. On the native onError we flip to the gradient placeholder.
  const [errored, setErrored] = useState(false);

  const base = {
    width: w,
    height: h,
    borderRadius: r,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glow,
  } as const;

  if (imageUrl && !errored) {
    return (
      <Image
        testID="product-thumb-image"
        source={{ uri: imageUrl }}
        style={[base, { backgroundColor: palette.glow }]}
        resizeMode="cover"
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <LinearGradient
      testID="product-thumb-fallback"
      colors={[tone ?? palette.glow, palette.surface]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={base}
    />
  );
};
