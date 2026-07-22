import type { CompositeSignals } from '../services/skinInsights';
import { GlowPalettes, type GlowPalette } from './theme';
import type { GlowIconName } from '../components/glow/GlowIcons';

/**
 * Glow facet model — the four-facet UI surface introduced by the redesign.
 *
 * The production ML pipeline still emits the 5 CompositeSignals (structure,
 * hydration, inflammation, sunDamage, elasticity). These map onto the four
 * facets the user sees on Today/Story/Scan-Result without changing the
 * underlying model:
 *
 *   Hydrated <- hydration
 *   Calm     <- inflammation (already inverted: 100 = calmest)
 *   Even     <- sunDamage (tone evenness)
 *   Firm     <- structure
 */
export type GlowFacetKey = 'hydrated' | 'calm' | 'even' | 'firm';

export interface GlowFacetMeta {
  key: GlowFacetKey;
  label: string;
  hint: string;
  icon: GlowIconName;
}

export const GLOW_FACETS: readonly GlowFacetMeta[] = [
  { key: 'hydrated', label: 'Hydrated', hint: 'Plump + dewy',           icon: 'drop' },
  { key: 'calm',     label: 'Calm',     hint: 'Less redness',           icon: 'leaf' },
  { key: 'even',     label: 'Even',     hint: 'Tone improving',         icon: 'sun' },
  { key: 'firm',     label: 'Firm',     hint: 'Bounce holding steady',  icon: 'sparkle' },
] as const;

export const facetValues = (signals: CompositeSignals | null): Record<GlowFacetKey, number | null> => {
  if (!signals) return { hydrated: null, calm: null, even: null, firm: null };
  return {
    hydrated: signals.hydration,
    calm: signals.inflammation,
    even: Math.round(signals.sunDamage),
    firm: signals.structure,
  };
};

/** Resolve a facet's accent against the active Glow palette. */
export const facetAccent = (palette: GlowPalette = GlowPalettes.dusk): string => palette.accent;

/** Map a facet to a soft hue for tone-ringed cards (e.g. product chips). */
export const FACET_TONE: Record<GlowFacetKey, string> = {
  hydrated: '#CFE0C8',
  calm: '#E8DCC8',
  even: '#F2D9A8',
  firm: '#D9C8E0',
};

/**
 * Route a facet tile to its Glow-language detail page (`app/signal/[key].tsx`).
 *
 * The detail page is keyed by the underlying snake_case signal route, not the
 * facet key. `even` is the sunDamage (tone-evenness) reading, so the tile
 * number matches the `sun_damage` detail hero exactly.
 */
export const FACET_SIGNAL_ROUTE: Record<
  GlowFacetKey,
  'hydration' | 'inflammation' | 'sun_damage' | 'structure'
> = {
  hydrated: 'hydration',
  calm: 'inflammation',
  even: 'sun_damage',
  firm: 'structure',
};
