"use client";

import { useEffect } from "react";
import {
  fetchDepth,
  fetchHealth,
  openDepthStream,
  openTradeStream,
} from "@/lib/exchange";
import { useLatencyStore, useMarketStore } from "@/lib/store";

// Mounts the WS streams + REST polling once at the root. Renders nothing.
export function MarketBootstrap() {
  const symbol = useMarketStore((s) => s.symbol);
  const setConnected = useMarketStore((s) => s.setConnected);
  const setBestPrices = useMarketStore((s) => s.setBestPrices);
  const setLadder = useMarketStore((s) => s.setLadder);
  const pushTrade = useMarketStore((s) => s.pushTrade);
  const tickThroughput = useLatencyStore((s) => s.tickThroughput);

  // Health pulse — sets the connected indicator.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ok = await fetchHealth();
      if (!cancelled) setConnected(ok);
    };
    check();
    const t = setInterval(check, 5_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [setConnected]);

  // Trade stream
  useEffect(() => {
    const handle = openTradeStream(symbol, (msg) => {
      if (msg.type === "trade") {
        pushTrade(msg.trade);
      }
    });
    return () => handle.close();
  }, [symbol, pushTrade]);

  // Depth stream — best prices + sizes only
  useEffect(() => {
    const handle = openDepthStream(symbol, (msg) => {
      if (msg.type === "depth") {
        setBestPrices(
          msg.best_bid ?? null,
          msg.best_ask ?? null,
          msg.bid_size ?? 0,
          msg.ask_size ?? 0,
        );
      }
    });
    return () => handle.close();
  }, [symbol, setBestPrices]);

  // REST poll for the full ladder (best/ask streams give only top-of-book)
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    const poll = async () => {
      if (cancelled) return;
      try {
        const depth = await fetchDepth(symbol, 14, ctrl.signal);
        if (!cancelled) setLadder(depth.bids, depth.asks);
      } catch {
        // server may be down or symbol new — silent retry on next tick
      }
    };
    poll();
    const t = setInterval(poll, 350);

    return () => {
      cancelled = true;
      ctrl.abort();
      clearInterval(t);
    };
  }, [symbol, setLadder]);

  // Throughput EWMA tick
  useEffect(() => {
    const t = setInterval(tickThroughput, 1_000);
    return () => clearInterval(t);
  }, [tickThroughput]);

  return null;
}
