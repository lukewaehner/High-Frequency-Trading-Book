"use client";

import { motion } from "framer-motion";
import { Pause, Play } from "@phosphor-icons/react";
import { useMemo } from "react";
import { percentile, useLatencyStore, useSimStore } from "@/lib/store";
import { formatNs, formatThroughput } from "@/lib/format";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { SectionLabel } from "@/components/ui/primitives";

export function Sim() {
  const running = useSimStore((s) => s.running);
  const setRunning = useSimStore((s) => s.setRunning);
  const makerCount = useSimStore((s) => s.makerCount);
  const setMakerCount = useSimStore((s) => s.setMakerCount);
  const takerCount = useSimStore((s) => s.takerCount);
  const setTakerCount = useSimStore((s) => s.setTakerCount);
  const aggression = useSimStore((s) => s.aggression);
  const setAggression = useSimStore((s) => s.setAggression);
  const tickMs = useSimStore((s) => s.tickMs);
  const setTickMs = useSimStore((s) => s.setTickMs);

  const samples = useLatencyStore((s) => s.samples);
  const totalSubmitted = useLatencyStore((s) => s.totalSubmitted);
  const totalFilled = useLatencyStore((s) => s.totalFilled);
  const throughput = useLatencyStore((s) => s.throughputOps);

  const p50 = percentile(samples, 0.5);
  const p99 = percentile(samples, 0.99);

  const fillRate = totalSubmitted === 0 ? 0 : totalFilled / totalSubmitted;

  return (
    <section
      id="sim"
      className="relative border-t border-line-soft bg-bg"
    >
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-32">
        <header className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <SectionLabel index="02 / Simulation" title="Stress the engine" />
            <h2 className="mt-5 max-w-[16ch] font-display text-4xl font-extrabold leading-[0.95] tracking-tighter text-fg md:text-6xl">
              Spawn flow.
              <br />
              <span className="text-amber">Watch it absorb.</span>
            </h2>
          </div>
          <p className="max-w-[44ch] text-[14px] leading-relaxed text-fg-muted md:col-span-5 md:text-[15px]">
            Synthetic market makers quote around mid; takers cross the spread
            on a Poisson tick. Push the sliders. The engine doesn&rsquo;t care
            what you throw at it.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          {/* Controls */}
          <div className="flex flex-col gap-8 lg:col-span-5">
            <button
              type="button"
              onClick={() => setRunning(!running)}
              className={`group inline-flex h-14 items-center justify-center gap-3 rounded-full font-mono text-xs uppercase tracking-[0.22em] transition-all active:scale-[0.98] ${
                running
                  ? "bg-fg text-bg hover:bg-fg-muted"
                  : "bg-amber text-bg hover:bg-amber-glow"
              }`}
              style={{
                boxShadow: running
                  ? "inset 0 1px 0 oklch(1 0 0 / 0.2), inset 0 -1px 0 oklch(0 0 0 / 0.4)"
                  : "inset 0 1px 0 oklch(1 0 0 / 0.18), inset 0 -1px 0 oklch(0 0 0 / 0.35), 0 12px 36px -12px oklch(0.78 0.16 78 / 0.6)",
              }}
            >
              {running ? (
                <>
                  <Pause weight="fill" size={16} />
                  Pause sim
                </>
              ) : (
                <>
                  <Play weight="fill" size={16} />
                  Run sim
                </>
              )}
            </button>

            <Slider
              label="Market makers"
              value={makerCount}
              onChange={setMakerCount}
              min={0}
              max={120}
              step={1}
              unit=""
              hint="Quoting bots that rest at varying depth"
            />
            <Slider
              label="Takers"
              value={takerCount}
              onChange={setTakerCount}
              min={0}
              max={60}
              step={1}
              unit=""
              hint="Crossers — Poisson-driven aggressors"
            />
            <Slider
              label="Aggression"
              value={aggression}
              onChange={setAggression}
              min={0}
              max={100}
              step={1}
              unit="%"
              hint="Tighter quotes, higher cross probability"
            />
            <Slider
              label="Tick rate"
              value={tickMs}
              onChange={setTickMs}
              min={10}
              max={1000}
              step={5}
              unit="ms"
              hint="Lower = more orders per second"
              invertVisual
            />
          </div>

          {/* Metrics + bot field */}
          <div className="flex flex-col gap-10 lg:col-span-7">
            <BotField
              running={running}
              makerCount={makerCount}
              takerCount={takerCount}
            />

            <div className="grid grid-cols-2 gap-x-10 gap-y-8 md:grid-cols-3">
              <MetricCell
                label="Throughput"
                value={
                  <AnimatedNumber
                    value={throughput}
                    format={(n) => (n > 0 ? formatThroughput(n) : "—")}
                    duration={400}
                  />
                }
                unit="ops/s"
                tone="amber"
                pulsing={running && throughput > 0}
              />
              <MetricCell
                label="Submitted"
                value={totalSubmitted.toLocaleString("en-US")}
                unit="orders"
              />
              <MetricCell
                label="Fill rate"
                value={(fillRate * 100).toFixed(1)}
                unit="%"
              />
              <MetricCell
                label="p50 latency"
                value={p50 != null ? formatNs(p50) : "—"}
                tone="default"
              />
              <MetricCell
                label="p99 latency"
                value={p99 != null ? formatNs(p99) : "—"}
                tone="default"
              />
              <MetricCell
                label="Filled"
                value={totalFilled.toLocaleString("en-US")}
                unit="trades"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  hint,
  invertVisual,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint?: string;
  invertVisual?: boolean;
}) {
  const ratio = (value - min) / (max - min);
  const fillPct = invertVisual ? 1 - ratio : ratio;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
          {label}
        </label>
        <span className="font-mono text-base text-fg tabular-nums">
          {value}
          <span className="ml-0.5 text-[10px] text-fg-dim">{unit}</span>
        </span>
      </div>
      <div className="relative h-7">
        <div className="absolute inset-y-3 left-0 right-0 rounded-full bg-line-soft" />
        <div
          className="absolute inset-y-3 left-0 rounded-full bg-amber/80"
          style={{ width: `${fillPct * 100}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-fg [&::-webkit-slider-thumb]:shadow-[0_2px_8px_oklch(0_0_0/0.4)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
        />
      </div>
      {hint && (
        <span className="font-mono text-[10px] text-fg-dim">{hint}</span>
      )}
    </div>
  );
}

function MetricCell({
  label,
  value,
  unit,
  tone = "default",
  pulsing,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone?: "default" | "amber";
  pulsing?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
          {label}
        </span>
        {pulsing && (
          <span className="h-1 w-1 rounded-full bg-amber pulse-dot" aria-hidden />
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`font-mono text-3xl tracking-tight tabular-nums ${
            tone === "amber" ? "text-amber" : "text-fg"
          }`}
        >
          {value}
        </span>
        {unit && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-dim">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function BotField({
  running,
  makerCount,
  takerCount,
}: {
  running: boolean;
  makerCount: number;
  takerCount: number;
}) {
  const total = makerCount + takerCount;
  const dots = useMemo(
    () =>
      Array.from({ length: total }, (_, i) => ({
        id: i,
        kind: i < makerCount ? "m" : "t",
        seed: Math.random(),
      })),
    [total, makerCount],
  );
  return (
    <div className="rounded-2xl border border-line bg-bg-sunken/50 p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
          Bot field · {total} active
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-dim">
          <span className="text-bid">●</span> makers ·{" "}
          <span className="text-ask">●</span> takers
        </span>
      </div>
      <div className="flex min-h-[88px] flex-wrap content-center gap-1.5">
        {dots.length === 0 && (
          <span className="font-mono text-[11px] text-fg-dim">
            No bots — use sliders to add
          </span>
        )}
        {dots.map((d) => (
          <motion.span
            key={d.id}
            className={`h-1.5 w-1.5 rounded-full ${
              d.kind === "m" ? "bg-bid" : "bg-ask"
            }`}
            animate={
              running
                ? {
                    opacity: [0.4, 1, 0.6, 1],
                    scale: [1, 1.4, 0.9, 1.2],
                  }
                : { opacity: 0.45, scale: 1 }
            }
            transition={
              running
                ? {
                    duration: 0.8 + d.seed * 1.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: d.seed * 0.6,
                  }
                : { duration: 0.3 }
            }
          />
        ))}
      </div>
    </div>
  );
}
