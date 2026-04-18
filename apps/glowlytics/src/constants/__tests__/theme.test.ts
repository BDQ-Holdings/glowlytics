import { Colors, FontFamily, FontSize, BorderRadius, Spacing, Motion, Surfaces } from '../theme';

describe('Theme constants', () => {
  describe('FontFamily', () => {
    it('maps sansMedium to Switzer-Medium (not Regular)', () => {
      expect(FontFamily.sansMedium).toBe('Switzer-Medium');
      expect(FontFamily.sansMedium).not.toBe(FontFamily.sans);
    });

    it('has distinct weights for sans, sansMedium, sansBold', () => {
      const weights = new Set([FontFamily.sans, FontFamily.sansMedium, FontFamily.sansBold]);
      expect(weights.size).toBe(3);
    });

    it('maps all font families to valid Switzer variants', () => {
      const validFonts = ['Switzer-Regular', 'Switzer-Medium', 'Switzer-Bold'];
      Object.values(FontFamily).forEach((font) => {
        expect(validFonts).toContain(font);
      });
    });
  });

  describe('FontSize', () => {
    it('includes xxs token', () => {
      expect(FontSize.xxs).toBe(10);
    });

    it('has monotonically increasing sizes', () => {
      const sizes = [FontSize.xxs, FontSize.xs, FontSize.sm, FontSize.md, FontSize.lg, FontSize.xl, FontSize.xxl, FontSize.hero, FontSize.display];
      for (let i = 1; i < sizes.length; i++) {
        expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
      }
    });
  });

  describe('BorderRadius', () => {
    it('includes xs token', () => {
      expect(BorderRadius.xs).toBe(6);
    });

    it('has monotonically increasing radii (excluding full)', () => {
      const radii = [BorderRadius.xs, BorderRadius.sm, BorderRadius.md, BorderRadius.lg, BorderRadius.xl, BorderRadius.xxl];
      for (let i = 1; i < radii.length; i++) {
        expect(radii[i]).toBeGreaterThan(radii[i - 1]);
      }
    });

    it('full is 999', () => {
      expect(BorderRadius.full).toBe(999);
    });
  });

  describe('Colors', () => {
    it('includes backgroundWarm token', () => {
      expect(Colors.backgroundWarm).toBe('#EDE9E3');
    });

    it('textOnDark is white', () => {
      expect(Colors.textOnDark).toBe('#FFFFFF');
    });
  });

  describe('Spacing', () => {
    it('follows 2x progression for core values', () => {
      expect(Spacing.sm).toBe(Spacing.xs * 2);
      expect(Spacing.md).toBe(Spacing.sm * 2);
      expect(Spacing.lg).toBe(Spacing.md + Spacing.sm);
      expect(Spacing.xl).toBe(Spacing.md * 2);
    });
  });

  describe('Motion', () => {
    it('has increasing durations', () => {
      expect(Motion.fast).toBeLessThan(Motion.base);
      expect(Motion.base).toBeLessThan(Motion.slow);
      expect(Motion.slow).toBeLessThan(Motion.graceful);
      expect(Motion.graceful).toBeLessThan(Motion.dramatic);
      expect(Motion.dramatic).toBeLessThan(Motion.breathe);
    });
  });

  describe('Surfaces', () => {
    it('defines three tiers: hero, standard, recessed', () => {
      expect(Surfaces).toHaveProperty('hero');
      expect(Surfaces).toHaveProperty('standard');
      expect(Surfaces).toHaveProperty('recessed');
    });

    it('hero has solid white background and shadow (no border)', () => {
      expect(Surfaces.hero.backgroundColor).toBe(Colors.backgroundRaised);
      expect(Surfaces.hero).not.toHaveProperty('borderWidth');
      expect(Surfaces.hero).not.toHaveProperty('borderColor');
    });

    it('standard has glass background and border', () => {
      expect(Surfaces.standard.backgroundColor).toBe(Colors.glass);
      expect(Surfaces.standard.borderWidth).toBe(1);
      expect(Surfaces.standard.borderColor).toBe(Colors.border);
    });

    it('recessed has overlay tint and no border', () => {
      expect(Surfaces.recessed.backgroundColor).toBe(Colors.surfaceOverlay);
      expect(Surfaces.recessed).not.toHaveProperty('borderWidth');
      expect(Surfaces.recessed).not.toHaveProperty('borderColor');
    });

    it('hero has largest borderRadius, recessed has smallest', () => {
      expect(Surfaces.hero.borderRadius).toBeGreaterThanOrEqual(Surfaces.standard.borderRadius);
      expect(Surfaces.standard.borderRadius).toBeGreaterThanOrEqual(Surfaces.recessed.borderRadius);
    });
  });
});
