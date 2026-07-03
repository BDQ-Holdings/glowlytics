# Glowlytics Design System

Single source of truth for visual decisions. Tokens live in `src/constants/theme.ts`;
this document is the human contract for how to use them. If a screen disagrees with
this file, the screen is wrong.

## 1. Color

Two tiers coexist deliberately:

| Tier | Import | Use for |
|---|---|---|
| **Glow palette** (`Glow.palette`, mutated live by `AppearanceHost`) | `const P = Glow.palette` | All new surfaces: backgrounds (`P.bg`), cards (`P.surface`), primary text (`P.ink`), secondary text (`P.muted`), brand accents (`P.accent`, `P.accent2`), hairlines/halos (`P.glow`) |
| **Legacy `Colors`** | `Colors.*` | Functional color only: `success/warning/error/info`, signal colors (`acne/sunDamage/skinAge/harmony`), scan-flow dark gradients, `scoreColor()` |

Rules:
- Read `Glow.palette.x` **inline in render** (or rebuild styles per appearance change) —
  module-level `StyleSheet.create` bakes the palette at load and misses palette/dark switches.
- Never hardcode hex on screens. New hex values go in `theme.ts` first.
- Score-tinted UI goes through `scoreColor(score)` — never inline thresholds.
- Harmony (bone-structure) surfaces use `Colors.harmony` (`#C8A2D6`) as their accent.

## 2. Typography

Family: **Switzer** (`FontFamily.sans/sansMedium/sansSemiBold/sansBold`) with
**DancingScript** (`FontFamily.accent`) reserved for one-word display emphasis only.

| Role | Size token | Family | Notes |
|---|---|---|---|
| Display number | `display` (52) / `hero` (40) | sansBold | Score reveals |
| Screen title | `xxl` (28) | sansBold | 34/36 lineHeight |
| Section title | `lg` (18) | sansSemiBold | |
| Body | `md` (15) | sans | lineHeight ≥ 22 |
| Secondary/body-small | `sm` (13) | sans | color `P.muted` |
| Eyebrow / overline | `xs` (11) | sansSemiBold | UPPERCASE, letterSpacing 1.2–2, color `P.muted` |
| Caption / legal | `xxs` (10)–`xs` | sans | color `P.muted`, maxWidth-capped |

Hierarchy is achieved with **size + weight + space** — not extra colors.

## 3. Spacing & radius

`Spacing`: 2 / 4 / 8 / 16 / 24 / 32 / 48 / 64. No arbitrary values.
Rhythm: tight within a group (`sm`–`md`), generous between sections (`xl`–`xxl`).
`BorderRadius`: cards `lg` (20)–`xl` (28); pills/buttons `full`; chips `full`.

## 4. Elevation

`Shadows.card` for resting cards, `Shadows.glow` for brand-glow emphasis.
Never stack both. Never invent shadow values inline.

## 5. The canonical primary button

The flagship primary action (source of truth: onboarding `OnboardingTransition`):

- Pill (`BorderRadius.full`), `minHeight: 58`, content centered, `overflow: 'hidden'`
- Fill: **3-stop teal gradient** `['#3A9E8F', '#2B8C7E', '#258070']`, start `{0,0}` → end `{1,1}`
- Shadow: teal glow — iOS `shadowColor #3A9E8F, opacity 0.35, radius 16, offset (0,8)`; Android `elevation 8`
- Label: white, `FontFamily.sansSemiBold`, `FontSize.md`–`lg`, letterSpacing 0.3
- Disabled: `[Colors.surfaceHighlight, Colors.surface]` fill, muted label, shadow removed
- Press: `activeOpacity 0.86`

`src/components/Button.tsx` implements this as `variant="primary"`; screens MUST use it
(or `OnboardingTransition`'s built-in) rather than hand-rolling pills.
Secondary = glass surface + accent hairline. Ghost = transparent + `borderStrong` hairline.
Destructive rows use `P.muted`/danger tint via `SettingsPrimitives.PrimaryButton danger`.

## 6. Motion

Durations from `Motion` (fast 140 / base 220 / slow 320 / graceful 600 / dramatic 800 /
breathe 2000) and `Glow.motion` (stagger table, fadeUp 700, breathe 3200).
Easing: `Glow.motion.easingOutCubic/OutExpo` — never bounce/elastic.
Every animated surface MUST respect `appearance.reduceMotion` (see `FocusFade`,
`GlowPrimitives` for the gating pattern). Entrances: staggered fade-up
(`FadeUp` from `glow/GlowPrimitives`), one hero moment per screen, never competing effects.

## 7. Screen scaffolding

- Every full-bleed screen pads by `useSafeAreaInsets()` — top ≥ `insets.top + Spacing.sm`,
  bottom ≥ `insets.bottom + Spacing.md`. Never let content sit under the Dynamic Island.
- Persistent legal/disclaimer text: `xxs`–`xs`, `P.muted`, centered, maxWidth ~320,
  separated from interactive elements by ≥ `Spacing.sm` and never overlapping them.
- Cards never nest cards; group with spacing + `SectionLabel`-style overlines instead.
- Touch targets ≥ 44×44. Icon-only controls carry `accessibilityLabel`.

## 8. Voice

Measured, calm, non-diagnostic. Sentence case everywhere except eyebrows/overlines.
Numbers get context, never raw drama. Medical-adjacent copy stays "clinically inspired",
never "clinical-grade".
