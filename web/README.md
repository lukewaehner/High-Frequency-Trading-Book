# hftx/web

The HFTX front end. Next.js 16 + React 19 + Tailwind v4 + Zustand + Framer Motion. The page renders a live read-out of the Rust matching engine running on `localhost:8080` and lets the visitor drive it via an in-page sim.

For the full project (engine, CLI, benchmarks), see the [repo-root README](../../README.md).

## Run it

From the workspace root, the easiest path is:

```bash
cd ..                # to hftx/
make dev             # spawns engine + web in parallel
```

To run only the front end:

```bash
pnpm install         # one-time
pnpm dev             # http://localhost:3000
```

The front end expects the exchange service at `http://localhost:8080`. Override with:

```bash
NEXT_PUBLIC_HFTX_URL=http://example:8080 pnpm dev
```

## Layout

```
app/                  App Router entry; page.tsx composes the sections
components/
├── sections/         Hero, Ladder, OrderEntry, Sim, Engine, TopBar, Footer, TradeTape
└── ui/               primitives.tsx (MagneticButton, SectionLabel, Pulse, ...),
                     AnimatedNumber, Magnetic, Reveal
lib/
├── store.ts          Zustand: useMarketStore, useLatencyStore
├── exchange.ts       fetch / WebSocket wrappers
├── format.ts         number / price / latency formatters
├── useFlashOnChange.ts  phosphor flash hook for live updates
├── cn.ts             tailwind-merge helper
└── types.ts          shared wire types
```

`AGENTS.md` and `CLAUDE.md` document project conventions for AI tooling. `PRODUCT.md` and `DESIGN.md` are the brand / design source of truth (consumed by the `impeccable` skill).

## Scripts

```bash
pnpm dev      # next dev
pnpm build    # next build
pnpm start    # next start (after build)
pnpm lint     # eslint
```

## Notes

- This Next.js install has breaking changes from training-data versions. See `AGENTS.md`: read `node_modules/next/dist/docs/` before touching framework-level APIs.
- Tailwind tokens live in `app/globals.css` under the `@theme` block. Editing color or motion tokens? Update `DESIGN.md` to keep the doc honest.
- All numerics use the mono font with tabular-nums. Don't break that.
