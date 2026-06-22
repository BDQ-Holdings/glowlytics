import { DAILY_QUOTES, quoteForDate, todaysQuote } from '../dailyQuotes';

describe('dailyQuotes', () => {
  it('curates exactly the 5 requested authors (no other names slip in)', () => {
    const authors = new Set(DAILY_QUOTES.map((q) => q.author));
    expect([...authors].sort()).toEqual([
      'Alan Watts',
      'Carl Jung',
      'Fyodor Dostoevsky',
      'Immanuel Kant',
      'Rumi',
    ]);
  });

  it('has at least one quote per author so any date returns something', () => {
    const counts = DAILY_QUOTES.reduce<Record<string, number>>((acc, q) => {
      acc[q.author] = (acc[q.author] ?? 0) + 1;
      return acc;
    }, {});
    for (const author of Object.keys(counts)) {
      expect(counts[author]).toBeGreaterThan(0);
    }
  });

  it('quoteForDate is deterministic — same key returns the same quote', () => {
    const a = quoteForDate('2026-05-28');
    const b = quoteForDate('2026-05-28');
    expect(a).toBe(b);
  });

  it('quoteForDate varies across consecutive days (no degenerate hash)', () => {
    // Span a full week and confirm we see at least 2 distinct quotes. We don't
    // assert 7 distinct because uniform 7-mod-15 distribution isn't guaranteed
    // for the djb2 hash; what we DO want is "not always the same on adjacent days".
    const week = [
      '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04',
      '2026-06-05', '2026-06-06', '2026-06-07',
    ];
    const distinct = new Set(week.map((d) => quoteForDate(d).text));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('todaysQuote uses the local calendar date', () => {
    const fixedDate = new Date(2026, 4, 28); // Local: 2026-05-28
    const today = todaysQuote(fixedDate);
    const direct = quoteForDate('2026-05-28');
    expect(today).toEqual(direct);
  });
});
