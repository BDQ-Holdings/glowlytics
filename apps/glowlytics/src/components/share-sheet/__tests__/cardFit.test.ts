// computeCardFit: the carousel must size each slot to the SCALED card dims and
// scale the authored card about its top-left, so an authored card wider than
// the slot (e.g. the 480pt tweet card) never overflows the screen-width slot.
import { computeCardFit, CARD_GUTTER } from '../cardFit';

describe('computeCardFit', () => {
  it('shrinks a 480pt tweet card to fit a 390pt screen slot', () => {
    const fit = computeCardFit(390, 480, 270);
    // slot leaves a 16pt gutter on each side of the carousel page.
    expect(fit.slotWidth).toBe(390 - CARD_GUTTER);
    expect(fit.slotWidth).toBe(358);
    expect(fit.scale).toBeCloseTo(0.7458, 3);
    // wrapper is sized to the SCALED dims, not the authored dims.
    expect(fit.wrapperW).toBeCloseTo(358, 1);
    expect(fit.wrapperH).toBeCloseTo(201.375, 2);
    // top-left scaling: translate compensates for RN's center transform origin.
    expect(fit.translateX).toBeCloseTo((fit.wrapperW - 480) / 2, 5);
    expect(fit.translateY).toBeCloseTo((fit.wrapperH - 270) / 2, 5);
    expect(fit.translateX).toBeCloseTo(-61, 5);
    expect(fit.translateY).toBeCloseTo(-34.3125, 4);
  });

  it('barely shrinks a 360pt story card on a 390pt screen', () => {
    const fit = computeCardFit(390, 360, 640);
    expect(fit.scale).toBeCloseTo(0.99444, 4);
    expect(fit.wrapperW).toBeCloseTo(358, 1);
    expect(fit.wrapperH).toBeCloseTo(636.444, 2);
  });

  it('never upscales past the authored size on a wide screen', () => {
    const fit = computeCardFit(1000, 360, 640);
    expect(fit.scale).toBe(1);
    expect(fit.wrapperW).toBe(360);
    expect(fit.wrapperH).toBe(640);
    expect(fit.translateX).toBe(0);
    expect(fit.translateY).toBe(0);
  });

  it('keeps the scaled wrapper within the slot for every aspect + screen size', () => {
    const bases: Array<[number, number]> = [
      [360, 640],
      [360, 360],
      [480, 270],
    ];
    for (const screen of [320, 375, 390, 430, 768]) {
      for (const [w, h] of bases) {
        const fit = computeCardFit(screen, w, h);
        expect(fit.wrapperW).toBeLessThanOrEqual(fit.slotWidth + 0.001);
        expect(fit.scale).toBeLessThanOrEqual(1);
        expect(fit.scale).toBeGreaterThan(0);
      }
    }
  });

  it('applies a height budget so a 360x640 story card is bounded by availHeight', () => {
    // Story cards author ~640pt tall; on mainstream phones the carousel band is
    // shorter than that, so width-only scaling let the card overflow into the
    // aspect pills/dots. With a 500pt band the HEIGHT must govern the fit.
    const fit = computeCardFit(390, 360, 640, 500);
    expect(fit.scale).toBeCloseTo(500 / 640, 6); // 0.78125
    expect(fit.scale).toBeCloseTo(0.78125, 6);
    // wrapper height exactly fills the band — no vertical overflow.
    expect(fit.wrapperH).toBeCloseTo(500, 6);
    expect(fit.wrapperW).toBeCloseTo(281.25, 4); // 360 * 0.78125
    expect(fit.translateX).toBeCloseTo((fit.wrapperW - 360) / 2, 5);
    expect(fit.translateY).toBeCloseTo((fit.wrapperH - 640) / 2, 5);
    expect(fit.translateY).toBeCloseTo(-70, 5);
  });

  it('lets WIDTH govern when the height budget is generous', () => {
    // A tall band must not shrink the card past its width fit — min() keeps the
    // tighter of the two constraints.
    const fit = computeCardFit(390, 360, 640, 2000);
    expect(fit.scale).toBeCloseTo(358 / 360, 5); // width still binds
    expect(fit.wrapperW).toBeCloseTo(358, 1);
    expect(fit.wrapperH).toBeLessThanOrEqual(2000);
  });

  it('ignores the height budget when omitted (width-only back-compat)', () => {
    const withBudget = computeCardFit(390, 360, 640, 640);
    const noBudget = computeCardFit(390, 360, 640);
    // A budget equal to the authored height leaves the width fit untouched.
    expect(withBudget.scale).toBeCloseTo(noBudget.scale, 6);
    expect(withBudget.wrapperH).toBeCloseTo(noBudget.wrapperH, 6);
  });

  it('keeps the scaled wrapper within BOTH the slot width and the height budget', () => {
    const bases: Array<[number, number]> = [
      [360, 640],
      [360, 360],
      [480, 270],
    ];
    for (const screen of [320, 375, 390, 430, 768]) {
      for (const availHeight of [360, 420, 500, 620, 900]) {
        for (const [w, h] of bases) {
          const fit = computeCardFit(screen, w, h, availHeight);
          expect(fit.wrapperW).toBeLessThanOrEqual(fit.slotWidth + 0.001);
          expect(fit.wrapperH).toBeLessThanOrEqual(availHeight + 0.001);
          expect(fit.scale).toBeLessThanOrEqual(1);
          expect(fit.scale).toBeGreaterThan(0);
        }
      }
    }
  });
});
