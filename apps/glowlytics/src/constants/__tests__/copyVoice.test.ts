// Brand-voice guard: user-facing copy tables must not use em dashes (U+2014).
// Natural punctuation (periods, commas, colons) reads human; em dashes are the
// most recognizable generated-copy tell. En dashes in numeric ranges and the
// standalone '\u2014' missing-value placeholder glyph remain legitimate — this
// guard covers prose only, which is why it scans multi-word sentence values.
import {
  BONE_METRICS,
  DOMAIN_INTERPRETATION,
  FINDING_COPY,
  METRIC_INTERPRETATION,
} from '../boneStructure';

const EM_DASH = '\u2014';

/** Collect every prose string (≥ 4 words) from a nested value. */
function proseStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.trim().split(/\s+/).length >= 4) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) proseStrings(v, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) proseStrings(v, out);
  }
  return out;
}

describe('copy voice guard: no em dashes in user-facing prose tables', () => {
  const tables: Record<string, unknown> = {
    FINDING_COPY,
    DOMAIN_INTERPRETATION,
    METRIC_INTERPRETATION,
    BONE_METRICS,
  };

  for (const [name, table] of Object.entries(tables)) {
    it(`${name} contains no em dashes`, () => {
      const offenders = proseStrings(table).filter((s) => s.includes(EM_DASH));
      expect(offenders).toEqual([]);
    });
  }
});
