"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CaretDown } from "@phosphor-icons/react";
import { fetchSymbols } from "@/lib/exchange";
import { useMarketStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { useFlashOnChange } from "@/lib/useFlashOnChange";
import { Pulse } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

const BID_GLOW = "oklch(0.78 0.14 165 / 0.65)";
const ASK_GLOW = "oklch(0.7 0.16 25 / 0.65)";

export function TopBar() {
  const reduced = useReducedMotion();
  const connected = useMarketStore((s) => s.connected);
  const symbol = useMarketStore((s) => s.symbol);
  const setSymbol = useMarketStore((s) => s.setSymbol);
  const bestBid = useMarketStore((s) => s.bestBid);
  const bestAsk = useMarketStore((s) => s.bestAsk);

  const bidControls = useFlashOnChange(bestBid ?? undefined, BID_GLOW, 8, 0.4);
  const askControls = useFlashOnChange(bestAsk ?? undefined, ASK_GLOW, 8, 0.4);

  const [symbols, setSymbols] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!connected) return;
    fetchSymbols()
      .then((s) => setSymbols(s.sort()))
      .catch(() => {});
  }, [connected]);

  return (
    <motion.header
      initial={reduced ? false : { y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
      className="sticky top-0 z-40 border-b border-line-soft bg-bg/85 backdrop-blur-xl"
    >
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
            <motion.span animate={bidControls} className="text-bid">
              {bestBid != null ? formatPrice(bestBid) : "—"}
            </motion.span>
          </span>
          <span className="text-fg-dim">
            ASK{" "}
            <motion.span animate={askControls} className="text-ask">
              {bestAsk != null ? formatPrice(bestAsk) : "—"}
            </motion.span>
          </span>
        </div>

        <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.18em]">
          <div className="flex items-center gap-2 text-fg-muted">
            <Pulse on={connected} />
            <AnimatePresence initial={false}>
              {!connected && (
                <motion.span
                  key="offline"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.25, ease: EASE_OUT_QUART }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Offline
                </motion.span>
              )}
            </AnimatePresence>
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
    </motion.header>
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
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18, ease: EASE_OUT_QUART }}
          className="inline-flex"
        >
          <CaretDown size={10} weight="bold" className="text-fg-dim" />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && symbols.length > 0 && (
          <>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-10 cursor-default"
            />
            <motion.ul
              role="listbox"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE_OUT_QUART }}
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
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
