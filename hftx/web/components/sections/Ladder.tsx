"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { useMarketStore } from "@/lib/store";
import { formatPrice, formatQty } from "@/lib/format";
import type { PriceLevel } from "@/lib/types";
import { SectionLabel } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { TradeTape } from "./TradeTape";
import { OrderEntry } from "./OrderEntry";

const VISIBLE_LEVELS = 10;

export function Ladder() {
  const bids = useMarketStore((s) => s.bids);
  const asks = useMarketStore((s) => s.asks);
  const lastTrade = useMarketStore((s) => s.trades[0]);

  const visibleBids = useMemo(() => bids.slice(0, VISIBLE_LEVELS), [bids]);
  const visibleAsks = useMemo(() => asks.slice(0, VISIBLE_LEVELS), [asks]);

  const maxQty = useMemo(() => {
    const all = [...visibleBids, ...visibleAsks];
    return all.reduce((acc, l) => Math.max(acc, l.quantity), 0);
  }, [visibleBids, visibleAsks]);

  const bestBid = visibleBids[0]?.price ?? null;
  const bestAsk = visibleAsks[0]?.price ?? null;
  const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;
  const mid =
    bestBid != null && bestAsk != null
      ? (bestBid + bestAsk) / 2
      : null;

  return (
    <section
      id="ladder"
      className="relative border-t border-line-soft bg-bg-sunken/40"
    >
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-32">
        <header className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <Reveal direction="left">
              <SectionLabel
                index="01 / Ladder"
                title="Price discovery, in motion"
              />
            </Reveal>
            <Reveal direction="up" delay={0.1}>
              <h2 className="mt-5 max-w-[18ch] font-display text-4xl font-extrabold leading-[0.95] tracking-tighter text-fg md:text-6xl">
                The book is the truth.
              </h2>
            </Reveal>
          </div>
          <Reveal
            direction="up"
            delay={0.18}
            className="max-w-[44ch] text-[14px] leading-relaxed text-fg-muted md:col-span-5 md:text-[15px]"
          >
            What you see below is live, polled four times per second, with
            top-of-book streamed continuously. Every price level is a queue;
            every queue is FIFO. The engine matches at the maker&rsquo;s price.
          </Reveal>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Bids */}
          <div className="lg:col-span-5">
            <ColumnHeader side="bid" />
            <ul role="list" className="flex flex-col">
              <AnimatePresence initial={false}>
                {visibleBids.map((level) => (
                  <LadderRow
                    key={`bid-${level.price}`}
                    level={level}
                    side="bid"
                    maxQty={maxQty}
                    flash={lastTrade?.px_ticks === level.price}
                  />
                ))}
              </AnimatePresence>
              {visibleBids.length === 0 && <EmptyRows side="bid" />}
            </ul>
          </div>

          {/* Mid */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-bg-elevated/40 px-4 py-6">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
                Mid
              </span>
              <span className="font-mono text-2xl tracking-tight text-fg">
                {mid != null ? formatPrice(Math.round(mid)) : "—"}
              </span>
              <div className="mt-3 h-px w-12 bg-line" />
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
                Spread
              </span>
              <span className="font-mono text-base text-amber">
                {spread != null ? `${spread} t` : "—"}
              </span>
            </div>

            <div className="hidden lg:block">
              <OrderEntry />
            </div>
          </div>

          {/* Asks */}
          <div className="lg:col-span-5">
            <ColumnHeader side="ask" />
            <ul role="list" className="flex flex-col">
              <AnimatePresence initial={false}>
                {visibleAsks.map((level) => (
                  <LadderRow
                    key={`ask-${level.price}`}
                    level={level}
                    side="ask"
                    maxQty={maxQty}
                    flash={lastTrade?.px_ticks === level.price}
                  />
                ))}
              </AnimatePresence>
              {visibleAsks.length === 0 && <EmptyRows side="ask" />}
            </ul>
          </div>

          {/* Mobile-only order entry */}
          <div className="lg:hidden">
            <OrderEntry />
          </div>
        </div>
      </div>

      <TradeTape />
    </section>
  );
}

function ColumnHeader({ side }: { side: "bid" | "ask" }) {
  return (
    <div
      className={`mb-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim ${
        side === "ask" ? "flex-row-reverse" : ""
      }`}
    >
      <span className={side === "bid" ? "text-bid" : "text-ask"}>
        {side === "bid" ? "Bids" : "Asks"}
      </span>
      <span>Qty · Price</span>
    </div>
  );
}

function EmptyRows({ side }: { side: "bid" | "ask" }) {
  return (
    <li
      className={`flex h-[280px] items-center justify-center font-mono text-[11px] uppercase tracking-[0.18em] text-fg-dim ${
        side === "bid" ? "text-left" : "text-right"
      }`}
    >
      Awaiting liquidity — start the sim or place an order
    </li>
  );
}

function LadderRow({
  level,
  side,
  maxQty,
  flash,
}: {
  level: PriceLevel;
  side: "bid" | "ask";
  maxQty: number;
  flash: boolean;
}) {
  const ratio = maxQty > 0 ? Math.min(1, level.quantity / maxQty) : 0;
  const isBid = side === "bid";
  const accentClass = isBid ? "bg-bid/15" : "bg-ask/15";
  const priceClass = isBid ? "text-bid" : "text-ask";

  return (
    <motion.li
      layout="position"
      layoutId={`${side}-${level.price}`}
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 2 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={`group relative flex h-9 items-center px-3 font-mono text-[13px] tabular-nums ${
        isBid ? "justify-end" : "justify-start"
      }`}
    >
      {/* Depth bar */}
      <div
        className={`absolute inset-y-1 ${
          isBid ? "right-0" : "left-0"
        } rounded-[2px] ${accentClass} transition-[width] duration-300 ease-out`}
        style={{ width: `${ratio * 100}%` }}
        aria-hidden
      />
      {/* Flash overlay on last-trade match */}
      <motion.div
        key={flash ? "flash-on" : "flash-off"}
        initial={flash ? { opacity: 0.45 } : { opacity: 0 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="absolute inset-0 bg-amber/20"
        aria-hidden
      />
      <div
        className={`relative flex w-full items-baseline gap-4 ${
          isBid ? "flex-row-reverse" : ""
        }`}
      >
        <span className={`flex-1 ${isBid ? "text-right" : "text-left"} ${priceClass}`}>
          {formatPrice(level.price)}
        </span>
        <span className="text-fg-muted">{formatQty(level.quantity)}</span>
        <span className="w-6 text-right text-[11px] text-fg-dim">
          {level.orders}
        </span>
      </div>
    </motion.li>
  );
}
