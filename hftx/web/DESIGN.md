# Design tokens

Source of truth: `app/globals.css` (`@theme` block). This file documents the *intent* behind those tokens.

## Color

OKLCH, warm-tinted. Strategy: **Committed.** Phosphor amber carries identity (~30% of accented surfaces).

```
bg            oklch(0.16 0.005 60)    Off-black, slightly warm. Never pure #000.
bg-elevated   oklch(0.205 0.006 60)   Cards, panels, raised surfaces.
bg-sunken     oklch(0.13 0.005 60)    Section dividers, sunken zones.
line          oklch(0.28 0.006 60)    Default border.
line-soft     oklch(0.22 0.006 60)    Subtle dividers, hairlines.
fg            oklch(0.965 0.005 80)   Default text. Warm off-white.
fg-muted      oklch(0.72 0.005 75)    Secondary copy.
fg-dim        oklch(0.5 0.006 70)     Captions, helpers, disabled.

amber         oklch(0.82 0.165 78)    PRIMARY ACCENT. Phosphor.
amber-glow    oklch(0.88 0.185 82)    Hover state of amber.
amber-dim     oklch(0.6 0.11 75)      Muted companion.

bid           oklch(0.78 0.14 165)    Buy / electric mint. Desaturated.
bid-dim       oklch(0.55 0.09 165)
ask           oklch(0.7 0.16 25)      Sell / deep coral. Desaturated.
ask-dim       oklch(0.5 0.1 25)
```

**Rules**
- Amber dominates accent surface. Bid/ask are *informational*, not competing.
- Tinted neutrals. Never raw `#000` or `#fff`.
- Selection color: amber. Tells you the system has personality.

## Typography

Display: **Cabinet Grotesk** (Fontshare) — 300, 400, 500, 700, 800, 900.
Sans: **Geist** (Google) — body and UI.
Mono: **Geist Mono** (Google) — every number, every numeric label, all caps-tracked uppercase metadata.

```
display          font-display    tracking -0.02em, ss01 ss02 cv01 cv11
sans             font-sans       default body
mono             font-mono       tnum, zero, ss01 (tabular numerics on by default)
```

**Scale (clamp-driven on heroes)**
- Display 2XL: `clamp(2.75rem, 7vw, 6.25rem)` / weight 800 / leading 0.92 / tracking -0.03em
- Display L:   ~`text-6xl` (60px) / weight 800 / leading 0.95 / tracking tighter
- Body:        `text-base` / leading-relaxed / `max-w-65ch`
- Label:       `text-[10-11px]` uppercase tracking-[0.18-0.22em] mono

**Rules**
- Numbers ALWAYS mono with `tabular-nums`.
- Uppercase + letter-spacing only on metadata labels, never on body copy.
- Hierarchy via weight contrast (300 vs 800), not just size.
- No serif. The brand isn't editorial-magazine.

## Layout

- Container: `max-w-[1400px] mx-auto px-6 md:px-10`.
- Grid columns vary section to section. Hero is 7/5 split. Ladder is 5/2/5. Sim is 5/7. Engine bento is 6 cols with 1x1 / 2x1 / 1x2 / 2x2 cells.
- Asymmetric: never default to centered stacks.
- `min-h-[100dvh]` on heroes (never `h-screen`).
- Padding rhythm: `py-20 md:py-32` between major sections.

## Elevation

Cards used sparingly (`rounded-2xl border border-line bg-bg-elevated/40`). Anti-card overuse is a rule: prefer hairlines + spacing.

```
shadow-soft           0 1px 2px oklch(0.1/0.4), 0 8px 24px -8px oklch(0.1/0.5)
shadow-amber-inner    inset 0 1px 0 oklch(1/0.08), inset 0 -1px 0 oklch(0/0.4)
```

Inner-shadow highlight on amber CTAs reads as a raised physical button.

## Motion

Easing tokens:

```
--ease-out-expo   cubic-bezier(0.16, 1, 0.3, 1)   ← entrances
--ease-out-quart  cubic-bezier(0.25, 1, 0.5, 1)   ← micro-interactions
--ease-out-quint  cubic-bezier(0.22, 1, 0.36, 1)  ← scroll reveals
--ease-in-quart   cubic-bezier(0.5, 0, 0.75, 0)   ← exits
```

Spring presets (Framer Motion):
- Default: `{ type: "spring", stiffness: 100, damping: 20 }`
- Snappy:  `{ type: "spring", stiffness: 380, damping: 32 }`
- Soft:    `{ type: "spring", stiffness: 80, damping: 22 }`

Durations: 100/300/500 rule. Exits = ~75% of entrance.

Bans: bounce, elastic, animating layout properties (`width/height/top/left`). Always honor `prefers-reduced-motion`.

## Surfaces

- **Grain overlay** — `fixed inset-0 z-60 pointer-events-none opacity-3.5%` SVG noise. Adds analog warmth without hurting perf (it's `pointer-events: none`, never on a scrolling container).
- **Hairlines** with end-fade (`linear-gradient(to right, transparent, line, line, transparent)`).
- **Background radial wash** at top of body to lift the hero.

## Components

| Component | File | Notes |
|---|---|---|
| `Pulse` | `components/ui/primitives.tsx` | 1.5px live dot with breathing animation. |
| `MagneticButton` | `components/ui/primitives.tsx` | Inner-shadow amber CTA with active scale. |
| `AnimatedNumber` | `components/ui/AnimatedNumber.tsx` | RAF-driven value interpolation, ease-out-quint. |
| `SectionLabel` | `components/ui/primitives.tsx` | "00 / Index — Title" mono uppercase with amber index. |
| `OrderEntry` | `components/sections/OrderEntry.tsx` | Form with side toggle, mono inputs, amber receipt status. |
| `LadderRow` | `components/sections/Ladder.tsx` | `motion.li` with `layoutId={price}`, depth bar overlay. |
