import { deriveCycleDay, pickMaxSeverity, groupEpisodes } from '../healthSync';

// Helper: build a menstrual sample for a given date + flow level
function buildSample(dateStr: string, value: number) {
  const d = new Date(`${dateStr}T12:00:00`);
  return { startDate: d, endDate: d, value };
}

// Flow enum values from @kingstinct/react-native-healthkit CategoryValueMenstrualFlow
const FLOW = { unspecified: 1, light: 2, medium: 3, heavy: 4, none: 5 };

describe('pickMaxSeverity', () => {
  it('returns null for empty array', () => {
    expect(pickMaxSeverity([])).toBeNull();
  });

  it('picks heavy when present', () => {
    expect(pickMaxSeverity([
      { value: FLOW.light },
      { value: FLOW.heavy },
      { value: FLOW.medium },
    ])).toBe('heavy');
  });

  it('maps unspecified correctly', () => {
    expect(pickMaxSeverity([{ value: FLOW.unspecified }])).toBe('unspecified');
  });

  it('maps none (enum 5) correctly', () => {
    expect(pickMaxSeverity([{ value: FLOW.none }])).toBe('none');
  });

  it('picks medium over light', () => {
    expect(pickMaxSeverity([
      { value: FLOW.light },
      { value: FLOW.medium },
    ])).toBe('medium');
  });
});

describe('pickMaxSeverity — defensive', () => {
  it('returns null when no sample matches the HealthKit flow enum', () => {
    // value=999 is not in CategoryValueMenstrualFlow → no entry → null.
    // The legacy default of 'none' silently labeled garbage as a confident
    // no-flow reading, which surfaced misleading copy in the cycle UI.
    expect(pickMaxSeverity([{ value: 999 }, { value: 42 }])).toBeNull();
  });

  it('returns null when only invalid values are present alongside no enum hits', () => {
    expect(pickMaxSeverity([{ value: 0 }])).toBeNull();
  });
});

describe('deriveCycleDay — timezone normalization', () => {
  // The implementation collapses both endpoints to local midnight before
  // subtracting so a sample logged late in the evening is still counted as
  // "yesterday" the next morning, regardless of the hour-of-day mismatch.
  it('counts as day 2 when the sample was at 23:00 yesterday and check-in is 07:00 today', () => {
    const yesterday23 = new Date();
    yesterday23.setDate(yesterday23.getDate() - 1);
    yesterday23.setHours(23, 0, 0, 0);

    const today07 = new Date();
    today07.setHours(7, 0, 0, 0);

    const samples = [
      { startDate: yesterday23, endDate: yesterday23, value: FLOW.heavy },
      { startDate: yesterday23, endDate: yesterday23, value: FLOW.heavy },
    ];

    expect(deriveCycleDay(samples, today07)).toBe(2);
  });

  it('returns null when "today" is before the latest episode start (clock skew guard)', () => {
    const samples = [
      buildSample('2026-04-10', FLOW.heavy),
      buildSample('2026-04-11', FLOW.medium),
    ];
    // Today rolled back before the episode → no meaningful cycle day.
    const today = new Date('2026-04-05T12:00:00');
    expect(deriveCycleDay(samples, today)).toBeNull();
  });
});

describe('groupEpisodes', () => {
  it('returns empty for no samples', () => {
    expect(groupEpisodes([])).toEqual([]);
  });

  it('groups consecutive days into one episode', () => {
    const samples = [
      buildSample('2026-03-01', FLOW.heavy),
      buildSample('2026-03-02', FLOW.medium),
      buildSample('2026-03-03', FLOW.light),
    ];
    const episodes = groupEpisodes(samples);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].startDate.toISOString()).toContain('2026-03-01');
    expect(episodes[0].days).toBe(3);
  });

  it('splits episodes with >2 day gap', () => {
    const samples = [
      buildSample('2026-03-01', FLOW.heavy),
      buildSample('2026-03-02', FLOW.medium),
      buildSample('2026-03-06', FLOW.heavy),
      buildSample('2026-03-07', FLOW.medium),
    ];
    const episodes = groupEpisodes(samples);
    expect(episodes).toHaveLength(2);
  });

  it('tolerates 1-day gap within an episode (user forgot to log)', () => {
    const samples = [
      buildSample('2026-03-01', FLOW.heavy),
      buildSample('2026-03-03', FLOW.light),
    ];
    const episodes = groupEpisodes(samples);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].days).toBe(3);
  });

  it('drops isolated 1-day samples (spotting)', () => {
    const samples = [
      buildSample('2026-03-15', FLOW.light),
    ];
    const episodes = groupEpisodes(samples);
    expect(episodes).toHaveLength(0);
  });
});

describe('deriveCycleDay', () => {
  it('returns null for empty samples', () => {
    expect(deriveCycleDay([], new Date('2026-04-09'))).toBeNull();
  });

  it('returns correct day for single episode 8 days ago', () => {
    const samples = [
      buildSample('2026-04-01', FLOW.heavy),
      buildSample('2026-04-02', FLOW.medium),
      buildSample('2026-04-03', FLOW.light),
    ];
    const today = new Date('2026-04-09T12:00:00');
    expect(deriveCycleDay(samples, today)).toBe(9);
  });

  it('returns 2 for ongoing period with episode starting yesterday', () => {
    const samples = [
      buildSample('2026-04-08', FLOW.heavy),
      buildSample('2026-04-09', FLOW.medium),
    ];
    const today = new Date('2026-04-09T12:00:00');
    expect(deriveCycleDay(samples, today)).toBe(2);
  });

  it('returns null for stale episode (>60 days ago)', () => {
    const samples = [
      buildSample('2026-01-15', FLOW.heavy),
      buildSample('2026-01-16', FLOW.medium),
    ];
    const today = new Date('2026-04-09T12:00:00');
    expect(deriveCycleDay(samples, today)).toBeNull();
  });

  it('uses most recent episode when multiple present', () => {
    const samples = [
      buildSample('2026-03-01', FLOW.heavy),
      buildSample('2026-03-02', FLOW.medium),
      buildSample('2026-03-29', FLOW.heavy),
      buildSample('2026-03-30', FLOW.medium),
    ];
    const today = new Date('2026-04-09T12:00:00');
    expect(deriveCycleDay(samples, today)).toBe(12);
  });

  it('drops isolated spotting and uses real episode', () => {
    const samples = [
      buildSample('2026-03-20', FLOW.light),
      buildSample('2026-04-01', FLOW.heavy),
      buildSample('2026-04-02', FLOW.medium),
    ];
    const today = new Date('2026-04-09T12:00:00');
    expect(deriveCycleDay(samples, today)).toBe(9);
  });
});
