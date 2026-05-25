/**
 * AppearanceHost — bridges the user's appearance preferences (palette, light
 * vs dark mode, text-scale slider) to the actually-rendered UI.
 *
 * What this does on every appearance change:
 *  1. Mutates `Glow.palette.*` in place so palette/mode (including dark)
 *     propagate to every component that reads `Glow.palette.xxx` *inline*
 *     during render (e.g. `style={{ color: Glow.palette.ink }}`).
 *  2. Updates a `scaleRef` that the patched `Text.render` reads each frame
 *     to scale every `fontSize` value through the global font-size slider.
 *     This is the only RN surface that reaches `<Text>` everywhere without
 *     per-component plumbing.
 *  3. Bumps a `version` key on the rendered subtree so React re-renders the
 *     entire UI — picking up the new inline palette reads and the new text
 *     scale in one beat.
 *
 * KNOWN LIMITATION: module-level `StyleSheet.create({ ... color: P.ink ... })`
 * objects bake their values at *module-load* time. Mutating `Glow.palette`
 * after that doesn't update those baked stylesheets. Screens that take the
 * inline-style path (`palette.bg`, `{ color: P.ink }` inside JSX) update
 * live; screens that read from `styles.x` only reflect the new palette on
 * the next cold launch (the preference is persisted, so cold start applies
 * the right palette before any styles are created).
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Appearance, Text, useColorScheme } from 'react-native';
import { useStore } from '../store/useStore';
import {
  applyPalette,
  appearanceTextScaleFactor,
} from '../services/appearance';

// Snapshot the original Text.render the first time the host mounts so we can
// wrap (rather than replace) it. RN's Text is a forwardRef component; we
// modify its `render` to multiply explicit `fontSize` styles by `scaleRef`.
let originalTextRender: ((...args: unknown[]) => unknown) | null = null;
const scaleRef: { current: number } = { current: 1 };

function patchTextOnce(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TextAny = Text as unknown as any;
  if (originalTextRender) return;
  if (typeof TextAny.render !== 'function') return;
  originalTextRender = TextAny.render.bind(TextAny);

  TextAny.render = function patchedRender(...args: unknown[]) {
    const element = originalTextRender!(...args);
    if (!element || typeof element !== 'object' || !('props' in element)) {
      return element as unknown;
    }
    const scale = scaleRef.current;
    if (scale === 1) return element;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = element as any;
    const incomingStyle = el.props?.style;
    const scaledStyle = scaleStyle(incomingStyle, scale);
    return React.cloneElement(el, { style: scaledStyle });
  };
}

/** Walk a (possibly nested) style array/object and multiply any explicit
 *  `fontSize` by `scale`. Non-fontSize properties pass through untouched. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scaleStyle(style: any, scale: number): any {
  if (!style) return style;
  if (Array.isArray(style)) return style.map((entry) => scaleStyle(entry, scale));
  if (typeof style !== 'object') return style;
  if (typeof style.fontSize !== 'number') return style;
  return { ...style, fontSize: style.fontSize * scale };
}

interface Props {
  children: React.ReactNode;
}

export function AppearanceHost({ children }: Props) {
  const palette = useStore((s) => s.appearance.palette);
  const mode = useStore((s) => s.appearance.mode);
  const textSize = useStore((s) => s.appearance.textSize);
  const reduceMotion = useStore((s) => s.appearance.reduceMotion);
  const systemScheme = useColorScheme();
  const [version, setVersion] = useState(0);
  const mountedRef = useRef(false);

  // Patch Text once. The patch is module-global and idempotent.
  if (!originalTextRender) patchTextOnce();

  // Apply palette + scale synchronously before the next paint so children
  // mount with the right colors and font size on the first frame.
  useLayoutEffect(() => {
    applyPalette(palette, mode, systemScheme);
    scaleRef.current = appearanceTextScaleFactor(textSize);
  }, [palette, mode, textSize, systemScheme]);

  // Force a full subtree re-render when any appearance dimension changes.
  // We skip the very first effect — the initial palette is already applied
  // via the useLayoutEffect above, so an immediate `setVersion(1)` would
  // just trigger a wasted unmount/remount before any user interaction.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setVersion((v) => v + 1);
  }, [palette, mode, textSize, systemScheme]);

  // System scheme can flip outside React's tree (control-centre toggle,
  // Accessibility shortcuts). `useColorScheme` already covers this on most
  // builds but the explicit listener is cheap insurance.
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => {
      applyPalette(palette, mode, Appearance.getColorScheme());
      setVersion((v) => v + 1);
    });
    return () => sub.remove();
  }, [palette, mode]);

  // Touch `reduceMotion` so the store subscription stays alive — downstream
  // consumers (FocusFade, NotchedTabBar) read it via `useReducedMotion()` or
  // their own selector and need to react when the preference flips.
  void reduceMotion;

  // The version key forces a remount of `children` on each change. React
  // throws away the old tree (and its captured palette refs at render time)
  // and rebuilds; inline-style consumers pick up the new palette, the
  // patched Text picks up the new scale.
  return <React.Fragment key={version}>{children}</React.Fragment>;
}
