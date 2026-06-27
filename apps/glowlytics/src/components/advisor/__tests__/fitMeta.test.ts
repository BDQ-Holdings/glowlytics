import { Glow } from '../../../constants/theme';
import { fitMeta, toneColor, severityMeta } from '../fitMeta';

const p = Glow.palette;

describe('fitMeta — verdict → label/colour mapping', () => {
  it('maps buy → "Fits you" on the accent colour, biased high', () => {
    const m = fitMeta('buy', p);
    expect(m.label).toBe('Fits you');
    expect(m.color).toBe(p.accent);
    expect(m.dot).toBe(p.accent);
    expect(m.blurb).toBe('Worth adding');
    expect(m.pos).toBeGreaterThan(0.5);
  });

  it('maps maybe → "Worth a look" on accent2, centred', () => {
    const m = fitMeta('maybe', p);
    expect(m.label).toBe('Worth a look');
    expect(m.color).toBe(p.accent2);
    expect(m.dot).toBe(p.accent2);
    expect(m.pos).toBe(0.5);
  });

  it('maps skip → "Not for you" on muted, biased low', () => {
    const m = fitMeta('skip', p);
    expect(m.label).toBe('Not for you');
    expect(m.color).toBe(p.muted);
    expect(m.dot).toBe(p.muted);
    expect(m.pos).toBeLessThan(0.5);
  });
});

describe('toneColor — reason tone → colour', () => {
  it('routes good→accent, warn→accent2, bad→muted', () => {
    expect(toneColor('good', p)).toBe(p.accent);
    expect(toneColor('warn', p)).toBe(p.accent2);
    expect(toneColor('bad', p)).toBe(p.muted);
  });
});

describe('severityMeta — conflict/flag severity', () => {
  it('labels known severities and echoes unknown ones', () => {
    expect(severityMeta('high', p).label).toBe('High');
    expect(severityMeta('med', p).label).toBe('Medium');
    expect(severityMeta('low', p).label).toBe('Low');
    expect(severityMeta('weird', p).label).toBe('weird');
  });

  it('gives high a louder (warmer) tone than low', () => {
    expect(severityMeta('high', p).color).toBe(p.accent2);
    expect(severityMeta('low', p).color).toBe(p.muted);
  });
});

// ── B1: accent2 must never be TEXT on the light surface ──────────────────────
// WCAG 2.x relative-luminance contrast ratio between two #rrggbb colours.
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const h = hex.replace('#', '');
    const ch = [0, 2, 4].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const la = lum(a);
  const lb = lum(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;

describe('fitMeta — textColor is AA-safe on both surface and bg', () => {
  it('confirms the raw accent2 fill would FAIL as text (the defect B1 fixes)', () => {
    expect(contrast(p.accent2, p.surface)).toBeLessThan(AA);
    expect(contrast(p.accent2, p.bg)).toBeLessThan(AA);
  });

  it.each(['buy', 'maybe', 'skip'] as const)(
    'verdict %s: label textColor clears AA on surface and bg',
    (verdict) => {
      const m = fitMeta(verdict, p);
      expect(contrast(m.textColor, p.surface)).toBeGreaterThanOrEqual(AA);
      expect(contrast(m.textColor, p.bg)).toBeGreaterThanOrEqual(AA);
    },
  );

  it('maybe keeps the saturated accent2 as fill/dot but deepens only the text', () => {
    const m = fitMeta('maybe', p);
    expect(m.color).toBe(p.accent2);
    expect(m.dot).toBe(p.accent2);
    expect(m.textColor).not.toBe(p.accent2);
  });
});

describe('severityMeta — textColor is AA-safe and distinct from the fill', () => {
  it.each(['high', 'med', 'low', 'weird'] as const)(
    'severity %s: textColor clears AA on surface and bg',
    (sev) => {
      const s = severityMeta(sev, p);
      expect(contrast(s.textColor, p.surface)).toBeGreaterThanOrEqual(AA);
      expect(contrast(s.textColor, p.bg)).toBeGreaterThanOrEqual(AA);
    },
  );

  it('high/med keep accent2 as the pill fill but never as the text', () => {
    for (const sev of ['high', 'med'] as const) {
      const s = severityMeta(sev, p);
      expect(s.color).toBe(p.accent2);
      expect(s.textColor).not.toBe(p.accent2);
    }
  });
});
