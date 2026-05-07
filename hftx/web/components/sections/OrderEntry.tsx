"use client";

import { useState } from "react";
import { submitOrderTimed } from "@/lib/exchange";
import { useLatencyStore, useMarketStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

export function OrderEntry({ className }: { className?: string }) {
  const symbol = useMarketStore((s) => s.symbol);
  const bestBid = useMarketStore((s) => s.bestBid);
  const bestAsk = useMarketStore((s) => s.bestAsk);
  const recordSubmit = useLatencyStore((s) => s.recordSubmit);

  const [side, setSide] = useState<"Bid" | "Ask">("Bid");
  const [price, setPrice] = useState<string>("");
  const [qty, setQty] = useState<string>("25");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "pending" }
    | { kind: "rested" | "filled"; qty: number; px: number; latency_ns: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const refPrice =
    side === "Bid"
      ? (bestBid ?? bestAsk ?? null)
      : (bestAsk ?? bestBid ?? null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPx = price.trim() === "" ? refPrice : Number(price);
    const parsedQty = Number(qty);
    if (!parsedPx || Number.isNaN(parsedPx) || parsedPx <= 0) {
      setStatus({ kind: "error", message: "Enter a valid price (in ticks)" });
      return;
    }
    if (!parsedQty || Number.isNaN(parsedQty) || parsedQty <= 0) {
      setStatus({ kind: "error", message: "Enter a valid quantity" });
      return;
    }

    setStatus({ kind: "pending" });
    try {
      const res = await submitOrderTimed(symbol, {
        side,
        price: Math.round(parsedPx),
        quantity: Math.round(parsedQty),
      });
      recordSubmit(res.latency_ns, res.trades.length > 0);
      setStatus({
        kind: res.trades.length > 0 ? "filled" : "rested",
        qty: parsedQty,
        px: Math.round(parsedPx),
        latency_ns: res.latency_ns,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Submit failed",
      });
    }
  };

  return (
    <form
      onSubmit={submit}
      className={cn(
        "flex w-full flex-col gap-3.5 rounded-2xl border border-line bg-bg-elevated/40 p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
        <span>Submit</span>
        <span>{symbol}</span>
      </div>

      {/* Side toggle */}
      <div className="grid grid-cols-2 overflow-hidden rounded-full border border-line">
        <button
          type="button"
          onClick={() => setSide("Bid")}
          className={cn(
            "flex h-9 items-center justify-center font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
            side === "Bid"
              ? "bg-bid/20 text-bid"
              : "text-fg-dim hover:text-fg",
          )}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setSide("Ask")}
          className={cn(
            "flex h-9 items-center justify-center font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
            side === "Ask"
              ? "bg-ask/20 text-ask"
              : "text-fg-dim hover:text-fg",
          )}
        >
          Sell
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
          Price (ticks)
        </label>
        <input
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={refPrice != null ? String(refPrice) : "—"}
          className="h-9 rounded-md border border-line bg-bg-sunken px-3 font-mono text-sm tabular-nums text-fg outline-none transition-colors focus:border-amber"
        />
        {refPrice != null && (
          <span className="font-mono text-[10px] text-fg-dim">
            ≈ {formatPrice(Number(price) || refPrice)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim">
          Quantity
        </label>
        <input
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-9 rounded-md border border-line bg-bg-sunken px-3 font-mono text-sm tabular-nums text-fg outline-none transition-colors focus:border-amber"
        />
      </div>

      <button
        type="submit"
        disabled={status.kind === "pending"}
        className={cn(
          "mt-1 flex h-11 w-full items-center justify-center rounded-full px-6 font-mono text-[11px] uppercase tracking-[0.22em] transition-all active:scale-[0.97] disabled:opacity-50",
          side === "Bid"
            ? "bg-bid text-bg hover:bg-bid/85"
            : "bg-ask text-bg hover:bg-ask/85",
        )}
        style={{
          boxShadow:
            "inset 0 1px 0 oklch(1 0 0 / 0.18), inset 0 -1px 0 oklch(0 0 0 / 0.3)",
        }}
      >
        {status.kind === "pending" ? "Submitting…" : `Send ${side}`}
      </button>

      <StatusLine status={status} />
    </form>
  );
}

function StatusLine({
  status,
}: {
  status:
    | { kind: "idle" }
    | { kind: "pending" }
    | { kind: "rested" | "filled"; qty: number; px: number; latency_ns: number }
    | { kind: "error"; message: string };
}) {
  // Reserve consistent vertical space so layout doesn't jump between states.
  const wrapperBase = "min-h-[3.25rem]";

  if (status.kind === "idle") {
    return <div className={wrapperBase} aria-hidden />;
  }

  if (status.kind === "pending") {
    return (
      <div
        className={cn(
          wrapperBase,
          "flex items-center font-mono text-[10px] uppercase tracking-[0.22em] text-fg-dim",
        )}
      >
        Engine ←
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div
        className={cn(
          wrapperBase,
          "rounded-lg border border-ask/25 bg-ask/5 px-3 py-2",
        )}
      >
        <span className="font-mono text-[11px] leading-tight text-ask">
          {status.message}
        </span>
      </div>
    );
  }

  const isFilled = status.kind === "filled";
  return (
    <div
      className={cn(
        wrapperBase,
        "flex flex-col gap-1 rounded-lg border border-amber/20 bg-amber/5 px-3 py-2",
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber">
          {isFilled ? "Filled" : "Rested"}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-fg-dim">
          {(status.latency_ns / 1_000_000).toFixed(2)}
          <span className="ml-0.5">ms</span>
        </span>
      </div>
      <div className="font-mono text-[13px] tabular-nums text-fg">
        {status.qty}
        <span className="mx-1.5 text-fg-dim">@</span>
        {formatPrice(status.px)}
      </div>
    </div>
  );
}
