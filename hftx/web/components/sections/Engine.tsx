"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useLatencyStore } from "@/lib/store";
import { formatNs } from "@/lib/format";
import { SectionLabel } from "@/components/ui/primitives";
import { Reveal, RevealStagger } from "@/components/ui/Reveal";

export function Engine() {
  return (
    <section
      id="engine"
      className="relative border-t border-line-soft bg-bg-sunken/40"
    >
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-32">
        <header className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <Reveal direction="left">
              <SectionLabel index="03 / Engine" title="Where the time goes" />
            </Reveal>
            <Reveal direction="up" delay={0.1}>
              <h2 className="mt-5 max-w-[18ch] font-display text-4xl font-extrabold leading-[0.95] tracking-tighter text-fg md:text-6xl">
                Inside the engine,
                <br />
                <span className="text-amber">measured cold.</span>
              </h2>
            </Reveal>
          </div>
          <Reveal
            direction="up"
            delay={0.18}
            className="max-w-[44ch] text-[14px] leading-relaxed text-fg-muted md:col-span-5 md:text-[15px]"
          >
            The histogram below is what your browser sees: HTTP round-trip,
            mutex, match, response. The numbers underneath are what Criterion
            sees in isolation. The engine, alone with itself.
          </Reveal>
        </header>

        <Reveal direction="up" amount={0.15}>
          <RoundTripHistogram />
        </Reveal>

        <Bento />
      </div>
    </section>
  );
}

// Sparkline configuration. Sample counts and timing are tuned for human
// readability over data fidelity — store keeps full resolution, this view
// shows a smoothed snapshot.
const VISIBLE_SAMPLES = 80;
// Chart re-render cadence. Store still ingests at 60Hz; we just snapshot
// it on this slower beat so heights are easy to track by eye.
const SNAPSHOT_MS = 250;
// Percentile used as the "ceiling" of the chart. Values above clip to 100%.
// 0.95 means the top ~5% of samples saturate, the bottom 95% use full range.
const SCALE_PERCENTILE = 0.95;
// EWMA factor for the smoothed ceiling — higher = faster response, lower =
// steadier. 0.18 gives ~3-4s effective window.
const SCALE_EWMA = 0.18;
// Minimum ceiling so a quiet engine doesn't divide-by-near-zero and make
// every flicker fill the screen. 100µs is below the engine's normal range.
const MIN_CEILING_NS = 100_000;

interface ChartSnapshot {
  bars: number[];          // visible window, oldest → newest
  ceiling: number;         // smoothed scale max (ns)
  latest: number | null;
  windowMax: number;       // raw max in the visible window
  clipped: number;         // count of bars exceeding ceiling
  p50: number | null;      // overall p50 across all stored samples
  p99: number | null;      // overall p99 across all stored samples
}

const EMPTY_SNAPSHOT: ChartSnapshot = {
  bars: [],
  ceiling: MIN_CEILING_NS,
  latest: null,
  windowMax: 0,
  clipped: 0,
  p50: null,
  p99: null,
};

function RoundTripHistogram() {
  const totalSubmitted = useLatencyStore((s) => s.totalSubmitted);
  const [snapshot, setSnapshot] = useState<ChartSnapshot>(EMPTY_SNAPSHOT);
  const ceilingRef = useRef<number>(MIN_CEILING_NS);

  // Periodic snapshot — decouples render rate from sample arrival rate.
  // Reads the store directly via getState() so we don't subscribe to every
  // sample push. Store keeps real-time data; this just picks slow frames off it.
  useEffect(() => {
    const tick = () => {
      const samples = useLatencyStore.getState().samples;
      if (samples.length === 0) {
        setSnapshot(EMPTY_SNAPSHOT);
        return;
      }
      const window = samples.slice(0, VISIBLE_SAMPLES);
      const windowSorted = window.slice().sort((a, b) => a - b);
      const pickIdx = Math.min(
        windowSorted.length - 1,
        Math.max(0, Math.floor(windowSorted.length * SCALE_PERCENTILE)),
      );
      const target = Math.max(MIN_CEILING_NS, windowSorted[pickIdx]);

      // EWMA toward the target. Smooths jumps when an outlier enters/leaves.
      ceilingRef.current =
        ceilingRef.current * (1 - SCALE_EWMA) + target * SCALE_EWMA;

      let clipped = 0;
      for (let i = 0; i < window.length; i++) {
        if (window[i] > ceilingRef.current) clipped++;
      }

      // Percentiles across the FULL stored buffer (200 samples) — these are
      // the headline numbers, more stable than the visible-window percentiles.
      const allSorted = samples.slice().sort((a, b) => a - b);
      const pickAll = (q: number) =>
        allSorted[
          Math.min(allSorted.length - 1, Math.max(0, Math.floor(allSorted.length * q)))
        ];

      setSnapshot({
        bars: window.slice().reverse(),
        ceiling: ceilingRef.current,
        latest: window[0],
        windowMax: windowSorted[windowSorted.length - 1],
        clipped,
        p50: pickAll(0.5),
        p99: pickAll(0.99),
      });
    };
    tick();
    const t = setInterval(tick, SNAPSHOT_MS);
    return () => clearInterval(t);
  }, []);

  // Dev-only: log periodic stats so we can verify scaling against real data.
  // Open devtools console to copy/share the output.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const t = setInterval(() => {
      const samples = useLatencyStore.getState().samples;
      if (samples.length === 0) return;
      const sorted = samples.slice().sort((a, b) => a - b);
      const p = (q: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
      // eslint-disable-next-line no-console
      console.log("[hftx-latency]", {
        n: samples.length,
        min_ns: sorted[0],
        max_ns: sorted[sorted.length - 1],
        p50_ns: p(0.5),
        p90_ns: p(0.9),
        p95_ns: p(0.95),
        p99_ns: p(0.99),
        ceiling_ns: Math.round(ceilingRef.current),
      });
    }, 3000);
    return () => clearInterval(t);
  }, []);

  const { bars, ceiling, latest, windowMax, clipped, p50, p99 } = snapshot;
  const hasData = bars.length > 0;

  return (
    <div className="mb-20 rounded-3xl border border-line bg-bg-elevated/40 p-6 md:p-10">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
            Engine latency
          </span>
          <span className="font-mono text-[11px] text-fg-dim tabular-nums">
            {totalSubmitted.toLocaleString("en-US")} samples
          </span>
          {clipped > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-dim">
              · {clipped} above scale
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-6 font-mono text-xs">
          <Stat label="p50" value={p50} tone="default" />
          <Stat label="p99" value={p99} tone="amber" />
        </div>
      </div>

      <div className="relative flex h-44 items-end gap-px md:gap-[2px]">
        {/* Ceiling reference line + label */}
        {hasData && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-fg-dim/30"
            />
            <span className="absolute right-0 top-[-1.3rem] flex items-baseline gap-1.5 font-mono text-[10px] tabular-nums text-fg-dim">
              <span className="uppercase tracking-[0.18em]">scale</span>
              <span className="text-amber">{formatNs(ceiling)}</span>
            </span>
          </>
        )}

        {bars.map((value, i) => {
          const ratio = value / ceiling;
          const h = Math.max(2, Math.min(100, ratio * 100));
          const isClipped = ratio > 1;
          return (
            <motion.div
              key={i}
              className={`flex-1 rounded-[1px] ${
                isClipped ? "bg-ask" : "bg-amber/85"
              }`}
              initial={false}
              animate={{ height: `${h}%` }}
              transition={{ type: "spring", stiffness: 180, damping: 26 }}
            />
          );
        })}
      </div>

      <div className="mt-3 flex items-baseline justify-between font-mono text-[10px] tabular-nums text-fg-dim">
        <span className="uppercase tracking-[0.18em]">
          ← {bars.length} samples
        </span>
        <span className="flex items-baseline gap-3">
          <span className="flex items-baseline gap-1.5">
            <span className="uppercase tracking-[0.18em]">peak</span>
            <span className="text-fg">
              {hasData ? formatNs(windowMax) : "—"}
            </span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="uppercase tracking-[0.18em]">latest</span>
            <span className="text-fg">
              {latest != null ? formatNs(latest) : "—"}
            </span>
          </span>
        </span>
      </div>

      {!hasData && (
        <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-dim">
          No samples yet. Submit an order or run the sim.
        </div>
      )}
    </div>
  );
}

// Mono numeric stats. Renders the label uppercase but leaves the value alone
// so the unit (e.g. "µs") doesn't get mangled by text-transform.
function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "default" | "amber";
}) {
  return (
    <span className="flex items-baseline gap-1.5 text-fg-dim">
      <span className="uppercase tracking-[0.18em]">{label}</span>
      <span
        className={`tabular-nums ${tone === "amber" ? "text-amber" : "text-fg"}`}
      >
        {value != null ? formatNs(value) : "—"}
      </span>
    </span>
  );
}

function Bento() {
  return (
    <RevealStagger
      className="grid grid-cols-2 gap-4 md:grid-cols-6 md:gap-5"
      stagger={0.05}
      amount={0.15}
    >
      {/* Hero stat: throughput */}
      <BentoCell
        size="2x2"
        accent
        label="Sustained throughput"
        value="200k–500k"
        unit="orders/sec"
        sub="Mixed workload, single core"
      />

      <BentoCell
        size="1x1"
        label="Order submit"
        value="113"
        unit="ns"
        sub="Non-crossing limit"
      />
      <BentoCell
        size="1x1"
        label="Best bid lookup"
        value="3.5"
        unit="ns"
        sub="O(log n) BTreeMap"
      />
      <BentoCell
        size="2x1"
        label="Match end-to-end"
        value="1.47"
        unit="µs"
        sub="Cross-spread execution, including trade record generation"
      />

      <BentoCell
        size="1x2"
        label="Architecture"
        value="Lock-free"
        sub="DashMap + RwLock per book; broadcast channels; tokio::select! per stream."
      />

      <BentoCell
        size="2x1"
        label="Memory profile"
        value="Zero-copy"
        sub="No allocation in the hot path. Lazy cancellation. VecDeque queues."
      />
      <BentoCell
        size="1x1"
        label="Tail latency"
        value="<2"
        unit="µs"
        sub="p99 processing"
      />
      <BentoCell
        size="1x1"
        label="Cancellation"
        value="Lazy"
        sub="Tombstoned, swept on match"
      />
      <BentoCell
        size="1x1"
        label="Stack"
        value="Rust"
        sub="Axum + tokio"
      />
    </RevealStagger>
  );
}

function BentoCell({
  size,
  accent,
  label,
  value,
  unit,
  sub,
}: {
  size: "1x1" | "2x1" | "1x2" | "2x2";
  accent?: boolean;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  const sizeClass = {
    "1x1": "col-span-1",
    "2x1": "col-span-2",
    "1x2": "col-span-1 row-span-2",
    "2x2": "col-span-2 row-span-2",
  }[size];

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 18 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
        },
      }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 340, damping: 28 }}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-bg-elevated/40 p-5 md:p-6 ${sizeClass} ${
        accent ? "bg-bg-elevated" : ""
      }`}
      style={
        accent
          ? {
              boxShadow:
                "inset 0 1px 0 oklch(1 0 0 / 0.04), 0 24px 60px -30px oklch(0.78 0.16 78 / 0.25)",
            }
          : undefined
      }
    >
      {accent && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-2xl"
          style={{
            background:
              "radial-gradient(ellipse at top, oklch(0.78 0.16 78 / 0.08), transparent 60%)",
          }}
        />
      )}
      <span className="relative font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
        {label}
      </span>
      <div className="relative flex items-baseline gap-2">
        <span
          className={`font-mono tabular-nums tracking-tight ${
            size === "2x2"
              ? "text-6xl md:text-7xl"
              : size === "2x1" || size === "1x2"
                ? "text-4xl md:text-5xl"
                : "text-3xl md:text-4xl"
          } ${accent ? "text-amber" : "text-fg"}`}
        >
          {value}
        </span>
        {unit && (
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-dim">
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <p className="relative mt-3 max-w-[40ch] text-[12px] leading-relaxed text-fg-muted">
          {sub}
        </p>
      )}
    </motion.div>
  );
}
