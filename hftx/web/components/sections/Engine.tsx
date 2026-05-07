"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { percentile, useLatencyStore } from "@/lib/store";
import { formatNs } from "@/lib/format";
import { SectionLabel } from "@/components/ui/primitives";

// Static engine numbers (from README benchmarks).
const BENCHMARKS = [
  { label: "Best bid lookup", value: "3.5", unit: "ns" },
  { label: "Order submission", value: "113", unit: "ns" },
  { label: "Match end-to-end", value: "1.47", unit: "µs" },
  { label: "Sustained throughput", value: "200k–500k", unit: "ops/s" },
  { label: "p99 order processing", value: "<2", unit: "µs" },
  { label: "Memory model", value: "Zero-copy", unit: "" },
];

export function Engine() {
  return (
    <section
      id="engine"
      className="relative border-t border-line-soft bg-bg-sunken/40"
    >
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-32">
        <header className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <SectionLabel index="03 / Engine" title="Where the time goes" />
            <h2 className="mt-5 max-w-[18ch] font-display text-4xl font-extrabold leading-[0.95] tracking-tighter text-fg md:text-6xl">
              Inside the engine,
              <br />
              <span className="text-amber">measured cold.</span>
            </h2>
          </div>
          <p className="max-w-[44ch] text-[14px] leading-relaxed text-fg-muted md:col-span-5 md:text-[15px]">
            The histogram below is what your browser sees: HTTP round-trip,
            mutex, match, response. The numbers underneath are what Criterion
            sees in isolation — the engine, alone with itself.
          </p>
        </header>

        <RoundTripHistogram />

        <Bento />
      </div>
    </section>
  );
}

function RoundTripHistogram() {
  const samples = useLatencyStore((s) => s.samples);
  const totalSubmitted = useLatencyStore((s) => s.totalSubmitted);

  const { bins, max } = useMemo(() => {
    // Convert ns → ms for binning. Histogram covers 0–60 ms in 24 bins (2.5ms each).
    const BIN_WIDTH_MS = 2.5;
    const NUM_BINS = 24;
    const counts = new Array(NUM_BINS).fill(0);
    samples.forEach((ns) => {
      const ms = ns / 1_000_000;
      const idx = Math.min(NUM_BINS - 1, Math.max(0, Math.floor(ms / BIN_WIDTH_MS)));
      counts[idx]++;
    });
    return {
      bins: counts.map((c, i) => ({
        idx: i,
        count: c,
        rangeStart: i * BIN_WIDTH_MS,
        rangeEnd: (i + 1) * BIN_WIDTH_MS,
      })),
      max: Math.max(1, ...counts),
    };
  }, [samples]);

  const p50 = percentile(samples, 0.5);
  const p99 = percentile(samples, 0.99);

  return (
    <div className="mb-20 rounded-3xl border border-line bg-bg-elevated/40 p-6 md:p-10">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
            Round-trip latency
          </span>
          <span className="font-mono text-[11px] text-fg-dim">
            {totalSubmitted.toLocaleString("en-US")} samples
          </span>
        </div>
        <div className="flex items-baseline gap-6 font-mono text-xs">
          <span className="text-fg-dim">
            p50{" "}
            <span className="text-fg">
              {p50 != null ? formatNs(p50) : "—"}
            </span>
          </span>
          <span className="text-fg-dim">
            p99{" "}
            <span className="text-amber">
              {p99 != null ? formatNs(p99) : "—"}
            </span>
          </span>
        </div>
      </div>

      <div className="flex h-44 items-end gap-1 md:gap-1.5">
        {bins.map((b) => {
          const h = (b.count / max) * 100;
          return (
            <motion.div
              key={b.idx}
              className="group relative flex-1"
              animate={{ opacity: b.count > 0 ? 1 : 0.3 }}
            >
              <motion.div
                animate={{ height: `${h}%` }}
                transition={{
                  type: "spring",
                  stiffness: 220,
                  damping: 26,
                }}
                className="w-full rounded-sm bg-amber"
                style={{ minHeight: b.count > 0 ? 4 : 1 }}
              />
              {b.count > 0 && (
                <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-bg px-2 py-1 font-mono text-[10px] text-fg-muted opacity-0 transition-opacity group-hover:opacity-100">
                  {b.rangeStart.toFixed(1)}–{b.rangeEnd.toFixed(1)}ms · {b.count}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="mt-3 flex justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-fg-dim">
        <span>0ms</span>
        <span>30ms</span>
        <span>60ms+</span>
      </div>

      {samples.length === 0 && (
        <div className="mt-6 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-dim">
          No samples yet — submit an order or run the sim
        </div>
      )}
    </div>
  );
}

function Bento() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-6 md:gap-5">
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
    </div>
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
