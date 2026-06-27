"use client";

/**
 * Driver's-Side Test — shared visual atoms. Ported from the claude.ai/design
 * `dst-engine.jsx` (FaceMap, Dot, Chip, FlowDots) and `dst-flow.jsx`
 * (PrimaryBtn, ArrowR). Markup, SVG paths, inline styles, copy, and animations
 * are byte-faithful to the design; only the props are typed.
 */

import type { CSSProperties, ReactNode } from "react";

import { cssVar } from "./engine";

// ── shared button (from dst-flow.jsx) ──────────────────────────────────────
export function PrimaryBtn({
  children,
  onClick,
  dark,
  disabled,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  dark?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        padding: "15px 26px",
        borderRadius: 999,
        border: "none",
        fontFamily: "Switzer, sans-serif",
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: 0.2,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        background: dark ? "#fff" : "var(--ink)",
        color: dark ? "#1a1518" : "var(--surface)",
        transition: "transform 150ms ease, opacity 200ms ease",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {children}
    </button>
  );
}

export function ArrowR({ s = 17 }: { s?: number }) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M14 6l6 6-6 6" />
    </svg>
  );
}

// ── FaceMap (silhouette + asymmetric zones) ────────────────────────────────
const FACE_PATH =
  "M 100 28 C 58 28, 28 60, 28 112 C 28 178, 56 228, 100 240 C 144 228, 172 178, 172 112 C 172 60, 142 28, 100 28 Z";
const ZONE_PATHS: Record<string, string> = {
  forehead: "M 56 70 C 70 50, 130 50, 144 70 L 144 92 C 130 86, 70 86, 56 92 Z",
  cheekL: "M 50 120 C 38 120, 36 168, 60 175 C 78 175, 84 145, 80 130 Z",
  cheekR: "M 150 120 C 162 120, 164 168, 140 175 C 122 175, 116 145, 120 130 Z",
  templeL: "M 40 92 C 32 100, 32 124, 44 130 C 52 122, 52 104, 50 96 Z",
  templeR: "M 160 92 C 168 100, 168 124, 156 130 C 148 122, 148 104, 150 96 Z",
  jaw: "M 60 192 C 80 230, 120 230, 140 192 C 130 215, 110 225, 100 225 C 90 225, 70 215, 60 192 Z",
};

export function FaceMap({
  size = 200,
  contour = "ink",
  damage = 0,
  halo = false,
}: {
  size?: number;
  contour?: "ink" | "soft" | "accent2";
  damage?: number;
  halo?: boolean;
}) {
  const k = Math.max(0, Math.min(1, damage));
  const leftZones = ["templeL", "cheekL", "forehead"];
  const stroke = contour === "ink" ? cssVar("--ink") : contour === "soft" ? cssVar("--glow") : cssVar("--accent2");
  return (
    <svg viewBox="0 0 200 268" width={size} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <clipPath id={`fm-clip-${size}`}>
          <path d={FACE_PATH} />
        </clipPath>
        <radialGradient id={`fm-halo-${size}`} cx="38%" cy="40%" r="62%">
          <stop offset="0%" stopColor="rgba(150,60,90,0.55)" />
          <stop offset="100%" stopColor="rgba(150,60,90,0)" />
        </radialGradient>
      </defs>
      {halo && <ellipse cx="78" cy="120" rx="96" ry="120" fill={`url(#fm-halo-${size})`} />}
      <path d={FACE_PATH} fill="none" stroke={stroke} strokeWidth="1.3" />
      <g clipPath={`url(#fm-clip-${size})`}>
        {leftZones.map((z, i) => (
          <path
            key={z}
            d={ZONE_PATHS[z]}
            fill={`rgba(120,48,78,${(0.22 + i * 0.06) * k})`}
            stroke={`rgba(150,60,90,${0.5 * k})`}
            strokeWidth="0.8"
          />
        ))}
        {/* faint right-side zones for contrast */}
        {["templeR", "cheekR"].map((z) => (
          <path key={z} d={ZONE_PATHS[z]} fill={`rgba(120,48,78,${0.05 * k})`} />
        ))}
        {k > 0.2 &&
          Array.from({ length: Math.round(40 * k) }).map((_, i) => {
            const x = 30 + ((i * 53) % 70);
            const y = 70 + ((i * 37) % 150);
            return <circle key={i} cx={x} cy={y} r={0.8 + (i % 3) * 0.5} fill={`rgba(74,42,22,${0.5 * k})`} />;
          })}
      </g>
      <g stroke={cssVar("--muted")} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5">
        <path d="M 60 100 Q 72 96, 84 100" />
        <path d="M 116 100 Q 128 96, 140 100" />
        <path d="M 100 110 L 100 145 Q 100 152, 95 154" />
        <path d="M 84 175 Q 100 182, 116 175" />
      </g>
    </svg>
  );
}

// ── small atoms ─────────────────────────────────────────────────────────
export function Dot({ c }: { c: string }) {
  return (
    <span
      style={{ width: 6, height: 6, borderRadius: 999, background: c, display: "inline-block", flexShrink: 0 }}
    />
  );
}

type ChipTone = "neutral" | "good" | "warn" | "hot";
// `hot` is absent from the design's Chip (only RevealTag uses it); we add a
// design-consistent warm-sienna entry so the frozen `hot` tone never crashes.
const CHIP_TONES: Record<ChipTone, { bg: string; bd: string; fg: string }> = {
  neutral: { bg: "rgba(255,255,255,0.09)", bd: "rgba(255,255,255,0.14)", fg: "rgba(255,255,255,0.92)" },
  good: { bg: "rgba(74,222,128,0.14)", bd: "rgba(74,222,128,0.4)", fg: "#bff0cd" },
  warn: { bg: "rgba(245,176,82,0.16)", bd: "rgba(245,176,82,0.5)", fg: "#ffd9a3" },
  hot: { bg: "rgba(217,162,139,0.16)", bd: "rgba(217,162,139,0.5)", fg: "#f5d3c4" },
};

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: ChipTone }) {
  const map = CHIP_TONES[tone];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 999,
        fontFamily: "Switzer, sans-serif",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 0.2,
        background: map.bg,
        border: `1px solid ${map.bd}`,
        color: map.fg,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      {children}
    </div>
  );
}

// progress dots for the flow
export function FlowDots({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            width: i === step ? 18 : 6,
            height: 6,
            borderRadius: 999,
            background: i === step ? "var(--accent)" : i < step ? "var(--accent2)" : "var(--glow)",
            transition: "all 240ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
      ))}
    </div>
  );
}
