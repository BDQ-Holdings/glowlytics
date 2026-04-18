import type { UserProfile } from '../types';

/**
 * Estimate the current cycle day from the user's profile.
 * Returns undefined if not applicable or data is missing.
 */
export const getEstimatedCycleDay = (
  user: Pick<UserProfile, 'period_applicable' | 'period_last_start_date' | 'cycle_length_days'> | null | undefined,
): number | undefined => {
  if (!user || user.period_applicable !== 'yes' || !user.period_last_start_date) return undefined;
  // Parse YYYY-MM-DD as local date (not UTC) to avoid off-by-one in negative UTC offsets
  const [y, m, d] = user.period_last_start_date.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return undefined;
  const start = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // normalize to local midnight for clean day diff
  const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const cycleLen = user.cycle_length_days || 28;
  return ((diff % cycleLen) + cycleLen) % cycleLen + 1;
};
