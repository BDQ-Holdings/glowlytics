/**
 * Appearance side-effects.
 *
 * The store owns the user's *intent*. This module owns how those intents
 * translate to native state (iOS alternate icon, font-scale multiplier, etc.)
 * and to safe defaults.
 *
 * Native interop (`expo-alternate-app-icons`) is loaded lazily so the module
 * can still import cleanly under Jest or web, where the native binding isn't
 * registered.
 */

import type {
  AppearanceIconKey,
  AppearanceMode,
  AppearancePaletteId,
  AppearancePreferences,
} from '../types';
import { Glow, GlowPalettes, GlowPalettesDark } from '../constants/theme';
import { trackEvent } from './analytics';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  palette: 'rose',
  mode: 'light',
  textSize: 0.4,
  serifItalics: true,
  reduceMotion: false,
  icon: 'og-rose',
};

// ---------------------------------------------------------------------------
// Text-scale slider → multiplier
// ---------------------------------------------------------------------------

/**
 * Map the 0..1 slider position to a font-size multiplier in the range
 * [0.85, 1.30]. 0.4 (the default) lands at exactly 1.00 so existing layouts
 * are untouched until the user moves the slider.
 */
export function appearanceTextScaleFactor(textSize: number): number {
  const clamped = Math.max(0, Math.min(1, textSize));
  // Piecewise linear: 0 → 0.85, 0.4 → 1.00, 1 → 1.30.
  if (clamped <= 0.4) {
    return 0.85 + (clamped / 0.4) * 0.15;
  }
  return 1.0 + ((clamped - 0.4) / 0.6) * 0.3;
}

// ---------------------------------------------------------------------------
// Icon ↔ native plugin name mapping
// ---------------------------------------------------------------------------

/**
 * Map our store key to the `name` registered in the `expo-alternate-app-icons`
 * plugin entry in `app.json`. `og-rose` is the bundle primary — we pass
 * `null` to the native API to reset to it; `og-dusk` is now the `OgDusk` alternate.
 */
const ICON_NATIVE_NAME: Record<AppearanceIconKey, string | null> = {
  'og-dusk':     'OgDusk',
  'og-sunset':   'OgSunset',
  'og-meadow':   'OgMeadow',
  'og-rose':     null,
  'og-plum':     'OgPlum',
  'lowercase-g': 'Lowercase',
  'cursive-g':   'Cursive',
};

interface AlternateAppIconsModule {
  supportsAlternateIcons: boolean;
  setAlternateAppIcon: (name: string | null) => Promise<string | null>;
  getAppIconName: () => string | null;
}

// Cache the module reference so we only pay the require cost (and the
// possible "missing native module" throw) once per app session.
let cachedModule: AlternateAppIconsModule | null = null;
let cachedModuleResolved = false;

function loadModule(): AlternateAppIconsModule | null {
  if (cachedModuleResolved) return cachedModule;
  cachedModuleResolved = true;
  try {
    // Lazy-required so Jest + web bundles don't choke on the missing native
    // binding. We also guard against the JS module throwing on *access*
    // (some expo modules invoke `requireNativeModule` at top-level import,
    // which surfaces as an unhandled bridge error when the iOS pod hasn't
    // been linked — for instance, a dev build that hasn't run `pod install`
    // since the package was added).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-alternate-app-icons') as AlternateAppIconsModule;
    // Probe one property to flush any lazy bridge access errors before the
    // caller depends on it.
    void mod.supportsAlternateIcons;
    cachedModule = mod;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/** True when the device supports iOS alternate app icons. */
export function supportsAlternateAppIcon(): boolean {
  try {
    const mod = loadModule();
    return Boolean(mod?.supportsAlternateIcons);
  } catch {
    return false;
  }
}

/**
 * Swap the iOS app icon to `target`. Resolves to `true` on success. Failures
 * (unsupported device, user-dismissed iOS confirmation, unrecognised name)
 * resolve to `false` so the caller can revert the persisted preference.
 */
export async function applyAppIcon(target: AppearanceIconKey): Promise<boolean> {
  const mod = loadModule();
  if (!mod) return false;
  if (!mod.supportsAlternateIcons) return false;

  const nativeName = ICON_NATIVE_NAME[target];
  try {
    await mod.setAlternateAppIcon(nativeName);
    trackEvent('appearance_icon_applied', { icon: target });
    return true;
  } catch (err) {
    trackEvent('appearance_icon_failed', {
      icon: target,
      error: String((err as Error)?.message ?? err),
    });
    return false;
  }
}

/**
 * Read the icon currently active on the device and translate back to our
 * `AppearanceIconKey`. Returns `og-rose` for any unrecognised native name
 * (matches the "primary icon" convention).
 */
export function currentNativeIcon(): AppearanceIconKey {
  const mod = loadModule();
  if (!mod) return 'og-rose';
  try {
    const native = mod.getAppIconName();
    if (!native) return 'og-rose';
    const entry = (Object.entries(ICON_NATIVE_NAME) as Array<[AppearanceIconKey, string | null]>)
      .find(([, n]) => n === native);
    return entry?.[0] ?? 'og-rose';
  } catch {
    return 'og-rose';
  }
}

// ---------------------------------------------------------------------------
// Live palette + mode resolution
// ---------------------------------------------------------------------------

type ConcretePalette = 'dusk' | 'meadow' | 'rose';
type ConcreteMode = 'light' | 'dark';

/** Resolve the user-facing palette intent to one of the three concrete keys.
 *  `auto` resolves to the rose family for both light and dark mode.
 *  This is a UX choice — we don't auto-switch palette family by environment. */
export function resolvePaletteId(
  palette: AppearancePaletteId,
  _systemScheme: 'light' | 'dark' | null | undefined,
): ConcretePalette {
  if (palette === 'auto') return 'rose';
  return palette;
}

/** Resolve light/dark/auto against the system color scheme. */
export function resolveColorMode(
  mode: AppearanceMode,
  systemScheme: 'light' | 'dark' | null | undefined,
): ConcreteMode {
  if (mode === 'auto') return systemScheme === 'dark' ? 'dark' : 'light';
  return mode;
}

/** Mutate `Glow.palette` in-place so the new colors propagate to every
 *  component that re-renders after this call. Returning the new palette
 *  lets callers stamp a state version to force the tree to re-render. */
export function applyPalette(
  palette: AppearancePaletteId,
  mode: AppearanceMode,
  systemScheme: 'light' | 'dark' | null | undefined,
): void {
  const concreteMode = resolveColorMode(mode, systemScheme);
  const concretePalette = resolvePaletteId(palette, systemScheme);
  const source = concreteMode === 'dark'
    ? GlowPalettesDark[concretePalette]
    : GlowPalettes[concretePalette];

  // In-place mutation. Existing `const P = Glow.palette;` destructured
  // references stay valid because the *object reference* is unchanged.
  Glow.palette.bg = source.bg;
  Glow.palette.surface = source.surface;
  Glow.palette.ink = source.ink;
  Glow.palette.muted = source.muted;
  Glow.palette.accent = source.accent;
  Glow.palette.accent2 = source.accent2;
  Glow.palette.glow = source.glow;
}
