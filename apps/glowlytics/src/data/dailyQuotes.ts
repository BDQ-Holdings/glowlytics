/**
 * Daily philosopher quotes — shown once per day on first cold-open after auth.
 *
 * Selection is deterministic: a SHA-like fold over the local YYYY-MM-DD picks
 * the same quote for every user on the same day. (No external randomness, so
 * tests are reproducible and screenshot diffs are stable.)
 *
 * Curation principle: short, self-contained, no diacritics that require font
 * fallbacks, no political/religious provocations. Each is widely attributed
 * to the author across published English translations; obvious apocrypha
 * ("The wound is the place where the Light enters you" — Rumi) is included
 * only when the attribution survives mainstream scholarship. Where the
 * attribution is contested but ubiquitous, we keep it.
 */
export interface DailyQuote {
  text: string;
  author: 'Rumi' | 'Alan Watts' | 'Carl Jung' | 'Immanuel Kant' | 'Fyodor Dostoevsky';
}

export const DAILY_QUOTES: ReadonlyArray<DailyQuote> = [
  // Rumi
  { text: 'What you seek is seeking you.', author: 'Rumi' },
  { text: 'The wound is the place where the Light enters you.', author: 'Rumi' },
  {
    text:
      'Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.',
    author: 'Rumi',
  },

  // Alan Watts
  {
    text:
      'The only way to make sense out of change is to plunge into it, move with it, and join the dance.',
    author: 'Alan Watts',
  },
  { text: 'Trying to define yourself is like trying to bite your own teeth.', author: 'Alan Watts' },
  { text: 'You are the universe experiencing itself.', author: 'Alan Watts' },

  // Carl Jung
  {
    text:
      'Until you make the unconscious conscious, it will direct your life and you will call it fate.',
    author: 'Carl Jung',
  },
  { text: 'I am not what happened to me, I am what I choose to become.', author: 'Carl Jung' },
  {
    text:
      'Everything that irritates us about others can lead us to an understanding of ourselves.',
    author: 'Carl Jung',
  },

  // Immanuel Kant
  { text: 'We are not rich by what we possess but by what we can do without.', author: 'Immanuel Kant' },
  {
    text: 'Two things awe me most: the starry sky above me and the moral law within me.',
    author: 'Immanuel Kant',
  },
  { text: 'Have the courage to use your own understanding.', author: 'Immanuel Kant' },

  // Fyodor Dostoevsky
  {
    text:
      'The mystery of human existence lies not in just staying alive, but in finding something to live for.',
    author: 'Fyodor Dostoevsky',
  },
  {
    text:
      'Above all, don\u2019t lie to yourself. The man who lies to himself and listens to his own lie comes to a point that he cannot distinguish the truth within him.',
    author: 'Fyodor Dostoevsky',
  },
  { text: 'Beauty will save the world.', author: 'Fyodor Dostoevsky' },
] as const;

/**
 * Tiny deterministic hash for a local date string ("YYYY-MM-DD") so the same
 * day always selects the same quote, but different days don't cluster.
 * Cheaper than Date.parse + modulo (and survives leap days / timezone DST).
 */
function hashDateKey(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h) ^ key.charCodeAt(i); // djb2 xor
  }
  return h >>> 0;
}

/**
 * Pick the quote for a given local date. Pass an explicit key for tests.
 */
export function quoteForDate(dateKey: string): DailyQuote {
  if (DAILY_QUOTES.length === 0) {
    // Build-time guarantee, but keep a runtime guard so we never crash the
    // gateway screen on a typo / future curation pass that ships an empty list.
    return { text: 'Find your glow.', author: 'Rumi' };
  }
  return DAILY_QUOTES[hashDateKey(dateKey) % DAILY_QUOTES.length];
}

/**
 * Shorthand for `quoteForDate` keyed off today's local YYYY-MM-DD.
 */
export function todaysQuote(now: Date = new Date()): DailyQuote {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return quoteForDate(`${y}-${m}-${d}`);
}
