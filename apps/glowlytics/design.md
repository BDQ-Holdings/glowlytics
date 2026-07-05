# Glowlytics Design System

Single source of truth for visual decisions, mirroring the Claude Design hand-off
(`Glowlytics Design System.html` + `Glowlytics Onboarding.html`). Tokens live in
`src/constants/theme.ts`; this document is the human contract for how to use them.
If a screen disagrees with this file, the screen is wrong.

## 1. Color

Two tiers coexist deliberately:

| Tier | Import | Use for |
|---|---|---|
| **Glow palette** (`Glow.palette`, mutated live by `AppearanceHost`) | `const P = Glow.palette` | Everything visual: backgrounds (`P.bg`), cards/sheets (`P.surface`), headlines + primary copy + primary CTAs (`P.ink`), secondary copy (`P.muted`), italic emphasis / progress fills / links (`P.accent`), the warm "shutter" CTA + streak flame (`P.accent2`), halos / hairlines / ring tracks (`P.glow`) |
| **Legacy `Colors`** | `Colors.*` | Functional color only: `success/warning/error/info`, signal colors (`acne/sunDamage/skinAge/harmony`), scan-flow dark gradients, `scoreColor()` |

Palettes: **Dusk** (default — plum + peach, dusk-light), **Meadow** (sage + linen),
**Rose** (clay + blush), each with a dark counterpart (`GlowPalettesDark`).

Rules:
- Read `Glow.palette.x` **inline in render** — module-level `StyleSheet.create`
  bakes the palette at load and misses palette/dark switches.
- Never hardcode hex on screens. New hex values go in `theme.ts` first.
  Alpha-suffixed palette values (`P.accent + '18'`, `P.glow + '55'`) are fine.
- Score-tinted UI goes through `scoreColor(score)` — never inline thresholds.
- Harmony (bone-structure) surfaces use `Colors.harmony` (`#C8A2D6`) as their accent.

## 2. Typography

Three voices. **Switzer** is the workhorse; **Instrument Serif italic** carries every
editorial moment; **Dancing Script** is the wordmark, nothing else.

| Voice | Token | Rules |
|---|---|---|
| Switzer | `FontFamily.sans/sansMedium/sansSemiBold/sansBold` | UI text, numerals, body, inputs, chips, button labels. Asks are plain — no italics on labels. |
| Instrument Serif italic | `FontFamily.serifItalic` | Screen headlines, feelings, observations ("*Your story*", "*well-rested*"). Never bold. Never all-caps. Only at 18px+. |
| Dancing Script | `FontFamily.accent` | Wordmark only ("Glowl**y**tics", the `y` in `P.accent`). May appear once on a milestone screen — that's the limit. |

Scale (from the hand-off):

| Role | Size / line | Family |
|---|---|---|
| Display number | 72–92 / 1.0 | Switzer 400 |
| h1 / greeting | 34 / 1.15 | Switzer 400 (+ serif-italic `<em>` slots) |
| Screen headline | 34–52 / 1.05–1.12, letterSpacing −0.5 | Instrument Serif italic |
| h2 | 26 / 1.2 | Instrument Serif italic |
| h3 | 22 / 1.25 | Instrument Serif italic |
| Body | 15 / 1.55 | Switzer 400 |
| Secondary | 13–14 / 1.5 | Switzer 400, `P.muted` |
| Eyebrow / overline | 11 / 1.4 | Switzer 500–600, UPPERCASE, letterSpacing 1.2–1.6, `P.muted` |

Hierarchy is achieved with **voice + size + space** — not extra colors.
No exclamation marks. Confidence shows up as italics, not volume.

## 3. Spacing & radius

`Spacing`: 2 / 4 / 8 / 16 / 24 / 32 / 48 / 64. No arbitrary values.
Rhythm: tight within a group (`sm`–`md`), generous between sections (`xl`–`xxl`).
Radius: **14** chips + small tiles · **18–20** inline cards · **22–24** primary cards ·
**28** hero cards · **999** (`BorderRadius.full`) pills, buttons, badges.

## 4. Elevation

Three tiers: **none** (1px `P.glow` hairline), **subtle** (`Shadows.subtle` —
0 4 12, ink @ 5%), **lifted** (`Shadows.lifted` — 0 12 32, ink @ 10%).
Hairline **or** shadow — never both on the same surface. Never invent shadow
values inline. (`Shadows.card/glow` remain for legacy surfaces only.)

## 5. Buttons

Canonical implementations: `src/components/Button.tsx` and the onboarding shell
(`OnboardingTransition`). Screens MUST use them rather than hand-rolling pills.

- **Primary** — solid `P.ink` pill (`BorderRadius.full`, paddingVertical 16,
  minHeight ≥ 54), label `P.surface` in `sansSemiBold` 15, letterSpacing 0.3.
  Actions that advance a flow append the 18px `arrow` GlowIcon (gap 10).
  Disabled: fill `P.glow + '55'`, label `P.muted`, no arrow. Press: `activeOpacity 0.86`.
- **Glow** (`variant="glow"`) — `P.accent2` fill, `P.ink` label/icon, shadow
  `0 8 32 P.accent2 @ 40%`. Reserved for the scan/"shutter" moment — one per flow.
- **Secondary** — transparent fill, 1.5px `P.glow` hairline, `P.ink` label in
  `sansMedium`.
- **Ghost / text link** — borderless; quiet links are 13px `P.muted`; emphasized
  inline links `P.ink` 600 underline (offset 3).

## 6. Iconography

`GlowIcon` (`src/components/glow/GlowIcons.tsx`): single-stroke, 24×24 viewBox,
stroke 1.6 (1.4–2.2 by weight of moment), round caps and joins. No filled icon
families, no emoji as UI.

## 7. Motion

Durations from `Motion` (fast 140 / base 220 / slow 320 / graceful 600 / dramatic 800)
and `Glow.motion` (stagger 0/150/280/380/480…, fadeUp 700, breathe 3200).
Easing: `Glow.motion.easingOutCubic/OutExpo` — never bounce/elastic.
Entrances: staggered fade-up (12–20dp rise), one hero moment per screen, never
competing effects. Every animated surface MUST respect `appearance.reduceMotion`
(see `FocusFade`, `BreathingGlow`, `ProgressDots` for the gating pattern).

## 8. Screen scaffolding

- Every full-bleed screen pads by `useSafeAreaInsets()` — top ≥ `insets.top + Spacing.sm`,
  bottom ≥ `insets.bottom + Spacing.md`. Never let content sit under the Dynamic Island.
- Onboarding chrome: back chevron (36×36) · quiet step dots (active = 18×5 `P.accent`
  pill, past = `P.accent`, future = `P.glow`) · Skip (13px `P.muted`, same weight as
  Continue — never grey-on-grey buried).
- Halos: soft radial `P.glow` (or `P.accent2` for the scan moment) behind one hero
  area per screen, breathing at 3.2s.
- Persistent legal/disclaimer text: 10–11px, `P.muted`, centered, maxWidth ~320,
  separated from interactive elements by ≥ `Spacing.sm`.
- Cards never nest cards; group with spacing + overline labels instead.
- Touch targets ≥ 44×44. Icon-only controls carry `accessibilityLabel`.

## 9. Voice

Measured, calm, non-diagnostic. Sentence case everywhere except eyebrows/overlines.
Editorial on heroes (serif italics), plain on asks (Switzer). No exclamation marks,
no "Awesome!", no streaks-bait. Numbers get context, never raw drama.
Medical-adjacent copy stays "clinically inspired", never "clinical-grade".
