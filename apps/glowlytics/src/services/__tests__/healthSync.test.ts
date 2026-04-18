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
