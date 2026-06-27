import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
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
  const base = {
    width: w,
    height: h,
    borderRadius: r,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.glow,
  } as const;

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[base, { backgroundColor: palette.glow }]}
        resizeMode="cover"
      />
    );
  }

  return (
    <LinearGradient
      colors={[tone ?? palette.glow, palette.surface]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={base}
    />
  );
};
