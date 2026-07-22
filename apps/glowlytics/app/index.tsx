import React from 'react';
import { View, useColorScheme } from 'react-native';
import { Glow, GlowPalettesDark } from '../src/constants/theme';

/**
 * Bridge screen — shown for a single frame while AuthRedirector
 * navigates to auth/onboarding/tabs. Matches the scheme-aware rose splash
 * background so the one-frame bridge is seamless in both light and dark.
 */
export default function Index() {
  const scheme = useColorScheme();
  const bg = scheme === 'dark' ? GlowPalettesDark.rose.bg : Glow.palette.bg;
  return <View style={{ flex: 1, backgroundColor: bg }} />;
}
