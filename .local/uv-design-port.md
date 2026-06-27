# UV Mirror — port the claude.ai/design "Driver's-Side Test" into the codebase

We imported the finished design (claude.ai/design project "Glowlytics Landing"). The
scan tool is the **Driver's-Side Test** = a shared React island `DriverFlow` with 7
steps: intro → framing(camera/lighting) → scanning → reveal(drag-to-compare) →
breakdown → email → appstore. We are porting it into the Next.js landing app,
**replacing the lo-fi `/uv-scan` prototype**, and wiring it to the REAL UV Mirror
backend instead of the design's synthetic engine.

## Design source (READ THESE — they are the ground truth for visuals/copy/markup)
`/Users/mustafaboorenie/cornell-hackathon/.local/design-assets/`
- `Driver's-Side Test.html` — page shell + the `<style>` block (already ported to dst.css).
- `dst-engine.jsx`  — useCamera, useLighting, captureFrame, sampleAsymmetry, makeDamageMap,
                      compositeReveal, makeSamplePhoto, FaceMap, Dot, Chip, FlowDots, HEAT, cssVar.
- `dst-flow.jsx`    — PrimaryBtn, ArrowR, IntroScreen, FramingScreen, ScanningScreen, SideTally, SamplePlaceholder.
- `dst-result.jsx`  — useCountUp, RevealScreen, RevealTag, SilhouetteReveal, BreakdownScreen, EmailScreen, AppStoreScreen.
- `dst-machine.jsx` — DriverFlow orchestrator (the state machine we re-wire).
- `dst-app.jsx` / `dst-embed.jsx` — standalone mount / landing embed mount.

The design is plain React (UMD globals + Babel). Port to **idiomatic Next.js**:
`"use client"`, ES imports (`import { useState } from "react"`), TypeScript, no
`window.X` globals, no Babel. Keep ALL inline-style JSX, class names, copy, SVG,
and animations byte-faithful to the design — only the data inputs change.

## CRITICAL: design is synthetic → we wire the REAL backend
The design fakes the result: `makeDamageMap(w,h,asymmetry/100,7)` builds a synthetic
overlay from a fixed `asymmetry={62}` prop. We DELETE that path. Instead the flow
calls the real backend (`apps/glowlytics/backend`, endpoints already built & tested):
- `POST /api/uv/analyze {image_base64}` → real `{scan_id, overall, heatmap, regions, asymmetry, screener}`.
- `POST /api/uv/lead {email, scan_id, source}` → `report_token` (enters Loops sequence).
- `GET /api/uv/report/:token` → PDF.
The captured photo's **damaged** image is produced by compositing the REAL
`heatmap` onto the photo (compositeHeatmap), not makeDamageMap.

## Shared modules (ALREADY EXIST — import, do not recreate)
`apps/landing/app/uv-scan/lib.ts` exports:
- Constants: `API_BASE`, `SOURCE`, `APP_DOWNLOAD_URL`, `EMAIL_RE`.
- Types: `ScreenCheck`, `ScreenResponse`, `Overall`, `Heatmap`, `HeatmapBounds`, `Region`,
  `Asymmetry`, `AnalyzeResponse`, `LeadResponse`.
- `rampColor(v:number):[r,g,b,a]` (0..1 → transparent→amber→red), `FIX_HINTS` (by check id).
- API: `stripDataUrl`, `postScreen`, `postAnalyze` (throws `UnusableImageError{checks}` on 422),
  `postLead(email,scanId)→reportToken`, `reportUrl(token)`, class `UnusableImageError`.
`apps/landing/app/uv-scan/dst.css` — page/stage/chrome CSS + palette tokens scoped to `.dst-page`.

## File layout (all NEW under `apps/landing/app/uv-scan/driver/` unless noted)
- `driver/engine.ts`        — hooks + canvas utils (NO JSX). [OWNER: ENGINE]
- `driver/atoms.tsx`        — FaceMap, Dot, Chip, FlowDots, PrimaryBtn, ArrowR. [OWNER: ENGINE]
- `driver/CaptureScreens.tsx` — IntroScreen, FramingScreen, ScanningScreen, SideTally, SamplePlaceholder. [OWNER: CAPTURE]
- `driver/ResultScreens.tsx`  — RevealScreen, RevealTag, SilhouetteReveal, BreakdownScreen, EmailScreen, AppStoreScreen, useCountUp. [OWNER: RESULT]
- `driver/DriverFlow.tsx`   — the machine + real API wiring. [OWNER: INTEGRATOR]
- `page.tsx` (rewrite)      — standalone `/uv-scan` shell (.dst-page + .dst-chrome + .dst-stage). [OWNER: INTEGRATOR]
- `DriverFlowEmbed.tsx`     — landing embed wrapper (.dst-stage--embed). [OWNER: INTEGRATOR]
Import paths from `driver/*`: shared lib is `../lib`, css imported by page only.

## Frozen export signatures

### driver/engine.ts  [ENGINE owns]
```ts
import type { Heatmap } from "../lib";
export type CamStatus = "idle" | "requesting" | "live" | "denied" | "unavailable";
export interface LightState { brightness: number; uneven: number; state: "good"|"dim"|"bright"|"uneven"|"waiting"|"connecting"; }
export function useCamera(active: boolean): { videoRef: React.RefObject<HTMLVideoElement>; status: CamStatus };
export function useLighting(videoRef: React.RefObject<HTMLVideoElement|null>, live: boolean): LightState;
export function captureFrame(video: HTMLVideoElement): HTMLCanvasElement;   // mirrored, cap 720w
export function makeSamplePhoto(w: number, h: number): HTMLCanvasElement;   // camera-denied fallback
export function sampleAsymmetry(canvas: HTMLCanvasElement): number;         // 0..1 (kept for completeness)
export const HEAT: { /* clinical heatmap inks, from design */ };
export function cssVar(name: string): string;
/** REPLACES makeDamageMap+compositeReveal: composite the REAL backend heatmap
 *  onto the captured photo → a "damaged"/UV-mapped canvas. Paint a cols×rows
 *  ImageData via rampColor(cell) then drawImage-scale into the normalized
 *  heatmap.bounds rect over a copy of `photo` (soft, resolution-independent). */
export function compositeHeatmap(photo: HTMLCanvasElement, heatmap: Heatmap): HTMLCanvasElement;
```

### driver/atoms.tsx  [ENGINE owns]
```ts
export function FaceMap(p: { size?: number; contour?: "ink"|"light"; damage?: number; halo?: boolean }): JSX.Element;
export function Dot(p: { c: string }): JSX.Element;
export function Chip(p: { children: React.ReactNode; tone?: "neutral"|"good"|"warn"|"hot" }): JSX.Element;
export function FlowDots(p: { step: number; total: number }): JSX.Element;
export function PrimaryBtn(p: { children: React.ReactNode; onClick?: ()=>void; dark?: boolean; disabled?: boolean; style?: React.CSSProperties }): JSX.Element;
export function ArrowR(p: { s?: number }): JSX.Element;
```

### driver/CaptureScreens.tsx  [CAPTURE owns]  (port markup from dst-flow.jsx)
```ts
export function IntroScreen(p: { tone: "calm"|"dramatic"; onStart: ()=>void }): JSX.Element;
export function FramingScreen(p: {
  videoRef: React.RefObject<HTMLVideoElement>; status: CamStatus; light: LightState;
  onCapture: ()=>void; onBack: ()=>void;
  notice?: ScreenCheck[];   // NEW: failing checks when bounced back from an unusable analyze; render via FIX_HINTS
}): JSX.Element;
export function ScanningScreen(p: {
  photoURL: string|null; asymmetry: number /* 0..1 */; scanSpeed: "slow"|"normal"|"fast"; onDone: ()=>void;
}): JSX.Element;
```
Import `useCamera/useLighting` types + `CamStatus/LightState` from `../driver/engine` ONLY as types; the
machine passes live values. Import atoms from `./atoms`, types/`FIX_HINTS` from `../lib`.

### driver/ResultScreens.tsx  [RESULT owns]  (port markup from dst-result.jsx)
```ts
export function RevealScreen(p: {
  cleanURL: string|null; damagedURL: string|null; asymmetry: number /* 0..100 int */;
  sunAge: number; revealStyle: "wipe"|"split"|"silhouette"; tone: "calm"|"dramatic"; onNext: ()=>void;
}): JSX.Element;
export function BreakdownScreen(p: {
  asymmetry: number /*0..100*/; sunAge: number; tone: "calm"|"dramatic"; onNext: ()=>void;
  overall: Overall; regions: Region[];   // NEW: render REAL severity + per-region scores in the design's layout
}): JSX.Element;
export function EmailScreen(p: {
  asymmetry: number; sunAge: number; onSubmit: (email:string)=>void; onSkip: ()=>void;
  submitting?: boolean; error?: string|null;   // NEW: async lead state
}): JSX.Element;
export function AppStoreScreen(p: {
  sent: boolean; email: string; onRestart: ()=>void;
  reportToken?: string|null;   // NEW: when present, show a "Download your PDF report" link via reportUrl(token)
}): JSX.Element;
```
Validate email with `EMAIL_RE` from `../lib`. Import atoms from `./atoms`.

## Data flow the INTEGRATOR wires in DriverFlow.tsx (for everyone's awareness)
- framing: live `useCamera`+`useLighting` (client hints, design-faithful).
- doCapture: `captureFrame` (or makeSamplePhoto if not live) → cleanURL; setStep('scanning');
  kick off `postAnalyze(stripDataUrl(cleanURL))` immediately.
- scanning: play animation; when analyze resolves → `compositeHeatmap(photo, res.heatmap)` → damagedURL;
  advance to reveal once BOTH animation done AND result ready. On `UnusableImageError` → back to
  'framing' with `notice = err.checks`. On other error → graceful retry copy.
- reveal/breakdown: feed REAL `res.asymmetry.score`, `res.overall`, `res.regions`. `sunAge = max(2, round(asymmetry.score/9))`.
- email: `onSubmit(email)` → `postLead(email, res.scan_id)` → reportToken → step 'appstore'.
- appstore: pass `reportToken` so the report link renders.
- `dominantSide` from `res.asymmetry.dominantSide` ('left'/'right' = subject's side).

## Rules for all module agents
- Port faithfully from the named design file; keep inline styles, SVG, copy, class names, animations.
- TypeScript strict-friendly: type every prop; no `any` unless unavoidable (annotate why).
- Respect `prefers-reduced-motion` exactly as the design does.
- Do NOT recreate lib.ts/dst.css. Do NOT edit the backend. Do NOT edit files outside your OWNER set.
- Do NOT run tsc/build/lint or the dev server — the INTEGRATOR runs the single typecheck at the end.
- Report exact exported names + any prop you had to add/rename beyond this contract.
