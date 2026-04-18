import { formatRelativeTime } from '../formatRelativeTime';

describe('formatRelativeTime', () => {
  const now = new Date('2026-04-09T12:00:00Z');

  it('returns "just now" for <1 minute ago', () => {
    const ts = new Date(now.getTime() - 30 * 1000).toISOString();
    expect(formatRelativeTime(ts, now)).toBe('just now');
  });

  it('returns "5 minutes ago" for 5 min', () => {
    const ts = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts, now)).toBe('5 minutes ago');
  });

  it('returns "1 hour ago" for 60-119 min', () => {
    const ts = new Date(now.getTime() - 90 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts, now)).toBe('1 hour ago');
  });

  it('returns "2 hours ago" for 2h', () => {
    const ts = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts, now)).toBe('2 hours ago');
  });

  it('returns "yesterday" for 24-47h ago', () => {
    const ts = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts, now)).toBe('yesterday');
  });

  it('returns "3 days ago" for 3 days', () => {
    const ts = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(ts, now)).toBe('3 days ago');
  });

  it('returns null for null input', () => {
    expect(formatRelativeTime(null, now)).toBeNull();
  });
});
