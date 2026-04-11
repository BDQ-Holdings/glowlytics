/**
 * Clamps a numeric value to [0, 100], returning `fallback` when the input is
 * NaN, Infinity, or otherwise non-finite.
 *
 * Use this everywhere a score needs to be displayed or persisted — it
 * consolidates the previously scattered NaN-guard + clamp patterns.
 */
export function safeClamp(value: number, fallback = 0): number {
  const n = Math.round(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
}
