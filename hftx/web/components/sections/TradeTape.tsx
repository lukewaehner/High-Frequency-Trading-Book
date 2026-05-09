"use client";

import { useMarketStore } from "@/lib/store";
import { formatPrice, formatQty } from "@/lib/format";
import type { Trade } from "@/lib/types";
import { useEffect, useState } from "react";

const VISIBLE = 30;
// Decouple tape redraws from trade arrival rate. The store still ingests every
// print at full speed; the tape just samples it at a human-readable cadence.
const TAPE_REFRESH_MS = 750;

export function TradeTape() {
  const [visible, setVisible] = useState<Trade[]>([]);

  useEffect(() => {
    const sample = () => {
      const trades = useMarketStore.getState().trades;
      setVisible(trades.slice(0, VISIBLE));
    };
    sample();
    const id = setInterval(sample, TAPE_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Tape is ALWAYS visible — when empty, render placeholder strip with a hint
  if (visible.length === 0) {
    return (
      <div className="border-y border-line-soft bg-bg-sunken/60">
        <div className="mx-auto flex h-12 max-w-[1400px] items-center px-6 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-dim md:px-10">
          Tape — no executions yet. Start the sim to see prints.
        </div>
      </div>
    );
  }

  // Duplicate for seamless marquee loop
  const looped = [...visible, ...visible];

  return (
    <div className="overflow-hidden border-y border-line-soft bg-bg-sunken/60">
      <div className="relative flex h-12 items-center">
        <div className="marquee-track flex shrink-0 items-center gap-7 whitespace-nowrap px-7">
          {looped.map((t, i) => (
            <TapePrint key={`${t.ts_ns}-${i}`} trade={t} />
          ))}
        </div>
        {/* Edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-bg-sunken to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-bg-sunken to-transparent" />
      </div>
    </div>
  );
}

function TapePrint({ trade }: { trade: Trade }) {
  return (
    <span className="flex items-center gap-2 font-mono text-[12px] tabular-nums">
      <span className="h-1 w-1 rounded-full bg-amber" aria-hidden />
      <span className="text-fg-dim uppercase tracking-[0.18em] text-[10px]">
        {trade.symbol}
      </span>
      <span className="text-fg">{formatQty(trade.qty)}</span>
      <span className="text-fg-dim">@</span>
      <span className="text-amber">{formatPrice(trade.px_ticks)}</span>
    </span>
  );
}
