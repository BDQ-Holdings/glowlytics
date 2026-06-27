import type { GlowPalette } from '../../constants/theme';
import type { ShoppingVerdict } from '../../types';

/**
 * Fit semantics for a shopping verdict — the visual + copy language the design
 * (`advisor.jsx` → `fitMeta`) used for "Fits you / Worth a look / Not for you".
 *
 * Drives off the REAL backend verdict ('buy' | 'maybe' | 'skip') rather than the
 * design's synthetic `fit`. Mapping (per contract):
 *   buy   → 'Fits you'     (palette.accent)
 *   maybe → 'Worth a look' (palette.accent2)
 *   skip  → 'Not for you'  (palette.muted)
 */
/**
 * Dark terracotta used as the TEXT colour for the "warn"/"maybe"/med-high
 * tones on the LIGHT Glow surfaces. accent2 (#D9A28B) itself is only ~2:1 as
 * text on surface/bg (fails AA); this deepened terracotta holds AA at body
 * size — verified ≥5:1 on every light palette (dusk surface 5.45:1 / bg 5.09:1,
 * meadow 5.53 / 5.10, rose 5.40 / 5.02). Fills, dots, meter knob/track and glow
 * keep accent2; only TEXT switches to this.
 */
const WARN_TEXT = '#9E4F2E';

/** Light vs dark palette by bg luminance — on dark palettes accent2 is already
 *  a readable light text (≥7.9:1 on every dark surface), so warn text stays
 *  accent2 there and only deepens on the light stack. */
function isLightPalette(palette: GlowPalette): boolean {
  const h = palette.bg.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

export interface FitMeta {
  label: string;
  /** Fill / dot / meter-knob colour (the saturated tone). */
  color: string;
  dot: string;
  /** AA-safe TEXT colour for the label (distinct from the fill `color`). */
  textColor: string;
  blurb: string;
  pos: number;
}

export function fitMeta(verdict: ShoppingVerdict, palette: GlowPalette): FitMeta {
  const warnText = isLightPalette(palette) ? WARN_TEXT : palette.accent2;
  if (verdict === 'buy') {
    // accent on surface ~8.9:1 / bg ~8.4:1 — comfortably AA.
    return { label: 'Fits you', color: palette.accent, dot: palette.accent, textColor: palette.accent, pos: 0.86, blurb: 'Worth adding' };
  }
  if (verdict === 'maybe') {
    return { label: 'Worth a look', color: palette.accent2, dot: palette.accent2, textColor: warnText, pos: 0.5, blurb: 'Go in eyes open' };
  }
  // skip — ink as text (~14:1) reads cleanly; dot/fill stay muted.
  return { label: 'Not for you', color: palette.muted, dot: palette.muted, textColor: palette.ink, pos: 0.16, blurb: 'Skip for now' };
}

/**
 * Reason tone → colour, mirroring the design's `flagColor` semantics.
 * good = something for you (accent), warn = proceed with care (accent2),
 * bad = a reason against (muted — the palette's "not for you" tone).
 */
export type ReasonTone = 'good' | 'warn' | 'bad';

export function toneColor(tone: ReasonTone, palette: GlowPalette): string {
  if (tone === 'good') return palette.accent;
  if (tone === 'warn') return palette.accent2;
  return palette.muted;
}

/**
 * Conflict / flag severity → colour + label + background alpha. Higher severity
 * gets a warmer, more saturated treatment (accent2) so it reads as the louder
 * signal; low / unknown settle into the calm muted tone. `severity` is loosely
 * typed because the backend `flags[].severity` is a free `string`.
 */
export interface SeverityMeta {
  /** Fill / pill-background tone. */
  color: string;
  label: string;
  /** AA-safe TEXT colour for the label (distinct from the fill `color`). */
  textColor: string;
  bgAlpha: string;
}

/**
 * AA-safe TEXT colour for a "warn" treatment (med/high severity, overlap pill,
 * "maybe" verdict) — deep terracotta on light surfaces, accent2 on dark.
 */
export function warnTextColor(palette: GlowPalette): string {
  return isLightPalette(palette) ? WARN_TEXT : palette.accent2;
}

export function severityMeta(severity: string, palette: GlowPalette): SeverityMeta {
  const warn = warnTextColor(palette);
  switch (severity) {
    case 'high':
      return { color: palette.accent2, label: 'High', textColor: warn, bgAlpha: '2e' };
    case 'med':
      return { color: palette.accent2, label: 'Medium', textColor: warn, bgAlpha: '1f' };
    case 'low':
      return { color: palette.muted, label: 'Low', textColor: palette.ink, bgAlpha: '18' };
    default:
      return { color: palette.muted, label: severity || 'Note', textColor: palette.ink, bgAlpha: '18' };
  }
}
