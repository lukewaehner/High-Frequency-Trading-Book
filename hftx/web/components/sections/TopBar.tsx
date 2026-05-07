"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { fetchSymbols } from "@/lib/exchange";
import { useMarketStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { Pulse } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export function TopBar() {
  const connected = useMarketStore((s) => s.connected);
  const symbol = useMarketStore((s) => s.symbol);
  const setSymbol = useMarketStore((s) => s.setSymbol);
  const bestBid = useMarketStore((s) => s.bestBid);
  const bestAsk = useMarketStore((s) => s.bestAsk);

  const [symbols, setSymbols] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!connected) return;
    fetchSymbols()
      .then((s) => setSymbols(s.sort()))
      .catch(() => {});
  }, [connected]);

  return (
    <header className="sticky top-0 z-40 border-b border-line-soft bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-[1400px] items-center justify-between px-6 md:px-10">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.22em]">
          <span className="text-amber">HFTX</span>
          <span className="hidden text-fg-dim md:inline">/ Order Book Engine</span>
        </div>

        <div className="hidden items-center gap-5 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-muted md:flex">
          <SymbolPicker
            symbol={symbol}
            symbols={symbols}
            onSelect={(s) => {
              setSymbol(s);
              setOpen(false);
            }}
            open={open}
            setOpen={setOpen}
          />
          <span className="text-fg-dim">
            BID{" "}
            <span className="text-bid">
              {bestBid != null ? formatPrice(bestBid) : "—"}
            </span>
          </span>
          <span className="text-fg-dim">
            ASK{" "}
            <span className="text-ask">
              {bestAsk != null ? formatPrice(bestAsk) : "—"}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.18em]">
          <div className="flex items-center gap-2 text-fg-muted">
            <Pulse on={connected} />
            <span>{connected ? "Live" : "Offline"}</span>
          </div>
          <Link
            href="https://github.com/lukewaehner/hft-ledger"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg-muted transition-colors hover:text-fg"
          >
            Source
          </Link>
        </div>
      </div>
    </header>
  );
}

function SymbolPicker({
  symbol,
  symbols,
  onSelect,
  open,
  setOpen,
}: {
  symbol: string;
  symbols: string[];
  onSelect: (s: string) => void;
  open: boolean;
  setOpen: (b: boolean) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-line-soft px-3 py-1 transition-colors hover:border-fg-muted"
      >
        <span className="text-fg">{symbol}</span>
        <CaretDown size={10} weight="bold" className="text-fg-dim" />
      </button>
      {open && symbols.length > 0 && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <ul
            role="listbox"
            className="absolute left-0 top-full z-20 mt-1.5 flex min-w-[120px] flex-col rounded-xl border border-line bg-bg-elevated p-1 shadow-soft"
          >
            {symbols.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => onSelect(s)}
                  className={cn(
                    "w-full rounded-md px-3 py-1.5 text-left transition-colors",
                    s === symbol
                      ? "bg-amber/10 text-amber"
                      : "text-fg-muted hover:bg-bg-sunken hover:text-fg",
                  )}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
