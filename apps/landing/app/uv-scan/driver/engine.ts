/**
 * Driver's-Side Test — engine: webcam, live lighting analysis, capture, and the
 * UV heatmap compositor. Ported from the claude.ai/design `dst-engine.jsx`
 * (UMD globals + Babel) to idiomatic Next.js: ES imports, TypeScript, no
 * `window.*` globals. Behaviour is byte-faithful to the design EXCEPT the
 * reveal: the design's synthetic `makeDamageMap` + `compositeReveal` are
 * dropped and replaced by `compositeHeatmap`, which paints the REAL backend
 * heatmap onto the captured photo.
 *
 * NO JSX lives here — the visual atoms are in `./atoms`.
 */

import { useEffect, useRef, useState, type RefObject } from "react";

import { rampColor, type Heatmap } from "../lib";

/** getUserMedia status machine: never settling → falls back to `unavailable`. */
export type CamStatus = "idle" | "requesting" | "live" | "denied" | "unavailable";

/** Live per-frame lighting read used by the framing screen. */
export interface LightState {
  /** Mean luminance, 0..1. */
  brightness: number;
  /** Left/right luminance delta, 0..1 (higher = side-lit). */
  uneven: number;
  state: "good" | "dim" | "bright" | "uneven" | "waiting" | "connecting";
}

// Fixed heat-map ink (independent of brand palette so the "UV truth" reads clinical)
export const HEAT: {
  uv: [number, number, number];
  spot: [number, number, number];
  deep: [number, number, number];
} = {
  uv: [92, 44, 74], // purple UV haze
  spot: [74, 42, 22], // sienna pigmentation
  deep: [48, 28, 16], // deep freckle
};

// ── read a brand CSS var as hex (for canvas use) ───────────────────────────
// Tokens live on `.dst-page` (scoped, not :root), and this runs during SSR too,
// so resolve from the .dst-page host when present and fall back to the dusk
// palette otherwise. Fallbacks are lowercase to match dst.css → no hydration
// mismatch on the SVG/canvas colours.
const DUSK_VARS: Record<string, string> = {
  "--bg": "#f5efe8",
  "--surface": "#fbf7f2",
  "--ink": "#2a1f2d",
  "--muted": "#7a6a75",
  "--accent": "#5a3a5e",
  "--accent2": "#d9a28b",
  "--glow": "#e8c9b8",
  "--hairline": "#e8c9b855",
};
export function cssVar(name: string): string {
  if (typeof document !== "undefined" && typeof getComputedStyle !== "undefined") {
    const host = document.querySelector(".dst-page") ?? document.documentElement;
    const v = getComputedStyle(host).getPropertyValue(name).trim();
    if (v) return v;
  }
  return DUSK_VARS[name] ?? "#000";
}

// ── useCamera ───────────────────────────────────────────────────────────────
// status: idle | requesting | live | denied | unavailable
export function useCamera(active: boolean): { videoRef: RefObject<HTMLVideoElement>; status: CamStatus } {
  const videoRef = useRef<HTMLVideoElement>(null!);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CamStatus>("idle");

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setStatus("requesting");
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) {
      setStatus("unavailable");
      return undefined;
    }
    // Declared up-front so the async settle/error callbacks can clear it.
    let to: ReturnType<typeof setTimeout>;
    md.getUserMedia({
      video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 1280 } },
      audio: false,
    })
      .then((stream) => {
        clearTimeout(to);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.play().catch(() => {});
        }
        setStatus("live");
      })
      .catch((err: unknown) => {
        clearTimeout(to);
        if (cancelled) return;
        const name =
          err && typeof err === "object" && "name" in err ? (err as { name?: string }).name : undefined;
        setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
      });
    // Some embedded/sandboxed contexts never settle the permission prompt —
    // fall back to demo mode so the flow is never stuck "Requesting…".
    to = setTimeout(() => {
      if (!cancelled) setStatus((s) => (s === "requesting" ? "unavailable" : s));
    }, 4200);
    return () => {
      cancelled = true;
      clearTimeout(to);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [active]);

  return { videoRef, status };
}

// ── useLighting ───────────────────────────────────────────────────────────
// Real per-frame luminance sampling. Returns {brightness, uneven, state}.
// state: good | dim | bright | uneven | waiting
export function useLighting(videoRef: RefObject<HTMLVideoElement | null>, live: boolean): LightState {
  const [light, setLight] = useState<LightState>({ brightness: 0.5, uneven: 0, state: "waiting" });
  const rafRef = useRef<number>(0);
  const canvRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Fallback / demo: no live feed → settle to a clean "good" reading.
    if (!live) {
      const t = setTimeout(() => setLight({ brightness: 0.58, uneven: 0.05, state: "good" }), 1100);
      return () => clearTimeout(t);
    }
    if (!canvRef.current) canvRef.current = document.createElement("canvas");
    const cv = canvRef.current;
    cv.width = 64;
    cv.height = 48;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    let last = 0;
    const tick = (ts: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (ts - last < 180) return; // ~5.5fps
      last = ts;
      const v = videoRef.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      try {
        ctx.drawImage(v, 0, 0, 64, 48);
        const d = ctx.getImageData(0, 0, 64, 48).data;
        let sum = 0,
          lSum = 0,
          rSum = 0,
          lN = 0,
          rN = 0;
        for (let y = 0; y < 48; y++) {
          for (let x = 0; x < 64; x++) {
            const i = (y * 64 + x) * 4;
            const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
            sum += lum;
            if (x < 28) {
              lSum += lum;
              lN++;
            } else if (x > 36) {
              rSum += lum;
              rN++;
            }
          }
        }
        const brightness = sum / (64 * 48);
        const lAvg = lSum / lN,
          rAvg = rSum / rN;
        const uneven = Math.abs(lAvg - rAvg);
        let state: LightState["state"] = "good";
        if (brightness < 0.26) state = "dim";
        else if (brightness > 0.82) state = "bright";
        else if (uneven > 0.17) state = "uneven";
        setLight({ brightness, uneven, state });
      } catch {
        /* not ready */
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [videoRef, live]);

  return light;
}

// ── captureFrame ───────────────────────────────────────────────────────────
// Mirrors to match the on-screen selfie preview. Returns a canvas (cap 720w).
export function captureFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const vw = video.videoWidth || 720,
    vh = video.videoHeight || 960;
  const scale = Math.min(1, 720 / vw);
  const w = Math.round(vw * scale),
    h = Math.round(vh * scale);
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1); // mirror
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
  return cv;
}

// ── sampleAsymmetry ──────────────────────────────────────────────────────
// Reads left vs right warmth/darkness off the captured frame to seed a
// "real-ish" base, then the tweak biases the headline. 0..1 (higher = more uneven)
export function sampleAsymmetry(canvas: HTMLCanvasElement): number {
  try {
    const w = canvas.width,
      h = canvas.height;
    const ctx = canvas.getContext("2d")!;
    const d = ctx.getImageData(0, 0, w, h).data;
    let lWarm = 0,
      rWarm = 0,
      lN = 0,
      rN = 0;
    for (let y = Math.floor(h * 0.2); y < h * 0.85; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const i = (y * w + x) * 4;
        const warm = d[i] - d[i + 2]; // R - B  → sun/redness proxy
        if (x < w * 0.42) {
          lWarm += warm;
          lN++;
        } else if (x > w * 0.58) {
          rWarm += warm;
          rN++;
        }
      }
    }
    const diff = Math.abs(lWarm / lN - rWarm / rN) / 255;
    return Math.max(0, Math.min(1, diff * 3));
  } catch {
    return 0.4;
  }
}

// ── makeSamplePhoto ─────────────────────────────────────────────────────
// Fallback "photo" when no camera: an honest striped placeholder portrait in
// warm tones with a faint face contour, so the reveal concept still lands.
export function makeSamplePhoto(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d")!;
  // warm base wash
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#e9cdbb");
  g.addColorStop(1, "#d9ad97");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  // diagonal placeholder stripes
  c.save();
  c.globalAlpha = 0.06;
  c.strokeStyle = "#3a2630";
  c.lineWidth = 2;
  for (let x = -h; x < w; x += 16) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x + h, h);
    c.stroke();
  }
  c.restore();
  // soft vignette
  const rg = c.createRadialGradient(w / 2, h * 0.42, h * 0.2, w / 2, h * 0.5, h * 0.7);
  rg.addColorStop(0, "rgba(0,0,0,0)");
  rg.addColorStop(1, "rgba(40,20,30,0.28)");
  c.fillStyle = rg;
  c.fillRect(0, 0, w, h);
  // faint face contour
  c.strokeStyle = "rgba(58,38,48,0.35)";
  c.lineWidth = 2;
  c.beginPath();
  const cx = w / 2,
    cy = h * 0.46,
    rx = w * 0.26,
    ry = h * 0.34;
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.stroke();
  // monospace tag
  c.fillStyle = "rgba(58,38,48,0.6)";
  c.font = `${Math.round(h * 0.022)}px ui-monospace, monospace`;
  c.textAlign = "center";
  c.fillText("CAMERA OFF · SAMPLE FACE", w / 2, h * 0.93);
  return cv;
}

// ── compositeHeatmap ──────────────────────────────────────────────────────
// REPLACES the design's synthetic makeDamageMap + compositeReveal. Paints the
// REAL backend heatmap onto the captured photo → a "damaged"/UV-mapped canvas.
// The cols×rows damage grid is rendered into a tiny offscreen ImageData via
// `rampColor`, then drawn SCALED (bilinear, imageSmoothingEnabled) into the
// normalised face bbox so the overlay is soft, resolution-independent, and
// aligned to the face.
export function compositeHeatmap(photo: HTMLCanvasElement, heatmap: Heatmap): HTMLCanvasElement {
  const W = photo.width,
    H = photo.height;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d")!;

  // 1) "UV-film" base — desaturate + deepen + a cool cast so the mapped side
  //    reads as a distinct UV photo next to the natural visible-light side
  //    (otherwise, on a low-damage face, the two halves look identical).
  ctx.filter = "grayscale(0.82) contrast(1.14) brightness(0.9)";
  ctx.drawImage(photo, 0, 0);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(118,108,150,0.26)"; // cool violet-grey UV cast
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";

  const { cols, rows, bounds, cells } = heatmap;
  if (cols <= 0 || rows <= 0) return out;

  // 2) Contrast-stretch the cells (10th–97th percentile) so the spatial
  //    pattern is always legible regardless of absolute level — the honest
  //    absolute number is shown separately as the score. A floor keeps the
  //    whole map faintly visible; the hottest region pushes toward red.
  const finite = cells.filter((v) => Number.isFinite(v));
  const sorted = [...finite].sort((a, b) => a - b);
  const lo = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : 0;
  const hi = Math.max(lo + 1e-3, sorted.length ? sorted[Math.floor(sorted.length * 0.97)] : 1);
  const n = cols * rows;

  const off = document.createElement("canvas");
  off.width = cols;
  off.height = rows;
  const octx = off.getContext("2d")!;
  const img = octx.createImageData(cols, rows);
  const px = img.data;
  for (let i = 0; i < n; i++) {
    const raw = cells[i] ?? 0;
    const s = Math.min(1, Math.max(0, (raw - lo) / (hi - lo))); // stretched 0..1
    // Bias into the visible band so even mild areas read; top cells go red.
    const [r, g, b, a] = rampColor(0.34 + s * 0.66);
    const o = i * 4;
    px[o] = r;
    px[o + 1] = g;
    px[o + 2] = b;
    px[o + 3] = Math.min(255, Math.round(a * 1.55)); // boosted heat saturation/opacity
  }
  octx.putImageData(img, 0, 0);

  // 3) Lay the warm damage map over the cool UV base (soft, face-aligned).
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(off, bounds.x * W, bounds.y * H, bounds.w * W, bounds.h * H);
  return out;
}
