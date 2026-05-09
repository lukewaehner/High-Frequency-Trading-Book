"use client";

import {
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { ArrowDown, GithubLogo, Lightning } from "@phosphor-icons/react";
import { useLatencyStore, useMarketStore } from "@/lib/store";
import { formatNs, formatPrice, formatThroughput } from "@/lib/format";
import { useFlashOnChange } from "@/lib/useFlashOnChange";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import {
  MagneticButton,
  Pulse,
  SectionLabel,
} from "@/components/ui/primitives";

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

// Page-load choreography. Each layer has its own timing inside a parent
// stagger container so the sequence reads as one orchestrated entrance,
// not seven independent animations.

const heroParent: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.05,
      staggerChildren: 0.09,
    },
  },
};

const liftIn: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.85, ease: EASE_OUT_EXPO },
  },
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.6, ease: EASE_OUT_EXPO },
  },
};

const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -18 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease: EASE_OUT_EXPO },
  },
};

const titleLineParent: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.08,
      staggerChildren: 0.11,
    },
  },
};

const ghostNumber: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 0.025,
    scale: 1,
    transition: { duration: 1.4, ease: EASE_OUT_EXPO, delay: 0.15 },
  },
};

export function Hero() {
  const reduced = useReducedMotion();
  const bestBid = useMarketStore((s) => s.bestBid);
  const bestAsk = useMarketStore((s) => s.bestAsk);
  const samples = useLatencyStore((s) => s.samples);
  const throughput = useLatencyStore((s) => s.throughputOps);

  const lastLatency = samples[0] ?? 0;
  const hasFeed = bestBid != null || bestAsk != null;

  return (
    <section className="relative isolate overflow-hidden">
      {/* Editorial number ghost — fades in slowly under the title */}
      <motion.div
        aria-hidden
        variants={reduced ? fadeIn : ghostNumber}
        initial="hidden"
        animate="visible"
        style={{
          textShadow:
            "0 0 40px oklch(0.88 0.185 82 / 0.7), 0 0 100px oklch(0.88 0.185 82 / 0.55), 0 0 200px oklch(0.88 0.185 82 / 0.4)",
        }}
        className="pointer-events-none absolute -top-20 right-[-6vw] select-none font-display text-[34vw] font-extrabold leading-none tracking-tighter text-fg md:text-[24vw]"
      >
        113
      </motion.div>

      <motion.div
        variants={heroParent}
        initial={reduced ? false : "hidden"}
        animate="visible"
        className="relative mx-auto grid min-h-[calc(100dvh-3rem)] max-w-[1400px] grid-cols-1 gap-10 px-6 pb-20 pt-16 md:grid-cols-12 md:gap-16 md:px-10 md:pb-32 md:pt-24"
      >
        <div className="col-span-1 flex flex-col justify-between md:col-span-7">
          <motion.div variants={slideInLeft}>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <SectionLabel
                index="00 / Engine"
                title="An order book in Rust"
              />
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
                <Pulse on={hasFeed} />
                {!hasFeed && <span>engine idle</span>}
              </span>
            </div>
          </motion.div>

          <div className="flex flex-col gap-8">
            <motion.h1
              variants={titleLineParent}
              className="font-display text-[clamp(2.75rem,7vw,6.25rem)] font-extrabold leading-[0.92] tracking-[-0.03em] text-fg"
            >
              <motion.span variants={liftIn} className="block">
                An order book that
              </motion.span>
              <motion.span
                variants={liftIn}
                className="block text-amber"
              >
                runs at the speed
              </motion.span>
              <motion.span variants={liftIn} className="block">
                of cache.
              </motion.span>
            </motion.h1>

            <motion.p
              variants={fadeIn}
              className="text-[15px] leading-relaxed text-fg-muted md:text-base"
            >
              A lock-free, price-time-priority matching engine, written in Rust.
            </motion.p>

            <motion.div
              variants={liftIn}
              className="flex flex-wrap items-center gap-3"
            >
              <MagneticButton variant="primary" size="lg" href="#sim">
                <Lightning weight="fill" size={14} />
                Run the sim
              </MagneticButton>
              <MagneticButton
                variant="outline"
                size="lg"
                href="https://github.com/lukewaehner/hft-ledger"
                target="_blank"
                rel="noopener noreferrer"
              >
                <GithubLogo weight="regular" size={14} />
                Read the source
              </MagneticButton>
            </motion.div>
          </div>

          <motion.div
            variants={fadeIn}
            className="mt-12 hidden items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-dim md:flex"
          >
            <ArrowDown size={14} />
            Scroll to watch it work
          </motion.div>
        </div>

        {/* Right scope — readouts come in last as a stack */}
        <motion.div
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: 0.07, delayChildren: 0.2 },
            },
          }}
          className="col-span-1 flex flex-col justify-end gap-2 md:col-span-5 md:justify-center"
        >
          <ScopeRow
            label="Best bid"
            value={bestBid != null ? formatPrice(bestBid) : "—"}
            unit="USD"
            tone="bid"
            flashKey={bestBid ?? undefined}
          />
          <ScopeRow
            label="Best ask"
            value={bestAsk != null ? formatPrice(bestAsk) : "—"}
            unit="USD"
            tone="ask"
            flashKey={bestAsk ?? undefined}
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
        </motion.div>
      </motion.div>
    </section>
  );
}

const scopeRowVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE_OUT_EXPO },
  },
};

const TONE_CLASS = {
  default: "text-fg",
  amber: "text-amber",
  bid: "text-bid",
  ask: "text-ask",
} as const;

const TONE_GLOW = {
  default: "oklch(0.965 0.005 80 / 0.55)",
  amber: "oklch(0.88 0.185 82 / 0.7)",
  bid: "oklch(0.78 0.14 165 / 0.7)",
  ask: "oklch(0.7 0.16 25 / 0.7)",
} as const;

function ScopeRow({
  label,
  value,
  unit,
  tone,
  flashKey,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone: keyof typeof TONE_CLASS;
  flashKey?: string | number;
}) {
  const valueControls = useFlashOnChange(flashKey, TONE_GLOW[tone]);

  return (
    <motion.div
      variants={scopeRowVariants}
      className="group flex items-baseline justify-between border-t border-line-soft py-4 first:border-t-0"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
        {label}
      </span>
      <span className="flex items-baseline gap-2">
        <motion.span
          animate={valueControls}
          className={`font-mono text-3xl tracking-tight md:text-4xl ${TONE_CLASS[tone]}`}
        >
          {value}
        </motion.span>
        {unit && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-dim">
            {unit}
          </span>
        )}
      </span>
    </motion.div>
  );
}
