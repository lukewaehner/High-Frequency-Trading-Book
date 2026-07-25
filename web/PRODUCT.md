---
register: brand
---

# HFTX

A live, interactive showcase of an order-book matching engine written in Rust. The page IS the product: visitors land, see the engine running in real time, push sliders, watch it absorb load, and leave understanding that this is serious infrastructure work.

## Users

- **Primary:** recruiters, hiring managers, and senior engineers evaluating Luke as a systems-level engineer. They are visiting from a resume link or referral, often skim-reading from a laptop in good light. They have ~30 seconds before they decide whether to keep reading.
- **Secondary:** other Rust / HFT-curious engineers who want to poke at a live exchange. They'll spend longer, push the sim, read the bench numbers, fork on GitHub.

The audience is technical. Marketing copy that hides the engineering insults them. The interface should be confident, terminal-adjacent, and *show the numbers*.

## Product purpose

Make latency visible. Make throughput visible. Make the engineering legible without dumbing it down. The site has to feel as fast as the engine it sits on top of, otherwise the contrast undercuts the pitch.

## Voice

Three concrete words: **technical, exact, alive.**

- *Technical* — never hedge. Use the specific number (113 ns), not "blazing fast."
- *Exact* — every word earns its place. Editorial brevity over marketing fluff.
- *Alive* — the page is breathing. Numbers tick. Depth shifts. The tape runs. Static feels dead, and dead is wrong for this.

## Tone

Confident, dry, slightly poetic in the headline. Drops formality once it gets to the data: tables, mono numerics, no apologies.

## Anti-references

What HFTX must NOT look like:

- **Bloomberg / TradingView terminals** — green-on-black scoreboard density. First-order finance reflex.
- **Stripe / Linear / Vercel SaaS minimalism** — beige neutrals, soft gradients, friendly illustrations. Wrong register; this is a flex piece, not a product page.
- **Crypto neon dark mode** — purple/magenta gradients, glow shadows. The Lila ban applies hard.
- **Editorial-magazine drift** — display-serif italic + drop caps + ruled columns. We're not a publication.
- **Navy + gold fintech respectability** — the second-order finance reflex. Avoided.

## Strategic principles

1. **The engine is the hero.** Every section either shows it running or quantifies it. No marketing-only sections.
2. **Honesty over flex.** The histogram measures HTTP RTT (ms) and is labeled as such. The Criterion benchmarks (ns) are labeled separately. Don't mix scales to make numbers look better.
3. **Asymmetry over centering.** The page is not a stack of centered cards. Layouts lean.
4. **Mono for numbers, sans for headlines.** No exceptions in the numerics.
5. **One committed accent.** Phosphor amber. Bid/ask are desaturated companions, never compete with the amber.
6. **Motion serves comprehension.** Tape moves because trades are flowing. Bars grow because samples are arriving. Decorative motion is forbidden.

## Aesthetic lane

**Editorial-terminal.** Cabinet Grotesk display + Geist Mono numerics, asymmetric grid, warm-tinted off-black, single phosphor amber accent. Not a Bloomberg, not a Stripe, not a magazine. The lane is "an order-book engine someone took seriously."

## Reference points (for direction, not copying)

- Klim Type Foundry's specimen pages — for typographic confidence and color drench discipline.
- Vercel's older marketing — for asymmetric mono+sans pairings and dark-warm palettes.
- A 1970s oscilloscope manual — for honest dial-and-readout feel.
