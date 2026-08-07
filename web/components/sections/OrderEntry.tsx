"use client";

import { useState } from "react";
import { submitOrderTimed } from "@/lib/exchange";
import { useLatencyStore, useMarketStore } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { OrderKind, OrderStatus, TimeInForce } from "@/lib/types";

export function OrderEntry({ className }: { className?: string }) {
  const symbol = useMarketStore((s) => s.symbol);
  const bestBid = useMarketStore((s) => s.bestBid);
  const bestAsk = useMarketStore((s) => s.bestAsk);
  const recordSubmit = useLatencyStore((s) => s.recordSubmit);

  const [side, setSide] = useState<"Bid" | "Ask">("Bid");
  const [kind, setKind] = useState<OrderKind>("Limit");
  const [tif, setTif] = useState<TimeInForce>("Day");
  const [price, setPrice] = useState<string>("");
  const [qty, setQty] = useState<string>("25");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "pending" }
    | {
        kind: "done";
        status: OrderStatus;
        filledQty: number;
        requestedQty: number;
        px: number;
        isMarket: boolean;
        latency_ns: number;
      }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const refPrice =
    side === "Bid"
      ? (bestBid ?? bestAsk ?? null)
      : (bestAsk ?? bestBid ?? null);

  const isMarket = kind === "Market";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPx = isMarket ? 0 : (price.trim() === "" ? refPrice : Number(price));
    const parsedQty = Number(qty);
    if (!isMarket && (!parsedPx || Number.isNaN(parsedPx) || parsedPx <= 0)) {
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
        price: Math.round(parsedPx ?? 0),
        quantity: Math.round(parsedQty),
        kind,
        tif: isMarket ? undefined : tif,
      });
      const filledQty = res.trades.reduce((sum, t) => sum + t.qty, 0);
      recordSubmit(res.latency_ns, filledQty > 0);
      setStatus({
        kind: "done",
        status: res.status,
        filledQty,
        requestedQty: Math.round(parsedQty),
        px: Math.round(parsedPx ?? 0),
        isMarket,
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

      {/* Order kind + TIF row */}
      <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-full border border-line">
          {(["Limit", "Market"] as OrderKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "flex h-7 items-center px-3 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
                kind === k
                  ? "bg-amber/20 text-amber"
                  : "text-fg-dim hover:text-fg",
              )}
            >
              {k}
            </button>
          ))}
        </div>

        {!isMarket && (
          <select
            value={tif}
            onChange={(e) => setTif(e.target.value as TimeInForce)}
            className="h-7 rounded-full border border-line bg-bg-sunken px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-dim outline-none transition-colors focus:border-amber focus:text-fg"
          >
            <option value="Day">Day</option>
            <option value="IOC">IOC</option>
            <option value="FOK">FOK</option>
          </select>
        )}
      </div>

      {/* Price field — hidden for market orders */}
      {!isMarket && (
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
      )}

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
        {status.kind === "pending"
          ? "Submitting…"
          : `${isMarket ? "Market " : ""}${side === "Bid" ? "Buy" : "Sell"}`}
      </button>

      <StatusLine status={status} />
    </form>
  );
}

type DoneStatus = {
  kind: "done";
  status: OrderStatus;
  filledQty: number;
  requestedQty: number;
  px: number;
  isMarket: boolean;
  latency_ns: number;
};

function StatusLine({
  status,
}: {
  status:
    | { kind: "idle" }
    | { kind: "pending" }
    | DoneStatus
    | { kind: "error"; message: string };
}) {
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

  return <DoneLine status={status} wrapperBase={wrapperBase} />;
}

// Presentation for each engine disposition. `cancelled` is the one the old code
// mislabeled as "Rested" — it gets the muted ask treatment, never a phantom
// "@ price", because nothing executed and nothing rests.
const DISPOSITION: Record<
  OrderStatus,
  { label: string; tone: "fill" | "rest" | "dead" }
> = {
  filled: { label: "Filled", tone: "fill" },
  partial: { label: "Partial fill", tone: "fill" },
  partial_resting: { label: "Partial · resting", tone: "fill" },
  rested: { label: "Rested", tone: "rest" },
  cancelled: { label: "Cancelled", tone: "dead" },
};

function DoneLine({
  status,
  wrapperBase,
}: {
  status: DoneStatus;
  wrapperBase: string;
}) {
  const { label, tone } = DISPOSITION[status.status];
  const restingQty = Math.max(status.requestedQty - status.filledQty, 0);

  const toneClasses =
    tone === "dead"
      ? "border-ask/25 bg-ask/5"
      : "border-amber/20 bg-amber/5";
  const labelColor = tone === "dead" ? "text-ask" : "text-amber";

  return (
    <div
      className={cn(
        wrapperBase,
        "flex flex-col gap-1 rounded-lg border px-3 py-2",
        toneClasses,
      )}
    >
      <div className="flex items-baseline justify-between">
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-[0.22em]",
            labelColor,
          )}
        >
          {label}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-fg-dim">
          {(status.latency_ns / 1_000_000).toFixed(2)}
          <span className="ml-0.5">ms</span>
        </span>
      </div>
      <DoneDetail status={status} restingQty={restingQty} />
    </div>
  );
}

function DoneDetail({
  status,
  restingQty,
}: {
  status: DoneStatus;
  restingQty: number;
}) {
  // Cancelled: nothing executed, nothing resting — say why, don't show a price.
  if (status.status === "cancelled") {
    return (
      <div className="font-mono text-[12px] text-fg-muted">
        {status.isMarket ? "No liquidity to fill" : "Unfilled — order killed"}
      </div>
    );
  }

  const priceSuffix = !status.isMarket && (
    <>
      <span className="mx-1.5 text-fg-dim">@</span>
      {formatPrice(status.px)}
    </>
  );

  // Partial (no rest): filled X of the requested Y; remainder discarded.
  if (status.status === "partial") {
    return (
      <div className="font-mono text-[13px] tabular-nums text-fg">
        {status.filledQty}
        <span className="mx-1 text-fg-dim">/</span>
        {status.requestedQty}
        {priceSuffix}
        <span className="ml-2 text-[11px] text-fg-dim">
          {status.requestedQty - status.filledQty} discarded
        </span>
      </div>
    );
  }

  // Partial + resting: some filled now, remainder working in the book.
  if (status.status === "partial_resting") {
    return (
      <div className="font-mono text-[13px] tabular-nums text-fg">
        {status.filledQty} filled
        <span className="mx-1.5 text-fg-dim">·</span>
        {restingQty} resting
        {priceSuffix}
      </div>
    );
  }

  // Filled or Rested: the full requested quantity, with price when it has one.
  const qty = status.status === "filled" ? status.filledQty : status.requestedQty;
  return (
    <div className="font-mono text-[13px] tabular-nums text-fg">
      {qty}
      {priceSuffix}
    </div>
  );
}
