"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMarketStore } from "@/lib/store";
import { formatPrice, formatQty } from "@/lib/format";
import type { PriceLevel } from "@/lib/types";
import { Hairline, Pulse, SectionLabel } from "@/components/ui/primitives";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";
import { TradeTape } from "./TradeTape";
import { OrderEntry } from "./OrderEntry";

const VISIBLE_LEVELS = 10;
const STALE_AFTER_MS = 2000;

export function Ladder() {
  const symbol = useMarketStore((s) => s.symbol);
  const connected = useMarketStore((s) => s.connected);
  const bids = useMarketStore((s) => s.bids);
  const asks = useMarketStore((s) => s.asks);
  const lastTrade = useMarketStore((s) => s.trades[0]);

  const visibleBids = useMemo(() => bids.slice(0, VISIBLE_LEVELS), [bids]);
  const visibleAsks = useMemo(() => asks.slice(0, VISIBLE_LEVELS), [asks]);

  const maxQty = useMemo(() => {
    const all = [...visibleBids, ...visibleAsks];
    return all.reduce((acc, l) => Math.max(acc, l.quantity), 0);
  }, [visibleBids, visibleAsks]);

  const bidDepth = useMemo(
    () => visibleBids.reduce((sum, l) => sum + l.quantity, 0),
    [visibleBids],
  );
  const askDepth = useMemo(
    () => visibleAsks.reduce((sum, l) => sum + l.quantity, 0),
    [visibleAsks],
  );
  const bidShare =
    bidDepth + askDepth > 0 ? bidDepth / (bidDepth + askDepth) : 0.5;

  const bestBid = visibleBids[0]?.price ?? null;
  const bestAsk = visibleAsks[0]?.price ?? null;
  const spreadTicks =
    bestBid != null && bestAsk != null ? bestAsk - bestBid : null;
  const crossed = spreadTicks != null && spreadTicks < 0;
  const mid =
    bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;

  // Local staleness clock: record last book change, tick every 500ms so the
  // Live pill can downgrade to Stale without store-side timestamps.
  const lastUpdateAt = useRef<number>(Date.now());
  useEffect(() => {
    lastUpdateAt.current = Date.now();
  }, [bids, asks, lastTrade?.ts_ns]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const staleMs = now - lastUpdateAt.current;
  const stale = connected && staleMs > STALE_AFTER_MS;

  const symbolMatches = lastTrade?.symbol === symbol;

  return (
    <section
      id="ladder"
      className="relative border-t border-line-soft bg-bg-sunken/40"
    >
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-32">
        <header className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <Reveal direction="left">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <SectionLabel
                  index="01 / Ladder"
                  title="Price discovery, in motion"
                />
                <ConnectionPill
                  connected={connected}
                  stale={stale}
                  staleMs={staleMs}
                />
              </div>
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
            <ul
              className={cn(
                "flex flex-col transition-opacity duration-300",
                stale && "opacity-60",
              )}
            >
              <AnimatePresence initial={false}>
                {visibleBids.map((level) => (
                  <LadderRow
                    key={`bid-${level.price}`}
                    level={level}
                    side="bid"
                    maxQty={maxQty}
                    flash={symbolMatches && lastTrade?.px_ticks === level.price}
                  />
                ))}
              </AnimatePresence>
              {visibleBids.length === 0 && <EmptyRows side="bid" />}
            </ul>
          </div>

          {/* Mid panel + order entry */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <MidPanel
              mid={mid}
              spreadTicks={spreadTicks}
              crossed={crossed}
              bidShare={bidShare}
              bidDepth={bidDepth}
              askDepth={askDepth}
            />
            <div className="hidden lg:block">
              <OrderEntry />
            </div>
          </div>

          {/* Asks */}
          <div className="lg:col-span-5">
            <ColumnHeader side="ask" />
            <ul
              className={cn(
                "flex flex-col transition-opacity duration-300",
                stale && "opacity-60",
              )}
            >
              <AnimatePresence initial={false}>
                {visibleAsks.map((level) => (
                  <LadderRow
                    key={`ask-${level.price}`}
                    level={level}
                    side="ask"
                    maxQty={maxQty}
                    flash={symbolMatches && lastTrade?.px_ticks === level.price}
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

function ConnectionPill({
  connected,
  stale,
  staleMs,
}: {
  connected: boolean;
  stale: boolean;
  staleMs: number;
}) {
  let label: string;
  if (!connected) label = "Offline";
  else if (stale) label = `Stale ${(staleMs / 1000).toFixed(1)}s`;
  else label = "Live";
  return (
    <span
      className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim"
      aria-live="polite"
    >
      <Pulse on={connected && !stale} />
      <span className="tabular-nums">{label}</span>
    </span>
  );
}

function MidPanel({
  mid,
  spreadTicks,
  crossed,
  bidShare,
  bidDepth,
  askDepth,
}: {
  mid: number | null;
  spreadTicks: number | null;
  crossed: boolean;
  bidShare: number;
  bidDepth: number;
  askDepth: number;
}) {
  const spreadAbs = spreadTicks != null ? Math.abs(spreadTicks) : null;
  const spreadDollars =
    spreadAbs != null ? (spreadAbs / 100).toFixed(2) : null;
  const askShare = 1 - bidShare;
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
          Mid
        </span>
        <span className="font-mono text-sm tabular-nums text-fg-muted">
          {mid != null ? formatPrice(Math.round(mid)) : "—"}
        </span>
      </div>

      <Hairline className="my-3" />

      <div className="flex flex-col items-center gap-2 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
          {crossed ? "Crossed" : "Spread"}
        </span>
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              "font-mono text-5xl font-light tabular-nums leading-none",
              crossed ? "text-ask" : "text-amber",
            )}
          >
            {spreadAbs != null ? spreadAbs : "—"}
          </span>
          <span className="font-mono text-base text-fg-dim">t</span>
        </div>
        {spreadDollars != null && (
          <span className="font-mono text-[11px] tabular-nums text-fg-dim">
            ${spreadDollars}
          </span>
        )}
      </div>

      <Hairline className="my-3" />

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
          <span>Imbalance</span>
          <span className="tabular-nums text-fg-muted">
            {Math.round(bidShare * 100)}/{Math.round(askShare * 100)}
          </span>
        </div>
        <div
          className="relative h-1 overflow-hidden rounded-[2px] bg-bg-sunken"
          aria-hidden
        >
          <div
            className="absolute inset-y-0 left-0 right-0 bg-bid will-change-transform"
            style={{
              transform: `scaleX(${bidShare})`,
              transformOrigin: "left",
              transition: "transform 500ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
          <div
            className="absolute inset-y-0 left-0 right-0 bg-ask will-change-transform"
            style={{
              transform: `scaleX(${askShare})`,
              transformOrigin: "right",
              transition: "transform 500ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>
        <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-fg-dim">
          <span>{formatQty(bidDepth)}</span>
          <span>{formatQty(askDepth)}</span>
        </div>
      </div>
    </div>
  );
}

function ColumnHeader({ side }: { side: "bid" | "ask" }) {
  const isBid = side === "bid";
  return (
    <div className="mb-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
      <span className={isBid ? "text-bid" : "text-ask"}>
        {isBid ? "Bids" : "Asks"}
      </span>
      <span>{isBid ? "Orders · Qty · Price" : "Price · Qty · Orders"}</span>
    </div>
  );
}

function EmptyRows({ side }: { side: "bid" | "ask" }) {
  return (
    <li
      className={cn(
        "flex h-[280px] items-center justify-center font-mono text-[11px] uppercase tracking-[0.18em] text-fg-dim",
        side === "bid" ? "text-left" : "text-right",
      )}
    >
      Awaiting liquidity. Start the sim or place an order.
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

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 2 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={cn(
        "group relative flex h-9 items-center px-3 font-mono text-[13px] tabular-nums",
        isBid ? "justify-end" : "justify-start",
      )}
    >
      {/* Depth bar: transform-driven so width changes never trigger layout. */}
      <div
        className={cn(
          "absolute inset-y-1 left-0 right-0 rounded-[2px] will-change-transform",
          isBid ? "bg-bid/15" : "bg-ask/15",
        )}
        style={{
          transform: `scaleX(${ratio})`,
          transformOrigin: isBid ? "right" : "left",
          transition: "transform 300ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
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
        className={cn(
          "relative flex w-full items-baseline gap-4",
          isBid && "flex-row-reverse",
        )}
      >
        <span
          className={cn(
            "flex-1",
            isBid ? "text-right text-bid" : "text-left text-ask",
          )}
        >
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
