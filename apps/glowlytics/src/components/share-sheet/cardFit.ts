/**
 * Pure geometry helper shared by the ShareSheet carousel and its tests.
 *
 * Share cards are authored at a fixed pixel size per aspect (see ASPECTS in
 * ShareSheet). The carousel must present each card inside a page that never
 * exceeds the screen width — but RN's `transform: scale` shrinks a view
 * *visually* while its layout box stays authored-size, so a 480pt tweet card
 * used to overflow a ~358pt slot and bleed into neighbouring pages.
 *
 * The story card is the inverse problem: authored 360×640, it fits the width
 * easily but its ~640pt height overflows the shorter carousel band on
 * mainstream phones, colliding with the aspect pills/dots. Pass `availHeight`
 * (the measured band, minus vertical padding) and the fit is bounded by
 * whichever axis is tighter.
 *
 * `computeCardFit` returns the SCALED wrapper dimensions (the layout box we
 * actually reserve, clipped with `overflow: 'hidden'`) plus the transform
 * needed to scale the authored card about its TOP-LEFT corner. RN applies
 * transforms about a view's centre, so we translate by half the size delta to
 * pin the scaled content to (0, 0) of the wrapper.
 */

export type CardAspect = 'story' | 'post' | 'tweet';

/** Total horizontal gutter (16pt each side) reserved around a carousel page. */
export const CARD_GUTTER = 32;

export interface CardFit {
  /** Width of the FlatList page — also the paging snap interval. */
  slotWidth: number;
  /** Uniform scale applied to the authored card (never > 1). */
  scale: number;
  /** Scaled wrapper width = authored width × scale. */
  wrapperW: number;
  /** Scaled wrapper height = authored height × scale. */
  wrapperH: number;
  /** translateX that pins the (centre-origin) scaled card to the wrapper's left. */
  translateX: number;
  /** translateY that pins the (centre-origin) scaled card to the wrapper's top. */
  translateY: number;
}

export function computeCardFit(
  screenWidth: number,
  baseW: number,
  baseH: number,
  availHeight?: number,
): CardFit {
  const slotWidth = Math.max(0, screenWidth - CARD_GUTTER);
  // Fit by whichever axis is tighter: the screen-width slot, an optional
  // vertical band budget (so a tall story card can't overflow the carousel
  // into the aspect pills/dots), and never upscale past the authored size.
  const heightScale = availHeight === undefined ? Infinity : availHeight / baseH;
  const scale = Math.min(slotWidth / baseW, heightScale, 1);
  const wrapperW = baseW * scale;
  const wrapperH = baseH * scale;
  return {
    slotWidth,
    scale,
    wrapperW,
    wrapperH,
    // (scaled − authored) / 2, negative — cancels RN's centre transform origin
    // so the top-left of the authored card lands at (0, 0) of the wrapper.
    translateX: (wrapperW - baseW) / 2,
    translateY: (wrapperH - baseH) / 2,
  };
}

/**
 * Pick an aspect-specific value. Cards author their type/layout large enough
 * to read in a 9:16 story, then step every size down for the shorter 1:1 post
 * and 16:9 tweet so nothing crosses the CardShell padding box.
 */
export function byAspect<T>(aspect: CardAspect, map: Record<CardAspect, T>): T {
  return map[aspect];
}
