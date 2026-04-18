import { Platform } from 'react-native';

export const Colors = {
  primary: '#3A9E8F',
  primaryLight: '#2B7D70',
  primaryDark: '#5DBCAE',
  secondary: '#6366B5',
  secondaryLight: '#4F5299',
  accent: '#3F8C7A',
  accentLight: '#6BB5A3',

  background: '#FAFAF7',
  backgroundDeep: '#F5F4F0',
  backgroundWarm: '#EDE9E3',
  backgroundRaised: '#FFFFFF',
  surface: '#F0EFEB',
  surfaceLight: '#E8E7E3',
  surfaceHighlight: '#DDD9D3',
  glass: 'rgba(255, 255, 255, 0.72)',
  glassStrong: 'rgba(255, 255, 255, 0.88)',
  surfaceOverlay: 'rgba(58, 158, 143, 0.08)',

  text: '#1C1C1E',
  textSecondary: '#48484A',
  textMuted: '#8E8E93',
  textDim: '#AEAEB2',

  success: '#34A77B',
  warning: '#C07B2A',
  error: '#D14343',
  info: '#3B7FC4',

  acne: '#E87474',      // aligned with signal inflammation (soft coral)
  sunDamage: '#E8A64C',  // aligned with signal sunDamage (warm amber)
  skinAge: '#9B7FDB',    // aligned with signal elasticity (soft lavender)

  border: 'rgba(0, 0, 0, 0.08)',
  borderStrong: 'rgba(0, 0, 0, 0.14)',
  divider: 'rgba(0, 0, 0, 0.06)',
  overlay: 'rgba(0, 0, 0, 0.35)',
  glowPrimary: 'rgba(58, 158, 143, 0.10)',
  glowSecondary: 'rgba(99, 102, 181, 0.08)',
  glowAmber: 'rgba(192, 123, 42, 0.08)',

  // Nature / earth accents
  forest: '#2D8B6E',
  moss: '#4D8A51',
  clay: '#8C7550',

  // Additional glows
  glowSage: 'rgba(52, 167, 123, 0.08)',
  glowCoral: 'rgba(209, 67, 67, 0.08)',
  glowForest: 'rgba(45, 139, 110, 0.08)',

  // Warm glass variant
  glassWarm: 'rgba(255, 248, 240, 0.82)',

  // Gradient palette (scan / analyzing dark screens)
  gradientStart: '#3D5A6E',
  gradientEarly: '#4A6B80',
  gradientMid: '#6B8799',
  gradientLate: '#2A4A5E',
  gradientEnd: '#081522',

  // Ring accent (progress rings on dark backgrounds)
  ringAccent: '#7DE7E1',
  ringAccentDim: 'rgba(125, 231, 225, 0.12)',

  // Text on dark gradients
  textOnDark: '#FFFFFF',
  textOnDarkMuted: 'rgba(255, 255, 255, 0.5)',
  textOnDarkDim: 'rgba(255, 255, 255, 0.6)',
};

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const FontSize = {
  xxs: 10,
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
  hero: 40,
  display: 52,
};

/** Shared score → color mapping. Use this everywhere — do not copy inline. */
export function scoreColor(score: number): string {
  if (score >= 75) return Colors.success;
  if (score >= 55) return Colors.primary;
  if (score >= 35) return Colors.warning;
  return Colors.error;
}

export const BorderRadius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 36,
  full: 999,
};

export const FontFamily = {
  sans: 'Switzer-Regular',
  sansMedium: 'Switzer-Medium',
  sansSemiBold: 'Switzer-Bold',
  sansBold: 'Switzer-Bold',
  serif: 'Switzer-Regular',
  serifBold: 'Switzer-Bold',
};

export const Shadows = {
  glow: Platform.select({
    ios: {
      shadowColor: '#3A9E8F',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: {
      elevation: 6,
    },
    default: {
      shadowColor: '#3A9E8F',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
  }),
  card: Platform.select({
    ios: {
      shadowColor: 'rgba(0,0,0,0.08)',
      shadowOpacity: 1,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 4 },
    },
    android: {
      elevation: 4,
    },
    default: {
      shadowColor: 'rgba(0,0,0,0.08)',
      shadowOpacity: 1,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 4 },
    },
  }),
};

export const Motion = {
  fast: 140,
  base: 220,
  slow: 320,
  graceful: 600,
  dramatic: 800,
  breathe: 2000,
};

/**
 * 3-tier surface hierarchy to break visual monotony.
 *
 * hero     — Primary cards (score, action). Solid white, elevated shadow, no border.
 * standard — Default cards (info, metrics). Glass + border.
 * recessed — Secondary metadata, utility. Tinted bg, no border, low weight.
 */
export const Surfaces = {
  hero: {
    backgroundColor: Colors.backgroundRaised,
    borderRadius: BorderRadius.xxl,
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(0,0,0,0.10)',
        shadowOpacity: 1,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 6 },
      default: {
        shadowColor: 'rgba(0,0,0,0.10)',
        shadowOpacity: 1,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
      },
    }),
  },
  standard: {
    backgroundColor: Colors.glass,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recessed: {
    backgroundColor: Colors.surfaceOverlay,
    borderRadius: BorderRadius.lg,
  },
} as const;
