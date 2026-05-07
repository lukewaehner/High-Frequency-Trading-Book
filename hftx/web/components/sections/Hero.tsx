"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowDown, GithubLogo, Lightning } from "@phosphor-icons/react";
import { useEffect } from "react";
import { useLatencyStore, useMarketStore } from "@/lib/store";
import { formatNs, formatPrice, formatThroughput } from "@/lib/format";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { SectionLabel } from "@/components/ui/primitives";

export function Hero() {
  const bestBid = useMarketStore((s) => s.bestBid);
  const bestAsk = useMarketStore((s) => s.bestAsk);
  const trades = useMarketStore((s) => s.trades);
  const samples = useLatencyStore((s) => s.samples);
  const throughput = useLatencyStore((s) => s.throughputOps);

  const lastLatency = samples[0] ?? 0;
  const lastTrade = trades[0];
  const spread =
    bestBid != null && bestAsk != null ? bestAsk - bestBid : null;

  // Magnetic scroll-cue arrow
  const cueY = useMotionValue(0);
  const cueSmoothed = useSpring(cueY, { stiffness: 80, damping: 18 });
  useEffect(() => {
    const interval = setInterval(() => {
      cueY.set(cueY.get() === 0 ? 6 : 0);
    }, 1200);
    return () => clearInterval(interval);
  }, [cueY]);

  return (
    <section className="relative isolate overflow-hidden">
      {/* Editorial number ghost in the background */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 right-[-6vw] select-none font-display text-[34vw] font-extrabold leading-none tracking-tighter text-fg/[0.025] md:text-[24vw]"
      >
        113
      </div>

      <div className="relative mx-auto grid min-h-[calc(100dvh-3rem)] max-w-[1400px] grid-cols-1 gap-10 px-6 pb-20 pt-16 md:grid-cols-12 md:gap-16 md:px-10 md:pb-32 md:pt-24">
        <div className="col-span-1 flex flex-col justify-between md:col-span-7">
          <SectionLabel index="00 / Engine" title="An order book in Rust" />

          <div className="flex flex-col gap-8">
            <h1 className="font-display text-[clamp(2.75rem,7vw,6.25rem)] font-extrabold leading-[0.92] tracking-[-0.03em] text-fg">
              An order book that
              <br />
              <span className="text-amber">runs at the speed</span>
              <br />
              of cache.
            </h1>

            <p className="max-w-[58ch] text-[15px] leading-relaxed text-fg-muted md:text-base">
              HFTX is a lock-free, price-time-priority matching engine written
              in Rust.{" "}
              <span className="text-fg">113 ns per order.</span>{" "}
              <span className="text-fg">~1.5 µs end-to-end.</span>{" "}
              <span className="text-fg">200k orders/sec, sustained.</span>{" "}
              Below: the engine running, with you at the controls.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#sim"
                className="group inline-flex h-11 items-center gap-2.5 rounded-full bg-amber px-5 font-mono text-xs uppercase tracking-[0.18em] text-bg transition-all hover:bg-amber-glow active:scale-[0.97]"
                style={{
                  boxShadow:
                    "inset 0 1px 0 oklch(1 0 0 / 0.18), inset 0 -1px 0 oklch(0 0 0 / 0.35), 0 8px 28px -10px oklch(0.78 0.16 78 / 0.55)",
                }}
              >
                <Lightning weight="fill" size={14} />
                Run the sim
              </a>
              <a
                href="https://github.com/lukewaehner/hft-ledger"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2.5 rounded-full border border-line px-5 font-mono text-xs uppercase tracking-[0.18em] text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
              >
                <GithubLogo weight="regular" size={14} />
                Read the source
              </a>
            </div>
          </div>

          <motion.div
            style={{ y: cueSmoothed }}
            className="hidden items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-dim md:flex"
          >
            <ArrowDown size={14} />
            Scroll to watch it work
          </motion.div>
        </div>

        {/* Right scope — live readouts, anti-card */}
        <div className="col-span-1 flex flex-col justify-end gap-2 md:col-span-5 md:justify-center">
          <ScopeRow
            label="Best bid"
            value={bestBid != null ? formatPrice(bestBid) : "—"}
            unit="USD"
            tone="bid"
          />
          <ScopeRow
            label="Best ask"
            value={bestAsk != null ? formatPrice(bestAsk) : "—"}
            unit="USD"
            tone="ask"
          />
          <ScopeRow
            label="Spread"
            value={spread != null ? `${spread}` : "—"}
            unit="ticks"
            tone="default"
          />
          <ScopeRow
            label="Last trade"
            value={lastTrade ? formatPrice(lastTrade.px_ticks) : "—"}
            unit={lastTrade ? `${lastTrade.qty}@` : ""}
            tone="amber"
          />
          <ScopeRow
            label="Round-trip"
            value={
              <AnimatedNumber
                value={lastLatency}
                format={(n) => (n > 0 ? formatNs(n) : "—")}
                duration={400}
              />
            }
            tone="amber"
          />
          <ScopeRow
            label="Throughput"
            value={
              <AnimatedNumber
                value={throughput}
                format={(n) => (n > 0 ? formatThroughput(n) : "—")}
                duration={420}
              />
            }
            unit="orders/s"
            tone="default"
          />
        </div>
      </div>
    </section>
  );
}

function ScopeRow({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone: "default" | "amber" | "bid" | "ask";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber"
      : tone === "bid"
        ? "text-bid"
        : tone === "ask"
          ? "text-ask"
          : "text-fg";

  const transform = useTransform(useMotionValue(1), (v) => `scale(${v})`);
  return (
    <motion.div
      style={{ transform }}
      className="group flex items-baseline justify-between border-t border-line-soft py-4 first:border-t-0"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
        {label}
      </span>
      <span className="flex items-baseline gap-2">
        <span
          className={`font-mono text-3xl tracking-tight md:text-4xl ${toneClass}`}
        >
          {value}
        </span>
        {unit && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-dim">
            {unit}
          </span>
        )}
      </span>
    </motion.div>
  );
}
