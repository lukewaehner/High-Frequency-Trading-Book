"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { Pause, Play } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef } from "react";
import {
  percentile,
  type SimMode,
  useLatencyStore,
  useMarketStore,
  useSimStore,
} from "@/lib/store";
import { startServerSim, stopServerSim } from "@/lib/exchange";
import { formatNs, formatQty, formatThroughput } from "@/lib/format";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { SectionLabel } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";

const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

export function Sim() {
  const running = useSimStore((s) => s.running);
  const setRunning = useSimStore((s) => s.setRunning);
  const mode = useSimStore((s) => s.mode);
  const setMode = useSimStore((s) => s.setMode);
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

  // Auto-start the sim once on first scroll-into-view. The section's headline
  // ("Watch it absorb") promises a live engine; we honor that by booting on
  // arrival instead of waiting for a click. Subsequent pauses are user-owned.
  const sectionRef = useRef<HTMLElement | null>(null);
  const inView = useInView(sectionRef, { amount: 0.35, once: true });
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (inView && !autoStartedRef.current) {
      autoStartedRef.current = true;
      setRunning(true);
    }
  }, [inView, setRunning]);

  // When running in server mode, push config to the engine and re-push on any
  // slider tweak so the bot driver picks up new params live. Stopping the
  // toggle (or switching back to browser mode) cancels the server task.
  useEffect(() => {
    if (mode !== "server") return;
    const symbol = useMarketStore.getState().symbol;
    if (running) {
      startServerSim({
        symbol,
        makers: makerCount,
        takers: takerCount,
        aggression,
        tick_ms: tickMs,
      }).catch(() => {});
    } else {
      stopServerSim(symbol).catch(() => {});
    }
  }, [mode, running, makerCount, takerCount, aggression, tickMs]);

  // When switching from server -> browser while running, make sure the server
  // task is torn down even though the running flag stays true.
  useEffect(() => {
    if (mode === "browser") {
      const symbol = useMarketStore.getState().symbol;
      stopServerSim(symbol).catch(() => {});
    }
  }, [mode]);

  const handleRunToggle = () => {
    setRunning(!running);
  };

  return (
    <section
      ref={sectionRef}
      id="sim"
      className="relative border-t border-line-soft bg-bg"
    >
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-32">
        <header className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <Reveal direction="left">
              <SectionLabel
                index="02 / Simulation"
                title="Stress the engine"
              />
            </Reveal>
            <Reveal direction="up" delay={0.1}>
              <h2 className="mt-5 max-w-[16ch] font-display text-4xl font-extrabold leading-[0.95] tracking-tighter text-fg md:text-6xl">
                Spawn flow.
                <br />
                <span className="text-amber">Watch it absorb.</span>
              </h2>
            </Reveal>
          </div>
          <Reveal
            direction="up"
            delay={0.18}
            className="max-w-[44ch] text-[14px] leading-relaxed text-fg-muted md:col-span-5 md:text-[15px]"
          >
            Synthetic market makers quote around mid; takers cross the spread
            on a Poisson tick. Push the sliders. The engine doesn&rsquo;t care
            what you throw at it.
          </Reveal>
        </header>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          {/* Controls */}
          <div className="flex flex-col gap-8 lg:col-span-5">
            <ModeToggle mode={mode} onChange={setMode} disabled={running} />
            <button
              type="button"
              onClick={handleRunToggle}
              className={`group inline-flex h-14 items-center justify-center gap-3 rounded-full font-mono text-xs uppercase tracking-[0.22em] transition-all active:scale-[0.98] ${
                running
                  ? "shadow-cta-running bg-fg text-bg hover:bg-fg-muted"
                  : "shadow-cta-amber bg-amber text-bg hover:bg-amber-glow"
              }`}
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
              hint="Passive bots quoting both sides of the book"
            />
            <Slider
              label="Takers"
              value={takerCount}
              onChange={setTakerCount}
              min={0}
              max={60}
              step={1}
              unit=""
              hint="Aggressors crossing the spread (Poisson-distributed)"
            />
            <Slider
              label="Aggression"
              value={aggression}
              onChange={setAggression}
              min={0}
              max={100}
              step={1}
              unit="%"
              hint="Tighter spreads, more crossing"
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
            />
          </div>

          {/* Metrics + bot field */}
          <div className="flex flex-col gap-10 lg:col-span-7">
            <BotField
              running={running}
              makerCount={makerCount}
              takerCount={takerCount}
            />

            <div className="flex flex-col gap-8">
              <MetricCell
                variant="hero"
                label="Throughput"
                value={
                  <AnimatedNumber
                    value={throughput}
                    format={(n) => (n > 0 ? formatThroughput(n) : "—")}
                    duration={220}
                  />
                }
                unit="ops/s"
                tone="amber"
                pulsing={running}
              />
              <div className="hairline" />
              <div className="grid grid-cols-3 gap-x-8 gap-y-6">
                <MetricCell
                  label="Submitted"
                  value={formatQty(totalSubmitted)}
                  unit="orders"
                />
                <MetricCell
                  label="Filled"
                  value={formatQty(totalFilled)}
                  unit="trades"
                />
                <MetricCell
                  label="Fill rate"
                  value={(fillRate * 100).toFixed(1)}
                  unit="%"
                />
              </div>
              <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-6">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber/70">
                  Latency
                </span>
                <div className="grid grid-cols-2 gap-x-8">
                  <MetricCell
                    label="p50"
                    value={p50 != null ? formatNs(p50) : "—"}
                    tone="default"
                  />
                  <MetricCell
                    label="p99"
                    value={p99 != null ? formatNs(p99) : "—"}
                    tone="default"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: SimMode;
  onChange: (m: SimMode) => void;
  disabled?: boolean;
}) {
  const options: { value: SimMode; label: string }[] = [
    { value: "browser", label: "Browser-side" },
    { value: "server", label: "Server-side" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
        Load source
      </span>
      <div
        className={`relative grid grid-cols-2 rounded-full border border-line bg-bg-sunken p-1 ${
          disabled ? "opacity-60" : ""
        }`}
      >
        {options.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={`relative z-10 h-9 rounded-full font-mono text-[10px] uppercase tracking-[0.22em] transition-colors ${
                active ? "text-bg" : "text-fg-muted hover:text-fg"
              } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
            >
              {active && (
                <motion.span
                  layoutId="mode-toggle-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-amber"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              {opt.label}
            </button>
          );
        })}
      </div>
      <span className="font-mono text-[10px] text-fg-dim">
        {mode === "browser"
          ? "Browser dispatches one HTTP batch per tick."
          : "Engine generates orders in-process; histogram fed via WebSocket."}
      </span>
    </div>
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
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint?: string;
}) {
  const fillPct = ((value - min) / (max - min)) * 100;
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
      <div className="relative h-5">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line-soft" />
        <div
          className="pointer-events-none absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-amber/80"
          style={{ width: `${fillPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-fg [&::-webkit-slider-thumb]:shadow-[0_2px_8px_oklch(0_0_0/0.4)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-moz-range-track]:border-0
            [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-fg [&::-moz-range-thumb]:shadow-[0_2px_8px_oklch(0_0_0/0.4)] [&::-moz-range-thumb]:transition-transform [&::-moz-range-thumb]:hover:scale-110"
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
  variant = "default",
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone?: "default" | "amber";
  pulsing?: boolean;
  variant?: "default" | "hero";
}) {
  const isHero = variant === "hero";
  return (
    <div className={`flex flex-col ${isHero ? "gap-3" : "gap-2"}`}>
      <div className="flex items-center gap-2">
        <span
          className={`font-mono uppercase text-fg-dim ${
            isHero
              ? "text-[11px] tracking-[0.24em]"
              : "text-[10px] tracking-[0.22em]"
          }`}
        >
          {label}
        </span>
        {pulsing && (
          <span className="h-1 w-1 rounded-full bg-amber pulse-dot" aria-hidden />
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={`font-mono tracking-tight tabular-nums ${
            tone === "amber" ? "text-amber" : "text-fg"
          } ${isHero ? "text-5xl md:text-6xl" : "text-3xl"}`}
        >
          {value}
        </span>
        {unit && (
          <span
            className={`font-mono uppercase text-fg-dim ${
              isHero
                ? "text-xs tracking-[0.2em]"
                : "text-[10px] tracking-[0.18em]"
            }`}
          >
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
  const reduced = useReducedMotion();

  // Persistent per-dot seeds. Without this, adjusting one slider resets every
  // dot's animation phase, which reads as flicker rather than rhythm.
  const seedsRef = useRef<number[]>([]);
  while (seedsRef.current.length < total) {
    seedsRef.current.push(Math.random());
  }

  const dots = useMemo(
    () =>
      Array.from({ length: total }, (_, i) => ({
        id: i,
        kind: i < makerCount ? "m" : "t",
        seed: seedsRef.current[i] ?? 0,
      })),
    [total, makerCount],
  );

  return (
    <div className="rounded-2xl border border-line bg-bg-sunken/50 p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
          Bot field · {total} active
        </span>
        <span className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-dim">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-bid" />
            {makerCount} makers
          </span>
          <span className="text-line">/</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ask" />
            {takerCount} takers
          </span>
        </span>
      </div>
      <div className="flex min-h-[88px] flex-wrap content-center gap-1.5">
        {dots.length === 0 && (
          <span className="font-mono text-[11px] text-fg-dim">
            Field empty. Add makers or takers to feed the engine.
          </span>
        )}
        {dots.map((d) => {
          const animate =
            running && !reduced
              ? { opacity: [0.45, 1], scale: [1, 1.45] }
              : { opacity: running ? 0.85 : 0.4, scale: 1 };
          const transition =
            running && !reduced
              ? {
                  duration: 1.0 + d.seed * 1.3,
                  repeat: Infinity,
                  repeatType: "mirror" as const,
                  ease: EASE_OUT_QUART,
                  delay: d.seed * 0.7,
                }
              : { duration: 0.25, ease: EASE_OUT_QUART };
          return (
            <motion.span
              key={d.id}
              className={`h-1.5 w-1.5 rounded-full ${
                d.kind === "m" ? "bg-bid" : "bg-ask"
              }`}
              animate={animate}
              transition={transition}
            />
          );
        })}
      </div>
    </div>
  );
}
