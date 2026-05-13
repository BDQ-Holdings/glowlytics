/**
 * Returns today's local date as YYYY-MM-DD.
 * Avoids the UTC-offset bug where toISOString().split('T')[0] returns
 * tomorrow's date for users in negative UTC offsets late at night.
 */
export function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
